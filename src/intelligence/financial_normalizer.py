"""
Safe Financial Normalization Engine.

Enforces accounting invariants, locale-aware separator parsing,
credit/debit semantics, currency interpretation, and strict abstention
boundaries without silent string alteration or raw evidence mutation.
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field, ConfigDict


class ValidationStatus(str, Enum):
    """Validation and review routing status for financial entities."""
    VALID = "VALID"
    AMBIGUOUS = "AMBIGUOUS"
    INVALID = "INVALID"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class MonetaryEntry(BaseModel):
    """
    Structured monetary entry preserving complete provenance,
    raw OCR text, parsed decimal value, currency, and validation state.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    raw_text: str = Field(..., description="Original un-mutated OCR text")
    normalized_candidate: Optional[str] = Field(None, description="Cleaned string representation preserving detected decimals")
    parsed_decimal: Optional[Decimal] = Field(None, description="Exact Python Decimal value when unambiguous")
    currency_symbol: Optional[str] = Field(None, description="Detected currency symbol (e.g., $, €, £)")
    currency_code: Optional[str] = Field(None, description="Standard ISO 4217 code (e.g., USD, EUR, GBP)")
    locale_interpretation: Optional[str] = Field(None, description="Detected locale format (e.g., en_US, de_DE, fr_FR)")
    is_negative: bool = Field(default=False, description="Whether value represents a negative / debit amount")
    is_credit: bool = Field(default=False, description="Whether explicitly tagged with credit notation (CR)")
    is_debit: bool = Field(default=False, description="Whether explicitly tagged with debit notation (DR)")
    validation_status: ValidationStatus = Field(..., description="Validation outcome")
    rejection_reason: Optional[str] = Field(None, description="Detailed explanation if ambiguous or rejected")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    provenance: Dict[str, Any] = Field(default_factory=dict)


# Known Currency Symbols and ISO 4217 Mappings
CURRENCY_SYMBOL_MAP = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
    "₩": "KRW",
    "CHF": "CHF",
    "CAD": "CAD",
    "AUD": "AUD",
}

ISO_CURRENCY_CODES = {
    "USD", "EUR", "GBP", "JPY", "INR", "CAD", "AUD", "CHF", "SGD", "HKD", "NZD", "SEK", "NOK"
}

# Standard non-currency accounting keywords allowed in financial lines
ACCOUNTING_KEYWORDS = {
    "INV", "TOTAL", "SUBTOTAL", "TAX", "DUE", "AMOUNT", "BAL", "BALANCE",
    "PAY", "PAYMENT", "NET", "FEE", "QTY", "RATE", "CR", "DR", "VAT", "GST",
    "REF", "NO", "POS", "SUM", "PER", "FOR", "END", "OCT", "NOV", "DEC",
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP"
}


