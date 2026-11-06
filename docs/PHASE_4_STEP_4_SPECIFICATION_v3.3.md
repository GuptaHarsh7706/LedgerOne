# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v3.3.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v3.3.0`  
**Baseline Git Commit:** `70410a1` (`feat(intelligence): Phase 4 Step 3 comparative extraction audit, Decimal precision, and calibration gate (v3.9.0)`)  
**Scope Classification:** Strictly Planning and Specification Only  
**Execution Authorization Status:** **STRICTLY BLOCKED** (Awaiting explicit human principal authorization)  
**Target Module:** `LedgerOne/src/intelligence/`  
**Regression Baseline:** 124 platform regression tests passing on commit `70410a1`  

---

## 1. Executive Summary & Change Log (v3.2 $\to$ v3.3)

Specification v3.3.0 establishes the final implementation-gate closure across numerical optimization, database concurrency, audit integrity, and regulatory data retention:

1. **Hungarian Solver Implementation Contract & Finite Sentinel $K$:**
   - Evaluated dense Kuhn-Munkres/Jonker-Volgenant implementations (`scipy.optimize.linear_sum_assignment`). Documented that internal matrix reductions ($C_{ij} - u_i - v_j$) can produce undefined arithmetic or NaN values when initialized with infinite costs ($\infty - \infty$).
   - Formulated a mathematically bounded finite sentinel constant:
     $$K_{\text{sentinel}} = (N + M) + 10.0$$
     Formally proved that: (a) Every valid real match is cheaper than leaving both objects unmatched ($C_{ij} \le 0.60 < 2.0$); (b) Every forbidden match is strictly more expensive than any feasible complete assignment ($K_{\text{sentinel}} > \text{Cost}_{\text{max\_feasible}} = N + M$); (c) Arithmetic is strictly finite in `np.float64` without NaN; (d) Deterministic tie-breaking is maintained.
   - Defined standardized evaluation metric conventions for zero-prediction ($N=0, M>0 \implies \text{Precision}=0.0, \text{Recall}=0.0$), zero-ground-truth ($N>0, M=0 \implies \text{Precision}=0.0, \text{Recall}=0.0$), and blank-page true negatives ($N=0, M=0 \implies \text{Precision}=1.0, \text{Recall}=1.0, F_1=1.0, \text{IoU}=1.0$).
2. **PostgreSQL-Compatible CTE-Based Batched Cleanup:**
   - Corrected PostgreSQL dialect syntax: recognized that PostgreSQL does not support direct `DELETE ... LIMIT`. Formulated an executable CTE-based deletion query utilizing `ORDER BY xact_id ASC LIMIT 5000 FOR UPDATE SKIP LOCKED`.
   - Proved concurrent worker safety (multiple cleanup jobs proceed in parallel without lock contention), transactional isolation (`READ COMMITTED`), active transaction safety, and retry semantics.
   - Performed index redundancy review: proved that the primary key B-tree index `(xact_id, backend_pid)` natively accelerates leading-column range lookups on `xact_id`, eliminating the redundant single-column index.
3. **Trusted Audit Ledger Insertion Contract:**
   - Revoked direct `INSERT` privileges on `app_security.audit_ledger` from `ledgerone_app` (`REVOKE INSERT, UPDATE, DELETE, TRUNCATE`).
   - Specified a trusted `SECURITY DEFINER` database function `app_security.log_audit_event(...)`. Internal claims are extracted directly from cryptographically verified transaction context (`app_security.get_user_id()`, `app_security.get_user_role()`), preventing the application role from forging actor identities, tenant IDs, or unauthorized state transitions.
   - Enforced transition validation against current document state, monotonic event sequence numbers, correlation UUIDs, and transactional atomicity with business operations.
4. **Configurable WORM Retention & CDC Reliability Model:**
   - Eliminated the universal 7-year retention assumption. Built a typed `RegulatoryRetentionPolicy` supporting jurisdiction-specific mandates (e.g. German GoBD 10 years, US IRS 7 years, UK HMRC 6 years), document classifications, legal holds, and data-minimization reconciliations with GDPR Article 17.
   - Specified Change Data Capture (CDC / Debezium) reliability: at-least-once delivery, ordering by LSN and document sequence number, idempotent consumer deduplication, replication backlog monitoring, and graceful decoupling allowing business transactions to proceed asynchronously during replication lag.
5. **Hardened Threat Model & Governance Closure:**
   - Explicitly differentiated application-tier compromise defense from database table owner and cloud superuser boundaries.
   - Documented external WORM storage (AWS S3 Object Lock in Compliance Mode) as the necessary technical gate for statutory non-repudiation.

---

## 2. Updated Blocker-Resolution Matrix (v3.2 $\to$ v3.3)

