# @workspace/api-zod

Auto-generated Zod validation schemas for the Trellis API.

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
