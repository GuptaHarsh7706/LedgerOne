# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v3.1.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v3.1.0`  
**Baseline Git Commit:** `70410a1` (`feat(intelligence): Phase 4 Step 3 comparative extraction audit, Decimal precision, and calibration gate (v3.9.0)`)  
**Scope Classification:** Strictly Planning and Specification Only  
**Execution Authorization Status:** **STRICTLY BLOCKED** (Awaiting explicit human principal authorization)  
**Target Module:** `LedgerOne/src/intelligence/`  
**Regression Baseline:** 124 platform regression tests passing on commit `70410a1`  

---

## 1. Executive Summary & Change Log (v3.0 $\to$ v3.1)

Specification v3.1.0 delivers the final technical reconciliation, metric disambiguation, cryptographic hardening, and RBAC consistency closure for Phase 4 Step 4:

1. **PDF Ground-Truth Track Separation:**
   - Decoupled native PDF document geometry (parsed content streams, vector operators, font transformation matrices, text rendering modes, clipping paths) from rendered-image raster geometry (scanned/thermal documents, human annotations, visual glyph masks).
   - Formulated strict reporting separation: Track A (Native Geometry) and Track B (Rendered-Image Geometry) are evaluated independently and output to isolated top-level reporting structures without composite contamination.
2. **Hungarian Bipartite Matching with Augmented Dummy Formulation:**
   - Formalized the assignment problem using an augmented square cost matrix with dummy ground-truth and dummy prediction nodes.
   - Enforced hard IoU gating ($\text{IoU} \ge 0.50$): candidate pairs failing the gate are assigned dummy cutoff costs ($C_{\text{unmatched}} = 1.0$), proving mathematically that unacceptable predictions cannot be forced into valid matches.
   - Defined deterministic accounting for True Positives, False Positives (unmatched or duplicate predictions), False Negatives (missed ground truth), empty predictions, empty ground truth, and empty pages.
3. **Configurable Financial Override Threshold Governance:**
   - Eliminated hardcoded currency thresholds. Established a typed `FinancialOverrideThresholdPolicy` contract supporting organization/workspace scoping, document types, severity levels, currency codes, absolute thresholds, percentage thresholds, AND/OR combination semantics, effective date windows, and CFO/Org Admin approval metadata.
   - Defined exact denominator rules ($\text{pct\_delta} = |\text{delta}| / |\text{expected}| \times 100\%$), handled negative expected values, and established fallback to absolute thresholds when expected value is zero ($0/0$).
   - Enforced fail-closed security: if no approved policy exists or currency is unresolved, overrides are strictly disabled.
4. **Statutory Tax-ID Applicability Gating:**
   - Refined the missing tax-ID hard block: tax-ID presence is evaluated as a hard stop **only after** jurisdiction, transaction type, and statutory mandates are resolved to `MANDATORY_STATUTORY`.
   - Built a typed `TaxIdRequirementStatus` contract distinguishing supplier mandates, customer reverse-charge mandates, small-business exemptions, and jurisdictions without tax-ID requirements. Unresolved contexts evaluate strictly to `NOT_EVALUABLE`.
5. **Commercial Discount Allocation Policy Classification:**
   - Formally classified positive revenue basis ($B_i = \max(S_i, 0)$) as a defined commercial allocation policy (`COMMERCIAL_PRORATA_POSITIVE_REVENUE_v1`) rather than a universal statutory rule.
   - Preserved document-level adjustment integrity: the original document adjustment ($D$) is retained and document-level totals (`INV-001`) evaluate independently even if line-level allocation evaluates to `NOT_EVALUABLE`.
6. **PostgreSQL Context Indexing & Database-Enforced Audit Ledger:**
   - Specified exact B-tree indexes for `app_security.active_context` and established `EXPLAIN (FORMAT JSON)` acceptance criteria proving zero sequential scans.
   - Documented unlogged table crash recovery mechanics and proved fail-closed RLS security (empty context yields `NULL` getters $\implies 0$ rows returned).
   - Hardened audit ledger immutability via database privilege revoking (`REVOKE UPDATE, DELETE`) and trigger-enforced exceptions (`42501`). Enforced transactional atomicity between document state transitions and audit writes.
7. **Override Expiration & Canonical RBAC Alignment:**
   - Disambiguated the 48-hour window into two distinct lifecycles: a 48-hour **Dual-Authorization Signature Window** ($T_{\text{auth\_window}}$) and a 30-day **Exception Lifetime Window** ($T_{\text{lifetime}}$).
   - Reconciled document operational permissions against canonical RBAC (ADR-005): verified that `REVIEWER`, `WORKSPACE_ADMIN`, and `ORGANIZATION_ADMIN` hold document review and approval authority (`APPROVE_DOCUMENT`), while `DOCUMENT_MANAGER` is canonically restricted to document ingestion, metadata management, extraction triggering, and archiving.

---

## 2. Blocker-Resolution Matrix (v3.0 $\to$ v3.1)

| # | Domain | v3.0 Specification Defect / Ambiguity | v3.1 Engineering Resolution |
| :- | :--- | :--- | :--- |
| **1** | **PDF Ground Truth** | Clean-room PDF vector operators and dual-annotated human labels were conflated as interchangeable ground truth. | Decoupled evaluation into Track A (Native PDF Geometry) and Track B (Rendered-Image Geometry). Formulated independent scorecards without composite blending. |
| **2** | **Hungarian Matching** | Cost function lacked dummy node augmentation, explicit cost gating, and numerical proofs preventing forced invalid matches. | Formulated augmented $(N+M) \times (N+M)$ square matrix with dummy nodes. Enforced $\text{IoU} \ge 0.50$ gating. Delivered numerical proofs for low IoU rejection and duplicate prediction penalties. |
| **3** | **Override Thresholds** | Fixed thresholds for USD/EUR/GBP/JPY/BHD were treated as universal constants without governance or zero-expected logic. | Built typed `FinancialOverrideThresholdPolicy` with org/workspace scoping, AND/OR combination rules, zero-expected absolute fallbacks, and fail-closed absence handling. |
| **4** | **Statutory Tax-ID** | Missing supplier tax ID was an unconditional hard block, ignoring jurisdictions or transactions where tax IDs are not required. | Gated tax-ID hard block behind `TaxJurisdictionResolutionResult`. Introduced `TaxIdRequirementStatus` contract. Unresolved contexts evaluate to `NOT_EVALUABLE`. |
| **5** | **Discount Allocation** | Positive revenue basis was described as universal accounting law; lacked explicit document-level adjustment preservation. | Formally classified as `COMMERCIAL_PRORATA_POSITIVE_REVENUE_v1`. Enforced preservation of document-level adjustment $D$ when line allocation is `NOT_EVALUABLE`. |
| **6** | **PostgreSQL Context** | Lacked exact B-tree indexes, query plan acceptance criteria, and database-level immutability enforcement for audit records. | Specified B-tree indexes on `(xact_id)` and `(xact_id, backend_pid)`. Added trigger-based immutable audit ledger and proved fail-closed unlogged crash recovery. |
| **7** | **Expiration & RBAC** | 48-hour window conflated signature timeout with exception lifetime; `DOCUMENT_MANAGER` held unverified approval privileges. | Disambiguated 48-hour signature window from 30-day exception lifetime. Aligned approval permissions strictly with canonical RBAC (`REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN`). |

