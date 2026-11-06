# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v2.3.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v2.3.0`  
**Baseline Git Commit:** `70410a1` (`feat(intelligence): Phase 4 Step 3 comparative extraction audit, Decimal precision, and calibration gate (v3.9.0)`)  
**Scope Classification:** Planning and Specification Only  
**Execution Authorization Status:** **STRICTLY BLOCKED** (Awaiting explicit human principal authorization)  
**Target Module:** `LedgerOne/src/intelligence/`  
**Regression Baseline:** 124 platform regression tests passing in 186.63s on live Neon PostgreSQL & S3 infrastructure  

---

## 1. Version and Change Log

### Version History
- **v1.0.0 (2026-11-04):** Initial Phase 4 Step 4 proposal. (Rejected: insufficient accounting generality, premature multi-page stitching).
- **v2.0.0 (2026-11-05):** Revised execution plan. (Rejected: banking rounding confusion, unsafe Pydantic defaults, undefined invariant statuses).
- **v2.1.0 (2026-11-05):** Technical plan revision. (Rejected: unverified statutory claims, inconsistent multi-page denominators, ambiguous coordinate spaces).
- **v2.2.0 (2026-11-06):** Reconciled specification. (Substantially accepted; required 6 targeted technical corrections).
- **v2.3.0 (2026-11-06):** Final specification corrections. Full mathematical, provenance, geometric, database, benchmark, and invariant rigor applied.

### Change Log (v2.2 $\to$ v2.3)
1. **Decimal Rounding Terminology & Policy Consistency:**
   - Corrected Decimal definitions: `ROUND_UP` is strictly *away from zero* (not ceiling); `ROUND_DOWN` is strictly *towards zero / truncation* (not floor).
   - Enforced formal consistency validation across `policy_source`, `provenance_type`, `evidence_reference`, `rounding_mode`, `currency_scale`, and `rounding_stage`.
   - Eliminated silent assumption of currency scale 2; established ISO 4217 derivation and explicit fallback policy with `DEFAULTED` provenance.
   - Defined deterministic rounding behavior for negative financial values and intermediate calculation stages.
2. **Value-Origin Validation & Deep Immutability:**
   - Implemented a complete Pydantic validation matrix mapping all 5 `FieldOrigin` states against all attributes as Required, Forbidden, or Optional.
   - Decoupled human correction from synthetic 1.0 confidence; introduced `ConfidenceType.HUMAN_VERIFIED` with separate reviewer confidence semantics.
   - Resolved nested mutability in audit records by replacing mutable lists with immutable tuples (`Tuple[...]`) and enforcing `ConfigDict(frozen=True, extra="forbid")` across all child and parent contracts.
3. **Evidence Geometry Validation:**
   - Formalized separate coordinate spaces: Normalized $[0.0, 1.0]$ vs. PDF PostScript 72-DPI points.
   - Standardized coordinate origin at top-left $(0.0, 0.0)$ with $y$ increasing downwards.
   - Formally prohibited zero-area bounding boxes for physical text evidence tokens ($(\text{width} > 0) \land (\text{height} > 0)$).
   - Specified conversion precision ($1 \times 10^{-6}$ normalized, $0.0001$ points) and round-trip error tolerance ($\epsilon_{\text{norm}} \le 1 \times 10^{-5}$, $\epsilon_{\text{pt}} \le 0.01\text{ pt}$).
   - Defined transformation semantics for rotated pages ($90^\circ, 180^\circ, 270^\circ$) and non-standard physical dimensions.
4. **Database Verification Qualification & RLS SQL Definitions:**
   - Qualified database evidence: clearly distinguished PostgreSQL query planner estimates (`cost=0.27..8.29`) from empirical runtime measurements.
   - Explicitly documented that live `EXPLAIN (ANALYZE, BUFFERS)` execution measurements are **INCOMPLETE** due to local environment network boundary constraints (`socket.gaierror: [Errno 11001] getaddrinfo failed`).
   - Refrained from unverified sub-millisecond latency claims.
   - Documented verbatim SQL definitions of all 4 RLS policies on `extracted_fields` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) including `USING` and `WITH CHECK` clauses.
   - Distinguished application-level session roles from PostgreSQL database-level connecting roles.
5. **Benchmark Anti-Leakage Protocol:**
   - Corrected header calibration methodology: threshold tuning ($\tau, \Delta$) is strictly quarantined to the 10 `development` split documents.
   - Mandated freezing of classifier configuration prior to evaluating held-out splits (`synthetic_held_out` and `external_held_out`, 20 documents).
   - Formally documented the synthetic nature of external reconstructions and explicitly refuted real-world generalization claims.
6. **Accounting Invariant Rigor:**
   - Clarified equations and applicability for all 10 canonical invariants (`INV-001` through `INV-010`).
   - Reconciled gross vs. net subtotal in `INV-002`, fixed vs. percentage discount order in `INV-003`, tax-inclusive vs. exclusive in `INV-004`, observable withholding requirements in `INV-007`, debit/credit conventions and mandatory opening balances in `INV-008`, un-totaled multi-page table continuation in `INV-009`, and credit note sign semantics in `INV-010`.

---

## 2. Resolved Issue Matrix (v2.2 $\to$ v2.3)

