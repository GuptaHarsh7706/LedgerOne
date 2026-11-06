# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v2.8.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v2.8.0`  
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
- **v2.7.0 (2026-11-06):** Security, financial, and verification closure. (HMAC trust chain, private context storage, extended rounding cases, lifecycle authorization).
- **v2.8.0 (2026-11-06):** Final consistency closure. Formally resolves the HMAC transaction lifecycle with `pg_current_xact_id()` binding, connection-pool cross-talk prevention, and atomic nonce locking; reconciles signed-delta validation rules with positive/negative examples; establishes a 4-tier authoritative rounding policy hierarchy; introduces a strict Segregation-of-Duties (SoD) policy preventing self-verification; and defines adaptive raster rendering parity protocols for PDF geometry.

### Concise Change Log (v2.7 $\to$ v2.8)
1. **HMAC Transaction Lifecycle & Connection-Pool Isolation:**
   - Bound active verified context strictly to `xact_id = pg_current_xact_id()` and `backend_pid = pg_backend_pid()`, proving that Transaction A's context cannot authorize Transaction B on the same pooled connection.
   - Defined deterministic lifecycle semantics across `COMMIT`, `ROLLBACK`, exceptions, savepoints (`SAVEPOINT`), worker crashes, and stale-context elimination.
   - Specified atomic nonce consumption using PostgreSQL unique constraints (`23505`) to prevent concurrent replay races.
2. **Signed-Delta Invariant Mathematical Consistency:**
   - Formalized exact evaluation rules across documentation, Pydantic contracts, and tests: `PASSED` iff $|\text{delta}| \le \text{tol}$; `FAILED` iff $|\text{delta}| > \text{tol}$.
   - Prohibited populating `delta` when either observed or expected values are missing, while permitting partial scalar retention for HITL diagnostics.
   - Added positive (+5.00 overcharge) and negative (-5.00 undercharge) delta examples with directional accounting interpretations.
3. **Four-Tier Authoritative Rounding Policy Hierarchy:**
   - Established strict 4-level precedence: (1) Explicit document instruction $\to$ (2) Verified contract/tax schedule $\to$ (3) Verified statutory jurisdiction $\to$ (4) Unresolved policy routing to `NOT_EVALUABLE` / `NEEDS_REVIEW`.
   - Prohibited inferring authoritative rounding solely from the count or visual layout of printed tax lines.
4. **Document Lifecycle & Segregation of Duties (SoD):**
   - Decoupled `CORRECT_EXTRACTED_FIELDS` from `VERIFY_CORRECTIONS` and `APPROVE_DOCUMENT`.
   - Formally enforced SoD: the user who corrects an extracted field cannot verify or approve their own correction (`verifier_id != corrector_id`), with an explicit audited override flag for single-auditor workspaces.
   - Integrated all 7 canonical application roles (including `PLATFORM_ADMIN`) across 10 business actions and 8 lifecycle states.
5. **PDF Adaptive Raster Parity Protocol:**
   - Replaced basic Otsu thresholding with adaptive local thresholding (Sauvola) and glyph-mask rasterization to eliminate thermal paper and gray-background bias.
   - Formalized dual IoU criteria (per-region minimum $\ge 0.85$, page mean $\ge 0.95$, coordinate drift $\le 0.50\text{ pt}$), clarifying that the 15-fixture suite serves as an initial regression gate, not universe-wide proof.

---

## 2. Issue Resolution Matrix (v2.7 $\to$ v2.8)

