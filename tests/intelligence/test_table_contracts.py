"""
Tests for Table and Line-Item Extraction Contracts (Phase 4 Step 4 Wave 1).
Validates deep immutability, Pydantic v2 schemas, delta consistency, and financial contracts.
"""
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from src.intelligence.models import BoundingBox
from src.intelligence.table_contracts import (
    DocumentLifecycleState,
    FinancialOverrideThresholdPolicy,
    InvariantEvaluationResult,
    InvariantId,
    InvariantOutcomeEnum,
    InvariantSeverityEnum,
    LineItemField,
    MachineValidationStatus,
    OverrideExceptionRecord,
    RegulatoryRetentionPolicy,
    RetentionJurisdiction,
    TableCell,
    TableBlock,
    TableRow,
    TableRowType,
    TableType,
    TaxIdRequirementStatus,
    TaxJurisdictionResolutionResult,
    TaxRegimeType,
    ThresholdCombinationRule,
    TransactionClassification,
)


def test_table_cell_creation_and_immutability():
    """TableCell must be frozen and forbid extra fields."""
    bbox = BoundingBox(x0=0.1, y0=0.1, x1=0.3, y1=0.15, x0_pt=72.0, y0_pt=72.0, x1_pt=216.0, y1_pt=108.0)
    cell = TableCell(
        text="Description",
        bbox=bbox,
        row_idx=0,
        col_idx=1,
        is_header=True,
        confidence=0.98,
    )
    assert cell.text == "Description"
    assert cell.row_idx == 0
    assert cell.col_idx == 1
    assert cell.row_span == 1
    assert cell.col_span == 1
    assert cell.is_header is True

    # Mutability check
    with pytest.raises(ValidationError):
        cell.text = "New Description"  # type: ignore

    # Extra fields check
    with pytest.raises(ValidationError):
        TableCell(
            text="Invalid",
            bbox=bbox,
            row_idx=0,
            col_idx=0,
            unknown_property=123,  # type: ignore
        )


def test_table_row_and_block_structure():
    """TableRow and TableBlock must hold immutable tuples of cells and rows."""
    bbox1 = BoundingBox(x0=0.0, y0=0.0, x1=0.5, y1=0.1, x0_pt=0.0, y0_pt=0.0, x1_pt=300.0, y1_pt=72.0)
    bbox2 = BoundingBox(x0=0.5, y0=0.0, x1=1.0, y1=0.1, x0_pt=300.0, y0_pt=0.0, x1_pt=600.0, y1_pt=72.0)

    cell1 = TableCell(text="Item", bbox=bbox1, row_idx=0, col_idx=0)
    cell2 = TableCell(text="Price", bbox=bbox2, row_idx=0, col_idx=1)

    row = TableRow(
        cells=(cell1, cell2),
        row_type=TableRowType.HEADER,
        row_index=0,
        confidence=0.99,
    )
    assert len(row.cells) == 2
    assert row.row_type == TableRowType.HEADER

    table_bbox = BoundingBox(x0=0.0, y0=0.0, x1=1.0, y1=0.8, x0_pt=0.0, y0_pt=0.0, x1_pt=600.0, y1_pt=576.0)
    block = TableBlock(
        page_number=1,
        bbox=table_bbox,
        rows=(row,),
        table_type=TableType.STANDARD_GRID,
        confidence=0.95,
    )
    assert block.page_number == 1
    assert len(block.rows) == 1
    assert block.table_type == TableType.STANDARD_GRID


def test_line_item_field_decimal_purity_and_immutability():
    """LineItemField must enforce pure Decimal arithmetic without float drift."""
    bbox = BoundingBox(x0=0.1, y0=0.2, x1=0.9, y1=0.24, x0_pt=60.0, y0_pt=144.0, x1_pt=540.0, y1_pt=172.8)
    item = LineItemField(
        line_number=1,
        description="Enterprise Support Subscription",
        line_net=Decimal("1500.00"),
        quantity=Decimal("3"),
        unit_price=Decimal("500.00"),
        line_discount=Decimal("0.00"),
        tax_rate=Decimal("19.0"),
        tax_amount=Decimal("285.00"),
        line_total=Decimal("1785.00"),
        item_code="SKU-8821",
        raw_tokens=("Enterprise", "Support", "1500.00"),
        confidence=0.99,
        bbox=bbox,
    )
    assert isinstance(item.line_net, Decimal)
    assert item.line_net == Decimal("1500.00")
    assert item.quantity == Decimal("3")
    assert item.unit_price == Decimal("500.00")
    assert item.tax_amount == Decimal("285.00")
    assert item.line_total == Decimal("1785.00")

    with pytest.raises(ValidationError):
        item.line_net = Decimal("2000.00")  # type: ignore


