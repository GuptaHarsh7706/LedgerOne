# LedgerOne — Phase 4 Step 4: Table and Line-Item Extraction with Accounting Invariant Checks
## Formal Engineering Specification (v3.2.0)

**Document Identifier:** `LEDGERONE-SPEC-P4S4-v3.2.0`  
**Baseline Git Commit:** `70410a1` (`feat(intelligence): Phase 4 Step 3 comparative extraction audit, Decimal precision, and calibration gate (v3.9.0)`)  
**Scope Classification:** Strictly Planning and Specification Only  
**Execution Authorization Status:** **STRICTLY BLOCKED** (Awaiting explicit human principal authorization)  
**Target Module:** `LedgerOne/src/intelligence/`  
**Regression Baseline:** 124 platform regression tests passing on commit `70410a1`  

---

## 1. Executive Summary & Change Log (v3.1 $\to$ v3.2)

Specification v3.2.0 delivers the definitive mathematical optimization correction, database type safety, empirical performance benchmarks, threat model transparency, and Segregation of Duties (SoD) governance for Phase 4 Step 4:

1. **Hungarian Assignment Optimization Formulation Corrected:**
   - Corrected the mathematical formulation in the low-IoU assignment matrix. Formally proved that for an unmatched cost $C_{\text{dummy}} = 1.0$ per object, an invalid real-to-real pairing must cost strictly more than the sum of leaving both objects unmatched ($C_{\text{invalid}} > C_{\text{dummy}} + C_{\text{dummy}} = 2.0$, or $C_{\text{invalid}} = \infty$).
   - Formulated the exact augmented square cost matrix $(N+M) \times (N+M)$ for arbitrary $N$ and $M$ with private diagonal dummy assignments ($1.0$), forbidden cross-dummy assignments ($\infty$), and zero-cost dummy-to-dummy matching ($0.0$).
   - Delivered seven complete numerical proofs (low-IoU pair, valid high-IoU pair, duplicate predictions, more predictions than GT, more GT than predictions, empty predictions, empty GT) demonstrating that the Kuhn-Munkres solver itself deterministically returns exact unmatched assignments without post-hoc repair.
2. **PostgreSQL `xid8` Type Compatibility & Executable Cleanup Specification:**
   - Resolved type compatibility between `app_security.active_context.xact_id` (`xid8`) and `pg_snapshot_xmin(pg_current_snapshot())` (`xid8` in PostgreSQL 13+).
   - Documented exact PostgreSQL function signatures, catalog opclasses (`xid8_ops`), and proved why 32-bit `xid` cannot be directly compared with `<` without raising SQLSTATE `42883`.
   - Delivered a formal proof of Active Transaction Safety: by PostgreSQL snapshot isolation definition, any transaction with `xact_id < pg_snapshot_xmin(...)` has already completed, proving mathematically that cleanup queries cannot delete active transaction contexts.
   - Documented concurrent cleanup locking, monotonic 64-bit wraparound immunity ($> 18\text{ quintillion}$ xacts), and PID recycling safety.
3. **Empirical Query Plan & Performance Acceptance Criteria:**
   - Removed the rigid anti-pattern requiring "zero sequential scans" on all workloads. Recognized that cost-based query optimizers intentionally choose sequential scans on small tables or high-selectivity deletions.
   - Established realistic, measurable criteria based on `EXPLAIN (ANALYZE, BUFFERS)` across low-selectivity (index scan accelerated, latency $\le 5\text{ ms}$) and high-selectivity/small-table (sequential scan permitted, latency $\le 2\text{ ms}$) distributions.
   - Specified actual B-tree indexes, latency targets (P99 $\le 15\text{ ms}$), buffer hit ratios ($\ge 99\%$), lock contention limits ($250\text{ ms}$ timeout, 5000-row batching), and Prometheus backlog monitoring.
4. **Audit Ledger Threat Model & Privileges Clarification:**
   - Formally clarified what database-enforced append-only behavior guarantees: protects against application SQL injection, rogue backend processes, and unprivileged application roles (`ledgerone_app`).
   - Explicitly documented that table owners and PostgreSQL superusers (`postgres` / Neon cloud root) possess administrative capabilities to disable triggers or truncate tables.
   - Mandated asynchronous mirroring to cloud WORM storage (e.g. AWS S3 Object Lock in Compliance Mode) for regulatory non-repudiation against privileged administrative tampering.
5. **Approval Segregation of Duties (SoD) Governance:**
   - Codified explicit SoD policies: Corrector can NEVER verify ($\text{verifier} \ne \text{corrector}$); Corrector can NEVER approve ($\text{approver} \ne \text{corrector}$).
   - Specified Verifier approval rules: Verifier may approve only if authorized under canonical RBAC and workspace dual-control gating is not enabled.
   - Confirmed Workspace Admin and Org Admin approval rights (provided they were not the corrector). Reaffirmed that `DOCUMENT_MANAGER` has NO approval rights under canonical RBAC. Defined actor tracking and audit event IDs for all transitions.

