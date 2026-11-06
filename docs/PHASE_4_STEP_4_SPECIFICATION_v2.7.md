# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v2.7.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v2.7.0`  
**Baseline Git Commit:** `70410a1` (`feat(intelligence): Phase 4 Step 3 comparative extraction audit, Decimal precision, and calibration gate (v3.9.0)`)  
**Scope Classification:** Strictly Planning and Specification Only  
**Execution Authorization Status:** **STRICTLY BLOCKED** (Awaiting explicit human principal authorization)  
**Target Module:** `LedgerOne/src/intelligence/`  
**Regression Baseline:** 124 platform regression tests passing on commit `70410a1`  

---

## 1. Version and Concise Change Log

### Version History
- **v1.0.0 (2026-11-04):** Initial Phase 4 Step 4 proposal. (Rejected: insufficient accounting generality, premature multi-page stitching).
- **v2.0.0 (2026-11-05):** Revised execution plan. (Rejected: banking rounding confusion, unsafe Pydantic defaults, undefined invariant statuses).
- **v2.1.0 (2026-11-05):** Technical plan revision. (Rejected: unverified statutory claims, inconsistent multi-page denominators, ambiguous coordinate spaces).
- **v2.2.0 (2026-11-06):** Reconciled specification. (Substantially accepted; required targeted technical corrections).
- **v2.3.0 (2026-11-06):** Specification corrections. (Addressed Pydantic contracts, Decimal rounding, evidence coordinates, and database qualification).
- **v2.4.0 (2026-11-06):** Security, geometry, currency, and accounting corrections. (RLS threat model, affine rotation, audit-chain continuity, benchmark freeze).
- **v2.5.0 (2026-11-06):** Financial and security consistency audit. (Currency registry, financial DAG, decoupled continuation pipeline).
- **v2.6.0 (2026-11-06):** Specification corrections. (HMAC architecture, 5 worked financial examples, pro-rata discount allocation, PDF `/UserUnit`).
- **v2.7.0 (2026-11-06):** Final security, financial, and verification closure. Completes HMAC signing trust chain and private context table security, extends deterministic rounding test suite with fractional minor units and largest-remainder residual allocation, defines complete invariant contract validation matrix, expands 7-role lifecycle permissions across business operations and document states, and details PDF rendering parity acceptance criteria.

### Concise Change Log (v2.6 $\to$ v2.7)
1. **HMAC Transaction-Context Security Chain & Private Context Storage:**
   - Formalized signing vs. verification actors: FastAPI application signs in isolated memory using `HMAC_SIGNING_KEY`; PostgreSQL verifies via `SECURITY DEFINER` function in schema `app_security`.
   - Prevented session-variable spoofing by storing verified context in a transaction-local private table `app_security.active_context` accessible only via security-definer getter functions, rather than untrusted `SET LOCAL`.
   - Documented explicit key rotation, revocation, and threat boundaries across all 5 threat vectors.
2. **Deterministic Rounding Verification & Extended Numerical Cases:**
   - Formulated four extended edge cases: (1) per-line vs document-level rounding divergence, (2) multiple tax components producing fractional minor units, (3) compounded tax with intermediate precision, and (4) pro-rata discount allocation with residual minor unit handling via Largest-Remainder Method (Hare-Niemeyer).
   - Reaffirmed that alternative rounding modes are strictly diagnostic and cannot override authoritative document policy.
3. **Complete Invariant-Result Contract & Validation Matrix:**
   - Formalized explicit status semantics for `PASSED`, `FAILED`, `NOT_EVALUABLE`, `NOT_APPLICABLE`.
   - Added validation rules prohibiting impossible status/attribute permutations.
   - Defined signed directional delta ($\text{delta} = \text{observed} - \text{expected}$) and full reproducibility metadata (`evaluator_version`, `policy_version`, `evaluated_at`, `diagnostic_rule_id`).
4. **Seven-Role Document Lifecycle & Business Authorization Matrix:**
   - Extended the 7-role matrix across 10 business operations (upload, edit metadata, change classification, correct fields, submit, verify, approve/reject, delete, view audit, modify history) and 8 document lifecycle states.
   - Enforced immutable audit logs: no role may edit or delete previous correction records.
5. **PDF Rendering Parity Acceptance Protocol:**
   - Formalized dual IoU criteria: page-level mean $\text{IoU} \ge 0.95$, per-region minimum $\text{IoU} \ge 0.85$, and coordinate drift $\le 0.5\text{ pt}$ (preventing aggregate masking of local errors).
   - Defined test suite of 15 fixtures across 6 geometry categories at 150 DPI and 300 DPI with Otsu's adaptive binarization.

