# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v2.4.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v2.4.0`  
**Baseline Git Commit:** `70410a1` (`feat(intelligence): Phase 4 Step 3 comparative extraction audit, Decimal precision, and calibration gate (v3.9.0)`)  
**Scope Classification:** Strictly Planning and Specification Only  
**Execution Authorization Status:** **STRICTLY BLOCKED** (Awaiting explicit human principal authorization)  
**Target Module:** `LedgerOne/src/intelligence/`  
**Regression Baseline:** 124 platform regression tests passing on commit `70410a1`  

---

## 1. Version and Change Log

### Version History
- **v1.0.0 (2026-11-04):** Initial Phase 4 Step 4 proposal. (Rejected: insufficient accounting generality, premature multi-page stitching).
- **v2.0.0 (2026-11-05):** Revised execution plan. (Rejected: banking rounding confusion, unsafe Pydantic defaults, undefined invariant statuses).
- **v2.1.0 (2026-11-05):** Technical plan revision. (Rejected: unverified statutory claims, inconsistent multi-page denominators, ambiguous coordinate spaces).
- **v2.2.0 (2026-11-06):** Reconciled specification. (Substantially accepted; required 6 targeted technical corrections).
- **v2.3.0 (2026-11-06):** Specification corrections. (Addressed Pydantic contracts, Decimal rounding, evidence coordinates, and database qualification).
- **v2.4.0 (2026-11-06):** Final security, geometry, currency, and accounting corrections. Full RLS threat model, PDF coordinate transformation pipeline, ISO 4217 registry, correction audit-chain integrity, and benchmark freeze protocol applied.

### Concise Change Log (v2.3 $\to$ v2.4)
1. **RLS & Security Threat Analysis:**
   - Audited all 4 existing RLS policies on `extracted_fields`. Identified that while `SELECT` enforces workspace membership, `INSERT`, `UPDATE`, and `DELETE` enforce organization tenancy and role checks but lack workspace-scoping checks in their SQL definitions.
   - Formalized trust boundary assumptions: custom session parameters (`app.current_org_id`, `app.current_user_id`, `app.current_user_role`, `app.is_platform_admin`) set by the shared `ledgerone_app` role are not an independent defense against SQL injection. Provided a complete permission matrix.
2. **PDF Geometry & Coordinate Transformations:**
   - Formalized separation between native PDF user-space (bottom-left origin, CropBox/MediaBox) and canonical visual space (top-left origin).
   - Specified exact affine coordinate transformations for `/Rotate` values of $0^\circ, 90^\circ, 180^\circ, 270^\circ$, and non-standard continuous rolls.
   - Added dual-coordinate parity validation asserting that normalized and PDF-point bounding boxes describe the exact same physical region within $\pm 0.05\text{ pt}$.
3. **Currency Metadata & Minor-Unit Precision:**
   - Replaced ad-hoc currency lists with versioned `ISO_4217_REGISTRY_v2026_1`.
   - Formalized minor-unit scales (0, 2, 3, 4 decimals) and distinguished accounting precision from cash rounding.
   - Defined strict unsupported currency handling: fallback to scale 2 is permitted only with `DEFAULTED` provenance, emitting an audit warning.
4. **Correction Audit-Chain Integrity:**
   - Formalized audit-chain continuity for `HUMAN_CORRECTED`: `original_value` matches first entry's `previous_value`, each intermediate entry links sequentially, and current `value` matches latest entry's `new_value`.
   - Clarified epistemic semantics: human verification is not perfect certainty (confidence is reviewer-assigned or `None`, not 1.0); extraction confidence is an uncalibrated heuristic score.
5. **Accounting Invariant Rigor:**
   - Explicitly clarified that a tax ID is an entity identifier, not evidence of a tax rate (`INV-004`).
   - Detailed master grand-total equation with explicit component signs (`INV-006`).
   - Established debit/credit conventions and opening balance requirements (`INV-008`).
   - Mandated multi-point corroboration for multi-page continuation in the absence of carried-forward totals (`INV-009`).
   - Defined complete 4-state evaluation criteria for sign consistency (`INV-010`).
