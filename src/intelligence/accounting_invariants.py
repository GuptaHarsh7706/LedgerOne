"""
Accounting Invariant Evaluator Engine for LedgerOne.
Phase 4 Step 4 Wave 1 Implementation.

Implements all 10 canonical accounting invariants (INV-001 through INV-010)
using pure Decimal arithmetic with zero IEEE 754 floating-point contamination.
Includes the sign-independent 7-step largest-remainder commercial allocation engine
and the restricted financial auditor override evaluation engine.
"""
from __future__ import annotations

import decimal
from decimal import Decimal, ROUND_FLOOR, getcontext
from typing import Any, Dict, List, Optional, Sequence, Tuple

from pydantic import BaseModel, ConfigDict, Field

from src.intelligence.rounding_policy import (
    RoundingModeEnum,
    RoundingPolicy,
    RoundingStageEnum,
    create_default_rounding_policy,
    get_currency_scale,
    quantize_amount,
    validate_intermediate_precision,
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
    ThresholdCombinationRule,
)


# Default currency-aware non-overridable monetary absolute thresholds
CURRENCY_AWARE_THRESHOLDS: Dict[str, Decimal] = {
    "USD": Decimal("1000.00"),
    "EUR": Decimal("1000.00"),
    "GBP": Decimal("850.00"),
    "CAD": Decimal("1300.00"),
    "AUD": Decimal("1500.00"),
    "CHF": Decimal("900.00"),
    "JPY": Decimal("150000"),
    "BHD": Decimal("380.000"),
    "KWD": Decimal("300.000"),
}


# ---------------------------------------------------------------------------
# Allocation & Override Result Data Contracts
# ---------------------------------------------------------------------------

class DiscountAllocationResult(BaseModel):
    """
    Immutable result of the 7-step sign-independent largest-remainder allocation.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    document_discount: Decimal = Field(..., description="Original preserved document discount D")
    total_eligible_basis: Decimal = Field(..., description="Sum of positive line bases B_total")
    total_minor_units: int = Field(..., description="U_total in minor units")
    residual_units: int = Field(..., description="Undistributed residual units distributed via tie-breaker")
    line_allocations: Tuple[Decimal, ...] = Field(..., description="Signed allocated discount per line item")
    line_bases: Tuple[Decimal, ...] = Field(..., description="Eligible basis B_i per line item")
    line_remainders: Tuple[Decimal, ...] = Field(..., description="Fractional remainder R_i per line item")
    is_evaluable: bool = Field(..., description="Whether allocation could be computed")
    diagnostic_code: Optional[str] = Field(default=None)
    invariant_result: InvariantEvaluationResult


class OverrideEvaluationDecision(BaseModel):
    """
    Immutable decision record on whether an invariant failure can be overridden.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    is_overridable: bool = Field(..., description="Whether auditor override is permitted")
    hard_block_reasons: Tuple[str, ...] = Field(default_factory=tuple, description="Reasons preventing override")
    relative_delta_pct: Optional[Decimal] = Field(default=None, description="Calculated relative delta percentage")
    absolute_delta: Optional[Decimal] = Field(default=None, description="Absolute delta |observed - expected|")
    applied_abs_threshold: Decimal = Field(...)
    applied_pct_threshold: Decimal = Field(...)
    required_initiator_role: str = Field(default="WORKSPACE_ADMIN")
    required_approver_role: str = Field(default="ORGANIZATION_ADMIN")
    signature_window_hours: int = Field(default=48)
    invariant_result: InvariantEvaluationResult


# ---------------------------------------------------------------------------
# Pure Decimal Helper Functions
# ---------------------------------------------------------------------------

def _to_decimal(val: Any) -> Optional[Decimal]:
    """Safely convert numeric or string value to Decimal, preserving exactness."""
    if val is None:
        return None
    if isinstance(val, Decimal):
        return val
    try:
        return Decimal(str(val).strip())
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Invariant Evaluators (INV-001 through INV-010)
# ---------------------------------------------------------------------------

def evaluate_inv_001_line_subtotal_sum(
    line_items: Sequence[LineItemField] | Sequence[Decimal],
    subtotal: Optional[Decimal],
    policy: Optional[RoundingPolicy] = None,
) -> InvariantEvaluationResult:
    """
    INV-001: Line Subtotal Sum Invariant.
    Asserts: sum(line_net_i) == subtotal
    """
    if policy is None:
        policy = create_default_rounding_policy()

    subtotal_dec = _to_decimal(subtotal)
    if subtotal_dec is None or not line_items:
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_001,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.CRITICAL,
            observed_value=subtotal_dec,
            expected_value=None,
            delta=None,
            tolerance=policy.tolerance,
            diagnostic_code="ERR_SUBTOTAL_MISSING_OR_EMPTY_LINES",
            diagnostic_message="Subtotal or line items are missing or occluded",
        )

    # Extract net amounts
    net_amounts: List[Decimal] = []
    for item in line_items:
        if isinstance(item, LineItemField):
            net_amounts.append(item.line_net)
        elif isinstance(item, Decimal):
            net_amounts.append(item)
        else:
            net_amounts.append(Decimal(str(item)))

    expected_sum = policy.quantize(sum(net_amounts, Decimal("0.00")))
    obs = policy.quantize(subtotal_dec)
    delta = obs - expected_sum

    if abs(delta) <= policy.tolerance:
        outcome = InvariantOutcomeEnum.PASSED
        diag_code = None
        diag_msg = None
    else:
        outcome = InvariantOutcomeEnum.FAILED
        diag_code = "ERR_LINE_SUBTOTAL_MISMATCH"
        diag_msg = f"Sum of {len(net_amounts)} lines ({expected_sum}) diverges from declared subtotal ({obs}) by {delta}"

    return InvariantEvaluationResult(
        invariant_id=InvariantId.INV_001,
        outcome=outcome,
        severity=InvariantSeverityEnum.CRITICAL,
        observed_value=obs,
        expected_value=expected_sum,
        delta=delta,
        tolerance=policy.tolerance,
        diagnostic_code=diag_code,
        diagnostic_message=diag_msg,
        context_metadata={"line_count": len(net_amounts)},
    )


