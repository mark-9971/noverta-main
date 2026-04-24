# Noverta Non-Production App / Sandbox Inventory

Status: adopted for `ARCH-REORG-03`.

Purpose: give a newly hired engineer a map of which directories in the repo are the primary product vs. which are demo, pitch, sandbox, design-concept, support, or platform-artifact areas — so a first audit does not confuse support surfaces with the primary product.

This inventory is intentionally docs-only.

> **This inventory does not delete, move, rename, or deprecate anything.**
> It is a map, not a plan.

Use this together with:
- `docs/ENGINEER-ONBOARDING.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/README.md`

Trust order (same as the onboarding doc): current code > `replit.md` > `docs/architecture/boundaries.md` > this doc > older audit/analysis files.

---

## 1. Primary product areas (for contrast)

These are the primary runtime areas. Treat them as the real product. Hot-file protections from `docs/architecture/boundaries.md` apply in full.

| Path | What it is | Runtime-critical | First-audit treatment |
|---|---|---|---|
| `artifacts/trellis` | Primary web app (React/Vite shell, route composition, pages, workflow orchestration) | Yes | Treat as production product. Do not treat as "just another artifact". |
| `artifacts/api-server` | Primary API server (Express app, route assembly, middleware, background scheduler entrypoints) | Yes | Treat as production product. Respect `routes/index.ts` as assembly-only. |
| `lib/db` | DB/schema/seed area (Drizzle schema, migrations, seed/demo primitives, v2 domain/simulator helpers) | Yes | High blast radius. Seed/reset coupling is hot. |
| `e2e` | Playwright/e2e (browser tests, Playwright config, E2E fixtures/harnesses) | Yes (for verification) | Secret-dependent (Clerk/E2E). Wedge-sensitive. |
| `lib/api-spec` | OpenAPI source (API source-of-truth spec and codegen config) | Yes (source of contracts) | All new contract work starts here. |
| `lib/api-zod` | Generated Zod/contracts from OpenAPI | Yes (consumed at runtime) | Do not hand-edit generated files. |
| `lib/api-client-react` | Generated React Query client from OpenAPI | Yes (consumed at runtime) | Do not hand-edit generated files. |

Everything outside this set should be treated as support, demo, sandbox, artifact, or historical context until proven otherwise.

---

## 2. Non-production / support areas

These live in the repo but are not the primary product. They are listed here so that a first-audit engineer recognizes them as support/demo/sandbox and does not generalize their behavior or structure to the primary product.

> This section does **not** propose deleting, moving, renaming, or deprecating any of these. It only describes what they are today.

### 2.1 `artifacts/trellis-demo`
- **Purpose:** demo-facing variant / demo-deliverable app, kept alongside the primary product app for demo/readiness usage.
- **Runtime-critical for the primary product?** No. The primary product runtime is `artifacts/trellis` + `artifacts/api-server`.
- **Safe to ignore during first audit?** Yes. Do not audit `trellis-demo` as if it were the primary web app.
- **Caution notes:**
  - Has its own `package.json` (`@workspace/trellis-demo`) and its own Vite config; it is a separate app.
  - Its presence does not imply that demo logic in the primary product lives here — primary demo/seed/reset logic still lives in hot files under `lib/db` and the primary apps.
  - Do not infer "this is how the primary product works" from `trellis-demo`.

### 2.2 `artifacts/trellis-deck`
- **Purpose:** deck/presentation-style artifact app.
- **Runtime-critical for the primary product?** No.
- **Safe to ignore during first audit?** Yes.
- **Caution notes:**
  - Separate `package.json` (`@workspace/trellis-deck`) and its own Vite config.
  - Treat as a presentation/deck surface, not a product surface. Do not mistake its content for canonical product truth.

### 2.3 `artifacts/trellis-pitch`
- **Purpose:** pitch-deck / investor-facing artifact app.
- **Runtime-critical for the primary product?** No.
- **Safe to ignore during first audit?** Yes.
- **Caution notes:**
  - Separate `package.json` (`@workspace/trellis-pitch`) and its own Vite config.
  - Copy and narrative here may lag behind current product truth. Do not treat it as source of truth for what the product actually does today.

### 2.4 `artifacts/dashboard-concepts`
- **Purpose:** dashboard design-concept / exploration surface.
- **Runtime-critical for the primary product?** No.
- **Safe to ignore during first audit?** Yes.
- **Caution notes:**
  - Separate `package.json` (`@workspace/dashboard-concepts`) and its own Vite config.
  - Concept surface only. Do not generalize UI patterns, state shapes, or data shapes from here to the primary product.
  - Dashboard core widgets in the primary product are on the hot-file list (`docs/architecture/boundaries.md`); `dashboard-concepts` is explicitly not those files.

### 2.5 `artifacts/mockup-sandbox`
- **Purpose:** mockup/component sandbox for UI exploration.
- **Runtime-critical for the primary product?** No.
- **Safe to ignore during first audit?** Yes.
- **Caution notes:**
  - Separate `package.json` (`@workspace/mockup-sandbox`) and its own Vite config, plus a local `mockupPreviewPlugin.ts` used only for the sandbox.
  - Sandbox-only. Do not assume its components are the components used by the primary web app.

