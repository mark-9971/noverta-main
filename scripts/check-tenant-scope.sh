#!/usr/bin/env bash
# check-tenant-scope.sh
#
# CI guard: every route file that queries the database must carry one of:
#
#   A) getEnforcedDistrictId()          — explicit district-scope (preferred)
#   B) requirePlatformAdmin             — platform-admin-only (support/*)
#   C) requireGuardianScope             — guardian portal routes
#   D) requireStudentScope              — student portal routes
#   E) // tenant-scope: platform-admin  — explicit platform-admin annotation
#   F) // tenant-scope: public          — intentionally unauthenticated route
#   G) // tenant-scope: district-join   — scoped via FK joins (student→school→district)
#   H) // tenant-scope: guardian        — scoped via guardianId from auth token
#   I) // tenant-scope: student         — scoped via studentId from auth token
#   J) // tenant-scope: param-guard     — scoped via a route param guard
#
# Files that do not import @workspace/db are skipped.
# Pure orchestration/utility files (index.ts, shared.ts) are skipped.
#
# ENFORCEMENT INTENT: Every new route file added must carry one of the above
# annotations before landing in main. All existing files are annotated as of
# migration 019 (imports district_id backfill).
#
# Usage:  bash scripts/check-tenant-scope.sh
# Exit 0: all files annotated  |  Exit 1: one or more files missing

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

let checked = 0, failed = 0;
for (const file of walkDir('artifacts/api-server/src/routes')) {
  if (SKIP_FILES.has(path.basename(file))) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('@workspace/db')) continue;
  checked++;
  if (!SCOPE_PATTERNS.some(p => content.includes(p))) {
    console.error(`MISSING TENANT SCOPE: ${file}`);
    console.error(`  → Add getEnforcedDistrictId(), requirePlatformAdmin, requireGuardianScope,`);
    console.error(`    or a // tenant-scope: <type> annotation (public|district-join|guardian|student|param-guard|platform-admin).`);
    failed++;
  }
}
console.log(`Tenant scope check: ${checked} files checked, ${failed} missing annotation.`);
process.exit(failed > 0 ? 1 : 0);
NODEEOF