6. **Benchmark Freeze Protocol:**
   - Clarified that $\tau=0.75$ and $\Delta=0.15$ are default starting baselines.
   - Formalized development-only hyperparameter tuning on the 10 `development` split documents, followed by configuration freeze and SHA-256 logging before blind held-out evaluation.

---

## 2. Six-Section Issue Resolution Matrix (v2.3 $\to$ v2.4)

| # | Domain | v2.3 Specification Gap | v2.4 Engineering Correction |
| :- | :--- | :--- | :--- |
| **1** | **RLS Security** | Assumed RLS policies completely isolate workspaces across all operations without citing exact SQL. | Audited verbatim SQL: revealed `INSERT`, `UPDATE`, `DELETE` omit `workspace_id IN (...)`. Documented SQL injection blast radius under shared `ledgerone_app` role and provided complete permission matrix. |
| **2** | **PDF Geometry** | Did not detail native PDF CropBox/MediaBox or affine rotation matrices. | Defined exact mathematical transformation sequence from native PDF space to canonical top-left visual space across all 4 rotation states ($0^\circ, 90^\circ, 180^\circ, 270^\circ$) with dual-representation parity validation. |
| **3** | **Currency Metadata** | Hardcoded a subset of currencies without versioning or cash rounding distinction. | Integrated versioned `ISO_4217_REGISTRY_v2026_1`. Decoupled accounting minor-unit precision from physical cash rounding. Mandated `DEFAULTED` provenance for unsupported currency fallbacks. |
| **4** | **Audit Integrity** | Stated human corrections record history but did not enforce sequential pointer continuity. | Formalized mathematical audit-chain continuity across repeated human edits: $V_0 = \text{orig}$, $V_k = \text{prev}_{k+1}$, $V_K = \text{curr}$. Decoupled `HUMAN_VERIFIED` from 1.0 confidence. |
| **5** | **Accounting Equations** | Accepted tax ID as potential tax rate evidence; lacked complete criteria for `INV-009` and `INV-010`. | Formally barred tax ID from serving as tax rate evidence. Detailed full master equations, debit/credit balance equations, multi-point continuation corroboration, and complete 4-state criteria. |
| **6** | **Benchmark Freeze** | Ambiguous whether $\tau=0.75$ was tuned or default; unclear tuning boundary. | Explicitly designated $\tau=0.75, \Delta=0.15$ as initial heuristic baselines. Established development-only grid search, configuration freeze, SHA-256 checksum, and blind held-out evaluation. |

---

## 3. RLS and Workspace Authorization Analysis

### 3.1 Verbatim Policy DDL from `LedgerOne/db/schema.sql` (lines 608–656)

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
          AND wm.is_active = true
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

### 3.2 Role and Operation Permission Matrix

| Role (`app.current_user_role`) | `SELECT` Scope | `INSERT` Scope | `UPDATE` Scope | `DELETE` Scope |
| :--- | :--- | :--- | :--- | :--- |
| **`PLATFORM_ADMIN`** (`is_platform_admin=true`) | Organization-wide | Organization-wide | Organization-wide | Organization-wide |
| **`ORGANIZATION_ADMIN`** | Organization-wide (all workspaces) | Organization-wide | Organization-wide | Organization-wide |
| **`WORKSPACE_ADMIN`** | Active workspaces assigned in `wm` | Organization-wide* | Organization-wide* | Organization-wide* |
| **`DOCUMENT_MANAGER`** | Active workspaces assigned in `wm` | Organization-wide* | Organization-wide* | Denied (`403`) |
| **`REVIEWER`** | Active workspaces assigned in `wm` | Denied (`403`) | Organization-wide* | Denied (`403`) |
| **`ANALYST`** | Active workspaces assigned in `wm` | Denied (`403`) | Denied (`403`) | Denied (`403`) |
| **`VIEWER`** | Active workspaces assigned in `wm` | Denied (`403`) | Denied (`403`) | Denied (`403`) |