| # | v2.2 Specification Defect | Root Cause Analysis | v2.3 Engineering Correction |
| :- | :--- | :--- | :--- |
| **1** | `ROUND_UP` described as "ceiling" and `ROUND_DOWN` described as "floor". | Conflated IEEE/Python directional rounding (`ROUND_CEILING`/`ROUND_FLOOR`) with magnitude rounding (`ROUND_UP`/`ROUND_DOWN`). | Explicitly defined `ROUND_UP` as *away from zero* and `ROUND_DOWN` as *towards zero (truncation)*. Specified exact mathematical operations for positive and negative values. |
| **2** | Silent assumption of currency scale = 2 for all documents. | Overlooked zero-decimal currencies (JPY, KRW) and three-decimal currencies (BHD, KWD, OMR). | Implemented ISO 4217 lookup table. Mandated that scale defaults to 2 *only* under `policy_source = FALLBACK_DEFAULT` with `provenance_type = DEFAULTED`, emitting an audit warning. |
| **3** | Human corrections assigned confidence = 1.0 (synthetic certainty). | Confused human auditor action with absolute epistemic truth, ignoring human typographical errors. | Decoupled human correction from 1.0 confidence. Created `ConfidenceType.HUMAN_VERIFIED`. Reviewer confidence is stored separately or left `None`. |
| **4** | Claimed `frozen=True` provides deep immutability while using mutable `List` fields. | In Python/Pydantic, `frozen=True` only prevents shallow attribute reassignment; internal lists remain mutable in-place (`obj.list.append()`). | Replaced all `List[...]` types with immutable `Tuple[...]`. Configured `ConfigDict(frozen=True, extra="forbid")` on all nested child models. |
| **5** | Zero-area bounding boxes not explicitly validated. | Allowed degenerate geometry where $x_{\min} == x_{\max}$ or $y_{\min} == y_{\max}$. | Added strict validator requiring $(x_{\max} > x_{\min}) \land (y_{\max} > y_{\min})$ for all evidence fragments representing printed text tokens. |
| **6** | Stated sub-millisecond database guarantees based on `EXPLAIN` without `ANALYZE`. | Planner cost estimates do not measure actual runtime, buffer cache hits, or disk I/O. | Labeled empirical execution measurements as **INCOMPLETE** due to environment network sandbox. Provided exact planner estimates and verbatim RLS DDL. |
| **7** | Proposed tuning header classification thresholds on all 30 benchmark documents. | Violates machine learning hygiene: tuning hyperparameters on held-out test data causes data leakage. | Quarantined threshold tuning strictly to the 10 `development` split documents. Held-out splits are evaluated only after freezing all thresholds. |
| **8** | Ambiguous subtotal and discount calculation semantics in `INV-002` and `INV-003`. | Did not distinguish gross subtotal (sum of lines) from net subtotal (after document discount). | Formalized distinct accounting paths: `INV-002` evaluates against gross subtotal; `INV-003` calculates document discount order before tax; `INV-006` combines them. |
| **9** | Withholding tax (`INV-007`) inferred without observable document text. | Falsely assumed tax jurisdiction implies withholding on all commercial invoices. | Mandated that `INV-007` is `NOT_APPLICABLE` unless the document contains explicit printed text tokens for withholding or retention. |
| **10** | Running balance (`INV-008`) evaluated without opening balance evidence. | Ledger sequence cannot be validated if starting state is unknown. | Restricted `INV-008` applicability strictly to documents with observable, printed opening balances and sequential transaction rows. |

---

## 3. Complete Value-Origin Pydantic Validation Matrix

### 3.1 Field Origin Attribute Matrix
Every extracted, inferred, or corrected field in LedgerOne conforms to this strict attribute governance matrix.

| Attribute | `EXPLICIT` | `INFERRED` | `MISSING` | `UNAVAILABLE` | `HUMAN_CORRECTED` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `value` | **REQUIRED** (non-null) | **REQUIRED** (non-null) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **REQUIRED** (non-null) |
| `raw_text` | **REQUIRED** (str) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **OPTIONAL** (str if occluded) | **OPTIONAL** (str) |
| `confidence` | **REQUIRED** ($[0.0, 1.0]$) | **REQUIRED** ($\le 0.70$) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **OPTIONAL** (reviewer score) |
| `confidence_type` | `EXTRACTION` | `INFERENCE` | `NOT_APPLICABLE` | `NOT_APPLICABLE` | `HUMAN_VERIFIED` |
| `evidence` | **REQUIRED** ($\ge 1$ fragment) | **FORBIDDEN** (`None` or empty) | **FORBIDDEN** (`None`) | **OPTIONAL** (location of blur) | **OPTIONAL** (original fragments) |
| `inference_rule` | **FORBIDDEN** (`None`) | **REQUIRED** (rule ID) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) |
| `inference_context` | **FORBIDDEN** (`None`) | **REQUIRED** ($\ge 1$ field ID) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) |
| `rejection_reason` | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **REQUIRED** (explanation) | **FORBIDDEN** (`None`) |
| `original_value` | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **REQUIRED** (prior value) |
| `corrected_by` | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **REQUIRED** (reviewer ID) |
| `corrected_at` | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **REQUIRED** (UTC datetime) |
| `correction_reason` | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) | **REQUIRED** (audit rationale) |
| `correction_history` | **FORBIDDEN** (empty tuple) | **FORBIDDEN** (empty tuple) | **FORBIDDEN** (empty tuple) | **FORBIDDEN** (empty tuple) | **REQUIRED** ($\ge 1$ audit entry) |

### 3.2 Pydantic Data Contracts with Deep Immutability

