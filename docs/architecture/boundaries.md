# Noverta Architecture Boundaries

Status: adopted for `ARCH-RAILS-02`.

Purpose: stop new code from increasing repo sprawl while closed-loop recovery and shell-honesty work continue.

This document is intentionally conservative:
- rails first
- keep the monorepo
- no rewrite
- no multi-repo split
- no broad file moves yet

Use the current repo as source of truth. If this document conflicts with active product-closure work, defer to the current product roadmap and hot-file protections.

## 1. Executive architecture rule

The repo needs stronger rails before broader modularization.

Rules:
- Keep the current monorepo.
- Do not propose a rewrite as the default path.
- Do not split to multiple repos.
- Do not move broad sets of product files just to make the tree look cleaner.
- Add guardrails first so new work stops making the architecture worse.
- Only modularize where the boundary is already clear and the move does not interrupt product closure.

## 2. Monorepo boundary model

Target future layers. This is the intended ownership model, not a move-everything-now plan.

| Layer | Owns | Must not own | Dependency direction |
|---|---|---|---|
| `apps/web` | route composition, page composition, shell wiring, view-model composition | deep business rules, storage adapters, DB access | may depend on `packages/ui`, `packages/contracts`, `packages/platform-*`, `packages/domain-*` |
| `apps/api` | HTTP route assembly, request/response adapters, middleware wiring, scheduler entrypoints | domain rules that can live below the app layer | may depend on `packages/db`, `packages/contracts`, `packages/platform-*`, `packages/domain-*` |
| `apps/e2e` | Playwright config, browser harnesses, end-to-end fixtures | product runtime logic | may depend on built app surfaces and shared test helpers only |
| `packages/db` | schema, migrations, DB helpers, seed primitives, DB invariants | route policy, page logic, UI state | low-level foundation; no dependency on app shells |
| `packages/contracts` | OpenAPI source, generated client, generated zod/types, codegen config | page logic, route assembly, DB query logic | shared contract layer consumed by apps and domains |
| `packages/ui` | reusable visual primitives, shared UI components, layout primitives | route knowledge, workflow logic, API policy | consumed by `apps/web` and view-model layers only |
| `packages/platform-auth` | auth/session adapters, role/session parsing, framework-specific auth glue | workflow ownership decisions, page composition | consumed by apps and domain packages that need auth context |
| `packages/platform-config` | env parsing, config validation, runtime flags, host/platform toggles | business logic | foundational package consumed by apps/platform packages |
| `packages/platform-storage` | object storage adapters, upload/download helpers, storage integration | workflow-specific file behavior | consumed by apps/domains through explicit interfaces |
| `packages/platform-observability` | logging, tracing, metrics, Sentry wiring, health primitives | workflow semantics | consumed by apps/platform/domain packages |
| `packages/domain-students` | student-centric rules, student aggregates, student workflow helpers | app shell, auth glue, generic infra | may depend on `packages/db`, `packages/contracts`, `packages/platform-*` |
| `packages/domain-compliance` | compliance/reporting rules, deadline logic, compensatory/compliance derivations | shell exposure and navigation | may depend on `packages/db`, `packages/contracts`, `packages/platform-*` |
| `packages/domain-sessions` | service-delivery/session domain logic, minute progress interfaces | scheduling orchestration shell, page routing | may depend on `packages/db`, `packages/contracts`, `packages/platform-*` |
| `packages/domain-recovery` | handling state models, recommendation/recovery models, proof-oriented workflow rules | top-level page shells, nav exposure | may depend on `packages/db`, `packages/contracts`, `packages/platform-*` |
| `packages/domain-demo` | sample/demo/readiness/reset domain logic, demo operations helpers | customer-shell truth and route exposure | may depend on `packages/db`, `packages/contracts`, `packages/platform-*` |

## 3. Assembly rules

### `artifacts/trellis/src/App.tsx` is app assembly only

Allowed:
- route registration
- route-level lazy loading
- top-level provider composition
- redirects already required to preserve compatibility

Not allowed:
- new product workflow logic
- new business-rule branching
- new workflow-state rules
- new product truth that belongs in a domain or workflow module

Rule:
- No new product workflow logic in `App.tsx`.

### `artifacts/api-server/src/routes/index.ts` is API assembly only

Allowed:
- route mounting
- composition of already-existing policy/middleware modules
- narrowly-scoped ordering fixes when required

Not allowed:
- new policy blobs
- inline business rules
- route-specific product logic that should live in a router/domain/module

Rule:
- No new backend policy sprawl in `routes/index.ts`.

## 4. Hot-file / main-agent rules

The following files/surfaces are protected and are main-agent-only unless explicitly approved by the current product task:

- Action Center
- `artifacts/trellis/src/lib/action-recommendations.ts`
- `artifacts/trellis/src/lib/use-handling-state.ts`
- `artifacts/trellis/src/lib/use-dismissal-state.ts`
- Compliance Risk Report
- dashboard core widgets
- Quick Log behavior
- `artifacts/api-server/src/lib/minuteCalc.ts`
- `artifacts/api-server/src/lib/schoolCalendar.ts`
- scheduling orchestration
- `artifacts/trellis/src/components/layout/nav-config.ts`
- seed/reset orchestration
- demo reset/seeding files

Working rule:
- Do not refactor these files for architecture cleanliness alone.
- Touch them only when the active product task directly requires it.
- If a task touches any of them, call out overlap risk explicitly before implementation.

## 5. Lane ownership rules

### Main-agent-only
Use for:
- wedge workflow shape changes
- recommendation / handling / dismissal changes
- minute math
- school-calendar-aware logic
- scheduling/recovery orchestration
- nav truth
- demo reset/seeding orchestration

### Background-safe
Use for:
- CI/bootstrap stabilization
- isolated docs
- isolated tooling
- isolated low-conflict package/utility extraction
- contract/codegen hygiene
- clearly bounded reliability work outside hot wedge files

### Docs-only
Use for:
- boundary docs
- runbooks
- review checklists
- architecture notes

### When to pause instead of parallelize
Pause and do not parallelize when:
- a change would touch hot wedge files without direct product need
- ownership of a change is ambiguous across lanes
- a “cleanup” task would change workflow truth while product closure is still incomplete
- the task would require broad file moves to complete safely

## 6. Where new code goes

### New frontend workflow logic
- Put workflow-specific logic next to the page/workflow module or in an eventual `packages/domain-*` or workflow helper module.
- Do not add it to `App.tsx`.
- Do not add it to generic layout or nav files just because they are easy to find.

### New backend policy
- Put reusable policy in named middleware or policy modules.
- Mount it from `routes/index.ts`.
- Do not add new policy branches inline in `routes/index.ts`.

### New domain logic
- Put it in the narrowest domain module that matches the problem.
- Prefer `domain-students`, `domain-compliance`, `domain-sessions`, `domain-recovery`, or `domain-demo` ownership over app-shell ownership.

### New platform / integration logic
- Put it behind a platform boundary (`platform-auth`, `platform-config`, `platform-storage`, `platform-observability`).
- Do not let host/vendor-specific behavior spread into product workflow modules.

### New API contracts
- Follow the generated contract path:
  1. update OpenAPI source
  2. generate client / zod artifacts
  3. consume generated artifacts
- Do not create parallel hand-maintained API types if the endpoint belongs in the generated contract surface.

### New localStorage / sessionStorage keys
- Do not add ad hoc keys.
- Use a shared helper or a documented naming/version convention.
- At minimum, keys must be namespaced and versioned.

### New Replit / host-specific assumptions
- Keep them in platform adapter areas only.
- Do not add new Replit-only assumptions to product workflows, page logic, or domain rules.

## 7. Required rails

These rails are required for all future work:

- **Package manager pin rule**  
  Root `package.json` must declare the pinned package manager version.

- **Deterministic CI bootstrap rule**  
  CI must resolve pnpm deterministically and fail on bootstrap issues before build/test work begins.

- **Missing-secret preflight rule**  
  Secret-dependent workflows must fail early and clearly, listing exactly which secrets are required.

- **API contract / codegen rule**  
  New API surface must follow the generated contract path; do not bypass `contracts` with parallel shapes.

- **Local persistence naming/helper rule**  
  New client-side persistence keys must use a helper or documented naming/version convention.

- **No Replit-only assumptions outside platform adapter layer**  
  Replit-specific env, plugins, connectors, or storage behavior must stay contained.

## 8. Anti-patterns to reject

Reject these in review:

- broad cleanup sweeps
- moving files just to look modular
- new workflow logic in `App.tsx`
- new middleware/policy blobs in `routes/index.ts`
- parallel localStorage key sprawl
- bypassing generated API client/contracts
- refactoring hot wedge files without product need
- architecture cleanup that blocks closed-loop recovery
- host-specific assumptions added directly into product/domain code

## 9. How to use this doc in reviews

Review checklist:

1. Does this change touch a hot file? If yes, is there explicit product need and main-agent ownership?
2. Is any new workflow logic being added to `App.tsx`? If yes, reject.
3. Is any new backend policy being added to `routes/index.ts`? If yes, reject unless it is a composition-only change.
4. Does the new code belong in app assembly, domain, platform, contracts, or DB? If unclear, pause and classify before merging.
5. Does the change add new API surface? If yes, does it follow the contract/codegen path?
6. Does the change add new local persistence keys? If yes, does it follow the naming/helper rule?
7. Does the change introduce new Replit-only assumptions outside a platform boundary? If yes, reject.
8. Does this change improve delivery rails, or does it increase sprawl? If it increases sprawl, reject or narrow it.
