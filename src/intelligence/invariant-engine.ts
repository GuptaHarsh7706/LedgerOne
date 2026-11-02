/**
 * LedgerOne Multi-Rule Financial Invariant & Consistency Engine
 * 
 * Enforces arbitrary-precision decimal validation, currency-aware rounding tolerance,
 * and category-specific state machine rules for Invoices, Receipts, and Purchase Orders.
 */

import { FixedDecimal, calculateCurrencyTolerance, getCurrencyScale } from "./decimal-math.js";
import { ExtractedFieldItem, ExtractedLineItem } from "./field-extractor.js";

export interface InvariantCheckResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: "CRITICAL" | "HIGH" | "WARNING";
  discrepancy?: string;
  expected?: string | number;
  actual?: string | number;
  tolerance?: string;
}

export interface DocumentValidationReport {
  category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER";
  isValid: boolean;
  recommendedStatus: "COMPLETED" | "AWAITING_REVIEW";
  overallConfidence: number;
  currencyCode: string;
  checks: InvariantCheckResult[];
  violations: InvariantCheckResult[];
  warnings: InvariantCheckResult[];
}

export class FinancialInvariantEngine {
  /**
   * Main validation engine assessing field extractions against financial rules.
   */
  validate(
    category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER",
    fields: ExtractedFieldItem[]
  ): DocumentValidationReport {
    const checks: InvariantCheckResult[] = [];
    const fieldMap = new Map<string, ExtractedFieldItem>();
    fields.forEach((f) => fieldMap.set(f.fieldName, f));

    const currencyCode = fieldMap.get("currency")?.fieldValueNormalized || "USD";
    const scale = getCurrencyScale(currencyCode);

    // 1. RULE-REQ: Mandatory Fields Gate
    this.checkMandatoryFields(category, fieldMap, checks);

    // 2. RULE-CONF: Confidence Threshold Gate (>= 0.85 for required fields)
    this.checkConfidenceThresholds(fieldMap, checks);

    // 3. RULE-NONNUM: Independent Non-Numeric Integrity (Dates, Currency, Entities)
    this.checkNonNumericIntegrity(fieldMap, checks);

    // 4. RULE-MATH: High-Precision Mathematical Invariants
    this.checkMathematicalInvariants(category, fieldMap, currencyCode, scale, checks);

    const violations = checks.filter((c) => !c.passed && c.severity !== "WARNING");
    const warnings = checks.filter((c) => !c.passed && c.severity === "WARNING");
    const isValid = violations.length === 0;

    // Calculate weighted average confidence across all extracted fields
    const avgConfidence = fields.length > 0
      ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length
      : 0;

    const recommendedStatus: "COMPLETED" | "AWAITING_REVIEW" = isValid && avgConfidence >= 0.85
      ? "COMPLETED"
      : "AWAITING_REVIEW";

    return {
      category,
      isValid,
      recommendedStatus,
      overallConfidence: parseFloat(avgConfidence.toFixed(4)),
      currencyCode,
      checks,
      violations,
      warnings,
    };
  }

  // ==========================================================================
  // 1. MANDATORY FIELDS GATE
  // ==========================================================================
  private checkMandatoryFields(
    category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER",
    fieldMap: Map<string, ExtractedFieldItem>,
    checks: InvariantCheckResult[]
  ) {
    const mandatoryMap: Record<string, string[]> = {
      INVOICE: ["invoice_number", "invoice_date", "vendor_name", "total_amount"],
      RECEIPT: ["receipt_number", "receipt_date", "merchant_name", "total_amount"],
      PURCHASE_ORDER: ["po_number", "po_date", "vendor_name", "total_amount"],
    };

    const required = mandatoryMap[category] || ["total_amount"];
    for (const reqField of required) {
      const field = fieldMap.get(reqField);
      const isPresent = Boolean(field && field.fieldValueRaw && field.fieldValueRaw.trim().length > 0);
      checks.push({
        ruleId: `REQ-${reqField.toUpperCase()}`,
        ruleName: `Mandatory Field: ${reqField}`,
        passed: isPresent,
        severity: "CRITICAL",
        discrepancy: isPresent ? undefined : `Mandatory field '${reqField}' was not found in document`,
      });
    }
  }