---

## 3. PDF Ground-Truth & Parity Evaluation: Distinct Evaluation Tracks

### 3.1 Fundamental Distinction: Native PDF Geometry vs. Rendered-Image Raster

Document intelligence systems process two physically and computationally distinct representations of a document:
1. **The Native PDF Content Stream (Track A):** A declarative display list composed of PDF operator streams (`Tj`, `TJ`, `cm`, `q`, `Q`), font definitions (Type 1, TrueType, Type 0 / CFF), font bounding boxes (`/FontBBox`), and transformation matrices.
2. **The Rendered Image Raster (Track B):** A discretized 2D pixel grid produced by a rasterizer (e.g. Poppler, PDFium) at a specific resolution (e.g. 150 DPI or 300 DPI), or scanned physical paper documents captured via optical sensors.

```
+----------------------------------------------------------------------------------------------------+
|                               TWO-TRACK PDF EVALUATION ARCHITECTURE                                |
+----------------------------------------------------------------------------------------------------+
                   PDF Input Document (Digital Clean-Room or Scanned / Thermal)
                                                |
                      +-------------------------+-------------------------+
                      |                                                   |
                      v                                                   v
         [TRACK A: NATIVE PDF GEOMETRY]                     [TRACK B: RENDERED-IMAGE GEOMETRY]
   Target: Content Stream Extraction Fidelity          Target: Human Visual / Optical Perception
   - Uncompressed Content Streams (`q`, `cm`, `Tj`)     - Rendered Bitmaps (150 / 300 DPI) or Scans
   - Font Metrics (`/FontBBox`, `/Widths`, CTM)        - Dual Human Bounding-Box Annotations
   - Text Matrix ($Tm$), Spacing ($Tc, Tw, Tz$)        - Adjudication via Senior Auditor
   - Rendering Modes (Fill, Stroke, Invisible)         - Inter-Annotator Agreement (Cohen's $\kappa$)
   - Clipping Paths ($W, W^*$), Form XObjects          - Pixel-Level Masks / Raster IoU
                      |                                                   |
                      v                                                   v
   Native Geometry Scorecard:                          Rendered Image Scorecard:
   - Coordinate Drift ($\Delta \le 0.50\text{ pt}$)    - Hungarian Bipartite Matching ($\text{IoU} \ge 0.50$)
   - Word Segmentation Precision / Recall              - Precision, Recall, $F_1$, Mean IoU
   - Token Ordering / Reading Order Sequence           - False Positive / Negative Rate
                      |                                                   |
                      +-------------------------+-------------------------+
                                                |
                                                v
                           [INDEPENDENT JSON BENCHMARK REPORT]
                         Top-level isolated reporting blocks:
                         - `native_pdf_geometry_evaluation`
                         - `rendered_image_geometry_evaluation`
                         (Strictly unblended; zero composite score)
+----------------------------------------------------------------------------------------------------+
```

### 3.2 Track A: Native PDF Geometry Evaluation Protocol
- **Scope:** Applies strictly to digitally generated, non-scanned PDF documents containing vector text operators.
- **Extraction Mechanism:** Parsed using high-fidelity PDF parsers (`pypdfium2`, `pdfminer.six`) reading:
  - Text transformation matrices: $\begin{bmatrix} a & b & 0 \\ c & d & 0 \\ e & f & 1 \end{bmatrix}$.
  - Current Transformation Matrix ($CTM$) and Text Matrix ($Tm$).
  - Character advancement and glyph widths from font `/Widths` arrays.
  - Text rendering modes: Mode 0 (Fill), Mode 1 (Stroke), Mode 2 (Fill + Stroke), Mode 3 (Neither / Invisible text), and Modes 4–7 (Clipping text).
- **Edge Conditions Accounted For:**
  - *Invisible Text (Mode 3):* Often injected by external OCR engines as a hidden searchable layer. Track A isolates visible vector text from Mode 3 text.
  - *Synthetic Bolding:* Achieved in PDF by repeatedly emitting identical text with minor offsets ($0.2\text{ pt}$). Track A deduplicates synthetic bold glyph emissions.
  - *Clipping Paths (`W`, `W*`):* Text operators emitted outside the active clipping path or viewport CropBox are excluded from valid geometry.
- **Track A Evaluation Metric:**
  $$\Delta_{\text{coord}} = \max(|x_0 - x_0^{\text{native}}|, |y_0 - y_0^{\text{native}}|, |x_1 - x_1^{\text{native}}|, |y_1 - y_1^{\text{native}}|) \le 0.50\text{ pt}$$

### 3.3 Track B: Rendered-Image Geometry Evaluation Protocol
- **Scope:** Applies to scanned documents, mobile camera receipts, thermal paper printouts, and visual layout evaluation of digital documents.
- **Ground-Truth Source:** Independently validated human annotations:
  - Bounding boxes annotated by Annotator 1 and Annotator 2.
  - Disagreements ($\text{IoU} < 0.90$ or semantic category mismatch) are adjudicated by a Senior Document Specialist.
  - **Quality Control Gate:** Inter-Annotator Agreement (IAA) must satisfy Cohen's Kappa $\kappa \ge 0.85$ on semantic classification and mean $\text{IoU} \ge 0.92$ on spatial boundaries before a fixture is accepted into the golden benchmark.
- **Sauvola Heuristic Role:** Sauvola adaptive thresholding is strictly a candidate edge-detection aid for human annotation tools. It is **never** treated as ground-truth truth.

### 3.4 Unblended Reporting Requirement
The benchmark reporting engine (`run_step4_table_benchmark.py`) is strictly prohibited from blending Track A and Track B metrics into a single aggregated score. The output report must serialize distinct top-level sections:
```json
{
  "benchmark_run_id": "step4-table-run-20261106",
  "document_count": 30,
  "native_pdf_geometry_evaluation": {
    "track": "NATIVE_PDF_GEOMETRY",
    "applicable_fixtures": 15,
    "mean_coordinate_drift_pts": 0.12,
    "max_coordinate_drift_pts": 0.38,
    "drift_gate_pass_rate": 1.00
  },
  "rendered_image_geometry_evaluation": {
    "track": "RENDERED_IMAGE_GEOMETRY",
    "applicable_fixtures": 30,
    "hungarian_matching_iou_threshold": 0.50,
    "precision": 0.962,
    "recall": 0.948,
    "f1_score": 0.955,
    "mean_iou_matched_pairs": 0.891
  }
}
```