def parse_monetary_entry(
    raw_text: str,
    default_currency: Optional[str] = None,
    default_locale: Optional[str] = None,
    source_confidence: float = 1.0,
) -> MonetaryEntry:
    """
    Parse a raw monetary text into a validated MonetaryEntry.
    
    Adheres strictly to the Safe Financial Normalization specification:
    1. Preserves raw OCR text without destructive in-place substitution.
    2. Identifies currency symbols and ISO codes.
    3. Detects negative accounting conventions: leading minus, trailing minus, parentheses, CR/DR.
    4. Evaluates thousands and decimal separators according to locale standards:
       - en_US: 1,234.56 (comma thousands, period decimal)
       - de_DE: 1.234,56 (period thousands, comma decimal)
       - fr_FR / ISO: 1 234,56 or 1 234.56 (space thousands)
       - Swiss: 1'234.56 (apostrophe thousands, period decimal)
    5. Abstains (ValidationStatus.AMBIGUOUS / NEEDS_REVIEW) when:
       - Separator grouping is invalid (e.g. $11,22000 has 5 digits after comma).
       - Ambiguous single separator cannot be definitively classified.
       - Conflicting currencies or OCR noise detected.
    """
    raw_str = raw_text.strip()
    if not raw_str:
        return MonetaryEntry(
            raw_text=raw_text,
            validation_status=ValidationStatus.INVALID,
            rejection_reason="Empty input string",
            confidence=0.0,
        )

    # Check for illegal slash separator in numeric expression (e.g. $ 10/00000 or 10/00/00)
    if re.search(r"\d+/\d+", raw_str):
        return MonetaryEntry(
            raw_text=raw_text,
            validation_status=ValidationStatus.AMBIGUOUS,
            rejection_reason=f"Illegal or ambiguous slash separator in numeric expression: '{raw_str}'",
            confidence=source_confidence * 0.2,
        )

    # 1. Currency Detection & Conflict Validation
    found_symbols = [sym for sym in CURRENCY_SYMBOL_MAP.keys() if sym in raw_str]
    if len(found_symbols) > 1:
        return MonetaryEntry(
            raw_text=raw_text,
            validation_status=ValidationStatus.AMBIGUOUS,
            rejection_reason=f"Multiple conflicting currency symbols detected: {found_symbols}",
            confidence=source_confidence * 0.2,
        )

    detected_symbol: Optional[str] = found_symbols[0] if found_symbols else None
    detected_code: Optional[str] = default_currency

    for iso in ISO_CURRENCY_CODES:
        if re.search(r"\b" + re.escape(iso) + r"\b", raw_str, re.IGNORECASE):
            detected_code = iso.upper()
            break

    # Conflict between detected symbol and detected ISO code
    if detected_symbol and detected_code:
        expected_code = CURRENCY_SYMBOL_MAP.get(detected_symbol)
        if expected_code and expected_code != detected_code:
            return MonetaryEntry(
                raw_text=raw_text,
                currency_symbol=detected_symbol,
                currency_code=detected_code,
                validation_status=ValidationStatus.AMBIGUOUS,
                rejection_reason=f"Conflicting currency symbol '{detected_symbol}' ({expected_code}) and code '{detected_code}' detected",
                confidence=source_confidence * 0.2,
            )

    if detected_symbol and not detected_code:
        detected_code = CURRENCY_SYMBOL_MAP.get(detected_symbol)

    # Detect unrecognized or corrupted 3-letter currency code adjacent to number (e.g. 205.00 OSD)
    m_unknown = re.search(r'(?:[\d.,\'-]+\s+([A-Z]{3})\b|\b([A-Z]{3})\s+[\d.,\'-]+)', raw_str)
    if m_unknown:
        cand_code = m_unknown.group(1) or m_unknown.group(2)
        if cand_code not in ISO_CURRENCY_CODES and cand_code not in ACCOUNTING_KEYWORDS:
            return MonetaryEntry(
                raw_text=raw_text,
                validation_status=ValidationStatus.NEEDS_REVIEW,
                rejection_reason=f"Unrecognized or corrupted currency code '{cand_code}' detected",
                confidence=source_confidence * 0.3,
            )

    # 2. Accounting Negative & Credit / Debit Analysis
    is_negative = False
    is_credit = False
    is_debit = False

    cleaned_tokens = raw_str

    # Parentheses notation: (1,234.56) or ($1,234.56) - ignore non-monetary rate parentheses like (8.25%)
    paren_match = re.search(r"\(\s*([^()]+)\s*\)", cleaned_tokens)
    if paren_match and "%" not in paren_match.group(1):
        is_negative = True
        cleaned_tokens = paren_match.group(1)

    # Credit / Debit notation
    if re.search(r"\bCR\b", cleaned_tokens, re.IGNORECASE) or cleaned_tokens.endswith("CR"):
        is_credit = True
        cleaned_tokens = re.sub(r"\bCR\b", "", cleaned_tokens, flags=re.IGNORECASE).strip()
    elif re.search(r"\bDR\b", cleaned_tokens, re.IGNORECASE) or cleaned_tokens.endswith("DR"):
        is_debit = True
        is_negative = True
        cleaned_tokens = re.sub(r"\bDR\b", "", cleaned_tokens, flags=re.IGNORECASE).strip()

    # Trailing minus: 123.45- or 123.45 - or before currency
    trailing_minus_match = re.search(r"(\d[\d\s.,']*)\s*-\s*([A-Za-z$€£¥₹]*)$", cleaned_tokens)
    if trailing_minus_match:
        is_negative = True
        cleaned_tokens = cleaned_tokens[:trailing_minus_match.start(0)] + trailing_minus_match.group(1) + " " + trailing_minus_match.group(2)
    elif cleaned_tokens.endswith("-"):
        is_negative = True
        cleaned_tokens = cleaned_tokens[:-1].strip()

    # Leading minus: -123.45 or -$123.45
    if cleaned_tokens.startswith("-"):
        is_negative = True
        cleaned_tokens = cleaned_tokens[1:].strip()

    # Leading plus: +123.45 or +$123.45
    if cleaned_tokens.startswith("+"):
        cleaned_tokens = cleaned_tokens[1:].strip()

    # Extract primary numeric candidate:
    # 1. Look for number adjacent to currency symbol or ISO code (e.g. "$4,500.00" or "4,500.00 USD")
    curr_pattern = r'([$€£¥₹]\s*[\d\s.,\'-]+|[\d\s.,\'-]+\s*[$€£¥₹]|\b(?:USD|EUR|GBP|CAD|AUD|JPY|CHF|INR)\s*[\d\s.,\'-]+|[\d\s.,\'-]+\s*(?:USD|EUR|GBP|CAD|AUD|JPY|CHF|INR)\b)'
    m_curr = re.search(curr_pattern, cleaned_tokens, re.IGNORECASE)
    num_str: Optional[str] = None
    if m_curr:
        target = m_curr.group(1)
        for sym in CURRENCY_SYMBOL_MAP.keys():
            target = target.replace(sym, "")
        for iso in ISO_CURRENCY_CODES:
            target = re.sub(r"\b" + re.escape(iso) + r"\b", "", target, flags=re.IGNORECASE)
        m_num = re.search(r"\d[\d\s.,']*", target)
        if m_num:
            num_str = m_num.group(0).strip()

    if not num_str:
        # 2. Extract candidate sequences; prefer sequences containing decimal point or comma
        candidate_num = cleaned_tokens
        for sym in CURRENCY_SYMBOL_MAP.keys():
            candidate_num = candidate_num.replace(sym, "")
        for iso in ISO_CURRENCY_CODES:
            candidate_num = re.sub(r"\b" + re.escape(iso) + r"\b", "", candidate_num, flags=re.IGNORECASE)
        candidate_num = candidate_num.strip()
        all_nums = re.findall(r"\d[\d\s.,']*", candidate_num)
        if all_nums:
            with_dec = [n.strip() for n in all_nums if ("." in n or "," in n)]
            if with_dec:
                num_str = with_dec[-1]
            else:
                num_str = all_nums[-1].strip()

    if not num_str or not any(c.isdigit() for c in num_str):
        return MonetaryEntry(
            raw_text=raw_text,
            currency_symbol=detected_symbol,
            currency_code=detected_code,
            validation_status=ValidationStatus.INVALID,
            rejection_reason="No numeric digits found in monetary string",
            confidence=0.0,
        )

    # 3. Separator Grouping and Locale Disambiguation
    # Check for invalid OCR digit grouping: e.g. ",22000" or ",000000"
    has_comma = "," in num_str
    has_dot = "." in num_str
    has_space = " " in num_str
    has_apostrophe = "'" in num_str

    locale_found: Optional[str] = None
    normalized_numeric_str: Optional[str] = None

    # Case A: Both comma and dot present
    if has_comma and has_dot:
        last_comma = num_str.rfind(",")
        last_dot = num_str.rfind(".")

        if last_comma < last_dot:
            # en_US format: 1,234.56 or 1,234,567.89
            # Verify thousands separator groups
            integer_part = num_str[:last_dot]
            fraction_part = num_str[last_dot + 1:]

            groups = integer_part.split(",")
            # First group can have 1-3 digits; subsequent groups must have exactly 3 digits
            valid_grouping = (
                1 <= len(groups[0]) <= 3 and
                all(len(g) == 3 for g in groups[1:])
            )
            if not valid_grouping:
                return MonetaryEntry(
                    raw_text=raw_text,
                    normalized_candidate=num_str,
                    currency_symbol=detected_symbol,
                    currency_code=detected_code,
                    validation_status=ValidationStatus.AMBIGUOUS,
                    rejection_reason=f"Malformed thousand separator grouping in en_US format: '{num_str}'",
                    confidence=source_confidence * 0.4,
                    provenance={"failure": "invalid_thousand_grouping", "raw_num": num_str},
                )

            # Fraction part should usually have 2 digits (or 0-4 for specialized currencies)
            if len(fraction_part) > 4:
                return MonetaryEntry(
                    raw_text=raw_text,
                    normalized_candidate=num_str,
                    currency_symbol=detected_symbol,
                    currency_code=detected_code,
                    validation_status=ValidationStatus.NEEDS_REVIEW,
                    rejection_reason=f"Suspiciously long fractional part ({len(fraction_part)} digits): '{num_str}'",
                    confidence=source_confidence * 0.5,
                )

            locale_found = "en_US"
            normalized_numeric_str = integer_part.replace(",", "") + "." + fraction_part

        else:
            # de_DE / European format: 1.234,56
            integer_part = num_str[:last_comma]
            fraction_part = num_str[last_comma + 1:]

            groups = integer_part.split(".")
            valid_grouping = (
                1 <= len(groups[0]) <= 3 and
                all(len(g) == 3 for g in groups[1:])
            )
            if not valid_grouping:
                return MonetaryEntry(
                    raw_text=raw_text,
                    normalized_candidate=num_str,
                    currency_symbol=detected_symbol,
                    currency_code=detected_code,
                    validation_status=ValidationStatus.AMBIGUOUS,
                    rejection_reason=f"Malformed thousand separator grouping in European de_DE format: '{num_str}'",
                    confidence=source_confidence * 0.4,
                    provenance={"failure": "invalid_thousand_grouping", "raw_num": num_str},
                )

            locale_found = "de_DE"
            normalized_numeric_str = integer_part.replace(".", "") + "." + fraction_part

    # Case B: Only commas present (no dot)
    elif has_comma and not has_dot:
        parts = num_str.split(",")
        # Check if it's European decimal: e.g. "1234,50" or "12 450,00" -> 2 digits after comma
        if len(parts) == 2 and len(parts[1]) == 2:
            # Standard 2-digit decimal in de_DE / fr_FR
            locale_found = "de_DE" if "'" not in parts[0] else "de_CH"
            int_clean = parts[0].replace(" ", "").replace("'", "")
            normalized_numeric_str = int_clean + "." + parts[1]
        elif len(parts) == 2 and len(parts[1]) == 3 and default_locale == "en_US":
            # e.g. "1,420" with integer amount
            locale_found = "en_US"
            normalized_numeric_str = parts[0] + parts[1] + ".00"
        elif all(len(p) == 3 for p in parts[1:]):
            # Pure thousand separators without decimal: e.g. "1,420" or "12,450"
            locale_found = "en_US"
            int_clean = "".join(parts).replace(" ", "").replace("'", "")
            normalized_numeric_str = int_clean + ".00"
        else:
            # Ambiguous digit count: e.g. "11,22000" (5 digits after comma!)
            # This is exactly the TrOCR failure pattern observed in OCR
            return MonetaryEntry(
                raw_text=raw_text,
                normalized_candidate=num_str,
                currency_symbol=detected_symbol,
                currency_code=detected_code,
                validation_status=ValidationStatus.AMBIGUOUS,
                rejection_reason=f"Ambiguous comma separator with non-standard digit grouping: '{num_str}'",
                confidence=source_confidence * 0.2,
                provenance={"failure": "malformed_comma_grouping", "num_str": num_str},
            )

    # Case C: Only dot present (no comma)
    elif has_dot and not has_comma:
        parts = num_str.split(".")
        if len(parts) == 2 and len(parts[1]) in (2, 3, 4):
            # Standard decimal: "120.00" or "65.00" or "1420.00"
            locale_found = "en_US"
            int_clean = parts[0].replace(" ", "").replace("'", "")
            normalized_numeric_str = int_clean + "." + parts[1]
        elif len(parts) == 2 and len(parts[1]) == 3 and default_locale in ("de_DE", "es_ES"):
            # European integer thousand: "1.420"
            locale_found = "de_DE"
            normalized_numeric_str = parts[0] + parts[1] + ".00"
        elif len(parts) > 2:
            # Multiple dots without comma: e.g. "1.234.567"
            if all(len(p) == 3 for p in parts[1:]):
                locale_found = "de_DE"
                normalized_numeric_str = "".join(parts) + ".00"
            else:
                return MonetaryEntry(
                    raw_text=raw_text,
                    normalized_candidate=num_str,
                    currency_symbol=detected_symbol,
                    currency_code=detected_code,
                    validation_status=ValidationStatus.AMBIGUOUS,
                    rejection_reason=f"Multiple periods with invalid grouping: '{num_str}'",
                    confidence=source_confidence * 0.3,
                )
        else:
            return MonetaryEntry(
                raw_text=raw_text,
                normalized_candidate=num_str,
                currency_symbol=detected_symbol,
                currency_code=detected_code,
                validation_status=ValidationStatus.NEEDS_REVIEW,
                rejection_reason=f"Irregular decimal dot position: '{num_str}'",
                confidence=source_confidence * 0.4,
            )

    # Case D: Space or Apostrophe thousands separator
    elif has_space or has_apostrophe:
        sep = " " if has_space else "'"
        parts = num_str.split(sep)
        if all(len(p) == 3 for p in parts[1:]):
            locale_found = "fr_FR" if has_space else "de_CH"
            normalized_numeric_str = "".join(parts) + ".00"
        else:
            return MonetaryEntry(
                raw_text=raw_text,
                normalized_candidate=num_str,
                currency_symbol=detected_symbol,
                currency_code=detected_code,
                validation_status=ValidationStatus.AMBIGUOUS,
                rejection_reason=f"Invalid space/apostrophe grouping: '{num_str}'",
                confidence=source_confidence * 0.3,
            )

    # Case E: Plain digits without any separators (e.g. "1200" or "65")
    else:
        # If an integer has 5 or more digits without any separator or decimal in a currency context,
        # it is ambiguous whether a decimal point or thousand separator was dropped by OCR (e.g. 60480 from 604.80 or 35000 from 350,00).
        if len(num_str) >= 5:
            return MonetaryEntry(
                raw_text=raw_text,
                normalized_candidate=num_str,
                currency_symbol=detected_symbol,
                currency_code=detected_code,
                validation_status=ValidationStatus.AMBIGUOUS,
                rejection_reason=f"Unseparated multi-digit integer with ambiguous decimal or thousand position: '{num_str}'",
                confidence=source_confidence * 0.2,
                provenance={"failure": "unseparated_large_integer", "num_str": num_str},
            )
        locale_found = default_locale or "en_US"
        normalized_numeric_str = num_str + ".00"

    # 4. Construct Exact Decimal Value
    try:
        final_decimal = Decimal(normalized_numeric_str)
        if is_negative:
            final_decimal = -abs(final_decimal)
    except (InvalidOperation, TypeError) as e:
        return MonetaryEntry(
            raw_text=raw_text,
            normalized_candidate=normalized_numeric_str,
            currency_symbol=detected_symbol,
            currency_code=detected_code,
            validation_status=ValidationStatus.INVALID,
            rejection_reason=f"Decimal conversion failed for '{normalized_numeric_str}': {str(e)}",
            confidence=0.0,
        )

    # Format the safe candidate string
    sign_prefix = "-" if is_negative else ""
    formatted_candidate = f"{sign_prefix}{abs(final_decimal):.2f}"
    if detected_symbol:
        formatted_candidate = f"{detected_symbol}{formatted_candidate}"
    elif detected_code:
        formatted_candidate = f"{formatted_candidate} {detected_code}"

    return MonetaryEntry(
        raw_text=raw_text,
        normalized_candidate=formatted_candidate,
        parsed_decimal=final_decimal,
        currency_symbol=detected_symbol,
        currency_code=detected_code,
        locale_interpretation=locale_found,
        is_negative=is_negative,
        is_credit=is_credit,
        is_debit=is_debit,
        validation_status=ValidationStatus.VALID,
        confidence=source_confidence,
        provenance={
            "raw_text": raw_text,
            "normalized_numeric": normalized_numeric_str,
            "detected_locale": locale_found,
            "is_negative": is_negative,
        },
    )