  // ==========================================================================
  // 2. CONFIDENCE THRESHOLD GATE
  // ==========================================================================
  private checkConfidenceThresholds(
    fieldMap: Map<string, ExtractedFieldItem>,
    checks: InvariantCheckResult[]
  ) {
    const minConfidenceThreshold = 0.85;

    for (const [name, field] of fieldMap.entries()) {
      if (field.metadata.isOptional) continue;

      const isHighConfidence = field.confidence >= minConfidenceThreshold;
      checks.push({
        ruleId: `CONF-${name.toUpperCase()}`,
        ruleName: `Confidence Threshold: ${name} (>= 0.85)`,
        passed: isHighConfidence,
        severity: "HIGH",
        expected: ">= 0.85",
        actual: field.confidence,
        discrepancy: isHighConfidence
          ? undefined
          : `Field '${name}' extracted with provisional confidence ${field.confidence} below threshold 0.85`,
      });
    }
  }

  // ==========================================================================
  // 3. INDEPENDENT NON-NUMERIC INTEGRITY
  // ==========================================================================
  private checkNonNumericIntegrity(
    fieldMap: Map<string, ExtractedFieldItem>,
    checks: InvariantCheckResult[]
  ) {
    // 3.1 Date Validity and Chronology
    const invDate = fieldMap.get("invoice_date") || fieldMap.get("po_date") || fieldMap.get("receipt_date");
    const dueDate = fieldMap.get("due_date");

    if (invDate) {
      checks.push({
        ruleId: "DATE-FORMAT-VALID",
        ruleName: "Document Date Calendar Validity",
        passed: fieldMap.get(invDate.fieldName)?.metadata.validationPassed ?? true,
        severity: "HIGH",
        discrepancy: invDate.metadata.validationPassed ? undefined : `Invalid calendar date '${invDate.fieldValueRaw}'`,
      });
    }

    if (invDate && dueDate && invDate.fieldValueNormalized && dueDate.fieldValueNormalized) {
      const tInv = new Date(invDate.fieldValueNormalized).getTime();
      const tDue = new Date(dueDate.fieldValueNormalized).getTime();
      const isChronological = tDue >= tInv;
      checks.push({
        ruleId: "DATE-CHRONOLOGY-VALID",
        ruleName: "Date Chronology (Invoice Date <= Due Date)",
        passed: isChronological,
        severity: "HIGH",
        expected: `${invDate.fieldValueNormalized} <= ${dueDate.fieldValueNormalized}`,
        actual: `Diff: ${((tDue - tInv) / (1000 * 3600 * 24)).toFixed(0)} days`,
        discrepancy: isChronological ? undefined : `Due date '${dueDate.fieldValueNormalized}' precedes invoice date '${invDate.fieldValueNormalized}'`,
      });
    }

    // 3.2 Tax ID Structure
    const taxId = fieldMap.get("vendor_tax_id");
    if (taxId) {
      checks.push({
        ruleId: "TAX-ID-SYNTAX",
        ruleName: "Vendor Tax ID / VAT Syntax",
        passed: taxId.metadata.validationPassed,
        severity: "WARNING",
        discrepancy: taxId.metadata.validationPassed ? undefined : `Tax ID '${taxId.fieldValueRaw}' does not match standard patterns`,
      });
    }
  }

