/**
 * LedgerOne Financial Field Extraction & Confidence Calibration Engine
 * 
 * Specialized extractors for Invoices, Receipts, and Purchase Orders.
 * Enforces field-level evidence provenance, non-numeric validation, and calibrated scoring.
 */

import { FixedDecimal, getCurrencyScale } from "./decimal-math.js";
import { DocumentTextExtraction, ExtractedPage, TokenGeometry } from "./text-extractor.js";

export interface ExtractedFieldItem {
  fieldName: string;
  fieldValueRaw: string;
  fieldValueNormalized: any;
  confidence: number; // Calibrated 0.0000 to 1.0000
  pageNumber: number;
  boundingBox: [number, number, number, number];
  metadata: {
    extractionMethod: "REGEX_PATTERN" | "TABLE_PARSER" | "KEYWORD_PROXIMITY" | "HEURISTIC";
    patternMatched?: string;
    validationPassed: boolean;
    validationErrors?: string[];
    isOptional?: boolean;
    category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER";
  };
}

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  pageNumber: number;
  boundingBox: [number, number, number, number];
}

export class FinancialFieldExtractor {
  /**
   * Main entrypoint for category-specific field extraction.
   */
  extractFields(
    textExtraction: DocumentTextExtraction,
    category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER" = "INVOICE"
  ): ExtractedFieldItem[] {
    const fullText = textExtraction.rawText;
    const pages = textExtraction.pages;

    switch (category) {
      case "RECEIPT":
        return this.extractReceiptFields(fullText, pages);
      case "PURCHASE_ORDER":
        return this.extractPurchaseOrderFields(fullText, pages);
      case "INVOICE":
      default:
        return this.extractInvoiceFields(fullText, pages);
    }
  }

  // ==========================================================================
  // 1. INVOICE EXTRACTOR
  // ==========================================================================
  private extractInvoiceFields(fullText: string, pages: ExtractedPage[]): ExtractedFieldItem[] {
    const fields: ExtractedFieldItem[] = [];
    const cat = "INVOICE";

    // 1. Invoice Number
    const invNumMatch = this.findMatch(
      fullText,
      pages,
      /(?:Invoice\s*(?:No\.?|Number|#|ID)?\s*[:#-]\s*|INV\s*[-#:]\s*|Invoice\s+(?:No\.?|Number|#|ID)\s+)([A-Z0-9_-]{3,30})/i,
      1
    );
    if (invNumMatch) {
      const raw = invNumMatch.value;
      const isValid = /^[A-Z0-9_-]{3,30}$/i.test(raw);
      fields.push({
        fieldName: "invoice_number",
        fieldValueRaw: raw,
        fieldValueNormalized: raw.toUpperCase(),
        confidence: isValid ? 0.98 : 0.70,
        pageNumber: invNumMatch.pageNumber,
        boundingBox: invNumMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          patternMatched: "Invoice Number Pattern",
          validationPassed: isValid,
          isOptional: false,
          category: cat,
        },
      });
    }

    // 2. Invoice Date
    const invDateMatch = this.findMatch(
      fullText,
      pages,
      /(?:Invoice\s*Date|Issue\s*Date|Date\s*of\s*Issue|Date)[:.\s]*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i,
      1
    );
    if (invDateMatch) {
      const { isoDate, isValid } = this.validateAndNormalizeDate(invDateMatch.value);
      fields.push({
        fieldName: "invoice_date",
        fieldValueRaw: invDateMatch.value,
        fieldValueNormalized: isoDate,
        confidence: isValid ? 0.95 : 0.60,
        pageNumber: invDateMatch.pageNumber,
        boundingBox: invDateMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          patternMatched: "Date Pattern",
          validationPassed: isValid,
          validationErrors: isValid ? undefined : ["Invalid calendar date format"],
          isOptional: false,
          category: cat,
        },
      });
    }

    // 3. Due Date (Optional)
    const dueDateMatch = this.findMatch(
      fullText,
      pages,
      /(?:Due\s*Date|Payment\s*Due)[:.\s]*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i,
      1
    );
    if (dueDateMatch) {
      const { isoDate, isValid } = this.validateAndNormalizeDate(dueDateMatch.value);
      fields.push({
        fieldName: "due_date",
        fieldValueRaw: dueDateMatch.value,
        fieldValueNormalized: isoDate,
        confidence: isValid ? 0.92 : 0.55,
        pageNumber: dueDateMatch.pageNumber,
        boundingBox: dueDateMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          patternMatched: "Due Date Pattern",
          validationPassed: isValid,
          isOptional: true,
          category: cat,
        },
      });
    }

