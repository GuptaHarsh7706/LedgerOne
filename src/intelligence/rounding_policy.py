"""
Rounding Policy and Currency Precision Engine for LedgerOne.
Phase 4 Step 4 Wave 1 Implementation.

Provides versioned, legally constrained Decimal rounding policies,
authoritative ISO 4217 currency scale registries, and exact commercial
quantization functions for financial document processing.
"""
from __future__ import annotations

import decimal
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, Optional, Set, Tuple

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ---------------------------------------------------------------------------
# Rounding Enums
# ---------------------------------------------------------------------------

class RoundingModeEnum(str, Enum):
    """
    Exact Decimal rounding modes conforming to IEEE 754 and commercial accounting.
    """
    ROUND_HALF_UP = "ROUND_HALF_UP"       # Commercial / Arithmetic (half away from 0: 2.5 -> 3, -2.5 -> -3)
    ROUND_HALF_EVEN = "ROUND_HALF_EVEN"   # Banker's / Gaussian (half to nearest even integer: 2.5 -> 2, 3.5 -> 4)
    ROUND_UP = "ROUND_UP"                 # Away from zero (magnitude increases: +2.1 -> +3, -2.1 -> -3)
    ROUND_DOWN = "ROUND_DOWN"             # Towards zero / Truncation (+2.9 -> +2, -2.9 -> -2)
    ROUND_CEILING = "ROUND_CEILING"       # Towards +infinity (+2.1 -> +3, -2.9 -> -2)
    ROUND_FLOOR = "ROUND_FLOOR"           # Towards -infinity (+2.9 -> +2, -2.1 -> -3)


class RoundingStageEnum(str, Enum):
    """
    Processing stage at which monetary quantization is applied.
    """
    UNIT_LEVEL = "UNIT_LEVEL"                       # Unit prices quantized before quantity multiplication
    LINE_LEVEL = "LINE_LEVEL"                       # Line item totals quantized before summing
    TAX_COMPONENT_LEVEL = "TAX_COMPONENT_LEVEL"     # Tax calculated and quantized per line/component
    DOCUMENT_LEVEL = "DOCUMENT_LEVEL"               # High-precision kept until document grand total

    # Legacy aliases
    PER_UNIT = "PER_UNIT"
    PER_LINE_ITEM = "PER_LINE_ITEM"
    PER_TAX_COMPONENT = "PER_TAX_COMPONENT"
    DOCUMENT_FINAL = "DOCUMENT_FINAL"


class PolicySourceEnum(str, Enum):
    """
    Authoritative legal or configuration origin of the rounding policy.
    """
    STATUTORY_MANDATE = "STATUTORY_MANDATE"                       # Non-discretionary statutory rule (e.g. EU VAT Directive)
    CONTRACTUAL_AGREEMENT = "CONTRACTUAL_AGREEMENT"               # Procurement / ERP contract terms
    DOCUMENT_EXPLICIT_DISCLOSURE = "DOCUMENT_EXPLICIT_DISCLOSURE" # Explicit printed text disclosure on document
    JURISDICTION_DEFAULT = "JURISDICTION_DEFAULT"                 # Inferred default from place of supply / jurisdiction
    ORGANIZATION_SETTING = "ORGANIZATION_SETTING"                 # Tenant-configured financial preference
    FALLBACK_DEFAULT = "FALLBACK_DEFAULT"                         # System conservative fallback


class RoundingProvenanceType(str, Enum):
    """
    Epistemic classification of how the rounding policy was determined.
    """
    OBSERVED = "OBSERVED"                     # Directly extracted from legible document text
    INFERRED = "INFERRED"                     # Deduced from jurisdiction, org settings, or transaction type
    STATUTORY_INFERRED = "STATUTORY_INFERRED" # Inferred from statutory tax law rules
    CONTRACT_SPECIFIED = "CONTRACT_SPECIFIED" # Inferred from contractual metadata
    DEFAULTED = "DEFAULTED"                   # Applied via conservative fallback without corroboration


# Alias for backward compatibility
ProvenanceTypeEnum = RoundingProvenanceType


# ---------------------------------------------------------------------------
# Mapping to Python Decimal Rounding Constants
# ---------------------------------------------------------------------------

DECIMAL_ROUNDING_MAP: Dict[RoundingModeEnum, str] = {
    RoundingModeEnum.ROUND_HALF_UP: decimal.ROUND_HALF_UP,
    RoundingModeEnum.ROUND_HALF_EVEN: decimal.ROUND_HALF_EVEN,
    RoundingModeEnum.ROUND_UP: decimal.ROUND_UP,
    RoundingModeEnum.ROUND_DOWN: decimal.ROUND_DOWN,
    RoundingModeEnum.ROUND_CEILING: decimal.ROUND_CEILING,
    RoundingModeEnum.ROUND_FLOOR: decimal.ROUND_FLOOR,
}


# ---------------------------------------------------------------------------
# Authoritative ISO 4217 Currency Minor Unit Scale Registry
# ---------------------------------------------------------------------------

