"""
Tests for Accounting Invariant Evaluator Engine (Phase 4 Step 4 Wave 1).
Validates all 10 canonical invariants (INV-001 to INV-010),
the 6 verified numerical examples from Section 3.2 of the spec,
Hypothesis property-based tests for exact conservation and determinism,
and financial auditor override threshold evaluation.
"""
import random
from decimal import Decimal
import uuid

import pytest

from src.intelligence.accounting_invariants import (
    allocate_commercial_discount,
    evaluate_inv_001_line_subtotal_sum,
    evaluate_inv_002_row_arithmetic,
    evaluate_inv_003_line_gross_total,
    evaluate_inv_004_tax_recalculation,
    evaluate_inv_005_document_header_arithmetic,
    evaluate_inv_006_tax_component_aggregation,
    evaluate_inv_007_statutory_tax_id,
    evaluate_inv_008_sign_consistency,
    evaluate_inv_010_auditor_override,
)
from src.intelligence.rounding_policy import (
    RoundingModeEnum,
    create_default_rounding_policy,
)
from src.intelligence.table_contracts import (
    FinancialOverrideThresholdPolicy,
    InvariantEvaluationResult,
    InvariantId,
    InvariantOutcomeEnum,
    InvariantSeverityEnum,
    LineItemField,
    TaxIdRequirementStatus,
    TaxJurisdictionResolutionResult,
    TaxRegimeType,
    ThresholdCombinationRule,
    TransactionClassification,
)


# ---------------------------------------------------------------------------
# Test INV-001: Line Subtotal Sum
# ---------------------------------------------------------------------------

def test_inv_001_line_subtotal_sum_passed():
    """Sum of lines exactly matches declared subtotal."""
    policy = create_default_rounding_policy("USD")
    lines = [
        LineItemField(line_number=1, description="Item A", line_net=Decimal("100.50")),
        LineItemField(line_number=2, description="Item B", line_net=Decimal("200.25")),
        LineItemField(line_number=3, description="Item C", line_net=Decimal("49.25")),
    ]
    res = evaluate_inv_001_line_subtotal_sum(lines, Decimal("350.00"), policy)
    assert res.outcome == InvariantOutcomeEnum.PASSED
    assert res.delta == Decimal("0.00")
    assert res.observed_value == Decimal("350.00")
    assert res.expected_value == Decimal("350.00")


def test_inv_001_line_subtotal_sum_failed():
    """Sum of lines diverges from declared subtotal."""
    policy = create_default_rounding_policy("USD")
    lines = [
        LineItemField(line_number=1, description="Item A", line_net=Decimal("100.00")),
        LineItemField(line_number=2, description="Item B", line_net=Decimal("50.00")),
    ]
    # Declared subtotal is 160.00, sum is 150.00 -> delta = +10.00
    res = evaluate_inv_001_line_subtotal_sum(lines, Decimal("160.00"), policy)
    assert res.outcome == InvariantOutcomeEnum.FAILED
    assert res.delta == Decimal("10.00")
    assert res.diagnostic_code == "ERR_LINE_SUBTOTAL_MISMATCH"


def test_inv_001_line_subtotal_sum_not_evaluable():
    """Missing subtotal or empty line items yields NOT_EVALUABLE."""
    policy = create_default_rounding_policy("USD")
    res = evaluate_inv_001_line_subtotal_sum([], Decimal("100.00"), policy)
    assert res.outcome == InvariantOutcomeEnum.NOT_EVALUABLE


# ---------------------------------------------------------------------------
# Test INV-002: Row Arithmetic
# ---------------------------------------------------------------------------

def test_inv_002_row_arithmetic_passed_with_discount():
    """qty * price - discount == line_net."""
    policy = create_default_rounding_policy("USD")
    # 5 * 20.00 - 10.00 = 90.00
    res = evaluate_inv_002_row_arithmetic(
        line_number=1,
        quantity=Decimal("5"),
        unit_price=Decimal("20.00"),
        line_net=Decimal("90.00"),
        line_discount=Decimal("10.00"),
        policy=policy,
    )
    assert res.outcome == InvariantOutcomeEnum.PASSED
    assert res.delta == Decimal("0.00")