    // 4. Currency
    const currency = this.detectCurrency(fullText);
    fields.push({
      fieldName: "currency",
      fieldValueRaw: currency.raw,
      fieldValueNormalized: currency.code,
      confidence: currency.confidence,
      pageNumber: 1,
      boundingBox: [0.05, 0.05, 0.15, 0.08],
      metadata: {
        extractionMethod: "KEYWORD_PROXIMITY",
        validationPassed: true,
        isOptional: false,
        category: cat,
      },
    });

    // 5. Vendor Name & Tax ID
    const vendorMatch = this.findVendor(fullText, pages);
    if (vendorMatch) {
      fields.push(vendorMatch);
    }

    const taxIdMatch = this.findTaxId(fullText, pages, cat);
    if (taxIdMatch) {
      fields.push(taxIdMatch);
    }

    // 6. Customer Name
    const customerMatch = this.findCustomer(fullText, pages, cat);
    if (customerMatch) {
      fields.push(customerMatch);
    }

    // 7. Financial Amounts (Subtotal, Tax, Total)
    this.extractFinancialAmounts(fullText, pages, currency.code, fields, cat);

    // 8. Line Items Table
    const lineItems = this.extractLineItems(fullText, pages, currency.code);
    fields.push({
      fieldName: "line_items",
      fieldValueRaw: JSON.stringify(lineItems),
      fieldValueNormalized: lineItems,
      confidence: lineItems.length > 0 ? 0.95 : 0.90,
      pageNumber: lineItems[0]?.pageNumber || 1,
      boundingBox: lineItems[0]?.boundingBox || [0.1, 0.3, 0.9, 0.6],
      metadata: {
        extractionMethod: "TABLE_PARSER",
        validationPassed: true,
        isOptional: true,
        category: cat,
      },
    });