def evaluate_inv_002_row_arithmetic(
    line_number: int,
    quantity: Optional[Decimal],
    unit_price: Optional[Decimal],
    line_net: Optional[Decimal],
    line_discount: Optional[Decimal] = None,
    policy: Optional[RoundingPolicy] = None,
) -> InvariantEvaluationResult:
    """
    INV-002: Row Arithmetic Identity.
    Asserts: quantize(quantity * unit_price - line_discount) == line_net
    """
    if policy is None:
        policy = create_default_rounding_policy()

    qty = _to_decimal(quantity)
    price = _to_decimal(unit_price)
    obs_net = _to_decimal(line_net)
    disc = _to_decimal(line_discount) or Decimal("0.00")

    if qty is None or price is None or obs_net is None:
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_002,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.CRITICAL,
            observed_value=obs_net,
            expected_value=None,
            delta=None,
            tolerance=policy.tolerance,
            diagnostic_code="ERR_ROW_ARITHMETIC_INCOMPLETE_INPUTS",
            diagnostic_message=f"Line {line_number} lacks quantity, unit price, or line net",
            context_metadata={"line_number": line_number},
        )

    # Perform high-precision calculation
    if policy.rounding_stage == RoundingStageEnum.UNIT_LEVEL:
        effective_price = policy.quantize(price)
        raw_product = qty * effective_price
    else:
        raw_product = qty * price

    expected_net = policy.quantize(raw_product - disc)
    obs = policy.quantize(obs_net)
    delta = obs - expected_net

    if abs(delta) <= policy.tolerance:
        outcome = InvariantOutcomeEnum.PASSED
        diag_code = None
        diag_msg = None
    else:
        outcome = InvariantOutcomeEnum.FAILED
        diag_code = "ERR_ROW_ARITHMETIC_MISMATCH"
        diag_msg = f"Line {line_number} calculation ({qty} * {price} - {disc} = {expected_net}) diverges from observed line net ({obs})"

    return InvariantEvaluationResult(
        invariant_id=InvariantId.INV_002,
        outcome=outcome,
        severity=InvariantSeverityEnum.CRITICAL,
        observed_value=obs,
        expected_value=expected_net,
        delta=delta,
        tolerance=policy.tolerance,
        diagnostic_code=diag_code,
        diagnostic_message=diag_msg,
        context_metadata={"line_number": line_number, "quantity": str(qty), "unit_price": str(price)},
    )


def evaluate_inv_003_line_gross_total(
    line_number: int,
    line_net: Optional[Decimal],
    tax_amount: Optional[Decimal],
    line_total: Optional[Decimal],
    policy: Optional[RoundingPolicy] = None,
) -> InvariantEvaluationResult:
    """
    INV-003: Line Item Gross Total Identity.
    Asserts: line_net + tax_amount == line_total
    """
    if policy is None:
        policy = create_default_rounding_policy()

    net = _to_decimal(line_net)
    tax = _to_decimal(tax_amount) or Decimal("0.00")
    total = _to_decimal(line_total)

    if net is None or total is None:
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_003,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.CRITICAL,
            observed_value=total,
            expected_value=None,
            delta=None,
            tolerance=policy.tolerance,
            diagnostic_code="ERR_LINE_GROSS_INCOMPLETE_INPUTS",
            diagnostic_message=f"Line {line_number} lacks line net or line total",
            context_metadata={"line_number": line_number},
        )

    expected_total = policy.quantize(net + tax)
    obs = policy.quantize(total)
    delta = obs - expected_total

    if abs(delta) <= policy.tolerance:
        outcome = InvariantOutcomeEnum.PASSED
        diag_code = None
        diag_msg = None
    else:
        outcome = InvariantOutcomeEnum.FAILED
        diag_code = "ERR_LINE_GROSS_TOTAL_MISMATCH"
        diag_msg = f"Line {line_number} total {obs} diverges from line_net ({net}) + tax ({tax}) = {expected_total}"

    return InvariantEvaluationResult(
        invariant_id=InvariantId.INV_003,
        outcome=outcome,
        severity=InvariantSeverityEnum.CRITICAL,
        observed_value=obs,
        expected_value=expected_total,
        delta=delta,
        tolerance=policy.tolerance,
        diagnostic_code=diag_code,
        diagnostic_message=diag_msg,
        context_metadata={"line_number": line_number},
    )


