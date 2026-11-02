"""
Comprehensive Tests for Safe Financial Normalization Engine.
Verifies locale handling, thousand/decimal separators, negative conventions,
provenance preservation, and strict abstention boundaries.
"""
from decimal import Decimal
import pytest

from src.intelligence.financial_normalizer import (
    parse_monetary_entry,
    evaluate_field_with_safe_abstention,
    ValidationStatus,
    MonetaryEntry,
)


def test_standard_us_monetary_format():
    """Verify en_US currency format parsing with comma thousands and period decimal."""
    raw = "$1,234.56 USD"
    entry = parse_monetary_entry(raw)
    assert entry.raw_text == raw
    assert entry.validation_status == ValidationStatus.VALID
    assert entry.parsed_decimal == Decimal("1234.56")
    assert entry.currency_symbol == "$"
    assert entry.currency_code == "USD"
    assert entry.locale_interpretation == "en_US"
    assert entry.is_negative is False


def test_european_monetary_format():
    """Verify European de_DE format with period thousands and comma decimal."""
    raw = "1.234,56 €"
    entry = parse_monetary_entry(raw)
    assert entry.raw_text == raw
    assert entry.validation_status == ValidationStatus.VALID
    assert entry.parsed_decimal == Decimal("1234.56")
    assert entry.currency_symbol == "€"
    assert entry.currency_code == "EUR"
    assert entry.locale_interpretation == "de_DE"


def test_french_space_separated_format():
    """Verify French/ISO space-separated thousand format."""
    raw = "12 450,00 EUR"
    entry = parse_monetary_entry(raw)
    assert entry.validation_status == ValidationStatus.VALID
    assert entry.parsed_decimal == Decimal("12450.00")
    assert entry.currency_code == "EUR"


def test_accounting_negative_parentheses():
    """Verify accounting parentheses format indicates negative value."""
    raw = "($1,420.00)"
    entry = parse_monetary_entry(raw)
    assert entry.validation_status == ValidationStatus.VALID
    assert entry.is_negative is True
    assert entry.parsed_decimal == Decimal("-1420.00")


def test_accounting_credit_debit():
    """Verify explicit CR and DR indicators."""
    cr_entry = parse_monetary_entry("88,400.00 GBP CR")
    assert cr_entry.validation_status == ValidationStatus.VALID
    assert cr_entry.is_credit is True
    assert cr_entry.is_negative is False
    assert cr_entry.parsed_decimal == Decimal("88400.00")

    dr_entry = parse_monetary_entry("1,850.00 GBP DR")
    assert dr_entry.validation_status == ValidationStatus.VALID
    assert dr_entry.is_debit is True
    assert dr_entry.is_negative is True
    assert dr_entry.parsed_decimal == Decimal("-1850.00")


def test_trailing_minus_negative():
    """Verify trailing minus format."""
    entry = parse_monetary_entry("500.00- USD")
    assert entry.validation_status == ValidationStatus.VALID
    assert entry.is_negative is True
    assert entry.parsed_decimal == Decimal("-500.00")


def test_malformed_trocr_digit_grouping_abstains():
    """
    Verify that an OCR output with malformed digit grouping (e.g. $11,22000)
    is strictly abstained (AMBIGUOUS) rather than silently modified.
    """
    raw = "$11,22000 USD"
    entry = parse_monetary_entry(raw)
    assert entry.raw_text == raw
    assert entry.validation_status == ValidationStatus.AMBIGUOUS
    assert entry.parsed_decimal is None
    assert "Malformed thousand separator" in entry.rejection_reason or "Ambiguous comma separator" in entry.rejection_reason


def test_repeated_zeros_abstains():
    """Verify repeated hallucinated zeros (e.g. $16,500000) triggers abstention."""
    raw = "$16,500000 USD"
    entry = parse_monetary_entry(raw)
    assert entry.validation_status in (ValidationStatus.AMBIGUOUS, ValidationStatus.NEEDS_REVIEW)
    assert entry.parsed_decimal is None


