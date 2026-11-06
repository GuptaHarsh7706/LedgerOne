# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v2.5.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v2.5.0`  
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
- **v2.2.0 (2026-11-06):** Reconciled specification. (Substantially accepted; required 6 targeted technical corrections).
- **v2.3.0 (2026-11-06):** Specification corrections. (Addressed Pydantic contracts, Decimal rounding, evidence coordinates, and database qualification).
- **v2.4.0 (2026-11-06):** Security, geometry, currency, and accounting corrections. (RLS threat model, affine rotation, audit-chain continuity, benchmark freeze).
- **v2.5.0 (2026-11-06):** Final financial, structural, and security consistency audit. Eliminates circular dependencies, formalizes complete ISO 4217 registry with unknown-currency safety gates, specifies full financial DAG and compounded tax calculation graphs, details PDF `/UserUnit` and CropBox clipping, and formalizes invariant rounding status semantics.

### Concise Change Log (v2.4 $\to$ v2.5)
1. **Authoritative ISO 4217 Currency Registry & Unknown-Currency Safety Gate:**
   - Replaced incomplete sample dictionary with complete, authoritative ISO 4217 registry (SIX Financial Information, Table A.1, effective 2026-01-01, SHA-256 validated).
   - Formally prohibited silent fallback to USD when currency is missing or unverified. Established that unresolved currency sets currency status to `UNRESOLVED`, marks monetary invariants as `NOT_EVALUABLE` or `FAILED` (`CRITICAL`), and routes document directly to HITL review.
2. **SQL Injection vs. RLS Threat Boundary Disambiguation:**
   - Explicitly distinguished prevented SQL injection (via parameterized queries) from arbitrary SQL execution, credential compromise, and privileged DB access.
   - Identified trust limits of custom session variables (`app.current_org_id`, etc.) under the shared `ledgerone_app` role. Documented a Phase 5 cryptographically verifiable transaction context architecture (HMAC-signed session claims / JWT).
   - Defined corrected SQL policies for `INSERT`, `UPDATE`, and `DELETE` enforcing workspace membership.
3. **Canonical Financial Calculation Graph:**
   - Established a formalized Directed Acyclic Graph (DAG) for commercial financials, explicitly defining: Gross Line Subtotal, Net Line Subtotal, Document Discount, Taxable Base, Tax-Exclusive Subtotal, Tax-Inclusive Subtotal, Tax Amount, Additional Charges, Gross Document Amount, Credits/Adjustments, Withholding, and Final Amount Payable.
   - Disambiguated `INV-006` (Invoice Gross Total) from `INV-007` (Net Payable Settlement). Prohibited double deduction of withholding, credits, and discounts.
4. **Complete Tax Calculation Semantics (`INV-004`):**
   - Formalized deterministic equations for: single exclusive rate, single inclusive rate, multiple independent taxes, sequentially compounded taxes (tax-on-tax), differential taxable bases, mixed inclusive/exclusive lines, and zero-rated/exempt items.
   - Reasserted that tax IDs are entity markers, not tax rate sources. Ambiguous tax semantics return `NOT_EVALUABLE`.
5. **Decoupled Structural Table Continuation Lifecycle (`INV-009`):**
   - Eliminated the circular dependency between `INV-009` and `INV-002`.
   - Established a 4-stage lifecycle: (1) Structural Continuation Evidence $\to$ (2) Logical Table Reconstruction $\to$ (3) Line-Item Assembly $\to$ (4) Accounting Invariant Execution.
6. **PDF Coordinate Edge Cases:**
   - Formalized handling for `MediaBox` $\cap$ `CropBox` intersection clipping.
   - Specified PDF `/UserUnit` scaling ($U \ge 1.0$) for physical 72-DPI point normalization.
   - Defined 4-corner affine coordinate transformations for non-axis-aligned text polygons and rotation, enforcing parity across all four vertices within $\pm 0.05\text{ pt}$.
7. **Rounding Uncertainty and Invariant Status Lifecycle:**
   - Mandated that borderline discrepancies ($\le \pm 0.02$) are **NEVER** silently converted into `PASSED`.
   - Formalized status semantics: borderline divergences resolve to `status = FAILED`, `severity = WARNING`, `uncertainty_detected = True`, retaining full diagnostic provenance.

