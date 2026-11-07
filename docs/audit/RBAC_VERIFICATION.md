# LedgerOne — RBAC & Separation of Duties Verification Report

**Standard:** NIST SP 800-88 / SOC2 Dual-Custody Standard  
**Evaluator:** Principal Adversarial Integrity Verifier  
**Target:** 7-Tier Canonical Role Matrix & SoD Dual Custody  

---

## 1. Canonical RBAC Matrix Execution Results

The automated acceptance test suite `scratch/test_enterprise_rbac_saas.py` evaluated 8 representative high-value API endpoints across all 7 canonical enterprise roles. 

### Execution Summary Table

| Endpoint & Action | Permitted Roles | Blocked Roles (HTTP 403) | Verification Result |
|---|---|---|:---:|
| **`POST .../documents/upload-intent`** (DOC_UPLOAD) | `PLATFORM_ADMIN`, `ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN`, `DOCUMENT_MANAGER` | `REVIEWER`, `ANALYST`, `VIEWER` | **PASS (7/7)** |
| **`DELETE .../documents/{id}`** (DOC_DELETE) | `PLATFORM_ADMIN`, `ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN` | `DOCUMENT_MANAGER`, `REVIEWER`, `ANALYST`, `VIEWER` | **PASS (7/7)** |
| **`GET .../review-queue`** (REVIEW_READ) | `PLATFORM_ADMIN`, `ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN`, `DOCUMENT_MANAGER`, `REVIEWER`, `ANALYST` | `VIEWER` | **PASS (7/7)** |
| **`POST .../review/correct-field`** (REVIEW_CORRECT) | `PLATFORM_ADMIN`, `ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN`, `REVIEWER` | `DOCUMENT_MANAGER`, `ANALYST`, `VIEWER` | **PASS (7/7)** |
| **`POST .../review/override-invariant`** (REVIEW_OVERRIDE) | `PLATFORM_ADMIN`, `ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN`, `REVIEWER` | `DOCUMENT_MANAGER`, `ANALYST`, `VIEWER` | **PASS (7/7)** |
| **`POST .../assistant/sessions`** (ASSISTANT_USE) | `PLATFORM_ADMIN`, `ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN`, `DOCUMENT_MANAGER`, `REVIEWER`, `ANALYST` | `VIEWER` | **PASS (7/7)** |
| **`GET .../cross-document/analytics`** (ANALYTICS_READ) | `PLATFORM_ADMIN`, `ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN`, `DOCUMENT_MANAGER`, `ANALYST` | `REVIEWER`, `VIEWER` | **PASS (7/7)** |
| **`POST .../cross-document/match-3way/{id}`** (MATCHING_CREATE) | `PLATFORM_ADMIN`, `ORGANIZATION_ADMIN`, `WORKSPACE_ADMIN`, `DOCUMENT_MANAGER` | `REVIEWER`, `ANALYST`, `VIEWER` | **PASS (7/7)** |

**Total Matrix Checks:** 56 / 56 Passed with 100% precision.

---

## 2. Separation of Duties (SoD) Dual-Custody Verification

Segregation of Duties rules prevent fraudulent or accidental invoice approvals through automated dual-custody barriers:

### Barrier 1: Uploader Self-Approval Block (`AUTH_SOD_001`)
- **Rule:** A user who uploaded a document cannot be the one who approves it for ERP writeback.
- **Test:** Workspace Admin uploaded document `db21646b-ada6-40a9-bd72-5c59e085ab10` and immediately attempted to call `POST .../review/approve`.
- **Result:** Server rejected request with `HTTP 403 Forbidden` (`Segregation of Duties violation: The user who uploaded this document cannot approve it (AUTH_SOD_001)`). **PASS**.

### Barrier 2: Corrector Self-Approval Block (`AUTH_SOD_002`)
- **Rule:** A reviewer or admin who made a manual field correction cannot approve that document.
- **Test:** Senior Reviewer modified invoice subtotal via `POST .../review/correct-field` and subsequently called `POST .../review/approve`.
- **Result:** Server rejected request with `HTTP 403 Forbidden` (`Segregation of Duties violation: The reviewer who performed field corrections cannot approve it (AUTH_SOD_002)`). A secondary custodian is required. **PASS**.

### Barrier 3: Document Manager Approval Barrier (`AUTH_SOD_003`)
- **Rule:** The `DOCUMENT_MANAGER` role cannot approve documents under any circumstances.
- **Test:** Document Manager attempted to call `POST .../review/approve`.
- **Result:** Server rejected request with `HTTP 403 Forbidden` (`Action denied: Role 'DOCUMENT_MANAGER' lacks required permission 'review.approve'`). **PASS**.

---

## 3. Cross-Tenant Isolation Across Organizations

- **Tenant A:** Apex Global Capital (`6c885eec-bed8-4060-8215-a50eb442bf5d`)
- **Tenant B:** Meridian Dynamics (`e3444aab-3186-48b9-a91a-73bf3326d07f`)

### Test Results
1. **Header Spoofing:** Tenant B user sending `X-Organization-ID: 6c885eec...` (Tenant A) -> Server rejected with `HTTP 403 Forbidden` (`User is not an active member of the requested organization`). **PASS**.
2. **Cross-Tenant Document Read:** Tenant B user requesting document `a1000000-0000-0000-0000-000000009041` (owned by Tenant A) -> Database RLS returned 0 rows, resulting in `HTTP 403 Forbidden`. **PASS**.
3. **Cross-Tenant Review Queue:** Tenant B user attempting to access Tenant A review queue -> Server returned `HTTP 403 Forbidden`. **PASS**.
4. **Cross-Tenant Spend Analytics:** Tenant B user attempting to access Tenant A spend analytics -> Server returned `HTTP 403 Forbidden`. **PASS**.