### 2.6 `attached_assets/`
- **Purpose:** large bucket of attached screenshots, images, and dropped content referenced from chats/PRs/historical work.
- **Runtime-critical?** No.
- **Safe to ignore during first audit?** Yes, for product logic. Some files may still be referenced from docs or marketing artifacts, so do not mass-delete.
- **Caution notes:**
  - Contents are historical / support material.
  - Do not treat image/file presence here as evidence of current product behavior.

### 2.7 `exports/`
- **Purpose:** exported snapshots/archives of repo content (tarballs of API server, frontend, DB schema/seeds, api-spec, etc.) produced for sharing/handoff purposes.
- **Runtime-critical?** No.
- **Safe to ignore during first audit?** Yes.
- **Caution notes:**
  - These are **snapshots**, not live code. They drift from the real source over time.
  - Never treat the contents of an `exports/*` archive as current truth — always go to the live source directory instead.

### 2.8 `screenshots/`
- **Purpose:** captured screenshots used for audit / demo / marketing context.
- **Runtime-critical?** No.
- **Safe to ignore during first audit?** Yes, for product logic.
- **Caution notes:**
  - May include UI states that no longer match the current product.
  - Do not treat a screenshot here as proof that current UI behaves that way.

### 2.9 `tests/` (root, non-Playwright)
- **Purpose:** non-Playwright test scripts used for targeted audits (`permission-matrix.mjs`) and revenue-focused harness scenarios under `tests/revenue`.
- **Runtime-critical?** No (audit / verification only, not product runtime).
- **Safe to ignore during first audit?** Treat as helpful verification harnesses, not as the primary test suite. The primary E2E suite is in `e2e/`.
- **Caution notes:**
  - Do not confuse `tests/` with the primary Playwright `e2e/` package.
  - Changes here do not replace E2E coverage.

### 2.10 Root-level historical / audit markdown
- **Files of interest:**
  - `Noverta-Business-Analysis.md`
  - `Noverta-Platform-Analysis.md`
  - `trellis-ux-audit.txt`
- **Purpose:** historical analysis / audit snapshots.
- **Runtime-critical?** No.
- **Safe to ignore during first audit?** Use only as background context.
- **Caution notes:**
  - These are historical and may be stale.
  - They are explicitly below current code, `replit.md`, and `docs/architecture/boundaries.md` in the trust order.
  - Do not use them to override onboarding, boundaries, or current code.

---

## 3. Replit / platform-artifact areas

Replit/platform-specific files that describe where the repo runs, not what the product is. Keep them scoped to platform adapter concerns per `docs/architecture/boundaries.md` ("No Replit-only assumptions outside platform adapter layer").

| Path | Purpose | Runtime-critical | First-audit treatment |
|---|---|---|---|
| `.replit` | Replit runtime config: nix modules, deployment target, post-build/post-merge hooks, port mappings, development/shared env vars (including `DEV_AUTH_BYPASS`, `VITE_DEV_AUTH_BYPASS`, `NODE_ENV`, Sentry DSNs), object storage bucket ID. | Yes, for running on Replit. Not a product source of truth. | Read to understand the Replit environment. Do not propose architecture changes from here. |
| `replit.nix` | Nix deps used by the Replit environment (Chromium, GL/X libs, dbus, etc. — primarily to support Playwright-compatible browsers in the Replit runtime). | Yes, for the Replit environment. | Treat as platform adapter. Do not extend for product behavior. |
| `.replitignore` | Docker-ignore-style exclusion file used by Replit deploy packaging. | No (packaging hint only). | Informational. |
| `.replit-artifact/*` | Not present in the current tree. | N/A | If it later appears, treat as a platform-generated artifact directory and leave it to the platform adapter layer. |
| `artifact.toml` files | Not present in the current tree (no `artifact.toml` files exist). | N/A | If later introduced, document them here before letting them influence product code. |

`replit.md` is intentionally **not** in this table — it is the current product operating-model document and hot-file warning list and is explicitly part of the trust order (above this doc). Do not treat `replit.md` as "just a platform artifact".

---

## 4. First-audit guidance

When a newly hired engineer scans the repo:

1. Start in the primary product areas (section 1).
2. Treat section 2 directories as support/demo/sandbox/snapshots — useful context only.
3. Treat section 3 files as platform adapters — relevant for running the repo, not for defining product behavior.
4. Do not propose deletions or moves of anything in sections 2 or 3 from the inventory alone. Any such proposal must go through explicit product approval per `docs/architecture/boundaries.md`.
5. When in doubt, prefer current code over any doc, including this one.

---

## 5. What this doc is not

- Not a deprecation list.
- Not a deletion plan.
- Not a move/rename plan.
- Not an authoritative statement that any of these areas will stay or be removed.
- Not a replacement for `docs/architecture/boundaries.md` or `docs/ENGINEER-ONBOARDING.md`.

Its only job is to prevent a first-audit engineer from confusing non-production / support / platform-artifact areas with the primary product.