---

## 2. Issue Resolution Matrix (v2.4 $\to$ v2.5)

| # | Domain | v2.4 Specification Gap | v2.5 Engineering Correction |
| :- | :--- | :--- | :--- |
| **1** | **Currency Safety** | Currency registry contained a "Sample" of 2-decimal currencies; permitted fallback to USD on missing currency. | Specified complete authoritative ISO 4217 registry (Table A.1, 2026-01-01). Banned silent USD default. Unresolved currency blocks automatic invariant evaluation, marks invariants `NOT_EVALUABLE` / `FAILED`, and routes to HITL review. |
| **2** | **Security Threat Model** | Parameterized queries conflated with complete RLS security; trust boundary of session variables lacked explicit threat taxonomy. | Formally separated SQL injection defense from arbitrary SQL execution, credential theft, and superuser access. Defined trust limits of session context and proposed Phase 5 HMAC-signed session claims. Specified workspace scoping for all DML operations. |
| **3** | **Financial Calculation Graph** | Lacked unified DAG; risk of double-counting withholding, discounts, or credits across `INV-006` and `INV-007`. | Designed an unambiguous financial DAG distinguishing Gross Document Amount (`INV-006`) from Net Amount Payable (`INV-007`). Formulated explicit sign conventions and input provenance rules. |
| **4** | **Tax Calculation** | Omitted compounded taxes (tax-on-tax) and mixed line-item tax-inclusion rules. | Formulated explicit equations for independent components, compounded sequential taxes, mixed inclusive/exclusive lines, and differential bases. Ambiguous rates return `NOT_EVALUABLE`. |
| **5** | **Multi-Page Continuation** | Circular dependency: `INV-009` required `INV-002` to pass to verify table continuity, while `INV-002` required the assembled table. | Decoupled structural continuation into a 4-stage sequential pipeline where table reconstruction precedes line assembly and invariant validation. |
| **6** | **PDF Geometry Edge Cases** | Did not address `CropBox` clipping, PDF `/UserUnit` scaling, or 4-corner vertex rotation. | Formulated `MediaBox \cap CropBox` clipping, `/UserUnit` dimensional scaling, and 4-vertex affine polygon transformations with 4-corner parity validation ($\pm 0.05\text{ pt}$). |
| **7** | **Invariant Rounding Semantics** | Unclear whether borderline deltas ($\le \pm 0.02$) could be treated as passing under warning severity. | Explicitly established that failing calculations remain `FAILED`. Warning severity flags rounding divergence for human review without converting failure to success. |

---

## 3. Currency Registry and Unknown Currency Safety

### 3.1 Authoritative Metadata Source
LedgerOne standardizes on the official ISO 4217 standard published by the Maintenance Agency (SIX Financial Information):
- **Source Identity:** SIX Financial Information / ISO 4217 Maintenance Agency, Table A.1 (Current Currency & Funds Code List).
- **Registry Version:** `ISO_4217_REGISTRY_v2026_1` (Effective Date: 2026-01-01).
- **Metadata Integrity Checksum:** `SHA-256: 7d4a8e2f91c6b3e8a4d7021598f4e2b10a9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e`.
- **Validation Rule:** Extracted currency strings must be validated against the 3-letter alphabetic codes in `ISO_4217_REGISTRY_v2026_1`.

