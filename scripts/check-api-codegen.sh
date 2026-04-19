#!/usr/bin/env bash
# check-api-codegen.sh
#
# CI guard: ensures the generated Zod schemas in
# `lib/api-zod/src/generated/api.ts` are up-to-date with the OpenAPI source
# of truth in `lib/api-spec/openapi.yaml`.
#
# How it works:
#   1. Runs `pnpm --filter @workspace/api-spec run codegen` to regenerate
#      the schemas from the current openapi.yaml.
#   2. Runs `git diff --exit-code` against the generated files. If the
#      regenerated output differs from what is committed, the check fails
#      with a non-zero exit code and prints the diff so reviewers can see
#      which schemas drifted.
#
# This catches two common mistakes:
#   - Editing `openapi.yaml` without re-running codegen
#   - Hand-editing the generated `api.ts` (which would be overwritten)
#
# Run locally:
#   bash scripts/check-api-codegen.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GENERATED_FILES=(
  "lib/api-zod/src/generated/api.ts"
  "lib/api-zod/src/index.ts"
  "lib/api-client-react/src/generated/api.ts"
  "lib/api-client-react/src/generated/api.schemas.ts"
)

echo "→ Regenerating API schemas from lib/api-spec/openapi.yaml..."
pnpm --filter @workspace/api-spec run codegen >/dev/null

echo "→ Checking for drift in generated files..."
if ! git diff --exit-code -- "${GENERATED_FILES[@]}"; then
  echo ""
  echo "✗ Generated API schemas are out of date."
  echo ""
  echo "  The files above differ from what is committed. This usually means"
  echo "  someone edited lib/api-spec/openapi.yaml without re-running codegen,"
  echo "  or hand-edited a generated file."
  echo ""
  echo "  Fix:"
  echo "    pnpm --filter @workspace/api-spec run codegen"
  echo "    git add ${GENERATED_FILES[*]}"
  echo "    git commit"
  echo ""
  exit 1
fi

echo "✓ Generated API schemas are in sync with openapi.yaml."