---

## 2. Issue Resolution Matrix (v2.6 $\to$ v2.7)

| # | Domain | v2.6 Specification Gap | v2.7 Engineering Resolution |
| :- | :--- | :--- | :--- |
| **1** | **HMAC Security Chain** | Session parameters using `SET LOCAL` could theoretically be modified by `ledgerone_app` if raw SQL was executed. | Replaced session variable trust with private transaction table `app_security.active_context` populated by `SECURITY DEFINER` function and read via restricted getter functions. Coded complete key lifecycle, replay cache, and failure exceptions. |
| **2** | **Rounding Edge Cases** | Lacked numerical proofs for per-line vs document rounding divergence and residual discount distribution. | Formulated 4 explicit mathematical proofs detailing fractional cent divergences, compounded tax intermediate precision, and largest-remainder residual allocation ensuring $\sum \text{Allocated} == \text{Discount}$. |
| **3** | **Invariant Validation Matrix** | Contract did not formally prohibit invalid status/value combinations (e.g. `PASSED` with non-zero delta, or `NOT_EVALUABLE` with delta). | Built strict Pydantic model validator enforcing required, forbidden, and optional attributes for each `InvariantStatus`. Added directional signed delta and reproducibility metadata. |
| **4** | **Lifecycle Authorization** | 7-role matrix covered only DB CRUD without business operations or document lifecycle states. | Formulated comprehensive lifecycle matrix covering 10 business actions across 8 document states. Explicitly revoked audit modification privileges across all roles. |
| **5** | **PDF Rendering Parity** | Lacked per-region minimum IoU thresholds and concrete fixture definitions, risking aggregate masking of local drift. | Mandated per-region minimum $\text{IoU} \ge 0.85$ and drift $\le 0.5\text{ pt}$ alongside page mean $\ge 0.95$. Defined 15 fixtures across 6 categories at 150/300 DPI. |

---

## 3. Cryptographic HMAC Transaction Context Architecture & Security Trust Chain

### 3.1 Trust Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                CRYPTOGRAPHIC TRUST ARCHITECTURE                                    |
+----------------------------------------------------------------------------------------------------+
  [Client Web Browser / API Caller]
                 |
                 | (1) HTTPS + Bearer JWT
                 v
  [FastAPI Backend Application Layer]
  - Authenticates user JWT & resolves tenant membership
  - Holds in memory: HMAC_SIGNING_KEY (Never exposed to database or client)
  - Constructs canonical payload: key_id | org_id | workspace_id | user_id | role | is_admin | nonce | exp
  - Generates HMAC-SHA256 signature
                 |
                 | (2) Database connection from pool (User: 'ledgerone_app')
                 |     Executes: SELECT app_security.set_verified_context(payload, signature);
                 v
  [PostgreSQL Engine (Neon Cloud)]
  +------------------------------------------------------------------------------------------------+
  | Schema: app_security (Owner: postgres, Revoked from PUBLIC and ledgerone_app)                  |
  |                                                                                                |
  |  Table: signing_keys (Secret keys stored as BYTEA; inaccessible to ledgerone_app)              |
  |  Table: nonce_cache (Unlogged UUID replay prevention cache with TTL)                           |
  |                                                                                                |
  |  Function: set_verified_context(payload, signature) [SECURITY DEFINER]                         |
  |  - Validates key_id, expiration (< 60s), and nonce uniqueness                                  |
  |  - Computes expected HMAC-SHA256 and verifies constant-time equality                           |
  |  - Verifies is_platform_admin against app_security.platform_admins                             |
  |  - Stores verified claims into transaction-local temp table: app_security.active_context       |
  +------------------------------------------------------------------------------------------------+
                 |
                 v
  [Row-Level Security Policies on 'extracted_fields']
  - RLS predicates evaluate: app_security.get_verified_org_id(), app_security.get_verified_ws_id()
  - Zero reliance on untrusted 'SET LOCAL' session variables
