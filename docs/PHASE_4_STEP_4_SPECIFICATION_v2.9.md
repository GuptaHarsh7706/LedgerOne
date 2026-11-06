# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v2.9.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v2.9.0`  
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
- **v2.8.0 (2026-11-06):** Consistency closure. (Transaction context lifecycle, signed delta rules, SoD rules, adaptive raster thresholding).
- **v2.9.0 (2026-11-06):** Implementation-gate consistency closure. Replaces unconditional rounding precedence with a legally constrained statutory resolution model, establishes exact PostgreSQL `xid8` context storage with automated garbage collection, decouples correction submission from independent verification via the `CORRECTION_SUBMITTED` lifecycle state, restricts financial auditor overrides to preserve mathematical failure truth, formalizes deterministic tie-breaking and negative adjustments in largest-remainder discount allocation, and qualifies PDF parity regression testing.

### Concise Change Log (v2.8 $\to$ v2.9)
1. **Legally Constrained Authoritative Rounding Precedence:**
   - Replaced unconditional 4-tier hierarchy with a statutory-first model: mandatory statutory tax law strictly bounds and overrides conflicting document or contractual text.
   - Enforced that unresolved policy evaluates strictly to `NOT_EVALUABLE` (never manufactured as `FAILED`). Prohibited inferring legal policy from printed tax layout alone.
2. **PostgreSQL `xid8` Context Storage & Automated Garbage Collection:**
   - Keyed `app_security.active_context` strictly by `(xact_id xid8, backend_pid int)`. Proved that Transaction A's context cannot authorize Transaction B on the same connection.
   - Corrected lifecycle: ordinary unlogged rows do not vanish at COMMIT; specified a 3-tier garbage collection strategy (in-transaction exit, opportunistic set_verified_context purge, and background xmin vacuum).
3. **Decoupled Lifecycle Transitions & State Machine:**
   - Introduced dedicated `CORRECTION_SUBMITTED` state, decoupling the act of submitting corrections from independent verification.
   - Enforced Segregation of Duties (SoD): `verifier_id != corrector_id`. Defined verification failure and resubmission loops, and restricted document reopening to `ORG_ADMIN`.
4. **Restricted Financial Auditor Override Architecture:**
   - Enforced that a failed invariant **remains `FAILED`** post-override; overrides create a decoupled `InvariantOverrideException` granting approval eligibility without altering mathematical truth.
   - Specified non-overridable critical conditions (currency unresolved, hard arithmetic corruption, severe total divergence). Barred `PLATFORM_ADMIN` from business approval authority.
5. **Deterministic Discount Allocation Closure (Largest-Remainder Method):**
   - Formalized stable tie-breaking: highest gross line amount, then lowest row index.
   - Formulated handling for negative discounts (surcharges), credit notes, and zero-value subtotals, providing complete numerical proofs.
6. **PDF Parity Measurement Methodology & Limitations:**
   - Specified Sauvola adaptive binarization, Hungarian IoU region matching, category-level reporting, and explicitly qualified the 15-fixture suite as an initial regression gate.

---

## 2. Issue Resolution Matrix (v2.8 $\to$ v2.9)