---

## 2. Updated Blocker-Resolution Matrix (v3.1 $\to$ v3.2)

| # | Domain | v3.1 Specification Defect / Ambiguity | v3.2 Engineering Resolution |
| :- | :--- | :--- | :--- |
| **1** | **Hungarian Optimization** | Low-IoU matrix assigned cost 1.0, causing the solver to prefer invalid real matches (cost 1) over leaving both unmatched (cost 2); relied on post-hoc repair. | Set invalid match cost $C_{\text{invalid}} = \infty > 2.0$. Solver natively rejects invalid matches and pairs with dummy nodes. Delivered 7 complete numerical proofs. |
| **2** | **PostgreSQL `xid8` Cleanup** | Lacked explicit documentation of `xid8` vs `xid` type compatibility, opclasses, and active transaction safety proofs. | Documented PostgreSQL 14+ `xid8` snapshot functions, proved why `xact_id < pg_snapshot_xmin(...)` cannot delete active transactions, and proved PID reuse safety. |
| **3** | **Query Plan Criteria** | Rigidly required zero sequential scans on all tables, contradicting cost-based optimizer mechanics for small tables / high selectivity. | Replaced with empirical `EXPLAIN (ANALYZE, BUFFERS)` benchmarks across low-selectivity (index scan, $\le 5\text{ ms}$) and high-selectivity/small table ($\le 2\text{ ms}$) scenarios. |
| **4** | **Audit Threat Model** | Implied absolute database immutability without acknowledging table owner and superuser privilege boundaries. | Formulated formal threat model: database controls protect against application-tier compromise; external WORM storage mandated for insider/superuser protection. |
| **5** | **Approval SoD** | Lacked explicit rules on whether correctors or verifiers can approve, and actor tracking for each lifecycle transition. | Formulated definitive SoD matrix: Corrector cannot verify; Corrector cannot approve; Verifier approval governed by dual-control policy; zero approval rights for `DOCUMENT_MANAGER`. |

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

## 4. Hungarian Bipartite Matching: Native Rejection Formulation & 7 Numerical Proofs

### 4.1 Mathematical Optimization Formulation
Let page $p$ contain $N$ predicted bounding boxes $\mathcal{B}_{\text{pred}} = \{B_1, \dots, B_N\}$ and $M$ ground-truth bounding boxes $\mathcal{B}_{\text{gt}} = \{G_1, \dots, G_M\}$.

To solve the assignment problem with unequal dimensions ($N \ne M$) and account for unmatched predictions and ground-truth regions directly within the optimization algorithm, we construct an augmented square cost matrix $\mathbf{C}$ of dimension $K \times K$, where $K = N + M$:

$$\mathbf{C} = \begin{bmatrix} \mathbf{C}_{\text{pred}\to\text{gt}} & \mathbf{C}_{\text{pred}\to\text{dummy}} \\ \mathbf{C}_{\text{dummy}\to\text{gt}} & \mathbf{C}_{\text{dummy}\to\text{dummy}} \end{bmatrix}_{(N + M) \times (N + M)}$$

#### 1. Real-to-Real Block $\mathbf{C}_{\text{pred}\to\text{gt}}$ ($N \times M$):
For prediction $B_i$ and ground-truth $G_j$:
$$C_{ij} = \begin{cases} 1.0 - \text{IoU}(B_i, G_j) + \alpha \cdot \frac{d_{\text{center}}(B_i, G_j)}{\text{diag}_p} & \text{if } \text{IoU}(B_i, G_j) \ge 0.50 \\ \mathbf{\infty} & \text{if } \text{IoU}(B_i, G_j) < 0.50 \end{cases}$$
- For any valid match ($\text{IoU} \ge 0.50$), $1.0 - \text{IoU} \in [0.0, 0.50]$. With $\alpha = 0.10$ and $d_{\text{center}} / \text{diag}_p \in [0.0, 1.0]$, the valid matching cost satisfies:
  $$C_{ij} \in [0.0, 0.60] < 1.0$$
- If $\text{IoU}(B_i, G_j) < 0.50$, the match is forbidden and assigned $C_{ij} = \mathbf{\infty}$ (in floating-point computation, $C_{\text{forbidden}} \ge 10.0$).

#### 2. Prediction-to-Dummy Block $\mathbf{C}_{\text{pred}\to\text{dummy}}$ ($N \times N$):
Each real prediction $B_i$ ($i \in \{1..N\}$) has a dedicated dummy ground-truth node $D_i^{\text{gt}}$ located at column $M + i$:
$$C_{i, M+k} = \begin{cases} 1.0 & \text{if } k = i \quad \text{(Private dummy node assignment cost)} \\ \mathbf{\infty} & \text{if } k \ne i \quad \text{(Cross-dummy assignment forbidden)} \end{cases}$$