*\*Critical Architectural Finding:* In the existing database schema, `rls_extracted_fields_select` strictly filters by `workspace_id IN (SELECT wm.workspace_id FROM workspace_memberships wm ...)`. However, `INSERT`, `UPDATE`, and `DELETE` policies enforce `organization_id` isolation and role authorization, but **omit** the inner workspace membership check.

### 3.3 Security Attributes, Table Owner & Trust Assumptions
- **Table Owner:** `postgres` (superuser).
- **Connecting Database User:** `ledgerone_app`. Role attributes: `NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS`.
- **Row-Level Security Flags:** `ALTER TABLE extracted_fields ENABLE ROW LEVEL SECURITY;` and `ALTER TABLE extracted_fields FORCE ROW LEVEL SECURITY;`.
  Because `FORCE ROW LEVEL SECURITY` is set, table owners and table creators are subject to RLS policies during non-superuser sessions.
- **Trust Boundary & SQL Injection Blast Radius:**
  - Application session variables (`app.current_org_id`, `app.current_user_id`, `app.current_user_role`, `app.is_platform_admin`) are set by the application connection pool via `SET LOCAL`.
  - **Vulnerability Analysis:** The PostgreSQL database user `ledgerone_app` has the technical capability to execute `SET LOCAL` to arbitrary values. Custom session variables **do not constitute an independent security boundary against SQL injection**. If an attacker achieves arbitrary SQL execution through the application pool, they can execute:
    ```sql
    SET LOCAL app.is_platform_admin = 'true';
    SET LOCAL app.current_org_id = '00000000-0000-0000-0000-000000000001';
    ```
    This completely bypasses workspace and role isolation.
  - **Mitigation Requirement (Phase 5 Roadmap):** Application-layer parameterized queries (`asyncpg` prepared statements) are mandatory. In Phase 5, RLS policies for `INSERT`, `UPDATE`, and `DELETE` must be updated to include explicit `workspace_id IN (SELECT ...)` sub-queries, preventing cross-workspace mutation within an organization even if an application bug passes an unintended workspace ID.

---

## 4. PDF Geometry — Page Bounds and Coordinate Transformations

### 4.1 Coordinate Spaces Defined
1. **Native PDF User Space ($x_{\text{pdf}}, y_{\text{pdf}}$):**
   - Origin $(0, 0)$ at **bottom-left**. Axis $+x$ extends rightward, axis $+y$ extends **upward**.
   - Bounded by `CropBox = [cllx, clly, curx, cury]` if defined, else `MediaBox = [llx, lly, urx, ury]`.
   - Native width $W_0 = curx - cllx$, native height $H_0 = cury - clly$.
2. **Canonical Visual Coordinate Space ($x_{\text{vis}}, y_{\text{vis}}$):**
   - Origin $(0, 0)$ at **top-left**. Axis $+x$ extends rightward, axis $+y$ extends **downward**.
   - Dimensions: $W_{\text{vis}}, H_{\text{vis}}$ in 72-DPI PostScript points ($1\text{ pt} = 1/72\text{ inch}$).
3. **Normalized Space ($x_{\text{norm}}, y_{\text{norm}}$):**
   - Unit square $[0.0, 1.0] \times [0.0, 1.0]$ with top-left origin.

### 4.2 Affine Transformation Sequence
Let relative PDF coordinates be $x_{\text{rel}} = x_{\text{pdf}} - cllx$ and $y_{\text{rel}} = y_{\text{pdf}} - clly$.

Depending on page rotation `/Rotate` $\in \{0, 90, 180, 270\}$ degrees (clockwise):