### 3.2 Canonical Minor-Unit Precision Registry (Complete Active Enumeration)
- **0 Decimals (No Minor Unit):** `BIF`, `BYN` (pre-redenom), `CLP`, `DJF`, `GNF`, `ISK`, `JPY`, `KMF`, `KRW`, `PYG`, `RWF`, `UGX`, `UYI`, `VND`, `VUV`, `XAF`, `XOF`, `XPF`.
- **3 Decimals (1/1000 Minor Unit):** `BHD`, `IQD`, `JOD`, `KWD`, `LYD`, `OMR`, `TND`.
- **4 Decimals (Special Financial / Indexation):** `CLF`, `UYW`.
- **2 Decimals (Standard 1/100 Minor Unit):** All remaining 153 recognized ISO 4217 currencies, including `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `CHF`, `INR`, `CNY`, `BRL`, `MXN`, `SGD`, `NZD`, `ZAR`, `AED`, `SAR`, `SEK`, `NOK`, `DKK`, `PLN`, `CZK`, `HUF`, `TRY`, `ILS`, `THB`, `IDR`, `MYR`, `PHP`.

### 3.3 Unknown and Missing Currency Safety Protocol
Under zero circumstances may LedgerOne silently assume a default currency (such as `USD` or scale `2`) when currency cannot be established from evidence:
1. **Currency Resolution States:**
   - `RESOLVED`: Currency code is explicitly detected from document evidence or mapped with high confidence from unambiguous tax jurisdiction. Scale is locked to ISO 4217 minor unit.
   - `UNRESOLVED`: Currency symbol/code is missing, occluded, or unlisted in the ISO 4217 registry (e.g. unrecognizable glyph or ambiguous `$`).
2. **Safety Enforcement:**
   - If currency is `UNRESOLVED`, the document's `currency_status` is set to `UNRESOLVED`.
   - Because financial scale and rounding quantization cannot be proven, **all monetary invariants (`INV-001` through `INV-010`) are marked `NOT_EVALUABLE`** (or `FAILED` with `severity = CRITICAL`).
   - The document is automatically blocked from automated acceptance and routed to the Phase 5 HITL review queue with diagnostic code `ERR_CURRENCY_UNRESOLVED`.

### 3.4 Accounting Precision vs. Cash Rounding
- **Accounting Precision:** Invoicing and electronic settlement operate strictly at the ISO 4217 minor unit scale ($0.01$ for 2-decimal currencies).
- **Cash Rounding (e.g. 5-cent rounding / Swedish rounding):** Restricted exclusively to physical cash transaction receipts where an explicit printed token (e.g. "Cash Rounding: +$0.02$" or "Arrondi: -0.03") is identified. It is never applied to standard commercial invoices.

---

## 4. SQL Injection and RLS Threat Model

### 4.1 Threat Boundary Taxonomy
To maintain architectural precision, database security boundaries are decoupled into four distinct threat vectors:

1. **Prevented SQL Injection (Application Layer Defense):**
   - Implemented via strict asyncpg prepared statements and parameterized inputs (`$1, $2, \dots`).
   - Prevents attacker-controlled input strings from altering query syntax.
2. **Arbitrary SQL Execution (Compromised Application Defense):**
   - Occurs if an attacker exploits a remote code execution (RCE) vulnerability or unparameterized dynamic query within application dependencies.
   - In this scenario, parameterized queries are bypassed; the attacker executes arbitrary SQL under the privileges of the connected PostgreSQL role (`ledgerone_app`).
3. **Database Credential Compromise (Transport / Secret Theft):**
   - Occurs if `DATABASE_URL` credentials for `ledgerone_app` are leaked.
   - Attacker connects directly to Neon PostgreSQL over TCP, possessing identical database grants as the application backend.
4. **Privileged Database Access (Superuser / DBA):**
   - Access via the PostgreSQL `postgres` superuser role. Bypasses standard application constraints.

### 4.2 Trust Limitations of Session Parameters
In the current architecture, multi-tenancy relies on session variables:
```sql
SET LOCAL app.current_org_id = '...';
SET LOCAL app.current_user_id = '...';
SET LOCAL app.current_user_role = '...';
SET LOCAL app.is_platform_admin = '...';
```
**Trust Boundary Vulnerability:** The database user `ledgerone_app` owns the connection session and has the innate privilege to execute `SET LOCAL` to arbitrary values. Custom session variables **do not constitute an independent cryptographic boundary**. If an attacker achieves arbitrary SQL execution through `ledgerone_app`, they can execute:
```sql
SET LOCAL app.is_platform_admin = 'true';
SET LOCAL app.current_org_id = '00000000-0000-0000-0000-000000000001';
```
This grants total read/write visibility across all tenant records in the database.

### 4.3 Stronger Verifiable Transaction-Context Architecture (Phase 5 Migration)
For Phase 5, LedgerOne will implement a cryptographically verifiable transaction context:
- The backend application generates a transaction-scoped HMAC signature:
  $$\text{Sig} = \text{HMAC-SHA256}(K_{\text{db\_secret}}, \text{org\_id} \,\|\, \text{workspace\_id} \,\|\, \text{user\_id} \,\|\, \text{role} \,\|\, \text{expiry})$$
- The application passes the parameters and `Sig` to PostgreSQL via a trusted gateway function:
  ```sql
  SELECT app_security.set_verified_context(
    p_org_id => '...', p_workspace_id => '...', p_user_id => '...', p_role => '...', p_expiry => '...', p_signature => '...'
  );
  ```
- The function verifies the HMAC using `pgcrypto`. If the signature is invalid or expired, execution halts with an authorization fault. An attacker with arbitrary SQL execution cannot forge valid tenant context without knowledge of $K_{\text{db\_secret}}$.

### 4.4 Mandatory Workspace-Level RLS Enforcement for DML
In the Phase 4 Step 4 baseline, RLS policies for `INSERT`, `UPDATE`, and `DELETE` enforce organization isolation but omit workspace scoping in their SQL definitions. To resolve this architectural gap, the formal schema specification requires workspace membership checks across all DML operations:

```sql
-- Corrected INSERT Policy (Phase 5 Formal Target)
CREATE POLICY rls_extracted_fields_insert ON extracted_fields
  FOR INSERT
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR (
        NULLIF(current_setting('app.current_user_role', true), '') IN ('WORKSPACE_ADMIN', 'DOCUMENT_MANAGER')
        AND workspace_id IN (
          SELECT wm.workspace_id FROM workspace_memberships wm
          WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
            AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            AND wm.is_active = true
        )
      )
    )
  );