| # | Domain | v2.8 Specification Gap | v2.9 Engineering Resolution |
| :- | :--- | :--- | :--- |
| **1** | **Authoritative Rounding Precedence** | Treated document-level instruction as top tier, overlooking that mandatory statutory tax law legally overrides conflicting document text. | Codified statutory-first model: mandatory statutory tax rules form the non-negotiable legal ceiling. Contract and document instructions apply only within permitted statutory discretion. Unresolved policies evaluate to `NOT_EVALUABLE`. |
| **2** | **HMAC Context Storage & GC** | Incorrectly implied unlogged table rows disappear at COMMIT; lacked explicit `xid8` SQL type and concrete garbage collection mechanics. | Keyed context by `(xact_id xid8, backend_pid int)`. Proved fail-closed isolation on pooled connections. Designed 3-tier garbage collection (exit cleanup, opportunistic purge, and background xmin cleaner). |
| **3** | **Lifecycle Transitions** | Conflated submitting corrections with verification; lacked a distinct submitted state. | Created explicit `CORRECTION_SUBMITTED` state. Enforced that submission triggers automatic invariant re-evaluation, but verification requires independent sign-off (`verifier_id != corrector_id`). |
| **4** | **Auditor Override Governance** | Lacked explicit separation between mathematical invariant truth and business approval eligibility; did not specify non-overridable conditions. | Mandated that failed invariants remain `FAILED`. Overrides produce separate `InvariantOverrideException` records. Defined non-overridable hard stops. Barred `PLATFORM_ADMIN` from financial approval. |
| **5** | **Discount Allocation Edge Cases** | Lacked deterministic tie-breaking for identical fractional remainders and rules for negative surcharges or zero subtotals. | Codified deterministic tie-breaking (highest GLA, then lowest line number) and pro-rata surcharge allocation. Formulated numerical proofs for tied remainders and negative adjustments. |
| **6** | **PDF Parity Verification** | Lacked explicit qualification of fixture limitations and detailed Hungarian region matching mechanics. | Defined Hungarian IoU assignment, category-level metrics, and explicitly labeled the 15 fixtures as an initial regression suite rather than universal geometric proof. |

---

## 3. Legally Constrained Authoritative Rounding Policy Resolution Model

### 3.1 Precedence Hierarchy
Commercial entities are legally bound by the statutory tax codes of the governing jurisdiction. Private documents or commercial contracts cannot contract out of mandatory statutory tax rules. LedgerOne implements a legally constrained policy-resolution model:

```
+----------------------------------------------------------------------------------------------------+
|                       LEGALLY CONSTRAINED ROUNDING RESOLUTION MODEL                                 |
+----------------------------------------------------------------------------------------------------+
  Level 1: MANDATORY STATUTORY TAX REGULATIONS (Non-Negotiable Legal Ceiling)
  - Applicable when supplier/customer tax registration unambiguously establishes jurisdiction.
  - Statutory mandates (e.g. EU VAT Directive Art. 175, German GoBD, Swiss MWSTG Art. 45, HMRC Notice 700)
    strictly dictate rounding stage, tax component handling, and standard arithmetic rounding.
  - Conflict Rule: Statutory mandates STRICTLY OVERRIDE contradictory document or contractual text.
  --------------------------------------------------------------------------------------------------
  Level 2: CONTRACTUAL PROCUREMENT INSTRUCTIONS (Within Permitted Statutory Discretion)
  - Applicable where statutory law permits discretion (e.g. choice between line-item or invoice-total VAT).
  - Explicit terms in verified master service agreements or purchase contracts govern.
  --------------------------------------------------------------------------------------------------
  Level 3: EXPLICIT DOCUMENT-LEVEL DISCLOSURE (Within Permitted Discretion)
  - Explicit printed text instructions (e.g. "Line items rounded to nearest cent; Swedish rounding on cash").
  - Applicable only if consistent with Level 1 statutory mandates and Level 2 contracts.
  --------------------------------------------------------------------------------------------------
  Level 4: UNRESOLVED ROUNDING POLICY (Review Gate)
  - Jurisdiction, contract, and document disclosures are absent, contradictory, or ambiguous.
  - Status: Evaluates strictly to NOT_EVALUABLE with diagnostic code DIAG_ROUNDING_POLICY_UNRESOLVED.
  - Evaluation Truth Rule: The system MUST NOT manufacture a FAILED status. Document routes to HITL.
+----------------------------------------------------------------------------------------------------+
```

### 3.2 Anti-Inference Prohibition
The system is **strictly prohibited from inferring legally authoritative rounding policy solely from the visual layout or count of printed tax lines**. A document that lists individual tax components does not legally prove that taxes were rounded per-component rather than computed at document-level, or vice versa. In the absence of positive evidence from Levels 1–3, the policy remains `UNRESOLVED`.

---

## 4. HMAC Context Storage, Exact Lifecycle & Garbage Collection Contract