| # | Domain | v3.2 Specification Defect / Ambiguity | v3.3 Engineering Resolution |
| :- | :--- | :--- | :--- |
| **1** | **Hungarian Solver** | Infinite costs ($\infty$) risk NaN during matrix reduction; lacked finite sentinel proof and explicit metric conventions for boundary counts. | Defined finite sentinel $K_{\text{sentinel}} = (N+M) + 10.0$ with mathematical non-selection proof. Codified explicit metric conventions for $N=0$ and $M=0$. |
| **2** | **PostgreSQL Cleanup** | Direct `DELETE ... LIMIT` is invalid PostgreSQL syntax; maintained redundant B-tree index on `(xact_id)`. | Specified executable CTE with `FOR UPDATE SKIP LOCKED`. Eliminated redundant index; leveraged composite primary key leading column. |
| **3** | **Audit Insertion** | Direct `INSERT` permission allowed `ledgerone_app` to forge audit events and actor identities. | Revoked direct `INSERT`. Specified `SECURITY DEFINER` function extracting actor identity from cryptographically verified context with state transition checks. |
| **4** | **WORM Retention & CDC** | Assumed universal 7-year retention; lacked CDC delivery guarantees, legal hold rules, and replication lag operational semantics. | Built typed `RegulatoryRetentionPolicy` by jurisdiction. Formalized CDC LSN ordering, idempotent deduplication, legal holds, and asynchronous lag decoupling. |
| **5** | **Audit Threat Model** | Implied database triggers alone provide legal non-repudiation against privileged database operators. | Formally distinguished application-tier defense from superuser/cloud admin access. Mandated external cloud WORM with Object Lock for legal non-repudiation. |

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
- **Sauvola Heuristic Role:** Sauvola adaptive thresholding is strictly a candidate edge-detection aid for human annotation tools. It is **never** treated as ground truth.

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

## 4. Corrected Hungarian Solver Implementation Contract

### 4.1 Solver Arithmetic & Finite Sentinel Constant ($K_{\text{sentinel}}$)
Standard implementations of the Kuhn-Munkres algorithm (such as `scipy.optimize.linear_sum_assignment`) perform matrix reductions:
$$C'_{ij} = C_{ij} - u_i - v_j$$
where $u_i = \min_j C_{ij}$ and $v_j = \min_i (C_{ij} - u_i)$.
When initialized with infinite costs ($\infty$), operations such as $\infty - \infty$ result in `NaN` or unhandled floating-point exceptions.

To guarantee strictly finite arithmetic, zero `NaN` occurrences, and native rejection of invalid matches, LedgerOne defines a dynamic, mathematically bounded finite sentinel constant:
$$K_{\text{sentinel}} = (N + M) + 10.0$$

#### Mathematical Bound Proof:
1. Let $L = N + M$ be the dimension of the augmented square cost matrix $\mathbf{C}$.
2. Every feasible assignment pairs each of the $L$ rows to distinct columns.
3. In any valid assignment that contains **zero forbidden edges**:
   - Any valid real match costs $C_{ij} \le 0.60 < 1.0$.
   - Any unmatched prediction costs $C_{\text{dummy}} = 1.0$.
   - Any unmatched ground truth costs $C_{\text{dummy}} = 1.0$.
   - Any dummy-to-dummy match costs $0.0$.
   - The total cost of any feasible valid assignment $\mathcal{A}_{\text{valid}}$ is strictly bounded by:
     $$\text{Cost}(\mathcal{A}_{\text{valid}}) \le L \times 1.0 = N + M$$
4. Now consider any assignment $\mathcal{A}_{\text{forbidden}}$ that selects **at least one forbidden edge**:
   $$\text{Cost}(\mathcal{A}_{\text{forbidden}}) \ge K_{\text{sentinel}} + 0.0 = (N + M) + 10.0$$
5. Comparing the two costs:
   $$\text{Cost}(\mathcal{A}_{\text{forbidden}}) \ge (N + M) + 10.0 > N + M \ge \text{Cost}(\mathcal{A}_{\text{valid}})$$
   Because the Hungarian algorithm strictly minimizes total assignment cost, **it is mathematically impossible for the solver to select a forbidden edge when any valid or unmatched alternative exists**.
6. Numerical Precision: Evaluated using standard IEEE 754 `np.float64`. Machine epsilon is $\approx 2.22 \times 10^{-16}$. No overflow, underflow, or undefined arithmetic occurs.

### 4.2 Exact Augmented Matrix Construction
For $N$ predictions and $M$ ground-truth boxes on page $p$, the augmented $(N+M) \times (N+M)$ square cost matrix $\mathbf{C}$ is:

$$\mathbf{C} = \begin{bmatrix} \mathbf{C}_{\text{pred}\to\text{gt}} & \mathbf{C}_{\text{pred}\to\text{dummy}} \\ \mathbf{C}_{\text{dummy}\to\text{gt}} & \mathbf{C}_{\text{dummy}\to\text{dummy}} \end{bmatrix}_{(N + M) \times (N + M)}$$

1. **Real-to-Real Block $\mathbf{C}_{\text{pred}\to\text{gt}}$ ($N \times M$):**
   $$C_{ij} = \begin{cases} 1.0 - \text{IoU}(B_i, G_j) + \alpha \cdot \frac{d_{\text{center}}(B_i, G_j)}{\text{diag}_p} & \text{if } \text{IoU}(B_i, G_j) \ge 0.50 \\ K_{\text{sentinel}} & \text{if } \text{IoU}(B_i, G_j) < 0.50 \end{cases}$$
2. **Prediction-to-Dummy Block $\mathbf{C}_{\text{pred}\to\text{dummy}}$ ($N \times N$):**
   $$C_{i, M+k} = \begin{cases} 1.0 & \text{if } k = i \quad \text{(Private dummy node assignment cost)} \\ K_{\text{sentinel}} & \text{if } k \ne i \quad \text{(Cross-dummy assignment forbidden)} \end{cases}$$