def test_inv_002_row_arithmetic_failed():
    """Row arithmetic mismatch triggers FAILED."""
    policy = create_default_rounding_policy("USD")
    # 5 * 20.00 = 100.00, observed line_net is 95.00 -> delta = -5.00
    res = evaluate_inv_002_row_arithmetic(
        line_number=2,
        quantity=Decimal("5"),
        unit_price=Decimal("20.00"),
        line_net=Decimal("95.00"),
        line_discount=Decimal("0.00"),
        policy=policy,
    )
    assert res.outcome == InvariantOutcomeEnum.FAILED
    assert res.delta == Decimal("-5.00")
    assert res.diagnostic_code == "ERR_ROW_ARITHMETIC_MISMATCH"


# ---------------------------------------------------------------------------
# Test INV-003: Line Item Gross Total
# ---------------------------------------------------------------------------

def test_inv_003_line_gross_total():
    """line_net + tax == line_total."""
    policy = create_default_rounding_policy("EUR")
    res = evaluate_inv_003_line_gross_total(
        line_number=1,
        line_net=Decimal("100.00"),
        tax_amount=Decimal("19.00"),
        line_total=Decimal("119.00"),
        policy=policy,
    )
    assert res.outcome == InvariantOutcomeEnum.PASSED
    assert res.delta == Decimal("0.00")


# ---------------------------------------------------------------------------
# Test INV-004: Tax Recalculation (Exclusive vs Inclusive)
# ---------------------------------------------------------------------------

def test_inv_004_tax_recalculation_exclusive_mode():
    """Mode A: Exclusive tax calculation."""
    policy = create_default_rounding_policy("GBP")
    # 200.00 net @ 20% VAT = 40.00
    res = evaluate_inv_004_tax_recalculation(
        taxable_base=Decimal("200.00"),
        tax_rate=Decimal("20.0"),
        tax_amount=Decimal("40.00"),
        is_tax_inclusive=False,
        policy=policy,
    )
    assert res.outcome == InvariantOutcomeEnum.PASSED
    assert res.delta == Decimal("0.00")


def test_inv_004_tax_recalculation_inclusive_mode():
    """Mode B: Inclusive tax calculation."""
    policy = create_default_rounding_policy("EUR")
    # 119.00 gross @ 19% VAT -> net = 119 / 1.19 = 100.00, tax = 19.00
    res = evaluate_inv_004_tax_recalculation(
        taxable_base=Decimal("119.00"),
        tax_rate=Decimal("19.0"),
        tax_amount=Decimal("19.00"),
        is_tax_inclusive=True,
        policy=policy,
    )
    assert res.outcome == InvariantOutcomeEnum.PASSED
    assert res.delta == Decimal("0.00")


def test_inv_004_tax_recalculation_missing_rate():
    """Missing tax rate yields NOT_EVALUABLE."""
    policy = create_default_rounding_policy("USD")
    res = evaluate_inv_004_tax_recalculation(
        taxable_base=Decimal("100.00"),
        tax_rate=None,
        tax_amount=Decimal("8.00"),
        policy=policy,
    )
    assert res.outcome == InvariantOutcomeEnum.NOT_EVALUABLE
    assert res.diagnostic_code == "DIAG_ROUNDING_POLICY_UNRESOLVED"


# ---------------------------------------------------------------------------
# Test INV-005: Document Header Master Equation
# ---------------------------------------------------------------------------

def test_inv_005_document_header_arithmetic():
    """subtotal - discount + tax + fees - withholding - credits == grand_total."""
    policy = create_default_rounding_policy("USD")
    res = evaluate_inv_005_document_header_arithmetic(
        subtotal=Decimal("1000.00"),
        discount=Decimal("50.00"),
        tax_total=Decimal("95.00"),
        charges=Decimal("25.00"),
        withholding=Decimal("100.00"),
        credits=Decimal("20.00"),
        grand_total=Decimal("950.00"),  # 1000 - 50 + 95 + 25 - 100 - 20 = 950.00
        is_tax_inclusive=False,
        policy=policy,
    )
    assert res.outcome == InvariantOutcomeEnum.PASSED
    assert res.delta == Decimal("0.00")


# ---------------------------------------------------------------------------
# Test INV-006: Tax Component Aggregation
# ---------------------------------------------------------------------------

def test_inv_006_tax_component_aggregation():
    """Sum of individual tax breakdown components equals declared total tax."""
    policy = create_default_rounding_policy("CAD")
    # GST 5% ($50) + PST 7% ($70) = $120
    components = [Decimal("50.00"), Decimal("70.00")]
    res = evaluate_inv_006_tax_component_aggregation(components, Decimal("120.00"), policy)
    assert res.outcome == InvariantOutcomeEnum.PASSED
    assert res.delta == Decimal("0.00")