+----------------------------------------------------------------------------------------------------+
```

### 3.2 Actor Responsibilities & Key Storage
- **Signing Actor:** FastAPI Application Core (Middleware).
  - *Key Storage:* Kept in application host memory (`HMAC_SIGNING_KEY`), loaded via container secrets / environment variable. Never written to disk, database tables, or logs.
- **Verification Actor:** PostgreSQL database engine executing `app_security.set_verified_context(...)`.
  - *Key Storage:* Schema `app_security.signing_keys` owned by `postgres`. Permissions: `REVOKE ALL ON ALL TABLES IN SCHEMA app_security FROM PUBLIC, ledgerone_app;`.
- **Connecting Database Role (`ledgerone_app`):** Possesses `USAGE` on schema `app_security` and `EXECUTE` on verification function. Has **ZERO** select/read access to the secret key table.

### 3.3 Canonical Claim Serialization Format
```text
Payload = f"{key_id}|{org_id}|{workspace_id}|{user_id}|{role}|{is_platform_admin}|{backend_session_id}|{nonce}|{issued_at}|{expires_at}"
```
- `key_id`: Active key identifier (e.g. `k2026_01`).
- `org_id` / `workspace_id` / `user_id`: UUIDv4 identifiers.
- `role`: Canonical role string (`ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN`, etc.).
- `is_platform_admin`: Boolean string (`true`/`false`).
- `backend_session_id`: Unique request correlation ID.
- `nonce`: Cryptographic UUIDv4 generated once per request.
- `issued_at` / `expires_at`: Epoch timestamps (maximum lifetime: 60 seconds).

### 3.4 Verification & Private Context Storage Mechanics (`SECURITY DEFINER`)

To prevent an attacker executing raw SQL from spoofing session variables with `SET LOCAL app.var = ...`, the verified context is stored in a private transaction-scoped memory table accessible only through security-definer getter functions:

```sql
-- Schema and table setup (Owned by postgres)
CREATE SCHEMA IF NOT EXISTS app_security;
REVOKE ALL ON SCHEMA app_security FROM PUBLIC, ledgerone_app;
GRANT USAGE ON SCHEMA app_security TO ledgerone_app;

