# @workspace/api-zod

Auto-generated Zod validation schemas for the Noverta API.

## DO NOT hand-edit `src/generated/api.ts`

This file is produced by [Orval](https://orval.dev/) from the OpenAPI specification.
Any manual changes will be overwritten the next time codegen runs.

## Making schema changes

1. Edit the source of truth: **`lib/api-spec/openapi.yaml`**
2. Re-run the generator:
   ```
   pnpm --filter @workspace/api-spec run codegen
   ```
3. Commit both `openapi.yaml` and the regenerated `src/generated/api.ts` together.

## Adding a new field to an existing schema

Find the relevant `components/schemas` entry (or endpoint `parameters` block) in
`openapi.yaml` and add the field there. Then regenerate. Common examples:

- **Request body field** → add to the schema referenced by the endpoint's `requestBody`
- **Query parameter** → add a `- name: …` entry under the endpoint's `parameters`
- **Response field** → add to the schema referenced by the endpoint's `responses`

## CI guard against schema drift

A CI check enforces that the committed `src/generated/api.ts` always matches
what the generator produces from `lib/api-spec/openapi.yaml`. The check lives
in `scripts/check-api-codegen.sh` and is wired into the workspace `ci` script
(via `pnpm run check:api-codegen`).

It runs the generator and then `git diff --exit-code` on the generated files.
If you forget to commit the regenerated output — or hand-edit the generated
file directly — the check fails and prints the diff.

Run it locally:

```
pnpm run check:api-codegen
```

To fix a failing run, regenerate and commit:

```
pnpm --filter @workspace/api-spec run codegen
git add lib/api-zod/src/generated/api.ts lib/api-zod/src/index.ts \
        lib/api-client-react/src/generated/api.ts \
        lib/api-client-react/src/generated/api.schemas.ts
git commit
```