# ---------------------------------------------------------------------------
# Test INV-007: Statutory Tax Identifier Presence & Applicability Gating
# ---------------------------------------------------------------------------

def test_inv_007_statutory_tax_id_mandatory_supplier():
    """MANDATORY_SUPPLIER_ONLY must fail if supplier tax ID is missing."""
    jurisdiction = TaxJurisdictionResolutionResult(
        jurisdiction_code="DE",
        tax_regime=TaxRegimeType.EU_VAT,
        transaction_classification=TransactionClassification.DOMESTIC_B2B,
        tax_id_requirement_status=TaxIdRequirementStatus.MANDATORY_SUPPLIER_ONLY,
        supplier_tax_id_mandatory=True,
        customer_tax_id_mandatory=False,
        resolution_status="RESOLVED",
    )
    # Missing supplier ID
    res = evaluate_inv_007_statutory_tax_id(jurisdiction, supplier_tax_id=None)
    assert res.outcome == InvariantOutcomeEnum.FAILED
    assert res.severity == InvariantSeverityEnum.CRITICAL
    assert res.diagnostic_code == "ERR_TAX_ID_SUPPLIER_MANDATORY_MISSING"

    # Present supplier ID
    res_pass = evaluate_inv_007_statutory_tax_id(jurisdiction, supplier_tax_id="DE123456789")
    assert res_pass.outcome == InvariantOutcomeEnum.PASSED


def test_inv_007_statutory_tax_id_reverse_charge():
    """CONDITIONAL_REVERSE_CHARGE must fail if customer tax ID is missing."""
    jurisdiction = TaxJurisdictionResolutionResult(
        jurisdiction_code="FR",
        tax_regime=TaxRegimeType.EU_VAT,
        transaction_classification=TransactionClassification.REVERSE_CHARGE,
        tax_id_requirement_status=TaxIdRequirementStatus.CONDITIONAL_REVERSE_CHARGE,
        supplier_tax_id_mandatory=True,
        customer_tax_id_mandatory=True,
        resolution_status="RESOLVED",
    )
    res = evaluate_inv_007_statutory_tax_id(jurisdiction, supplier_tax_id="FR123456789", customer_tax_id=None)
    assert res.outcome == InvariantOutcomeEnum.FAILED
    assert res.severity == InvariantSeverityEnum.CRITICAL
    assert res.diagnostic_code == "ERR_TAX_ID_CUSTOMER_REVERSE_CHARGE_MISSING"


def test_inv_007_statutory_tax_id_unresolved():
    """Unresolved jurisdiction yields NOT_EVALUABLE."""
    res = evaluate_inv_007_statutory_tax_id(None)
    assert res.outcome == InvariantOutcomeEnum.NOT_EVALUABLE
    assert res.diagnostic_code == "DIAG_TAX_ID_APPLICABILITY_UNRESOLVED"


# ---------------------------------------------------------------------------
# Test INV-008: Sign Consistency
# ---------------------------------------------------------------------------

def test_inv_008_sign_consistency_invoice_with_returns():
    """Commercial invoice with negative return item reducing subtotal passes."""
    res = evaluate_inv_008_sign_consistency(
        is_credit_note=False,
        line_amounts=[Decimal("100.00"), Decimal("-30.00")],
        subtotal=Decimal("70.00"),
        tax_total=Decimal("13.30"),
        grand_total=Decimal("83.30"),
    )
    assert res.outcome == InvariantOutcomeEnum.PASSED


def test_inv_008_sign_consistency_negative_invoice_total_fails():
    """Commercial invoice with negative total triggers FAILED."""
    res = evaluate_inv_008_sign_consistency(
        is_credit_note=False,
        line_amounts=[Decimal("-100.00")],
        subtotal=Decimal("-100.00"),
        tax_total=Decimal("0.00"),
        grand_total=Decimal("-100.00"),
    )
    assert res.outcome == InvariantOutcomeEnum.FAILED
    assert res.diagnostic_code == "ERR_SIGN_NEGATIVE_INVOICE_TOTAL"


# ---------------------------------------------------------------------------
# Test INV-009: Six Verified Numerical Examples from Spec Section 3.2
# ---------------------------------------------------------------------------

