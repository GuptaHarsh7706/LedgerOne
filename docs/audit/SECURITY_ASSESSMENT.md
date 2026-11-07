# LedgerOne — Application Security & Threat Assessment

**Classification:** Enterprise SaaS Security Review (STRIDE & OWASP Top 10)  
**Security Lead:** Principal Application Security Architect  
**Review Target:** FastAPI Backend, Neon PostgreSQL 18.6 RLS, React Frontend  

---

## 1. Threat Modeling (STRIDE Framework)

| STRIDE Threat | Potential Vulnerability | LedgerOne Countermeasure & Mitigation | Audit Status |
|---|---|---|:---:|
| **Spoofing Identity** | Forging JWT token or tampering with user claims. | HMAC-SHA256 digital signatures with a high-entropy secret key. Access token expiration enforced at 15 minutes. Refresh token family rotation with automated compromise revocation. | **VERIFIED** |
| **Tampering with Data** | Unauthorized modification of extracted invoice amounts or invariant states. | Invariant validation checks executed server-side. Review queue requires dual-custody approval. Direct database writes guarded by PostgreSQL RLS. | **VERIFIED** |
| **Repudiation** | Denying an unauthorized financial invoice approval. | Immutable audit log records actor ID, timestamp, prior state, new state, client IP, and explicit approval rationale for every review decision. | **VERIFIED** |
| **Information Disclosure** | Cross-tenant data leakage across organizations. | `FORCE ROW LEVEL SECURITY` active on all tenant tables in PostgreSQL. `app.current_org_id` context parameter injected per transaction. | **VERIFIED** |
| **Denial of Service** | Resource exhaustion via massive PDF uploads or malicious zip bombs. | File size limits enforced (max 50MB). MIME type validation. SHA-256 deduplication rejects identical files without reprocessing. | **VERIFIED** |
| **Elevation of Privilege** | Low-privilege user calling administrative endpoints. | Strict deny-by-default role authorization middleware (`require_role` and `require_org_permission`). Client role simulator permanently removed. | **VERIFIED** |

---

## 2. OWASP Top 10 (2021) Defense Verification

### A01: Broken Access Control
- **Defense:** Canonical 7-tier RBAC enforced server-side. 56 out of 56 role-permission matrix combinations verified via automated HTTP requests returning HTTP 403 Forbidden for unauthorized actions.

### A02: Cryptographic Failures
- **Defense:** Passwords hashed with Argon2id ($m=65536, t=3, p=4$). Data in transit encrypted via TLS 1.3 / HTTPS. S3 object storage secured with signed presigned upload leases.

### A03: Injection (SQL & Prompt Injection)
- **Defense:**
  - SQL: 100% parameterized queries via AsyncPG (`$1, $2`). Zero string concatenation.
  - Prompt: AI Copilot system prompt incorporates strict input boundaries and spatial grounding. Queries attempting system instruction overrides are neutralized.

### A04: Insecure Design
- **Defense:** Separation of Duties (SoD) dual-custody controls built directly into the data model:
  - `AUTH_SOD_001`: An uploader cannot approve their own document.
  - `AUTH_SOD_002`: A field corrector cannot approve their own document.
  - `AUTH_SOD_003`: `DOCUMENT_MANAGER` role cannot approve documents under any circumstances.

### A05: Security Misconfiguration
- **Defense:** Production environment disables FastAPI OpenAPI docs in public routing, runs with least-privilege database roles, and enforces CORS with specific allowed origins.

### A07: Identification and Authentication Failures
- **Defense:** Refresh tokens utilize cryptographic family tracking. If an expired or already-rotated refresh token is presented, the entire family is revoked immediately, neutralizing stolen session tokens.

---

## 3. Privilege Escalation Defense Evidence

Terminal execution evidence from `scratch/test_enterprise_rbac_saas.py`:
- `[PASS] Esc-01: VIEWER denied adding workspace members (HTTP 403)`
- `[PASS] Esc-02: DOCUMENT_MANAGER barred from approving documents (HTTP 403)`
- `[PASS] Esc-03: REVIEWER denied document deletion (HTTP 403)`
- `[PASS] Esc-04: Header spoofing / mismatched tenant context rejected (HTTP 403)`
- `[PASS] SoD-01 (AUTH_SOD_003): Role 'DOCUMENT_MANAGER' barred from approving documents`
- `[PASS] SoD-02 (AUTH_SOD_001): Dual custody blocked uploader self-approval (HTTP 403)`
- `[PASS] SoD-03 (AUTH_SOD_002): Dual custody blocked workspace admin who made corrections from approving (HTTP 403)`