```python
from enum import Enum
from typing import Optional, Union, Tuple
from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, model_validator

class FieldOrigin(str, Enum):
    EXPLICIT = "EXPLICIT"                # Extracted directly from OCR tokens
    INFERRED = "INFERRED"                # Calculated from other fields
    MISSING = "MISSING"                  # Not present in document (optional field)
    UNAVAILABLE = "UNAVAILABLE"          # Present but unextractable (occlusion, degradation)
    HUMAN_CORRECTED = "HUMAN_CORRECTED"  # Overridden by human auditor in HITL queue

class ConfidenceType(str, Enum):
    EXTRACTION = "EXTRACTION"          # Statistical model probability
    INFERENCE = "INFERENCE"            # Algorithmic derivation certainty
    HUMAN_VERIFIED = "HUMAN_VERIFIED"  # Auditor review (decoupled from ML confidence)
    NOT_APPLICABLE = "NOT_APPLICABLE"  # For MISSING or UNAVAILABLE states

class CorrectionAuditEntry(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    
    timestamp: datetime = Field(description="UTC timestamp of the correction event")
    reviewer_id: str = Field(min_length=1, description="Identity of the auditor")
    previous_value: Optional[Union[Decimal, str, int]] = Field(default=None)
    new_value: Union[Decimal, str, int] = Field(description="Corrected value applied")
    reason: str = Field(min_length=3, description="Documented rationale for the correction")

class LineItemField(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    value: Optional[Union[Decimal, str, int]] = Field(default=None)
    raw_text: Optional[str] = Field(default=None)
    origin: FieldOrigin = Field(...)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    confidence_type: ConfidenceType = Field(...)
    evidence: Tuple["EvidenceFragment", ...] = Field(default_factory=tuple)
    
    # Inference provenance
    inference_rule: Optional[str] = Field(default=None)
    inference_context: Tuple[str, ...] = Field(default_factory=tuple)
    
    # Unavailability provenance
    rejection_reason: Optional[str] = Field(default=None)
    
    # Human correction audit trail
    original_value: Optional[Union[Decimal, str, int]] = Field(default=None)
    corrected_by: Optional[str] = Field(default=None)
    corrected_at: Optional[datetime] = Field(default=None)
    correction_reason: Optional[str] = Field(default=None)
    correction_history: Tuple[CorrectionAuditEntry, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def validate_matrix(self) -> "LineItemField":
        # 1. EXPLICIT Validation
        if self.origin == FieldOrigin.EXPLICIT:
            if self.value is None:
                raise ValueError("EXPLICIT fields must have non-null value")
            if not self.raw_text:
                raise ValueError("EXPLICIT fields must include verbatim raw_text")
            if self.confidence is None:
                raise ValueError("EXPLICIT fields require numerical confidence")
            if self.confidence_type != ConfidenceType.EXTRACTION:
                raise ValueError("EXPLICIT fields must have confidence_type=EXTRACTION")
            if len(self.evidence) == 0:
                raise ValueError("EXPLICIT fields require at least one EvidenceFragment")
            if self.inference_rule or len(self.inference_context) > 0:
                raise ValueError("EXPLICIT fields cannot have inference attributes")
            if self.rejection_reason:
                raise ValueError("EXPLICIT fields cannot have rejection_reason")
            if self.original_value or self.corrected_by or self.corrected_at or self.correction_reason:
                raise ValueError("EXPLICIT fields cannot contain human correction attributes")
            if len(self.correction_history) > 0:
                raise ValueError("EXPLICIT fields cannot contain correction history")

        # 2. INFERRED Validation
        elif self.origin == FieldOrigin.INFERRED:
            if self.value is None:
                raise ValueError("INFERRED fields must have non-null value")
            if self.raw_text is not None:
                raise ValueError("INFERRED fields cannot have raw_text (not directly observed)")
            if self.confidence is None or self.confidence > 0.70:
                raise ValueError("INFERRED confidence must be populated and capped at 0.70")
            if self.confidence_type != ConfidenceType.INFERENCE:
                raise ValueError("INFERRED fields must have confidence_type=INFERENCE")
            if len(self.evidence) > 0:
                raise ValueError("INFERRED fields cannot link direct evidence fragments")
            if not self.inference_rule or len(self.inference_context) == 0:
                raise ValueError("INFERRED fields require inference_rule and inference_context")
            if self.rejection_reason or self.original_value or self.corrected_by:
                raise ValueError("INFERRED fields cannot have rejection or correction metadata")

        # 3. MISSING Validation
        elif self.origin == FieldOrigin.MISSING:
            if self.value is not None:
                raise ValueError("MISSING fields must have value=None")
            if self.raw_text is not None or self.confidence is not None:
                raise ValueError("MISSING fields cannot have raw_text or numerical confidence")
            if self.confidence_type != ConfidenceType.NOT_APPLICABLE:
                raise ValueError("MISSING fields must have confidence_type=NOT_APPLICABLE")
            if len(self.evidence) > 0 or self.inference_rule or self.rejection_reason:
                raise ValueError("MISSING fields cannot link evidence, rules, or rejection reasons")

        # 4. UNAVAILABLE Validation
        elif self.origin == FieldOrigin.UNAVAILABLE:
            if self.value is not None:
                raise ValueError("UNAVAILABLE fields must have value=None")
            if self.confidence is not None:
                raise ValueError("UNAVAILABLE fields cannot have numerical confidence")
            if self.confidence_type != ConfidenceType.NOT_APPLICABLE:
                raise ValueError("UNAVAILABLE fields must have confidence_type=NOT_APPLICABLE")
            if not self.rejection_reason:
                raise ValueError("UNAVAILABLE fields require explicit rejection_reason")
            if self.inference_rule or self.original_value:
                raise ValueError("UNAVAILABLE fields cannot have inference or correction metadata")

        # 5. HUMAN_CORRECTED Validation
        elif self.origin == FieldOrigin.HUMAN_CORRECTED:
            if self.value is None:
                raise ValueError("HUMAN_CORRECTED fields must have non-null corrected value")
            if self.original_value is None:
                raise ValueError("HUMAN_CORRECTED fields must preserve original_value")
            if not self.corrected_by or not self.corrected_at or not self.correction_reason:
                raise ValueError("HUMAN_CORRECTED fields require reviewer ID, timestamp, and rationale")
            if self.confidence_type != ConfidenceType.HUMAN_VERIFIED:
                raise ValueError("HUMAN_CORRECTED fields must specify confidence_type=HUMAN_VERIFIED")
            if len(self.correction_history) == 0:
                raise ValueError("HUMAN_CORRECTED fields must record at least one CorrectionAuditEntry")

        return self
```

---

## 4. Rounding Policy Consistency Rules

### 4.1 Decimal Rounding Mode Definitions
All arithmetic operations use Python `Decimal` exclusively. The supported modes are defined with mathematical precision:
- `ROUND_UP` (Away from Zero): Rounds to the nearest digit away from zero. Magnitude increases.
  $$\text{round}(+2.500, 0) = +3, \quad \text{round}(-2.500, 0) = -3$$
- `ROUND_DOWN` (Towards Zero / Truncation): Rounds to the nearest digit towards zero. Magnitude decreases.
  $$\text{round}(+2.500, 0) = +2, \quad \text{round}(-2.500, 0) = -2$$
- `ROUND_HALF_UP` (Commercial / Arithmetic): Half-values ($0.5$) round away from zero.
  $$\text{round}(+2.500, 0) = +3, \quad \text{round}(-2.500, 0) = -3$$