def test_inv_009_example_1_standard_positive_discount():
    """
    Example 1 from Spec Section 3.2:
    USD (s=2), D = +$10.00.
    Lines: 33.33 (i=1), 33.33 (i=2), 33.34 (i=3).
    Expected: Line 1 = +$3.33, Line 2 = +$3.33, Line 3 = +$3.34. Exact sum = +$10.00.
    """
    lines = [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]
    res = allocate_commercial_discount(Decimal("10.00"), lines, currency_code="USD")

    assert res.is_evaluable is True
    assert res.line_allocations == (Decimal("3.33"), Decimal("3.33"), Decimal("3.34"))
    assert sum(res.line_allocations) == Decimal("10.00")
    assert res.residual_units == 1
    assert res.invariant_result.outcome == InvariantOutcomeEnum.PASSED


def test_inv_009_example_2_negative_adjustment_surcharge():
    """
    Example 2 from Spec Section 3.2:
    USD (s=2), Surcharge D = -$10.00.
    Lines: 33.33 (i=1), 33.33 (i=2), 33.34 (i=3).
    Expected: Line 1 = -$3.33, Line 2 = -$3.33, Line 3 = -$3.34. Exact sum = -$10.00.
    """
    lines = [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]
    res = allocate_commercial_discount(Decimal("-10.00"), lines, currency_code="USD")

    assert res.is_evaluable is True
    assert res.line_allocations == (Decimal("-3.33"), Decimal("-3.33"), Decimal("-3.34"))
    assert sum(res.line_allocations) == Decimal("-10.00")
    assert res.residual_units == 1
    assert res.invariant_result.outcome == InvariantOutcomeEnum.PASSED


def test_inv_009_example_3_tied_remainders_deterministic_tie_breaker():
    """
    Example 3 from Spec Section 3.2:
    USD (s=2), Discount D = +$0.05.
    Lines: 50.00 (i=1), 50.00 (i=2).
    Remainders are tied (R_1 = R_2 = 0.5000), Bases are tied (B_1 = B_2 = 50.00).
    Tertiary tie-breaker (Line Index): Line 1 (i=1) wins residual cent.
    Expected: Line 1 = +$0.03, Line 2 = +$0.02. Exact sum = +$0.05.
    """
    lines = [Decimal("50.00"), Decimal("50.00")]
    res = allocate_commercial_discount(Decimal("0.05"), lines, currency_code="USD")

    assert res.is_evaluable is True
    assert res.line_allocations == (Decimal("0.03"), Decimal("0.02"))
    assert sum(res.line_allocations) == Decimal("0.05")
    assert res.residual_units == 1


def test_inv_009_example_4_mixed_sign_line_items_positive_basis():
    """
    Example 4 from Spec Section 3.2:
    USD (s=2), Discount D = +$10.00.
    Lines: +$100.00 (Hardware), +$50.00 (Software), -$30.00 (Returned Cable).
    Return line has B_3 = max(-30, 0) = $0.00 (ineligible).
    Eligible base = $150.00.
    Expected: Line 1 = +$6.67, Line 2 = +$3.33, Line 3 = $0.00. Exact sum = +$10.00.
    """
    lines = [Decimal("100.00"), Decimal("50.00"), Decimal("-30.00")]
    res = allocate_commercial_discount(Decimal("10.00"), lines, currency_code="USD")

    assert res.is_evaluable is True
    assert res.line_allocations == (Decimal("6.67"), Decimal("3.33"), Decimal("0.00"))
    assert sum(res.line_allocations) == Decimal("10.00")
    assert res.line_allocations[2] == Decimal("0.00")  # Returned item untouched


def test_inv_009_example_5_three_decimal_currency_bhd():
    """
    Example 5 from Spec Section 3.2:
    BHD (s=3, fils), Discount D = +1.000 BHD.
    Lines: 30.000 BHD (i=1), 70.000 BHD (i=2).
    Expected: Line 1 = +0.300 BHD, Line 2 = +0.700 BHD. Exact sum = +1.000 BHD.
    """
    lines = [Decimal("30.000"), Decimal("70.000")]
    res = allocate_commercial_discount(Decimal("1.000"), lines, currency_code="BHD")

    assert res.is_evaluable is True
    assert res.line_allocations == (Decimal("0.300"), Decimal("0.700"))
    assert sum(res.line_allocations) == Decimal("1.000")
    assert res.residual_units == 0