$$\begin{aligned}
\mathbf{\text{Rotate } 0^\circ:} &\quad W_{\text{vis}} = W_0, \quad H_{\text{vis}} = H_0 \\
& \quad x_{\text{vis}} = x_{\text{rel}}, \quad y_{\text{vis}} = H_0 - y_{\text{rel}} \\[6pt]
\mathbf{\text{Rotate } 90^\circ:} &\quad W_{\text{vis}} = H_0, \quad H_{\text{vis}} = W_0 \\
& \quad x_{\text{vis}} = y_{\text{rel}}, \quad y_{\text{vis}} = x_{\text{rel}} \\[6pt]
\mathbf{\text{Rotate } 180^\circ:} &\quad W_{\text{vis}} = W_0, \quad H_{\text{vis}} = H_0 \\
& \quad x_{\text{vis}} = W_0 - x_{\text{rel}}, \quad y_{\text{vis}} = y_{\text{rel}} \\[6pt]
\mathbf{\text{Rotate } 270^\circ:} &\quad W_{\text{vis}} = H_0, \quad H_{\text{vis}} = W_0 \\
& \quad x_{\text{vis}} = H_0 - y_{\text{rel}}, \quad y_{\text{vis}} = W_0 - x_{\text{rel}}
\end{aligned}$$

For bounding boxes, min and max coordinates in visual space are calculated as:
$$x_{\text{vis\_min}} = \min(x_{\text{vis}}(p_1), \dots, x_{\text{vis}}(p_4)), \quad x_{\text{vis\_max}} = \max(x_{\text{vis}}(p_1), \dots, x_{\text{vis}}(p_4))$$
$$y_{\text{vis\_min}} = \min(y_{\text{vis}}(p_1), \dots, y_{\text{vis}}(p_4)), \quad y_{\text{vis\_max}} = \max(y_{\text{vis}}(p_1), \dots, y_{\text{vis}}(p_4))$$

### 4.3 Dual-Representation Parity and Area Validation
- **Positive Area Requirement:** $(x_{\text{vis\_max}} > x_{\text{vis\_min}}) \land (y_{\text{vis\_max}} > y_{\text{vis\_min}})$. Zero-area boxes raise `ValueError`.
- **Parity Tolerance:** Both coordinate objects must describe the identical physical region within $\pm 0.05\text{ pt}$:
  $$|x_{\text{norm\_min}} \times W_{\text{vis}} - x_{\text{pt\_min}}| \le 0.05\text{ pt}$$
  $$|y_{\text{norm\_min}} \times H_{\text{vis}} - y_{\text{pt\_min}}| \le 0.05\text{ pt}$$
  $$|x_{\text{norm\_max}} \times W_{\text{vis}} - x_{\text{pt\_max}}| \le 0.05\text{ pt}$$
  $$|y_{\text{norm\_max}} \times H_{\text{vis}} - y_{\text{pt\_max}}| \le 0.05\text{ pt}$$

---

## 5. Currency Metadata and Rounding Provenance

### 5.1 Versioned Currency Registry (`ISO_4217_REGISTRY_v2026_1`)
LedgerOne embeds an immutable ISO 4217 minor-unit precision registry:

```python
ISO_4217_REGISTRY_v2026_1 = {
    # 0 Decimal Currencies
    "BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "ISK": 0, "JPY": 0, "KMF": 0,
    "KRW": 0, "PYG": 0, "RWF": 0, "UGX": 0, "UYI": 0, "VND": 0, "VUV": 0,
    "XAF": 0, "XOF": 0, "XPF": 0,
    # 3 Decimal Currencies
    "BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
    # 4 Decimal Currencies
    "CLF": 4, "UYW": 4,
    # Standard 2 Decimal Currencies (Sample)
    "USD": 2, "EUR": 2, "GBP": 2, "CAD": 2, "AUD": 2, "CHF": 2, "INR": 2,
    "CNY": 2, "BRL": 2, "MXN": 2, "SGD": 2, "NZD": 2, "ZAR": 2, "AED": 2
}
```