CREATE UNLOGGED TABLE app_security.active_context (
    backend_pid INT PRIMARY KEY,
    org_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    user_role TEXT NOT NULL,
    is_platform_admin BOOLEAN NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
REVOKE ALL ON app_security.active_context FROM PUBLIC, ledgerone_app;

-- Verification function
CREATE OR REPLACE FUNCTION app_security.set_verified_context(
    p_payload TEXT,
    p_signature TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_security, pg_temp
AS $$
DECLARE
    v_parts TEXT[];
    v_key_id TEXT;
    v_org_id UUID;
    v_workspace_id UUID;
    v_user_id UUID;
    v_role TEXT;
    v_is_admin BOOLEAN;
    v_session_id UUID;
    v_nonce UUID;
    v_issued_at BIGINT;
    v_expires_at BIGINT;
    v_secret BYTEA;
    v_expected_sig TEXT;
BEGIN
    v_parts := string_to_array(p_payload, '|');
    IF array_length(v_parts, 1) != 10 THEN
        RAISE EXCEPTION 'AUTH_001: Malformed claims payload' USING ERRCODE = '28000';
    END IF;

    v_key_id := v_parts[1];
    v_org_id := v_parts[2]::uuid;
    v_workspace_id := v_parts[3]::uuid;
    v_user_id := v_parts[4]::uuid;
    v_role := v_parts[5];
    v_is_admin := v_parts[6]::boolean;
    v_session_id := v_parts[7]::uuid;
    v_nonce := v_parts[8]::uuid;
    v_issued_at := v_parts[9]::bigint;
    v_expires_at := v_parts[10]::bigint;

    -- 1. Expiration check (< 60s window)
    IF EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint > v_expires_at THEN
        RAISE EXCEPTION 'AUTH_002: Signature expired' USING ERRCODE = '28000';
    END IF;

    -- 2. Fetch key
    SELECT secret_key INTO v_secret FROM app_security.signing_keys
    WHERE key_id = v_key_id AND is_active = TRUE AND expires_at > CURRENT_TIMESTAMP;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AUTH_003: Key inactive or revoked' USING ERRCODE = '28000';
    END IF;

    -- 3. Verify signature
    v_expected_sig := encode(hmac(p_payload::bytea, v_secret, 'sha256'), 'hex');
    IF v_expected_sig != p_signature THEN
        RAISE EXCEPTION 'AUTH_004: Invalid cryptographic signature' USING ERRCODE = '28000';
    END IF;

    -- 4. Replay prevention (Nonce Check)
    BEGIN
        INSERT INTO app_security.nonce_cache (nonce, expires_at)
        VALUES (v_nonce, to_timestamp(v_expires_at));
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'AUTH_005: Replay detected' USING ERRCODE = '28000';
    END;

    -- 5. Platform Admin Gate
    IF v_is_admin THEN
        IF NOT EXISTS (SELECT 1 FROM app_security.platform_admins WHERE user_id = v_user_id AND is_active = TRUE) THEN
            RAISE EXCEPTION 'AUTH_006: Platform admin denied' USING ERRCODE = '28000';
        END IF;
    END IF;

    -- 6. Register into private context table
    INSERT INTO app_security.active_context (
        backend_pid, org_id, workspace_id, user_id, user_role, is_platform_admin, expires_at
    ) VALUES (
        pg_backend_pid(), v_org_id, v_workspace_id, v_user_id, v_role, v_is_admin, to_timestamp(v_expires_at)
    ) ON CONFLICT (backend_pid) DO UPDATE SET
        org_id = EXCLUDED.org_id,
        workspace_id = EXCLUDED.workspace_id,
        user_id = EXCLUDED.user_id,
        user_role = EXCLUDED.user_role,
        is_platform_admin = EXCLUDED.is_platform_admin,
        expires_at = EXCLUDED.expires_at;
END;
$$;
GRANT EXECUTE ON FUNCTION app_security.set_verified_context TO ledgerone_app;

-- Getter functions used exclusively in RLS policies
CREATE OR REPLACE FUNCTION app_security.get_org_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_security, pg_temp AS $$
    SELECT org_id FROM app_security.active_context WHERE backend_pid = pg_backend_pid() AND expires_at > CURRENT_TIMESTAMP;
$$;
CREATE OR REPLACE FUNCTION app_security.get_workspace_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_security, pg_temp AS $$
    SELECT workspace_id FROM app_security.active_context WHERE backend_pid = pg_backend_pid() AND expires_at > CURRENT_TIMESTAMP;
$$;
CREATE OR REPLACE FUNCTION app_security.get_user_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_security, pg_temp AS $$
    SELECT user_role FROM app_security.active_context WHERE backend_pid = pg_backend_pid() AND expires_at > CURRENT_TIMESTAMP;
$$;
CREATE OR REPLACE FUNCTION app_security.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_security, pg_temp AS $$
    SELECT is_platform_admin FROM app_security.active_context WHERE backend_pid = pg_backend_pid() AND expires_at > CURRENT_TIMESTAMP;
$$;
GRANT EXECUTE ON FUNCTION app_security.get_org_id, app_security.get_workspace_id, app_security.get_user_role, app_security.is_admin TO ledgerone_app;
```

### 3.5 Threat Evaluation Under Arbitrary SQL by `ledgerone_app`
- **Can it forge claims?** **NO.** The database role `ledgerone_app` does not possess the signing key $K_{\text{secret}}$.
- **Can it invoke a trusted signing function?** **NO.** Signing occurs in Python application memory, not in PostgreSQL.
- **Can it reuse a valid token?** **NO.** Replays fail because the `nonce` is logged in `app_security.nonce_cache`.
- **Can it change verified identity or tenant context?** **NO.** RLS reads from `app_security.active_context` via `SECURITY DEFINER` getters. `ledgerone_app` cannot write to `active_context` directly (`REVOKE ALL`).
- **Can it read secret material?** **NO.** `signing_keys` has zero read permissions granted to `ledgerone_app`.
- **Can it bypass workspace authorization?** **NO.** RLS policies enforce `workspace_id = app_security.get_workspace_id()` and membership queries.
- **Explicit Security Limitation:** If the application host suffers a complete container Remote Code Execution (RCE) breach, the attacker can extract `HMAC_SIGNING_KEY` directly from Python memory. HMAC protects database multi-tenancy from SQL injection, compromised connection pooling, and malicious raw SQL, but does not substitute for application host security.

---

## 4. Deterministic Rounding Verification: Extended Financial Cases

### Case 1: Per-Line Rounding vs. Document-Level Rounding Divergence
- **Scenario:** 3 utility lines with fractional sub-cent rates (e.g. cloud micro-metering).
  - Line 1: 1,000 units @ \$0.010033 = \$10.033000
  - Line 2: 1,000 units @ \$0.010033 = \$10.033000
  - Line 3: 1,000 units @ \$0.010034 = \$10.034000
- **Policy A (`PER_LINE_ITEM`, `ROUND_HALF_UP`, scale=2):**
  - Line 1: $\text{quantize}(10.033000, 2) = \mathbf{\$10.03}$
  - Line 2: $\text{quantize}(10.033000, 2) = \mathbf{\$10.03}$
  - Line 3: $\text{quantize}(10.034000, 2) = \mathbf{\$10.03}$
  - Sum of lines $S_{\text{net}} = 10.03 + 10.03 + 10.03 = \mathbf{\$30.09}$
- **Policy B (`DOCUMENT_FINAL`, `ROUND_HALF_UP`, scale=2):**
  - Unrounded sum: $10.033000 + 10.033000 + 10.034000 = 30.100000$
  - Document total: $\text{quantize}(30.100000, 2) = \mathbf{\$30.10}$
- **Reconciliation & Diagnostic Semantics:**
  - If the printed document displays lines as \$10.03 and Total as \$30.09: Policy A evaluates to `PASSED`.
  - If document displays Total as \$30.10: Under Policy A, `INV-002` evaluates to:
    $$\text{status} = \text{FAILED}, \quad \text{severity} = \text{WARNING}, \quad \text{delta} = -0.01$$
    $$\text{alternative\_rounding\_diagnostic} = \text{"Reconciles exactly under DOCUMENT_FINAL stage"}$$
  - The check **remains `FAILED`** under Policy A. The diagnostic explanation advises the auditor of the document-level calculation convention without overriding the active policy.

### Case 2: Multiple Tax Components Producing Fractional Minor Units
- **Scenario:** Taxable base = \$10.00 in a jurisdiction with three split taxes.
  - State Tax: $6.25\% \to 10.00 \times 0.0625 = 0.625000$
  - County Tax: $1.125\% \to 10.00 \times 0.01125 = 0.112500$
  - Municipal Tax: $0.75\% \to 10.00 \times 0.0075 = 0.075000$
- **Component-Level Quantization (`PER_TAX_COMPONENT`):**
  - State: $\text{quantize}(0.625, 2) = \mathbf{\$0.63}$
  - County: $\text{quantize}(0.1125, 2) = \mathbf{\$0.11}$
  - Municipal: $\text{quantize}(0.075, 2) = \mathbf{\$0.08}$
  - Total Tax: $0.63 + 0.11 + 0.08 = \mathbf{\$0.82}$
- **Combined Rate Quantization (Single Document Tax Bucket):**
  - Combined rate: $6.25 + 1.125 + 0.75 = 8.125\%$
  - Total Tax: $\text{quantize}(10.00 \times 0.08125, 2) = \text{quantize}(0.8125, 2) = \mathbf{\$0.81}$
- **Reconciliation Rule:** `INV-004` evaluates against the document's itemization. If the invoice itemizes all 3 lines, component-level quantization is enforced. If the invoice lists a single "Tax" line, combined quantization is evaluated.

### Case 3: Compounded Tax with Intermediate Precision
- **Scenario:** Base = \$100.00. Primary Tax (Customs Duty) = 5.0%. Secondary Tax (Compounded VAT) = 7.5%.
- **Calculation:**
  - $T_1 = \text{quantize}(100.00 \times 0.05, 2) = \mathbf{\$5.00}$
  - Compounded Taxable Base: $B_2 = 100.00 + 5.00 = \$105.00$
  - $T_2 = 105.00 \times 0.075 = 7.875000 \to \text{quantize}(7.875000, 2) = \mathbf{\$7.88}$
  - Total Tax $T = 5.00 + 7.88 = \mathbf{\$12.88}$
- *Intermediate Precision Rule:* $B_2$ maintains exact precision. Fractional taxes quantize at the component stage.

### Case 4: Pro-Rata Document Discount Allocation with Residual Minor Units (Largest-Remainder Method)
- **Scenario:** Document Discount $D_{\text{doc}} = \mathbf{\$10.00}$ applied across three line items:
  - Line 1: \$33.33 (33.33%)
  - Line 2: \$33.33 (33.33%)
  - Line 3: \$33.34 (33.34%)
  - Total Subtotal: \$100.00
- **Unrounded Allocations:**
  - Line 1: $10.00 \times (33.33 / 100.00) = 3.333000 \to \text{Integer cents: } 333\text{, Remainder: } 0.3000$
  - Line 2: $10.00 \times (33.33 / 100.00) = 3.333000 \to \text{Integer cents: } 333\text{, Remainder: } 0.3000$
  - Line 3: $10.00 \times (33.34 / 100.00) = 3.334000 \to \text{Integer cents: } 333\text{, Remainder: } 0.4000$
- **Initial Quantization:**
  - Line 1 = \$3.33, Line 2 = \$3.33, Line 3 = \$3.33. Sum = \$9.99.
  - Residual: $\$10.00 - \$9.99 = \mathbf{+\$0.01}$.
- **Largest-Remainder Strategy (Hare-Niemeyer):**
  - Rank lines by fractional remainder: Line 3 has the highest remainder ($0.4000$).
  - Award the +\$0.01 residual to Line 3:
    $$\text{Line 1} = \mathbf{\$3.33}, \quad \text{Line 2} = \mathbf{\$3.33}, \quad \text{Line 3} = \mathbf{\$3.34}$$
  - **Invariant Check:** $\sum_{i=1}^3 \text{Allocated}_i = 3.33 + 3.33 + 3.34 = \mathbf{\$10.00} == D_{\text{doc}}$ exactly. Zero loss of discount value.

---

## 5. Complete Invariant-Result Contract & Validation Matrix

### 5.1 Directional Signed Delta Convention
Delta is explicitly directional:
$$\text{delta} = \text{observed\_value} - \text{expected\_value}$$
- Positive delta ($+0.05$): Extracted/printed value exceeds mathematically expected value.
- Negative delta ($-0.05$): Extracted/printed value is less than expected value.
- Invariant evaluation compares absolute magnitude against applied tolerance:
  $$|\text{delta}| \le \text{applied\_tolerance}$$

### 5.2 Invariant Check Result Pydantic Model
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

class InvariantCheckResult(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    invariant_id: str = Field(description="Canonical ID: INV-001 through INV-010")
    invariant_type: str = Field(...)
    status: InvariantStatus = Field(...)
    severity: InvariantSeverity = Field(...)
    observed_value: Optional[Decimal] = Field(default=None)
    expected_value: Optional[Decimal] = Field(default=None)
    delta: Optional[Decimal] = Field(default=None, description="Signed: observed - expected")
    currency_code: Optional[str] = Field(default=None)
    currency_scale: Optional[int] = Field(default=None)
    rounding_mode: RoundingModeEnum = Field(...)
    rounding_stage: RoundingStageEnum = Field(...)
    policy_provenance: RoundingProvenanceType = Field(...)
    applied_tolerance: Decimal = Field(default=Decimal("0.00"))
    uncertainty_detected: bool = Field(default=False)
    uncertainty_reason: Optional[str] = Field(default=None)
    alternative_rounding_diagnostic: Optional[str] = Field(default=None)
    diagnostic_code: Optional[str] = Field(default=None)
    evidence_fragments: Tuple[EvidenceFragment, ...] = Field(default_factory=tuple)
    
    # Reproducibility Metadata
    evaluator_version: str = Field(default="2.7.0")
    calculation_version: str = Field(default="LEDGERONE-CALC-v1.0")
    policy_version: str = Field(default="LEDGERONE-ROUNDING-v1.1")
    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    input_references: Tuple[str, ...] = Field(default_factory=tuple)
    diagnostic_rule_id: Optional[str] = Field(default=None)

    @model_validator(mode="after")
    def validate_invariant_contract(self) -> "InvariantCheckResult":
        # 1. PASSED Invariant Rules
        if self.status == InvariantStatus.PASSED:
            if self.observed_value is None or self.expected_value is None or self.delta is None:
                raise ValueError("PASSED invariant requires observed_value, expected_value, and delta")
            if abs(self.delta) > self.applied_tolerance:
                raise ValueError(f"PASSED invariant delta ({abs(self.delta)}) cannot exceed applied_tolerance ({self.applied_tolerance})")
            if self.severity == InvariantSeverity.CRITICAL:
                raise ValueError("PASSED invariant cannot have severity=CRITICAL")
            if self.diagnostic_code is not None:
                raise ValueError("PASSED invariant cannot have diagnostic error code")

        # 2. FAILED Invariant Rules
        elif self.status == InvariantStatus.FAILED:
            if self.observed_value is None or self.expected_value is None or self.delta is None:
                raise ValueError("FAILED invariant requires observed_value, expected_value, and delta")
            if abs(self.delta) <= self.applied_tolerance:
                raise ValueError(f"FAILED invariant delta ({abs(self.delta)}) must exceed applied_tolerance ({self.applied_tolerance})")
            if self.severity not in (InvariantSeverity.CRITICAL, InvariantSeverity.WARNING):
                raise ValueError("FAILED invariant must have severity CRITICAL or WARNING")
            if not self.diagnostic_code:
                raise ValueError("FAILED invariant requires a diagnostic_code")

        # 3. NOT_EVALUABLE Invariant Rules
        elif self.status == InvariantStatus.NOT_EVALUABLE:
            if self.delta is not None:
                raise ValueError("NOT_EVALUABLE invariant cannot carry a computed delta")
            if not self.uncertainty_reason or not self.diagnostic_code:
                raise ValueError("NOT_EVALUABLE invariant requires uncertainty_reason and diagnostic_code")

        # 4. NOT_APPLICABLE Invariant Rules
        elif self.status == InvariantStatus.NOT_APPLICABLE:
            if self.observed_value is not None or self.expected_value is not None or self.delta is not None:
                raise ValueError("NOT_APPLICABLE invariant cannot have values or delta")
            if self.severity != InvariantSeverity.INFO:
                raise ValueError("NOT_APPLICABLE invariant must have severity=INFO")
            if self.diagnostic_code is not None:
                raise ValueError("NOT_APPLICABLE invariant cannot have an error diagnostic_code")

        return self
```

### 5.3 Invariant Contract Validation Matrix

| Field | `PASSED` | `FAILED` | `NOT_EVALUABLE` | `NOT_APPLICABLE` |
| :--- | :---: | :---: | :---: | :---: |
| `observed_value` | **REQUIRED** (`Decimal`) | **REQUIRED** (`Decimal`) | **OPTIONAL** (if partially observed) | **FORBIDDEN** (`None`) |
| `expected_value` | **REQUIRED** (`Decimal`) | **REQUIRED** (`Decimal`) | **OPTIONAL** (if partially computed) | **FORBIDDEN** (`None`) |
| `delta` | **REQUIRED** ($\le \text{tol}$) | **REQUIRED** ($> \text{tol}$) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) |
| `applied_tolerance` | **REQUIRED** ($\ge 0.00$) | **REQUIRED** ($\ge 0.00$) | **REQUIRED** (configured) | **REQUIRED** (0.00) |
| `severity` | `INFO` / `WARNING` | `CRITICAL` / `WARNING` | `CRITICAL` / `WARNING` | `INFO` |
| `diagnostic_code` | **FORBIDDEN** (`None`) | **REQUIRED** (string code) | **REQUIRED** (string code) | **FORBIDDEN** (`None`) |
| `uncertainty_reason` | **OPTIONAL** (if borderline) | **OPTIONAL** (if borderline) | **REQUIRED** (reason for gap) | **FORBIDDEN** (`None`) |
| `evidence_fragments` | **REQUIRED** ($\ge 1$) | **REQUIRED** ($\ge 1$) | **OPTIONAL** | **FORBIDDEN** (empty) |

---

## 6. Seven-Role Document Lifecycle & Business Authorization Matrix

### 6.1 Document Lifecycle States
1. `UPLOADED`: Binary ingested into S3, metadata recorded.
2. `EXTRACTED`: ML pipeline has executed; candidate fields and tables generated.
3. `PENDING_REVIEW`: Automated invariants failed or currency unresolved; routed to HITL queue.
4. `VERIFIED`: Human auditor has verified or corrected all fields.
5. `APPROVED`: Manager has formally accepted document for ERP/accounting export.
6. `REJECTED`: Manager has rejected document due to fraud or unresolvable error.
7. `ARCHIVED`: Document locked in immutable storage.

### 6.2 Business Operations & Permission Matrix

| Business Operation | Permitted Roles | Target Lifecycle State | Restrictions & Constraints |
| :--- | :--- | :--- | :--- |
| **Upload Document** | `ORG_ADMIN`, `WS_ADMIN`, `DOC_MGR` | `UPLOADED` | Workspace-scoped for `WS_ADMIN` and `DOC_MGR`. |
| **Edit Metadata** | `ORG_ADMIN`, `WS_ADMIN`, `DOC_MGR` | `UPLOADED`, `EXTRACTED` | Cannot edit metadata once `APPROVED` or `ARCHIVED`. |
| **Change Classification** | `ORG_ADMIN`, `WS_ADMIN`, `DOC_MGR`, `REVIEWER` | `EXTRACTED`, `PENDING_REVIEW` | Reviewer restricted to assigned workspaces. |
| **Correct Extracted Fields** | `ORG_ADMIN`, `WS_ADMIN`, `DOC_MGR`, `REVIEWER` | `PENDING_REVIEW` | Creates `CorrectionAuditEntry`; preserves original value. |
| **Submit Corrections** | `REVIEWER`, `DOC_MGR`, `WS_ADMIN`, `ORG_ADMIN` | $\to$ `VERIFIED` | Re-evaluates invariants on corrected fields. |
| **Approve Document** | `DOC_MGR`, `WS_ADMIN`, `ORG_ADMIN` | $\to$ `APPROVED` | **REVIEWERS CANNOT APPROVE DOCUMENTS**. Requires all invariants `PASSED` or auditor override. |
| **Reject Document** | `DOC_MGR`, `WS_ADMIN`, `ORG_ADMIN` | $\to$ `REJECTED` | Document marked terminal; requires rejection reason. |
| **Delete Document** | `ORG_ADMIN`, `WS_ADMIN` | $\to$ Hard/Soft Delete | Restricted to administrative roles; soft delete in DB. |
| **View Audit History** | `ALL ROLES` (incl. `VIEWER`, `ANALYST`) | Any state | Read-only access to audit log table. |
| **Modify Prior Audit Records** | **NO ROLE (PROHIBITED)** | N/A | **STRICTLY FORBIDDEN**. Audit records are append-only. Modifying past history raises SQL exception. |

---

## 7. PDF Rendering Parity Verification Matrix

### 7.1 Multi-Level Parity Metrics
To prevent aggregate page metrics from concealing local coordinate drift:
1. **Per-Region Minimum IoU:**
   $$\text{IoU}_{\text{region}} = \frac{\text{Area}(B_{\text{extracted}} \cap B_{\text{raster}})}{\text{Area}(B_{\text{extracted}} \cup B_{\text{raster}})} \ge \mathbf{0.85}$$
   *No single text region may fall below $0.85$.*
2. **Page-Level Mean IoU:**
   $$\text{IoU}_{\text{page}} = \frac{1}{N} \sum_{i=1}^N \text{IoU}_i \ge \mathbf{0.95}$$
3. **Maximum Coordinate Drift:**
   $$\Delta_{\text{coord}} = \max(|x_0 - x_0'|, |y_0 - y_0'|, |x_1 - x_1'|, |y_1 - y_1'|) \le \mathbf{0.50\text{ pt}}$$
   *(For small text fonts $< 8\text{ pt}$, drift must be $\le \mathbf{0.75\text{ pt}}$).*

### 7.2 Test Suite Fixture Coverage (15 Fixtures, 6 Categories)

| Category ID | Geometry Scenario | Fixture Count | Resolutions Evaluated | Acceptance Criteria |
| :--- | :--- | :---: | :---: | :--- |
| **GEO-01** | Standard Upright ($0^\circ$) A4 & Letter | 3 | 150 & 300 DPI | Mean $\text{IoU} \ge 0.98$, drift $\le 0.25\text{ pt}$ |
| **GEO-02** | Rotated Pages ($90^\circ, 180^\circ, 270^\circ$) | 3 | 150 & 300 DPI | Mean $\text{IoU} \ge 0.95$, min $\text{IoU} \ge 0.85$, drift $\le 0.50\text{ pt}$ |
| **GEO-03** | Clipped Viewport (`CropBox \ne MediaBox`) | 2 | 150 & 300 DPI | Zero tokens extracted outside CropBox bounds |
| **GEO-04** | Continuous Receipt Rolls (Narrow width $204\text{ pt}$) | 3 | 150 & 300 DPI | Mean $\text{IoU} \ge 0.95$, thermal drift $\le 0.50\text{ pt}$ |
| **GEO-05** | Scaled `/UserUnit` ($U = 2.0, U = 5.0$) | 2 | 150 & 300 DPI | Absolute point parity matches scaled dimensions exactly |
| **GEO-06** | Skewed Text Polygons ($\theta \in [-15^\circ, +15^\circ]$) | 2 | 150 & 300 DPI | Enclosing AABB captures $100\%$ of raster text pixels |

---

## 8. Five-Wave Implementation Plan (Preserved)

- **Wave 1:** Core Pydantic Contracts, Rounding Policy Engine, and Invariant Evaluator (`table_contracts.py`, `rounding_policy.py`, `accounting_invariants.py`).
- **Wave 2:** Geometry & Cross-Page Table Continuation Engine (`table_geometry.py`, `multipage_table_stitcher.py`).
- **Wave 3:** Column Header Classifier & Row Segmentation Engine (`header_classifier.py`, `row_segmenter.py`, `tune_header_classifier.py`).
- **Wave 4:** Pipeline Integration & Database Persistence (`hybrid_structured_extractor.py`, `extraction_schemas.py`).
- **Wave 5:** Comprehensive Adversarial Verification, Benchmark Execution, and Evaluation Sign-off (`test_table_extraction.py`, `test_accounting_invariants.py`, `run_step4_table_benchmark.py`).

---

## 9. Planning-Only Execution Boundary & Final Readiness Declaration

### Execution Boundary Attestation
1. **Repository Baseline Preserved:** Commit remains strictly `70410a1`.
2. **Zero Code Changes:** No application source code (`src/`), test files (`tests/`), database schemas/migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

---

### Final Readiness Declaration

### **READY FOR WAVE 1 AUTHORIZATION**

**Status:** Specification v2.7.0 closes all security, financial, geometric, and invariant contracts with formal mathematical proofs, cryptographic database architecture, and reproducible verification protocols. Zero technical blockers remain.

Wave 1 implementation can commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