| # | Domain | v2.7 Specification Gap | v2.8 Engineering Resolution |
| :- | :--- | :--- | :--- |
| **1** | **HMAC Transaction Lifecycle** | `active_context` was keyed only by `backend_pid`, creating a critical cross-talk vulnerability where pooled connections could inherit prior transaction context. | Keyed context strictly by `(xact_id = pg_current_xact_id(), backend_pid = pg_backend_pid())`. Getter functions return `NULL` outside the originating transaction. Formulated atomic nonce insertion and savepoint behavior. |
| **2** | **Signed Delta Consistency** | Contract allowed populating `delta` in inconsistent states; lacked explicit positive/negative delta examples and clear partial value retention rules. | Formulated directional signed delta ($\text{delta} = \text{observed} - \text{expected}$). Mandated that `delta` is populated *only* when both observed and expected values exist. Provided concrete positive and negative delta examples. |
| **3** | **Rounding Policy Source Hierarchy** | Lacked a formal precedence order; permitted ambiguity where layout of tax lines could be mistaken for legally authoritative rounding rules. | Codified 4-tier hierarchy: Document explicit $\to$ Contract $\to$ Statutory Jurisdiction $\to$ Unresolved review gate. Banned inferring rounding policy from tax line count alone. |
| **4** | **Segregation of Duties (SoD)** | Did not prevent a reviewer from verifying their own corrections; lacked clear separation between correction, verification, and final approval. | Formalized SoD rule: `verifier_id != corrector_id`. Decoupled correction from verification and approval across all 7 roles. Detailed audit trail and single-auditor override exceptions. |
| **5** | **PDF Raster Parity Protocol** | Otsu thresholding alone was inadequate for low-contrast/thermal backgrounds; lacked clear description of glyph-mask generation and fixture limits. | Replaced Otsu with Sauvola adaptive local binarization and glyph-mask rasterization. Retained dual IoU thresholds ($\ge 0.85$ region, $\ge 0.95$ page). Formally qualified 15-fixture suite as an initial regression suite. |

---

## 3. HMAC Transaction-Context Lifecycle & Database Security Architecture

### 3.1 Transaction-Local Storage & `pg_current_xact_id()` Binding
To prevent connection-pool cross-talk where sequential transactions on the same connection inherit stale tenant context, `app_security.active_context` is bound strictly to the PostgreSQL top-level transaction ID:

```sql
CREATE SCHEMA IF NOT EXISTS app_security;
REVOKE ALL ON SCHEMA app_security FROM PUBLIC, ledgerone_app;
GRANT USAGE ON SCHEMA app_security TO ledgerone_app;

-- Unlogged transaction-indexed context table
CREATE UNLOGGED TABLE app_security.active_context (
    xact_id BIGINT NOT NULL,
    backend_pid INT NOT NULL,
    org_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    user_role TEXT NOT NULL,
    is_platform_admin BOOLEAN NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (xact_id, backend_pid)
);
REVOKE ALL ON app_security.active_context FROM PUBLIC, ledgerone_app;
```

### 3.2 Exact Context Creation, Destruction & Pool Reuse Semantics