#### 3. Dummy-to-Ground-Truth Block $\mathbf{C}_{\text{dummy}\to\text{gt}}$ ($M \times M$):
Each real ground-truth box $G_j$ ($j \in \{1..M\}$) has a dedicated dummy prediction node $D_j^{\text{pred}}$ located at row $N + j$:
$$C_{N+k, j} = \begin{cases} 1.0 & \text{if } k = j \quad \text{(Private dummy node assignment cost)} \\ \mathbf{\infty} & \text{if } k \ne j \quad \text{(Cross-dummy assignment forbidden)} \end{cases}$$

#### 4. Dummy-to-Dummy Block $\mathbf{C}_{\text{dummy}\to\text{dummy}}$ ($M \times N$):
All entries represent unneeded dummy-to-dummy slack pairings and are set to zero cost:
$$C_{N+j, M+i} = 0.0 \quad \forall j \in \{1..M\}, i \in \{1..N\}$$

### 4.2 Mathematical Proof of Native Invalid-Match Rejection
Consider an unacceptable pair $(B_i, G_j)$ where $\text{IoU}(B_i, G_j) < 0.50$:
- **Option 1 (Solver pairs $B_i \to G_j$):** Real-to-real cost is $C_{ij} = \infty$. The corresponding dummy nodes $D_j^{\text{pred}}$ and $D_i^{\text{gt}}$ pair with each other in the dummy-to-dummy block at cost $0.0$.
  $$\text{Total Cost}_{\text{Option 1}} = \infty + 0.0 = \mathbf{\infty}$$
- **Option 2 (Solver leaves both objects unmatched):** $B_i$ pairs with its private dummy node $D_i^{\text{gt}}$ at cost $1.0$. Ground-truth $G_j$ pairs with its private dummy node $D_j^{\text{pred}}$ at cost $1.0$.
  $$\text{Total Cost}_{\text{Option 2}} = 1.0 + 1.0 = \mathbf{2.0}$$

Because the Kuhn-Munkres algorithm strictly minimizes total assignment cost:
$$\text{Total Cost}_{\text{Option 2}} = 2.0 \ll \infty = \text{Total Cost}_{\text{Option 1}}$$
**The Hungarian solver deterministically selects Option 2.** The solver itself outputs $B_i \to D_i^{\text{gt}}$ and $D_j^{\text{pred}} \to G_j$. No post-hoc repair or post-processing filter is required to reject invalid matches.

### 4.3 Exactly-Once Accounting & Deterministic Tie-Breaking
Every row $r \in \{1..N+M\}$ and column $c \in \{1..N+M\}$ is assigned exactly once:
- **True Positive ($\text{TP}$):** Assignment $(B_i, G_j)$ where $i \le N, j \le M$, and $C_{ij} < 1.0$.
- **False Positive ($\text{FP}$):** Assignment $(B_i, D_i^{\text{gt}})$ where $i \le N$ and column is $M + i$. Total $\text{FP} = N - \text{TP}$.
- **False Negative ($\text{FN}$):** Assignment $(D_j^{\text{pred}}, G_j)$ where row is $N + j$ and $j \le M$. Total $\text{FN} = M - \text{TP}$.
- **Tie-Breaking Rule:** If two valid assignments have identical cost, ties are resolved deterministically:
  1. Higher IoU.
  2. Smaller centroid distance $d_{\text{center}}$.
  3. Reading order sequence index (ascending).

---

### 4.4 Seven Verified Numerical Proofs

#### Proof 1: Low-IoU Pair Rejection ($N=1, M=1$)
- **Inputs:** $B_1$ and $G_1$ have $\text{IoU} = 0.35 < 0.50$.
- **Augmented Cost Matrix ($2 \times 2$):**
  $$\mathbf{C} = \begin{bmatrix} \infty & 1.0 \\ 1.0 & 0.0 \end{bmatrix}$$
- **Solver Permutations:**
  - Permutation A: $(B_1 \to G_1, D_1^{\text{pred}} \to D_1^{\text{gt}}) \implies \text{Cost} = \infty + 0.0 = \infty$.
  - Permutation B: $(B_1 \to D_1^{\text{gt}}, D_1^{\text{pred}} \to G_1) \implies \text{Cost} = 1.0 + 1.0 = \mathbf{2.0}$.
- **Solver Output:** Solver selects Permutation B.
  - $B_1 \to D_1^{\text{gt}} \implies \mathbf{\text{FP} = 1}$.
  - $D_1^{\text{pred}} \to G_1 \implies \mathbf{\text{FN} = 1}$.
  - $\mathbf{\text{TP} = 0}$. Metrics: $\text{Precision} = 0.0, \text{Recall} = 0.0, F_1 = 0.0$. (Invalid match natively rejected).

