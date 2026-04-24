# Noverta External Cutover Runbook

**Status:** OPEN — required reading before NEXT-8 (legacy shim retirement).
**Last updated:** 2026-04-24.
**Scope:** out-of-repo work that must complete before Trellis-named legacy shims can be safely removed from the codebase. NEXT-1 … NEXT-7 (all in-repo rename preparation) are complete; this runbook covers everything that lives outside the repo.

---

## 0. How to use this runbook

1. Work the sections in the order listed in §1 (External Cutover Checklist). Each step is independent unless marked otherwise; some can run in parallel (e.g. DNS + Resend domain verification).
2. For every env var change, record:
   - the exact value set,
   - the timestamp,
   - the operator who set it,
   - the verification evidence (curl output, screenshot, or signed-in session).
3. Do NOT begin NEXT-8 (in-repo legacy shim removal) until every checkbox in §5 (NEXT-8 Readiness Gate) is satisfied with concrete evidence.
4. If any cutover step fails, follow the matching rollback in §4 immediately. The runbook is designed so each step is independently revertible.

---

## 1. External Cutover Checklist

### 1.1 DNS / Domain registration
- [ ] **Confirm `noverta.education` apex + `www` are registered and DNS-resolving** to the production hosting target (Replit deployment, Vercel, etc.).
  - `dig noverta.education A` returns the production IP set.
  - `dig www.noverta.education CNAME` returns the production target.
- [ ] **Subdomain provisioning:**
  - `noreply.noverta.education` (Resend sender domain — see 1.2).
  - Any `app.noverta.education` / `api.noverta.education` if the production topology splits them (current single-origin deployment does not).
- [ ] **TLS certificate** issued and serving for the apex + every subdomain (Replit/Vercel/CDN handles this automatically once DNS resolves).
  - `curl -sIv https://noverta.education/ 2>&1 | grep -i 'subject\|issuer'` returns a valid cert.
- [ ] **Marketing site** (if separate from the app) deployed at `https://noverta.education/` with at minimum a working `/demo` request page (because `VITE_DEMO_REQUEST_URL` will point there — see 2.5).
- [ ] **Decision recorded:** whether the legacy `trellis.education` and `usetrellis.co` domains will be 301-redirected to the Noverta domain, kept as parked/landing pages, or allowed to lapse. Until this decision lands, code-side legacy fallbacks (`https://trellis.education`, `https://usetrellis.co/demo`) MUST stay in `demoRequests.ts:267`, `webhookHandlers.ts:23`, and `ComplianceSnapshotPage.tsx:241`.

### 1.2 Resend sender domain
- [ ] **Add `noreply.noverta.education` as a verified sending domain** in the Resend dashboard.
  - SPF, DKIM, and DMARC records published in DNS exactly as Resend instructs.
  - Resend dashboard shows the domain status as **Verified** (green).
- [ ] **Send a test email** from Resend's "Send test" UI to a real inbox; verify SPF=pass and DKIM=pass in the message headers.
- [ ] **Keep `noreply.trellis.education` Resend-verified** until §5.4 readiness is met. Removing it before `EMAIL_FROM` flips will cause `WeeklyRiskDigest`, `ComplianceAlerts`, and onboarding emails to fail with `domain is not verified` (already visible in dev as a warning today).
- [ ] **Decision recorded:** post-cutover policy for `noreply.trellis.education` — keep verified for ≥30 days as safety net, then de-verify in Resend.

### 1.3 Stripe billing/customer portal URLs
- [ ] **Decide the canonical billing portal URL.** Options:
  - In-app billing page: `https://noverta.education/billing` (current convention; `webhookHandlers.ts:22` builds this from `getAppBaseUrl()`).
  - Stripe-hosted Customer Portal: long Stripe URL — must be set in Stripe Dashboard → Settings → Customer Portal.
- [ ] **Update Stripe Customer Portal branding** (Dashboard → Settings → Customer Portal):
  - Business name: `Noverta` (was `Trellis`).
  - Logo: Noverta logo.
  - Privacy + Terms links: `https://noverta.education/privacy`, `https://noverta.education/terms`.
  - Default redirect on portal exit: `https://noverta.education/billing`.
- [ ] **Update Stripe customer-facing emails** (Dashboard → Settings → Emails) — receipts, invoices, payment failures, refund notifications — to display the Noverta sender name + reply-to.
- [ ] **Webhook endpoint URL** in Stripe Dashboard (Developers → Webhooks) — verify the production endpoint already points at the api-server's hostname; no change needed unless the api-server moves to a new host as part of the rename. If it does, **rotate the webhook signing secret** and update `STRIPE_WEBHOOK_SECRET`.