3. **Dummy-to-Ground-Truth Block $\mathbf{C}_{\text{dummy}\to\text{gt}}$ ($M \times M$):**
   $$C_{N+k, j} = \begin{cases} 1.0 & \text{if } k = j \quad \text{(Private dummy node assignment cost)} \\ K_{\text{sentinel}} & \text{if } k \ne j \quad \text{(Cross-dummy assignment forbidden)} \end{cases}$$
4. **Dummy-to-Dummy Block $\mathbf{C}_{\text{dummy}\to\text{dummy}}$ ($M \times N$):**
   All entries $C_{N+j, M+i} = 0.0$ (slack matching at zero cost).

### 4.3 Standardized Evaluation Metric Conventions for Boundary Cases

| Boundary Condition | True Positives ($\text{TP}$) | False Positives ($\text{FP}$) | False Negatives ($\text{FN}$) | Defined Precision | Defined Recall | Defined $F_1$ | Documented Evaluation Convention |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **$N = 0, M > 0$**<br>*(No predictions, GT present)* | $0$ | $0$ | $M$ | **$0.0$** | **$0.0$** | **$0.0$** | Complete extractor omission; precision defined as $0.0$ rather than undefined ($0/0$). |
| **$N > 0, M = 0$**<br>*(Hallucinations on blank page)* | $0$ | $N$ | $0$ | **$0.0$** | **$0.0$** | **$0.0$** | Spurious hallucination; recall defined as $0.0$ rather than undefined ($0/0$). |
| **$N = 0, M = 0$**<br>*(Blank page, 0 predictions)* | $0$ | $0$ | $0$ | **$1.0$** | **$1.0$** | **$1.0$** | Perfect True Negative agreement; blank page correctly recognized. $\text{IoU} = 1.0$. |

---

### 4.4 Seven Verified Numerical Proofs

#### Proof 1: Low-IoU Pair Rejection ($N=1, M=1, \text{IoU}=0.35$)
- **Sentinel Calculation:** $K_{\text{sentinel}} = (1 + 1) + 10.0 = \mathbf{12.0}$.
- **Augmented Cost Matrix ($2 \times 2$):**
  $$\mathbf{C} = \begin{bmatrix} 12.0 & 1.0 \\ 1.0 & 0.0 \end{bmatrix}$$
- **Solver Permutations:**
  - Permutation A ($B_1 \to G_1, D_1^{\text{pred}} \to D_1^{\text{gt}}$): Cost $= 12.0 + 0.0 = \mathbf{12.0}$.
  - Permutation B ($B_1 \to D_1^{\text{gt}}, D_1^{\text{pred}} \to G_1$): Cost $= 1.0 + 1.0 = \mathbf{2.0}$.
- **Solver Output:** Solver selects Permutation B ($2.0 < 12.0$).
  - $B_1 \to D_1^{\text{gt}} \implies \mathbf{\text{FP} = 1}$.
  - $D_1^{\text{pred}} \to G_1 \implies \mathbf{\text{FN} = 1}$.
  - $\mathbf{\text{TP} = 0}$. Metrics: $\text{Precision} = 0.0, \text{Recall} = 0.0, F_1 = 0.0$.

#### Proof 2: Valid High-IoU Pair ($N=1, M=1, \text{IoU}=0.90, d=5\text{ pt}, \text{diag}=1000\text{ pt}$)
- **Valid Cost:** $C_{11} = (1.0 - 0.90) + 0.10 \times (5/1000) = \mathbf{0.1005}$. $K_{\text{sentinel}} = 12.0$.
- **Augmented Cost Matrix ($2 \times 2$):**
  $$\mathbf{C} = \begin{bmatrix} 0.1005 & 1.0 \\ 1.0 & 0.0 \end{bmatrix}$$
- **Solver Output:** Solver selects Permutation A ($0.1005 < 2.0$).
  - $B_1 \to G_1 \implies \mathbf{\text{TP} = 1}, \mathbf{\text{FP} = 0}, \mathbf{\text{FN} = 0}$. Metrics: $\text{Precision} = 1.0, \text{Recall} = 1.0, F_1 = 1.0$.

#### Proof 3: Duplicate Prediction Accounting ($N=2, M=1, \text{IoU}_1=0.90, \text{IoU}_2=0.75$)
- **Inputs:** $C_{11} = 0.1005$, $C_{21} = 0.2520$. $K_{\text{sentinel}} = (2 + 1) + 10.0 = \mathbf{13.0}$.
- **Augmented Cost Matrix ($3 \times 3$):**
  $$\mathbf{C} = \begin{bmatrix} 0.1005 & 1.0 & 13.0 \\ 0.2520 & 13.0 & 1.0 \\ 1.0 & 0.0 & 0.0 \end{bmatrix}$$
- **Solver Optimization:**
  - $B_1 \to G_1$ (cost $0.1005$).
  - $B_2 \to D_2^{\text{gt}}$ (cost $1.0$).
  - $D_1^{\text{pred}} \to D_1^{\text{gt}}$ (cost $0.0$).
  - Total Minimal Cost $= 0.1005 + 1.0 + 0.0 = \mathbf{1.1005}$.