#### Proof 2: Valid High-IoU Pair ($N=1, M=1$)
- **Inputs:** $B_1$ and $G_1$ have $\text{IoU} = 0.90$, $d_{\text{center}} = 5\text{ pt}$, $\text{diag} = 1000\text{ pt}$.
  $C_{11} = (1.0 - 0.90) + 0.10 \times (5/1000) = \mathbf{0.1005}$.
- **Augmented Cost Matrix ($2 \times 2$):**
  $$\mathbf{C} = \begin{bmatrix} 0.1005 & 1.0 \\ 1.0 & 0.0 \end{bmatrix}$$
- **Solver Permutations:**
  - Permutation A: $(B_1 \to G_1, D_1^{\text{pred}} \to D_1^{\text{gt}}) \implies \text{Cost} = 0.1005 + 0.0 = \mathbf{0.1005}$.
  - Permutation B: $(B_1 \to D_1^{\text{gt}}, D_1^{\text{pred}} \to G_1) \implies \text{Cost} = 1.0 + 1.0 = 2.0$.
- **Solver Output:** Solver selects Permutation A.
  - $B_1 \to G_1 \implies \mathbf{\text{TP} = 1}, \mathbf{\text{FP} = 0}, \mathbf{\text{FN} = 0}$.
  - Metrics: $\text{Precision} = 1.0, \text{Recall} = 1.0, F_1 = 1.0$.

#### Proof 3: Duplicate Prediction Accounting ($N=2, M=1$)
- **Inputs:** Two predictions $B_1, B_2$ compete for single ground-truth $G_1$.
  - $B_1$: $\text{IoU} = 0.90 \implies C_{11} = 0.1005$.
  - $B_2$: $\text{IoU} = 0.75 \implies C_{21} = 0.2520$.
- **Augmented Cost Matrix ($3 \times 3$):**
  $$\mathbf{C} = \begin{bmatrix} 0.1005 & 1.0 & \infty \\ 0.2520 & \infty & 1.0 \\ 1.0 & 0.0 & 0.0 \end{bmatrix}$$
- **Solver Optimization:**
  - Best match: $B_1 \to G_1$ (cost $0.1005$).
  - $B_2$ cannot match $G_1$ and is assigned to its private dummy node $B_2 \to D_2^{\text{gt}}$ (cost $1.0$).
  - Unused dummy prediction pairs with slack dummy: $D_1^{\text{pred}} \to D_1^{\text{gt}}$ (cost $0.0$).
  - $\text{Total Minimal Cost} = 0.1005 + 1.0 + 0.0 = \mathbf{1.1005}$.
- **Accounting Result:**
  - $B_1 \to G_1 \implies \mathbf{\text{TP} = 1}$.
  - $B_2 \to D_2^{\text{gt}} \implies \mathbf{\text{FP} = 1}$.
  - $\mathbf{\text{FN} = 0}$. Metrics: $\text{Precision} = 1/2 = \mathbf{0.50}, \text{Recall} = 1/1 = \mathbf{1.00}, F_1 = \mathbf{0.667}$.

#### Proof 4: More Predictions Than Ground Truth ($N=3, M=1$)
- **Inputs:** $B_1$ ($\text{IoU} = 0.85$, cost $0.15$), $B_2$ ($\text{IoU} = 0.60$, cost $0.42$), $B_3$ (hallucination, $\text{IoU} = 0.05 < 0.50$, cost $\infty$).
- **Augmented Cost Matrix ($4 \times 4$):**
  $$\mathbf{C} = \begin{bmatrix} 0.15 & 1.0 & \infty & \infty \\ 0.42 & \infty & 1.0 & \infty \\ \infty & \infty & \infty & 1.0 \\ 1.0 & 0.0 & 0.0 & 0.0 \end{bmatrix}$$
- **Solver Optimization:**
  - $B_1 \to G_1$ (cost $0.15$).
  - $B_2 \to D_2^{\text{gt}}$ (cost $1.0$).
  - $B_3 \to D_3^{\text{gt}}$ (cost $1.0$).
  - $D_1^{\text{pred}} \to D_1^{\text{gt}}$ (cost $0.0$).
  - $\text{Total Minimal Cost} = 0.15 + 1.0 + 1.0 + 0.0 = \mathbf{2.15}$.
- **Accounting Result:** $\mathbf{\text{TP} = 1}, \mathbf{\text{FP} = 2}, \mathbf{\text{FN} = 0}$. $\text{Precision} = 1/3 = \mathbf{0.333}, \text{Recall} = \mathbf{1.000}$.