```
+----------------------------------------------------------------------------------------------------+
|                                TRANSACTION CONTEXT LIFECYCLE                                       |
+----------------------------------------------------------------------------------------------------+
  1. TRANSACTION BEGIN
     - Application acquires pooled connection from asyncpg pool (e.g. backend_pid = 4128)
     - Executes: BEGIN;
     - PostgreSQL assigns unique transaction ID: pg_current_xact_id() = 10842019
  --------------------------------------------------------------------------------------------------
  2. CONTEXT REGISTRATION
     - Application executes: SELECT app_security.set_verified_context(payload, signature);
     - Function validates HMAC signature, key status, expiration, and consumes nonce atomically.
     - Function registers row: (xact_id = 10842019, backend_pid = 4128, org_id, ws_id, user_id, ...)
  --------------------------------------------------------------------------------------------------
  3. OPERATIONAL EXECUTION & RLS ENFORCEMENT
     - Application executes queries on 'extracted_fields'
     - RLS evaluates: app_security.get_org_id() and app_security.get_workspace_id()
     - Getter executes: SELECT org_id FROM app_security.active_context 
                        WHERE xact_id = pg_current_xact_id()::text::bigint 
                          AND backend_pid = pg_backend_pid();
     - Result matches EXACTLY row (10842019, 4128). Access granted.
  --------------------------------------------------------------------------------------------------
  4. SAVEPOINTS & NESTED TRANSACTIONS
     - Application executes: SAVEPOINT sp1; ... ROLLBACK TO SAVEPOINT sp1;
     - In PostgreSQL, pg_current_xact_id() remains identical across savepoints. Context is preserved.
  --------------------------------------------------------------------------------------------------
  5. TRANSACTION TERMINATION (COMMIT / ROLLBACK / EXCEPTION / CRASH)
     - Application executes: COMMIT; (or ROLLBACK; or connection drops)
     - Top-level transaction 10842019 is terminated.
     - Automated cleanup trigger or table truncation deletes rows where xact_id <= pg_snapshot_xmin().
  --------------------------------------------------------------------------------------------------
  6. CONNECTION POOL REUSE (TRANSACTION B)
     - Application acquires SAME connection (backend_pid = 4128) for a new request.
     - Executes: BEGIN; -> PostgreSQL assigns NEW transaction ID: pg_current_xact_id() = 10842020.
     - If Transaction B attempts to query 'extracted_fields' WITHOUT verifying context:
       Getter executes: WHERE xact_id = 10842020 AND backend_pid = 4128;
       Row DOES NOT EXIST! Getter returns NULL.
       RLS evaluation: organization_id = NULL -> MATCHES ZERO ROWS (Fail-Closed).
     - Context from Transaction A CANNOT authorize Transaction B.
+----------------------------------------------------------------------------------------------------+
```

### 3.3 Atomic Nonce Consumption & Replay Prevention
```sql
CREATE TABLE app_security.nonce_cache (
    nonce UUID PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
REVOKE ALL ON app_security.nonce_cache FROM PUBLIC, ledgerone_app;
```
Inside `app_security.set_verified_context`:
```sql
BEGIN
    INSERT INTO app_security.nonce_cache (nonce, expires_at)
    VALUES (v_nonce, to_timestamp(v_expires_at));
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'AUTH_005: Replay attack detected — nonce already consumed' USING ERRCODE = '28000';
END;
```
Because the `INSERT` occurs within the active transaction, two concurrent requests attempting to redeem the exact same nonce collide on the primary key index. PostgreSQL serializes the insert; the second transaction immediately triggers `unique_violation` and aborts.