ISO_4217_CURRENCY_SCALES: Dict[str, int] = {
    # Scale 0 (No minor unit)
    "JPY": 0, "KRW": 0, "VND": 0, "CLP": 0, "HUF": 0,
    "PYG": 0, "UGX": 0, "RWF": 0, "BIF": 0, "DJF": 0,
    "KMF": 0, "GNF": 0, "VUV": 0, "XPF": 0, "XOF": 0, "XAF": 0,

    # Scale 3 (Three minor units / 1000 fils/millimes)
    "BHD": 3, "KWD": 3, "OMR": 3, "JOD": 3, "TND": 3, "LYD": 3, "IQD": 3,

    # Scale 4 (Four minor units - specialized financial indicators)
    "CLF": 4, "UYW": 4,

    # Scale 2 (Standard two minor units - widespread global standard)
    "USD": 2, "EUR": 2, "GBP": 2, "CAD": 2, "AUD": 2, "CHF": 2,
    "CNY": 2, "INR": 2, "SGD": 2, "NZD": 2, "SEK": 2, "NOK": 2,
    "DKK": 2, "PLN": 2, "CZK": 2, "BRL": 2, "MXN": 2, "ZAR": 2,
    "HKD": 2, "TRY": 2, "ILS": 2, "AED": 2, "SAR": 2, "QAR": 2,
    "MYR": 2, "THB": 2, "IDR": 2, "PHP": 2, "TWD": 2, "ARS": 2,
    "COP": 2, "PEN": 2, "EGP": 2, "NGN": 2, "KES": 2, "MAD": 2,
    "RON": 2, "BGN": 2, "HRK": 2, "RSD": 2, "UAH": 2, "PKR": 2,
    "BDT": 2, "LKR": 2, "KZT": 2, "DZD": 2, "MAD": 2, "CRC": 2,
}

ZERO_DECIMAL_CURRENCIES: Set[str] = {k for k, v in ISO_4217_CURRENCY_SCALES.items() if v == 0}
THREE_DECIMAL_CURRENCIES: Set[str] = {k for k, v in ISO_4217_CURRENCY_SCALES.items() if v == 3}
FOUR_DECIMAL_CURRENCIES: Set[str] = {k for k, v in ISO_4217_CURRENCY_SCALES.items() if v == 4}


def get_currency_scale(currency_code: str) -> Optional[int]:
    """
    Look up the official ISO 4217 minor unit exponent for a 3-letter currency code.
    Returns None if currency code is unlisted.
    """
    if not currency_code:
        return None
    return ISO_4217_CURRENCY_SCALES.get(currency_code.upper().strip())


# ---------------------------------------------------------------------------
# Rounding Policy Model
# ---------------------------------------------------------------------------