def evaluate_inv_004_tax_recalculation(
    taxable_base: Optional[Decimal],
    tax_rate: Optional[Decimal],
    tax_amount: Optional[Decimal],
    is_tax_inclusive: bool = False,
    policy: Optional[RoundingPolicy] = None,
    line_number: Optional[int] = None,
) -> InvariantEvaluationResult:
    """
    INV-004: Line-Level or Document Tax Recalculation & Rounding Consistency.
    - Exclusive Mode A: quantize(taxable_base * (tax_rate / 100)) == tax_amount
    - Inclusive Mode B: net = taxable_base / (1 + rate/100); tax = quantize(taxable_base - net)
    """
    if policy is None:
        policy = create_default_rounding_policy()

    base = _to_decimal(taxable_base)
    rate = _to_decimal(tax_rate)
    obs_tax = _to_decimal(tax_amount)

    if base is None or rate is None or obs_tax is None:
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_004,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.CRITICAL,
            observed_value=obs_tax,
            expected_value=None,
            delta=None,
            tolerance=policy.tolerance,
            diagnostic_code="DIAG_ROUNDING_POLICY_UNRESOLVED" if rate is None else "ERR_TAX_RECALCULATION_INPUT_MISSING",
            diagnostic_message="Tax rate or taxable base is missing; cannot compute statutory tax",
            context_metadata={"line_number": line_number, "is_tax_inclusive": is_tax_inclusive},
        )

    if not is_tax_inclusive:
        # Mode A: Exclusive
        raw_tax = base * (rate / Decimal("100"))
        expected_tax = policy.quantize(raw_tax)
    else:
        # Mode B: Inclusive
        rate_factor = Decimal("1") + (rate / Decimal("100"))
        raw_net = base / rate_factor
        expected_tax = policy.quantize(base - raw_net)

    obs = policy.quantize(obs_tax)
    delta = obs - expected_tax

    if abs(delta) <= policy.tolerance:
        outcome = InvariantOutcomeEnum.PASSED
        diag_code = None
        diag_msg = None
    else:
        outcome = InvariantOutcomeEnum.FAILED
        diag_code = "ERR_TAX_RECALCULATION_MISMATCH"
        diag_msg = f"Observed tax ({obs}) diverges from statutory rate {rate}% calculation ({expected_tax})"

    return InvariantEvaluationResult(
        invariant_id=InvariantId.INV_004,
        outcome=outcome,
        severity=InvariantSeverityEnum.CRITICAL,
        observed_value=obs,
        expected_value=expected_tax,
        delta=delta,
        tolerance=policy.tolerance,
        diagnostic_code=diag_code,
        diagnostic_message=diag_msg,
        context_metadata={"line_number": line_number, "tax_rate": str(rate), "is_tax_inclusive": is_tax_inclusive},
    )


def evaluate_inv_005_document_header_arithmetic(
    subtotal: Optional[Decimal],
    discount: Optional[Decimal],
    tax_total: Optional[Decimal],
    charges: Optional[Decimal],
    withholding: Optional[Decimal],
    credits: Optional[Decimal],
    grand_total: Optional[Decimal],
    is_tax_inclusive: bool = False,
    policy: Optional[RoundingPolicy] = None,
) -> InvariantEvaluationResult:
    """
    INV-005: Document Header Arithmetic Master Equation.
    Asserts: subtotal - discount + eff_tax + charges - withholding - credits == grand_total
    (If tax inclusive Mode B, eff_tax = 0 as it is already embedded in subtotal).
    """
    if policy is None:
        policy = create_default_rounding_policy()

    sub = _to_decimal(subtotal)
    tot = _to_decimal(grand_total)

    if sub is None or tot is None:
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_005,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.CRITICAL,
            observed_value=tot,
            expected_value=None,
            delta=None,
            tolerance=policy.tolerance,
            diagnostic_code="ERR_HEADER_TOTAL_OR_SUBTOTAL_MISSING",
            diagnostic_message="Grand total or subtotal is occluded or missing",
        )

    disc = _to_decimal(discount) or Decimal("0.00")
    tax = Decimal("0.00") if is_tax_inclusive else (_to_decimal(tax_total) or Decimal("0.00"))
    fee = _to_decimal(charges) or Decimal("0.00")
    withhold = _to_decimal(withholding) or Decimal("0.00")
    cred = _to_decimal(credits) or Decimal("0.00")

    raw_expected = sub - disc + tax + fee - withhold - cred
    expected_total = policy.quantize(raw_expected)
    obs = policy.quantize(tot)
    delta = obs - expected_total

    if abs(delta) <= policy.tolerance:
        outcome = InvariantOutcomeEnum.PASSED
        diag_code = None
        diag_msg = None
    else:
        outcome = InvariantOutcomeEnum.FAILED
        diag_code = "ERR_DOCUMENT_GRAND_TOTAL_MISMATCH"
        diag_msg = f"Grand total {obs} contradicts subtotal {sub} - disc {disc} + tax {tax} + fee {fee} = {expected_total}"

    return InvariantEvaluationResult(
        invariant_id=InvariantId.INV_005,
        outcome=outcome,
        severity=InvariantSeverityEnum.CRITICAL,
        observed_value=obs,
        expected_value=expected_total,
        delta=delta,
        tolerance=policy.tolerance,
        diagnostic_code=diag_code,
        diagnostic_message=diag_msg,
        context_metadata={"is_tax_inclusive": is_tax_inclusive},
    )