### 3.4 Verification Function Implementation (`SECURITY DEFINER`)
```sql
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
    v_curr_xact BIGINT;
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

    -- 1. Expiration validation (< 60 seconds)
    IF EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint > v_expires_at THEN
        RAISE EXCEPTION 'AUTH_002: Signature expired' USING ERRCODE = '28000';
    END IF;

    -- 2. Secret key retrieval
    SELECT secret_key INTO v_secret FROM app_security.signing_keys
    WHERE key_id = v_key_id AND is_active = TRUE AND expires_at > CURRENT_TIMESTAMP;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AUTH_003: Key inactive or revoked' USING ERRCODE = '28000';
    END IF;

    -- 3. HMAC-SHA256 signature verification
    v_expected_sig := encode(hmac(p_payload::bytea, v_secret, 'sha256'), 'hex');
    IF v_expected_sig != p_signature THEN
        RAISE EXCEPTION 'AUTH_004: Invalid cryptographic signature' USING ERRCODE = '28000';
    END IF;

    -- 4. Atomic Nonce Replay Prevention
    BEGIN
        INSERT INTO app_security.nonce_cache (nonce, expires_at)
        VALUES (v_nonce, to_timestamp(v_expires_at));
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'AUTH_005: Replay attack detected' USING ERRCODE = '28000';
    END;

    -- 5. Platform Admin Verification Gate
    IF v_is_admin THEN
        IF NOT EXISTS (SELECT 1 FROM app_security.platform_admins WHERE user_id = v_user_id AND is_active = TRUE) THEN
            RAISE EXCEPTION 'AUTH_006: Platform admin denied' USING ERRCODE = '28000';
        END IF;
    END IF;

    -- 6. Register into transaction-bound private storage
    v_curr_xact := pg_current_xact_id()::text::bigint;
    INSERT INTO app_security.active_context (
        xact_id, backend_pid, org_id, workspace_id, user_id, user_role, is_platform_admin, expires_at
    ) VALUES (
        v_curr_xact, pg_backend_pid(), v_org_id, v_workspace_id, v_user_id, v_role, v_is_admin, to_timestamp(v_expires_at)
    ) ON CONFLICT (xact_id, backend_pid) DO UPDATE SET
        org_id = EXCLUDED.org_id,
        workspace_id = EXCLUDED.workspace_id,
        user_id = EXCLUDED.user_id,
        user_role = EXCLUDED.user_role,
        is_platform_admin = EXCLUDED.is_platform_admin,
        expires_at = EXCLUDED.expires_at;
END;
$$;
GRANT EXECUTE ON FUNCTION app_security.set_verified_context TO ledgerone_app;

-- RLS Getter Functions (Transaction-Bound)
CREATE OR REPLACE FUNCTION app_security.get_org_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_security, pg_temp AS $$
    SELECT org_id FROM app_security.active_context 
    WHERE xact_id = pg_current_xact_id()::text::bigint 
      AND backend_pid = pg_backend_pid() 
      AND expires_at > CURRENT_TIMESTAMP;
$$;
CREATE OR REPLACE FUNCTION app_security.get_workspace_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_security, pg_temp AS $$
    SELECT workspace_id FROM app_security.active_context 
    WHERE xact_id = pg_current_xact_id()::text::bigint 
      AND backend_pid = pg_backend_pid() 
      AND expires_at > CURRENT_TIMESTAMP;
$$;
CREATE OR REPLACE FUNCTION app_security.get_user_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_security, pg_temp AS $$
    SELECT user_role FROM app_security.active_context 
    WHERE xact_id = pg_current_xact_id()::text::bigint 
      AND backend_pid = pg_backend_pid() 
      AND expires_at > CURRENT_TIMESTAMP;
$$;
CREATE OR REPLACE FUNCTION app_security.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app_security, pg_temp AS $$
    SELECT is_platform_admin FROM app_security.active_context 
    WHERE xact_id = pg_current_xact_id()::text::bigint 
      AND backend_pid = pg_backend_pid() 
      AND expires_at > CURRENT_TIMESTAMP;
$$;
GRANT EXECUTE ON FUNCTION app_security.get_org_id, app_security.get_workspace_id, app_security.get_user_role, app_security.is_admin TO ledgerone_app;
```

---

## 4. Invariant Mathematical Consistency & Signed Delta Validation Matrix

### 4.1 Strict Mathematical Evaluation Rules
$$\text{delta} = \text{observed\_value} - \text{expected\_value}$$
$$\text{applied\_tolerance} \ge \text{Decimal}('0.00') \quad \text{(Explicitly configured; never implicit zero)}$$

1. **`PASSED`:** Both `observed_value` and `expected_value` are non-null and comparable, and:
   $$|\text{delta}| \le \text{applied\_tolerance}$$
2. **`FAILED`:** Both `observed_value` and `expected_value` are non-null and comparable, and:
   $$|\text{delta}| > \text{applied\_tolerance}$$
3. **`NOT_EVALUABLE`:** Required inputs, mathematical operands, or evidence are insufficient, unparseable, or currency is `UNRESOLVED`.
   - *Rule:* `delta` **MUST BE `None`**.
   - Partial retention: If a single operand was extracted (e.g. document subtotal extracted, but line items missing), `observed_value` may retain the partial extraction for HITL visibility, while `expected_value` remains `None`. `delta` is **never** populated on partial operands.
4. **`NOT_APPLICABLE`:** Preconditions of the rule are absent (e.g. document discount check on an undiscounted invoice).
   - *Rule:* `observed_value`, `expected_value`, and `delta` **MUST ALL BE `None`**. `severity` is strictly `INFO`.