- **Accounting Result:** $\mathbf{\text{TP} = 1}, \mathbf{\text{FP} = 1}, \mathbf{\text{FN} = 0}$. $\text{Precision} = 1/2 = \mathbf{0.50}, \text{Recall} = \mathbf{1.00}$. Duplicate penalized directly.

#### Proof 4: More Predictions Than Ground Truth ($N=3, M=1$)
- **Inputs:** $B_1$ ($0.15$), $B_2$ ($0.42$), $B_3$ ($\text{IoU}=0.05 \implies 14.0$). $K_{\text{sentinel}} = (3 + 1) + 10.0 = \mathbf{14.0}$.
- **Augmented Cost Matrix ($4 \times 4$):**
  $$\mathbf{C} = \begin{bmatrix} 0.15 & 1.0 & 14.0 & 14.0 \\ 0.42 & 14.0 & 1.0 & 14.0 \\ 14.0 & 14.0 & 14.0 & 1.0 \\ 1.0 & 0.0 & 0.0 & 0.0 \end{bmatrix}$$
- **Solver Optimization:** $B_1 \to G_1$ ($0.15$), $B_2 \to D_2^{\text{gt}}$ ($1.0$), $B_3 \to D_3^{\text{gt}}$ ($1.0$), $D_1^{\text{pred}} \to D_1^{\text{gt}}$ ($0.0$). Total cost $= \mathbf{2.15}$.
- **Accounting Result:** $\mathbf{\text{TP} = 1}, \mathbf{\text{FP} = 2}, \mathbf{\text{FN} = 0}$. $\text{Precision} = 1/3 = \mathbf{0.333}, \text{Recall} = \mathbf{1.000}$.

#### Proof 5: More Ground Truth Than Predictions ($N=1, M=3$)
- **Inputs:** $B_1 \to G_1$ ($0.10$); $G_2, G_3$ missed ($14.0$). $K_{\text{sentinel}} = \mathbf{14.0}$.
- **Augmented Cost Matrix ($4 \times 4$):**
  $$\mathbf{C} = \begin{bmatrix} 0.10 & 14.0 & 14.0 & 1.0 \\ 1.0 & 14.0 & 14.0 & 0.0 \\ 14.0 & 1.0 & 14.0 & 0.0 \\ 14.0 & 14.0 & 1.0 & 0.0 \end{bmatrix}$$
- **Solver Optimization:** $B_1 \to G_1$ ($0.10$), $D_1^{\text{pred}} \to D_1^{\text{gt}}$ ($0.0$), $D_2^{\text{pred}} \to G_2$ ($1.0$), $D_3^{\text{pred}} \to G_3$ ($1.0$). Total cost $= \mathbf{2.10}$.
- **Accounting Result:** $\mathbf{\text{TP} = 1}, \mathbf{\text{FP} = 0}, \mathbf{\text{FN} = 2}$. $\text{Precision} = \mathbf{1.000}, \text{Recall} = 1/3 = \mathbf{0.333}$.

#### Proof 6: Empty Prediction Set ($N=0, M=2$)
- **Inputs:** $K_{\text{sentinel}} = (0 + 2) + 10.0 = \mathbf{12.0}$. Real predictions block empty.
- **Augmented Cost Matrix ($2 \times 2$):**
  $$\mathbf{C} = \begin{bmatrix} 1.0 & 12.0 \\ 12.0 & 1.0 \end{bmatrix}$$
- **Solver Optimization:** $D_1^{\text{pred}} \to G_1$ ($1.0$), $D_2^{\text{pred}} \to G_2$ ($1.0$). Total cost $= \mathbf{2.00}$.
- **Accounting Result:** $\mathbf{\text{TP} = 0}, \mathbf{\text{FP} = 0}, \mathbf{\text{FN} = 2}$. Metrics: $\text{Precision} = 0.0, \text{Recall} = 0.0, F_1 = 0.0$.

#### Proof 7: Empty Ground Truth Set ($N=2, M=0$)
- **Inputs:** $K_{\text{sentinel}} = \mathbf{12.0}$. Real GT block empty.
- **Augmented Cost Matrix ($2 \times 2$):**
  $$\mathbf{C} = \begin{bmatrix} 1.0 & 12.0 \\ 12.0 & 1.0 \end{bmatrix}$$
- **Solver Optimization:** $B_1 \to D_1^{\text{gt}}$ ($1.0$), $B_2 \to D_2^{\text{gt}}$ ($1.0$). Total cost $= \mathbf{2.00}$.
- **Accounting Result:** $\mathbf{\text{TP} = 0}, \mathbf{\text{FP} = 2}, \mathbf{\text{FN} = 0}$. Metrics: $\text{Precision} = 0.0, \text{Recall} = 0.0, F_1 = 0.0$.

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

## 8. PostgreSQL `xid8` Context Storage & Executable Batched Cleanup Specification

### 8.1 Schema & Index Redundancy Review
`app_security.active_context` is configured in PostgreSQL 14/15/16:

```sql
CREATE UNLOGGED TABLE IF NOT EXISTS app_security.active_context (
    xact_id xid8 NOT NULL,
    backend_pid integer NOT NULL,
    org_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_role varchar(50) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '60 seconds'),
    CONSTRAINT pk_active_context PRIMARY KEY (xact_id, backend_pid)
);

-- TTL Index for time-based sweeps
CREATE INDEX IF NOT EXISTS idx_active_context_expires_at
ON app_security.active_context USING btree (expires_at);
```