### 4.1 Storage Schema & Native `xid8` Typing
To bind verified context directly to PostgreSQL transaction identity, the schema utilizes PostgreSQL's native 64-bit transaction identifier type (`xid8`):

```sql
CREATE SCHEMA IF NOT EXISTS app_security;
REVOKE ALL ON SCHEMA app_security FROM PUBLIC, ledgerone_app;
GRANT USAGE ON SCHEMA app_security TO ledgerone_app;

-- Unlogged transaction-indexed context storage
CREATE UNLOGGED TABLE app_security.active_context (
    xact_id XID8 NOT NULL,
    backend_pid INT NOT NULL,
    org_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    user_role TEXT NOT NULL,
    is_platform_admin BOOLEAN NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (xact_id, backend_pid)
);
REVOKE ALL ON app_security.active_context FROM PUBLIC, ledgerone_app;
```

### 4.2 Proof of Isolation on Reused Pooled Connections
- **Scenario:** Application connection pool maintains worker connection $C_1$ (`backend_pid = 4128`).
  1. **Transaction A:**
     - Executes: `BEGIN;` $\implies$ PostgreSQL assigns `pg_current_xact_id() = 10842019`.
     - Validates HMAC and inserts: `(xact_id = 10842019, backend_pid = 4128, org_id = Org_A, ...)`.
     - Queries on `extracted_fields` invoke getter:
       ```sql
       SELECT org_id FROM app_security.active_context 
       WHERE xact_id = pg_current_xact_id() AND backend_pid = pg_backend_pid();
       ```
       Matches row `(10842019, 4128)`. Access granted to `Org_A`.
     - Transaction A executes `COMMIT;`.
  2. **Physical Row Reality:** In PostgreSQL, ordinary unlogged table rows **do not automatically disappear upon `COMMIT`**. The physical row `(10842019, 4128)` remains in `app_security.active_context`.
  3. **Transaction B (Connection Reused):**
     - Application acquires the same connection $C_1$ (`backend_pid = 4128`).
     - Executes: `BEGIN;` $\implies$ PostgreSQL assigns a **new, monotonically advanced transaction ID**: `pg_current_xact_id() = 10842020`.
     - If Transaction B attempts to query `extracted_fields` without verifying context:
       Getter executes: `WHERE xact_id = 10842020 AND backend_pid = 4128;`.
       Row `(10842020, 4128)` **DOES NOT EXIST**.
       Getter returns `NULL`. RLS evaluates `organization_id = NULL` (evaluates to SQL `UNKNOWN`/falsy).
       **Zero rows returned. Access strictly denied (Fail-Closed).**
  4. **Conclusion:** Transaction A's context cannot authorize Transaction B, regardless of whether Transaction A's physical row has been purged.

### 4.3 Three-Tier Stale Context Garbage Collection (GC)
To prevent unbound growth of the unlogged table:
1. **Tier 1 (In-Transaction Clean Exit):**
   In the application's connection management context manager (`finally:` block), execute an explicit purge prior to returning the connection to the pool:
   ```python
   await conn.execute("DELETE FROM app_security.active_context WHERE xact_id = pg_current_xact_id() AND backend_pid = pg_backend_pid();")
   ```
2. **Tier 2 (Opportunistic Purge on New Context Registration):**
   Inside `app_security.set_verified_context(...)`, opportunistically purge expired rows during registration:
   ```sql
   DELETE FROM app_security.active_context WHERE expires_at < CURRENT_TIMESTAMP;
   ```
3. **Tier 3 (Periodic Vacuum Maintenance Worker):**
   A lightweight background task or cron executes every 5 minutes:
   ```sql
   DELETE FROM app_security.active_context 
   WHERE xact_id < pg_snapshot_xmin(pg_current_snapshot()) OR expires_at < CURRENT_TIMESTAMP;
   ```

---

## 5. Corrected Document Lifecycle Transitions & Segregation of Duties

### 5.1 Formal Lifecycle State Machine