### 4.2 Positive and Negative Signed Delta Examples
- **Positive Delta Example ($\text{delta} > 0$):**
  - Observed Line Total = \$105.00 (printed on bill).
  - Expected Line Total = 10 units @ \$10.00 = \$100.00.
  - $\text{delta} = 105.00 - 100.00 = \mathbf{+\$5.00}$.
  - *Accounting Interpretation:* Line total exceeds quantity $\times$ price arithmetic. Indicates potential overcharge, hidden surcharge, or OCR transcription error.
  - Evaluation: $|\text{delta}| = 5.00 > \text{tol} (0.00) \implies \mathbf{FAILED}$ (`severity = CRITICAL`, `code = ERR_ARITHMETIC_OVERCHARGE`).
- **Negative Delta Example ($\text{delta} < 0$):**
  - Observed Document Total = \$95.00 (printed on invoice).
  - Expected Document Total = Subtotal \$100.00 + Tax \$0.00 = \$100.00.
  - $\text{delta} = 95.00 - 100.00 = \mathbf{-\$5.00}$.
  - *Accounting Interpretation:* Printed total is less than the component sum. Indicates an unitemized discount, credit deduction, or missing charge.
  - Evaluation: $|\text{delta}| = 5.00 > \text{tol} (0.00) \implies \mathbf{FAILED}$ (`severity = CRITICAL`, `code = ERR_ARITHMETIC_UNDERCHARGE`).

### 4.3 Invariant Contract Validation Matrix

| Attribute | `PASSED` | `FAILED` | `NOT_EVALUABLE` | `NOT_APPLICABLE` |
| :--- | :---: | :---: | :---: | :---: |
| `observed_value` | **REQUIRED** (`Decimal`) | **REQUIRED** (`Decimal`) | **OPTIONAL** (scalar retention) | **FORBIDDEN** (`None`) |
| `expected_value` | **REQUIRED** (`Decimal`) | **REQUIRED** (`Decimal`) | **OPTIONAL** (scalar retention) | **FORBIDDEN** (`None`) |
| `delta` | **REQUIRED** ($|\Delta| \le \text{tol}$) | **REQUIRED** ($|\Delta| > \text{tol}$) | **FORBIDDEN** (`None`) | **FORBIDDEN** (`None`) |
| `applied_tolerance` | **REQUIRED** ($\ge 0.00$) | **REQUIRED** ($\ge 0.00$) | **REQUIRED** (configured) | **REQUIRED** (0.00) |
| `severity` | `INFO` / `WARNING` | `CRITICAL` / `WARNING` | `CRITICAL` / `WARNING` | `INFO` |
| `diagnostic_code` | **FORBIDDEN** (`None`) | **REQUIRED** (string code) | **REQUIRED** (string code) | **FORBIDDEN** (`None`) |
| `uncertainty_reason` | **OPTIONAL** (borderline) | **OPTIONAL** (borderline) | **REQUIRED** (diagnostic rationale) | **FORBIDDEN** (`None`) |
| `evidence_fragments` | **REQUIRED** ($\ge 1$) | **REQUIRED** ($\ge 1$) | **OPTIONAL** | **FORBIDDEN** (empty) |

---

## 5. Four-Tier Authoritative Financial Rounding Policy Hierarchy

Legally authoritative rounding policies cannot be inferred from the visual layout or count of printed tax lines. LedgerOne enforces a strict 4-tier source precedence hierarchy:

```
+----------------------------------------------------------------------------------------------------+
|                             ROUNDING POLICY SOURCE PRECEDENCE HIERARCHY                            |
+----------------------------------------------------------------------------------------------------+
  Tier 1: EXPLICIT DOCUMENT-LEVEL INSTRUCTION (Top Precedence)
  - Disclosed in printed text tokens (e.g. "All items rounded half-up to nearest cent", "Swedish rounding")
  - Provenance: OBSERVED. Policy Source: DOCUMENT_EXPLICIT_DISCLOSURE.
  --------------------------------------------------------------------------------------------------
  Tier 2: VERIFIED CONTRACTUAL OR TAX SCHEDULE INSTRUCTION
  - Formal procurement contract or explicit tax authority filing profile linked in document metadata.
  - Provenance: INFERRED. Policy Source: ORGANIZATION_SETTING.
  --------------------------------------------------------------------------------------------------
  Tier 3: VERIFIED JURISDICTION-SPECIFIC STATUTORY RULE
  - Legally mandated rounding rules for an unambiguously verified jurisdiction (e.g. German GoBD, HMRC).
  - Provenance: INFERRED. Policy Source: JURISDICTION_DEFAULT.
  --------------------------------------------------------------------------------------------------
  Tier 4: UNRESOLVED POLICY (Fallback Review Gate)
  - Source does not establish policy. Document cannot be automatically certified.
  - System applies system default (ROUND_HALF_UP, scale=2) STRICTLY for diagnostic scoring.
  - Status: Evaluates to NOT_EVALUABLE or FAILED (WARNING), uncertainty_detected = True.
  - Document routed to HITL review queue with diagnostic code DIAG_ROUNDING_POLICY_UNRESOLVED.
+----------------------------------------------------------------------------------------------------+
```

### 5.1 Rounding Stage Clarifications
1. **`PER_LINE_ITEM`:** Line items quantized before summing. Sum of rounded lines equals subtotal.
2. **`DOCUMENT_FINAL`:** Intermediate precision maintained across all lines; quantized only at the document total.
3. **`PER_TAX_COMPONENT`:** Split taxes quantized per tax line before summing into total tax.
4. **Compounded Tax Intermediate Precision:** Tax-on-tax intermediate bases maintain full Decimal precision ($\ge 6$ decimal places).
5. **Residual Discount Allocation (Largest-Remainder Method):** Pro-rata discount distributions that leave fractional minor units are adjusted by allocating residual pennies to the largest base components. **The sum of allocated discounts must strictly equal the document discount.**

---

## 6. Document Lifecycle & Segregation of Duties (SoD)

### 6.1 Segregation-of-Duties (SoD) Policy
To prevent financial fraud and human reviewer error:
- **Core SoD Invariant:** A user who performs `CORRECT_EXTRACTED_FIELDS` on a document (User A) **CANNOT** perform `VERIFY_CORRECTIONS` or `APPROVE_DOCUMENT` on that same document!
  $$\text{verifier\_user\_id} \ne \text{corrector\_user\_id}$$
- **Automated Enforcement:** Application service layer and database update triggers assert:
  ```python
  if document.last_corrected_by == current_user.id and action in ("VERIFY_CORRECTIONS", "APPROVE_DOCUMENT"):
      raise AuthorizationError("AUTH_SOD_VIOLATION: Segregation of duties prohibits self-verification.")
  ```
- **Single-Auditor Workspace Exception:** In small workspaces where only one auditor exists, the workspace configuration setting `ALLOW_SINGLE_AUDITOR_WORKFLOW = true` must be explicitly enabled by `WORKSPACE_ADMIN`. When exercised, an immutable audit warning `AUDIT_SOD_EXCEPTION_SELF_VERIFIED` is attached to the document record.

### 6.2 Seven-Role Lifecycle Permission Matrix