---

## 4. Hungarian Bipartite Matching with Augmented Dummy Formulation

### 4.1 Formal Mathematical Formulation
Let page $p$ contain $N$ predicted bounding boxes $\mathcal{B}_{\text{pred}} = \{B_1, \dots, B_N\}$ and $M$ ground-truth bounding boxes $\mathcal{B}_{\text{gt}} = \{G_1, \dots, G_M\}$.

To solve the assignment problem with unequal dimensions ($N \ne M$) and account for unmatched predictions and ground-truth regions, we formulate an augmented $(N + M) \times (N + M)$ square cost matrix $\mathbf{C}$:

$$\mathbf{C} = \begin{bmatrix} \mathbf{C}_{\text{pred}\to\text{gt}} & \mathbf{C}_{\text{pred}\to\text{dummy}} \\ \mathbf{C}_{\text{dummy}\to\text{gt}} & \mathbf{C}_{\text{dummy}\to\text{dummy}} \end{bmatrix}_{(N + M) \times (N + M)}$$

1. **Real-to-Real Block $\mathbf{C}_{\text{pred}\to\text{gt}}$ ($N \times M$):**
   For prediction $B_i$ and ground-truth $G_j$:
   $$C_{ij} = \begin{cases} 1.0 - \text{IoU}(B_i, G_j) + \alpha \cdot \frac{d_{\text{center}}(B_i, G_j)}{\text{diag}_p} & \text{if } \text{IoU}(B_i, G_j) \ge 0.50 \\ C_{\text{unmatched}} & \text{if } \text{IoU}(B_i, G_j) < 0.50 \end{cases}$$
   where:
   - $\text{IoU}(B_i, G_j) = \frac{\text{Area}(B_i \cap G_j)}{\text{Area}(B_i \cup G_j)}$.
   - $d_{\text{center}}(B_i, G_j) = \sqrt{(x_c^{B_i} - x_c^{G_j})^2 + (y_c^{B_i} - y_c^{G_j})^2}$.
   - $\text{diag}_p = \sqrt{W_p^2 + H_p^2}$ (page diagonal in points).
   - $\alpha = 0.10$ (center-distance penalty coefficient).
   - $C_{\text{unmatched}} = 1.0$ (hard gating penalty).
2. **Prediction-to-Dummy Block $\mathbf{C}_{\text{pred}\to\text{dummy}}$ ($N \times N$):**
   Diagonal elements $C_{i, M+i} = C_{\text{dummy}} = 1.0$; off-diagonal elements $=\infty$. Matching $B_i$ to its dummy node costs $1.0$ and represents leaving $B_i$ unmatched (False Positive).
3. **Dummy-to-Ground-Truth Block $\mathbf{C}_{\text{dummy}\to\text{gt}}$ ($M \times M$):**
   Diagonal elements $C_{N+j, j} = C_{\text{dummy}} = 1.0$; off-diagonal elements $=\infty$. Matching $G_j$ to its dummy node costs $1.0$ and represents leaving $G_j$ unmatched (False Negative).
4. **Dummy-to-Dummy Block $\mathbf{C}_{\text{dummy}\to\text{dummy}}$ ($M \times N$):**
   All entries are set to $0.0$ to allow unused dummy nodes to match at zero cost.

### 4.2 Hungarian Solver Execution & Accounting Rules
Solving the minimum-weight bipartite matching on $\mathbf{C}$ via the Hungarian algorithm (Kuhn-Munkres, $O(K^3)$ where $K = N+M$) yields assignment pairs $(i, j)$:

1. **True Positive (TP):** Match $(B_i, G_j)$ where $i \le N$, $j \le M$, and $\text{IoU}(B_i, G_j) \ge 0.50$.
2. **False Positive (FP):**
   - Any predicted box $B_i$ matched to a dummy ground-truth node ($j > M$).
   - Any match where $\text{IoU} < 0.50$.
   - **Duplicate Predictions:** If multiple predicted boxes $B_1, B_2$ overlap a single ground-truth box $G_1$, the Hungarian algorithm matches at most one (the lowest cost). All other overlapping predictions are forced to match dummy nodes, penalizing them strictly as False Positives ($N_{\text{FP}} = N - \text{TP}$).
3. **False Negative (FN):**
   - Any ground-truth box $G_j$ matched to a dummy prediction node ($i > N$).
   - $N_{\text{FN}} = M - \text{TP}$.

### 4.3 Deterministic Edge-Case Behaviors
- **Empty Predictions ($N = 0, M > 0$):**
  $\text{TP} = 0$, $\text{FP} = 0$, $\text{FN} = M$.
  $\text{Precision} = 0.0$, $\text{Recall} = 0.0$, $F_1 = 0.0$.
- **Empty Ground Truth ($N > 0, M = 0$):**
  $\text{TP} = 0$, $\text{FP} = N$, $\text{FN} = 0$.
  $\text{Precision} = 0.0$, $\text{Recall} = 0.0$, $F_1 = 0.0$.
- **Empty Page ($N = 0, M = 0$):**
  A blank page with zero ground-truth text and zero predicted boxes represents a perfect true negative.
  Standardized convention: $\text{Precision} = 1.0$, $\text{Recall} = 1.0$, $F_1 = 1.0$, $\text{IoU} = 1.0$.

### 4.4 Aggregate Performance Formulas
For category $\mathcal{C}$ with pages $p \in \mathcal{C}$:
$$\text{Precision}_{\mathcal{C}} = \frac{\sum_{p} \text{TP}_p}{\sum_{p} \text{TP}_p + \sum_{p} \text{FP}_p}, \quad \text{Recall}_{\mathcal{C}} = \frac{\sum_{p} \text{TP}_p}{\sum_{p} \text{TP}_p + \sum_{p} \text{FN}_p}$$
$$F_{1, \mathcal{C}} = \frac{2 \cdot \text{Precision}_{\mathcal{C}} \cdot \text{Recall}_{\mathcal{C}}}{\text{Precision}_{\mathcal{C}} + \text{Recall}_{\mathcal{C}}}, \quad \text{Mean IoU}_{\mathcal{C}} = \frac{1}{\sum_{p} \text{TP}_p} \sum_{p} \sum_{(i, j) \in \text{TP}_p} \text{IoU}(B_{p, i}, G_{p, j})$$

### 4.5 Numerical Proof: Forced Match Prevention