class RoundingPolicy(BaseModel):
    """
    Immutable, validated specification of rounding precision, stage, mode,
    and legal provenance for financial document processing.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    currency_code: str = Field(..., min_length=3, max_length=3, description="ISO 4217 3-letter currency code")
    currency_scale: int = Field(..., ge=0, le=4, description="Minor unit scale: 0 (JPY), 2 (USD/EUR), 3 (BHD), 4 (CLF)")
    rounding_mode: RoundingModeEnum = Field(default=RoundingModeEnum.ROUND_HALF_UP, description="Decimal rounding mode")
    rounding_stage: RoundingStageEnum = Field(default=RoundingStageEnum.LINE_LEVEL, description="Quantization stage")
    policy_source: PolicySourceEnum = Field(default=PolicySourceEnum.FALLBACK_DEFAULT, description="Authoritative legal source")
    provenance_type: RoundingProvenanceType = Field(default=RoundingProvenanceType.DEFAULTED, description="Epistemic origin")
    evidence_reference: Optional[str] = Field(default=None, description="OCR token or fragment ID if explicitly disclosed")
    statutory_rule_id: Optional[str] = Field(default=None, description="e.g. EU-VAT-Art226, DE-GoBD-2024")
    discretion_permitted: bool = Field(default=False, description="Whether statutory law permits taxpayer discretion")
    intermediate_scale: int = Field(default=6, ge=4, le=16, description="Minimum intermediate calculation decimal precision")
    tolerance: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("0.05"), description="Divergence tolerance")

    @model_validator(mode="after")
    def validate_policy_consistency(self) -> "RoundingPolicy":
        code = self.currency_code.upper().strip()
        scale = self.currency_scale
        prov = self.provenance_type
        src = self.policy_source

        # Rule 1: Currency Scale Consistency with ISO 4217 Registry
        if code in ZERO_DECIMAL_CURRENCIES and scale != 0:
            raise ValueError(f"Currency {code} requires currency_scale=0, got {scale}")
        elif code in THREE_DECIMAL_CURRENCIES and scale != 3:
            raise ValueError(f"Currency {code} requires currency_scale=3, got {scale}")
        elif code in FOUR_DECIMAL_CURRENCIES and scale != 4:
            raise ValueError(f"Currency {code} requires currency_scale=4, got {scale}")
        elif code in ISO_4217_CURRENCY_SCALES and ISO_4217_CURRENCY_SCALES[code] == 2:
            if scale != 2 and prov != RoundingProvenanceType.OBSERVED:
                raise ValueError(f"Standard currency {code} defaults to scale=2 unless OBSERVED, got {scale}")

        # Rule 2: OBSERVED must originate from explicit disclosure with non-null evidence reference
        if prov == RoundingProvenanceType.OBSERVED:
            if src not in (PolicySourceEnum.DOCUMENT_EXPLICIT_DISCLOSURE, PolicySourceEnum.CONTRACTUAL_AGREEMENT):
                raise ValueError("OBSERVED rounding policy must have policy_source=DOCUMENT_EXPLICIT_DISCLOSURE or CONTRACTUAL_AGREEMENT")
            if not self.evidence_reference:
                raise ValueError("OBSERVED rounding policy requires non-null evidence_reference")

        # Rule 3: INFERRED must originate from jurisdiction or organization setting
        elif prov in (RoundingProvenanceType.INFERRED, RoundingProvenanceType.STATUTORY_INFERRED, RoundingProvenanceType.CONTRACT_SPECIFIED):
            valid_sources = (
                PolicySourceEnum.JURISDICTION_DEFAULT,
                PolicySourceEnum.ORGANIZATION_SETTING,
                PolicySourceEnum.STATUTORY_MANDATE,
                PolicySourceEnum.CONTRACTUAL_AGREEMENT,
            )
            if src not in valid_sources:
                raise ValueError(f"INFERRED policy must originate from one of {valid_sources}, got {src}")
            if self.evidence_reference is not None:
                raise ValueError("INFERRED policy cannot have an explicit text evidence_reference")

        # Rule 4: DEFAULTED must originate from FALLBACK_DEFAULT without evidence
        elif prov == RoundingProvenanceType.DEFAULTED:
            if src != PolicySourceEnum.FALLBACK_DEFAULT:
                raise ValueError("DEFAULTED policy must have policy_source=FALLBACK_DEFAULT")
            if self.evidence_reference is not None:
                raise ValueError("DEFAULTED policy cannot have evidence_reference")

        return self

    @property
    def quantum(self) -> Decimal:
        """Minor unit quantum for quantizing Decimal values."""
        if self.currency_scale == 0:
            return Decimal("1")
        return Decimal("10") ** -self.currency_scale

    def quantize(self, amount: Decimal) -> Decimal:
        """Quantize a Decimal value according to this policy's scale and rounding mode."""
        return quantize_amount(amount, self)


# ---------------------------------------------------------------------------
# Exact Quantization and Validation Functions
# ---------------------------------------------------------------------------

def quantize_amount(amount: Decimal, policy: RoundingPolicy) -> Decimal:
    """
    Quantize a monetary amount using the scale and rounding mode specified in policy.
    Zero floating-point contamination; uses Decimal.quantize.
    """
    if not isinstance(amount, Decimal):
        amount = Decimal(str(amount))

    py_mode = DECIMAL_ROUNDING_MAP.get(policy.rounding_mode, decimal.ROUND_HALF_UP)
    return amount.quantize(policy.quantum, rounding=py_mode)


def validate_intermediate_precision(amount: Decimal, min_decimals: int = 4) -> bool:
    """
    Validate that an intermediate calculation retains sufficient decimal precision
    (at least min_decimals fractional digits) to prevent premature quantization drift.
    Returns True if precision is adequate or if the amount is an exact integer.
    """
    if not isinstance(amount, Decimal):
        return False
    exp = amount.as_tuple().exponent
    # If exponent is an int <= -min_decimals, it has at least min_decimals fractional places
    if isinstance(exp, int) and exp <= -min_decimals:
        return True
    # If the number is an integer, exact arithmetic is preserved
    if amount == amount.to_integral_value():
        return True
    return False


def create_default_rounding_policy(
    currency_code: str = "USD",
    rounding_mode: RoundingModeEnum = RoundingModeEnum.ROUND_HALF_UP,
    rounding_stage: RoundingStageEnum = RoundingStageEnum.LINE_LEVEL,
    tolerance: Decimal = Decimal("0.00"),
) -> RoundingPolicy:
    """
    Construct a validated fallback default rounding policy for a given currency code.
    Scale is automatically resolved from ISO 4217 registry.
    """
    code_upper = currency_code.upper().strip()
    scale = get_currency_scale(code_upper)
    if scale is None:
        scale = 2  # Conservative fallback

    return RoundingPolicy(
        currency_code=code_upper,
        currency_scale=scale,
        rounding_mode=rounding_mode,
        rounding_stage=rounding_stage,
        policy_source=PolicySourceEnum.FALLBACK_DEFAULT,
        provenance_type=RoundingProvenanceType.DEFAULTED,
        tolerance=tolerance,
    )