#### Index Redundancy Finding:
The primary key `(xact_id, backend_pid)` creates a composite B-tree index where `xact_id` is the leading column. In PostgreSQL B-tree semantics, range scans with `WHERE xact_id < $1` can execute directly on the leading column of `pk_active_context`.
Therefore, creating a separate single-column index `idx_active_context_xact_id ON (xact_id)` is **redundant** and wastes write I/O. LedgerOne eliminates the redundant index and relies strictly on `pk_active_context` and `idx_active_context_expires_at`.

### 8.2 Executable CTE-Based Batched Deletion Query
PostgreSQL does not support direct `DELETE ... LIMIT`. The canonical, non-blocking batched deletion in PostgreSQL 14+ is:

```sql
WITH batch AS (
    SELECT xact_id, backend_pid
    FROM app_security.active_context
    WHERE xact_id < pg_snapshot_xmin(pg_current_snapshot())
    ORDER BY xact_id ASC
    LIMIT 5000
    FOR UPDATE SKIP LOCKED
)
DELETE FROM app_security.active_context a
USING batch b
WHERE a.xact_id = b.xact_id AND a.backend_pid = b.backend_pid;
```

### 8.3 Concurrency, Locking, and Active Transaction Safety
1. **`FOR UPDATE SKIP LOCKED` Semantics:**
   Locks only the rows selected for deletion in this batch. If multiple cleanup workers or background threads run concurrently, `SKIP LOCKED` ensures Worker 2 immediately skips rows currently locked by Worker 1, **completely eliminating lock waiting and deadlocks**.
2. **Transaction Isolation:** Executes under standard `READ COMMITTED` isolation.
3. **Active Transaction Safety Proof:**
   By definition of MVCC snapshots in PostgreSQL, `pg_snapshot_xmin(pg_current_snapshot())` represents the lowest transaction ID among all transactions still in-progress when the snapshot was taken. Every transaction with `xact_id < xmin` has **definitively committed or aborted** prior to the snapshot.
   No active transaction can have an `xact_id < xmin`. Therefore, the batch subquery mathematically **cannot select or delete any active transaction context**.
4. **Rollback & Retry Semantics:**
   If the batch transaction is aborted or encounters a network disruption, all row locks are automatically released and no rows are modified. The client retries using exponential backoff with jitter.
5. **Batch Progress & Observability:**
   The client executes the CTE in a loop until `rowcount == 0`. Prometheus metric `active_context_cleaned_rows_total` increments on each batch, and gauge `active_context_stale_backlog_count` tracks uncollected backlog.

---

## 9. Query Plan & Empirical Performance Acceptance Criteria

PostgreSQL utilizes a cost-based query optimizer. The optimizer selects access paths based on table size and selectivity:
- When a table is small (e.g. $< 100$ disk pages) or when deleting a high percentage of rows (e.g. $> 20\%$), a **Sequential Scan is mathematically and physically faster** than an index scan because sequential page reads avoid random I/O index block lookups.
- When a table is large (e.g. 100,000 rows) and deleting a small percentage of rows (e.g. $< 5\%$), an **Index Scan** on `pk_active_context` minimizes I/O.
- Therefore, LedgerOne eliminates the rigid "zero sequential scans" rule and replaces it with empirical latency, buffer, and throughput acceptance criteria.

### 9.1 Empirical Acceptance Testing Benchmark (`EXPLAIN (ANALYZE, BUFFERS)`)

#### Distribution Scenario A: Low Selectivity on Large Active Context
- **Dataset Setup:** 100,000 synthetic rows in `app_security.active_context`. Stale rows matching `xact_id < xmin`: 500 rows ($0.5\%$ selectivity).
- **Required Plan Shape:**
  - Optimizer selects `Index Scan` or `Bitmap Index Scan` using `pk_active_context`.
- **Performance Targets:**
  - Execution Time: $\le 5.0\text{ ms}$.
  - Buffer I/O: Shared hit blocks $\le 100$; shared read blocks $= 0$ (all cached in memory).

#### Distribution Scenario B: High Selectivity / Small Context Table
- **Dataset Setup:** 500 total rows. Stale rows matching `xact_id < xmin`: 450 rows ($90\%$ selectivity).
- **Permitted Plan Shape:**
  - Optimizer chooses `Seq Scan` (valid and optimal for reading $< 10$ memory pages).
- **Performance Targets:**
  - Execution Time: $\le 2.0\text{ ms}$.
  - Buffer I/O: Shared hit blocks $\le 10$.

#### Overall Operational Performance Standards:
1. **P99 Latency Target:** Cleanup sweep execution time must remain $\le 15.0\text{ ms}$ under all production workloads.
2. **Buffer Hit Ratio:** Must maintain $\ge 99.0\%$ shared hit ratio (unlogged memory buffering).
3. **Lock Contention Gating:** The cleanup sweep must execute with `SET LOCAL statement_timeout = '250ms'`. In high-throughput environments, deletes must be batched (`LIMIT 5000`) to prevent transaction lock queues.
4. **Cleanup Backlog Monitoring:** Expose Prometheus gauge metric:
   ```sql
   SELECT count(*) AS active_context_stale_backlog_count
   FROM app_security.active_context
   WHERE xact_id < pg_snapshot_xmin(pg_current_snapshot());
   ```
   An alert fires if `active_context_stale_backlog_count > 10,000` for more than 5 minutes.