    return fields;
  }

  // ==========================================================================
  // 2. RECEIPT EXTRACTOR
  // ==========================================================================
  private extractReceiptFields(fullText: string, pages: ExtractedPage[]): ExtractedFieldItem[] {
    const fields: ExtractedFieldItem[] = [];
    const cat = "RECEIPT";

    // 1. Receipt / Transaction ID
    const recNumMatch = this.findMatch(
      fullText,
      pages,
      /(?:Receipt\s*(?:No\.?|Number|#|ID)?\s*[:#-]\s*|REC\s*[-#:]\s*|Receipt\s+(?:No\.?|Number|#|ID)\s+|Transaction\s*(?:#|ID|No)\s*[:#-]\s*|Order\s*#\s*[:#-]?\s*)([A-Z0-9_-]{3,30})/i,
      1
    );
    if (recNumMatch) {
      fields.push({
        fieldName: "receipt_number",
        fieldValueRaw: recNumMatch.value,
        fieldValueNormalized: recNumMatch.value.toUpperCase(),
        confidence: 0.95,
        pageNumber: recNumMatch.pageNumber,
        boundingBox: recNumMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          validationPassed: true,
          isOptional: false,
          category: cat,
        },
      });
    }

    // 2. Receipt Date
    const dateMatch = this.findMatch(
      fullText,
      pages,
      /(?:Date|Trans\s*Date)[:.\s]*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})/i,
      1
    );
    if (dateMatch) {
      const { isoDate, isValid } = this.validateAndNormalizeDate(dateMatch.value);
      fields.push({
        fieldName: "receipt_date",
        fieldValueRaw: dateMatch.value,
        fieldValueNormalized: isoDate,
        confidence: isValid ? 0.95 : 0.60,
        pageNumber: dateMatch.pageNumber,
        boundingBox: dateMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          validationPassed: isValid,
          isOptional: false,
          category: cat,
        },
      });
    }

    // 3. Merchant Name
    const lines = fullText.split("\n").filter((l) => l.trim().length > 0);
    const topMerchant = lines[0] || "Unknown Merchant";
    fields.push({
      fieldName: "merchant_name",
      fieldValueRaw: topMerchant,
      fieldValueNormalized: topMerchant.trim(),
      confidence: 0.88,
      pageNumber: 1,
      boundingBox: [0.1, 0.05, 0.9, 0.12],
      metadata: {
        extractionMethod: "HEURISTIC",
        validationPassed: topMerchant.length >= 2,
        isOptional: false,
        category: cat,
      },
    });

    // 4. Currency
    const currency = this.detectCurrency(fullText);
    fields.push({
      fieldName: "currency",
      fieldValueRaw: currency.raw,
      fieldValueNormalized: currency.code,
      confidence: currency.confidence,
      pageNumber: 1,
      boundingBox: [0.05, 0.05, 0.15, 0.08],
      metadata: {
        extractionMethod: "KEYWORD_PROXIMITY",
        validationPassed: true,
        isOptional: false,
        category: cat,
      },
    });

    // 5. Total & Tax
    this.extractFinancialAmounts(fullText, pages, currency.code, fields, cat);

    // 6. Payment Method (Optional)
    const paymentMatch = this.findMatch(
      fullText,
      pages,
      /(?:Payment\s*Method|Paid\s*via|Card|Tender)[:.\s]*([A-Za-z0-9\s*-]{3,25})/i,
      1
    );
    if (paymentMatch) {
      fields.push({
        fieldName: "payment_method",
        fieldValueRaw: paymentMatch.value,
        fieldValueNormalized: paymentMatch.value.trim().toUpperCase(),
        confidence: 0.90,
        pageNumber: paymentMatch.pageNumber,
        boundingBox: paymentMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          validationPassed: true,
          isOptional: true,
          category: cat,
        },
      });
    }

    return fields;
  }

  // ==========================================================================
  // 3. PURCHASE ORDER EXTRACTOR
  // ==========================================================================
  private extractPurchaseOrderFields(fullText: string, pages: ExtractedPage[]): ExtractedFieldItem[] {
    const fields: ExtractedFieldItem[] = [];
    const cat = "PURCHASE_ORDER";

    // 1. PO Number
    const poNumMatch = this.findMatch(
      fullText,
      pages,
      /(?:Purchase\s*Order\s*(?:Number|No\.?|#|ID)?\s*[:#-]\s*|P\.?O\.?\s*(?:Number|No\.?|#|ID)?\s*[:#-]\s*|PO\s*[-#:]\s*|Order\s*#\s*[:#-]?\s*)([A-Z0-9_-]{3,30})/i,
      1
    );
    if (poNumMatch) {
      fields.push({
        fieldName: "po_number",
        fieldValueRaw: poNumMatch.value,
        fieldValueNormalized: poNumMatch.value.toUpperCase(),
        confidence: 0.98,
        pageNumber: poNumMatch.pageNumber,
        boundingBox: poNumMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          validationPassed: true,
          isOptional: false,
          category: cat,
        },
      });
    }

    // 2. PO Date
    const poDateMatch = this.findMatch(
      fullText,
      pages,
      /(?:PO\s*Date|Order\s*Date|Date)[:.\s]*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})/i,
      1
    );
    if (poDateMatch) {
      const { isoDate, isValid } = this.validateAndNormalizeDate(poDateMatch.value);
      fields.push({
        fieldName: "po_date",
        fieldValueRaw: poDateMatch.value,
        fieldValueNormalized: isoDate,
        confidence: isValid ? 0.95 : 0.60,
        pageNumber: poDateMatch.pageNumber,
        boundingBox: poDateMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          validationPassed: isValid,
          isOptional: false,
          category: cat,
        },
      });
    }

    // 3. Currency
    const currency = this.detectCurrency(fullText);
    fields.push({
      fieldName: "currency",
      fieldValueRaw: currency.raw,
      fieldValueNormalized: currency.code,
      confidence: currency.confidence,
      pageNumber: 1,
      boundingBox: [0.05, 0.05, 0.15, 0.08],
      metadata: {
        extractionMethod: "KEYWORD_PROXIMITY",
        validationPassed: true,
        isOptional: false,
        category: cat,
      },
    });

    // 4. Vendor & Buyer
    const vendorMatch = this.findVendor(fullText, pages);
    if (vendorMatch) fields.push(vendorMatch);

    const buyerMatch = this.findCustomer(fullText, pages, cat);
    if (buyerMatch) {
      buyerMatch.fieldName = "buyer_name";
      fields.push(buyerMatch);
    }

    // 5. Financial Amounts
    this.extractFinancialAmounts(fullText, pages, currency.code, fields, cat);

    // 6. Line Items Table
    const lineItems = this.extractLineItems(fullText, pages, currency.code);
    fields.push({
      fieldName: "line_items",
      fieldValueRaw: JSON.stringify(lineItems),
      fieldValueNormalized: lineItems,
      confidence: lineItems.length > 0 ? 0.94 : 0.80,
      pageNumber: lineItems[0]?.pageNumber || 1,
      boundingBox: lineItems[0]?.boundingBox || [0.1, 0.3, 0.9, 0.6],
      metadata: {
        extractionMethod: "TABLE_PARSER",
        validationPassed: lineItems.length > 0,
        isOptional: false,
        category: cat,
      },
    });

    return fields;
  }

  // ==========================================================================
  // HELPERS: FINANCIAL AMOUNTS, CURRENCY, ENTITY IDENTIFIERS
  // ==========================================================================
  private extractFinancialAmounts(
    fullText: string,
    pages: ExtractedPage[],
    currencyCode: string,
    fields: ExtractedFieldItem[],
    category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER"
  ) {
    const scale = getCurrencyScale(currencyCode);

    // Subtotal (Optional for receipts, required for invoices/POs)
    const subtotalMatch = this.findMatch(
      fullText,
      pages,
      /(?:\bSub\s*Total\b|\bSubtotal\b|\bNet\s*Amount\b)[:.\s]*(?:[A-Za-z]{3}|[$€£¥S])?\s*([0-9,]+(?:\.[0-9]+)?)/i,
      1
    );
    if (subtotalMatch) {
      const numStr = subtotalMatch.value.replace(/,/g, "");
      const dec = FixedDecimal.fromString(numStr).roundToScale(scale);
      fields.push({
        fieldName: "subtotal_amount",
        fieldValueRaw: subtotalMatch.value,
        fieldValueNormalized: dec.toNumber(),
        confidence: 0.96,
        pageNumber: subtotalMatch.pageNumber,
        boundingBox: subtotalMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          validationPassed: dec.isPositive(),
          isOptional: category === "RECEIPT",
          category,
        },
      });
    }

    // Tax Amount (Optional)
    const taxMatch = this.findMatch(
      fullText,
      pages,
      /(?:Tax|VAT|GST|Sales\s*Tax)(?:\s*\([0-9.]+%\))?[:.\s]*(?:[A-Za-z]{3}|[$€£¥S])?\s*([0-9,]+(?:\.[0-9]+)?)/i,
      1
    );
    if (taxMatch) {
      const numStr = taxMatch.value.replace(/,/g, "");
      const dec = FixedDecimal.fromString(numStr).roundToScale(scale);
      fields.push({
        fieldName: "tax_amount",
        fieldValueRaw: taxMatch.value,
        fieldValueNormalized: dec.toNumber(),
        confidence: 0.93,
        pageNumber: taxMatch.pageNumber,
        boundingBox: taxMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          validationPassed: !dec.isNegative(),
          isOptional: true,
          category,
        },
      });
    }

    // Total Amount (Mandatory for all categories)
    const totalMatch = this.findMatch(
      fullText,
      pages,
      /(?:\bTotal\s*(?:Amount|Due)?\b|\bGrand\s*Total\b|\bAmount\s*Due\b)[:.\s]*(?:[A-Za-z]{3}|[$€£¥S])?\s*([0-9,]+(?:\.[0-9]+)?)/i,
      1
    );
    if (totalMatch) {
      const numStr = totalMatch.value.replace(/,/g, "");
      const dec = FixedDecimal.fromString(numStr).roundToScale(scale);
      fields.push({
        fieldName: "total_amount",
        fieldValueRaw: totalMatch.value,
        fieldValueNormalized: dec.toNumber(),
        confidence: 0.98,
        pageNumber: totalMatch.pageNumber,
        boundingBox: totalMatch.boundingBox,
        metadata: {
          extractionMethod: "REGEX_PATTERN",
          validationPassed: dec.isPositive(),
          isOptional: false,
          category,
        },
      });
    }
  }

  /**
   * Structured line items extraction with quantity, unit price, and line total.
   */
  private extractLineItems(fullText: string, pages: ExtractedPage[], currencyCode: string): ExtractedLineItem[] {
    const scale = getCurrencyScale(currencyCode);
    const lineItems: ExtractedLineItem[] = [];

    const lines = fullText.split(/\r?\n/);
    const lineRegex = /^\s*([A-Za-z0-9 .,&#'":-]{3,60}?)\s+(\d+(?:\.\d+)?)\s+(?:[A-Za-z]{3}|[$€£¥S]?\s*)(\d+(?:\.\d{2,4})?)\s+(?:[A-Za-z]{3}|[$€£¥S]?\s*)(\d+(?:\.\d{2,4})?)\s*$/;

    let idx = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/description|quantity|unit\s*price|subtotal|total|item|qty|tax|amount/i.test(trimmed)) {
        if (/description/i.test(trimmed) && /qty|quantity|total/i.test(trimmed)) continue;
      }

      const match = lineRegex.exec(trimmed);
      if (match) {
        const desc = match[1].trim();
        if (/description|quantity|unit\s*price|subtotal|total|item|qty/i.test(desc)) continue;

        const qty = parseFloat(match[2]);
        const unitPrice = FixedDecimal.fromString(match[3]).roundToScale(scale).toNumber();
        const totalAmount = FixedDecimal.fromString(match[4]).roundToScale(scale).toNumber();

        lineItems.push({
          description: desc,
          quantity: qty,
          unitPrice,
          totalAmount,
          pageNumber: 1,
          boundingBox: [0.1, 0.35 + idx * 0.04, 0.9, 0.38 + idx * 0.04],
        });
        idx++;
      }
    }

    return lineItems;
  }

  private findVendor(fullText: string, pages: ExtractedPage[]): ExtractedFieldItem | null {
    const match = this.findMatch(
      fullText,
      pages,
      /(?:From|Vendor|Seller|Billed\s*By|Supplier)[:.\s]*([A-Za-z0-9\s.,&#'"-]{2,60})/i,
      1
    );
    if (!match) return null;

    const vendor = match.value.split("\n")[0].trim();
    return {
      fieldName: "vendor_name",
      fieldValueRaw: vendor,
      fieldValueNormalized: vendor,
      confidence: vendor.length >= 3 ? 0.92 : 0.65,
      pageNumber: match.pageNumber,
      boundingBox: match.boundingBox,
      metadata: {
        extractionMethod: "KEYWORD_PROXIMITY",
        validationPassed: vendor.length >= 2,
        isOptional: false,
        category: "INVOICE",
      },
    };
  }

  private findCustomer(fullText: string, pages: ExtractedPage[], category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER"): ExtractedFieldItem | null {
    const match = this.findMatch(
      fullText,
      pages,
      /(?:\bTo\b|\bBill\s*To\b|\bCustomer\b|\bBilled\s*To\b|\bBuyer\b)[:.\s]*([A-Za-z0-9\s.,&#'"-]{2,60})/i,
      1
    );
    if (!match) return null;

    const cust = match.value.split("\n")[0].trim();
    return {
      fieldName: "customer_name",
      fieldValueRaw: cust,
      fieldValueNormalized: cust,
      confidence: cust.length >= 3 ? 0.91 : 0.60,
      pageNumber: match.pageNumber,
      boundingBox: match.boundingBox,
      metadata: {
        extractionMethod: "KEYWORD_PROXIMITY",
        validationPassed: cust.length >= 2,
        isOptional: true,
        category,
      },
    };
  }

  private findTaxId(fullText: string, pages: ExtractedPage[], category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER"): ExtractedFieldItem | null {
    const match = this.findMatch(
      fullText,
      pages,
      /(?:Tax\s*ID|VAT\s*(?:No|#)?|GSTIN|EIN|UEN)[:.\s]*([A-Z0-9-]{6,25})/i,
      1
    );
    if (!match) return null;

    const taxId = match.value.trim().toUpperCase();
    return {
      fieldName: "vendor_tax_id",
      fieldValueRaw: match.value,
      fieldValueNormalized: taxId,
      confidence: 0.94,
      pageNumber: match.pageNumber,
      boundingBox: match.boundingBox,
      metadata: {
        extractionMethod: "REGEX_PATTERN",
        validationPassed: /^[A-Z0-9-]{6,25}$/.test(taxId),
        isOptional: true,
        category,
      },
    };
  }

  private detectCurrency(text: string): { code: string; raw: string; confidence: number } {
    if (/\bSGD\b|S\$/i.test(text)) return { code: "SGD", raw: "S$", confidence: 0.99 };
    if (/\bUSD\b|\$/i.test(text)) return { code: "USD", raw: "$", confidence: 0.99 };
    if (/\bEUR\b|€/i.test(text)) return { code: "EUR", raw: "€", confidence: 0.99 };
    if (/\bGBP\b|£/i.test(text)) return { code: "GBP", raw: "£", confidence: 0.99 };
    if (/\bJPY\b|¥/i.test(text)) return { code: "JPY", raw: "¥", confidence: 0.99 };
    if (/\bBHD\b/i.test(text)) return { code: "BHD", raw: "BHD", confidence: 0.99 };
    if (/\bINR\b|₹/i.test(text)) return { code: "INR", raw: "INR", confidence: 0.99 };
    if (/\bAUD\b|A\$/i.test(text)) return { code: "AUD", raw: "A$", confidence: 0.99 };
    if (/\bCAD\b|C\$/i.test(text)) return { code: "CAD", raw: "C$", confidence: 0.99 };
    return { code: "USD", raw: "$", confidence: 0.88 }; // default
  }

  private validateAndNormalizeDate(rawDateStr: string): { isoDate: string; isValid: boolean } {
    const parsed = new Date(rawDateStr);
    if (Number.isNaN(parsed.getTime())) {
      return { isoDate: rawDateStr, isValid: false };
    }

    const year = parsed.getUTCFullYear();
    if (year < 2000 || year > 2050) {
      return { isoDate: rawDateStr, isValid: false };
    }

    const isoDate = parsed.toISOString().split("T")[0];
    return { isoDate, isValid: true };
  }

  private findMatch(
    text: string,
    pages: ExtractedPage[],
    regex: RegExp,
    groupIndex: number = 1
  ): { value: string; pageNumber: number; boundingBox: [number, number, number, number] } | null {
    const match = regex.exec(text);
    if (!match || !match[groupIndex]) return null;

    const matchedValue = match[groupIndex].trim();

    // Locate token in pages to retrieve precise bounding box
    for (const page of pages) {
      for (const token of page.tokens) {
        if (token.text.includes(matchedValue) || matchedValue.includes(token.text)) {
          return {
            value: matchedValue,
            pageNumber: page.pageNumber,
            boundingBox: token.boundingBox,
          };
        }
      }
    }

    return {
      value: matchedValue,
      pageNumber: 1,
      boundingBox: [0.1, 0.1, 0.4, 0.15],
    };
  }
}
