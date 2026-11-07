# LedgerOne v3.2.0 — Independent Security Verification

**Security Authority:** Application Security Engineer, Database Security Architect  
**Verification Date:** November 7, 2026  
**Scope:** Authentication, Session Lifecycles, RBAC, PostgreSQL Row-Level Security, Separation of Duties (SoD), Persona Account Posture  
**Evaluation Standard:** OWASP Top 10, SOC2 Type II Trust Principles, Defense-in-Depth Multi-Tenancy  
**Verdict:** **SECURITY APPROVED WITH DOCUMENTED OPERATIONAL SAFEGUARDS**

---

## 1. Authentication and Session Security

### 1.1 Password Hashing & Verification
- **Algorithm:** Argon2id (`argon2-cffi`) configured with memory cost $65536\text{ KiB}$, time cost $3$, parallelism $4$.
- **Legacy Verification:** Verified backward-compatibility check for legacy Bcrypt hashes (`$2b$`) with automatic upgrade flag.
- **Negative Tests Executed:**
  - Empty password string $\to$ Rejected (`HTTP 422`).
  - Password mismatch $\to$ Rejected (`HTTP 401 Unauthorized`).
  - Non-existent user query $\to$ Rejected (`HTTP 401 Unauthorized` with generic "Invalid email or password", preventing user enumeration).

