# Noverta API Contracts / Codegen Path

Status: adopted for `ARCH-REORG-04`.

Purpose: give a newly hired engineer a single walkthrough of how an API change flows from OpenAPI source of truth through generated Zod schemas and a generated React Query client, so they do not accidentally introduce hand-rolled parallel contracts or edit generated files.

This doc is intentionally docs-only. It does not change the codegen pipeline, generated files, API routes, `package.json`, or workflows.

Use this together with:
- `lib/api-zod/README.md` — the current authoritative developer guide for the codegen step
- `docs/architecture/boundaries.md` — the API contract / codegen rail ("New API surface must follow the generated contract path; do not bypass `contracts` with parallel shapes.")
- `docs/ENGINEER-ONBOARDING.md` — trust order and primary runtime areas
- `docs/architecture/non-production-inventory.md` — which areas are **not** part of the primary product

Trust order: current code > `replit.md` > `lib/api-zod/README.md` > this doc > older audit/analysis files.

---

## 1. The three contract packages, at a glance

| Package | Purpose | Runtime-critical | Hand-edit allowed? |
|---|---|---|---|
| `lib/api-spec` | **OpenAPI source of truth** and codegen configuration | Yes (source) | Yes — edit the spec (`openapi.yaml`) and codegen config here |
| `lib/api-zod` | Generated Zod validation schemas derived from `openapi.yaml` | Yes (consumed at runtime) | No — `src/generated/*` is auto-generated; only `README.md` is hand-maintained |
| `lib/api-client-react` | Generated React Query client derived from `openapi.yaml` | Yes (consumed at runtime) | No for `src/generated/*`. Hand-maintained helpers (`custom-fetch.ts`, `index.ts`, and small adapter files) live alongside generated files |

The dependency direction is strictly one-way:

```
lib/api-spec/openapi.yaml   ← source of truth, hand-edited
          │
          │  pnpm --filter @workspace/api-spec run codegen
          ▼
lib/api-zod/src/generated/api.ts
lib/api-client-react/src/generated/api.ts
lib/api-client-react/src/generated/api.schemas.ts
```

Generated files are committed to the repo (so consumers do not need to run codegen to build), and CI enforces that the committed output matches what the generator would produce.

---

## 2. `lib/api-spec` — OpenAPI source of truth

**Purpose:** owns the single source of truth for the API shape plus the codegen configuration.

**Key files:**
- `lib/api-spec/openapi.yaml` — the hand-edited OpenAPI 3.1 spec. All endpoint paths, request/response schemas, query/body parameters, and `components/schemas` live here.
- `lib/api-spec/orval.config.ts` — the Orval configuration that drives generation of both the React Query client and the Zod schemas.
- `lib/api-spec/package.json` — declares the `codegen` script.

**Treat as hand-edited:**
- `openapi.yaml`
- `orval.config.ts`
- `package.json` (when the codegen pipeline itself changes)

**Notes:**
- The spec `info.title` is pinned to `"Api"` by a transformer in `orval.config.ts`. Do not rename it — import paths in downstream generated output assume this title.
- The spec uses `servers:` with `url: /api`; the client applies the base URL via `custom-fetch.ts` rather than baking in a host.

---

## 3. `lib/api-zod` — Generated Zod schemas

**Purpose:** provides runtime-validated Zod schemas for every request body, response body, query parameter, and path parameter described in `openapi.yaml`.

**Key files:**
- `lib/api-zod/src/generated/api.ts` — **generated**. Do not hand-edit.
- `lib/api-zod/src/index.ts` — **generated** by the `codegen` script as a re-export surface (`export * from "./generated/api";`). Do not hand-edit.
- `lib/api-zod/README.md` — hand-maintained usage guide. This is the authoritative developer entry point for the codegen step. If it disagrees with this doc, prefer the README.

**Orval options that shape the output:**
- `coerce` is enabled for query/param/body/response to make Zod coerce primitives at the edge (`boolean`, `number`, `string`, `bigint`, `date` as appropriate).
- `useDates: true` and `useBigInt: true` — date and bigint fields are emitted as real `Date` / `bigint` types at the schema boundary.
- `clean: true` — regeneration wipes `src/generated/` before writing, so stale files cannot linger.