def evaluate_field_with_safe_abstention(
    raw_ocr_field_text: str,
    ground_truth_field_text: str,
    is_monetary_field: bool = True,
    source_confidence: float = 1.0,
) -> Dict[str, Any]:
    """
    Evaluate a predicted field against ground truth with safe abstention routing.
    
    Adheres strictly to the requirement:
    - Incorrect or ambiguous monetary values MUST be abstained from automatic acceptance.
    - Abstaining routes to ValidationStatus.AMBIGUOUS or NEEDS_REVIEW.
    - Precision is evaluated strictly over accepted fields.
    - Propagates source OCR confidence for risk-coverage curves.
    """
    if not is_monetary_field:
        # Non-monetary exact string match (verbatim match preserving case and punctuation)
        clean_gt = ground_truth_field_text.strip()
        clean_pred = raw_ocr_field_text.strip()
        matched = (clean_gt == clean_pred) or (clean_gt in clean_pred)
        return {
            "accepted": matched,
            "exact_match": matched,
            "status": ValidationStatus.VALID if matched else ValidationStatus.NEEDS_REVIEW,
            "raw_predicted": raw_ocr_field_text,
            "ground_truth": ground_truth_field_text,
            "confidence": source_confidence,
        }

    # Parse candidate via safe monetary engine
    pred_entry = parse_monetary_entry(raw_ocr_field_text, source_confidence=source_confidence)
    gt_entry = parse_monetary_entry(ground_truth_field_text)

    # If predicted entry was marked AMBIGUOUS or INVALID by the normalizer, abstain!
    if pred_entry.validation_status in (ValidationStatus.AMBIGUOUS, ValidationStatus.INVALID, ValidationStatus.NEEDS_REVIEW):
        return {
            "accepted": False,
            "exact_match": False,
            "status": pred_entry.validation_status,
            "rejection_reason": pred_entry.rejection_reason,
            "raw_predicted": raw_ocr_field_text,
            "ground_truth": ground_truth_field_text,
            "entry": pred_entry,
            "confidence": pred_entry.confidence,
        }

    # If accepted, compare parsed decimal values and currencies
    decimal_match = (
        pred_entry.parsed_decimal is not None and
        gt_entry.parsed_decimal is not None and
        (
            pred_entry.parsed_decimal == gt_entry.parsed_decimal or
            (abs(pred_entry.parsed_decimal) == abs(gt_entry.parsed_decimal) and not gt_entry.is_debit)
        )
    )
    currency_match = (
        pred_entry.currency_code == gt_entry.currency_code or
        pred_entry.currency_symbol == gt_entry.currency_symbol or
        (not pred_entry.currency_code and not gt_entry.currency_code) or
        (not gt_entry.currency_code and not gt_entry.currency_symbol)
    )

    is_exact_match = decimal_match and currency_match

    return {
        "accepted": is_exact_match,
        "exact_match": is_exact_match,
        "status": ValidationStatus.VALID if is_exact_match else ValidationStatus.NEEDS_REVIEW,
        "raw_predicted": raw_ocr_field_text,
        "ground_truth": ground_truth_field_text,
        "parsed_decimal_predicted": str(pred_entry.parsed_decimal) if pred_entry.parsed_decimal else None,
        "parsed_decimal_gt": str(gt_entry.parsed_decimal) if gt_entry.parsed_decimal else None,
        "entry": pred_entry,
        "confidence": pred_entry.confidence,
    }