def test_empty_or_non_numeric_invalid():
    """Verify empty or non-numeric inputs are flagged INVALID."""
    empty_entry = parse_monetary_entry("")
    assert empty_entry.validation_status == ValidationStatus.INVALID

    alpha_entry = parse_monetary_entry("No charge on invoice")
    assert alpha_entry.validation_status == ValidationStatus.INVALID


def test_safe_abstention_evaluation():
    """Verify evaluate_field_with_safe_abstention routes correctly."""
    # Successful match
    res_ok = evaluate_field_with_safe_abstention(
        raw_ocr_field_text="Total Due: $1,420.00 USD",
        ground_truth_field_text="$1,420.00",
        is_monetary_field=True,
    )
    assert res_ok["accepted"] is True
    assert res_ok["exact_match"] is True

    # Ambiguous OCR output triggers abstention
    res_ambiguous = evaluate_field_with_safe_abstention(
        raw_ocr_field_text="Total Due: $11,22000 USD",
        ground_truth_field_text="$11,220.00",
        is_monetary_field=True,
    )
    assert res_ambiguous["accepted"] is False
    assert res_ambiguous["exact_match"] is False
    assert res_ambiguous["status"] == ValidationStatus.AMBIGUOUS


def test_adversarial_missing_decimal_points():
    """Verify that dropped decimal points (e.g. $11,22000, 60480, 2.08250) are safely abstained."""
    entry_1 = parse_monetary_entry("$11,22000")
    assert entry_1.validation_status == ValidationStatus.AMBIGUOUS
    assert entry_1.parsed_decimal is None

    entry_2 = parse_monetary_entry("60480")
    assert entry_2.validation_status == ValidationStatus.AMBIGUOUS
    assert entry_2.parsed_decimal is None

    entry_3 = parse_monetary_entry("2.08250")
    assert entry_3.validation_status == ValidationStatus.NEEDS_REVIEW
    assert entry_3.parsed_decimal is None


def test_adversarial_hallucinatory_stamp_zeros():
    """Verify that extra zeros hallucinated under physical stamps/seals trigger abstention."""
    entry_1 = parse_monetary_entry("$16,500000")
    assert entry_1.validation_status == ValidationStatus.AMBIGUOUS
    assert entry_1.parsed_decimal is None

    entry_2 = parse_monetary_entry("$10,000000")
    assert entry_2.validation_status == ValidationStatus.AMBIGUOUS
    assert entry_2.parsed_decimal is None


def test_adversarial_ambiguous_separators():
    """Verify that ambiguous or illegal separators (slashes, multi-periods, non-standard groups) abstain."""
    entry_slash = parse_monetary_entry("$ 10/00000")
    assert entry_slash.validation_status == ValidationStatus.AMBIGUOUS
    assert "slash separator" in entry_slash.rejection_reason

    entry_multi_dot = parse_monetary_entry("75.00.00")
    assert entry_multi_dot.validation_status == ValidationStatus.AMBIGUOUS
    assert "Multiple periods" in entry_multi_dot.rejection_reason

    entry_lakhs = parse_monetary_entry("12,34,567")
    assert entry_lakhs.validation_status == ValidationStatus.AMBIGUOUS


def test_adversarial_incorrect_and_conflicting_currencies():
    """Verify that corrupted currency codes and conflicting symbols trigger rejection/review."""
    entry_unknown = parse_monetary_entry("205.00 OSD")
    assert entry_unknown.validation_status == ValidationStatus.NEEDS_REVIEW
    assert "Unrecognized or corrupted currency code 'OSD'" in entry_unknown.rejection_reason

    entry_conflict_code = parse_monetary_entry("$100 EUR")
    assert entry_conflict_code.validation_status == ValidationStatus.AMBIGUOUS
    assert "Conflicting currency symbol" in entry_conflict_code.rejection_reason

    entry_conflict_symbols = parse_monetary_entry("$100 €")
    assert entry_conflict_symbols.validation_status == ValidationStatus.AMBIGUOUS
    assert "Multiple conflicting currency symbols" in entry_conflict_symbols.rejection_reason


