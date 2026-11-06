"""
Tests for Rounding Policy and Currency Precision Engine (Phase 4 Step 4 Wave 1).
Validates all 6 Decimal rounding modes, 4 stages, ISO 4217 scales, and policy models.
"""
from decimal import Decimal

import pytest
from pydantic import ValidationError

from src.intelligence.rounding_policy import (
    ISO_4217_CURRENCY_SCALES,
    PolicySourceEnum,
    RoundingModeEnum,
    RoundingPolicy,
    RoundingProvenanceType,
    RoundingStageEnum,
    create_default_rounding_policy,
    get_currency_scale,
    quantize_amount,
    validate_intermediate_precision,
)


def test_rounding_mode_half_up_commercial():
    """ROUND_HALF_UP rounds half-values away from zero."""
    policy_0 = create_default_rounding_policy(currency_code="JPY", rounding_mode=RoundingModeEnum.ROUND_HALF_UP)
    assert quantize_amount(Decimal("2.500"), policy_0) == Decimal("3")
    assert quantize_amount(Decimal("-2.500"), policy_0) == Decimal("-3")

    policy_2 = create_default_rounding_policy(currency_code="USD", rounding_mode=RoundingModeEnum.ROUND_HALF_UP)
    assert quantize_amount(Decimal("2.555"), policy_2) == Decimal("2.56")
    assert quantize_amount(Decimal("2.554"), policy_2) == Decimal("2.55")
    assert quantize_amount(Decimal("-2.555"), policy_2) == Decimal("-2.56")


def test_rounding_mode_half_even_bankers():
    """ROUND_HALF_EVEN rounds half-values to nearest even integer (Banker's rounding)."""
    policy_0 = create_default_rounding_policy(currency_code="JPY", rounding_mode=RoundingModeEnum.ROUND_HALF_EVEN)
    assert quantize_amount(Decimal("2.500"), policy_0) == Decimal("2")  # 2 is even
    assert quantize_amount(Decimal("3.500"), policy_0) == Decimal("4")  # 4 is even
    assert quantize_amount(Decimal("-2.500"), policy_0) == Decimal("-2")
    assert quantize_amount(Decimal("-3.500"), policy_0) == Decimal("-4")

    policy_2 = create_default_rounding_policy(currency_code="USD", rounding_mode=RoundingModeEnum.ROUND_HALF_EVEN)
    assert quantize_amount(Decimal("2.525"), policy_2) == Decimal("2.52")  # 2 is even
    assert quantize_amount(Decimal("2.535"), policy_2) == Decimal("2.54")  # 4 is even


def test_rounding_mode_up_away_from_zero():
    """ROUND_UP increases magnitude away from zero."""
    policy_0 = create_default_rounding_policy(currency_code="JPY", rounding_mode=RoundingModeEnum.ROUND_UP)
    assert quantize_amount(Decimal("2.100"), policy_0) == Decimal("3")
    assert quantize_amount(Decimal("-2.100"), policy_0) == Decimal("-3")


def test_rounding_mode_down_towards_zero():
    """ROUND_DOWN decreases magnitude towards zero (truncation)."""
    policy_0 = create_default_rounding_policy(currency_code="JPY", rounding_mode=RoundingModeEnum.ROUND_DOWN)
    assert quantize_amount(Decimal("2.900"), policy_0) == Decimal("2")
    assert quantize_amount(Decimal("-2.900"), policy_0) == Decimal("-2")


def test_rounding_mode_ceiling_towards_positive_infinity():
    """ROUND_CEILING rounds towards positive infinity."""
    policy_0 = create_default_rounding_policy(currency_code="JPY", rounding_mode=RoundingModeEnum.ROUND_CEILING)
    assert quantize_amount(Decimal("2.100"), policy_0) == Decimal("3")
    assert quantize_amount(Decimal("-2.900"), policy_0) == Decimal("-2")


def test_rounding_mode_floor_towards_negative_infinity():
    """ROUND_FLOOR rounds towards negative infinity."""
    policy_0 = create_default_rounding_policy(currency_code="JPY", rounding_mode=RoundingModeEnum.ROUND_FLOOR)
    assert quantize_amount(Decimal("2.900"), policy_0) == Decimal("2")
    assert quantize_amount(Decimal("-2.100"), policy_0) == Decimal("-3")


