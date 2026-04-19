#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Provision the base schema declaratively from lib/db/src/schema/ first.
# All known runtime-added columns are now declared in the schema, so this is
# either a no-op or only adds new columns/indexes. push must come BEFORE the
# SQL migration runner because migration 001 (and others) backfill data
# against tables that push creates.
pnpm --filter @workspace/db push-force

# Apply pending SQL migrations from lib/db/src/migrations/ in order.
# Tracked in the _app_migrations table so this is idempotent.
pnpm --filter @workspace/db run migrate