**Consumers:** backend validators (request validation), scripts that need to check payload shape, and any frontend code that needs Zod-level validation rather than just TypeScript types.

---

## 4. `lib/api-client-react` — Generated React Query client

**Purpose:** provides a typed React Query client (`useQuery` / `useMutation` hooks), plus generated TypeScript types for every request and response.

**Key files:**
- `lib/api-client-react/src/generated/api.ts` — **generated** (React Query hooks + fetcher glue). Do not hand-edit.
- `lib/api-client-react/src/generated/api.schemas.ts` — **generated** (TypeScript types / interfaces for request and response shapes). Do not hand-edit.
- `lib/api-client-react/src/custom-fetch.ts` — **hand-maintained** fetcher used as the Orval `mutator`. It owns base URL, auth token getter, extra headers, and the global `onApiError` hook. This is the right place to change cross-cutting fetch behavior; it is not regenerated.
- `lib/api-client-react/src/index.ts` — **hand-maintained** public surface re-exporting generated types/hooks alongside `customFetch`, `setBaseUrl`, `setAuthTokenGetter`, `setExtraHeaders`, `setOnApiError`, `ApiError`, and `ResponseParseError`.
- Small adapter modules next to the generated output (e.g. `modification-markers.ts`, `step-trends.ts`, `program-target-phase-history.ts`, `behavior-target-annotations.ts`) — **hand-maintained**. These stand on top of the generated surface; do not mistake them for generated code, and do not move endpoint logic into them.

**Orval options that shape the output:**
- `client: "react-query"` with `mode: "split"` — one file for hooks, one for schemas.
- `baseUrl: "/api"` — same `/api` prefix as the spec's `servers:` entry; the real host is applied at runtime via `setBaseUrl`.
- `mutator` points at `custom-fetch.ts` so every generated hook goes through the same fetch path (auth, error normalization, etc.).
- `includeHttpResponseReturnType: false` — hooks return parsed data, not raw `Response` objects.
- `clean: true` — regeneration wipes `src/generated/`.

---

## 5. How to make an API change safely

The normal flow for any API change is:

1. **Edit the spec.** Update `lib/api-spec/openapi.yaml` at the endpoint or `components/schemas` entry.
2. **Regenerate.** Run the codegen command (see section 6).
3. **Update server and client call sites** to use the regenerated types/hooks/schemas.
4. **Commit `openapi.yaml` together with the regenerated output.** The spec change and the generated artifacts must land in the same commit so reviewers (and CI) see a consistent pair.

Common shapes:
- **New request body field** — add it to the schema referenced by the endpoint's `requestBody`, then regenerate.
- **New query parameter** — add an entry under the endpoint's `parameters`, then regenerate.
- **New response field** — add it to the schema referenced by the endpoint's `responses`, then regenerate.

If a change adds a new endpoint:
- Add the path entry under `paths:` in `openapi.yaml`.
- Regenerate — a new hook will appear in `lib/api-client-react/src/generated/api.ts` and a matching Zod schema in `lib/api-zod/src/generated/api.ts`.
- Mount the server-side route using its existing router/policy conventions (per `docs/architecture/boundaries.md`, do not add new policy branches inline in `artifacts/api-server/src/routes/index.ts`).

---

## 6. Expected regenerate / check commands

**Regenerate (preferred, from repo root):**

```
pnpm --filter @workspace/api-spec run codegen
```

This runs Orval with `lib/api-spec/orval.config.ts` and writes:
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/index.ts` (re-export shim, rewritten by the same script)
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`

**Drift check (preferred, from repo root):**

```
pnpm run check:api-codegen
```

This is the root script defined in `package.json` and it shells out to `scripts/check-api-codegen.sh`. The script:
1. Runs the `codegen` command above.
2. Runs `git diff --exit-code` against the generated files.
3. Fails (non-zero exit + printed diff) if the committed generated files do not match what the generator produces from `openapi.yaml`.

The drift check is part of the root `ci` script (`pnpm run ci`), which also runs tenant-scope lint and typecheck. Running `pnpm run check:api-codegen` locally before pushing is the fast way to catch "forgot to regenerate" mistakes.

> If a command above changes in the current code, prefer what `lib/api-zod/README.md` and the `package.json` scripts actually say.

---

## 7. What **not** to hand-edit