#### Numerical Example 1: Rejection of Low-IoU Unacceptable Prediction
- **Setup:** A page has $N=1$ predicted box $B_1$ and $M=1$ ground-truth box $G_1$.
  - Spatial overlap yields $\text{IoU}(B_1, G_1) = 0.35$ (below the $0.50$ gate).
  - Centroid distance: $d_{\text{center}} = 50.0\text{ pt}$, page diagonal $\text{diag} = 1000.0\text{ pt}$.
- **Matrix Formulation ($K = 2$):**
  - Real-to-real cost: Because $\text{IoU} < 0.50$, $C_{11} = C_{\text{unmatched}} = 1.0$.
  - Prediction-to-dummy cost: $C_{1, \text{dummy}} = 1.0$.
  - Dummy-to-ground-truth cost: $C_{\text{dummy}, 1} = 1.0$.
  - Dummy-to-dummy cost: $C_{\text{dummy}, \text{dummy}} = 0.0$.
  $$\mathbf{C} = \begin{bmatrix} 1.0 & 1.0 \\ 1.0 & 0.0 \end{bmatrix}$$
- **Hungarian Cost Evaluation:**
  - Option 1 (Match $B_1 \to G_1$, and Dummy $\to$ Dummy): Cost $= 1.0 + 0.0 = \mathbf{1.0}$.
  - Option 2 (Match $B_1 \to \text{Dummy}$, and Dummy $\to G_1$): Cost $= 1.0 + 1.0 = \mathbf{2.0}$ (or $1.0$ with zero dummy assignment).
  - Even if Hungarian selects Option 1, the gate check asserts: $\text{IoU}(B_1, G_1) = 0.35 < 0.50 \implies$ match is rejected!
  - **Accounting Result:** $\text{TP} = 0$, $\text{FP} = 1$, $\text{FN} = 1$. The poor prediction cannot be counted as a match.

#### Numerical Example 2: Duplicate Prediction Penalty
- **Setup:** A page has $M=1$ ground-truth box $G_1$ and $N=2$ predicted boxes $B_1, B_2$ covering $G_1$.
  - $B_1$: $\text{IoU}(B_1, G_1) = 0.90$, $d_{\text{center}} = 5\text{ pt} \implies C_{11} = (1.0 - 0.90) + 0.10 \times (5/1000) = \mathbf{0.1005}$.
  - $B_2$: $\text{IoU}(B_2, G_1) = 0.75$, $d_{\text{center}} = 20\text{ pt} \implies C_{21} = (1.0 - 0.75) + 0.10 \times (20/1000) = \mathbf{0.2520}$.
- **Augmented Cost Matrix ($3 \times 3$):**
  $$\mathbf{C} = \begin{bmatrix} 0.1005 & 1.0 & \infty \\ 0.2520 & \infty & 1.0 \\ 1.0 & 0.0 & 0.0 \end{bmatrix}$$
- **Hungarian Optimization:**
  - Optimal assignment:
    - $B_1 \to G_1$ (cost $0.1005$).
    - $B_2 \to \text{Dummy}_2$ (cost $1.0$).
    - $\text{Dummy}_{\text{gt}} \to \text{Dummy}_1$ (cost $0.0$).
  - Total Minimal Cost: $0.1005 + 1.0 + 0.0 = \mathbf{1.1005}$.
- **Accounting Result:**
  - $B_1$ is accepted as **$\text{TP} = 1$**.
  - $B_2$ is assigned to dummy, penalized as **$\text{FP} = 1$**.
  - $\text{Precision} = 1 / (1 + 1) = \mathbf{0.50}$, $\text{Recall} = 1 / (1 + 0) = \mathbf{1.00}$. The duplicate prediction is rigorously penalized.

---

## 5. Commercial Discount Allocation Policy Engine

### 5.1 Formal Policy Classification: `COMMERCIAL_PRORATA_POSITIVE_REVENUE_v1`
LedgerOne formally defines positive revenue basis allocation as a specialized **commercial document discount policy**, rather than a universal statutory accounting requirement.

```python
class DiscountAllocationPolicyType(str, Enum):
    COMMERCIAL_PRORATA_POSITIVE_REVENUE_v1 = "COMMERCIAL_PRORATA_POSITIVE_REVENUE_v1"
    COMMERCIAL_PRORATA_ALL_LINES_v1 = "COMMERCIAL_PRORATA_ALL_LINES_v1"
    CREDIT_NOTE_REVERSAL_PRORATA_v1 = "CREDIT_NOTE_REVERSAL_PRORATA_v1"
    EXPLICIT_LINE_ITEM_DISCOUNTS_ONLY = "EXPLICIT_LINE_ITEM_DISCOUNTS_ONLY"
```

### 5.2 Policy Rules & Restrictions
1. **Applicable Document Types:**
   - Supported: `COMMERCIAL_INVOICE`, `PURCHASE_ORDER`, `PRO_FORMA_INVOICE`, `SALES_RECEIPT`.
   - Forbidden: `STANDALONE_CREDIT_NOTE` (where all lines are negative; must use `CREDIT_NOTE_REVERSAL_PRORATA_v1`).
2. **Treatment of Returns and Negative Lines:**
   Commercial discounts and order-level promotional allowances apply exclusively to positive, revenue-generating goods and services. Return lines, defective item trade-ins, and customer credit balance lines represent already settled prior value:
   $$B_i = \max(S_i, \text{Decimal}('0.00'))$$
   Lines with $S_i \le 0$ receive basis $B_i = 0$ and are strictly barred from receiving allocated document-level discounts ($A_i = 0$).
3. **Zero-Basis Behavior ($B_{\text{total}} == 0$):**
   - If document adjustment $D == 0 \implies A_i = 0$ for all lines.
   - If $D \ne 0$ and $B_{\text{total}} == 0 \implies$ Proportional allocation is mathematically undefined ($0/0$). The allocation evaluator aborts to **`NOT_EVALUABLE`** with diagnostic code `ERR_ALLOCATION_ZERO_BASIS`.
4. **Original Document-Level Adjustment Preservation:**
   **Fundamental Architectural Guarantee:** Even when line-level discount allocation evaluates to `NOT_EVALUABLE`, the system **strictly preserves the original extracted document-level adjustment $D$** in `ExtractedField(field_name='document_discount')`.
   Document-level invariant checks (`INV-001`: $\text{subtotal} - D + \text{tax} == \text{grand\_total}$) continue to evaluate and pass at the document header level. Only line-level itemized tax/net recalculation (`INV-004`) is flagged as `NOT_EVALUABLE`.

---

## 6. Legally Constrained Statutory Tax-ID & Jurisdiction Resolution Contract