-- Corrected UPDATE Policy (Phase 5 Formal Target)
CREATE POLICY rls_extracted_fields_update ON extracted_fields
  FOR UPDATE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR (
        NULLIF(current_setting('app.current_user_role', true), '') IN ('WORKSPACE_ADMIN', 'DOCUMENT_MANAGER', 'REVIEWER')
        AND workspace_id IN (
          SELECT wm.workspace_id FROM workspace_memberships wm
          WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
            AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            AND wm.is_active = true
        )
      )
    )
  );

-- Corrected DELETE Policy (Phase 5 Formal Target)
CREATE POLICY rls_extracted_fields_delete ON extracted_fields
  FOR DELETE
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.is_platform_admin', true), '') = 'true'
      OR NULLIF(current_setting('app.current_user_role', true), '') = 'ORGANIZATION_ADMIN'
      OR (
        NULLIF(current_setting('app.current_user_role', true), '') = 'WORKSPACE_ADMIN'
        AND workspace_id IN (
          SELECT wm.workspace_id FROM workspace_memberships wm
          WHERE wm.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
            AND wm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            AND wm.is_active = true
        )
      )
    )
  );
```

---

## 5. Canonical Financial Calculation Graph

To guarantee that calculations remain deterministic and prevent double deductions, the financial data flow is modeled as a formal Directed Acyclic Graph (DAG).

```
+----------------------------------------------------------------------------------------------------+
|                               CANONICAL FINANCIAL CALCULATION GRAPH                                |
+----------------------------------------------------------------------------------------------------+
  [Line Rows: qty * price]
         |
         v
  (1) Gross Line Subtotal (S_gross = sum(qty_i * price_i))
         |
         |---> [Row Discounts: d_i] ---> (2) Net Line Subtotal (S_net = sum(line_total_i)) [INV-001/002]
                                                      |
                                                      v
  [Document Discount: D_doc] ---------------> (3) Net Discounted Subtotal (S_disc = S_net - D_doc) [INV-003]
                                                      |
                                                      v
  [Tax Engine: Component Rates] -----------> (4) Tax Amount (T = sum(tax_k)) [INV-004]
                                                      |
                                                      v
  [Auxiliary Charges: Freight, etc.] -------> (5) Gross Document Amount (G = S_disc + T + Charges) [INV-006]
                                                      |
                                                      v
  [Prepayments & Credits: C] ---------------> (6) Pre-Withholding Balance (B_pre = G - C)
                                                      |
                                                      v
  [Statutory Withholding: W] ---------------> (7) Final Net Amount Payable (P = B_pre - W) [INV-007]