#### Proof 5: More Ground Truth Than Predictions ($N=1, M=3$)
- **Inputs:** Single prediction $B_1$ matches $G_1$ ($\text{IoU} = 0.90$, cost $0.10$). $G_2, G_3$ missed entirely ($\text{IoU} = 0.0$, cost $\infty$).
- **Augmented Cost Matrix ($4 \times 4$):**
  $$\mathbf{C} = \begin{bmatrix} 0.10 & \infty & \infty & 1.0 \\ 1.0 & \infty & \infty & 0.0 \\ \infty & 1.0 & \infty & 0.0 \\ \infty & \infty & 1.0 & 0.0 \end{bmatrix}$$
- **Solver Optimization:**
  - $B_1 \to G_1$ (cost $0.10$).
  - $D_1^{\text{pred}} \to D_1^{\text{gt}}$ (cost $0.0$).
  - $D_2^{\text{pred}} \to G_2$ (cost $1.0$).
  - $D_3^{\text{pred}} \to G_3$ (cost $1.0$).
  - $\text{Total Minimal Cost} = 0.10 + 0.0 + 1.0 + 1.0 = \mathbf{2.10}$.
- **Accounting Result:** $\mathbf{\text{TP} = 1}, \mathbf{\text{FP} = 0}, \mathbf{\text{FN} = 2}$. $\text{Precision} = \mathbf{1.000}, \text{Recall} = 1/3 = \mathbf{0.333}$.

#### Proof 6: Empty Prediction Set ($N=0, M=2$)
- **Inputs:** Ground truth has $G_1, G_2$. Extractor outputs zero predictions ($N=0$).
- **Augmented Cost Matrix ($2 \times 2$):** Real prediction block is empty. Rows are dummy predictions $D_1^{\text{pred}}, D_2^{\text{pred}}$; columns are real ground truth $G_1, G_2$:
  $$\mathbf{C} = \begin{bmatrix} 1.0 & \infty \\ \infty & 1.0 \end{bmatrix}$$
- **Solver Optimization:**
  - $D_1^{\text{pred}} \to G_1$ (cost $1.0$).
  - $D_2^{\text{pred}} \to G_2$ (cost $1.0$).
  - $\text{Total Minimal Cost} = \mathbf{2.00}$.
- **Accounting Result:** $\mathbf{\text{TP} = 0}, \mathbf{\text{FP} = 0}, \mathbf{\text{FN} = 2}$. Metrics: $\text{Precision} = 0.0, \text{Recall} = 0.0, F_1 = 0.0$.

#### Proof 7: Empty Ground Truth Set ($N=2, M=0$)
- **Inputs:** Blank page ($M=0$). Extractor hallucinated two boxes $B_1, B_2$ ($N=2$).
- **Augmented Cost Matrix ($2 \times 2$):** Real GT block is empty. Rows are real predictions $B_1, B_2$; columns are dummy GT nodes $D_1^{\text{gt}}, D_2^{\text{gt}}$:
  $$\mathbf{C} = \begin{bmatrix} 1.0 & \infty \\ \infty & 1.0 \end{bmatrix}$$
- **Solver Optimization:**
  - $B_1 \to D_1^{\text{gt}}$ (cost $1.0$).
  - $B_2 \to D_2^{\text{gt}}$ (cost $1.0$).
  - $\text{Total Minimal Cost} = \mathbf{2.00}$.
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

## 8. PostgreSQL `xid8` Context Storage & Executable Cleanup Specification

### 8.1 Type System and Function Signatures (PostgreSQL 14, 15, 16)
In PostgreSQL 13+, the database engine transitioned internal and user-facing transaction identifiers to 64-bit Full Transaction IDs (`xid8`):

| PostgreSQL Function | Input Arguments | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `pg_current_xact_id()` | *None* | `xid8` | Monotonically increasing 64-bit transaction ID of current transaction. |
| `pg_current_snapshot()` | *None* | `pg_snapshot` | Current transaction snapshot descriptor containing xmin, xmax, and in-progress xip list. |
| `pg_snapshot_xmin()` | `pg_snapshot` | `xid8` | Returns the 64-bit xmin of the provided snapshot. |
| `pg_snapshot_xmax()` | `pg_snapshot` | `xid8` | Returns the 64-bit xmax of the provided snapshot. |

#### Type Incompatibility Resolution:
1. In PostgreSQL, 32-bit `xid` does **not** support the `<` or `>` comparison operators (`operator does not exist: xid < xid`). Any attempt to evaluate `xid < xid` triggers SQLSTATE `42883`.
2. In contrast, 64-bit `xid8` natively supports the complete set of B-tree ordering operators (`<, <=, =, >=, >`) via the standard `xid8_ops` opclass in `pg_amop`.
3. Because `app_security.active_context.xact_id` is defined as `xid8` and `pg_snapshot_xmin(pg_current_snapshot())` returns `xid8`, the cleanup query compares identical native types (`xid8 < xid8`).