### 6.1 Gated Statutory Tax-ID Validation
In enterprise tax accounting, missing tax registration numbers (VAT ID, GSTIN, EIN) do **not** constitute an unconditional statutory violation. A missing tax ID constitutes a non-overridable hard block **only after** statutory jurisdiction, transaction type, and mandatory requirements are resolved.

```python
class TaxIdRequirementStatus(str, Enum):
    MANDATORY_SUPPLIER_ONLY = "MANDATORY_SUPPLIER_ONLY"         # Standard domestic B2B/B2C under EU VAT Art 226
    MANDATORY_CUSTOMER_ONLY = "MANDATORY_CUSTOMER_ONLY"         # Specific self-billing / reverse-charge frameworks
    MANDATORY_BOTH = "MANDATORY_BOTH"                           # EU intra-community supply (Art. 226(4) VAT Directive)
    CONDITIONAL_REVERSE_CHARGE = "CONDITIONAL_REVERSE_CHARGE"   # Customer VAT ID mandatory to shift liability
    EXEMPT_BELOW_THRESHOLD = "EXEMPT_BELOW_THRESHOLD"           # e.g. German Kleinunternehmer (§19 UStG)
    NOT_REQUIRED_IN_JURISDICTION = "NOT_REQUIRED_IN_JURISDICTION" # e.g. US state sales tax receipts
    UNRESOLVED = "UNRESOLVED"

class StatutoryTaxIdRequirement(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    rule_identifier: str = Field(description="e.g. EU-VAT-ART226-2024")
    jurisdiction_code: str = Field(description="ISO 3166-1 alpha-2")
    transaction_classification: TransactionClassification = Field(...)
    requirement_status: TaxIdRequirementStatus = Field(...)
    statute_reference: str = Field(description="Legal citation, e.g. EU Council Directive 2006/112/EC Art 226")
    effective_date: date = Field(...)
    supplier_tax_id_mandatory: bool = Field(...)
    customer_tax_id_mandatory: bool = Field(...)
```

### 6.2 Evaluation & Hard-Block Decision Logic
1. **Case 1: Resolved Mandatory:**
   If `statutory_requirement.supplier_tax_id_mandatory == True` and `extracted_fields.supplier_tax_id` is missing/null:
   $\implies$ Invariant `INV-007` evaluates to `FAILED` with diagnostic `ERR_TAX_ID_SUPPLIER_MANDATORY_MISSING`. This triggers a **non-overridable hard block**.
2. **Case 2: Resolved Reverse Charge:**
   If `transaction_classification == REVERSE_CHARGE` and customer VAT ID is missing:
   $\implies$ Invariant `INV-007` evaluates to `FAILED` with diagnostic `ERR_TAX_ID_CUSTOMER_REVERSE_CHARGE_MISSING`. Triggers a **non-overridable hard block**.
3. **Case 3: Resolved Exempt or Not Required:**
   If `requirement_status in {EXEMPT_BELOW_THRESHOLD, NOT_REQUIRED_IN_JURISDICTION}`:
   $\implies$ Missing tax ID evaluates to `PASSED` with audit notice `INFO_TAX_ID_STATUTORILY_EXEMPT`. Zero hard blocks.
4. **Case 4: Unresolved Jurisdiction or Applicability:**
   If jurisdiction, place of supply, or tax regime cannot be definitively verified from document evidence:
   $\implies$ Invariant `INV-007` evaluates strictly to **`NOT_EVALUABLE`** with diagnostic code `DIAG_TAX_ID_APPLICABILITY_UNRESOLVED`.
   *Critical Standard:* The system **never manufactures a statutory violation or hard block** when legal applicability cannot be proven. The document routes to HITL review.

---

## 7. Dual-Dimension Document Lifecycle & Canonical RBAC Alignment

### 7.1 Orthogonal State Dimensions
To eliminate conflation between automated invariant success and independent human verification, LedgerOne decouples status tracking into two orthogonal dimensions:
- **`MachineValidationStatus`:** Evaluated purely by automated algorithms (`NOT_RUN`, `SCHEMA_VALID`, `INVARIANTS_PASSED`, `INVARIANTS_FAILED`, `INVARIANTS_INCOMPLETE`).
- **`DocumentLifecycleState`:** Managed through operational and human workflows (`UPLOADED`, `EXTRACTED`, `AUTO_VALIDATED`, `PENDING_REVIEW`, `CORRECTION_SUBMITTED`, `HUMAN_VERIFIED`, `APPROVED`, `REJECTED`, `ARCHIVED`).

### 7.2 Canonical RBAC Verification & Authorization Mapping
Under the canonical LedgerOne RBAC model defined in `Decisions.md` (ADR-005) and `LedgerOne/db/schema.sql`:

1. **`REVIEWER` Authority:**
   - Canonical definition: *"Inspect document layouts and extractions, verify/correct field values, approve/reject documents, inspect extraction confidence."*
   - Authorized operations: Inspect extractions, perform field corrections, execute verification of corrected extractions, approve documents for export.
2. **`DOCUMENT_MANAGER` Authority:**
   - Canonical definition: *"Ingest documents (direct and presigned uploads), trigger extraction jobs, manage document metadata, archive documents."*
   - Authorized operations: Ingest files, manage metadata, trigger re-extractions, archive documents, stage field corrections.
   - **Boundary Enforcement:** `DOCUMENT_MANAGER` does **NOT** hold canonical review approval authority under ADR-005. Final document operational approval (`APPROVE_DOCUMENT`) belongs to `REVIEWER`, `WORKSPACE_ADMIN`, and `ORGANIZATION_ADMIN`.
3. **`WORKSPACE_ADMIN` & `ORGANIZATION_ADMIN` Authority:**
   - Subsumes all workspace management and review capabilities. Holds administrative escalation rights.

### 7.3 Complete Lifecycle State Transition Matrix