---

## 10. Trusted Audit Ledger Insertion Contract & Hardened Threat Model

### 10.1 Direct DML Revocation & Trusted Function Interface
Direct `INSERT` access to `app_security.audit_ledger` is strictly revoked from the application role to prevent fabricated audit records:

```sql
-- DDL in app_security schema
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON app_security.audit_ledger FROM ledgerone_app;
GRANT SELECT ON app_security.audit_ledger TO ledgerone_app;

-- Dedicated trusted insertion function
CREATE OR REPLACE FUNCTION app_security.log_audit_event(
    p_document_id uuid,
    p_event_type varchar(100),
    p_previous_state varchar(50),
    p_target_state varchar(50),
    p_event_payload jsonb,
    p_correlation_id uuid DEFAULT gen_random_uuid()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_security, public
AS $$
DECLARE
    v_org_id uuid;
    v_workspace_id uuid;
    v_user_id uuid;
    v_user_role varchar(50);
    v_doc_org_id uuid;
    v_doc_ws_id uuid;
    v_current_status varchar(50);
    v_next_seq bigint;
    v_audit_id uuid;
BEGIN
    -- 1. Extract actor identity and tenant boundary strictly from cryptographically verified context
    SELECT org_id, workspace_id, user_id, user_role
    INTO v_org_id, v_workspace_id, v_user_id, v_user_role
    FROM app_security.active_context
    WHERE xact_id = pg_current_xact_id() AND backend_pid = pg_backend_pid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_001: No verified security context found in transaction' USING ERRCODE = '28000';
    END IF;

    -- 2. Verify document ownership and fetch current lifecycle state
    SELECT organization_id, workspace_id, status
    INTO v_doc_org_id, v_doc_ws_id, v_current_status
    FROM public.documents
    WHERE id = p_document_id AND is_deleted = FALSE
    FOR UPDATE;

    IF v_doc_org_id IS NULL OR v_doc_org_id != v_org_id OR v_doc_ws_id != v_workspace_id THEN
        RAISE EXCEPTION 'AUTH_002: Tenant boundary violation for document %', p_document_id USING ERRCODE = '42501';
    END IF;

    -- 3. Verify state transition integrity
    IF p_previous_state IS NOT NULL AND v_current_status != p_previous_state THEN
        RAISE EXCEPTION 'STATE_001: Document status mismatch. Expected %, actual %', p_previous_state, v_current_status USING ERRCODE = '23514';
    END IF;

    -- 4. Calculate monotonic sequence number for document audit trail
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO v_next_seq
    FROM app_security.audit_ledger
    WHERE document_id = p_document_id;

    -- 5. Insert immutable audit event
    INSERT INTO app_security.audit_ledger (
        id, event_timestamp, org_id, workspace_id, document_id,
        actor_id, actor_role, event_type, previous_state, target_state,
        event_payload, sequence_number, correlation_id
    ) VALUES (
        gen_random_uuid(), CURRENT_TIMESTAMP, v_org_id, v_workspace_id, p_document_id,
        v_user_id, v_user_role, p_event_type, p_previous_state, p_target_state,
        p_event_payload, v_next_seq, p_correlation_id
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION app_security.log_audit_event TO ledgerone_app;
```

### 10.2 Atomicity & Hardened Threat Model

| Threat Actor / Vector | Capability & Access Level | Database Mitigation / Guarantee | Residual Risk & External Defense |
| :--- | :--- | :--- | :--- |
| **Compromised App / SQLi (Event Alteration)** | Attempts `UPDATE` or `DELETE` on audit ledger. | **BLOCKED:** `REVOKE UPDATE, DELETE, TRUNCATE` and database trigger `trg_audit_ledger_immutable` reject modifications with SQLSTATE `42501`. | **Zero residual risk** within database role permissions. |
| **Compromised App / SQLi (Event Fabrication)** | Attempts direct `INSERT` with forged `actor_id` or `org_id`. | **BLOCKED:** Direct `INSERT` revoked. The `SECURITY DEFINER` function extracts actor claims strictly from verified `active_context` and validates document ownership. | **Zero residual risk** against unprivileged application code. |
| **Database Table Owner (`ledgerone_admin`)** | Holds table DDL ownership privileges. | **PARTIAL:** Can execute `ALTER TABLE ... DISABLE TRIGGER` or grant permissions if DDL privileges are accessible. | Protected via separate credential storage; restricted in production CI/CD. |
| **PostgreSQL Superuser (`postgres` / Cloud Admin)** | Unrestricted database superuser or Neon Cloud root. | **CANNOT PREVENT:** Superusers bypass all database triggers, RLS, and permissions; can truncate tables or modify heap pages. | **Defense-in-Depth:** Must stream audit logs asynchronously to external immutable WORM storage. |

---

## 11. Configurable WORM Retention Governance & CDC Reliability Architecture

### 11.1 Jurisdiction-Aware Retention Policy Contract
LedgerOne eliminates the unverified universal 7-year retention rule, replacing it with a typed, versioned retention policy:

```python
class RetentionJurisdiction(str, Enum):
    GERMANY_HGB_GOBD = "GERMANY_HGB_GOBD"       # 10 years (Handelsgesetzbuch §257, AO §147)
    FRANCE_CGI = "FRANCE_CGI"                   # 10 years (Code de commerce L123-22)
    SWITZERLAND_CO = "SWITZERLAND_CO"           # 10 years (Code of Obligations Art 958f)
    UNITED_STATES_IRS = "UNITED_STATES_IRS"     # 7 years (IRC §6001, 26 CFR 1.6001-1)
    UNITED_KINGDOM_HMRC = "UNITED_KINGDOM_HMRC" # 6 years (VAT Act 1994 s 58, Sch 11)
    AUSTRALIA_ATO = "AUSTRALIA_ATO"             # 5 years (Taxation Administration Act 1953)
    SINGAPORE_IRAS = "SINGAPORE_IRAS"           # 5 years (Goods and Services Tax Act s 87)

class RegulatoryRetentionPolicy(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    policy_id: UUID = Field(...)
    organization_id: UUID = Field(...)
    jurisdiction: RetentionJurisdiction = Field(...)
    document_classification: str = Field(description="TAX_INVOICE, COMMERCIAL_CONTRACT, TRANSIENT_LOG")
    retention_period_years: int = Field(ge=1, le=50)
    legal_hold_active: bool = Field(default=False)
    legal_hold_identifier: Optional[str] = Field(default=None)
    gdpr_data_minimization_purged: bool = Field(default=False)
    version_tag: str = Field(description="e.g. v2026.1-DE-GoBD")
    effective_from: date = Field(...)
    approved_by: UUID = Field(description="Authorized CFO or General Counsel User ID")
    approved_authority: str = Field(description="e.g. Corporate Board Audit Committee Resolution 2026-04")
```

### 11.2 Legal Holds & GDPR Reconciliation
1. **Legal Holds:** An active legal hold (`legal_hold_active = True`) freezes automated expiry. Records with active legal holds **cannot be purged or overwritten**, even if the statutory retention duration has lapsed.
2. **GDPR vs. Tax Statute Reconciliation:**
   Under GDPR Article 17(3)(b), the "Right to Erasure" does not apply to personal data processed for compliance with a legal obligation under Union or Member State law. Therefore, statutory tax accounting retention takes legal precedence during the mandatory retention window. Once the retention period lapses and no legal hold is active, non-financial PII must be purged (`gdpr_data_minimization_purged = True`).

### 11.3 Change Data Capture (CDC / Debezium) Reliability Architecture
```
+----------------------------------------------------------------------------------------------------+
|                                    CDC TO WORM PIPELINE                                            |
+----------------------------------------------------------------------------------------------------+
   PostgreSQL (Neon)                 Debezium / Kafka Connect                AWS S3 Object Lock
  [audit_ledger table] ---> (WAL) ---> [Replication Slot] ---> (Kafka) ---> [WORM Storage Bucket]
        |                                                                           |
        v                                                                           v
  (Transactional Commit)                                                   (Compliance Mode WORM)
  - Business ops continue                                                  - Non-repudiation
  - Asynchronous pipeline                                                  - Locked for N years
+----------------------------------------------------------------------------------------------------+
```

1. **Delivery Guarantee:** At-least-once delivery semantics via PostgreSQL logical decoding (Debezium `pgoutput` plugin).
2. **Strict Event Ordering:** Ordered monotonically by PostgreSQL Log Sequence Number (`pg_lsn`) and per-document `sequence_number`.
3. **Idempotent Ingestion & Deduplication:** The WORM storage consumer deduplicates payloads using the idempotency key:
   $$\text{Idempotency Key} = \text{org\_id} \mathbin{\Vert} \text{document\_id} \mathbin{\Vert} \text{sequence\_number}$$
4. **Replication Lag Decoupling:** Business operations commit transactionally to the database and **continue without blocking on CDC lag**. If the external WORM destination experiences an outage, records buffer safely in PostgreSQL WAL and Kafka brokers.
5. **Reconciliation & Auditing:** An automated daily cron executes a checksum verification comparing `SHA-256(ordered audit events in DB)` against the S3 WORM manifest to detect replication divergence.

---

## 12. Approval Segregation of Duties (SoD) Governance