  // ==========================================================================
  // 4. MATHEMATICAL INVARIANTS (DECIMAL ARITHMETIC)
  // ==========================================================================
  private checkMathematicalInvariants(
    category: "INVOICE" | "RECEIPT" | "PURCHASE_ORDER",
    fieldMap: Map<string, ExtractedFieldItem>,
    currencyCode: string,
    scale: number,
    checks: InvariantCheckResult[]
  ) {
    const totalItem = fieldMap.get("total_amount");
    const subtotalItem = fieldMap.get("subtotal_amount");
    const taxItem = fieldMap.get("tax_amount");
    const lineItemsItem = fieldMap.get("line_items");

    if (!totalItem || typeof totalItem.fieldValueNormalized !== "number") {
      // Already caught by mandatory check
      return;
    }

    const totalDec = FixedDecimal.fromNumber(totalItem.fieldValueNormalized).roundToScale(scale);
    const subtotalDec = subtotalItem && typeof subtotalItem.fieldValueNormalized === "number"
      ? FixedDecimal.fromNumber(subtotalItem.fieldValueNormalized).roundToScale(scale)
      : null;
    const taxDec = taxItem && typeof taxItem.fieldValueNormalized === "number"
      ? FixedDecimal.fromNumber(taxItem.fieldValueNormalized).roundToScale(scale)
      : FixedDecimal.zero();

    const lineItems: ExtractedLineItem[] = Array.isArray(lineItemsItem?.fieldValueNormalized)
      ? lineItemsItem!.fieldValueNormalized
      : [];

    const currencyTol = calculateCurrencyTolerance(currencyCode, Math.max(1, lineItems.length));

    // 4.1 Check Line Item Math: Quantity * UnitPrice == LineTotal
    if (lineItems.length > 0) {
      let allLineMathValid = true;
      const failedLines: string[] = [];

      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const qtyDec = FixedDecimal.fromNumber(item.quantity);
        const unitPriceDec = FixedDecimal.fromNumber(item.unitPrice).roundToScale(scale);
        const expectedTotal = qtyDec.mul(unitPriceDec).roundToScale(scale);
        const actualTotal = FixedDecimal.fromNumber(item.totalAmount).roundToScale(scale);

        // Single line tolerance: exact
        if (!actualTotal.equals(expectedTotal, FixedDecimal.zero())) {
          allLineMathValid = false;
          failedLines.push(`Line ${i + 1} (${item.description}): ${item.quantity} × ${item.unitPrice} = ${expectedTotal.toNumber()}, but line total is ${item.totalAmount}`);
        }
      }

      checks.push({
        ruleId: "MATH-LINE-ITEM-ACCURACY",
        ruleName: "Line-Item Arithmetic (Qty × Unit Price = Line Total)",
        passed: allLineMathValid,
        severity: "CRITICAL",
        discrepancy: allLineMathValid ? undefined : failedLines.join("; "),
      });

      // 4.2 Check Line Items Sum to Subtotal (or Total if subtotal missing)
      let lineSumDec = FixedDecimal.zero();
      for (const item of lineItems) {
        lineSumDec = lineSumDec.add(FixedDecimal.fromNumber(item.totalAmount).roundToScale(scale));
      }

      const targetSumDec = subtotalDec ?? (taxDec.isZero() ? totalDec : totalDec.sub(taxDec));
      const isLineSumValid = lineSumDec.equals(targetSumDec, currencyTol);

      checks.push({
        ruleId: "MATH-LINE-SUM-TO-SUBTOTAL",
        ruleName: "Line Items Sum to Subtotal",
        passed: isLineSumValid,
        severity: "CRITICAL",
        expected: targetSumDec.toNumber(),
        actual: lineSumDec.toNumber(),
        tolerance: `±${currencyTol.toString(scale)} ${currencyCode}`,
        discrepancy: isLineSumValid
          ? undefined
          : `Sum of line items (${lineSumDec.toString(scale)}) does not match subtotal (${targetSumDec.toString(scale)}) within tolerance ±${currencyTol.toString(scale)}`,
      });
    }

    // 4.3 Check Header Financial Balance: Subtotal + Tax = Total
    if (subtotalDec) {
      const calculatedTotal = subtotalDec.add(taxDec);
      const isBalanceValid = totalDec.equals(calculatedTotal, currencyTol);

      checks.push({
        ruleId: "MATH-HEADER-BALANCE",
        ruleName: "Header Financial Balance (Subtotal + Tax = Total)",
        passed: isBalanceValid,
        severity: "CRITICAL",
        expected: calculatedTotal.toNumber(),
        actual: totalDec.toNumber(),
        tolerance: `±${currencyTol.toString(scale)} ${currencyCode}`,
        discrepancy: isBalanceValid
          ? undefined
          : `Header arithmetic discrepancy: Subtotal (${subtotalDec.toString(scale)}) + Tax (${taxDec.toString(scale)}) = ${calculatedTotal.toString(scale)}, but Total is ${totalDec.toString(scale)}`,
      });
    }
  }
}