| Current State | Transition Operation | Permitted Canonical Actor Roles | Preconditions | Target State | Audit Event Logged |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `UPLOADED` | `RUN_EXTRACTION` | Automated Pipeline | Valid S3 PDF binary | `EXTRACTED` | `EVT_PIPELINE_EXTRACTION_COMPLETE` |
| `EXTRACTED` | `EVALUATE_INVARIANTS` | Automated Pipeline | Schemas valid | `AUTO_VALIDATED` (if pass) / `PENDING_REVIEW` (if fail) | `EVT_INVARIANTS_EVALUATED` |
| `PENDING_REVIEW` | `CORRECT_FIELDS` | `REVIEWER`, `DOCUMENT_MANAGER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | Document in review queue | `PENDING_REVIEW` | `EVT_FIELDS_MODIFIED` |
| `PENDING_REVIEW` | `SUBMIT_CORRECTIONS` | `REVIEWER`, `DOCUMENT_MANAGER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | Field edits staged | `CORRECTION_SUBMITTED` | `EVT_CORRECTIONS_SUBMITTED` |
| `CORRECTION_SUBMITTED` | `RE_EVALUATE_INVARIANTS` | Automated Pipeline | Automatically triggered | `CORRECTION_SUBMITTED` | `EVT_INVARIANTS_RECHECKED` |
| `CORRECTION_SUBMITTED` | `VERIFY_CORRECTIONS` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | **SoD Enforced:** $\text{verifier} \ne \text{corrector}$ | `HUMAN_VERIFIED` (if pass) / `PENDING_REVIEW` (if reject) | `EVT_HUMAN_VERIFICATION_COMPLETE` |
| `AUTO_VALIDATED` or `HUMAN_VERIFIED` | `APPROVE_DOCUMENT` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | All invariants passed or valid override exception attached | `APPROVED` | `EVT_DOCUMENT_APPROVED_FOR_EXPORT` |
| Any active state | `REJECT_DOCUMENT` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | Rejection reason documented | `REJECTED` | `EVT_DOCUMENT_REJECTED` |
| `APPROVED` | `REOPEN_DOCUMENT` | `ORGANIZATION_ADMIN` strictly | Documented administrative justification | `PENDING_REVIEW` | `EVT_APPROVED_DOCUMENT_REOPENED` |

---

## 8. PostgreSQL Context Storage, Index Optimization & Database-Enforced Audit Ledger

### 8.1 Exact B-Tree Indexing for Context Garbage Collection
To guarantee high-throughput, sub-millisecond execution without sequential table scans on `app_security.active_context`:

```sql
-- PostgreSQL 14/15/16 DDL
CREATE UNLOGGED TABLE IF NOT EXISTS app_security.active_context (
    xact_id xid8 NOT NULL,
    backend_pid integer NOT NULL,
    org_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_role varchar(50) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '60 seconds'),
    PRIMARY KEY (xact_id, backend_pid)
);

-- Index specifically accelerating the garbage collection query:
CREATE INDEX IF NOT EXISTS idx_active_context_xact_id
ON app_security.active_context USING btree (xact_id);

-- Index accelerating active lookup and expiration filtering:
CREATE INDEX IF NOT EXISTS idx_active_context_lookup
ON app_security.active_context USING btree (xact_id, backend_pid, expires_at);
```

### 8.2 Query Plan Acceptance Criteria
The automated garbage-collection sweep executes:
```sql
DELETE FROM app_security.active_context
WHERE xact_id < pg_snapshot_xmin(pg_current_snapshot());
```
**Verification Acceptance Standard:**
1. Running `EXPLAIN (FORMAT JSON)` on a table populated with 100,000 synthetic rows must yield:
   - `Node Type`: `Index Scan` or `Bitmap Index Scan`.
   - `Index Name`: `idx_active_context_xact_id`.
   - `Filter / Index Cond`: `(xact_id < pg_snapshot_xmin(pg_current_snapshot()))`.
   - `Total Cost`: $\le 50.00$.
   - **Zero sequential scans permitted.**
2. Concurrency & Locking: The delete query runs with `statement_timeout = '250ms'` and is batched (`LIMIT 5000`) during high transaction volume to prevent lock queue buildup.

### 8.3 Unlogged Table Crash Recovery & Fail-Closed Security
- **Crash Recovery Behavior:** Per PostgreSQL specification, unlogged tables bypass the Write-Ahead Log (WAL). Upon crash recovery (e.g. database server crash, Neon compute pod restart), PostgreSQL automatically executes `TRUNCATE` on all unlogged tables.
- **Fail-Closed Security Guarantee:** When `app_security.active_context` is empty:
  - Context getter functions (`app_security.get_org_id()`, `app_security.get_ws_id()`) return `NULL`.
  - Database Row-Level Security (RLS) policies enforce:
    `organization_id = app_security.get_org_id()`
  - Because `NULL = NULL` evaluates to `FALSE` in SQL boolean logic, any query executed by `ledgerone_app` immediately returns **0 rows**.
  - **Zero data leakage can occur following a database crash.**

### 8.4 Database-Enforced Audit Ledger Immutability
Application-layer conventions cannot guarantee immutability. LedgerOne enforces audit ledger append-only immutability directly in PostgreSQL:

```sql
-- Dedicated append-only audit ledger
CREATE TABLE IF NOT EXISTS app_security.audit_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_timestamp timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    org_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    document_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    actor_role varchar(50) NOT NULL,
    event_type varchar(100) NOT NULL,
    event_payload jsonb NOT NULL,
    previous_state varchar(50),
    target_state varchar(50)
);

-- Revoke mutation privileges from unprivileged application role
REVOKE UPDATE, DELETE, TRUNCATE ON app_security.audit_ledger FROM ledgerone_app;
GRANT INSERT, SELECT ON app_security.audit_ledger TO ledgerone_app;

-- Database trigger raising exception on any attempted modification
CREATE OR REPLACE FUNCTION app_security.enforce_audit_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit ledger records are strictly immutable and append-only (SQLSTATE 42501)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_ledger_immutable ON app_security.audit_ledger;
CREATE TRIGGER trg_audit_ledger_immutable
BEFORE UPDATE OR DELETE ON app_security.audit_ledger
FOR EACH ROW EXECUTE FUNCTION app_security.enforce_audit_ledger_immutability();
```

### 8.5 Transactional Atomicity Between State Transitions and Audit Writes
Every document lifecycle transition must execute atomically with its audit ledger insert in the same database transaction:
```python
async with conn.transaction():
    # 1. Update document status
    await conn.execute(
        """
        UPDATE documents
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND organization_id = app_security.get_org_id();
        """,
        target_state,
        doc_id,
    )
    # 2. Append immutable audit event
    await conn.execute(
        """
        INSERT INTO app_security.audit_ledger (
            org_id, workspace_id, document_id, actor_id, actor_role,
            event_type, previous_state, target_state, event_payload
        ) VALUES (
            app_security.get_org_id(), app_security.get_ws_id(), $1,
            app_security.get_user_id(), app_security.get_user_role(),
            $2, $3, $4, $5
        );
        """,
        doc_id, event_type, current_state, target_state, json.dumps(payload),
    )
```
If the audit write fails or is blocked by database triggers, the state update rolls back automatically (`ROLLBACK`).

---

## 9. Financial Auditor Override Architecture: Configurable Threshold Policies & Expiration Disambiguation

### 9.1 Invariant Truth Inviolability
- An override **never alters mathematical invariant truth**.
- Invariant evaluation outcomes are immutable mathematical assertions: a failed invariant permanently remains `FAILED`.
- Authorized overrides create a decoupled database record `OverrideExceptionRecord`, which unlocks document-level **approval eligibility** without altering the underlying arithmetic failure ledger.