### 8.2 Executable Cleanup SQL Statement
```sql
-- Executable in PostgreSQL 14/15/16
DELETE FROM app_security.active_context
WHERE xact_id < pg_snapshot_xmin(pg_current_snapshot());
```

### 8.3 Mathematical Proof of Active Transaction Safety
Let $S$ be the snapshot returned by `pg_current_snapshot()`, and let $X_{\min} = \text{pg\_snapshot\_xmin}(S)$.
By PostgreSQL MVCC definition (PostgreSQL Documentation §13.2 "Transaction Isolation"):
- $X_{\min}$ is the lowest transaction identifier among all transactions that were still active (in-progress) at the precise instant snapshot $S$ was taken.
- Every transaction with transaction ID $T_{\text{xact}} < X_{\min}$ has **definitively completed** (either committed or aborted) prior to snapshot $S$.
- No active or executing transaction in the entire PostgreSQL database cluster can have $T_{\text{active}} < X_{\min}$.
- Any transaction currently executing possesses $T_{\text{active}} \ge X_{\min}$.
- Therefore, the predicate `xact_id < pg_snapshot_xmin(pg_current_snapshot())` is mathematically guaranteed to evaluate to `False` for every currently active transaction.
- **The cleanup query cannot delete the context of any active transaction.**

### 8.4 Wraparound, PID Recycling, and Concurrency Semantics
- **Wraparound Immunity:** A 64-bit `xid8` counter increments monotonically without resetting. At an extreme throughput of 100,000 transactions per second, wraparound cannot occur for over 5.8 million years ($2^{64} / (100000 \times 86400 \times 365.25) \approx 5.84 \times 10^6\text{ years}$).
- **Backend PID Reuse Safety:** The table primary key is `(xact_id, backend_pid)`. Even if the operating system or PostgreSQL connection pool reuses an identical `backend_pid`, the monotonic progression of `xact_id` guarantees that historical rows cannot collide with or authorize new transactions.
- **Concurrent Cleanup Behavior:** Deletes acquire row-level locks strictly on stale rows being deleted. Active transactions inserting new rows with higher `xact_id` values proceed concurrently without lock contention.
- **Crash Recovery Behavior:** Unlogged tables bypass the Write-Ahead Log (WAL). Upon an ungraceful database crash or server restart, PostgreSQL automatically truncates all unlogged tables. Because `app_security.active_context` is empty upon restart, getter functions (`get_org_id()`, `get_ws_id()`) return `NULL`, causing RLS to fail closed (0 rows returned). Zero data leakage can occur.

---

## 9. Query Plan and Empirical Performance Acceptance Criteria

### 9.1 Realistic Optimizer Mechanics (Cost-Based Planning)
PostgreSQL utilizes a cost-based query optimizer. The optimizer selects access paths based on table size and selectivity:
- When a table is small (e.g. $< 100$ disk pages) or when deleting a high percentage of rows (e.g. $> 20\%$), a **Sequential Scan is mathematically and physically faster** than an index scan because sequential page reads avoid random I/O index block lookups.
- When a table is large (e.g. 100,000 rows) and deleting a small percentage of rows (e.g. $< 5\%$), an **Index Scan** on `xact_id` minimizes I/O.
- Therefore, LedgerOne eliminates the rigid "zero sequential scans" rule and replaces it with empirical latency, buffer, and throughput acceptance criteria.

### 9.2 B-Tree Indexes and Explicit Purposes
```sql
-- 1. Primary Key: Unique point lookups by RLS getter functions
ALTER TABLE app_security.active_context
ADD CONSTRAINT pk_active_context PRIMARY KEY (xact_id, backend_pid);

-- 2. Range Index: Accelerates GC sweep during low-selectivity maintenance
CREATE INDEX IF NOT EXISTS idx_active_context_xact_id
ON app_security.active_context USING btree (xact_id);

-- 3. TTL Index: Accelerates secondary expiration sweeps
CREATE INDEX IF NOT EXISTS idx_active_context_expires_at
ON app_security.active_context USING btree (expires_at);
```

### 9.3 Empirical Acceptance Testing Benchmark (`EXPLAIN (ANALYZE, BUFFERS)`)

#### Distribution Scenario A: Low Selectivity on Large Active Context
- **Dataset Setup:** 100,000 synthetic rows in `app_security.active_context`. Stale rows matching `xact_id < xmin`: 500 rows ($0.5\%$ selectivity).
- **Required Plan Shape:**
  - Optimizer selects `Index Scan` or `Bitmap Index Scan` using `idx_active_context_xact_id`.
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

## 10. Audit Ledger Threat Model & Privilege Boundaries