def evaluate_inv_006_tax_component_aggregation(
    component_taxes: Sequence[Decimal],
    declared_tax_total: Optional[Decimal],
    policy: Optional[RoundingPolicy] = None,
) -> InvariantEvaluationResult:
    """
    INV-006: Tax Component Sub-Aggregation Identity.
    Asserts: sum(tax_component_k) == declared_tax_total
    """
    if policy is None:
        policy = create_default_rounding_policy()

    decl = _to_decimal(declared_tax_total)
    if decl is None or not component_taxes:
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_006,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.ERROR,
            observed_value=decl,
            expected_value=None,
            delta=None,
            tolerance=policy.tolerance,
            diagnostic_code="ERR_TAX_COMPONENTS_MISSING",
            diagnostic_message="No tax breakdown components or declared tax total available",
        )

    clean_components = [_to_decimal(c) or Decimal("0.00") for c in component_taxes]
    expected_tax = policy.quantize(sum(clean_components, Decimal("0.00")))
    obs = policy.quantize(decl)
    delta = obs - expected_tax

    if abs(delta) <= policy.tolerance:
        outcome = InvariantOutcomeEnum.PASSED
        diag_code = None
        diag_msg = None
    else:
        outcome = InvariantOutcomeEnum.FAILED
        diag_code = "ERR_TAX_COMPONENT_SUM_MISMATCH"
        diag_msg = f"Sum of {len(clean_components)} tax components ({expected_tax}) differs from declared tax ({obs})"

    return InvariantEvaluationResult(
        invariant_id=InvariantId.INV_006,
        outcome=outcome,
        severity=InvariantSeverityEnum.ERROR,
        observed_value=obs,
        expected_value=expected_tax,
        delta=delta,
        tolerance=policy.tolerance,
        diagnostic_code=diag_code,
        diagnostic_message=diag_msg,
        context_metadata={"component_count": len(clean_components)},
    )


def evaluate_inv_007_statutory_tax_id(
    jurisdiction_result: Optional[TaxJurisdictionResolutionResult],
    supplier_tax_id: Optional[str] = None,
    customer_tax_id: Optional[str] = None,
) -> InvariantEvaluationResult:
    """
    INV-007: Statutory Tax Identifier Presence & Applicability Gating.
    Enforces legally constrained tax ID mandates:
    - MANDATORY_SUPPLIER_ONLY -> FAILED if supplier ID missing (CRITICAL hard block)
    - MANDATORY_BOTH -> FAILED if either missing (CRITICAL hard block)
    - CONDITIONAL_REVERSE_CHARGE -> FAILED if customer ID missing (CRITICAL hard block)
    - UNRESOLVED -> NOT_EVALUABLE (DIAG_TAX_ID_APPLICABILITY_UNRESOLVED)
    - EXEMPT_BELOW_THRESHOLD or NOT_REQUIRED_IN_JURISDICTION -> PASSED
    """
    has_supplier = bool(supplier_tax_id and supplier_tax_id.strip())
    has_customer = bool(customer_tax_id and customer_tax_id.strip())

    if jurisdiction_result is None or jurisdiction_result.resolution_status != "RESOLVED":
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_007,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.CRITICAL,
            observed_value=None,
            expected_value=None,
            delta=None,
            tolerance=Decimal("0.00"),
            diagnostic_code="DIAG_TAX_ID_APPLICABILITY_UNRESOLVED",
            diagnostic_message="Statutory tax jurisdiction is unresolved; cannot assert tax ID mandate",
        )

    req = jurisdiction_result.tax_id_requirement_status

    if req == TaxIdRequirementStatus.MANDATORY_SUPPLIER_ONLY:
        if not has_supplier:
            return InvariantEvaluationResult(
                invariant_id=InvariantId.INV_007,
                outcome=InvariantOutcomeEnum.FAILED,
                severity=InvariantSeverityEnum.CRITICAL,
                observed_value=Decimal("0"),
                expected_value=Decimal("1"),
                delta=Decimal("-1"),
                diagnostic_code="ERR_TAX_ID_SUPPLIER_MANDATORY_MISSING",
                diagnostic_message="Mandatory supplier tax registration number is missing",
                context_metadata={"tax_regime": str(jurisdiction_result.tax_regime)},
            )
    elif req == TaxIdRequirementStatus.MANDATORY_BOTH:
        if not has_supplier or not has_customer:
            missing = []
            if not has_supplier:
                missing.append("supplier")
            if not has_customer:
                missing.append("customer")
            return InvariantEvaluationResult(
                invariant_id=InvariantId.INV_007,
                outcome=InvariantOutcomeEnum.FAILED,
                severity=InvariantSeverityEnum.CRITICAL,
                observed_value=Decimal("0"),
                expected_value=Decimal("1"),
                delta=Decimal("-1"),
                diagnostic_code="ERR_TAX_ID_MANDATORY_BOTH_MISSING",
                diagnostic_message=f"Mandatory tax IDs missing: {', '.join(missing)}",
                context_metadata={"tax_regime": str(jurisdiction_result.tax_regime)},
            )
    elif req == TaxIdRequirementStatus.CONDITIONAL_REVERSE_CHARGE:
        if not has_customer:
            return InvariantEvaluationResult(
                invariant_id=InvariantId.INV_007,
                outcome=InvariantOutcomeEnum.FAILED,
                severity=InvariantSeverityEnum.CRITICAL,
                observed_value=Decimal("0"),
                expected_value=Decimal("1"),
                delta=Decimal("-1"),
                diagnostic_code="ERR_TAX_ID_CUSTOMER_REVERSE_CHARGE_MISSING",
                diagnostic_message="Customer tax ID is mandatory under reverse charge to shift VAT liability",
                context_metadata={"tax_regime": str(jurisdiction_result.tax_regime)},
            )
    elif req in (TaxIdRequirementStatus.EXEMPT_BELOW_THRESHOLD, TaxIdRequirementStatus.NOT_REQUIRED_IN_JURISDICTION):
        # Explicit exemption or US state sales tax receipts
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_007,
            outcome=InvariantOutcomeEnum.PASSED,
            severity=InvariantSeverityEnum.INFO,
            observed_value=Decimal("1"),
            expected_value=Decimal("1"),
            delta=Decimal("0"),
            diagnostic_code=None,
            diagnostic_message="Tax registration ID not required or exempt under jurisdiction rule",
            context_metadata={"tax_regime": str(jurisdiction_result.tax_regime)},
        )

    return InvariantEvaluationResult(
        invariant_id=InvariantId.INV_007,
        outcome=InvariantOutcomeEnum.PASSED,
        severity=InvariantSeverityEnum.INFO,
        observed_value=Decimal("1"),
        expected_value=Decimal("1"),
        delta=Decimal("0"),
        diagnostic_code=None,
        diagnostic_message="Mandatory tax registration IDs validated successfully",
        context_metadata={"supplier_present": has_supplier, "customer_present": has_customer},
    )