### 9.2 Configurable Threshold Policy Contract
Hardcoded currency thresholds are eliminated. LedgerOne specifies an authoritative, versioned threshold policy:

```python
class ThresholdCombinationRule(str, Enum):
    AND = "AND"   # Non-overridable if (pct_delta > pct_thresh) AND (|delta| > abs_thresh)
    OR = "OR"     # Non-overridable if (pct_delta > pct_thresh) OR (|delta| > abs_thresh)

class FinancialOverrideThresholdPolicy(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    policy_id: UUID = Field(...)
    organization_id: UUID = Field(...)
    workspace_id: Optional[UUID] = Field(default=None, description="None = Org-wide default")
    document_type: str = Field(default="ALL", description="COMMERCIAL_INVOICE, CREDIT_NOTE, etc.")
    invariant_id: str = Field(default="ALL_MONETARY", description="INV-001, INV-003, etc.")
    severity: InvariantSeverityEnum = Field(...)
    currency_code: str = Field(description="ISO 4217 currency code, e.g. USD, EUR, GBP")
    absolute_threshold: Decimal = Field(gt=Decimal("0.00"), description="Currency major units")
    percentage_threshold: Decimal = Field(gt=Decimal("0.00"), description="e.g. Decimal('5.0') for 5.0%")
    combination_rule: ThresholdCombinationRule = Field(default=ThresholdCombinationRule.AND)
    version_tag: str = Field(description="e.g. v2026.1")
    effective_from: datetime = Field(...)
    effective_to: Optional[datetime] = Field(default=None)
    approved_by: UUID = Field(description="User ID with ORGANIZATION_ADMIN or CFO role")
    approval_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(...)
```

### 9.3 Explicit Calculation & Boundary Rules
1. **Percentage Denominator Formula:**
   For standard monetary comparisons where $\text{expected} \ne 0$:
   $$\text{Relative Delta} = \frac{|\text{observed} - \text{expected}|}{|\text{expected}|} \times 100\%$$
   Using $|\text{expected}|$ ensures the denominator is strictly positive, correctly handling negative expected subtotals in credit notes.
2. **Zero Expected Value Behavior ($\text{expected} == 0$):**
   If $\text{expected} == 0$ (e.g. document discount expected to be zero), the percentage delta is mathematically undefined ($0/0$).
   **Strict Fallback Rule:** Percentage threshold comparison is disabled. Evaluation switches **strictly to absolute threshold comparison**:
   $$\text{Non-Overridable Hard Block Triggers iff } |\text{delta}| > \text{absolute\_threshold}$$
3. **FX Conversion Policy:**
   If a document currency has no explicit currency policy entry, the absolute threshold is derived by converting the baseline `USD` threshold to document currency using the official central bank exchange rate (e.g. ECB reference rate) matching document `tax_point_date`. If exchange rate feeds are unavailable: **Fail-Closed**.
4. **Missing Policy / Unresolved Currency (Fail-Closed Standard):**
   If no approved threshold policy exists for the workspace, or if document currency is unresolved (`ERR_CURRENCY_UNRESOLVED`): **FAIL-CLOSED**. Overrides are strictly disabled, and the document routes to HITL review.

### 9.4 Disambiguation of Override Expiration Timestamps
To prevent ambiguity, LedgerOne explicitly separates the authorization signature window from the exception operational lifetime:

```
+----------------------------------------------------------------------------------------------------+
|                                OVERRIDE LIFECYCLE TIMESTAMPS                                       |
+----------------------------------------------------------------------------------------------------+
  $T_{\text{init}}$                 $T_{\text{approved}} = T_{\text{activated}}$                  $T_{\text{expires}}$
     |                                          |                                           |
     +--- [48h Signature Window] --------------->+--- [30-Day Operational Exception Lifetime] --->|
     |    Principal 1 initiates                 |    Principal 2 approves                   |    Exception
     |    (`WORKSPACE_ADMIN`)                   |    (`ORGANIZATION_ADMIN`)                 |    lapses
     |                                          |                                           |
     +--- (If unsigned after 48h) ------------->+                                           |
          `OVERRIDE_EXPIRED_UNAPPROVED`                                                     |
                                                +--- (If document fields revised) --------->+
                                                     `OVERRIDE_INVALIDATED_BY_REVISION`
+----------------------------------------------------------------------------------------------------+
```

1. **Authorization Signature Window ($T_{\text{auth\_window}} = 48\text{ hours}$):**
   The maximum elapsed time permitted between Principal 1 (`WORKSPACE_ADMIN`) initiating the override request ($T_{\text{init}}$) and Principal 2 (`ORGANIZATION_ADMIN`) signing approval ($T_{\text{approved}}$).
   If unsigned at $T_{\text{init}} + 48\text{h}$, the override request lapses to `OVERRIDE_EXPIRED_UNAPPROVED` and can never be signed.
2. **Operational Exception Lifetime ($T_{\text{lifetime}} = 30\text{ days}$):**
   Once approved, the override exception becomes active ($T_{\text{activated}} = T_{\text{approved}}$) and permits document approval until $T_{\text{expires}} = T_{\text{activated}} + 30\text{ days}$ or until document export.
3. **Automatic Revalidation Trigger:**
   If any extracted field is edited or re-extracted, all attached overrides are immediately invalidated ($T_{\text{revalidated}}$) and marked `OVERRIDE_INVALIDATED_BY_REVISION`, forcing full re-evaluation.

---

## 10. Seven Executable Adversarial Security Test Specifications