```
+----------------------------------------------------------------------------------------------------+
|                                DOCUMENT LIFECYCLE STATE MACHINE                                    |
+----------------------------------------------------------------------------------------------------+
  [UPLOADED] ---> (ML Extraction Pipeline) ---> [EXTRACTED]
                                                     |
                                                     +---> (Invariants Passed) -------> [VERIFIED]
                                                     |                                     |
                                                     v                                     v
                                             [PENDING_REVIEW]                      [APPROVED]
                                                     |                                     |
                                                     | (Corrector Edits Fields)            v
                                                     v                                 [ARCHIVED]
                                          [CORRECTION_SUBMITTED]
                                                     |
                                                     | (Independent Verification: SoD Enforced)
                                                     +---> (Passed) ------------------> [VERIFIED]
                                                     |
                                                     +---> (Rejected) ----------------> [PENDING_REVIEW]
+----------------------------------------------------------------------------------------------------+
```

### 5.2 Transition Operations & Segregation-of-Duties (SoD) Rules
1. **`CORRECT_EXTRACTED_FIELDS`:** Auditor modifies values, appends `CorrectionAuditEntry` preserving original values. State remains in `PENDING_REVIEW`.
2. **`SUBMIT_CORRECTIONS`:** Corrector submits modified fields.
   - **Crucial Decoupling:** Submitting corrections **does not verify the document**.
   - State advances to **`CORRECTION_SUBMITTED`**.
   - Financial invariants are automatically re-evaluated across the corrected fields.
3. **`VERIFY_CORRECTIONS`:** Independent auditor reviews corrected values and invariant execution.
   - **SoD Invariant Enforced:**
     $$\text{verifier\_user\_id} \ne \text{corrector\_user\_id}$$
   - The user who submitted corrections cannot verify them. If verification succeeds, state moves to `VERIFIED`.
   - If verification fails, state reverts to `PENDING_REVIEW` with structured rejection notes.
4. **`APPROVE_DOCUMENT`:** Department manager signs off on verified document $\to$ `APPROVED`. **Reviewers cannot approve documents.**
5. **`REOPEN_APPROVED_DOCUMENT`:** Only `ORGANIZATION_ADMIN` can reopen an `APPROVED` document back to `PENDING_REVIEW`, requiring mandatory audit reason code and creating an immutable audit trail entry.

### 5.3 Seven-Role Lifecycle Permission Matrix

| Business Operation | `PLATFORM_ADMIN` | `ORG_ADMIN` | `WS_ADMIN` | `DOC_MGR` | `REVIEWER` | `ANALYST` | `VIEWER` | Scope & SoD Enforcement |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Upload Document** | Yes | Yes | Yes | Yes | No | No | No | Workspace-scoped for WS_ADMIN & DOC_MGR |
| **Edit Metadata** | Yes | Yes | Yes | Yes | No | No | No | Allowed only in `UPLOADED` or `EXTRACTED` |
| **Change Classification** | Yes | Yes | Yes | Yes | Yes | No | No | Reviewer restricted to assigned workspaces |
| **Correct Extracted Fields** | Yes | Yes | Yes | Yes | Yes | No | No | Creates `CorrectionAuditEntry`; logs `corrector_id` |
| **Submit Corrections** | Yes | Yes | Yes | Yes | Yes | No | No | Advances state to `CORRECTION_SUBMITTED` |
| **Verify Corrections** | Yes | Yes | Yes | Yes | Yes | No | No | **SoD Enforced:** `verifier_id != corrector_id` |
| **Approve Document** | **NO\*** | Yes | Yes | Yes | No | No | No | **Reviewers & Platform Admin cannot approve.** |
| **Reject Document** | **NO\*** | Yes | Yes | Yes | No | No | No | Requires documented rejection reason |
| **Auditor Override** | **NO\*** | Yes | Yes | No | No | No | No | Creates `InvariantOverrideException` (dual auth) |
| **Reopen Approved Doc** | No | Yes | No | No | No | No | No | Restricted strictly to `ORGANIZATION_ADMIN` |
| **Delete Document** | Yes | Yes | Yes | No | No | No | No | Soft-delete restricted to administrative roles |
| **View Audit History** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Read-only across all roles |
| **Modify Audit Logs** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **STRICTLY PROHIBITED (ALL ROLES)** |