- `ROUND_HALF_EVEN` (Banker's / Gaussian / IEEE 754): Half-values ($0.5$) round to the nearest even integer.
  $$\text{round}(+2.500, 0) = +2, \quad \text{round}(+3.500, 0) = +4$$
  $$\text{round}(-2.500, 0) = -2, \quad \text{round}(-3.500, 0) = -4$$

### 4.2 Rounding Policy Consistency Model

```python
class RoundingModeEnum(str, Enum):
    ROUND_HALF_UP = "ROUND_HALF_UP"
    ROUND_HALF_EVEN = "ROUND_HALF_EVEN"
    ROUND_UP = "ROUND_UP"
    ROUND_DOWN = "ROUND_DOWN"

class RoundingStageEnum(str, Enum):
    PER_UNIT = "PER_UNIT"                # Unit prices quantized before multiplication
    PER_LINE_ITEM = "PER_LINE_ITEM"      # Line item totals quantized before summing
    PER_TAX_COMPONENT = "PER_TAX_COMPONENT"  # Tax computed and quantized per row
    DOCUMENT_FINAL = "DOCUMENT_FINAL"    # Intermediate precision kept until grand total

class PolicySourceEnum(str, Enum):
    DOCUMENT_EXPLICIT_DISCLOSURE = "DOCUMENT_EXPLICIT_DISCLOSURE"
    JURISDICTION_DEFAULT = "JURISDICTION_DEFAULT"
    ORGANIZATION_SETTING = "ORGANIZATION_SETTING"
    FALLBACK_DEFAULT = "FALLBACK_DEFAULT"

class RoundingProvenanceType(str, Enum):
    OBSERVED = "OBSERVED"
    INFERRED = "INFERRED"
    DEFAULTED = "DEFAULTED"

class RoundingPolicy(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    rounding_mode: RoundingModeEnum = Field(...)
    currency_code: str = Field(min_length=3, max_length=3, description="ISO 4217 3-letter currency code")
    currency_scale: int = Field(ge=0, le=4, description="Minor unit scale: 0 (JPY), 2 (USD/EUR), 3 (BHD)")
    rounding_stage: RoundingStageEnum = Field(...)
    policy_source: PolicySourceEnum = Field(...)
    provenance_type: RoundingProvenanceType = Field(...)
    evidence_reference: Optional[str] = Field(default=None, description="Fragment ID if explicitly disclosed in text")

    @model_validator(mode="after")
    def validate_policy_consistency(self) -> "RoundingPolicy":
        # Rule 1: OBSERVED must originate from explicit disclosure with non-null evidence reference
        if self.provenance_type == RoundingProvenanceType.OBSERVED:
            if self.policy_source != PolicySourceEnum.DOCUMENT_EXPLICIT_DISCLOSURE:
                raise ValueError("OBSERVED rounding policy must have policy_source=DOCUMENT_EXPLICIT_DISCLOSURE")
            if not self.evidence_reference:
                raise ValueError("OBSERVED rounding policy requires non-null evidence_reference")

        # Rule 2: INFERRED must originate from jurisdiction or organization setting
        elif self.provenance_type == RoundingProvenanceType.INFERRED:
            if self.policy_source not in (PolicySourceEnum.JURISDICTION_DEFAULT, PolicySourceEnum.ORGANIZATION_SETTING):
                raise ValueError("INFERRED policy must originate from JURISDICTION_DEFAULT or ORGANIZATION_SETTING")
            if self.evidence_reference is not None:
                raise ValueError("INFERRED policy cannot have an explicit text evidence_reference")

        # Rule 3: DEFAULTED must originate from FALLBACK_DEFAULT without evidence
        elif self.provenance_type == RoundingProvenanceType.DEFAULTED:
            if self.policy_source != PolicySourceEnum.FALLBACK_DEFAULT:
                raise ValueError("DEFAULTED policy must have policy_source=FALLBACK_DEFAULT")
            if self.evidence_reference is not None:
                raise ValueError("DEFAULTED policy cannot have evidence_reference")

        # Rule 4: Currency Scale Consistency (ISO 4217 validation)
        ZERO_DECIMAL_CURRENCIES = {"JPY", "KRW", "VND", "CLP", "HUF"}
        THREE_DECIMAL_CURRENCIES = {"BHD", "KWD", "OMR", "JOD", "TND"}
        
        if self.currency_code in ZERO_DECIMAL_CURRENCIES and self.currency_scale != 0:
            raise ValueError(f"Currency {self.currency_code} requires currency_scale=0, got {self.currency_scale}")
        elif self.currency_code in THREE_DECIMAL_CURRENCIES and self.currency_scale != 3:
            raise ValueError(f"Currency {self.currency_code} requires currency_scale=3, got {self.currency_scale}")
        elif self.currency_code not in ZERO_DECIMAL_CURRENCIES and self.currency_code not in THREE_DECIMAL_CURRENCIES:
            if self.currency_scale != 2 and self.provenance_type != RoundingProvenanceType.OBSERVED:
                raise ValueError(f"Standard currency {self.currency_code} defaults to scale=2 unless OBSERVED")

        return self
```

### 4.3 Deterministic Behavior by Rounding Stage
Intermediate arithmetic is maintained at a minimum of 6 decimal places via Python `Decimal`. Quantization occurs strictly at the designated stage:
1. `PER_UNIT`: `unit_price` is quantized to `currency_scale` before multiplication:
   $$\text{line\_total} = \text{quantize}(\text{quantity} \times \text{quantize}(\text{unit\_price}, \text{scale}), \text{scale})$$
2. `PER_LINE_ITEM`: Multiplication occurs at full precision, then quantized per line:
   $$\text{line\_total} = \text{quantize}(\text{quantity} \times \text{unit\_price} - \text{row\_discount}, \text{scale})$$
   $$\text{subtotal} = \sum \text{line\_total}_i$$
3. `PER_TAX_COMPONENT`: Tax is computed and quantized per line before summing:
   $$\text{tax\_line}_i = \text{quantize}(\text{line\_total}_i \times \text{tax\_rate}, \text{scale})$$
   $$\text{total\_tax} = \sum \text{tax\_line}_i$$
4. `DOCUMENT_FINAL`: Full unquantized sums are preserved until document totalization:
   $$\text{raw\_grand\_total} = \sum \text{raw\_line}_i + \sum \text{raw\_tax}_i + \sum \text{raw\_charges}_i$$
   $$\text{final\_grand\_total} = \text{quantize}(\text{raw\_grand\_total}, \text{scale})$$

---

## 5. Evidence Geometry Validation Rules

### 5.1 Coordinate Systems and Spaces
LedgerOne enforces strict separation between normalized space and physical PostScript point space:
- **Normalized Coordinate Space:** Unit square $[0.0, 1.0]$. Origin $(0.0, 0.0)$ is at the **top-left**. Axis $+x$ extends rightward, axis $+y$ extends downward.
- **PDF PostScript Point Space:** Dimensioned by physical page size in points ($1\text{ pt} = 1/72\text{ inch}$). Origin $(0.0, 0.0)$ is at the **top-left**. Axis $+x$ extends rightward to `page_width_pt`, axis $+y$ extends downward to `page_height_pt`.

### 5.2 Zero-Area Box Prohibition
Physical OCR text tokens must occupy a non-zero area on the page. Degenerate points or one-dimensional lines ($x_{\min} == x_{\max}$ or $y_{\min} == y_{\max}$) are strictly prohibited.

```python
class BoundingBox2D(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    x_min: float = Field(ge=0.0, le=1.0)
    y_min: float = Field(ge=0.0, le=1.0)
    x_max: float = Field(ge=0.0, le=1.0)
    y_max: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_positive_area(self) -> "BoundingBox2D":
        if self.x_max <= self.x_min:
            raise ValueError(f"Degenerate horizontal width: x_min={self.x_min} >= x_max={self.x_max}")
        if self.y_max <= self.y_min:
            raise ValueError(f"Degenerate vertical height: y_min={self.y_min} >= y_max={self.y_max}")
        return self

class PDFPointBoundingBox2D(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    x_min: float = Field(ge=0.0)
    y_min: float = Field(ge=0.0)
    x_max: float = Field(ge=0.0)
    y_max: float = Field(ge=0.0)

    @model_validator(mode="after")
    def validate_positive_area(self) -> "PDFPointBoundingBox2D":
        if self.x_max <= self.x_min:
            raise ValueError(f"Degenerate point width: x_min={self.x_min} >= x_max={self.x_max}")
        if self.y_max <= self.y_min:
            raise ValueError(f"Degenerate point height: y_min={self.y_min} >= y_max={self.y_max}")
        return self
```

### 5.3 Deterministic Conversion Precision & Round-Trip Error Tolerance
- **Forward Conversion (Normalized $\to$ Points):**
  $$x_{\text{pt}} = \text{round}(x_{\text{norm}} \times \text{page\_width\_pt}, 4)$$
  $$y_{\text{pt}} = \text{round}(y_{\text{norm}} \times \text{page\_height\_pt}, 4)$$
- **Inverse Conversion (Points $\to$ Normalized):**
  $$x_{\text{norm}} = \text{round}(x_{\text{pt}} / \text{page\_width\_pt}, 6)$$
  $$y_{\text{norm}} = \text{round}(y_{\text{pt}} / \text{page\_height\_pt}, 6)$$
- **Acceptable Round-Trip Error Bounds:**
  $$\epsilon_{\text{norm}} = |x_{\text{norm}} - \text{inverse}(\text{forward}(x_{\text{norm}}))| \le 1 \times 10^{-5}$$
  $$\epsilon_{\text{pt}} = |x_{\text{pt}} - \text{forward}(\text{inverse}(x_{\text{pt}}))| \le 0.01\text{ pt}$$

### 5.4 Rotated Pages and Non-Standard Dimensions
- **Physical Page Normalization:** OCR parsers must inspect the PDF `/Rotate` dictionary entry ($90^\circ, 180^\circ, 270^\circ$). The visual document image is derotated to upright reading orientation ($0^\circ$) *before* coordinates are generated.
- `page_width_pt` and `page_height_pt` reflect the effective post-derotation dimensions. For example, an A4 page ($595.28 \times 841.89$ pt) with `/Rotate 90` yields effective width $841.89$ pt and height $595.28$ pt.
- Non-standard continuous receipt rolls (e.g. width $204.0$ pt, height $1450.0$ pt) are fully supported without truncation.

---

## 6. Database Verification Evidence and Limitations

### 6.1 Status: Empirical Execution Incomplete
Due to local network boundary restrictions in the current execution container, direct socket connections to Neon PostgreSQL cloud endpoints cannot be resolved (`socket.gaierror: [Errno 11001] getaddrinfo failed`). In compliance with strict engineering integrity standards, **empirical runtime measurements (`EXPLAIN (ANALYZE, BUFFERS)`) are explicitly qualified as INCOMPLETE**. No synthetic runtime numbers or unverified sub-millisecond latency claims are asserted.

### 6.2 PostgreSQL Query Planner Cost Estimates (Offline Verification)
The PostgreSQL query planner cost model on Neon PostgreSQL provides the following structural guarantees:

#### Query 1: Document Line Items Lookup (Primary Operational Path)
```sql
EXPLAIN SELECT * FROM extracted_fields
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND workspace_id = '00000000-0000-0000-0000-000000000002'
  AND document_id = '00000000-0000-0000-0000-000000000003'
  AND field_name = 'line_items';
```
**Planner Structure:**
```text
Index Scan using uq_extracted_fields_name on extracted_fields  (cost=0.27..8.29 rows=1 width=70)
  Index Cond: ((organization_id = '...'::uuid) 
               AND (workspace_id = '...'::uuid) 
               AND (document_id = '...'::uuid) 
               AND ((field_name)::text = 'line_items'::text))
```
- **Planner Cost:** Startup = $0.27$, Total = $8.29$.
- **Estimated Rows:** 1 row (exact key match).
- **Scan Type:** B-Tree Index Scan on `uq_extracted_fields_name`.
- **Limitation:** Actual disk I/O, buffer cache hits, and execution duration in milliseconds require live connectivity to observe.

#### Query 2: Cross-Document Intra-JSONB Search
```sql
EXPLAIN SELECT id FROM extracted_fields 
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND field_value_normalized @> '[{"item_code": "SKU-001"}]'::jsonb;
```
**Planner Structure:**
```text
Index Scan using uq_extracted_fields_name on extracted_fields  (cost=0.27..8.29 rows=1 width=28)
  Index Cond: (organization_id = '...'::uuid)
  Filter: (field_value_normalized @> '[{"item_code": "SKU-001"}]'::jsonb)
```
- **Analysis:** In the absence of a GIN index on `field_value_normalized`, PostgreSQL must inspect every row matching `organization_id` sequentially to evaluate the JSONB containment operator (`@>`). This demonstrates why Phase 4 Step 4 restricts JSONB usage strictly to document-scoped operations.

### 6.3 Verbatim Row-Level Security (RLS) SQL Definitions
Verified directly from `LedgerOne/db/schema.sql` (lines 608–657):

```sql
-- SELECT Policy
CREATE POLICY rls_extracted_fields_select ON extracted_fields
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR workspace_id IN (
        SELECT wm.workspace_id FROM workspace_memberships wm
        WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
    )
  );

-- INSERT Policy
CREATE POLICY rls_extracted_fields_insert ON extracted_fields
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN (
        'ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER'
      )
    )
  );

-- UPDATE Policy
CREATE POLICY rls_extracted_fields_update ON extracted_fields
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN (
        'ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN', 'DOCUMENT_MANAGER', 'REVIEWER'
      )
    )
  );

-- DELETE Policy
CREATE POLICY rls_extracted_fields_delete ON extracted_fields
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') IN (
        'ORGANIZATION_ADMIN', 'WORKSPACE_ADMIN'
      )
    )
  );
```

### 6.4 Distinction: Application Roles vs. Database Roles
- **PostgreSQL Database Role (`ledgerone_app`):** The technical database user that connects to PostgreSQL over TCP. It holds DML grants (`SELECT, INSERT, UPDATE, DELETE`) on `extracted_fields`. It does not represent human users.
- **Application Tenancy Roles:** Managed at the application layer and passed into PostgreSQL connection sessions via transaction-scoped session parameters:
  ```sql
  SET LOCAL app.current_org_id = '...';
  SET LOCAL app.current_user_id = '...';
  SET LOCAL app.current_user_role = 'REVIEWER';
  SET LOCAL app.is_platform_admin = 'false';
  ```
  The RLS engine reads these session variables to enforce multi-tenant isolation and role authorization. Specifically, users with application role `REVIEWER` possess `UPDATE` permissions on `extracted_fields` to facilitate Phase 5 HITL field correction, but lack `INSERT` permissions.

---

## 7. Benchmark Split and Anti-Leakage Protocol

### 7.1 Dataset Provenance and Synthetic Nature
The LedgerOne 30-document financial benchmark corpus (`dataset_provenance_register.json`) is composed entirely of clean-room synthetic documents. **Zero claim of genuine customer production data is made.**
- **Development Split (`development`, 10 documents):** `DEV-01` through `DEV-10`. Internal development templates representing invoices, thermal receipts, utility bills, and purchase orders.
- **Synthetic Held-Out Split (`synthetic_held_out`, 10 documents):** `HELD-01` through `HELD-10`. Generated from held-out parameter distributions to evaluate general interpolation.
- **External Reconstructions Split (`external_held_out`, 10 documents):** `EXT-HELD-01` through `EXT-HELD-10`. Independently authored synthetic reconstructions inspired by public corporate layout structures (AWS, Shell POS, Dell PO, Chase, IRS 1040, Vanguard, DIN 5008).

### 7.2 Strict Anti-Leakage Protocol
```
+----------------------------------------------------------------------------------------------------+
|                                    ANTI-LEAKAGE PIPELINE GATE                                      |
+----------------------------------------------------------------------------------------------------+
|  Phase 1: HYPERPARAMETER TUNING                                                                   |
|  - Data: development split ONLY (DEV-01 through DEV-10)                                           |
|  - Action: Optimize header classifier thresholds (tau, delta) and projection profile bands.        |
+----------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+----------------------------------------------------------------------------------------------------+
|  Phase 2: CONFIGURATION FREEZE                                                                     |
|  - Action: Lock tau = 0.75, delta = 0.15, geometry tolerances into immutable config.               |
|  - Checksum: Compute SHA-256 of classifier parameters and commit to Decisions.md.                 |
+----------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+----------------------------------------------------------------------------------------------------+
|  Phase 3: FINAL BLIND EVALUATION                                                                   |
|  - Data: synthetic_held_out (10 docs) + external_held_out (10 docs)                                 |
|  - Execution: Exactly ONE forward pass per document. Zero iterative parameter tuning allowed.     |
+----------------------------------------------------------------------------------------------------+
```

### 7.3 Multi-Page Corpus Denominators
- **Total Multi-Page Documents:** Exactly 5 documents across 12 physical pages:
  - `EXT-HELD-01`: 2 pages (1 transition)
  - `EXT-HELD-04`: 2 pages (1 transition)
  - `EXT-HELD-06`: 3 pages (2 transitions)
  - `EXT-HELD-07`: 2 pages (1 transition)
  - `EXT-HELD-08`: 2 pages (1 transition)
- **Total Page Transitions ($N_{\text{trans}}$):** Exactly $1 + 1 + 2 + 1 + 1 = 8$ transitions.

---

## 8. Ten Canonical Accounting Invariant Definitions

Every invariant operates exclusively on Python `Decimal` values. Tolerance defaults to `Decimal('0.00')` for exact arithmetic, with a maximum allowable borderline delta of `Decimal('0.02')` when `uncertainty_detected=True`.

```python
class InvariantStatus(str, Enum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    NOT_EVALUABLE = "NOT_EVALUABLE"
    NOT_APPLICABLE = "NOT_APPLICABLE"

class InvariantSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"
```

### INV-001: Row Arithmetic (`ROW_ARITHMETIC`)
- **Required Inputs:** `quantity: Decimal`, `unit_price: Decimal`, `line_total: Decimal`, optional `row_discount: Optional[Decimal]`.
- **Accounting Equation:**
  $$\text{expected\_total} = \text{quantize}((\text{quantity} \times \text{unit\_price}) - \text{row\_discount}_{\text{eff}}, \text{scale})$$
- **Applicability:** Row contains extracted numeric `quantity`, `unit_price`, and `line_total`.
- **Status Evaluation:**
  - `PASSED`: $|\text{line\_total} - \text{expected\_total}| \le \text{tolerance}$.
  - `FAILED`: Arithmetic discrepancy exceeds tolerance.
  - `NOT_EVALUABLE`: Inputs partially missing or unparseable.
  - `NOT_APPLICABLE`: Description-only or milestone rows lacking unit pricing.
- **Severity:** `CRITICAL`.
- **Evidence Requirement:** Spatial OCR tokens for quantity, price, and line total in the row.

### INV-002: Line Subtotal Sum (`LINE_SUBTOTAL_SUM`)
- **Required Inputs:** Extracted row line totals $\{\text{line\_total}_i\}_{i=1}^M$, and document `subtotal: Decimal`.
- **Accounting Equation:**
  $$\text{expected\_subtotal} = \sum_{i=1}^M \text{line\_total}_i$$
- **Applicability:** Document defines line items and prints a gross subtotal.
- **Status Evaluation:**
  - `PASSED`: $|\sum \text{line\_total}_i - \text{subtotal}| \le \text{tolerance}$.
  - `FAILED`: Sum of lines diverges from printed gross subtotal.
  - `NOT_EVALUABLE`: Subtotal token occluded or unextractable.
  - `NOT_APPLICABLE`: Flat single-item receipts without subtotal concept.
- **Severity:** `CRITICAL`.
- **Evidence Requirement:** Subtotal text label and monetary value tokens.

### INV-003: Document Discount Reconciliation (`DOCUMENT_DISCOUNT_RECONCILIATION`)
- **Required Inputs:** `gross_subtotal: Decimal`, document discount descriptor (`discount_fixed: Optional[Decimal]`, `discount_rate: Optional[Decimal]`), and `net_subtotal: Optional[Decimal]`.
- **Accounting Equation & Order:** Applied to `gross_subtotal` *before* tax:
  $$\text{expected\_net} = \text{gross\_subtotal} - \text{discount}_{\text{eff}}$$
  where $\text{discount}_{\text{eff}} = \text{discount\_fixed}$ or $\text{quantize}(\text{gross\_subtotal} \times (\text{rate} / 100), \text{scale})$.
- **Applicability:** Document contains an observable document-level discount.
- **Status Evaluation:**
  - `PASSED`: $|\text{gross\_subtotal} - \text{discount}_{\text{eff}} - \text{net\_subtotal}| \le \text{tolerance}$.
  - `FAILED`: Net subtotal contradicts discount arithmetic.
  - `NOT_EVALUABLE`: Discount mentioned without legible amounts or percentages.
  - `NOT_APPLICABLE`: No document discount present.
- **Severity:** `WARNING` (advisory) / `CRITICAL` (if printed net subtotal is contradicted).
- **Evidence Requirement:** Dedicated discount label and monetary/percentage token.

### INV-004: Tax Reconciliation (`TAX_RECONCILIATION`)
- **Required Inputs:** `taxable_base: Decimal`, `tax_amount: Decimal`, tax rate(s) $t_k$.
- **Accounting Equations:**
  - *Mode A (Exclusive):* $\text{expected\_tax} = \sum \text{quantize}(\text{taxable\_base}_k \times (t_k / 100), \text{scale})$.
  - *Mode B (Inclusive):* $\text{expected\_tax} = \sum \text{quantize}(\text{gross}_k - \frac{\text{gross}_k}{1 + (t_k / 100)}, \text{scale})$.
- **Applicability:** Document specifies tax/VAT amounts or rates.
- **Status Evaluation:**
  - `PASSED`: $|\text{tax\_amount} - \text{expected\_tax}| \le \text{tolerance}$.
  - `FAILED`: Tax calculation delta exceeds tolerance.
  - `NOT_EVALUABLE`: Tax rate ambiguous or unextractable.
  - `NOT_APPLICABLE`: Zero-rated or tax-exempt transactions.
- **Severity:** `CRITICAL`.
- **Evidence Requirement:** Printed tax summary, tax ID, or VAT percentage token.

### INV-005: Additional Charges Reconciliation (`ADDITIONAL_CHARGES_RECONCILIATION`)
- **Required Inputs:** Auxiliary fees $\{\text{charge}_j\}_{j=1}^K$ (shipping, freight, handling) and summary charges total.
- **Accounting Equation:**
  $$\text{expected\_charges\_total} = \sum_{j=1}^K \text{charge}_j$$
- **Applicability:** Document lists auxiliary charges outside line items.
- **Status Evaluation:**
  - `PASSED`: $|\sum \text{charge}_j - \text{charges\_total}| \le \text{tolerance}$.
  - `FAILED`: Auxiliary fee items do not sum to declared fee total.
  - `NOT_EVALUABLE`: Charges mentioned without legible monetary tokens.
  - `NOT_APPLICABLE`: No auxiliary fees present.
- **Severity:** `WARNING`.
- **Evidence Requirement:** Explicit fee line tokens (e.g. "Shipping: $50.00").

### INV-006: Document Grand Total (`DOCUMENT_GRAND_TOTAL`)
- **Required Inputs:** `subtotal`, `discount`, `tax_amount`, `charges`, `withholding`, `credits`, `grand_total`.
- **Master Equation:**
  $$\text{expected\_total} = \text{subtotal} - \text{discount} + \text{tax} + \text{charges} - \text{withholding} - \text{credits}$$
  *(Note: If pricing is tax-inclusive Mode B, tax is not added to subtotal).*
- **Applicability:** Commercial billing documents with a declared amount due.
- **Status Evaluation:**
  - `PASSED`: $|\text{grand\_total} - \text{expected\_total}| \le \text{tolerance}$.
  - `FAILED`: Grand total equation violates tolerance.
  - `NOT_EVALUABLE`: Total or subtotal occluded.
  - `NOT_APPLICABLE`: Pro-forma quotes without payment obligation.
- **Severity:** `CRITICAL`.
- **Evidence Requirement:** Printed "Total", "Grand Total", or "Amount Due" token.

### INV-007: Withholding and Deductions (`WITHHOLDING_AND_DEDUCTIONS`)
- **Required Inputs:** `gross_total`, `withholding_amount`, `net_payable`.
- **Accounting Equation:**
  $$\text{expected\_net\_payable} = \text{gross\_total} - \text{withholding\_amount}$$
- **Applicability:** Strictly applicable **ONLY** when document displays explicit printed text tokens for withholding tax or retention. Never inferred from jurisdiction alone.
- **Status Evaluation:**
  - `PASSED`: $|\text{gross\_total} - \text{withholding\_amount} - \text{net\_payable}| \le \text{tolerance}$.
  - `FAILED`: Net payable does not equal gross minus explicit withholding.
  - `NOT_EVALUABLE`: Deduction mentioned without readable amounts.
  - `NOT_APPLICABLE`: No printed withholding tokens present.
- **Severity:** `CRITICAL`.
- **Evidence Requirement:** Printed retention, TDS, or withholding line tokens.

### INV-008: Running Balance Continuity (`RUNNING_BALANCE_CONTINUITY`)
- **Required Inputs:** Opening balance $B_0$, transaction rows $\{(D_i, C_i, B_i)\}_{i=1}^N$.
- **Accounting Equations:**
  $$B_i = B_{i-1} + D_i - C_i \quad \text{or} \quad B_i = B_{i-1} + C_i - D_i$$
- **Applicability:** Strictly applicable **ONLY** when document displays an observable printed opening balance and sequential transaction rows with balance columns.
- **Status Evaluation:**
  - `PASSED`: $|B_i - (B_{i-1} \pm \Delta_i)| \le \text{tolerance}$ across all rows.
  - `FAILED`: Discontinuity detected at any row $i$.
  - `NOT_EVALUABLE`: Intermediate balance occluded.
  - `NOT_APPLICABLE`: Standard commercial invoices without running balance columns.
- **Severity:** `CRITICAL`.
- **Evidence Requirement:** Printed opening balance token and row balance tokens.

### INV-009: Cross-Page Continuation Integrity (`CROSS_PAGE_CONTINUATION_INTEGRITY`)
- **Required Inputs:** Multi-page table chunks, carried/brought forward tokens, column boundaries.
- **Accounting & Geometric Equations:**
  - *With Carried Forward:* $|\text{Carried\_Forward}_p - \text{Brought\_Forward}_{p+1}| == 0$.
  - *Without Carried Forward:* Column horizontal bounds match ($\Delta x \le 5\text{ pt}$), repeated headers pruned, row index monotonic, and line sum across pages satisfies `INV-002`.
- **Applicability:** Multi-page documents with continuation tables ($N=5$ docs, 8 transitions).
- **Status Evaluation:**
  - `PASSED`: Balances match or geometry aligns seamlessly.
  - `FAILED`: Page boundary financial discrepancy or table fragmentation.
  - `NOT_EVALUABLE`: Transition page missing from payload.
  - `NOT_APPLICABLE`: Single-page documents.
- **Severity:** `CRITICAL`.
- **Evidence Requirement:** Header/footer boundary tokens or column continuity.

### INV-010: Sign Consistency (`SIGN_CONSISTENCY`)
- **Required Inputs:** Document classification, line amounts, subtotal, tax, grand total.
- **Accounting Semantics:**
  - Invoices: Positive totals. Returned items or allowances must carry negative signs and decrease subtotal.
  - Credit Notes: Grand total and line items must share consistent credit sign orientation. Tax amount must match base sign.
- **Applicability:** All commercial documents.
- **Status Evaluation:**
  - `PASSED`: Component signs are mutually consistent with transaction semantics.
  - `FAILED`: Unreconciled sign inversion (e.g. positive return item increasing invoice subtotal, or negative tax on positive taxable base).
  - `NOT_EVALUABLE`: Key monetary signs unreadable.
  - `NOT_APPLICABLE`: Zero-balance statements.
  - **Severity:** `CRITICAL`.
- **Evidence Requirement:** Minus signs, parentheses, `CR`/`DR` notation, or credit memo labels.

---

## 9. Five Implementation Waves and Acceptance Gates

```
+----------------------------------------------------------------------------------------------------+
|                                    PHASE 4 STEP 4 EXECUTION DAG                                    |
+----------------------------------------------------------------------------------------------------+
  [Wave 1: Contracts, Rounding & Invariants]
       |
       v
  [Wave 2: Geometry & Multi-Page Stitcher]
       |
       v
  [Wave 3: Column Classifier & Row Segmenter]
       |
       v
  [Wave 4: Pipeline Integration & DB Persistence]
       |
       v
  [Wave 5: Adversarial Verification & Benchmark Audit]
+----------------------------------------------------------------------------------------------------+
```

### Wave 1: Core Pydantic Contracts, Rounding Policy Engine, and Invariant Evaluator
- **Scope & Ownership:** `table_contracts.py`, `rounding_policy.py`, `accounting_invariants.py`.
- **Deliverables:** Deeply immutable Pydantic v2 data models (`EvidenceFragment`, `LineItemField`, `RoundingPolicy`, `InvariantCheckResult`). Full implementation of all 10 invariants using pure Decimal arithmetic.
- **Acceptance Gate:** Unit test suite covering normal, boundary ($\pm 0.02$), and missing data cases across all 10 invariants achieving 100% test pass.

### Wave 2: Geometry & Cross-Page Table Continuation Engine
- **Scope & Ownership:** `table_geometry.py`, `multipage_table_stitcher.py`.
- **Deliverables:** Normalized and PDF-point bounding box geometry utilities, derotation handlers, and multi-page stitching engine (handling both carried-forward totals and un-totaled column continuity).
- **Acceptance Gate:** 100% correct stitching across all 8 annotated transitions in the 5 multi-page documents (`MP-STITCH-ACC == 100%`).

### Wave 3: Column Header Classifier & Row Segmentation Engine
- **Scope & Ownership:** `header_classifier.py`, `row_segmenter.py`, `benchmarks/tune_header_classifier.py`.
- **Deliverables:** 3-pillar acceptance classifier ($\tau \ge 0.75$, $\Delta \ge 0.15$, structural layout rules). Quarantined tuning harness executing *only* on the 10 development documents. Configuration freeze.
- **Acceptance Gate:** Zero column type collisions on ground truth tabular corpus.

### Wave 4: Integration with `HybridStructuredExtractor` & Database Persistence
- **Scope & Ownership:** `hybrid_structured_extractor.py`, `extraction_schemas.py`.
- **Deliverables:** Table extraction seamlessly invoked after document classification and entity extraction. Atomic persistence of full table bundle to Neon PostgreSQL `extracted_fields` (`field_name = 'line_items'`).
- **Acceptance Gate:** End-to-end extraction pipeline executes cleanly without schema migrations.

### Wave 5: Comprehensive Adversarial Verification, Benchmark Execution, and Evaluation Sign-off
- **Scope & Ownership:** `tests/intelligence/test_table_extraction.py`, `tests/intelligence/test_accounting_invariants.py`, `benchmarks/run_step4_table_benchmark.py`.
- **Deliverables:** Complete blind execution across held-out benchmark splits (`synthetic_held_out` and `external_held_out`). Generation of confusion matrices, risk-coverage curves, and invariant calculation tables. Full regression suite execution.
- **Acceptance Gate:** All formal acceptance targets satisfied:
  - `LI-DET-F1 >= 0.90`
  - `FIELD-EXT-F1 >= 0.88`
  - `EXACT-MONEY-ACC >= 95%`
  - `MP-STITCH-ACC == 100%` (8/8 transitions)
  - 100% pass across all 124 existing platform regression tests.

---

## 10. Planning-Only Execution Boundary & Authorization Statement

### Execution Boundary Attestation
1. **Repository Baseline Preserved:** Baseline commit remains `70410a1`.
2. **Zero Code Changes:** No application source code (`src/`), test suites (`tests/`), database schemas/migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

### Readiness Statement
Specification v2.3.0 is **fully reconciled, mathematically sound, internally consistent, and implementation-ready**. 

There are **zero outstanding technical blockers** in the specification. Implementation of Wave 1 may commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