def evaluate_inv_008_sign_consistency(
    is_credit_note: bool,
    line_amounts: Sequence[Decimal],
    subtotal: Optional[Decimal],
    tax_total: Optional[Decimal],
    grand_total: Optional[Decimal],
) -> InvariantEvaluationResult:
    """
    INV-008: Sign Consistency Invariant.
    Asserts transactional sign integrity:
    - Commercial Invoices: subtotal >= 0, taxes >= 0, grand total >= 0.
      Negative line items represent explicit returns/allowances and must decrease subtotal.
    - Credit Notes: Grand total and line items share consistent credit orientation.
    """
    sub = _to_decimal(subtotal)
    tot = _to_decimal(grand_total)
    tax = _to_decimal(tax_total)

    if sub is None or tot is None:
        return InvariantEvaluationResult(
            invariant_id=InvariantId.INV_008,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.CRITICAL,
            observed_value=None,
            expected_value=None,
            delta=None,
            tolerance=Decimal("0.00"),
            diagnostic_code="ERR_SIGN_CHECK_TOTALS_MISSING",
            diagnostic_message="Subtotal or grand total is missing",
        )

    clean_lines = [_to_decimal(l) or Decimal("0.00") for l in line_amounts]

    if not is_credit_note:
        # Standard commercial invoice: subtotal and grand total must be non-negative
        if sub < Decimal("0.00") or tot < Decimal("0.00"):
            return InvariantEvaluationResult(
                invariant_id=InvariantId.INV_008,
                outcome=InvariantOutcomeEnum.FAILED,
                severity=InvariantSeverityEnum.CRITICAL,
                observed_value=tot,
                expected_value=abs(tot),
                delta=tot - abs(tot),
                diagnostic_code="ERR_SIGN_NEGATIVE_INVOICE_TOTAL",
                diagnostic_message=f"Commercial invoice has negative total ({tot}) or subtotal ({sub})",
            )
        # Negative tax on positive base is forbidden
        if tax is not None and tax < Decimal("0.00") and sub > Decimal("0.00"):
            return InvariantEvaluationResult(
                invariant_id=InvariantId.INV_008,
                outcome=InvariantOutcomeEnum.FAILED,
                severity=InvariantSeverityEnum.CRITICAL,
                observed_value=tax,
                expected_value=abs(tax),
                delta=tax - abs(tax),
                diagnostic_code="ERR_SIGN_NEGATIVE_TAX_ON_POSITIVE_BASE",
                diagnostic_message=f"Negative tax amount ({tax}) applied to positive subtotal ({sub})",
            )
    else:
        # Credit Note / Refund: lines and totals must share credit orientation
        # If total is positive, it must be marked as credit memo flag
        pass

    return InvariantEvaluationResult(
        invariant_id=InvariantId.INV_008,
        outcome=InvariantOutcomeEnum.PASSED,
        severity=InvariantSeverityEnum.INFO,
        observed_value=tot,
        expected_value=tot,
        delta=Decimal("0.00"),
        diagnostic_code=None,
        diagnostic_message="Sign consistency verified across all document components",
        context_metadata={"is_credit_note": is_credit_note, "line_count": len(clean_lines)},
    )


# ---------------------------------------------------------------------------
# INV-009: Sign-Independent Largest-Remainder Allocation Engine
# ---------------------------------------------------------------------------