### 5.2 Accounting Precision vs. Cash Rounding
- **Invoicing / Accounting Precision:** Line-item extraction and reconciliation operate exclusively at accounting minor-unit scale (e.g. $0.01$ for USD, EUR, CAD, CHF).
- **Cash Rounding (e.g. 5-cent rounding):** Applicable *only* to physical cash receipts when an explicit cash rounding adjustment token is printed on the document. Cash rounding must never be applied to general commercial invoices.

### 5.3 Policy Hierarchy and Fallback Protocol
1. `DOCUMENT_EXPLICIT_DISCLOSURE` (`OBSERVED`): Disclosed in printed text (e.g. "All values rounded to nearest yen").
2. `ORGANIZATION_SETTING` (`INFERRED`): Configured accounting preferences for the active workspace.
3. `JURISDICTION_DEFAULT` (`INFERRED`): Derived from detected country code or ISO 4217 lookup table.
4. `FALLBACK_DEFAULT` (`DEFAULTED`): When currency is missing or unlisted in the ISO registry:
   - Currency defaults to `USD`, scale defaults to `2`, mode defaults to `ROUND_HALF_UP`.
   - `provenance_type = DEFAULTED`.
   - Emits an mandatory audit `WARNING` requiring human review.

---

## 6. Human Correction Audit-Chain Integrity

### 6.1 Audit-Chain Continuity Equations
For any field with `origin == FieldOrigin.HUMAN_CORRECTED`, the audit history is modeled as an immutable sequence of $K \ge 1$ transitions:

$$\mathcal{H} = \langle e_1, e_2, \dots, e_K \rangle$$

The following structural continuity invariants are strictly enforced:
1. **Initial Step Continuity:**
   $$e_1.\text{previous\_value} == \text{self.original\_value}$$
2. **Sequential Pointer Continuity:**
   $$e_k.\text{previous\_value} == e_{k-1}.\text{new\_value} \quad \forall k \in [2, K]$$
3. **Current Terminal State Parity:**
   $$\text{self.value} == e_K.\text{new\_value}$$
   $$\text{self.corrected\_by} == e_K.\text{reviewer\_id}$$
   $$\text{self.corrected\_at} == e_K.\text{timestamp}$$
   $$\text{self.correction\_reason} == e_K.\text{reason}$$
4. **Monotonicity:**
   $$e_k.\text{timestamp} \ge e_{k-1}.\text{timestamp} \quad \forall k \in [2, K]$$

### 6.2 Epistemic Confidence Decoupling
- **Human Verification Uncertainty:** Human auditors make transcription errors. Setting `confidence = 1.0` is strictly prohibited. `LineItemField` assigns `confidence_type = ConfidenceType.HUMAN_VERIFIED` with `confidence = None` (or reviewer-specified assessment).
- **Automated Extraction Confidence:** Raw extraction confidence reflects candidate corroboration agreement and softmax outputs; it is an uncalibrated heuristic score, not a Bayesian posterior probability.

---

## 7. Complete Accounting Invariant Equations and Evidence Requirements

All computations use Python `Decimal` exclusively.

### INV-001: Row Arithmetic (`ROW_ARITHMETIC`)
- **Required Inputs:** `quantity: Decimal`, `unit_price: Decimal`, `line_total: Decimal`, optional `row_discount: Optional[Decimal]`.
- **Equation:**
  $$\text{expected\_total} = \text{quantize}\Big((\text{quantity} \times \text{unit\_price}) - \text{row\_discount}_{\text{eff}}, \text{scale}\Big)$$
- **Applicability:** Row contains extracted numeric quantity, unit price, and line total.
- **Criteria:**
  - `PASSED`: $|\text{line\_total} - \text{expected\_total}| \le \text{tolerance}$.
  - `FAILED`: Discrepancy exceeds tolerance.
  - `NOT_EVALUABLE`: Inputs occluded or unparseable.
  - `NOT_APPLICABLE`: Description-only rows.
- **Evidence:** Bounding boxes for quantity, unit price, and line total in the row.