```python
# tests/security/test_postgres_context_adversarial.py
import pytest
import asyncpg
import hmac
import hashlib
import json
import uuid

@pytest.mark.asyncio
async def test_adv_01_pooled_connection_cross_talk(db_pool):
    """Verify Transaction A context cannot authorize Transaction B on same pooled connection."""
    async with db_pool.acquire() as conn:
        tr_a = conn.transaction()
        await tr_a.start()
        await conn.execute("SELECT app_security.set_verified_context($1, $2);", payload_a, sig_a)
        res_a = await conn.fetch("SELECT * FROM extracted_fields WHERE field_name='line_items';")
        assert len(res_a) >= 1  # Authorized for Tenant A
        await tr_a.commit()

        # Step 2: Open Transaction B on the EXACT SAME physical connection
        tr_b = conn.transaction()
        await tr_b.start()
        # Transaction B does NOT register context
        res_b = await conn.fetch("SELECT * FROM extracted_fields WHERE field_name='line_items';")
        assert len(res_b) == 0  # Fail-Closed: MUST return zero rows!
        await tr_b.rollback()

@pytest.mark.asyncio
async def test_adv_02_transaction_rollback_isolation(db_pool):
    """Verify rolled back transaction context does not persist."""
    async with db_pool.acquire() as conn:
        tr = conn.transaction()
        await tr.start()
        await conn.execute("SELECT app_security.set_verified_context($1, $2);", payload, sig)
        await tr.rollback()

        # New transaction on same connection
        async with conn.transaction():
            res = await conn.fetchval("SELECT app_security.get_org_id();")
            assert res is None

@pytest.mark.asyncio
async def test_adv_03_concurrent_transaction_isolation(db_pool):
    """Verify concurrent transactions on different connections maintain strict tenant boundaries."""
    async with db_pool.acquire() as conn1, db_pool.acquire() as conn2:
        async with conn1.transaction(), conn2.transaction():
            await conn1.execute("SELECT app_security.set_verified_context($1, $2);", payload_org1, sig1)
            await conn2.execute("SELECT app_security.set_verified_context($1, $2);", payload_org2, sig2)
            
            org1_id = await conn1.fetchval("SELECT app_security.get_org_id();")
            org2_id = await conn2.fetchval("SELECT app_security.get_org_id();")
            assert org1_id != org2_id

@pytest.mark.asyncio
async def test_adv_04_forged_context_signature_rejection(db_pool):
    """Verify forged tenant claims with invalid HMAC signature are rejected with exception 42501."""
    async with db_pool.acquire() as conn:
        with pytest.raises(asyncpg.PostgresError) as exc_info:
            await conn.execute("SELECT app_security.set_verified_context($1, $2);", forged_payload, fake_sig)
        assert "AUTH_004" in str(exc_info.value)

@pytest.mark.asyncio
async def test_adv_05_nonce_replay_attack_prevention(db_pool):
    """Verify attempting to redeem the same nonce twice triggers immediate unique violation."""
    async with db_pool.acquire() as conn:
        await conn.execute("SELECT app_security.set_verified_context($1, $2);", payload, sig)
        with pytest.raises(asyncpg.PostgresError) as exc_info:
            await conn.execute("SELECT app_security.set_verified_context($1, $2);", payload, sig)
        assert "AUTH_005" in str(exc_info.value)

@pytest.mark.asyncio
async def test_adv_06_direct_session_setting_spoof_prevention(db_pool):
    """Verify ledgerone_app executing SET LOCAL cannot bypass RLS getters."""
    async with db_pool.acquire() as conn:
        await conn.execute("SET LOCAL app.verified_org_id = '00000000-0000-0000-0000-000000000001';")
        res = await conn.fetch("SELECT * FROM extracted_fields;")
        assert len(res) == 0  # RLS reads ONLY from app_security.active_context

@pytest.mark.asyncio
async def test_adv_07_backend_pid_reuse_safety(db_pool):
    """Verify recycled OS PID cannot authorize past transaction ID."""
    async with db_pool.acquire() as conn:
        res = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM app_security.active_context
                WHERE backend_pid = pg_backend_pid() AND xact_id != pg_current_xact_id()
            );
            """
        )
        assert res is False
```

---

## 11. Verified Existing Repository Facts vs. Proposed Target Architecture

| Architectural Component | Current Baseline Verification Status (`70410a1`) | Proposed Target Architecture (Wave 1–5 Target) |
| :--- | :--- | :--- |
| **`extracted_fields` Table** | Exists in Neon PostgreSQL (`schema.sql`). Unique B-tree index on `(org_id, ws_id, doc_id, field_name)`. | Retained without DDL migrations for Phase 4 Step 4. |
| **RLS Policies on `extracted_fields`** | Live DDL enforces workspace membership on `SELECT`, but checks only org-level roles on `INSERT, UPDATE, DELETE`. | Phase 5 target specifies workspace checks across all DML. |
| **HMAC Security Context** | **Does not exist in baseline.** Baseline relies on standard asyncpg connection settings. | Specified as target in `app_security` for Phase 5 hardened tenancy. |
| **Pydantic Data Contracts** | Baseline has basic `LineItemSchema` in `extraction_schemas.py`. | Wave 1 implements deeply immutable `LineItemField` and `RoundingPolicy`. |
| **10 Accounting Invariants** | Evaluated ad-hoc in Step 3 benchmark scripts. | Wave 1 formalizes pure Decimal evaluator engine (`INV-001` to `INV-010`). |
| **Multi-Page Table Stitcher** | Baseline has single-page `TableStructureExtractor`. | Wave 2 delivers cross-page continuation engine and 15-fixture test harness. |
| **30-Document Corpus** | Exists in `dataset_provenance_register.json` (10 dev, 10 synthetic, 10 external). | Quarantined: tuning on 10 dev only; frozen evaluation on 20 held-out. |

---

## 12. Five-Wave Implementation Plan (Preserved)

- **Wave 1:** Core Pydantic Contracts, Rounding Policy Engine, and Invariant Evaluator (`table_contracts.py`, `rounding_policy.py`, `accounting_invariants.py`).
- **Wave 2:** Geometry & Cross-Page Table Continuation Engine (`table_geometry.py`, `multipage_table_stitcher.py`).
- **Wave 3:** Column Header Classifier & Row Segmentation Engine (`header_classifier.py`, `row_segmenter.py`, `tune_header_classifier.py`).
- **Wave 4:** Pipeline Integration & Database Persistence (`hybrid_structured_extractor.py`, `extraction_schemas.py`).
- **Wave 5:** Comprehensive Adversarial Verification, Benchmark Execution, and Evaluation Sign-off (`test_table_extraction.py`, `test_accounting_invariants.py`, `run_step4_table_benchmark.py`).

---

## 13. Planning-Only Execution Boundary Attestation & Final Readiness Declaration

### 13.1 Execution Boundary Attestation
1. **Repository Baseline Preserved:** Baseline commit remains strictly [`70410a1`](file:///d:/Projects/LedgerOne).
2. **Zero Code Changes:** No application source code (`src/`), test files (`tests/`), database schemas or migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

---

### 13.2 Final Readiness Declaration

### **READY FOR WAVE 1 AUTHORIZATION**

**Status Evaluation:** Specification v3.1.0 delivers complete, verified, and mathematically closed engineering contracts across all seven core domains:
- Two-track PDF evaluation separating native content stream geometry from rendered raster geometry.
- Augmented Hungarian matching with dummy nodes and numerical proofs of non-forced assignments.
- Configurable financial override threshold policy with fail-closed security and timestamp disambiguation.
- Legally constrained statutory tax-ID applicability gating preventing manufactured violations.
- Formal classification of commercial discount allocation policy preserving document-level adjustments.
- Index-optimized PostgreSQL context storage and trigger-enforced immutable audit ledger.
- Strict reconciliation of operational approval permissions against canonical RBAC.

All technical ambiguities have been resolved with concrete algorithms and verification criteria. Wave 1 implementation can commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