### 1.2 JWT Access Tokens
- **Algorithm Restriction:** Explicitly locked to `HS256` in `decode_access_token` (`algorithms=[settings.JWT_ALGORITHM]`). Tokens with `alg: "none"` or mismatched symmetric/asymmetric headers are rejected.
- **Entropy & Unique ID:** Every issued token embeds a cryptographically unique `jti: str(uuid.uuid4())`, preventing replay.
- **Expiration:** Configured for 15 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES = 15`). Tampered signatures and expired timestamps are intercepted by `jwt.InvalidTokenError` and `jwt.ExpiredSignatureError`.
- **Finding (Documented Limitation):** JWT claims currently omit explicit `iss` (issuer) and `aud` (audience) constraints. In single-issuer environments this does not permit unauthorized cross-app elevation, but adding explicit audience validation is recommended for multi-service environments.

### 1.3 Refresh Token Family Rotation & Replay Detection
- **Token Generation:** 32-byte cryptographically secure random token (`secrets.token_urlsafe(32)`), yielding 256 bits of entropy.
- **Storage:** Only the SHA-256 digest (`hash_token(plain_refresh_token)`) is stored in the database (`refresh_tokens.token_hash`). Plaintext tokens are never persisted.
- **Rotation Mechanics:**
  - Each token pair is issued within a monotonic `family_id`.
  - When rotating ($V_1 \to V_2$), $V_1$ is flagged `is_revoked = TRUE` with `revoked_at = NOW()`.
  - **Replay Attack Defense:** When an attacker attempts to replay a consumed token ($V_1$), the system detects `is_revoked == TRUE`, logs a `SECURITY ALERT`, and executes an immediate family revocation (`UPDATE refresh_tokens SET is_revoked = TRUE WHERE family_id = $1`).
  - **Live Verification Result:** Live execution of `scratch/test_auth_tokens_adversarial.py` confirmed that replaying $V_1$ blocked the attacker and immediately rendered the legitimate user's $V_2$ token invalid.

---

## 2. Canonical RBAC Architecture

### 2.1 Canonical 6 Roles & Scopes
The platform architecture implements 6 canonical roles + 1 delegated workspace extension:
1. `PLATFORM_ADMIN`: Superuser across all system services.
2. `ORGANIZATION_ADMIN`: Organization-wide governance, workspace management, user administration.
3. `WORKSPACE_ADMIN`: Delegated workspace-scoped administrator (cannot alter organization billing or platform parameters).
4. `DOCUMENT_MANAGER`: Ingestion, document upload, OCR management (strictly barred from approvals under `AUTH_SOD_003`).
5. `REVIEWER`: Human-in-the-loop review, field corrections, and compliance overrides (`review.override` under INV-010).
6. `ANALYST`: Read-only financial analytics, spend commitments, and audit reports.
7. `VIEWER`: Restricted read-only browsing of document summaries; barred from uploads, approvals, and AI conversations.

### 2.2 Auditor Persona Resolution
- **Investigation:** Prior documentation mentioned an "Auditor" role.
- **Independent Finding:** In the database and Python backend (`src/auth/permissions.py`), there is **NO** role enum named `AUDITOR`.
- **Resolution:** The "Auditor" is a **persona title** (e.g. Dr. Rachel Sterling, Lead Forensic Reviewer & Auditor) mapped to the canonical `REVIEWER` role. The capability to execute an "auditor override" is a business operation governed by permission `review.override` (defined under INV-010 and restricted to `REVIEWER`, `WORKSPACE_ADMIN`, `ORGANIZATION_ADMIN`, `PLATFORM_ADMIN`).

### 2.3 Role-Permission Enforcement Matrix (Live Test Results)
Tested live via `scratch/test_enterprise_rbac_saas.py` against running FastAPI endpoints:

| Operation | Required Permission | PLATFORM_ADMIN | ORG_ADMIN | WS_ADMIN | DOC_MANAGER | REVIEWER | ANALYST | VIEWER |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Document Upload** | `documents.upload` | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) |
| **Document Deletion** | `documents.delete` | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) | DENY (403) |
| **Review Queue Read** | `review.read` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) |
| **Field Correction** | `review.correct` | ALLOW | ALLOW | ALLOW | DENY (403) | ALLOW | DENY (403) | DENY (403) |
| **Invariant Override** | `review.override` | ALLOW | ALLOW | ALLOW | DENY (403) | ALLOW | DENY (403) | DENY (403) |
| **AI Assistant Session** | `assistant.use` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) |
| **Spend Analytics Read** | `analytics.read` | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) | ALLOW | DENY (403) |
| **3-Way Matching Run** | `matching.create` | ALLOW | ALLOW | ALLOW | ALLOW | DENY (403) | DENY (403) | DENY (403) |

- **Total Combinations Tested:** 56
- **Test Pass Rate:** 56/56 (100.0%)
- **Unauthorized False Allows:** 0
- **Authorized False Denies:** 0

---

## 3. PostgreSQL Row-Level Security (RLS) Inspection

### 3.1 Catalog & Table Status
Direct catalog inspection executed via `scratch/audit_database_rls.py` on Neon PG 18.6 Cloud:

| Table Name | RLS Enabled | FORCE RLS | Table Owner | Policy Count |
|---|:---:|:---:|---|:---:|
| `organizations` | **True** | **True** | `neondb_owner` | 2 |
| `workspaces` | **True** | **True** | `neondb_owner` | 4 |
| `workspace_memberships` | **True** | **True** | `neondb_owner` | 4 |
| `organization_memberships` | **True** | **True** | `neondb_owner` | 4 |
| `users` | **True** | **True** | `neondb_owner` | 4 |
| `documents` | **True** | **True** | `neondb_owner` | 4 |
| `extracted_fields` | **True** | **True** | `neondb_owner` | 4 |
| `document_chunks` | **True** | **True** | `neondb_owner` | 4 |
| `document_discrepancies` | **True** | **True** | `neondb_owner` | 4 |
| `document_relationships` | **True** | **True** | `neondb_owner` | 4 |
| `document_jobs` | **True** | **True** | `neondb_owner` | 4 |
| `conversation_sessions` | **True** | **True** | `neondb_owner` | 4 |
| `conversation_messages` | **True** | **True** | `neondb_owner` | 4 |
| `audit_logs` | **True** | **True** | `neondb_owner` | 2 |
| `refresh_tokens` | **True** | **True** | `neondb_owner` | 1 |
| *`ledger_transactions` (Legacy)* | False | False | `neondb_owner` | 0 |

### 3.2 Database Roles & Connection Security
1. **Catalog Roles:**
   - `neondb_owner`: Table owner, `rolsuper: False`, `rolbypassrls: True`.
   - `ledgerone_app`: Application execution role, `rolsuper: False`, `rolbypassrls: False`.
2. **Transaction Isolation Pattern:**
   In `src/db/session.py` and `src/db/rls.py`:
   - Connections checkout as `neondb_owner`.
   - Before executing tenant queries, the connection opens a transaction: `async with conn.transaction():`.
   - The connection executes `SET LOCAL ROLE ledgerone_app` (switching to unprivileged role where `rolbypassrls == False`).
   - Tenant variables are set with `is_local=true`: `SELECT set_config('app.current_org_id', $1, true)`.
   - Upon `COMMIT` or `ROLLBACK`, PostgreSQL automatically reverts the role back to `neondb_owner` and clears all `app.*` settings.
3. **Direct Pool Isolation Evidence:**
   Executed in `scratch/test_rls_isolation_direct.py`:
   - Connection reused across Tenant A and Tenant B transactions.
   - Out-of-transaction check proved `app.current_org_id` was completely empty (`''`) and user reverted to `neondb_owner`. Zero cross-tenant leakage on pooled connections.

### 3.3 Direct Cross-Tenant Penetration Tests
Executed live against the PostgreSQL database in `scratch/test_cross_tenant_doc.py`:
1. **Cross-Tenant SELECT:** Tenant A executing `SELECT * FROM documents WHERE id = <tenant_b_doc_id>` returned `None`.
2. **Cross-Tenant UPDATE:** Tenant A executing `UPDATE documents SET filename = 'hacked.pdf' WHERE id = <tenant_b_doc_id>` affected `0` rows (`UPDATE 0`).
3. **Cross-Tenant INSERT:** Tenant A attempting to insert a document with `organization_id = <org_b_id>` failed immediately with:
   `InsufficientPrivilegeError: new row violates row-level security policy for table "documents"`.

---

## 4. Separation of Duties (SoD) & Dual Custody

### 4.1 Segregation of Duties Rules
1. **`AUTH_SOD_001` (Uploader Self-Approval Barrier):** The user who uploaded an invoice cannot approve it. Tested live: Workspace Admin uploaded invoice `4eff3b5a-...` and attempted self-approval $\to$ Blocked with `HTTP 403 Forbidden`.
2. **`AUTH_SOD_002` (Corrector Self-Approval Barrier):** A reviewer or administrator who manually edited or corrected extracted fields cannot approve the document. Tested live: Workspace Admin corrected subtotal and attempted approval $\to$ Blocked with `HTTP 403 Forbidden` (`AUTH_SOD_002`).
3. **`AUTH_SOD_003` (Document Manager Approval Barrier):** Role `DOCUMENT_MANAGER` is strictly barred from invoice approval under canonical RBAC. Tested live $\to$ Blocked with `HTTP 403 Forbidden`.

### 4.2 Cryptographic Dual Custody Technical Review
- **Claim:** "Cryptographic dual custody".
- **Technical Analysis:** The dual-custody enforcement is an **application-level state machine with cryptographic identity and audit hash binding**. It verifies that two distinct authenticated identities (uploader/corrector vs approver) hold required permissions and are mutually disjoint in the transaction history.
- **Clarification:** The system does NOT employ multi-party threshold cryptography (such as multi-signature BLS or Schnorr threshold schemes) where mathematical signature shares combine to produce a cryptographic proof. The documentation is updated to reflect this accurate engineering description.

---

## 5. Pre-Provisioned Enterprise Personas

### 5.1 Persona Inventory & Isolation
Eight personas are maintained for testing and demonstration across two organizations:
- **Apex Global Capital (Tenant A):** `ws_admin`, `reviewer`, `doc_manager`, `analyst`, `viewer`, `org_admin`, `platform_admin`.
- **Meridian Dynamics (Tenant B):** `meridian_auditor`.

### 5.2 Remediated Security Vulnerabilities
1. **Offline Mock Authentication Leak:**
   - *Previous state:* `AuthContext.tsx` contained a catch block that fabricated a mock `UserProfile` (`id: usr-${preset.key}`) if login failed.
   - *Remediation:* Removed the fake fallback. Authentication failures now throw `AuthenticationError` and reject unauthenticated sessions cleanly.
2. **Form Pre-fill Hardening:**
   - *Previous state:* `LoginPage.tsx` pre-populated email and master password in the form inputs.
   - *Remediation:* Form inputs now initialize empty (`''`), and default password labels were replaced with corporate SSO/password guidance.
3. **Production Isolation Recommendation:**
   - In live multi-tenant production deployments, demonstration persona cards must be gated behind an explicit feature flag (`VITE_ENABLE_DEMO_PERSONAS === 'true'`).