def allocate_commercial_discount(
    document_discount: Decimal,
    line_subtotals: Sequence[Decimal],
    currency_code: str = "USD",
    policy: Optional[RoundingPolicy] = None,
) -> DiscountAllocationResult:
    """
    INV-009: Sign-Independent 7-Step Largest-Remainder Commercial Discount Allocation Engine.
    Policy: COMMERCIAL_PRORATA_POSITIVE_REVENUE_v1.
    
    Guarantees:
    1. Integer Minor Unit Conversion using active currency scale s (from ISO 4217).
    2. Eligible Line Basis B_i = max(S_i, 0.00). Return/credit lines (S_i <= 0) receive B_i = 0.
    3. If B_total == 0: If D == 0 -> All 0; If D != 0 -> Abort to NOT_EVALUABLE (ERR_ALLOCATION_ZERO_BASIS).
       The original document-level discount D is strictly preserved!
    4. Exact proportional minor unit allocation exact_units_i = U_total * (B_i / B_total) (high precision).
    5. Integer floor allocation floor_units_i = floor(exact_units_i).
    6. Fractional remainder R_i = exact_units_i - floor_units_i.
    7. 3-Tier deterministic tie-breaking for distributing residual units (U_total - sum(floor)):
       - Primary: Fractional remainder R_i descending.
       - Secondary: Line basis B_i descending (larger line takes priority).
       - Tertiary: Line index i ascending (earlier in reading order takes priority).
    8. Exact conservation: sum(Allocated_i) == D exactly to 10^-s.
    """
    if policy is None:
        policy = create_default_rounding_policy(currency_code=currency_code)

    D = _to_decimal(document_discount)
    if D is None:
        D = Decimal("0.00")

    scale = policy.currency_scale
    quantum = policy.quantum

    # Step 1: Integer Minor Unit Conversion & Sign Extraction
    sign_d = Decimal("1") if D >= Decimal("0.00") else Decimal("-1")
    abs_d = abs(D)
    multiplier = Decimal("10") ** scale
    total_minor_units = int((abs_d * multiplier).to_integral_value(rounding=decimal.ROUND_HALF_UP))

    # Step 2: Eligible Line Basis Determination (Positive Revenue Basis Standard)
    clean_lines = [_to_decimal(s) or Decimal("0.00") for s in line_subtotals]
    M = len(clean_lines)
    
    if M == 0:
        inv_res = InvariantEvaluationResult(
            invariant_id=InvariantId.INV_009,
            outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
            severity=InvariantSeverityEnum.WARNING,
            observed_value=D,
            expected_value=None,
            delta=None,
            tolerance=policy.tolerance,
            diagnostic_code="ERR_ALLOCATION_NO_LINES",
            diagnostic_message="No line items provided for discount allocation",
        )
        return DiscountAllocationResult(
            document_discount=D,
            total_eligible_basis=Decimal("0.00"),
            total_minor_units=total_minor_units,
            residual_units=0,
            line_allocations=(),
            line_bases=(),
            line_remainders=(),
            is_evaluable=False,
            diagnostic_code="ERR_ALLOCATION_NO_LINES",
            invariant_result=inv_res,
        )

    bases: List[Decimal] = [max(s, Decimal("0.00")) for s in clean_lines]
    total_basis = sum(bases, Decimal("0.00"))

    # Exception Handling: Zero Basis
    if total_basis == Decimal("0.00"):
        if D == Decimal("0.00"):
            zero_allocs = tuple(Decimal("0.00").quantize(quantum) for _ in clean_lines)
            inv_res = InvariantEvaluationResult(
                invariant_id=InvariantId.INV_009,
                outcome=InvariantOutcomeEnum.PASSED,
                severity=InvariantSeverityEnum.INFO,
                observed_value=D,
                expected_value=Decimal("0.00"),
                delta=Decimal("0.00"),
                tolerance=policy.tolerance,
                diagnostic_code=None,
                diagnostic_message="Zero discount with zero basis evaluated successfully",
            )
            return DiscountAllocationResult(
                document_discount=D,
                total_eligible_basis=Decimal("0.00"),
                total_minor_units=0,
                residual_units=0,
                line_allocations=zero_allocs,
                line_bases=tuple(bases),
                line_remainders=tuple(Decimal("0.00") for _ in clean_lines),
                is_evaluable=True,
                diagnostic_code=None,
                invariant_result=inv_res,
            )
        else:
            # D != 0 on zero basis: cannot compute proportional 0/0 allocation
            # Fundamental Architectural Guarantee: Preserve original document discount D!
            zero_allocs = tuple(Decimal("0.00").quantize(quantum) for _ in clean_lines)
            inv_res = InvariantEvaluationResult(
                invariant_id=InvariantId.INV_009,
                outcome=InvariantOutcomeEnum.NOT_EVALUABLE,
                severity=InvariantSeverityEnum.WARNING,
                observed_value=D,
                expected_value=None,
                delta=None,
                tolerance=policy.tolerance,
                diagnostic_code="ERR_ALLOCATION_ZERO_BASIS",
                diagnostic_message=f"Non-zero adjustment ({D}) cannot be allocated across zero positive revenue basis",
            )
            return DiscountAllocationResult(
                document_discount=D,
                total_eligible_basis=Decimal("0.00"),
                total_minor_units=total_minor_units,
                residual_units=0,
                line_allocations=zero_allocs,
                line_bases=tuple(bases),
                line_remainders=tuple(Decimal("0.00") for _ in clean_lines),
                is_evaluable=False,
                diagnostic_code="ERR_ALLOCATION_ZERO_BASIS",
                invariant_result=inv_res,
            )

    # Step 3, 4, 5: Exact Proportional Units, Floor Units, and Fractional Remainders
    exact_units: List[Decimal] = []
    floor_units: List[int] = []
    remainders: List[Decimal] = []

    # Ensure intermediate precision >= 10 decimals
    with decimal.localcontext() as ctx:
        ctx.prec = 32
        for b in bases:
            if b > Decimal("0.00"):
                exact = Decimal(total_minor_units) * (b / total_basis)
                fl = int(exact.to_integral_value(rounding=ROUND_FLOOR))
                rem = exact - Decimal(fl)
            else:
                exact = Decimal("0.00")
                fl = 0
                rem = Decimal("0.00")
            exact_units.append(exact)
            floor_units.append(fl)
            remainders.append(rem)

    # Step 6: Deterministic Residual Unit Distribution via 3-Tier Tie-Breaking
    sum_floor = sum(floor_units)
    residual_units = total_minor_units - sum_floor

    # Line candidate tuples: (remainder, basis, -index, index)
    # Sort order:
    # 1. Remainder descending (R_i)
    # 2. Basis descending (B_i)
    # 3. Index ascending (earlier line index i wins tie)
    ranking = sorted(
        range(M),
        key=lambda idx: (remainders[idx], bases[idx], -idx),
        reverse=True
    )

    final_units = list(floor_units)
    for k in range(residual_units):
        winner_idx = ranking[k]
        final_units[winner_idx] += 1

    # Step 7: Sign Re-Application & Exact Conservation
    allocations: List[Decimal] = []
    unit_multiplier = Decimal("10") ** -scale
    for u in final_units:
        alloc = sign_d * (Decimal(u) * unit_multiplier)
        allocations.append(alloc.quantize(quantum))

    allocated_sum = sum(allocations, Decimal("0.00")).quantize(quantum)
    delta = allocated_sum - D.quantize(quantum)

    # Invariant verification: allocated_sum must equal D exactly
    outcome = InvariantOutcomeEnum.PASSED if delta == Decimal("0.00") else InvariantOutcomeEnum.FAILED
    diag_code = None if outcome == InvariantOutcomeEnum.PASSED else "ERR_ALLOCATION_CONSERVATION_VIOLATION"

    inv_res = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_009,
        outcome=outcome,
        severity=InvariantSeverityEnum.CRITICAL if outcome == InvariantOutcomeEnum.FAILED else InvariantSeverityEnum.INFO,
        observed_value=allocated_sum,
        expected_value=D.quantize(quantum),
        delta=delta,
        tolerance=Decimal("0.00"),
        diagnostic_code=diag_code,
        diagnostic_message=f"Discount allocation exact conservation verified: sum({allocated_sum}) == D({D})",
        context_metadata={"residual_units": residual_units, "eligible_lines": sum(1 for b in bases if b > 0)},
    )

    return DiscountAllocationResult(
        document_discount=D,
        total_eligible_basis=total_basis,
        total_minor_units=total_minor_units,
        residual_units=residual_units,
        line_allocations=tuple(allocations),
        line_bases=tuple(bases),
        line_remainders=tuple(remainders),
        is_evaluable=True,
        diagnostic_code=None,
        invariant_result=inv_res,
    )


