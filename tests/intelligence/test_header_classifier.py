"""
Tests for Column Header Classifier (Phase 4 Step 4 Wave 3).
Validates multi-lingual classification, fuzzy Levenshtein typo recovery,
threshold margin gating, and table-level collision resolution.
"""
import pytest

from src.intelligence.header_classifier import (
    ColumnHeaderClassifier,
    ColumnRole,
    HeaderClassificationResult,
    HeaderClassifierConfig,
)


def test_header_classifier_english_standard():
    """Classifies standard English invoice headers with high confidence."""
    classifier = ColumnHeaderClassifier()

    assert classifier.classify_single_header("Item").role == ColumnRole.LINE_NUMBER
    assert classifier.classify_single_header("Description").role == ColumnRole.DESCRIPTION
    assert classifier.classify_single_header("Qty").role == ColumnRole.QUANTITY
    assert classifier.classify_single_header("Quantity").role == ColumnRole.QUANTITY
    assert classifier.classify_single_header("Unit Price").role == ColumnRole.UNIT_PRICE
    assert classifier.classify_single_header("Amount").role == ColumnRole.LINE_TOTAL
    assert classifier.classify_single_header("Total").role == ColumnRole.LINE_TOTAL
    assert classifier.classify_single_header("Tax Rate").role == ColumnRole.TAX_RATE
    assert classifier.classify_single_header("Tax Amount").role == ColumnRole.TAX_AMOUNT
    assert classifier.classify_single_header("Discount").role == ColumnRole.DISCOUNT


def test_header_classifier_multilingual():
    """Classifies German and French commercial headers."""
    classifier = ColumnHeaderClassifier()

    # German (DIN 5008)
    assert classifier.classify_single_header("Pos").role == ColumnRole.LINE_NUMBER
    assert classifier.classify_single_header("Bezeichnung").role == ColumnRole.DESCRIPTION
    assert classifier.classify_single_header("Menge").role == ColumnRole.QUANTITY
    assert classifier.classify_single_header("Einzelpreis").role == ColumnRole.UNIT_PRICE
    assert classifier.classify_single_header("Gesamtpreis").role == ColumnRole.LINE_TOTAL
    assert classifier.classify_single_header("MwSt %").role == ColumnRole.TAX_RATE

    # French
    assert classifier.classify_single_header("N°").role == ColumnRole.LINE_NUMBER
    assert classifier.classify_single_header("Désignation").role == ColumnRole.DESCRIPTION
    assert classifier.classify_single_header("Quantité").role == ColumnRole.QUANTITY
    assert classifier.classify_single_header("Prix unitaire").role == ColumnRole.UNIT_PRICE
    assert classifier.classify_single_header("Montant").role == ColumnRole.LINE_TOTAL


def test_header_classifier_fuzzy_ocr_typos():
    """Recovers noisy OCR typo headers via normalized Levenshtein similarity."""
    classifier = ColumnHeaderClassifier()

    # Typo: 'Descriplion' (p instead of t)
    res_desc = classifier.classify_single_header("Descriplion")
    assert res_desc.role == ColumnRole.DESCRIPTION
    assert res_desc.match_source == "FUZZY_LEVENSHTEIN"

    # Typo: 'Quant1ty' (digit 1 instead of i)
    res_qty = classifier.classify_single_header("Quant1ty")
    assert res_qty.role == ColumnRole.QUANTITY

    # Typo: 'Einze1preis' (digit 1 instead of l)
    res_price = classifier.classify_single_header("Einze1preis")
    assert res_price.role == ColumnRole.UNIT_PRICE


def test_header_classifier_threshold_rejection():
    """Unrecognized or low-confidence headers are safely rejected to UNKNOWN."""
    classifier = ColumnHeaderClassifier(HeaderClassifierConfig(primary_threshold=0.75))

    res_empty = classifier.classify_single_header("")
    assert res_empty.role == ColumnRole.UNKNOWN

    res_gibberish = classifier.classify_single_header("Random Unrelated Text Column XYZ")
    assert res_gibberish.role == ColumnRole.UNKNOWN


def test_header_classifier_zero_collision_resolution():
    """
    Collision Resolution Gate:
    If a table header contains multiple columns that map to the same unique financial role,
    the winner with higher confidence retains the role, and the duplicate is safely demoted.
    """
    classifier = ColumnHeaderClassifier()

    # Two columns that both could look like total/amount:
    # Col 3: 'Line Total' (high confidence line total)
    # Col 4: 'Total' (lower specificity)
    raw_headers = ["Item", "Description", "Qty", "Line Total", "Total"]
    results = classifier.classify_header_row(raw_headers)

    assigned_roles = [r.role for r in results if r.role != ColumnRole.UNKNOWN]
    # Invariant: No duplicate roles!
    assert len(assigned_roles) == len(set(assigned_roles))
    assert results[3].role == ColumnRole.LINE_TOTAL
    assert results[4].role != ColumnRole.LINE_TOTAL  # Demoted to avoid collision
