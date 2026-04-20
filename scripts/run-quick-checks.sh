#!/usr/bin/env bash
# Quick parallel checks: typecheck + scope-helper grep + api-codegen drift.
#
# Used as a fast pre-commit/pre-review gate. Runs in parallel and aggregates
# exit codes so a single failure surfaces clearly. Designed to finish in
# < 30 seconds on a warm cache.
#
# What runs:
#   - tsc --noEmit on api-server (LSP-equivalent for the backend)
#   - tsc --noEmit on trellis (LSP-equivalent for the frontend)
#   - scripts/check-scope-helper-imports.sh (custom tenant-isolation grep)
#   - scripts/check-api-codegen.sh (Zod/OpenAPI drift)
#
# What does NOT run (intentional — slower, run separately):
#   - vitest suites (use `test-tenant`, `test-bucket-a`, `test-dashboard`)
#   - playwright e2e (use `e2e-incidents` only when UI flows changed)
#   - dep-audit / sast (run hourly via the security_scan skill — JS callbacks,
#     not shell, see scripts/security/README.md)
set -uo pipefail

results=()
fail=0
log_dir="$(mktemp -d)"
trap 'rm -rf "$log_dir"' EXIT

run() {
  local name="$1"; shift
  local logf="$log_dir/$name.log"
  ( "$@" ) > "$logf" 2>&1 &
  local pid=$!
  echo "$pid:$name:$logf"
}

procs=(
  "$(run lsp-api    pnpm --filter @workspace/api-server exec tsc --noEmit -p tsconfig.json)"
  "$(run lsp-web    pnpm --filter @workspace/trellis exec tsc --noEmit -p tsconfig.json)"
  "$(run scope-grep bash scripts/check-scope-helper-imports.sh)"
  "$(run codegen    bash scripts/check-api-codegen.sh)"
)

for entry in "${procs[@]}"; do
  pid="${entry%%:*}"
  rest="${entry#*:}"
  name="${rest%%:*}"
  logf="${rest#*:}"
  if wait "$pid"; then
    results+=("PASS  $name")
  else
    results+=("FAIL  $name  (log: $logf)")
    fail=1
    echo ""
    echo "===== $name failed — last 30 lines ====="
    tail -n 30 "$logf"
    echo "===== end $name ====="
    echo ""
  fi
done

echo ""
echo "Quick-check summary:"
printf '  %s\n' "${results[@]}"
exit "$fail"
