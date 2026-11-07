# LedgerOne v3.2.0 — Remediation Changelog & Technical Defect Ledger

**Remediation Authority:** Principal Software Architect, Staff Full-Stack Engineer, Application Security Engineer  
**Audit Target:** LedgerOne v3.2.0 Release Candidate  
**Date:** November 7, 2026  
**Scope:** Remediation of Genuine Defects Discovered During Independent Verification  

---

## 1. Summary of Discovered & Remediated Defects

| Defect ID | Severity | Component | Issue Description | Remediation Implemented | Verification Evidence |
|:---:|:---:|---|---|---|:---:|
| **DEF-001** | **High** | AI Copilot (`assistant.py`) | Stopword overlap caused assistant to claim grounding on unrelated questions (e.g. French onion soup). | Added `ENGLISH_STOPWORDS` filter; required content-token overlap or dense score $\ge 0.50$; removed blind 2-line chunk acceptance. | `scratch/test_ai_adversarial.py` $\to$ 100% Pass; `pytest test_retrieval_and_assistant.py` $\to$ 100% Pass |
| **DEF-002** | **High** | Frontend Auth (`AuthContext.tsx`) | Catch block in `switchPersona` fabricated a mock `UserProfile` (`id: usr-${key}`) if login failed. | Removed mock fallback object. Throws `AuthenticationError` cleanly to ensure fail-closed authentication. | `scratch/verify_browser_rbac.py` $\to$ 100% Pass; `npm run build` $\to$ Clean |
| **DEF-003** | **Medium** | Login Portal (`LoginPage.tsx`) | Form inputs pre-filled email and master password with "Default: LedgerOne@2026!" label. | Initialized form inputs to empty strings; replaced default password text with corporate SSO guidance. | Playwright screenshot `10_login_portal.png` verified |
| **DEF-004** | **Medium** | Landing Page CTAs (`FloatingNavbar.tsx`, `HeroSection.tsx`) | Landing page CTAs routed directly into `/workspace` without authentication. | Updated CTAs to route to `/login`; added route protection redirect in `AppShell.tsx`. | `scratch/test_launch_buttons.py` $\to$ 100% Pass |

---

## 2. Detailed Technical Root Cause Analyses

### 2.1 DEF-001: AI Copilot Stopword Hallucination
- **Root Cause:** In `LedgerOne/src/intelligence/assistant.py`, `query_tokens` was extracted via `[w for w in re.findall(r"\w+", query_lower) if len(w) > 2]`. This kept common English stopwords like "what", "the", and "for". When an irrelevant query was submitted ("What is the secret recipe for French onion soup?"), the token "for" matched prepositions in arbitrary invoice text. Furthermore, line 153 contained `or len(lines) <= 2`, which unconditionally accepted any 1-2 line chunk regardless of keyword relevance.
- **Affected File:** `LedgerOne/src/intelligence/assistant.py`.
- **Correction Applied:**
  1. Defined `ENGLISH_STOPWORDS` containing 140+ common prepositions, articles, and pronouns.
  2. Extracted `content_tokens = [w for w in all_tokens if w not in ENGLISH_STOPWORDS and len(w) > 2]`.
  3. Filtered `matching_chunks` and candidate lines to strictly require meaningful content-token overlap or high dense cosine similarity ($\ge 0.50$).
  4. Only allowed top-chunk fallback when dense cosine similarity is $\ge 0.55$.
- **Regression Test:** Added `scratch/test_ai_adversarial.py` (Tests 1–4) and verified with `pytest tests/test_retrieval_and_assistant.py`.

### 2.2 DEF-002: Offline Authentication Simulation Fallback
- **Root Cause:** In `LedgerOne/frontend/src/context/AuthContext.tsx`, `switchPersona` contained a `catch (err)` block that created a synthetic `UserProfile` (`id: usr-${preset.key}`) and dispatched a local login event. If the backend was unreachable or returned an authentication error, the UI fabricated an unauthenticated mock session.
- **Affected File:** `LedgerOne/frontend/src/context/AuthContext.tsx`.
- **Correction Applied:** Removed the synthetic mock profile fallback. When authentication fails, the error is re-thrown and surfaced to the UI error banner, guaranteeing fail-closed authentication.
- **Regression Test:** `scratch/verify_browser_rbac.py` and `scratch/test_launch_buttons.py`.

### 2.3 DEF-003: Login Form Credential Pre-population
- **Root Cause:** `LoginPage.tsx` initialized state with `useState('ws_admin@apexcapital.internal')` and `useState('LedgerOne@2026!')`, exposing test passwords directly in the DOM.
- **Affected File:** `LedgerOne/frontend/src/features/auth/LoginPage.tsx`.
- **Correction Applied:** Initialized inputs to `''`; removed hardcoded password hints from form labels.
- **Regression Test:** Visual verification via Playwright screenshot `10_login_portal.png`.

### 2.4 DEF-004: Landing Page Direct Workspace Access
- **Root Cause:** Landing page CTAs ("Launch Core", "Launch Enterprise Workspace") navigated directly to `/workspace` instead of `/login`.
- **Affected Files:** `FloatingNavbar.tsx`, `HeroSection.tsx`, `PlatformCTASection.tsx`, `AppShell.tsx`.
- **Correction Applied:** Updated CTA navigation routes to `/login`; added route protection guard in `AppShell.tsx` to automatically redirect unauthenticated visitors to `/login`.
- **Regression Test:** `scratch/test_launch_buttons.py`.

---

## 3. Outstanding Documented Issues & Action Items

| Issue ID | Severity | Scope | Finding Description | Recommended Action |
|:---:|:---:|---|---|---|
| **GAP-001** | **Moderate** | DevOps | Missing containerization definitions (`Dockerfile`, `docker-compose.yml`, Kubernetes manifests). | Author multi-stage container build definitions for backend and frontend prior to cloud cluster deployment. |
| **GAP-002** | **Low** | Security | JWT access tokens lack explicit `iss` (issuer) and `aud` (audience) claims. | Add `iss: "ledgerone.internal"` and `aud: "ledgerone-api"` to token issuance and verification options. |
| **GAP-003** | **Low** | Git Governance | Release tag `v3.2.0-RELEASE` was not tagged in the Git repository. | Execute `git tag v3.2.0-RELEASE` once authorized by release stakeholders. |
| **GAP-004** | **Low** | Architecture | Local GPU model inference uses cloud Neon PG and S3 storage; not 100% air-gapped. | Update product documentation to accurately describe as "Local Model Serving with Cloud Multi-Tenant Persistence". |