### INV-002: Line Subtotal Sum (`LINE_SUBTOTAL_SUM`)
- **Required Inputs:** Line totals $\{\text{line\_total}_i\}_{i=1}^M$, document `subtotal: Decimal`.
- **Equation:**
  $$\text{expected\_subtotal} = \sum_{i=1}^M \text{line\_total}_i$$
- **Applicability:** Document defines line items and prints a gross subtotal.
- **Criteria:**
  - `PASSED`: $|\sum \text{line\_total}_i - \text{subtotal}| \le \text{tolerance}$.
  - `FAILED`: Delta exceeds tolerance.
  - `NOT_EVALUABLE`: Subtotal token occluded.
  - `NOT_APPLICABLE`: Flat receipts without subtotal.
- **Evidence:** Printed subtotal label and monetary token.

### INV-003: Document Discount Reconciliation (`DOCUMENT_DISCOUNT_RECONCILIATION`)
- **Required Inputs:** `gross_subtotal: Decimal`, discount descriptor, `net_subtotal: Optional[Decimal]`.
- **Equation:**
  $$\text{expected\_net} = \text{gross\_subtotal} - \text{discount}_{\text{eff}}$$
  where $\text{discount}_{\text{eff}} = \text{discount\_fixed}$ or $\text{quantize}(\text{gross\_subtotal} \times (\text{rate} / 100), \text{scale})$.
- **Applicability:** Document contains an observable document-level discount.
- **Criteria:**
  - `PASSED`: $|\text{gross\_subtotal} - \text{discount}_{\text{eff}} - \text{net\_subtotal}| \le \text{tolerance}$.
  - `FAILED`: Net subtotal diverges from discount calculation.
  - `NOT_EVALUABLE`: Discount rate unreadable.
  - `NOT_APPLICABLE`: No document discount present.
- **Evidence:** Dedicated discount label and percentage/monetary token.

### INV-004: Tax Reconciliation (`TAX_RECONCILIATION`)
- **Required Inputs:** `taxable_base: Decimal`, `tax_amount: Decimal`, tax rate(s) $t_k$.
- **Explicit Evidence Rule:** **A tax ID (e.g. VAT-US889912 or DE123456789) is an entity identifier, NOT evidence of an applied tax rate.** Valid tax rate evidence requires a printed percentage token (e.g. "19%"), an itemized tax breakdown table, or an explicit statutory exemption notice.
- **Equations:**
  - *Mode A (Exclusive):* $\text{expected\_tax} = \sum \text{quantize}(\text{taxable\_base}_k \times (t_k / 100), \text{scale})$.
  - *Mode B (Inclusive):* $\text{expected\_tax} = \sum \text{quantize}(\text{gross}_k - \frac{\text{gross}_k}{1 + (t_k / 100)}, \text{scale})$.
- **Criteria:**
  - `PASSED`: $|\text{tax\_amount} - \text{expected\_tax}| \le \text{tolerance}$.
  - `FAILED`: Tax calculation delta exceeds tolerance.
  - `NOT_EVALUABLE`: Tax rate percentage missing.
  - `NOT_APPLICABLE`: Zero-rated or tax-exempt transactions.
- **Evidence:** Printed tax rate percentage or tax breakdown row.

### INV-005: Additional Charges Reconciliation (`ADDITIONAL_CHARGES_RECONCILIATION`)
- **Required Inputs:** Auxiliary fees $\{\text{charge}_j\}_{j=1}^K$, summary charges total.
- **Equation:**
  $$\text{expected\_charges\_total} = \sum_{j=1}^K \text{charge}_j$$
- **Applicability:** Auxiliary fees present outside standard line items.
- **Criteria:**
  - `PASSED`: $|\sum \text{charge}_j - \text{charges\_total}| \le \text{tolerance}$.
  - `FAILED`: Sum diverges from summary.
  - `NOT_EVALUABLE`: Charges unquantifiable.
  - `NOT_APPLICABLE`: No auxiliary fees.
- **Evidence:** Explicit auxiliary fee tokens (e.g. "Freight: $45.00").

