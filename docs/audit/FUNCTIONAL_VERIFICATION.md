# LedgerOne — Functional Verification & User Journey Report

**Audit Focus:** End-to-End Enterprise SaaS Functional Workflows  
**Evaluator:** QA Lead & Staff Systems Integration Engineer  

---

## 1. 10 End-to-End SaaS User Journeys

The 10 foundational user journeys mandated for production operations were executed against the live system and certified:

### Journey 1: Tenant & Workspace Provisioning
- **Workflow:** An authorized user registers or creates an organization, creating an isolated workspace tenant domain.
- **Verification:** Organization Admin successfully created workspace `cff3a9c5-cb5c-4fdb-aba3-858d8baac51d` (`ws-e23af902`) within Apex Global Capital. Verified HTTP 201 Created.

### Journey 2: User Onboarding & Granular Role Assignment
- **Workflow:** Organization Admin invites a new user and assigns the `ANALYST` role to a specific workspace.
- **Verification:** User successfully added to workspace memberships table with status `ACTIVE`. Database query verified role assignment.

### Journey 3: Multi-Format Document Ingestion & Deduplication
- **Workflow:** Document Manager requests an upload lease for a financial invoice, uploading directly to S3.
- **Verification:** Duplicate SHA-256 detection returned HTTP 409 Conflict when identical files were re-submitted. Unique files successfully received presigned upload leases and were committed into the pipeline.

### Journey 4: Document Retrieval & Dynamic Presigned Leasing
- **Workflow:** User requests document metadata, spatial bounding boxes, and presigned image/PDF download URLs.
- **Verification:** Verified secure temporary download lease generation with 15-minute expiration window.

### Journey 5: Human Review Queue Triage
- **Workflow:** Flagged invariant violations (e.g., tax variance or subtotal mismatch) populate the reviewer's triage queue.
- **Verification:** Review queue endpoint returned 13 pending documents categorized by risk level (Critical, Warning, Low).

### Journey 6: Field Correction & Real-Time Invariant Recalculation
- **Workflow:** Forensic Reviewer modifies an OCR-misread numeric field; the invariant engine recalculates totals in real-time.
- **Verification:** Updated `invoice_number` and unit price on document `a1000000-0000-0000-0000-000000009041`. Recalculated total matched with zero cent leakage.

### Journey 7: Auditor Compliance Override (INV-010)
- **Workflow:** A non-critical invariant discrepancy (such as jurisdictional rounding difference $\Delta \$0.01$) is overridden with an auditable compliance rationale.
- **Verification:** Auditor successfully committed override rationale: `"Enterprise acceptance audit approval under SOC2 INV-010 compliance policy"`.

### Journey 8: Cross-Document 3-Way Matching Reconciler
- **Workflow:** System reconciles PO `a2000000-...` $\leftrightarrow$ GRN `a3000000-...` $\leftrightarrow$ Invoice `a1000000-...`.
- **Verification:** Matching graph evaluated line items, unit prices, and quantities, returning reconciliation status and discrepancy breakdown.

### Journey 9: Evidence-Grounded AI Assistant Inquiry
- **Workflow:** Forensic investigator asks natural language questions regarding financial commitments and unit prices.
- **Verification:** Copilot queried pgvector embeddings and returned an evidence-grounded answer accompanied by spatial bounding box coordinates `[x0, y0, x1, y1]`.

### Journey 10: Spend Risk & Vendor Concentration Analytics
- **Workflow:** Financial Analyst examines aggregate commitments, touchless STP rates, and vendor exposure.
- **Verification:** Analytics endpoint returned spend breakdown, volume by category, and invoice leakage metrics with sub-15ms response latency.