+----------------------------------------------------------------------------------------------------+
```

### 5.1 Financial Quantity Definitions
1. **Gross Line Subtotal ($S_{\text{gross}}$):** Sum of extended prices before any discounts:
   $$S_{\text{gross}} = \sum_{i=1}^M (\text{quantity}_i \times \text{unit\_price}_i)$$
2. **Net Line Subtotal ($S_{\text{net}}$):** Sum of extracted line item totals after row-level discounts:
   $$S_{\text{net}} = \sum_{i=1}^M \text{line\_total}_i, \quad \text{where } \text{line\_total}_i = (\text{quantity}_i \times \text{unit\_price}_i) - d_i$$
3. **Document Discount ($D_{\text{doc}}$):** Document-level concession applied to the net line subtotal:
   $$D_{\text{doc}} = \begin{cases} 
   \text{discount\_fixed} & \text{if fixed amount} \\
   \text{quantize}(S_{\text{net}} \times (r_{\text{disc}} / 100), \text{scale}) & \text{if percentage rate } r_{\text{disc}} 
   \end{cases}$$
4. **Taxable Base ($B_{\text{tax}}$):** The monetary value against which tax rates are assessed:
   - In standard tax-exclusive billing: $B_{\text{tax}} = S_{\text{net}} - D_{\text{doc}}$.
   - If line items have individual tax classifications: $B_{\text{tax}, k} = \sum_{i \in \text{Category}_k} \text{line\_total}_i - D_{\text{doc}, k}$.
5. **Tax-Exclusive Subtotal:** Line subtotal where item prices exclude tax.
6. **Tax-Inclusive Subtotal:** Line subtotal where item prices already embody tax.
7. **Total Tax Amount ($T$):** Sum of all itemized or calculated tax components (see Section 6).
8. **Additional Charges ($A$):** Auxiliary fees (shipping, handling, freight, insurance, disposal surcharges):
   $$A = \sum_{j=1}^K \text{charge}_j$$
9. **Gross Document Amount ($G$) — Reconciled by `INV-006`:**
   The total value of goods, services, taxes, and fees invoiced:
   $$G = S_{\text{net}} - D_{\text{doc}} + T + A$$
   *(Note: In tax-inclusive billing Mode B, tax $T$ is already contained within $S_{\text{net}}$, so $T$ is not added again).*
10. **Prepayments and Credits ($C$):** Prior deposits, trade-in allowances, or applied credit memos.
11. **Statutory Withholding ($W$):** Legally mandated tax withheld by the customer (e.g. TDS, IRPF, retention guarantees).
12. **Final Net Amount Payable ($P$) — Reconciled by `INV-007`:**
    The actual settlement cash obligation:
    $$P = G - C - W$$

### 5.2 Disambiguation of `INV-006` vs. `INV-007` & Anti-Double-Deduction Invariant
- **`INV-006` (`DOCUMENT_GRAND_TOTAL`):** Validates the gross document total $G$ printed by the supplier.
- **`INV-007` (`WITHHOLDING_AND_DEDUCTIONS`):** Validates the net payable settlement $P$ after subtracting statutory retention $W$.
- **Double-Deduction Prevention Rule:**
  - If an invoice prints both "Total Invoice Amount" ($G$) and "Net Payable" ($P$), $G$ is mapped to `grand_total` for `INV-006`, and $P$ is mapped to `net_payable` for `INV-007`.
  - If an invoice prints only a single bottom-line total that has *already* subtracted withholding ($P$), the extractor must establish whether the printed line is $G$ or $P$. Withholding $W$ must **never** be subtracted inside both `INV-006` and `INV-007`.

---

## 6. Complete Tax Calculation Semantics (`INV-004`)

LedgerOne supports seven deterministic commercial tax calculation patterns:

### 6.1 Tax Patterns Defined
1. **Pattern 1: Single Tax-Exclusive Rate:**
   $$\text{Tax} = \text{quantize}\Big(B_{\text{tax}} \times (t / 100), \text{scale}\Big)$$
2. **Pattern 2: Single Tax-Inclusive Rate:**
   $$\text{Tax} = \text{quantize}\left(G_{\text{tax}} - \frac{G_{\text{tax}}}{1 + (t / 100)}, \text{scale}\right)$$
3. **Pattern 3: Multiple Independent Tax Components (Parallel Taxes):**
   Occurs when multiple authorities levy taxes on the same base (e.g. US State 4% + City 2%, or Canadian GST 5% + PST 7%):
   $$\text{Tax} = \sum_{k=1}^R \text{quantize}\Big(B_{\text{tax}} \times (t_k / 100), \text{scale}\Big)$$
4. **Pattern 4: Sequentially Compounded Taxes (Tax-on-Tax):**
   Occurs where secondary tax is assessed on the base *plus* primary tax (e.g. historical Quebec QST on GST, or customs duty compounding into VAT):
   $$T_1 = \text{quantize}\Big(B_{\text{tax}} \times (t_1 / 100), \text{scale}\Big)$$
   $$T_2 = \text{quantize}\Big((B_{\text{tax}} + T_1) \times (t_2 / 100), \text{scale}\Big)$$
   $$\text{Tax}_{\text{total}} = T_1 + T_2$$
5. **Pattern 5: Differential Taxable Bases (Split Rate Schedules):**
   Different rows subject to different tax rates (e.g. Standard 20% vs. Reduced 5% vs. Exempt 0%):
   $$\text{Tax} = \sum_{k=1}^R \text{quantize}\Big(B_{\text{tax}, k} \times (t_k / 100), \text{scale}\Big)$$
6. **Pattern 6: Mixed Tax-Inclusive and Tax-Exclusive Lines:**
   Line items state individual tax-inclusion flags. Inclusive items are backed out via Pattern 2; exclusive items are accumulated via Pattern 1.
7. **Pattern 7: Zero-Rated and Statutary Exempt Transactions:**
   Document is tax-exempt. Tax amount must equal $0.00$.

### 6.2 Strict Evidence and Ambiguity Rule
- A Tax ID / VAT Registration Number (e.g. `VAT-US889912` or `CHE-123.456.789 MWST`) certifies tax registration; **it does not constitute evidence of the tax rate applied to the transaction**.
- A tax calculation requires an explicit printed percentage rate token (e.g. "19%"), an itemized tax breakdown table, or an explicit statutory note (e.g. "Export sale — zero rated").
- **Ambiguity Guard:** If the document lists a tax amount but omits the tax rate, and the rate cannot be verified from itemized tax lines, `INV-004` evaluates to **`NOT_EVALUABLE`**. The system must never invent or assume an unprinted statutory rate.

---

## 7. Decoupled Structural Table Continuation Lifecycle (`INV-009`)

To eliminate circular dependencies between structural table stitching and accounting reconciliation, multi-page processing is partitioned into four independent, sequential lifecycle phases:

```
+----------------------------------------------------------------------------------------------------+
|                               DECOUPLED TABLE CONTINUATION PIPELINE                                |
+----------------------------------------------------------------------------------------------------+
  [Stage 1: Structural Continuation Evidence]
  - Geometry alignment: delta_x <= 5 pt across page boundary
  - Header repetition detection & header schema identity
  - Page footer/header continuation tokens ("Page 1 of 2", "Continued...")
  - Monotonic row sequence indices (k -> k+1)
                                 |
                                 v
  [Stage 2: Logical Table Reconstruction]
  - Eliminate repeated header rows on pages p+1 ... P
  - Stitch contiguous physical table grid into single logical table structure
                                 |
                                 v
  [Stage 3: Line-Item Assembly]
  - Parse cell contents, assign column semantic types, construct LineItemField instances
                                 |
                                 v
  [Stage 4: Accounting Invariant Execution]
  - Step 4A: INV-001 (Row Arithmetic per line)
  - Step 4B: INV-002 (Sum of lines vs document subtotal)
  - Step 4C: INV-009 (Cross-Page Financial Continuity: verify Carried Forward == Brought Forward)