### 1.4 Clerk allowed origins / instance config
- [ ] **Production Clerk instance — Domains tab:**
  - Add `https://noverta.education` as an allowed origin.
  - Add `https://www.noverta.education` if served separately.
  - Keep `https://trellis.education` and any `*.replit.app` origins listed until §5.5 is met (so existing tabs / cached SPAs don't 403 mid-cutover).
- [ ] **Development Clerk instance — Domains tab:**
  - Add the current Replit dev domain (`https://*.<workspace-id>.replit.dev`) if not already trusted (it is by default for Replit-managed Clerk).
- [ ] **Clerk dashboard branding** (Customization → Theme):
  - App name: `Noverta`.
  - Logo: Noverta.
  - Sign-in/up modal copy: replace `Trellis` with `Noverta`.
  - Email templates: verification, password reset, magic link, organization invite — replace `Trellis` with `Noverta`.
- [ ] **OAuth redirect URIs** updated for any social-login providers (Google, Microsoft) configured at the IdP side, so the consent screen and callback show `noverta.education`.
- [ ] **Webhook endpoint URL** (if Clerk webhooks are configured) verified against new origin; rotate `CLERK_WEBHOOK_SECRET` if endpoint moves.

### 1.5 Clerk publicMetadata role rename (`trellis_support` → `noverta_support`)
- [ ] **Identify every user with `publicMetadata.role === "trellis_support"`** (small set — internal Noverta support engineers). Use Clerk Dashboard → Users → filter on metadata, or the Clerk Backend API.
- [ ] **For each user, set `publicMetadata.role = "noverta_support"`.** The api-server already accepts both spellings (NEXT-7 boundary canonicalizer in `permissions.ts` + `middlewares/auth.ts`); the new value will work immediately with no deploy.
- [ ] **Verify per user:** after they sign in fresh, hit `/api/support-session/active` (200 OK) and attempt a write (e.g. `POST /api/students`) — must return 403 `support_session_read_only` once a support session is active.
- [ ] **Wait one full session-token refresh cycle** (5 min default) so no live tokens with the legacy value remain.
- [ ] **Record completion date** — this gates §5.5 readiness.

### 1.6 Clerk e2e test users + password rotation
- [ ] **Create new dev-instance test users in Clerk:**
  - Email: `noverta-e2e-admin+clerk_test@example.com`
    - Password: chosen strong value (suggested: `NovertaE2E!Test#2026`).
    - `publicMetadata.role = "admin"`.
  - Email: `noverta-e2e-teacher+clerk_test@example.com`
    - Password: chosen strong value (suggested: `NovertaE2E!Teacher#2026`).
    - `publicMetadata.role = "sped_teacher"`.
- [ ] **Reseed the demo district** so the corresponding `staff` rows exist (also auto-provisioned on first sign-in by `ensureDemoStaffForEmail`):
  ```bash
  pnpm --filter @workspace/db exec tsx run-seed-demo.ts
  # OR, against a running api-server:
  curl -X POST $API_BASE_URL/api/sample-data/reset-demo \
    -H "Authorization: Bearer <platform-admin-token>"
  ```
- [ ] **Update CI / `.env` defaults to point at the new users** (see §2.7–2.10) — flip `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` / `E2E_TEACHER_EMAIL` / `E2E_TEACHER_PASSWORD`.
- [ ] **Run the full e2e suite end-to-end** (`pnpm --filter @workspace/e2e test`) and confirm green.
- [ ] **Do NOT delete the legacy `trellis-e2e-*` Clerk users** until NEXT-8; the `DEMO_IDENTITIES` table still references them as a safety net.

### 1.7 Replit / production / CI env vars
- [ ] **Production Replit deployment — Secrets pane:** set the env vars listed in §2 to their **target** values; restart the deployment.
- [ ] **CI (GitHub Actions / Replit Workflows):** update repository secrets / workflow env to the target values.
- [ ] **Local developer environments:** broadcast a `.env.example` update or a Slack post listing the new env-var values; ask each developer to refresh their local `.env`.

---

## 2. Env Var Map

For every variable below: `Where set` is the location an operator must change; `Restart needed` is whether the running process must be restarted (vs. picked up on next request); `Verify` is the exact command/UI step to confirm the change took effect.

### 2.1 `EMAIL_FROM`
- **Current legacy default** *(in code, used when env unset)*: `Noverta SPED <hello@noreply.trellis.education>` — `artifacts/api-server/src/lib/email.ts:186`.
- **Target Noverta value**: `Noverta SPED <hello@noreply.noverta.education>`.
- **Where set**: Replit production Secrets pane; CI repo secrets (used by integration tests if they hit Resend).
- **Restart needed**: **Yes** — `FROM_EMAIL` is read once at module load; api-server must be restarted.
- **Verify**:
  ```bash
  curl -s "$API_BASE_URL/api/healthz/email-config" 2>/dev/null  # if the diagnostic exists
  # or trigger a real email (e.g. resend a pilot welcome) and inspect the From: header
  ```
- **Rollback**: unset `EMAIL_FROM` (or set back to the legacy literal); restart api-server. The default falls back to `noreply.trellis.education` automatically.
- **Prereq**: §1.2 (Resend domain verified). **Setting this before Resend verification will cause every outbound email to fail with `domain not verified`.**

### 2.2 `EMAIL_FROM_ADDRESS`
- **Current legacy default** *(in code)*: `hello@noreply.trellis.education` — `artifacts/api-server/src/lib/email.ts:187`.
- **Target Noverta value**: `hello@noreply.noverta.education`.
- **Where set**: same as 2.1.
- **Restart needed**: **Yes** — same module-load semantics as `EMAIL_FROM`.
- **Verify**: send a test email; the bare-address fallback path (used when Resend rejects the formatted `EMAIL_FROM`) shows this address.
- **Rollback**: unset; restart.
- **Prereq**: §1.2. Flip in lockstep with `EMAIL_FROM`.

### 2.3 `BILLING_PORTAL_URL`
- **Current legacy default** *(in code)*: derived as `${getAppBaseUrl()}/billing`, falling back to `https://trellis.education/billing` — `artifacts/api-server/src/lib/webhookHandlers.ts:18-24`.
- **Target Noverta value**: `https://noverta.education/billing` (or the Stripe Customer Portal URL if you go Stripe-hosted — see §1.3).
- **Where set**: Replit production Secrets pane.
- **Restart needed**: **No** — read on every webhook invocation. New value is honored on the next subscription lifecycle event.
- **Verify**: trigger a test cancellation (`stripe trigger customer.subscription.deleted` against the prod webhook secret in a sandbox), confirm the resulting customer email contains the new URL.
- **Rollback**: unset; falls back to `getAppBaseUrl()`/`trellis.education` chain.
- **Prereq**: §1.1 + §1.3 (DNS resolves and the `/billing` page actually exists at the Noverta domain).

### 2.4 `APP_ORIGIN` and / or `APP_URL`
- **`APP_ORIGIN`** — used only in `artifacts/api-server/src/routes/demoRequests.ts:267` to build sign-in deep links in demo welcome emails.
  - **Current legacy default** *(in code)*: `getAppBaseUrl() ?? "https://trellis.education"`.
  - **Target Noverta value**: `https://noverta.education`.
- **`APP_URL`** — first slot in the `getAppBaseUrl()` ladder (`APP_URL → APP_BASE_URL → REPLIT_DEV_DOMAIN`) used everywhere `getAppBaseUrl()` appears (`webhookHandlers.ts`, every email-sending route in `artifacts/api-server/src/routes/**`, `artifacts/api-server/src/lib/email.ts:194-198`).
  - **Current legacy default** *(in code)*: unset → falls back to `APP_BASE_URL` then `REPLIT_DEV_DOMAIN`.
  - **Target Noverta value**: `https://noverta.education` (production) — also fine to set in non-prod environments to a Replit-dev URL.
- **Where set**: Replit production Secrets pane.
- **Restart needed**: **No** — `getAppBaseUrl()` is called per-request; `APP_ORIGIN` is read per-request in `demoRequests.ts`.
- **Verify**:
  ```bash
  # Trigger any password-reset-style email or send a test demo welcome and
  # inspect the link in the email body.
  curl -s "$API_BASE_URL/api/healthz" | jq .       # confirms server reachable
  ```
  Then submit a demo-request via the marketing form and check the welcome email's "Login URL" line points at `https://noverta.education/...`.
- **Rollback**: unset both; chain falls back to legacy.
- **Recommended**: set **both** `APP_ORIGIN` and `APP_URL` to the same Noverta value — this guarantees every code path resolves identically.

### 2.5 `VITE_DEMO_REQUEST_URL`
- **Current legacy default** *(in code)*: `https://usetrellis.co/demo` — `artifacts/trellis/src/pages/ComplianceSnapshotPage.tsx:241`.
- **Target Noverta value**: `https://noverta.education/demo`.
- **Where set**: Replit production Secrets pane (for the trellis web artifact build env), CI build env, local `.env` for any developer running `pnpm --filter @workspace/trellis dev`.
- **Restart needed**: **Rebuild required.** This is a Vite client-side env var: it's inlined at build time. The trellis web artifact must be rebuilt and redeployed for the new value to reach end users.
- **Verify**:
  ```bash
  # After redeploy, view source on the compliance snapshot page or grep the
  # built bundle for the URL.
  curl -s https://noverta.education/compliance-snapshot | grep -o 'https://[^"]*\bdemo'
  ```
  (Or click the "Request demo" CTA on `/compliance-snapshot` and confirm the destination.)
- **Rollback**: unset and rebuild — the literal `usetrellis.co/demo` fallback is still in the source as the last-resort default.
- **Prereq**: §1.1 (the marketing site `/demo` page exists at the Noverta domain).

### 2.6 `NOVERTA_DEV_FORCE_DISTRICT_ID` (alias: `TRELLIS_DEV_FORCE_DISTRICT_ID`)
- **Current legacy default** *(in code)*: both env vars are dual-read by `artifacts/api-server/src/lib/resolveDistrictForCaller.ts:39-45` and `artifacts/api-server/src/middlewares/auth.ts:363-368`. The new name wins when both are set.
- **Target Noverta value**: same district id, just under the new variable name. Production should have **neither** set; only single-tenant QA / staging environments use this.
- **Where set**: Replit Secrets pane on the affected env (typically a dedicated single-tenant staging deployment, never production), CI env if used by a specific test target, local `.env` for a developer pinning a district.
- **Restart needed**: **Yes** — read at module load via `initDevDistrictFallback()` in `auth.ts`.
- **Verify**: restart api-server; the boot log emits one of:
  - `[Auth] NOVERTA_DEV_FORCE_DISTRICT_ID is set → forcing districtId=N for all authenticated requests` (canonical name in use), OR
  - `[Auth] TRELLIS_DEV_FORCE_DISTRICT_ID is set (deprecated alias) → forcing districtId=N` (legacy alias still in use; rename the var).
  Then any authenticated `/api/me` call should return `districtId: N`.
- **Rollback**: unset both vars; restart. Tenant scope reverts to Clerk metadata + staff-row lookup.
- **Production guard**: `auth.ts` refuses to honor either var when `NODE_ENV === "production"`. Setting it in prod is a no-op (logged warning) — but it should still be removed from prod Secrets to avoid confusion.

### 2.7 `E2E_ADMIN_EMAIL`
- **Current legacy default** *(documented in `e2e/README.md:111`, used by `e2e/tests/global-setup.ts`)*: `trellis-e2e-admin+clerk_test@example.com`.
- **Target Noverta value**: `noverta-e2e-admin+clerk_test@example.com`.
- **Where set**: CI repo secrets (the env feeding `pnpm --filter @workspace/e2e test`); local developer `.env` if they run e2e locally.
- **Restart needed**: **No process restart** — read once at the start of each Playwright run. Required for **next** test execution.
- **Verify**: run `pnpm --filter @workspace/e2e test --reporter=list 2>&1 | head -20` — the global-setup log line shows which email was used; the Clerk session lands on the admin dashboard.
- **Rollback**: unset (defaults back to `trellis-e2e-admin+clerk_test@example.com`).
- **Prereq**: §1.6 (the new Clerk user actually exists).

### 2.8 `E2E_ADMIN_PASSWORD`
- **Current legacy default** *(documented)*: `TrellisE2E!Test#2026`.
- **Target Noverta value**: the password chosen for the new `noverta-e2e-admin` Clerk user (suggested: `NovertaE2E!Test#2026`).
- **Where set**: same as 2.7.
- **Restart needed**: No — per-run.
- **Verify**: same as 2.7; if the password is wrong, the global-setup login step fails fast with a Clerk 401.
- **Rollback**: unset.
- **Prereq**: §1.6.
- **Always pair with 2.7 in lockstep.**

### 2.9 `E2E_TEACHER_EMAIL`
- **Current legacy default**: `trellis-e2e-teacher+clerk_test@example.com`.
- **Target Noverta value**: `noverta-e2e-teacher+clerk_test@example.com`.
- **Where set / Restart / Verify / Rollback / Prereq**: same as 2.7 (`E2E_ADMIN_EMAIL`).

### 2.10 `E2E_TEACHER_PASSWORD`
- **Current legacy default**: `TrellisE2E!Teacher#2026`.
- **Target Noverta value**: chosen new password (suggested: `NovertaE2E!Teacher#2026`).
- **Where set / Restart / Verify / Rollback / Prereq**: same as 2.8.
- **Always pair with 2.9 in lockstep.**

### 2.11 Quick env-var summary table

| Var | Current default | Target | Where set | Restart? | Prereq |
|---|---|---|---|---|---|
| `EMAIL_FROM` | `Noverta SPED <hello@noreply.trellis.education>` | `Noverta SPED <hello@noreply.noverta.education>` | Prod Secrets | **Yes** | §1.2 |
| `EMAIL_FROM_ADDRESS` | `hello@noreply.trellis.education` | `hello@noreply.noverta.education` | Prod Secrets | **Yes** | §1.2 |
| `BILLING_PORTAL_URL` | `…/billing` chain → `https://trellis.education/billing` | `https://noverta.education/billing` | Prod Secrets | No | §1.1, §1.3 |
| `APP_ORIGIN` | `getAppBaseUrl() ?? "https://trellis.education"` | `https://noverta.education` | Prod Secrets | No | §1.1 |
| `APP_URL` | unset → falls back through chain | `https://noverta.education` | Prod Secrets | No | §1.1 |
| `VITE_DEMO_REQUEST_URL` | `https://usetrellis.co/demo` (inlined) | `https://noverta.education/demo` | Prod build env, CI | **Rebuild** | §1.1 |
| `NOVERTA_DEV_FORCE_DISTRICT_ID` | (alias `TRELLIS_DEV_FORCE_DISTRICT_ID` honored) | same district id, new name | Staging/QA Secrets | **Yes** | none |
| `E2E_ADMIN_EMAIL` | `trellis-e2e-admin+clerk_test@example.com` | `noverta-e2e-admin+clerk_test@example.com` | CI / dev `.env` | No | §1.6 |
| `E2E_ADMIN_PASSWORD` | `TrellisE2E!Test#2026` | new (e.g. `NovertaE2E!Test#2026`) | CI / dev `.env` | No | §1.6 |
| `E2E_TEACHER_EMAIL` | `trellis-e2e-teacher+clerk_test@example.com` | `noverta-e2e-teacher+clerk_test@example.com` | CI / dev `.env` | No | §1.6 |
| `E2E_TEACHER_PASSWORD` | `TrellisE2E!Teacher#2026` | new (e.g. `NovertaE2E!Teacher#2026`) | CI / dev `.env` | No | §1.6 |

---

## 3. Verification Plan

Run these checks in order **after every cutover step that touches production**. Each check has a clear pass/fail signal; capture the output as evidence for §5 (readiness gate).

### 3.1 DNS + TLS
```bash
dig +short noverta.education A
dig +short www.noverta.education CNAME
dig +short noreply.noverta.education TXT
curl -sI https://noverta.education/ | head -5
```
**Pass:** non-empty A record; `200 OK` (or expected redirect) from the apex; valid TLS handshake.

### 3.2 Resend domain
- Resend Dashboard → Domains → `noreply.noverta.education` → status **Verified**.
- Send a test email from Resend; inspect headers in the receiving inbox: `Authentication-Results: spf=pass; dkim=pass; dmarc=pass`.

### 3.3 EMAIL_FROM cutover
After setting `EMAIL_FROM` + `EMAIL_FROM_ADDRESS` and restarting the api-server:
1. Trigger a real outbound email (e.g. resend a pilot welcome via admin UI, or `POST /api/demo-requests` for a fresh email).
2. Check the receiving inbox: `From:` header reads `Noverta SPED <hello@noreply.noverta.education>`; SPF/DKIM/DMARC headers all show `pass`.
3. Tail api-server logs: zero occurrences of `domain is not verified` for at least 24 hours after cutover.

### 3.4 BILLING_PORTAL_URL cutover
Trigger a Stripe webhook in test mode against the prod endpoint (with prod webhook secret) and inspect the resulting customer email:
```bash
stripe trigger customer.subscription.deleted
```
**Pass:** email body contains `https://noverta.education/billing` (not `trellis.education/billing`).

### 3.5 APP_ORIGIN / APP_URL cutover
1. Submit a demo-request via the marketing form (or `POST /api/demo-requests`).
2. Inspect the welcome email body — the "Login URL" must start with `https://noverta.education/`.
3. Confirm any other transactional email (overdue evaluation, weekly digest, IEP renewal) sent in the next 24h contains links under the Noverta domain.

### 3.6 VITE_DEMO_REQUEST_URL cutover
After redeploying the trellis web artifact:
1. Open `https://noverta.education/compliance-snapshot` in an incognito tab.
2. Click the "Request demo" CTA.
3. **Pass:** lands on `https://noverta.education/demo` (not `usetrellis.co/demo`).

### 3.7 NOVERTA_DEV_FORCE_DISTRICT_ID rollout
On every environment that uses this var:
1. Restart api-server.
2. Boot log shows `NOVERTA_DEV_FORCE_DISTRICT_ID is set …` (canonical), NOT `TRELLIS_DEV_FORCE_DISTRICT_ID is set (deprecated alias) …`.
3. `curl $API_BASE_URL/api/me -H 'Authorization: Bearer …'` returns the pinned `districtId`.

### 3.8 Clerk publicMetadata role rename
For each support engineer migrated:
1. Sign in fresh (clear cookies first to force a new token).
2. `GET /api/me` returns `role: "trellis_support"` (internal canonical — expected; this is what the boundary canonicalizer maps to).
3. Start a support session and confirm the read-only override engages: any write returns `403 support_session_read_only`.
4. Wait 6+ minutes (one Clerk refresh cycle); rerun (1)–(3) to confirm the new token still works.

### 3.9 Clerk e2e users + password rotation
After flipping `E2E_*_EMAIL` / `E2E_*_PASSWORD` envs in CI:
1. Run a full e2e suite (`pnpm --filter @workspace/e2e test`).
2. **Pass:** all specs green, no `Clerk: invalid email or password` failures.
3. CI logs show the global-setup line referencing the new `noverta-e2e-*` emails.

### 3.10 End-to-end smoke after all cutovers
1. Real-user flow: open `https://noverta.education` in an incognito tab; sign up as a new district admin; complete onboarding; receive welcome email; click the "Open Noverta" link; land back in-app authenticated. Every link, sender, and brand string says **Noverta**.
2. Stripe sandbox: subscribe a test district, then cancel; receive cancellation email pointing to `noverta.education/billing`.
3. Pilot scorecard: trigger a manual `weekly-pilot-scorecard` digest send; sender + links all Noverta.
4. Demo request: submit on `noverta.education/demo`; receive demo welcome at the new sender.

---

## 4. Rollback Plan

Each cutover is independently revertible. Roll back the **most recent** failing step first; do not chain rollbacks.

### 4.1 EMAIL_FROM / EMAIL_FROM_ADDRESS
- **Symptom:** outbound emails failing with `domain is not verified`, or recipients reporting messages landed in spam/junk.
- **Action:** unset `EMAIL_FROM` and `EMAIL_FROM_ADDRESS` in prod Secrets; restart api-server. Sender reverts to `noreply.trellis.education` (which must still be Resend-verified — see §1.2).
- **Verify rollback:** new outbound email's From: header reads `noreply.trellis.education`; logs no longer show domain-verification errors.

### 4.2 BILLING_PORTAL_URL
- **Symptom:** customer cancellation/payment-failure emails contain a 404 link.
- **Action:** unset `BILLING_PORTAL_URL` in prod Secrets. Falls back through `getAppBaseUrl()` chain to `https://trellis.education/billing` (which is still the legacy production URL).
- **Verify rollback:** trigger a test webhook; email contains the legacy URL; URL returns 200.

### 4.3 APP_ORIGIN / APP_URL
- **Symptom:** sign-in deep-links in demo welcome / password-reset emails 404 because `noverta.education` isn't actually serving the app yet.
- **Action:** unset `APP_ORIGIN` and `APP_URL`. The chain falls back to `APP_BASE_URL` → `REPLIT_DEV_DOMAIN` → the legacy `trellis.education` literal in `demoRequests.ts:267`.
- **Verify rollback:** new demo-request welcome email's "Login URL" works.

### 4.4 VITE_DEMO_REQUEST_URL
- **Symptom:** "Request demo" button on `/compliance-snapshot` 404s.
- **Action:** unset `VITE_DEMO_REQUEST_URL` in build env; **rebuild and redeploy** the trellis web artifact. CTA reverts to the in-source default `https://usetrellis.co/demo`.
- **Verify rollback:** click the CTA in production; lands on `usetrellis.co/demo`.

### 4.5 NOVERTA_DEV_FORCE_DISTRICT_ID
- **Symptom:** misuse on a multi-tenant environment, or wrong district id pinned.
- **Action:** unset both `NOVERTA_DEV_FORCE_DISTRICT_ID` and `TRELLIS_DEV_FORCE_DISTRICT_ID`; restart api-server. Tenant scope falls back to Clerk metadata + staff-row lookup (the normal production path).
- **Verify rollback:** boot log no longer shows the `forcing districtId=N` line; `/api/me` returns the user's actual district from their staff row.

### 4.6 Clerk publicMetadata role rename
- **Symptom:** a migrated support engineer reports authorization failures, or the support-session read-only override stops engaging.
- **Action:** in Clerk Dashboard, set the affected user's `publicMetadata.role` back to `"trellis_support"`. The boundary canonicalizer treats both spellings identically, so this is a one-click revert with no code deploy. The user must re-sign-in to pick up the new token.
- **Verify rollback:** `/api/me` returns `role: "trellis_support"`; support session works as before.

### 4.7 Clerk e2e users + env flip
- **Symptom:** CI red after flipping `E2E_*_EMAIL` / `E2E_*_PASSWORD`.
- **Action:** in CI repo secrets, restore the legacy values:
  ```
  E2E_ADMIN_EMAIL=trellis-e2e-admin+clerk_test@example.com
  E2E_ADMIN_PASSWORD=TrellisE2E!Test#2026
  E2E_TEACHER_EMAIL=trellis-e2e-teacher+clerk_test@example.com
  E2E_TEACHER_PASSWORD=TrellisE2E!Teacher#2026
  ```
  Re-run CI. The legacy Clerk users are still present and still work because §1.6 preserved them.

### 4.8 Resend domain de-verification (NEVER do this before §5.4 readiness)
- If `noreply.trellis.education` is accidentally de-verified before `EMAIL_FROM` flips, all outbound email fails immediately. Re-add the domain in Resend; SPF/DKIM/DMARC records are still in DNS, so re-verification typically completes in minutes.

### 4.9 Full-stack rollback (worst case)
- If multiple cutovers go wrong simultaneously: revert all env vars in §2 to **unset** in prod Secrets; restart api-server; redeploy trellis web artifact. The codebase's compiled-in legacy defaults (`trellis.education`, `noreply.trellis.education`, `usetrellis.co/demo`) take over and the app behaves exactly as it did before NEXT-1 began.

---

## 5. NEXT-8 Readiness Gate

**NEXT-8 (in-repo legacy shim removal) is BLOCKED until every checkbox below is checked, each with concrete evidence stored alongside this runbook.**

### 5.1 DNS + TLS evidence
- [ ] `dig` output for apex + `www` + `noreply` recorded in the cutover log.
- [ ] Successful `curl -sI https://noverta.education/` recorded.
- [ ] Production marketing site at `noverta.education` serves the `/demo` page.

### 5.2 Resend evidence
- [ ] Screenshot of Resend Dashboard showing `noreply.noverta.education` status = **Verified**.
- [ ] Test email message-source dump showing SPF=pass, DKIM=pass, DMARC=pass for the new sender.

### 5.3 Stripe evidence
- [ ] Screenshot of Stripe Customer Portal branding screen showing the Noverta logo + name.
- [ ] One real customer-facing Stripe receipt email (test mode is fine) showing the Noverta sender + links.

### 5.4 Email cutover evidence
- [ ] After `EMAIL_FROM` + `EMAIL_FROM_ADDRESS` flip and restart: at least 7 consecutive days with **zero** `domain is not verified` log lines in api-server.
- [ ] At least one transactional email of each major type (demo welcome, weekly digest, overdue evaluation, IEP renewal, billing notification) confirmed delivered with the new sender.

### 5.5 Clerk role-rename evidence
- [ ] Every `trellis_support` user in production Clerk has been migrated to `noverta_support` (Clerk Dashboard user-list filter shows zero `trellis_support` users).
- [ ] Each migrated user has signed in fresh ≥1 time after the migration without an authorization failure.
- [ ] At least one full Clerk session-token refresh cycle (5 min) has elapsed since the last migration, plus a 24-hour observation window with zero auth-failure incidents tagged to support-engineer accounts.

### 5.6 Clerk e2e evidence
- [ ] Two new dev-instance Clerk users (`noverta-e2e-admin` + `noverta-e2e-teacher`) confirmed via Clerk Dashboard.
- [ ] At least 3 consecutive green CI runs of the full e2e suite using the new `noverta-e2e-*` emails + new passwords (i.e. `E2E_*_EMAIL` / `E2E_*_PASSWORD` flipped in CI ≥ 3 successful runs ago).

### 5.7 App-origin evidence
- [ ] `APP_ORIGIN` and `APP_URL` set in production Secrets to `https://noverta.education`.
- [ ] At least one outbound email confirmed to contain a working `https://noverta.education/...` deep-link (no 404 on click).

### 5.8 Demo-request URL evidence
- [ ] `VITE_DEMO_REQUEST_URL` set in build env; trellis web artifact rebuilt + deployed.
- [ ] CTA on `/compliance-snapshot` confirmed lands on `https://noverta.education/demo`.

### 5.9 Env-var alias retirement evidence
- [ ] `NOVERTA_DEV_FORCE_DISTRICT_ID` set on every env that previously used `TRELLIS_DEV_FORCE_DISTRICT_ID`.
- [ ] `TRELLIS_DEV_FORCE_DISTRICT_ID` removed from every env (Replit Secrets, CI, local `.env.example`).
- [ ] api-server boot log on every affected env shows the canonical-name line, not the deprecated-alias line.

### 5.10 Out-of-scope for the gate (MUST stay even after NEXT-8)
- The `trellis_support` **internal canonical literal** in `permissions.ts`, `auth.ts`, `role-context.tsx`, `support-session-context.tsx`, etc. — this is the in-repo type/string identity, not an external claim value. Do not rename in NEXT-8 unless paired with a separate `TrellisRole → NovertaRole` bulk refactor task.
- The `trellis_role` localStorage key migration shim in `role-context.tsx` (per the owner's explicit "Do not remove Trellis localStorage migration fallbacks" instruction).
- Any `_clerk-restore/**` files — they are a backup directory, not in any build path; leave untouched.

### 5.11 What NEXT-8 may remove once §5.1–§5.9 are all checked
- The `noverta_support` → `trellis_support` mapping branch in `canonicalizeRoleString` (in both `permissions.ts` and `role-context.tsx`) — only after §5.5 is satisfied. Re-issue a deprecation period before deletion.
- The legacy `TRELLIS_DEV_FORCE_DISTRICT_ID` read in `resolveDistrictForCaller.ts:39-45` and `auth.ts:363-368` — only after §5.9 is satisfied.
- The legacy `trellis-e2e-admin` + `trellis-e2e-teacher` rows in `lib/db/src/seed-demo-identities.ts` — only after §5.6 is satisfied.
- The legacy literal fallbacks `https://trellis.education` (in `demoRequests.ts:267` and `webhookHandlers.ts:23`) and `https://usetrellis.co/demo` (in `ComplianceSnapshotPage.tsx:241`) — only after §5.7 + §5.8 are satisfied **and** the §1.1 redirect/parking decision is recorded.
- The legacy `noreply.trellis.education` defaults in `email.ts:186-187` — only after §5.4 is satisfied.

---

## 6. Open external dependencies (current blockers)

These are the items that **today** block §5 readiness, captured for at-a-glance status.

| # | Dependency | Owner | Blocking gates |
|---|---|---|---|
| 1 | `noverta.education` DNS + TLS live | Ops | §5.1, §5.7, §5.8 |
| 2 | `noreply.noverta.education` Resend-verified | Ops | §5.2, §5.4 |
| 3 | Stripe Customer Portal rebranded + emails updated | Billing/Ops | §5.3 |
| 4 | Clerk allowed origins updated for `noverta.education` | Ops | §5.7 (sign-in works at new origin) |
| 5 | Clerk publicMetadata role migration for support engineers | Platform | §5.5 |
| 6 | Two new `noverta-e2e-*` Clerk dev users created | QA | §5.6 |
| 7 | Production / CI / dev env vars (§2) flipped | Ops + each developer | §5.4, §5.7, §5.8, §5.9 |
| 8 | Decision recorded: redirect / park / lapse `trellis.education` + `usetrellis.co` | Marketing | §5.11 (last bullet) |

---

## 7. Logging this cutover

For audit, append a row per cutover step to `docs/runbooks/noverta-cutover-log.md` (create if absent):

```
| Date (UTC) | Step (§ref) | Operator | Action | Verification | Rollback ready? |
|---|---|---|---|---|---|
| 2026-MM-DD | §2.1 EMAIL_FROM flip | alice | Set EMAIL_FROM=Noverta SPED <hello@noreply.noverta.education>; restarted api-server | Test email sent to alice@…; From: header confirms; SPF/DKIM/DMARC pass | Yes (unset + restart) |
```

Keep this log open until §5 is fully checked.