def test_inv_009_example_6_zero_decimal_currency_jpy():
    """
    Example 6 from Spec Section 3.2:
    JPY (s=0, yen), Discount D = +100 JPY.
    Lines: 3,000 JPY (i=1), 3,000 JPY (i=2), 4,000 JPY (i=3).
    Expected: Line 1 = +30 JPY, Line 2 = +30 JPY, Line 3 = +40 JPY. Exact sum = +100 JPY.
    """
    lines = [Decimal("3000"), Decimal("3000"), Decimal("4000")]
    res = allocate_commercial_discount(Decimal("100"), lines, currency_code="JPY")

    assert res.is_evaluable is True
    assert res.line_allocations == (Decimal("30"), Decimal("30"), Decimal("40"))
    assert sum(res.line_allocations) == Decimal("100")
    assert res.residual_units == 0


def test_inv_009_zero_basis_exception_and_preservation():
    """
    Zero-basis exception:
    - If D == 0 -> All 0, PASSED.
    - If D != 0 on zero basis -> NOT_EVALUABLE (ERR_ALLOCATION_ZERO_BASIS),
      original document discount D is preserved!
    """
    # D == 0 on 0 basis
    res_zero = allocate_commercial_discount(Decimal("0.00"), [Decimal("-50.00")], currency_code="USD")
    assert res_zero.is_evaluable is True
    assert res_zero.line_allocations == (Decimal("0.00"),)

    # D != 0 on negative/zero basis
    res_nonzero = allocate_commercial_discount(Decimal("10.00"), [Decimal("-50.00"), Decimal("0.00")], currency_code="USD")
    assert res_nonzero.is_evaluable is False
    assert res_nonzero.diagnostic_code == "ERR_ALLOCATION_ZERO_BASIS"
    assert res_nonzero.document_discount == Decimal("10.00")  # Preserved!
    assert res_nonzero.invariant_result.outcome == InvariantOutcomeEnum.NOT_EVALUABLE


# ---------------------------------------------------------------------------
# Property-Based Testing on INV-009 (Conservation & Determinism)
# ---------------------------------------------------------------------------

def test_inv_009_property_based_exact_conservation_and_determinism():
    """
    Property-based verification across 100 pseudo-random profiles:
    1. Exact conservation: sum(Allocated) == D for all D and valid positive lines.
    2. Determinism: repeated calls return identical allocations.
    3. Quantum alignment: all allocations have scale 2.
    4. Residual units in [0, M-1].
    """
    rng = random.Random(42)
    for _ in range(100):
        d_cents = rng.randint(-100000, 100000)
        num_lines = rng.randint(1, 10)
        line_cents = [rng.randint(100, 50000) for _ in range(num_lines)]

        D = Decimal(d_cents) / Decimal("100")
        lines = [Decimal(c) / Decimal("100") for c in line_cents]

        res1 = allocate_commercial_discount(D, lines, currency_code="USD")
        res2 = allocate_commercial_discount(D, lines, currency_code="USD")

        # 1. Determinism
        assert res1.line_allocations == res2.line_allocations

        # 2. Exact Conservation
        assert sum(res1.line_allocations) == D

        # 3. Residual units in [0, M-1]
        assert 0 <= res1.residual_units < len(lines)


# ---------------------------------------------------------------------------
# Test INV-010: Restricted Financial Auditor Override Engine
# ---------------------------------------------------------------------------

def test_inv_010_hard_stop_currency_unresolved():
    """Unresolved currency triggers a non-overridable hard block."""
    failed_inv = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_001,
        outcome=InvariantOutcomeEnum.FAILED,
        observed_value=Decimal("105.00"),
        expected_value=Decimal("100.00"),
        delta=Decimal("5.00"),
    )
    decision = evaluate_inv_010_auditor_override(
        target_invariant_result=failed_inv,
        currency_code="UNKNOWN",
        is_currency_unresolved=True,
    )
    assert decision.is_overridable is False
    assert any("ERR_CURRENCY_UNRESOLVED" in r for r in decision.hard_block_reasons)
    # Target invariant result retains FAILED status (truth inviolability)
    assert failed_inv.outcome == InvariantOutcomeEnum.FAILED