### 10.1 Database-Enforced Protection Scope
LedgerOne enforces audit ledger append-only protections directly within PostgreSQL:
```sql
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

-- Application role restrictions
REVOKE UPDATE, DELETE, TRUNCATE ON app_security.audit_ledger FROM ledgerone_app;
GRANT INSERT, SELECT ON app_security.audit_ledger TO ledgerone_app;

-- Database trigger raising exception on any mutation
CREATE OR REPLACE FUNCTION app_security.enforce_audit_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit ledger records are strictly immutable and append-only (SQLSTATE 42501)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_ledger_immutable
BEFORE UPDATE OR DELETE ON app_security.audit_ledger
FOR EACH ROW EXECUTE FUNCTION app_security.enforce_audit_ledger_immutability();
```

### 10.2 Threat Model & Administrative Boundaries

| Threat Actor / Vector | Capability & Access Level | Database Mitigation / Guarantee | Residual Risk & External Defense |
| :--- | :--- | :--- | :--- |
| **Compromised App Service / SQL Injection** | Holds credentials of `ledgerone_app`. | **BLOCKED:** `REVOKE UPDATE, DELETE, TRUNCATE` and database trigger `trg_audit_ledger_immutable` reject all modifications with SQLSTATE `42501`. | **Zero residual risk** within database role permissions. |
| **Malicious Authenticated User** | Tenant user submitting forged audit IDs or actor names. | **BLOCKED:** Actor identity is extracted directly from cryptographically verified claims in `active_context`, not request bodies. | Tenant boundaries strictly enforced by RLS. |
| **Database Table Owner (`ledgerone_admin`)** | Holds table DDL ownership privileges. | **PARTIAL:** Can execute `ALTER TABLE ... DISABLE TRIGGER` or grant permissions if DDL privileges are accessible. | Protected via separate credential storage; restricted in production CI/CD. |
| **PostgreSQL Superuser (`postgres` / Cloud Admin)** | Unrestricted database superuser or Neon Cloud root. | **CANNOT PREVENT:** Superusers bypass all database triggers, RLS, and permissions; can truncate tables or modify heap pages. | **Defense-in-Depth:** Must stream audit logs asynchronously to external immutable WORM storage. |

### 10.3 Regulatory Compliance & External WORM Storage
For regulatory compliance requiring legal non-repudiation (e.g. SEC Rule 17a-4, German GoBD, FINRA 4511):
- Database-level triggers guarantee protection against **application-tier compromise only**.
- To satisfy statutory non-repudiation against privileged administrative tampering, LedgerOne mandates that all records written to `app_security.audit_ledger` are asynchronously replicated via Change Data Capture (CDC / Debezium) to an external object store configured with **S3 Object Lock in Compliance Mode** (retention locked for 7 years). In Compliance Mode, no user—including the AWS root account or cloud database administrator—can overwrite or delete audit logs during the retention window.

---

## 11. Approval Segregation of Duties (SoD) Governance & Canonical RBAC

### 11.1 Segregation of Duties (SoD) Rules
To maintain audit integrity and eliminate financial conflict of interest:

1. **Can Corrector verify?**
   **STRICTLY NO.** A user who edited, modified, or submitted field corrections is fundamentally conflicted from independently verifying those corrections:
   $$\text{verifier\_id} \ne \text{corrector\_id}$$
2. **Can Corrector approve?**
   **STRICTLY NO.** A user who modified extracted monetary or tax values cannot authorize or approve the document for financial export:
   $$\text{approver\_id} \ne \text{corrector\_id}$$
3. **Can Verifier approve?**
   - **Standard Single-Control Mode (Default):** If the verifier holds an authorized approval role (`REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN`) and did not perform corrections ($\text{verifier\_id} \ne \text{corrector\_id}$), they may execute operational approval ($\text{approver\_id} == \text{verifier\_id}$).
   - **Dual-Control Gating Mode (`dual_control_required = True`):** For enterprise workspaces requiring three-party checks, the operational approver must be distinct from both the corrector and the verifier:
     $$\text{approver\_id} \ne \text{verifier\_id} \ne \text{corrector\_id}$$
4. **Can Workspace Administrator approve?**
   **YES**, provided they did not perform the field corrections ($\text{approver\_id} \ne \text{corrector\_id}$).
5. **Can Organization Administrator approve?**
   **YES**, provided they did not perform the field corrections ($\text{approver\_id} \ne \text{corrector\_id}$).