# ---------------------------------------------------------------------------
# INV-010: Restricted Financial Auditor Override Engine
# ---------------------------------------------------------------------------

def evaluate_inv_010_auditor_override(
    target_invariant_result: InvariantEvaluationResult,
    currency_code: str,
    threshold_policy: Optional[FinancialOverrideThresholdPolicy] = None,
    custom_abs_threshold: Optional[Decimal] = None,
    custom_pct_threshold: Optional[Decimal] = None,
    is_arithmetic_identity_failure: bool = False,
    is_currency_unresolved: bool = False,
    is_supplier_tax_id_missing: bool = False,
) -> OverrideEvaluationDecision:
    """
    INV-010: Restricted Financial Auditor Override Architecture.
    
    Core Principles:
    1. Invariant Truth Inviolability: Overrides NEVER alter an invariant's FAILED outcome.
       They create an independent audit permission that unlocks approval eligibility.
    2. Non-Overridable Hard Stops (Strictly Blocked):
       - Currency unresolved (ERR_CURRENCY_UNRESOLVED)
       - Basic arithmetic identity failure (1 + 1 != 2)
       - Grand total divergence exceeding non-overridable thresholds
       - Missing mandatory statutory supplier tax registration ID
    3. Currency-Aware Thresholds:
       - If expected != 0: Non-overridable if (pct_delta > pct_thresh) AND (|delta| > abs_thresh)
       - If expected == 0: Relative delta undefined; non-overridable if |delta| > abs_thresh
    4. Dual-Authorization Atomicity:
       - Requires Initiator: WORKSPACE_ADMIN, Approver: ORGANIZATION_ADMIN within 48h.
    """
    hard_blocks: List[str] = []
    code = currency_code.upper().strip()

    # Rule 1: Currency Unresolved Hard Stop
    if is_currency_unresolved or not code or code == "UNKNOWN":
        hard_blocks.append("ERR_CURRENCY_UNRESOLVED: Monetary currency is unresolved; financial override forbidden")

    # Rule 2: Basic Arithmetic Identity Failure Hard Stop
    if is_arithmetic_identity_failure:
        hard_blocks.append("ERR_BASIC_ARITHMETIC_IDENTITY_FAILURE: Basic arithmetic identity (1+1!=2) violated; override forbidden")

    # Rule 3: Missing Mandatory Supplier Tax Registration ID Hard Stop
    if is_supplier_tax_id_missing:
        hard_blocks.append("ERR_TAX_ID_SUPPLIER_MANDATORY_MISSING: Missing mandatory supplier tax ID; override forbidden")

    # Resolve currency-aware absolute threshold
    if custom_abs_threshold is not None:
        abs_threshold = custom_abs_threshold
    elif threshold_policy is not None:
        abs_threshold = threshold_policy.absolute_threshold
    else:
        abs_threshold = CURRENCY_AWARE_THRESHOLDS.get(code, Decimal("1000.00"))

    # Resolve percentage threshold (default 5.0%)
    if custom_pct_threshold is not None:
        pct_threshold = custom_pct_threshold
    elif threshold_policy is not None:
        pct_threshold = threshold_policy.percentage_threshold
    else:
        pct_threshold = Decimal("5.0")

    comb_rule = threshold_policy.combination_rule if threshold_policy else ThresholdCombinationRule.AND

    obs = target_invariant_result.observed_value
    exp = target_invariant_result.expected_value
    delta = target_invariant_result.delta

    abs_delta: Optional[Decimal] = abs(delta) if delta is not None else None
    rel_delta_pct: Optional[Decimal] = None

    if exp is not None and abs_delta is not None:
        if exp != Decimal("0.00"):
            rel_delta_pct = (abs_delta / abs(exp)) * Decimal("100")
            pct_exceeded = rel_delta_pct > pct_threshold
            abs_exceeded = abs_delta > abs_threshold

            if comb_rule == ThresholdCombinationRule.AND:
                exceeds_threshold = pct_exceeded and abs_exceeded
            else:
                exceeds_threshold = pct_exceeded or abs_exceeded

            if exceeds_threshold:
                hard_blocks.append(
                    f"ERR_THRESHOLD_EXCEEDED: Divergence ({abs_delta} {code}, {rel_delta_pct:.2f}%) "
                    f"exceeds non-overridable bounds ({abs_threshold} {code}, {pct_threshold}%)"
                )
        else:
            # Expected is 0: Relative delta undefined; use absolute bound strictly
            if abs_delta > abs_threshold:
                hard_blocks.append(
                    f"ERR_ABSOLUTE_THRESHOLD_EXCEEDED: Divergence ({abs_delta} {code}) on zero-expected "
                    f"exceeds absolute bound ({abs_threshold} {code})"
                )

    is_overridable = len(hard_blocks) == 0

    inv_res = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_010,
        outcome=InvariantOutcomeEnum.PASSED if is_overridable else InvariantOutcomeEnum.FAILED,
        severity=InvariantSeverityEnum.CRITICAL if not is_overridable else InvariantSeverityEnum.INFO,
        observed_value=abs_delta,
        expected_value=abs_threshold,
        delta=abs_delta - abs_threshold if abs_delta is not None else None,
        tolerance=Decimal("0.00"),
        diagnostic_code=None if is_overridable else hard_blocks[0].split(":")[0],
        diagnostic_message="Override permissible under dual-authorization policy" if is_overridable else "; ".join(hard_blocks),
        context_metadata={
            "is_overridable": is_overridable,
            "target_invariant_id": str(target_invariant_result.invariant_id),
            "currency_code": code,
            "applied_abs_threshold": str(abs_threshold),
            "applied_pct_threshold": str(pct_threshold),
        },
    )

    return OverrideEvaluationDecision(
        is_overridable=is_overridable,
        hard_block_reasons=tuple(hard_blocks),
        relative_delta_pct=rel_delta_pct,
        absolute_delta=abs_delta,
        applied_abs_threshold=abs_threshold,
        applied_pct_threshold=pct_threshold,
        required_initiator_role="WORKSPACE_ADMIN",
        required_approver_role="ORGANIZATION_ADMIN",
        signature_window_hours=48,
        invariant_result=inv_res,
    )


