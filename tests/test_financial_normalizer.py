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