def test_adversarial_debit_credit_conventions():
    """Verify standard accounting debit, credit, negative signs, and non-monetary rate protection."""
    entry_cr = parse_monetary_entry("CR 1,420.50")
    assert entry_cr.validation_status == ValidationStatus.VALID
    assert entry_cr.is_credit is True
    assert entry_cr.is_negative is False
    assert entry_cr.parsed_decimal == Decimal("1420.50")

    entry_dr = parse_monetary_entry("DR 1,420.50")
    assert entry_dr.validation_status == ValidationStatus.VALID
    assert entry_dr.is_debit is True
    assert entry_dr.is_negative is True
    assert entry_dr.parsed_decimal == Decimal("-1420.50")

    entry_parens = parse_monetary_entry("(1,420.50)")
    assert entry_parens.validation_status == ValidationStatus.VALID
    assert entry_parens.is_negative is True
    assert entry_parens.parsed_decimal == Decimal("-1420.50")

    entry_trailing = parse_monetary_entry("450.00-")
    assert entry_trailing.validation_status == ValidationStatus.VALID
    assert entry_trailing.is_negative is True
    assert entry_trailing.parsed_decimal == Decimal("-450.00")

    entry_plus = parse_monetary_entry("+$100")
    assert entry_plus.validation_status == ValidationStatus.VALID
    assert entry_plus.is_negative is False
    assert entry_plus.parsed_decimal == Decimal("100.00")

    entry_rate_parens = parse_monetary_entry("Interest Rate (8.25%) Total $100.00")
    assert entry_rate_parens.validation_status == ValidationStatus.VALID
    assert entry_rate_parens.is_negative is False
    assert entry_rate_parens.parsed_decimal == Decimal("100.00")


def test_ground_truth_isolation():
    """
    Formally prove that parse_monetary_entry operates completely decoupled from ground truth.
    Verify signature does not accept ground truth parameters and decision logic is purely intrinsic.
    """
    import inspect
    sig = inspect.signature(parse_monetary_entry)
    param_names = list(sig.parameters.keys())
    assert "ground_truth" not in param_names
    assert "gt" not in param_names
    assert param_names == ["raw_text", "default_currency", "default_locale", "source_confidence", "monetary_span_confidence", "evidence_span"]

    # Output remains identical regardless of any hypothetical external reference
    entry1 = parse_monetary_entry("$1,420.00")
    entry2 = parse_monetary_entry("$1,420.00")
    assert entry1.parsed_decimal == entry2.parsed_decimal == Decimal("1420.00")
    assert entry1.validation_status == entry2.validation_status == ValidationStatus.VALID


def test_field_aware_confidence_prevents_compensation_from_surrounding_text():
    """
    Verify that high-confidence surrounding sentence context CANNOT compensate
    for an unreliable or low-confidence monetary token.
    """
    line_text = "Thank you for your business. Total amount due: $1,420.00 Have a great day!"
    
    # High surrounding line confidence (0.99) with low monetary span confidence (0.55)
    entry = parse_monetary_entry(
        raw_text=line_text,
        source_confidence=0.9900,
        monetary_span_confidence=0.5500,
    )
    
    assert entry.full_line_ocr_confidence == 0.9900
    assert entry.monetary_span_confidence == 0.5500
    assert entry.parsed_candidate_confidence == 1.0000
    assert entry.combined_acceptance_confidence == 0.5500
    assert entry.confidence == 0.5500
    
    # Safe abstention under threshold tau = 0.75 must reject automatic acceptance
    eval_res = evaluate_field_with_safe_abstention(
        raw_ocr_field_text=line_text,
        ground_truth_field_text="$1,420.00",
        is_monetary_field=True,
        source_confidence=0.9900,
        monetary_span_confidence=0.5500,
        acceptance_threshold=0.75,
    )
    
    assert eval_res["accepted"] is False
    assert "below threshold 0.75" in eval_res["rejection_reason"]