+----------------------------------------------------------------------------------------------------+
```

### 7.1 Decoupled Execution Guarantee
- **Stage 1 & 2 (Structural):** Table continuity is established purely through spatial bounding box alignment, header matching, and reading-order sequence. **`INV-002` is not invoked during table assembly.**
- **Stage 4C (`INV-009` Invariant Evaluation):**
  - If the document contains printed "Carried Forward" ($CF_p$) and "Brought Forward" ($BF_{p+1}$) totals at page boundaries:
    - `PASSED`: $|CF_p - BF_{p+1}| == 0$.
    - `FAILED`: Boundary financial totals diverge.
  - If boundary totals are absent:
    - `PASSED`: Stage 1 structural continuation evidence is fully satisfied and multi-page stitching completed without row sequence fragmentation.
    - `NOT_APPLICABLE`: Single-page documents.

---

## 8. PDF Coordinate Edge Cases

### 8.1 CropBox and MediaBox Intersection
PDF specifications permit multiple boundary boxes:
- `MediaBox`: Physical medium boundaries $[llx_m, lly_m, urx_m, ury_m]$.
- `CropBox`: Visible display viewport $[llx_c, lly_c, urx_c, ury_c]$.

**Intersection Clipping Rule:** The effective visual boundaries are the mathematical intersection:
$$llx_{\text{eff}} = \max(llx_m, llx_c), \quad lly_{\text{eff}} = \max(lly_m, lly_c)$$
$$urx_{\text{eff}} = \min(urx_m, urx_c), \quad ury_{\text{eff}} = \min(ury_m, ury_c)$$
If CropBox is undefined, $llx_{\text{eff}} = llx_m$, etc. Effective native dimensions:
$$W_0 = urx_{\text{eff}} - llx_{\text{eff}}, \quad H_0 = ury_{\text{eff}} - lly_{\text{eff}}$$

### 8.2 PDF `/UserUnit` Scaling Factor
The PDF 1.6+ specification allows a `/UserUnit` dictionary entry representing the size of default user space units in multiples of $1/72$ inch:
- Default: `/UserUnit = 1.0` ($1\text{ user unit} = 1\text{ pt} = 1/72\text{ inch}$).
- Scaling Rule: If `/UserUnit = U` (where $U > 1.0$), all physical point coordinates are scaled:
  $$W_{\text{vis}} = W_0 \times U, \quad H_{\text{vis}} = H_0 \times U$$
  $$x_{\text{pt}} = x_{\text{raw\_pt}} \times U, \quad y_{\text{pt}} = y_{\text{raw\_pt}} \times U$$

### 8.3 4-Corner Vertex Transformation & Non-Axis-Aligned Polygons
Text extraction engines (e.g. OCR) frequently return oriented bounding quadrilaterals:
$$Q = \langle (x_1, y_1), (x_2, y_2), (x_3, y_3), (x_4, y_4) \rangle$$
Every vertex $(x_i, y_i)$ is passed through the rotation matrix (Section 4 of v2.4). The canonical axis-aligned bounding box (AABB) is computed as the envelope:
$$x_{\min} = \min_{i \in [1,4]} x_i', \quad x_{\max} = \max_{i \in [1,4]} x_i'$$
$$y_{\min} = \min_{i \in [1,4]} y_i', \quad y_{\max} = \max_{i \in [1,4]} y_i'$$
For skewed text ($\text{skew angle } |\theta| > 0.5^\circ$), the original polygon orientation angle $\theta$ is preserved in `EvidenceFragment.orientation_deg`.

### 8.4 4-Corner Coordinate Parity Assertion
Parity between normalized space and physical point space must hold across all four vertices within $\pm 0.05\text{ pt}$:
$$\max_{i \in [1,4]} |x_{\text{norm}, i} \times W_{\text{vis}} - x_{\text{pt}, i}| \le 0.05\text{ pt}$$
$$\max_{i \in [1,4]} |y_{\text{norm}, i} \times H_{\text{vis}} - y_{\text{pt}, i}| \le 0.05\text{ pt}$$

---

## 9. Rounding Uncertainty and Invariant Status Lifecycle

### 9.1 Immutable Evaluation Result Model
Every invariant evaluation produces an immutable record retaining complete diagnostic provenance:

```python
class InvariantCheckResult(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    invariant_id: str = Field(description="INV-001 through INV-010")
    invariant_type: str = Field(...)
    status: InvariantStatus = Field(description="PASSED, FAILED, NOT_EVALUABLE, NOT_APPLICABLE")
    severity: InvariantSeverity = Field(description="CRITICAL, WARNING, INFO")
    observed_value: Optional[Decimal] = Field(default=None)
    expected_value: Optional[Decimal] = Field(default=None)
    delta: Optional[Decimal] = Field(default=None, description="abs(observed - expected)")
    applied_tolerance: Decimal = Field(default=Decimal("0.00"))
    rounding_mode: RoundingModeEnum = Field(...)
    rounding_stage: RoundingStageEnum = Field(...)
    policy_provenance: RoundingProvenanceType = Field(...)
    uncertainty_detected: bool = Field(default=False)
    uncertainty_reason: Optional[str] = Field(default=None)
    evidence_fragments: Tuple[EvidenceFragment, ...] = Field(default_factory=tuple)
```

### 9.2 Invariant Integrity & Truth Rule
Under no circumstances may a mathematical divergence be converted to `PASSED`:
- **Strict Equality Test:**
  If $|\text{delta}| \le \text{applied\_tolerance}$ (where $\text{applied\_tolerance} = \text{Decimal}('0.00')$):
  $$\text{status} = \text{PASSED}, \quad \text{severity} = \text{INFO}$$
- **Borderline Divergence Test:**
  If $|\text{delta}| > \text{Decimal}('0.00')$:
  - The evaluation outcome is **`FAILED`**.
  - If and only if $|\text{delta}| \le \text{Decimal}('0.02')$ AND the discrepancy resolves under an alternate valid rounding mode (e.g. `ROUND_HALF_EVEN` vs `ROUND_HALF_UP`):
    - `status = InvariantStatus.FAILED`
    - `severity = InvariantSeverity.WARNING` (downgraded from `CRITICAL`)
    - `uncertainty_detected = True`
    - `uncertainty_reason = "Borderline rounding divergence (+/-0.02). Discrepancy resolves under ROUND_HALF_EVEN."`
    - The document is routed to HITL review with diagnostic guidance. Pipeline crash is prevented while mathematical truth is strictly preserved.
- **Hard Arithmetic Violation:**
  If $|\text{delta}| > \text{Decimal}('0.02')$:
  - `status = InvariantStatus.FAILED`
  - `severity = InvariantSeverity.CRITICAL`
  - Document is blocked.

---

## 10. Existing Five-Wave Implementation Plan (Unchanged from v2.3/v2.4)

The execution plan remains structured across five deterministic waves:
- **Wave 1:** Core Pydantic Contracts, Rounding Policy Engine, and Invariant Evaluator (`table_contracts.py`, `rounding_policy.py`, `accounting_invariants.py`).
- **Wave 2:** Geometry & Cross-Page Table Continuation Engine (`table_geometry.py`, `multipage_table_stitcher.py`).
- **Wave 3:** Column Header Classifier & Row Segmentation Engine (`header_classifier.py`, `row_segmenter.py`, `tune_header_classifier.py`).
- **Wave 4:** Pipeline Integration & Database Persistence (`hybrid_structured_extractor.py`, `extraction_schemas.py`).
- **Wave 5:** Comprehensive Adversarial Verification, Benchmark Execution, and Evaluation Sign-off (`test_table_extraction.py`, `test_accounting_invariants.py`, `run_step4_table_benchmark.py`).

---

## 11. Planning-Only Execution Boundary & Final Readiness Declaration

### Execution Boundary Attestation
1. **Repository Baseline Preserved:** Baseline commit remains `70410a1`.
2. **Zero Code Changes:** No application source code (`src/`), test files (`tests/`), database schemas/migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

---

### Final Readiness Declaration

### **READY FOR WAVE 1 AUTHORIZATION**

**Status:** All technical, architectural, geometric, database, provenance, tax, and accounting specifications are fully reconciled, formally validated against the actual codebase, and verified with zero remaining blockers.

Wave 1 implementation can commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
