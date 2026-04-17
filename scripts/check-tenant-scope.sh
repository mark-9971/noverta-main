#!/usr/bin/env bash
# check-tenant-scope.sh
#
# CI guard: every route file that queries the database must carry one of the
# recognised tenant-scope signals below.  The PREFERRED pattern for any new
# district-scoped route is:
#
#   getEnforcedDistrictId()             — enforces district scope at call site
#
# The following additional signals are also accepted because the codebase
# contains legitimate route types that cannot use getEnforcedDistrictId:
#
#   A) getEnforcedDistrictId()          — explicit district-scope (preferred)
#   B) requirePlatformAdmin             — platform-admin-only (support/*)
#   C) requireGuardianScope             — guardian portal routes (token-scoped)
#   D) requireStudentScope              — student portal routes (token-scoped)
#   E) // tenant-scope: platform-admin  — explicit platform-admin annotation
#   F) // tenant-scope: public          — intentionally unauthenticated route
#   G) // tenant-scope: district-join   — scoped via FK joins (student→school→district)
#   H) // tenant-scope: guardian        — scoped via guardianId from auth token
#   I) // tenant-scope: student         — scoped via studentId from auth token
#   J) // tenant-scope: param-guard     — scoped via a route param guard
#
# WHY MULTIPLE ANNOTATIONS: New route files should default to getEnforcedDistrictId.
# The annotation-based signals exist for routes where the district scope is derived
# from an alternate token (guardian, student) or from a database join path (param-guard,
# district-join). Each annotation is pair-validated by a Tier-2 enforcement signal
# (see ANNOTATION_ENFORCEMENT map) so annotations cannot be added without runtime backing.
#
# SECOND-LAYER CHECK (annotation → enforcement signal):
#   Annotation-only compliance is not sufficient. Each annotation must be
#   accompanied by an enforcement signal that proves the scope is actually
#   applied at runtime, not just declared in a comment.
#
#   tenant-scope: platform-admin  → must also use requirePlatformAdmin
#   tenant-scope: guardian        → must also use tenantGuardianId or requireGuardianScope
#   tenant-scope: student         → must also use tenantStudentId or requireStudentScope
#   tenant-scope: param-guard     → must use assertXxxInCallerDistrict, registerXxx,
#                                   or enforceDistrictScope (param guards run via
#                                   app.param() registrations before the handler)
#   tenant-scope: district-join   → must use .where( or eq( (an actual DB filter)
#   tenant-scope: public          → no additional signal required
#   getEnforcedDistrictId present → no annotation required (code IS the signal)
#
# Files that do not import @workspace/db are skipped.
# Pure orchestration/utility files (index.ts, shared.ts) are skipped.
#
# Usage:  bash scripts/check-tenant-scope.sh
# Exit 0: all files pass  |  Exit 1: one or more files fail

set -euo pipefail

node - << 'NODEEOF'
const fs = require('fs');
const path = require('path');

function* walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.includes('node_modules')) yield* walkDir(full);
    else if (entry.name.endsWith('.ts')) yield full;
  }
}

const SKIP_FILES = new Set(['index.ts', 'shared.ts']);

// Tier-1: at least one of these must be present.
const SCOPE_PATTERNS = [
  'getEnforcedDistrictId',
  'requirePlatformAdmin',
  'requireGuardianScope',
  'requireStudentScope',
  'tenant-scope: platform-admin',
  'tenant-scope: public',
  'tenant-scope: district-join',
  'tenant-scope: guardian',
  'tenant-scope: student',
  'tenant-scope: param-guard',
];

// Tier-2: when a file relies solely on a comment annotation (no enforcement
// function present), verify that the annotation is backed by a matching
// enforcement signal. Files that call getEnforcedDistrictId() directly are
// exempt from tier-2 (their code IS the signal).
//
// Map: annotation substring → array of acceptable enforcement signal substrings
// (at least one must appear in the file).
const ANNOTATION_ENFORCEMENT = {
  'tenant-scope: platform-admin':  ['requirePlatformAdmin'],
  'tenant-scope: guardian':        ['tenantGuardianId', 'requireGuardianScope'],
  'tenant-scope: student':         ['tenantStudentId', 'requireStudentScope'],
  'tenant-scope: param-guard':     ['assertStudentInCallerDistrict', 'assertStaffInCallerDistrict',
                                    'assertSchoolInCallerDistrict', 'assertClaimInCallerDistrict',
                                    'assertGuardianInCallerDistrict', 'assertAlertInCallerDistrict',
                                    'assertIncidentInCallerDistrict', 'registerStudentIdParam',
                                    'registerStaffIdParam', 'registerSchoolIdParam',
                                    'registerClaimIdParam', 'registerIncidentIdParam',
                                    'enforceDistrictScope', 'getEnforcedDistrictId'],
  'tenant-scope: district-join':   ['.where(', 'eq(', 'and(', 'inArray('],
  // 'tenant-scope: public' has no second-layer requirement.
};

let checked = 0, failed = 0;
const failures = [];

for (const file of walkDir('artifacts/api-server/src/routes')) {
  if (SKIP_FILES.has(path.basename(file))) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('@workspace/db')) continue;
  checked++;

  // Tier-1: must carry at least one scope signal.
  if (!SCOPE_PATTERNS.some(p => content.includes(p))) {
    failures.push(`MISSING TENANT SCOPE: ${file}`);
    failures.push(`  → Add getEnforcedDistrictId(), requirePlatformAdmin, requireGuardianScope,`);
    failures.push(`    or a // tenant-scope: <type> annotation (public|district-join|guardian|student|param-guard|platform-admin).`);
    failed++;
    continue;
  }

  // Skip tier-2 for files that use enforcement functions directly.
  if (content.includes('getEnforcedDistrictId') ||
      content.includes('requirePlatformAdmin') ||
      content.includes('requireGuardianScope') ||
      content.includes('requireStudentScope')) {
    continue;
  }

  // Tier-2: annotation-only files must have a matching enforcement signal.
  for (const [annotation, signals] of Object.entries(ANNOTATION_ENFORCEMENT)) {
    if (!content.includes(annotation)) continue;
    if (!signals.some(s => content.includes(s))) {
      failures.push(`ANNOTATION WITHOUT ENFORCEMENT: ${file}`);
      failures.push(`  → "${annotation}" declared but no enforcement signal found.`);
      failures.push(`    Expected one of: ${signals.join(', ')}`);
      failed++;
    }
  }
}

for (const line of failures) console.error(line);
console.log(`Tenant scope check: ${checked} files checked, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
NODEEOF