Under the canonical LedgerOne RBAC model ([`Decisions.md`](file:///d:/Projects/Decisions.md) ADR-005):

1. **Can Corrector verify?** **STRICTLY NO.** $\mathbf{\text{verifier\_id} \ne \text{corrector\_id}}$.
2. **Can Corrector approve?** **STRICTLY NO.** A user who edited extracted monetary or tax values is fundamentally conflicted from approving the document for accounting export ($\mathbf{\text{approver\_id} \ne \text{corrector\_id}}$).
3. **Can Verifier approve?**
   - **Default Single-Control Mode:** Permitted if the verifier holds an authorized approval role (`REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN`) and did not perform corrections ($\text{verifier\_id} \ne \text{corrector\_id}$).
   - **Dual-Control Gating Mode (`dual_control_required = True`):** Prohibited. Three distinct actors required ($\mathbf{\text{approver\_id} \ne \text{verifier\_id} \ne \text{corrector\_id}}$).
4. **Can Workspace Administrator approve?** **YES**, provided they were not the corrector ($\text{approver\_id} \ne \text{corrector\_id}$).
5. **Can Organization Administrator approve?** **YES**, provided they were not the corrector ($\text{approver\_id} \ne \text{corrector\_id}$).
6. **Can `DOCUMENT_MANAGER` approve?** **STRICTLY NO.** Under canonical RBAC (ADR-005), `DOCUMENT_MANAGER` is restricted to document ingestion, metadata management, extraction triggering, and archiving. `DOCUMENT_MANAGER` has zero approval authority.

| Lifecycle Transition | Permitted Canonical Roles | Actor Identity Recorded | Enforced SoD Invariant | Audit Event Generated |
| :--- | :--- | :--- | :--- | :--- |
| `CORRECT_FIELDS` | `REVIEWER`, `DOCUMENT_MANAGER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `corrector_id` | Document must be in `PENDING_REVIEW` | `EVT_FIELDS_MODIFIED` |
| `SUBMIT_CORRECTIONS` | `REVIEWER`, `DOCUMENT_MANAGER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `corrector_id` | At least one field modified | `EVT_CORRECTIONS_SUBMITTED` |
| `VERIFY_CORRECTIONS` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `verifier_id` | $\mathbf{\text{verifier\_id} \ne \text{corrector\_id}}$ | `EVT_HUMAN_VERIFICATION_COMPLETE` |
| `APPROVE_DOCUMENT` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `approver_id` | $\mathbf{\text{approver\_id} \ne \text{corrector\_id}}$ | `EVT_DOCUMENT_APPROVED_FOR_EXPORT` |
| `REJECT_DOCUMENT` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `rejecter_id` | Rejection reason logged | `EVT_DOCUMENT_REJECTED` |
| `REOPEN_DOCUMENT` | `ORGANIZATION_ADMIN` strictly | `admin_id` | Document must be in `APPROVED` | `EVT_APPROVED_DOCUMENT_REOPENED` |

---

## 13. Financial Auditor Override Architecture: Configurable Threshold Policies & Expiration Disambiguation

### 13.1 Invariant Truth Inviolability
- An override **never alters mathematical invariant truth**.
- Invariant evaluation outcomes are immutable mathematical assertions: a failed invariant permanently remains `FAILED`.
- Authorized overrides create a decoupled database record `OverrideExceptionRecord`, which unlocks document-level **approval eligibility** without altering the underlying arithmetic failure ledger.

### 13.2 Configurable Threshold Policy Contract
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

### 13.3 Explicit Calculation & Boundary Rules
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

### 13.4 Disambiguation of Override Expiration Timestamps
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

## 14. Seven Executable Adversarial Security Test Specifications

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

## 15. Verified Existing Repository Facts vs. Proposed Target Architecture

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

## 16. Five-Wave Implementation Plan (Preserved)

- **Wave 1:** Core Pydantic Contracts, Rounding Policy Engine, and Invariant Evaluator (`table_contracts.py`, `rounding_policy.py`, `accounting_invariants.py`).
- **Wave 2:** Geometry & Cross-Page Table Continuation Engine (`table_geometry.py`, `multipage_table_stitcher.py`).
- **Wave 3:** Column Header Classifier & Row Segmentation Engine (`header_classifier.py`, `row_segmenter.py`, `tune_header_classifier.py`).
- **Wave 4:** Pipeline Integration & Database Persistence (`hybrid_structured_extractor.py`, `extraction_schemas.py`).
- **Wave 5:** Comprehensive Adversarial Verification, Benchmark Execution, and Evaluation Sign-off (`test_table_extraction.py`, `test_accounting_invariants.py`, `run_step4_table_benchmark.py`).

---

## 17. Planning-Only Execution Boundary Attestation & Final Readiness Declaration

### 17.1 Execution Boundary Attestation
1. **Repository Baseline Preserved:** Baseline commit remains strictly [`70410a1`](file:///d:/Projects/LedgerOne).
2. **Zero Code Changes:** No application source code (`src/`), test files (`tests/`), database schemas or migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

---

### 17.2 Final Readiness Declaration

### **READY FOR WAVE 1 AUTHORIZATION**

**Status Evaluation:** Specification v3.3.0 establishes definitive mathematical optimization closure, database type safety, empirical performance standards, threat model realism, and Segregation of Duties:
- Hungarian solver implementation contract defines finite sentinel $K_{\text{sentinel}} = (N+M) + 10.0$ preventing NaN and guaranteeing native invalid-match rejection with 7 complete numerical proofs.
- PostgreSQL-compatible CTE-based batched cleanup using `FOR UPDATE SKIP LOCKED` guarantees non-blocking concurrent GC and active transaction safety.
- Redundant B-tree index on `(xact_id)` eliminated in favor of composite primary key leading column.
- Trusted `SECURITY DEFINER` audit insertion function eliminates audit event fabrication risks by deriving actor claims directly from verified transaction context.
- Configurable jurisdiction-aware regulatory retention policy (GoBD, HGB, IRS, HMRC) and CDC reliability model formalize enterprise compliance.

All technical ambiguities have been resolved with concrete algorithms and verification criteria. Wave 1 implementation can commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
