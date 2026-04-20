#!/usr/bin/env bash
# Fail fast if any new route file under artifacts/api-server/src/routes/
# touches a tenant-scoped table without importing at least one scope helper.
#
# Heuristic (NOT a substitute for code review, but catches the obvious case
# of a new route file shipping with no district guard at all):
#
#   For every .ts under routes/ that contains a `from <tenant_table>` Drizzle
#   query, require at least one of:
#     - getEnforcedDistrictId
#     - assert*InCallerDistrict
#     - requireGuardianScope
#     - resolveAuthorizedStudentId
#     - tenantDistrictId        (legal/admin pattern)
#     - sdFilters.districtId    (dashboard helper pattern)
#     - verifyStudentInDistrict (parentMessages local helper)
#
# Exit codes:
#   0 — all route files import a recognised scope helper (or have no tenant
#       table reference)
#   1 — one or more route files reference a tenant table but import no helper
set -euo pipefail

ROUTES=artifacts/api-server/src/routes
if [[ ! -d "$ROUTES" ]]; then
  echo "scope-helper check: $ROUTES not found, nothing to do" >&2
  exit 0
fi

TENANT_TABLES=(
  studentsTable staffTable schoolsTable
  sessionLogsTable serviceRequirementsTable
  iepDocumentsTable iepGoalsTable iepAccommodationsTable
  alertsTable complianceEventsTable complianceTimelineTable
  compensatoryObligationsTable
  evaluationsTable evaluationReferralsTable eligibilityDeterminationsTable
  teamMeetingsTable transitionPlansTable
  scheduleBlocksTable coverageInstancesTable
  fbasTable fbaObservationsTable functionalAnalysesTable
  behaviorInterventionPlansTable bipImplementersTable
  behaviorTargetsTable programTargetsTable programStepsTable
  serviceTypesTable cptCodeMappingsTable
)
HELPERS=(
  # Canonical helpers (lib/districtScope.ts)
  getEnforcedDistrictId
  assert[A-Z][A-Za-z]*InCallerDistrict
  requireGuardianScope
  resolveAuthorizedStudentId
  tenantDistrictId
  sdFilters
  verifyStudentInDistrict
  studentDistrictPredicate
  staffDistrictPredicate
  # Legacy / route-local but verified-equivalent patterns
  # (kept as a transition allowlist — migrate to canonical helpers over time
  # and remove from this list. Each entry below is a *scope* pull, NOT a
  # role check — role checks like requireRoles/PRIVILEGED_ROLES are
  # intentionally excluded because passing a role check does not by itself
  # prevent cross-tenant data leakage.)
  getDistrictId            # compensatoryFinance/shared.ts — pulls caller's districtId
  resolveDistrictId        # rollover.ts pattern — returns meta.districtId
  requireDemoDistrict      # demoControl.ts — validates is_demo=true on caller districtId
  parseDistrictId          # support.ts — super-admin reads explicit districtId param
  studentIdParamGuard      # students/idGuard.ts — param guard that 404s on cross-district
  caseloadFilter           # caseload-narrowing helper — derived from caller scope
)

# Build alternation regexes once.
TT_RE="$(IFS='|'; echo "${TENANT_TABLES[*]}")"
HE_RE="$(IFS='|'; echo "${HELPERS[*]}")"

bad=0
while IFS= read -r -d '' f; do
  # Fast path: skip files that don't reference a tenant table at all.
  if ! grep -Eq "(from |\.from\()(.*)(${TT_RE})" "$f"; then
    continue
  fi
  # Skip internal helper modules that don't register HTTP routes —
  # they take districtId as a parameter from already-scoped callers,
  # so the scope check belongs at the caller, not here.
  if ! grep -Eq "router\.(get|post|put|delete|patch)\(" "$f"; then
    continue
  fi
  # Bypass: existing codebase convention — a top-of-file comment
  #   // tenant-scope: <reason>
  # marks files that are scoped via JOIN paths or are intentionally
  # cross-tenant (super-admin, public/portal). The reason MUST be one of
  # a closed set so the bypass cannot be abused with a free-form comment;
  # adding a new reason requires editing this script and a code-review
  # decision about whether the new pattern actually defeats tenant
  # isolation. The comment may appear on any of the first 10 lines.
  #
  # Permitted reasons (extend deliberately, not casually):
  #   district-join   — handler scopes via SQL JOIN to caller districtId
  #   super-admin     — handler is gated by requirePlatformAdmin and is
  #                     intentionally cross-tenant (e.g. benchmarks)
  #   public          — unauthenticated public route (e.g. /health, /demo-requests)
  #   portal          — student/guardian portal whose tenant boundary is
  #                     the portal JWT, not district
  #   regression-pin  — this file is a vitest regression suite, not a route
  #   by-design       — fully justified in an inline block-comment below
  PERMITTED_REASONS='(district-join|super-admin|public|portal|regression-pin|by-design)'
  if head -n 10 "$f" | grep -Eq "^// tenant-scope: ${PERMITTED_REASONS}(\b|$)"; then
    continue
  fi
  # If the file has a tenant-scope comment but the reason is not in the
  # permitted set, fail loudly with a hint instead of silently allowing it.
  if head -n 10 "$f" | grep -Eq "^// tenant-scope:"; then
    rel="${f#$PWD/}"
    bad_reason="$(head -n 10 "$f" | grep -Eo '^// tenant-scope: \S+' | head -1)"
    echo "::error file=${rel}:: tenant-scope reason not in permitted set: ${bad_reason}"
    echo "  permitted: district-join | super-admin | public | portal | regression-pin | by-design"
    echo "  to add a new reason, edit scripts/check-scope-helper-imports.sh and document the rationale"
    bad=1
    continue
  fi
  if ! grep -Eq "${HE_RE}" "$f"; then
    rel="${f#$PWD/}"
    echo "::error file=${rel}:: route file queries a tenant-scoped table but imports no district scope helper"
    echo "  hint: import getEnforcedDistrictId or an assert*InCallerDistrict from ../lib/districtScope"
    echo "  bypass: if intentional (super-admin/public/portal/scoped-via-join), add a top-of-file comment:"
    echo "          // tenant-scope: <reason>      (see existing examples in routes/dashboard/)"
    bad=1
  fi
done < <(find "$ROUTES" -type f -name '*.ts' -print0)

if (( bad )); then
  echo ""
  echo "scope-helper check FAILED — see ::error annotations above" >&2
  exit 1
fi
echo "scope-helper check OK — every route file with a tenant-table query imports a scope helper"