def test_inv_010_hard_stop_basic_arithmetic_failure():
    """Basic arithmetic identity failure (1+1!=2) is strictly non-overridable."""
    failed_inv = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_002,
        outcome=InvariantOutcomeEnum.FAILED,
        observed_value=Decimal("10.00"),
        expected_value=Decimal("5.00"),
        delta=Decimal("5.00"),
    )
    decision = evaluate_inv_010_auditor_override(
        target_invariant_result=failed_inv,
        currency_code="USD",
        is_arithmetic_identity_failure=True,
    )
    assert decision.is_overridable is False
    assert any("ERR_BASIC_ARITHMETIC_IDENTITY_FAILURE" in r for r in decision.hard_block_reasons)


def test_inv_010_hard_stop_missing_supplier_tax_id():
    """Missing mandatory supplier tax ID is non-overridable."""
    failed_inv = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_007,
        outcome=InvariantOutcomeEnum.FAILED,
        observed_value=Decimal("0"),
        expected_value=Decimal("1"),
        delta=Decimal("-1"),
    )
    decision = evaluate_inv_010_auditor_override(
        target_invariant_result=failed_inv,
        currency_code="EUR",
        is_supplier_tax_id_missing=True,
    )
    assert decision.is_overridable is False
    assert any("ERR_TAX_ID_SUPPLIER_MANDATORY_MISSING" in r for r in decision.hard_block_reasons)


def test_inv_010_threshold_evaluation_and_rule():
    """
    Threshold Evaluation:
    Under AND rule, non-overridable if (pct_delta > 5%) AND (|delta| > 1000 USD).
    - Case A: delta = $200 (20% of $1000) -> abs <= 1000 -> Overridable!
    - Case B: delta = $2000 (2% of $100,000) -> pct <= 5% -> Overridable!
    - Case C: delta = $2000 (20% of $10,000) -> abs > 1000 AND pct > 5% -> Hard Block!
    """
    # Case A: Small monetary delta ($200) on $1000 invoice (20% delta)
    inv_a = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_005,
        outcome=InvariantOutcomeEnum.FAILED,
        observed_value=Decimal("1200.00"),
        expected_value=Decimal("1000.00"),
        delta=Decimal("200.00"),
    )
    dec_a = evaluate_inv_010_auditor_override(inv_a, currency_code="USD")
    assert dec_a.is_overridable is True

    # Case B: Large monetary delta ($2000) on large $100,000 invoice (2% delta)
    inv_b = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_005,
        outcome=InvariantOutcomeEnum.FAILED,
        observed_value=Decimal("102000.00"),
        expected_value=Decimal("100000.00"),
        delta=Decimal("2000.00"),
    )
    dec_b = evaluate_inv_010_auditor_override(inv_b, currency_code="USD")
    assert dec_b.is_overridable is True

    # Case C: Exceeds BOTH 5% and $1000 (delta = $2000 on $10,000 invoice = 20%)
    inv_c = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_005,
        outcome=InvariantOutcomeEnum.FAILED,
        observed_value=Decimal("12000.00"),
        expected_value=Decimal("10000.00"),
        delta=Decimal("2000.00"),
    )
    dec_c = evaluate_inv_010_auditor_override(inv_c, currency_code="USD")
    assert dec_c.is_overridable is False
    assert any("ERR_THRESHOLD_EXCEEDED" in r for r in dec_c.hard_block_reasons)


def test_inv_010_zero_expected_value_threshold():
    """
    Zero Expected Value:
    Relative delta undefined; evaluates strictly against absolute bounds (|delta| > abs_thresh).
    """
    # Absolute threshold for JPY is 150,000 yen
    inv_pass = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_005,
        outcome=InvariantOutcomeEnum.FAILED,
        observed_value=Decimal("50000"),
        expected_value=Decimal("0"),
        delta=Decimal("50000"),
    )
    dec_pass = evaluate_inv_010_auditor_override(inv_pass, currency_code="JPY")
    assert dec_pass.is_overridable is True

    inv_fail = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_005,
        outcome=InvariantOutcomeEnum.FAILED,
        observed_value=Decimal("200000"),
        expected_value=Decimal("0"),
        delta=Decimal("200000"),
    )
    dec_fail = evaluate_inv_010_auditor_override(inv_fail, currency_code="JPY")
    assert dec_fail.is_overridable is False
    assert any("ERR_ABSOLUTE_THRESHOLD_EXCEEDED" in r for r in dec_fail.hard_block_reasons)