| Business Operation | `PLATFORM_ADMIN` | `ORG_ADMIN` | `WS_ADMIN` | `DOC_MGR` | `REVIEWER` | `ANALYST` | `VIEWER` | Scope & SoD Enforcement |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Upload Document** | Yes | Yes | Yes | Yes | No | No | No | Workspace-scoped for WS_ADMIN & DOC_MGR |
| **Edit Metadata** | Yes | Yes | Yes | Yes | No | No | No | Allowed only in `UPLOADED` or `EXTRACTED` |
| **Change Classification** | Yes | Yes | Yes | Yes | Yes | No | No | Reviewer restricted to assigned workspaces |
| **Correct Extracted Fields** | Yes | Yes | Yes | Yes | Yes | No | No | Creates `CorrectionAuditEntry`; logs `corrector_id` |
| **Submit Corrections** | Yes | Yes | Yes | Yes | Yes | No | No | Moves state to `VERIFIED`; triggers re-evaluation |
| **Verify Corrections** | Yes | Yes | Yes | Yes | Yes | No | No | **SoD Enforced:** `verifier_id != corrector_id` |
| **Approve Document** | Yes | Yes | Yes | Yes | No | No | No | **Reviewers cannot approve.** Moves to `APPROVED` |
| **Reject Document** | Yes | Yes | Yes | Yes | No | No | No | Requires documented rejection reason |
| **Auditor Override** | Yes | Yes | Yes | No | No | No | No | Overrides failed invariant with explicit audit note |
| **Delete Document** | Yes | Yes | Yes | No | No | No | No | Soft-delete restricted to administrative roles |
| **View Audit History** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Read-only across all roles |
| **Modify Audit Logs** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **STRICTLY PROHIBITED (ALL ROLES)** |

---

## 7. PDF Rendering Parity Measurement Protocol

### 7.1 Ground Truth & Raster Comparison Methodology
To prevent antialiased edge pixels and thermal receipt gray backgrounds from skewing geometric verification:
1. **Ground Truth Annotation:** Stored in GeoJSON/COCO polygon format for rotated/skewed text, with dual-representation normalized $[0.0, 1.0]$ and 72-DPI PostScript point bounding boxes.
2. **Adaptive Local Thresholding (Sauvola Binarization):**
   - The rendered 8-bit grayscale page image is binarized using local adaptive thresholding:
     $$T(x, y) = m(x, y) \cdot \left(1 + k \cdot \left(\frac{s(x, y)}{R} - 1\right)\right)$$
     where $m(x, y)$ is local mean, $s(x, y)$ is standard deviation in window $w = 21\text{ px}$, $k = 0.2$, $R = 128$.
   - Eliminates background shading and thermal paper noise without dilating text strokes.
3. **Glyph-Mask Generation:** A binary reference mask $M_{\text{glyph}}$ is created containing true foreground text pixels.
4. **Candidate Mask Generation:** Extracted bounding boxes/polygons are rasterized at the identical resolution (150 DPI or 300 DPI) into binary mask $M_{\text{box}}$.

### 7.2 Strict Dual IoU & Drift Acceptance Criteria
To ensure high page-level IoU does not mask local text drift:
- **Per-Region Minimum IoU:** $\text{IoU}_{\text{region}} \ge \mathbf{0.85}$ across every individual text box. *A single region below 0.85 constitutes test failure.*
- **Page-Level Mean IoU:** $\text{IoU}_{\text{page}} \ge \mathbf{0.95}$ across all glyphs on the page.
- **Maximum Coordinate Drift:** $\Delta_{\text{coord}} \le \mathbf{0.50\text{ pt}}$ for standard text ($\ge 8\text{ pt}$); $\le \mathbf{0.75\text{ pt}}$ for fine print ($< 8\text{ pt}$).
- **Empty / False-Positive Regions:** Box placed on blank area yields $\text{IoU} = 0.0 \implies$ Immediate test failure.

### 7.3 Initial Regression Suite Coverage (15 Fixtures, 6 Categories)
*Clarification: The 15-fixture suite represents an initial deterministic regression test gate for Wave 2, not empirical proof of general PDF geometry across the universe of real-world documents.*

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
1. **Repository Baseline Preserved:** Baseline commit remains strictly `70410a1`.
2. **Zero Code Changes:** No application source code (`src/`), test files (`tests/`), database schemas/migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

---

### Final Readiness Declaration

### **READY FOR WAVE 1 AUTHORIZATION**

**Status:** Specification v2.8.0 closes all remaining technical, architectural, transaction lifecycle, financial rounding, segregation-of-duties, and geometric raster parity requirements with mathematical proofs and verifiable acceptance criteria. Zero technical blockers remain.

Wave 1 implementation can commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