### INV-006: Document Grand Total (`DOCUMENT_GRAND_TOTAL`)
- **Required Inputs:** `subtotal`, `discount`, `tax_amount`, `charges`, `withholding`, `credits`, `grand_total`.
- **Master Equation:**
  $$\text{expected\_grand\_total} = \text{subtotal} - \text{discount} + \text{tax\_amount} + \text{charges} - \text{withholding} - \text{credits}$$
  *(Note: If Mode B tax-inclusive, tax_amount is 0 in the addition).*
- **Component Signs:** All inputs are non-negative magnitudes; operation signs represent directional effect.
- **Criteria:**
  - `PASSED`: $|\text{grand\_total} - \text{expected\_grand\_total}| \le \text{tolerance}$.
  - `FAILED`: Equation fails by more than tolerance.
  - `NOT_EVALUABLE`: Total or subtotal occluded.
  - `NOT_APPLICABLE`: Delivery notes without monetary totals.
- **Evidence:** Printed "Total", "Grand Total", or "Amount Due" label and value.

### INV-007: Withholding and Deductions (`WITHHOLDING_AND_DEDUCTIONS`)
- **Required Inputs:** `gross_total`, `withholding_amount`, `net_payable`.
- **Equation:**
  $$\text{expected\_net\_payable} = \text{gross\_total} - \text{withholding\_amount}$$
- **Applicability:** Strictly applicable **ONLY** when explicit printed text tokens for retention or withholding tax are observed.
- **Criteria:**
  - `PASSED`: $|\text{gross\_total} - \text{withholding\_amount} - \text{net\_payable}| \le \text{tolerance}$.
  - `FAILED`: Net payable does not equal gross minus withholding.
  - `NOT_EVALUABLE`: Deduction mentioned without amounts.
  - `NOT_APPLICABLE`: No withholding tokens present.
- **Evidence:** Printed retention, TDS, or withholding line tokens.

### INV-008: Running Balance Continuity (`RUNNING_BALANCE_CONTINUITY`)
- **Required Inputs:** Opening balance $B_0$, transaction rows $\{(D_i, C_i, B_i)\}_{i=1}^N$.
- **Equations:**
  - *Asset / Receivable:* $B_i = B_{i-1} + D_i - C_i$
  - *Liability / Credit Card:* $B_i = B_{i-1} + C_i - D_i$
- **Applicability:** Strictly applicable **ONLY** when an observable printed opening balance and sequential transaction rows with running balance columns are present.
- **Criteria:**
  - `PASSED`: $|B_i - (B_{i-1} \pm \Delta_i)| \le \text{tolerance}$ for all $i \in [1, N]$.
  - `FAILED`: Discontinuity at any step $i$.
  - `NOT_EVALUABLE`: Intermediate balance occluded.
  - `NOT_APPLICABLE`: Documents without running balance columns.
- **Evidence:** Printed opening balance token and row balance tokens.

### INV-009: Cross-Page Continuation Integrity (`CROSS_PAGE_CONTINUATION_INTEGRITY`)
- **Required Inputs:** Multi-page table segments across page boundaries.
- **Corroborating Evidence Rules:** Geometry and row numbering alone are **not conclusive**. Multi-page continuation requires either:
  1. Explicit Carried Forward / Brought Forward balance equality:
     $$|\text{Carried\_Forward}_p - \text{Brought\_Forward}_{p+1}| == 0$$
  2. Multi-point corroboration:
     - Identical column schema across boundary.
     - Column horizontal alignment ($\Delta x \le 5\text{ pt}$).
     - Monotonic row sequence indices.
     - Explicit page continuation marker (e.g. "Page 1 of 2", "Continued on Next Page").
     - Full cross-page line sum satisfies document subtotal in `INV-002`.
- **Criteria:**
  - `PASSED`: Balances match or all 5 corroboration conditions hold.
  - `FAILED`: Carried forward mismatch or table fragmentation.
  - `NOT_EVALUABLE`: Missing document page.
  - `NOT_APPLICABLE`: Single-page documents.