def test_invariant_evaluation_result_delta_consistency():
    """InvariantEvaluationResult must enforce delta == observed - expected."""
    # Valid delta: 105.00 - 100.00 = +5.00
    res = InvariantEvaluationResult(
        invariant_id=InvariantId.INV_001,
        outcome=InvariantOutcomeEnum.FAILED,
        severity=InvariantSeverityEnum.CRITICAL,
        observed_value=Decimal("105.00"),
        expected_value=Decimal("100.00"),
        delta=Decimal("5.00"),
        tolerance=Decimal("0.00"),
    )
    assert res.delta == Decimal("5.00")

    # Inconsistent delta must be rejected
    with pytest.raises(ValidationError) as exc_info:
        InvariantEvaluationResult(
            invariant_id=InvariantId.INV_001,
            outcome=InvariantOutcomeEnum.FAILED,
            observed_value=Decimal("105.00"),
            expected_value=Decimal("100.00"),
            delta=Decimal("-5.00"),  # Contradicts observed - expected
        )
    assert "inconsistent with observed" in str(exc_info.value)

    # Delta without observed or expected must be rejected
    with pytest.raises(ValidationError) as exc_info:
        InvariantEvaluationResult(
            invariant_id=InvariantId.INV_001,
            outcome=InvariantOutcomeEnum.FAILED,
            observed_value=None,
            expected_value=Decimal("100.00"),
            delta=Decimal("5.00"),
        )
    assert "delta cannot be populated when observed_value or expected_value is missing" in str(exc_info.value)


def test_financial_override_threshold_policy():
    """Policy must validate positive thresholds and immutable parameters."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    now = datetime.utcnow()

    policy = FinancialOverrideThresholdPolicy(
        organization_id=org_id,
        currency_code="USD",
        absolute_threshold=Decimal("1000.00"),
        percentage_threshold=Decimal("5.0"),
        combination_rule=ThresholdCombinationRule.AND,
        effective_from=now,
        approved_by=user_id,
    )
    assert policy.currency_code == "USD"
    assert policy.absolute_threshold == Decimal("1000.00")
    assert policy.percentage_threshold == Decimal("5.0")
    assert policy.combination_rule == ThresholdCombinationRule.AND

    # Non-positive thresholds rejected
    with pytest.raises(ValidationError):
        FinancialOverrideThresholdPolicy(
            organization_id=org_id,
            currency_code="USD",
            absolute_threshold=Decimal("0.00"),  # gt=0.00 violated
            percentage_threshold=Decimal("5.0"),
            effective_from=now,
            approved_by=user_id,
        )


def test_regulatory_retention_policy():
    """Retention policy must validate jurisdiction and year boundaries."""
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    policy = RegulatoryRetentionPolicy(
        organization_id=org_id,
        jurisdiction=RetentionJurisdiction.GERMANY_HGB_GOBD,
        document_classification="TAX_INVOICE",
        retention_period_years=10,
        effective_from=date(2026, 1, 1),
        approved_by=user_id,
        approved_authority="AO § 147 Abs. 3",
    )
    assert policy.retention_period_years == 10
    assert policy.jurisdiction == RetentionJurisdiction.GERMANY_HGB_GOBD
    assert policy.legal_hold_active is False


def test_tax_jurisdiction_resolution_result():
    """Tax jurisdiction contract validation."""
    result = TaxJurisdictionResolutionResult(
        jurisdiction_code="DE",
        tax_regime=TaxRegimeType.EU_VAT,
        transaction_classification=TransactionClassification.DOMESTIC_B2B,
        place_of_supply="DE",
        rule_identifier="DE-UStG-Sec14-2024",
        tax_id_requirement_status=TaxIdRequirementStatus.MANDATORY_SUPPLIER_ONLY,
        supplier_tax_id_mandatory=True,
        customer_tax_id_mandatory=False,
        statutory_discretion_permitted=False,
        resolution_status="RESOLVED",
    )
    assert result.jurisdiction_code == "DE"
    assert result.supplier_tax_id_mandatory is True
    assert result.resolution_status == "RESOLVED"