def test_iso_4217_scale_lookup():
    """Authoritative scale lookups across 0, 2, 3, and 4 decimal currencies."""
    assert get_currency_scale("JPY") == 0
    assert get_currency_scale("KRW") == 0
    assert get_currency_scale("VND") == 0

    assert get_currency_scale("USD") == 2
    assert get_currency_scale("EUR") == 2
    assert get_currency_scale("GBP") == 2

    assert get_currency_scale("BHD") == 3
    assert get_currency_scale("KWD") == 3
    assert get_currency_scale("OMR") == 3

    assert get_currency_scale("CLF") == 4
    assert get_currency_scale("UNKNOWN_CURRENCY") is None


def test_policy_currency_scale_consistency_validation():
    """Policy must reject scale inconsistent with ISO 4217 registry."""
    # JPY requires scale 0
    with pytest.raises(ValidationError) as exc:
        RoundingPolicy(
            currency_code="JPY",
            currency_scale=2,  # Invalid for JPY
            rounding_mode=RoundingModeEnum.ROUND_HALF_UP,
            rounding_stage=RoundingStageEnum.LINE_LEVEL,
            policy_source=PolicySourceEnum.FALLBACK_DEFAULT,
            provenance_type=RoundingProvenanceType.DEFAULTED,
        )
    assert "Currency JPY requires currency_scale=0" in str(exc.value)

    # BHD requires scale 3
    with pytest.raises(ValidationError) as exc:
        RoundingPolicy(
            currency_code="BHD",
            currency_scale=2,  # Invalid for BHD
            rounding_mode=RoundingModeEnum.ROUND_HALF_UP,
            rounding_stage=RoundingStageEnum.LINE_LEVEL,
            policy_source=PolicySourceEnum.FALLBACK_DEFAULT,
            provenance_type=RoundingProvenanceType.DEFAULTED,
        )
    assert "Currency BHD requires currency_scale=3" in str(exc.value)


def test_policy_provenance_and_evidence_consistency():
    """Policy must enforce consistency between provenance type and evidence references."""
    # OBSERVED requires DOCUMENT_EXPLICIT_DISCLOSURE and non-null evidence_reference
    with pytest.raises(ValidationError) as exc:
        RoundingPolicy(
            currency_code="USD",
            currency_scale=2,
            provenance_type=RoundingProvenanceType.OBSERVED,
            policy_source=PolicySourceEnum.FALLBACK_DEFAULT,  # Invalid for OBSERVED
            evidence_reference=None,
        )
    assert "OBSERVED rounding policy must have policy_source" in str(exc.value)

    # Valid OBSERVED
    valid_observed = RoundingPolicy(
        currency_code="USD",
        currency_scale=2,
        provenance_type=RoundingProvenanceType.OBSERVED,
        policy_source=PolicySourceEnum.DOCUMENT_EXPLICIT_DISCLOSURE,
        evidence_reference="tok_disclosure_104",
    )
    assert valid_observed.provenance_type == RoundingProvenanceType.OBSERVED

    # INFERRED cannot have evidence_reference
    with pytest.raises(ValidationError) as exc:
        RoundingPolicy(
            currency_code="USD",
            currency_scale=2,
            provenance_type=RoundingProvenanceType.INFERRED,
            policy_source=PolicySourceEnum.JURISDICTION_DEFAULT,
            evidence_reference="tok_invalid",  # Contradicts INFERRED
        )
    assert "INFERRED policy cannot have an explicit text evidence_reference" in str(exc.value)

    # DEFAULTED must have FALLBACK_DEFAULT and no evidence
    with pytest.raises(ValidationError) as exc:
        RoundingPolicy(
            currency_code="USD",
            currency_scale=2,
            provenance_type=RoundingProvenanceType.DEFAULTED,
            policy_source=PolicySourceEnum.ORGANIZATION_SETTING,  # Invalid for DEFAULTED
        )
    assert "DEFAULTED policy must have policy_source=FALLBACK_DEFAULT" in str(exc.value)


def test_validate_intermediate_precision():
    """Validates unrounded intermediate calculation precision."""
    # High precision decimals pass
    assert validate_intermediate_precision(Decimal("10.123456")) is True
    assert validate_intermediate_precision(Decimal("0.3333333333")) is True
    assert validate_intermediate_precision(Decimal("100.0000")) is True

    # Exact integers pass
    assert validate_intermediate_precision(Decimal("100")) is True
    assert validate_intermediate_precision(Decimal("0")) is True

    # Prematurely truncated decimals fail
    assert validate_intermediate_precision(Decimal("10.5")) is False
    assert validate_intermediate_precision(Decimal("10.55")) is False
    assert validate_intermediate_precision(Decimal("10.555")) is False