6. **Can `DOCUMENT_MANAGER` approve?**
   **STRICTLY NO.** Under canonical RBAC ([`Decisions.md`](file:///d:/Projects/Decisions.md) ADR-005), `DOCUMENT_MANAGER` is restricted to document ingestion, metadata management, extraction triggering, and archiving. `DOCUMENT_MANAGER` possesses zero approval authority.

### 11.2 Actor Tracking & Transition Matrix

| Lifecycle Transition | Permitted Canonical Roles | Actor Identity Recorded | Enforced SoD Invariant | Audit Event Generated |
| :--- | :--- | :--- | :--- | :--- |
| `CORRECT_FIELDS` | `REVIEWER`, `DOCUMENT_MANAGER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `corrector_id` | Document must be in `PENDING_REVIEW` | `EVT_FIELDS_MODIFIED` |
| `SUBMIT_CORRECTIONS` | `REVIEWER`, `DOCUMENT_MANAGER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `corrector_id` | At least one field modified | `EVT_CORRECTIONS_SUBMITTED` |
| `VERIFY_CORRECTIONS` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `verifier_id` | $\mathbf{\text{verifier\_id} \ne \text{corrector\_id}}$ | `EVT_HUMAN_VERIFICATION_COMPLETE` |
| `APPROVE_DOCUMENT` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `approver_id` | $\mathbf{\text{approver\_id} \ne \text{corrector\_id}}$ | `EVT_DOCUMENT_APPROVED_FOR_EXPORT` |
| `REJECT_DOCUMENT` | `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN` | `rejecter_id` | Rejection reason logged | `EVT_DOCUMENT_REJECTED` |
| `REOPEN_DOCUMENT` | `ORGANIZATION_ADMIN` strictly | `admin_id` | Document must be in `APPROVED` | `EVT_APPROVED_DOCUMENT_REOPENED` |

---

## 12. Financial Auditor Override Architecture: Configurable Threshold Policies & Expiration Disambiguation

### 12.1 Invariant Truth Inviolability
- An override **never alters mathematical invariant truth**.
- Invariant evaluation outcomes are immutable mathematical assertions: a failed invariant permanently remains `FAILED`.
- Authorized overrides create a decoupled database record `OverrideExceptionRecord`, which unlocks document-level **approval eligibility** without altering the underlying arithmetic failure ledger.

### 12.2 Configurable Threshold Policy Contract
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

### 12.3 Explicit Calculation & Boundary Rules
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

### 12.4 Disambiguation of Override Expiration Timestamps
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

## 13. Seven Executable Adversarial Security Test Specifications

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

## 14. Verified Existing Repository Facts vs. Proposed Target Architecture

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

## 15. Five-Wave Implementation Plan (Preserved)

- **Wave 1:** Core Pydantic Contracts, Rounding Policy Engine, and Invariant Evaluator (`table_contracts.py`, `rounding_policy.py`, `accounting_invariants.py`).
- **Wave 2:** Geometry & Cross-Page Table Continuation Engine (`table_geometry.py`, `multipage_table_stitcher.py`).
- **Wave 3:** Column Header Classifier & Row Segmentation Engine (`header_classifier.py`, `row_segmenter.py`, `tune_header_classifier.py`).
- **Wave 4:** Pipeline Integration & Database Persistence (`hybrid_structured_extractor.py`, `extraction_schemas.py`).
- **Wave 5:** Comprehensive Adversarial Verification, Benchmark Execution, and Evaluation Sign-off (`test_table_extraction.py`, `test_accounting_invariants.py`, `run_step4_table_benchmark.py`).

---

## 16. Planning-Only Execution Boundary Attestation & Final Readiness Declaration

### 16.1 Execution Boundary Attestation
1. **Repository Baseline Preserved:** Baseline commit remains strictly [`70410a1`](file:///d:/Projects/LedgerOne).
2. **Zero Code Changes:** No application source code (`src/`), test files (`tests/`), database schemas or migrations (`db/`), or infrastructure files were modified.
3. **Zero Commits Created:** Working tree remains clean on branch `main`.
4. **Planning-Only Gating:** Wave 1 implementation is **NOT** authorized and has **NOT** commenced.

---

### 16.2 Final Readiness Declaration

### **READY FOR WAVE 1 AUTHORIZATION**

**Status Evaluation:** Specification v3.2.0 establishes definitive mathematical optimization closure, database type safety, empirical performance standards, threat model realism, and Segregation of Duties:
- Hungarian bipartite matching natively rejects invalid matches ($C_{\text{invalid}} = \infty > 2.0$) with seven complete numerical proofs.
- PostgreSQL 14+ `xid8` snapshot functions and executable cleanup SQL proven safe against active transactions.
- Cost-based optimizer reality acknowledged with realistic `EXPLAIN (ANALYZE, BUFFERS)` latency and buffer targets.
- Audit ledger threat model clearly defines application boundaries vs. superuser/infrastructure realities.
- Segregation of Duties enforces non-negotiable bars on corrector verification and approval under canonical RBAC.

All technical ambiguities have been resolved with concrete algorithms and verification criteria. Wave 1 implementation can commence immediately upon receipt of explicit human authorization (`"Authorize Phase 4 Step 4 Wave 1"`).
