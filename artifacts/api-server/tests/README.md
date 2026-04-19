# API Server integration tests

These tests run against a real Postgres instance pointed at by `DATABASE_URL`
(typically the dev/test database). They speak HTTP via supertest against the
real express app, with `NODE_ENV=test` enabling the `x-test-*` header bypass on
the auth middleware (see `tests/setup.ts` and `tests/helpers.ts`).

## Keeping the test DB schema in sync

Helpers like `createDistrict()` insert through Drizzle, which derives the
`INSERT` column list from `lib/db/src/schema/`. If the live database is missing
any column listed there (for example a new `alert_digest_mode` or
`spike_alert_enabled` on `districts`), every test that inserts into the affected
table will fail with `column "..." of relation "..." does not exist`.

The canonical sync step is the `sync-test-db` script in `@workspace/db`:

```bash
pnpm --filter @workspace/db run sync-test-db
```

It wraps `drizzle-kit push --force` and answers the create-vs-rename prompts
non-interactively (always picking **create column**, the default highlighted
option — renames would lose data and the tests want the schema-side
definition). It runs automatically as the `pretest` hook for
`pnpm --filter api-server test`, so contributors and CI get the migration for
free before the suite starts.

The lower-level commands are still available if you need to drive the prompts
yourself:

```bash
pnpm --filter @workspace/db push          # interactive: prompts on add/rename ambiguity
pnpm --filter @workspace/db push-force    # same, with destructive changes pre-confirmed
```

The dev/test DB is shared. The `beforeAll` sweep in `tests/setup.ts` removes
zombie `Test District %` / `Sample-%` rows from previous aborted runs.

## Running

```bash
pnpm --filter api-server test                              # full suite (auto-syncs schema)
pnpm --filter api-server exec vitest run tests/scheduleUtils   # one file (skip auto-sync)
```

All HTTP paths in tests must be prefixed with `/api` — that is where
`src/app.ts` mounts the route tree.