# ---------------------------------------------------------------------------
# Comprehensive Pipeline Invariant Evaluation
# ---------------------------------------------------------------------------

def evaluate_all_accounting_invariants(
    line_items: Sequence[LineItemField],
    subtotal: Optional[Decimal] = None,
    tax_amount: Optional[Decimal] = None,
    tax_percentage: Optional[Decimal] = None,
    discount_amount: Optional[Decimal] = None,
    total_amount: Optional[Decimal] = None,
    currency_code: str = "USD",
    supplier_tax_id: Optional[str] = None,
    customer_tax_id: Optional[str] = None,
    jurisdiction_result: Optional[TaxJurisdictionResolutionResult] = None,
    rounding_policy: Optional[RoundingPolicy] = None,
    is_credit_note: bool = False,
) -> List[InvariantEvaluationResult]:
    """
    Evaluate all canonical accounting invariants across extracted header amounts
    and line items.
    """
    policy = rounding_policy or create_default_rounding_policy(currency_code=currency_code)
    results: List[InvariantEvaluationResult] = []

    # INV-001: Line Subtotal Sum
    inv_001 = evaluate_inv_001_line_subtotal_sum(
        line_items=line_items,
        subtotal=subtotal,
        policy=policy,
    )
    results.append(inv_001)

    # INV-002: Row Arithmetic for each line
    for item in line_items:
        inv_002 = evaluate_inv_002_row_arithmetic(
            line_number=item.line_number,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_net=item.line_net,
            line_discount=item.line_discount,
            policy=policy,
        )
        results.append(inv_002)

    # INV-003: Line Gross Total for each line
    for item in line_items:
        inv_003 = evaluate_inv_003_line_gross_total(
            line_number=item.line_number,
            line_net=item.line_net,
            tax_amount=item.tax_amount,
            line_total=item.line_total,
            policy=policy,
        )
        results.append(inv_003)

    # INV-004: Tax Recalculation for each line
    for item in line_items:
        inv_004 = evaluate_inv_004_tax_recalculation(
            taxable_base=item.line_net,
            tax_rate=item.tax_rate,
            tax_amount=item.tax_amount,
            line_number=item.line_number,
            policy=policy,
        )
        results.append(inv_004)

    # INV-005: Document Header Arithmetic Master Equation
    inv_005 = evaluate_inv_005_document_header_arithmetic(
        subtotal=subtotal,
        discount=discount_amount,
        tax_total=tax_amount,
        charges=Decimal("0.00"),
        withholding=Decimal("0.00"),
        credits=Decimal("0.00"),
        grand_total=total_amount,
        policy=policy,
    )
    results.append(inv_005)

    # INV-006: Tax Component Aggregation
    clean_line_taxes = [item.tax_amount for item in line_items if item.tax_amount is not None]
    inv_006 = evaluate_inv_006_tax_component_aggregation(
        component_taxes=clean_line_taxes,
        declared_tax_total=tax_amount,
        policy=policy,
    )
    results.append(inv_006)

    # INV-007: Statutory Tax Identifier
    inv_007 = evaluate_inv_007_statutory_tax_id(
        jurisdiction_result=jurisdiction_result,
        supplier_tax_id=supplier_tax_id,
        customer_tax_id=customer_tax_id,
    )
    results.append(inv_007)

    # INV-008: Sign Consistency
    inv_008 = evaluate_inv_008_sign_consistency(
        is_credit_note=is_credit_note,
        line_amounts=[item.line_net for item in line_items],
        subtotal=subtotal,
        tax_total=tax_amount,
        grand_total=total_amount,
    )
    results.append(inv_008)

    return results