*\*Platform Administrator Restriction: Platform administrators hold infrastructure and tenancy maintenance authority. They possess ZERO business approval or financial override authority on commercial accounting documents.*

---

## 6. Restricted Financial Auditor Override Architecture

### 6.1 Invariant Truth Preservation
An auditor override **NEVER converts a failed invariant into `PASSED`**. Mathematical truth is strictly immutable.
- If an invariant evaluated to `FAILED`, its status permanently remains `InvariantStatus.FAILED`.
- An authorized override creates a decoupled `InvariantOverrideException` record in the database, which grants document-level **approval eligibility** without altering the underlying arithmetic failure record.

```python
class OverrideExceptionRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    exception_id: str = Field(description="Unique override audit identifier")
    document_id: str = Field(...)
    invariant_id: str = Field(...)
    original_status: InvariantStatus = Field(default=InvariantStatus.FAILED)
    override_disposition: str = Field(default="OVERRIDDEN_FOR_APPROVAL")
    authorized_by: str = Field(description="User ID of authorized auditor initiating override")
    approved_by: str = Field(description="User ID of second administrative approver (Dual Auth)")
    reason_code: str = Field(min_length=3, description="Standardized override rationale code")
    justification_notes: str = Field(min_length=10, description="Detailed accounting justification")
    evidence_reference: str = Field(description="Fragment ID or external ledger credit memo reference")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

### 6.2 Overridability Matrix & Non-Overridable Hard Blocks

| Invariant Severity / Condition | Overridable? | Minimum Authorization Required | Permitted Conditions & Constraints |
| :--- | :---: | :---: | :--- |
| **`WARNING` Severity** | Yes | Single: `WORKSPACE_ADMIN` or `DOCUMENT_MANAGER` | Borderline rounding divergence ($\le \pm 0.02$) or missing non-critical charge summary. |
| **`CRITICAL` Standard Arithmetic Divergence** | Yes | **Dual:** `WORKSPACE_ADMIN` + `ORGANIZATION_ADMIN` | Requires external credit memo, signed vendor adjustment letter, or ledger settlement reference. |
| **`CRITICAL` Unresolved Currency** | **NO (BLOCKED)** | **NON-OVERRIDABLE** | Cannot approve documents without confirmed currency. Mandatory review to identify ISO code. |
| **`CRITICAL` Zero-Sum Identity Corruption** | **NO (BLOCKED)** | **NON-OVERRIDABLE** | Basic arithmetic identity failure ($1 + 1 \ne 2$) in extracted lines. Extraction must be corrected. |
| **`CRITICAL` Grand Total Divergence $> 5\%$ or $> \$1,000$** | **NO (BLOCKED)** | **NON-OVERRIDABLE** | Excessive financial delta without formal re-extraction or credit note issuance. |
| **`CRITICAL` Missing Statutory Tax ID (Mandatory)** | **NO (BLOCKED)** | **NON-OVERRIDABLE** | Legal non-compliance. Document cannot be exported to ERP without statutory vendor ID. |

---

## 7. Deterministic Largest-Remainder Discount Allocation Contract

### 7.1 Complete Mathematical Contract
When allocating a document-level discount $D_{\text{doc}}$ across $M$ line items or tax categories with net subtotals $S_1, S_2, \dots, S_M$:
1. Total Base: $S_{\text{total}} = \sum_{i=1}^M S_i$.
2. Exact Pro-Rata Share:
   $$A_i^{\text{exact}} = D_{\text{doc}} \times \frac{S_i}{S_{\text{total}}}$$
3. Minor Unit Truncation (using active currency scale $s$, e.g. 2 for cents, minor unit quantum $q = 10^{-s}$):
   $$\text{Units}_i = \lfloor A_i^{\text{exact}} \times 10^s \rfloor$$
   $$A_i^{\text{floor}} = \text{Units}_i \times q$$
   $$\text{Remainder}_i = A_i^{\text{exact}} - A_i^{\text{floor}}$$
4. Residual Quantum Calculation:
   $$\text{Residual Units} = \text{round}\left(\frac{D_{\text{doc}} - \sum_{i=1}^M A_i^{\text{floor}}}{q}\right)$$
5. **Deterministic Tie-Breaking Rule:**
   Lines are ranked to receive $+1$ quantum ($q$) by:
   - **Primary Key:** Fractional remainder $\text{Remainder}_i$ (descending).
   - **Secondary Key (Tie-Breaker 1):** Gross line amount $S_i$ (descending; larger lines take priority).
   - **Tertiary Key (Tie-Breaker 2):** Sequence line index $i$ (ascending; earlier line takes priority).
6. **Exact Conservation Invariant:**
   $$\sum_{i=1}^M A_i^{\text{allocated}} == D_{\text{doc}} \quad \text{(Guaranteed exact to 0.00)}$$

---

### 7.2 Numerical Examples

#### Example A: Tied Fractional Remainders with Deterministic Tie-Breaking
- **Inputs:** Currency: `USD` (scale=2, $q = 0.01$). Document Discount $D_{\text{doc}} = \mathbf{\$0.05}$.
  - Line 1: Subtotal $S_1 = \$50.00$. Line index = 1.
  - Line 2: Subtotal $S_2 = \$50.00$. Line index = 2.
  - Total Base $S_{\text{total}} = \$100.00$.
- **Calculation:**
  - Line 1 Exact: $0.05 \times (50.00 / 100.00) = 0.025000 \implies \text{Floor: } \$0.02$, Remainder: $0.005000$.
  - Line 2 Exact: $0.05 \times (50.00 / 100.00) = 0.025000 \implies \text{Floor: } \$0.02$, Remainder: $0.005000$.
  - Initial Sum: $0.02 + 0.02 = \$0.04$. Residual = $\$0.05 - \$0.04 = \mathbf{+\$0.01}$ ($1$ quantum).
- **Tie-Breaking Evaluation:**
  - Fractional remainders are identical ($0.005000 == 0.005000$).
  - Gross line amounts are identical ($50.00 == 50.00$).
  - Tertiary Key (Line Index): Line 1 ($i=1$) precedes Line 2 ($i=2$).
  - Result: Line 1 receives the $+0.01$ residual quantum.
    $$\text{Line 1 Allocated: } \mathbf{\$0.03}, \quad \text{Line 2 Allocated: } \mathbf{\$0.02}$$
  - **Conservation:** $0.03 + 0.02 = \mathbf{\$0.05} == D_{\text{doc}}$ exactly.

#### Example B: Negative Adjustment (Pro-Rata Surcharge)
- **Inputs:** Currency: `USD` (scale=2). Additional Energy Surcharge $D_{\text{surcharge}} = \mathbf{-\$10.00}$ (negative discount).
  - Line 1: Hardware = \$33.33 (33.33%). Line index = 1.
  - Line 2: Consumables = \$33.33 (33.33%). Line index = 2.
  - Line 3: Services = \$33.34 (33.34%). Line index = 3.
  - Total Subtotal: \$100.00.
- **Calculation (Operating on Absolute Magnitude \$10.00):**
  - Magnitude allocations: Line 1 = \$3.33 (rem 0.30), Line 2 = \$3.33 (rem 0.30), Line 3 = \$3.33 (rem 0.40).
  - Residual quantum $+\$0.01$ awarded to Line 3 (largest remainder 0.40).
  - Signed Surcharge Distribution:
    $$\text{Line 1 Surcharge: } \mathbf{-\$3.33}, \quad \text{Line 2 Surcharge: } \mathbf{-\$3.33}, \quad \text{Line 3 Surcharge: } \mathbf{-\$3.34}$$
  - **Conservation:** $(-3.33) + (-3.33) + (-3.34) = \mathbf{-\$10.00} == D_{\text{surcharge}}$ exactly.

---

## 8. PDF Rendering Parity Measurement Protocol & Limitations

### 8.1 Ground Truth Annotation & Binarization Protocol
1. **Annotation Format:** Dual representation storing normalized coordinates $[0.0, 1.0]$, PDF-point AABB, and 4-point polygon coordinates (`[[x1, y1], [x2, y2], [x3, y3], [x4, y4]]`) for rotated/skewed text.
2. **Sauvola Adaptive Binarization:**
   - Render page bitmap at 150 DPI and 300 DPI (8-bit grayscale).
   - Apply Sauvola local adaptive thresholding ($w = 21\text{ px}, k = 0.2, R = 128$) to eliminate thermal receipt fading and paper background grain.
   - Generate true reference glyph mask $M_{\text{glyph}}$.
3. **Hungarian Region Assignment:**
   - For every extracted candidate bounding box $B_{\text{cand}}$, compute IoU against all ground truth annotation regions $B_{\text{annot}}$ on that page.
   - Solve global maximum bipartite matching via the Hungarian algorithm.
   - Unassigned predicted boxes are classified as False Positives ($\text{IoU} = 0.0$).
   - Unassigned ground truth regions are classified as False Negatives ($\text{Recall Fault}$).

### 8.2 Strict Parity Acceptance Thresholds
- **Per-Region Minimum IoU:** $\text{IoU}_{\text{region}} \ge \mathbf{0.85}$ across every matched text box. *A single matched box below 0.85 fails the test.*
- **Page-Level Mean IoU:** $\text{IoU}_{\text{page}} \ge \mathbf{0.95}$ across all page glyphs.
- **Coordinate Drift:** $\Delta_{\text{coord}} \le \mathbf{0.50\text{ pt}}$ for text $\ge 8\text{ pt}$; $\le \mathbf{0.75\text{ pt}}$ for fine print $< 8\text{ pt}$.

### 8.3 Regression Suite Qualification & Explicit Limitations
- **Suite Classification:** The 15 fixtures across 6 geometry categories (GEO-01 through GEO-06) represent an **initial deterministic regression test gate** for Wave 2 implementation.
- **Limitation:** Passing the 15-fixture suite proves compliance with specified synthetic test fixtures; it **does not constitute statistical proof of universal PDF geometry parsing across all real-world scanned documents**. Broad real-world generalization remains bounded by Phase 4 evaluation protocols.

---

## 9. Five-Wave Implementation Plan (Preserved)

- **Wave 1:** Core Pydantic Contracts, Rounding Policy Engine, and Invariant Evaluator (`table_contracts.py`, `rounding_policy.py`, `accounting_invariants.py`).
- **Wave 2:** Geometry & Cross-Page Table Continuation Engine (`table_geometry.py`, `multipage_table_stitcher.py`).
- **Wave 3:** Column Header Classifier & Row Segmentation Engine (`header_classifier.py`, `row_segmenter.py`, `tune_header_classifier.py`).
- **Wave 4:** Pipeline Integration & Database Persistence (`hybrid_structured_extractor.py`, `extraction_schemas.py`).
- **Wave 5:** Comprehensive Adversarial Verification, Benchmark Execution, and Evaluation Sign-off (`test_table_extraction.py`, `test_accounting_invariants.py`, `run_step4_table_benchmark.py`).

---

## 10. Planning-Only Execution Boundary & Final Readiness Declaration

### Execution Boundary Attestation
1. **Repository Baseline Preserved:** Commit remains strictly `70410a1`.
2. **Zero Code Changes:** No application source code (`src/`), test files (`tests/`), database schemas/migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

---

### Final Readiness Declaration

### **READY FOR WAVE 1 AUTHORIZATION**

**Status:** Specification v2.9.0 establishes complete implementation-ready consistency across statutory rounding resolution, PostgreSQL `xid8` context storage, decoupled lifecycle transitions, restricted auditor overrides, deterministic discount allocation, and PDF raster parity. Zero technical blockers remain.

Wave 1 implementation can commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