Never hand-edit these files; changes will be overwritten the next time codegen runs, and CI will fail the drift check:

- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/index.ts` (generated by the `codegen` script as a re-export shim)
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`

Each generated file carries a banner similar to `Generated by orval … Do not edit manually.` — treat that banner as authoritative.

---

## 8. What **is** hand-maintained alongside generated code

These files live next to generated output and **are** hand-edited:

- `lib/api-spec/openapi.yaml`
- `lib/api-spec/orval.config.ts`
- `lib/api-client-react/src/custom-fetch.ts`
- `lib/api-client-react/src/index.ts` (public barrel that re-exports both generated and hand-maintained modules)
- Small adapter modules in `lib/api-client-react/src/` that stand on top of the generated surface (e.g. modification markers, step trends, annotations helpers)
- `lib/api-zod/README.md`

Rule of thumb: if a file sits inside a `generated/` directory, it is generated. If it sits next to that directory, it is hand-maintained.

---

## 9. Warning against hand-rolled parallel contracts

Do **not**:
- Declare parallel request/response TypeScript types for an endpoint that already exists in `openapi.yaml`.
- Write a parallel Zod schema for a payload whose shape is defined in `openapi.yaml`.
- Wire a frontend surface to an endpoint using a bespoke fetch wrapper instead of the generated React Query hooks.
- Inline ad hoc request validation on the backend for an endpoint that already has a generated Zod schema in `lib/api-zod`.
- Re-declare DTOs under `artifacts/trellis/**` or `artifacts/api-server/**` for a surface that belongs in the generated contract.

Reasons this is a hard rule:
- Parallel shapes drift silently. The OpenAPI spec is the only place we can enforce "the frontend and backend agree"; as soon as there are two shapes, there is no single enforcement point.
- Generated code reviews are fast because reviewers can focus on the spec diff. Hand-rolled parallel contracts make review slow and error-prone.
- The CI drift check (`pnpm run check:api-codegen`) only guards generated files. Hand-rolled parallel contracts are outside its scope.

If a contract cannot be expressed in OpenAPI for a legitimate reason, surface that problem in review and document the exception explicitly — do not silently fork.

---

## 10. How to review an API change safely

When reviewing a PR that changes the API surface, check in this order:

1. **Does `openapi.yaml` change?**
   - If yes, does the diff match the reviewer's mental model of the change (new field, new endpoint, new parameter, etc.)?
   - If no, but generated files change, the PR is almost certainly wrong — generated files should only change as a consequence of spec changes.
2. **Are generated files regenerated consistently with the spec diff?**
   - Expect changes in `lib/api-zod/src/generated/api.ts`, `lib/api-client-react/src/generated/api.ts`, and `lib/api-client-react/src/generated/api.schemas.ts`.
   - The drift check (`pnpm run check:api-codegen`) will fail CI if the generated files are stale.
3. **No hand-edits to generated files?**
   - Scan any `src/generated/` diff for meaningful logic changes; those are a red flag. Legitimate diffs are regenerator output, not bespoke code.
4. **Server and client consumers are updated to use the generated surface?**
   - Frontend should call the generated React Query hooks, not a bespoke fetch.
   - Backend should validate with the generated Zod schemas where applicable, not hand-rolled equivalents.
5. **No parallel contract files introduced?**
   - Search for newly added TypeScript interfaces or Zod schemas that shadow an OpenAPI shape. If any, ask for them to be replaced by generated types.
6. **Route mounting follows assembly rules.**
   - Per `docs/architecture/boundaries.md`, do not add new policy branches inline in `artifacts/api-server/src/routes/index.ts`. New endpoints should mount through an existing router/policy module.
7. **Safe to regenerate locally.**
   - If anything feels inconsistent, run `pnpm --filter @workspace/api-spec run codegen` locally and diff; the generator is deterministic for a given spec + config.

---

## 11. What this doc is not

- Not a how-to for every specific endpoint-change shape. Prefer `lib/api-zod/README.md` for day-to-day examples.
- Not an architecture change. Nothing in the codegen pipeline, generated files, API routes, `package.json`, or workflows is modified by this doc.
- Not a deprecation or migration plan.
- Not a replacement for the CI drift check or the trust order in `docs/ENGINEER-ONBOARDING.md`.