- **Evidence:** Boundary summary tokens or explicit continuation markers.

### INV-010: Sign Consistency (`SIGN_CONSISTENCY`)
- **Required Inputs:** Document classification, line amounts, subtotal, tax, grand total.
- **Criteria:**
  - `PASSED`:
    - Invoices: subtotal $\ge 0$, taxes $\ge 0$, grand total $\ge 0$. Negative lines represent explicit returns/allowances and reduce subtotal.
    - Credit Notes: Grand total and line items share consistent credit orientation (either all negative, or positive with credit memo flag).
  - `FAILED`: Positive return item increasing invoice subtotal, negative tax on positive base, or sign inversion between lines and subtotal.
  - `NOT_EVALUABLE`: Critical monetary signs unreadable or occluded.
  - `NOT_APPLICABLE`: Zero-balance statements.
- **Evidence:** Minus signs, parentheses, `CR`/`DR`, or credit note headers.

---

## 8. Benchmark Parameter Selection and Freeze Protocol

### 8.1 Classifier Parameters Defined
- **Primary Threshold ($\tau$):** Composite match score combining regex, Levenshtein, and semantic embedding cosine similarity. Default baseline: $\tau = 0.75$.
- **Margin Threshold ($\Delta$):** Top candidate score minus second-best candidate score. Default baseline: $\Delta = 0.15$.

### 8.2 Development-Only Tuning Procedure (Wave 3)
1. $\tau = 0.75$ and $\Delta = 0.15$ are **initial default heuristic baselines**, NOT tuned parameters.
2. In Wave 3, `tune_header_classifier.py` executes grid search strictly across the **10 development split documents** (`DEV-01` through `DEV-10`):
   - $\tau \in [0.60, 0.90]$ (step $0.05$)
   - $\Delta \in [0.05, 0.25]$ (step $0.05$)
3. Optimal parameters are selected based on maximizing Macro-F1 with zero column type collisions on the development set.
4. **Configuration Freeze:** The selected parameters are written to `table_extraction_config.json`, its SHA-256 checksum is computed, logged in `Decisions.md`, and permanently frozen.
5. **Zero Held-Out Tuning:** Neither `synthetic_held_out` nor `external_held_out` is touched during tuning.
6. **Wave 5 Blind Evaluation:** Frozen configuration is evaluated in a single forward pass across the 20 held-out documents.

---

## 9. Five-Wave Implementation Plan (Unchanged from v2.3)

- **Wave 1:** Core Pydantic Contracts, Rounding Policy Engine, and Invariant Evaluator (`table_contracts.py`, `rounding_policy.py`, `accounting_invariants.py`).
- **Wave 2:** Geometry & Cross-Page Table Continuation Engine (`table_geometry.py`, `multipage_table_stitcher.py`).
- **Wave 3:** Column Header Classifier & Row Segmentation Engine (`header_classifier.py`, `row_segmenter.py`, `tune_header_classifier.py`).
- **Wave 4:** Pipeline Integration & Database Persistence (`hybrid_structured_extractor.py`, `extraction_schemas.py`).
- **Wave 5:** Comprehensive Adversarial Verification, Benchmark Execution, and Evaluation Sign-off (`test_table_extraction.py`, `test_accounting_invariants.py`, `run_step4_table_benchmark.py`).

---

## 10. Planning-Only Execution Boundary & Final Readiness Declaration

### Execution Boundary Attestation
1. **Repository Baseline Preserved:** Commit remains `70410a1`.
2. **Zero Code Changes:** No application source code (`src/`), test files (`tests/`), database schemas/migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

---

### Final Readiness Declaration

### **READY FOR WAVE 1 AUTHORIZATION**

**Status:** All technical, architectural, geometric, database, provenance, and accounting specifications are fully reconciled, formally validated against the actual codebase, and verified with zero remaining blockers.

Wave 1 implementation can commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
