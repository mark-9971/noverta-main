#!/usr/bin/env bash
# check-tenant-scope.sh
#
# CI guard: every route file that queries the database must satisfy the
# REQUIRED enforcement policy below, or appear in the explicit ALLOWLIST.
#
# ──────────────────────────────────────────────────────────────────────────
# REQUIRED POLICY (for all new route files)
# ──────────────────────────────────────────────────────────────────────────
#
#   A) getEnforcedDistrictId()  — calls the shared district-scope enforcer;
#                                 preferred path for every district route.
#
#   B) requirePlatformAdmin     — Clerk + role check restricting the route to
#                                 platform-admin users only; must also carry:
#                                   // tenant-scope: platform-admin
#
# Any file that does not use (A) or (B) MUST be listed in SCOPE_ALLOWLIST
# below with a documented reason.  Adding a file to the allowlist is a
# deliberate, reviewable decision — not a workaround.
#
# ──────────────────────────────────────────────────────────────────────────
# EXPLICIT ALLOWLIST (pre-approved exceptions — do NOT expand without review)
# ──────────────────────────────────────────────────────────────────────────
#
# Each entry: relative path from artifacts/api-server/src/routes/ → scope type
#
# Allowlisted files must ALSO carry the matching // tenant-scope: <type>
# annotation AND at least one Tier-2 enforcement signal (see ANNOTATION_ENFORCEMENT).
#
# To add a new exception: add the relative path here with a reason, add the
# annotation to the file, confirm a Tier-2 signal is present, and get a PR review.
#
# Scope types in use:
#   public        — unauthenticated endpoint; no tenant scope required
#   guardian      — scoped via requireGuardianScope + guardian JWT token
#   student       — scoped via requireStudentScope + student JWT token
#   param-guard   — scoped via app.param() handler before the route runs
#   district-join — district scoped via FK join path (student→school→district)
#                   Must carry at least one DB filter (.where, eq, and, inArray)
#
# Files that do not import @workspace/db are skipped entirely.
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

const ROUTES_ROOT = 'artifacts/api-server/src/routes';
const SKIP_FILES = new Set(['index.ts', 'shared.ts']);

// ─────────────────────────────────────────────────────────────────────────────
// EXPLICIT ALLOWLIST
// Key: relative path from artifacts/api-server/src/routes/
// Value: scope type matching the // tenant-scope: <type> annotation on the file
// ─────────────────────────────────────────────────────────────────────────────
const SCOPE_ALLOWLIST = {
  // ── public: unauthenticated endpoints ──────────────────────────────────────
  'health.ts':                                 'public',
  'demoRequests.ts':                           'public',
  'parentCommunication/sharedProgressPublic.ts': 'public',

  // ── student: scoped via requireStudentScope + student JWT token ────────────
  'studentPortal.ts':                          'student',

  // ── guardian: scoped via requireGuardianScope + guardian JWT token ─────────
  'guardianPortal.ts':                         'guardian',
  'parentMessages/guardianPortal.ts':          'guardian',

  // ── param-guard: district derived via app.param() before handler runs ──────
  'documents.ts':                              'param-guard',

  // ── district-join: rows filtered via FK join paths ─────────────────────────
  // These files have been individually reviewed to confirm every DB query
  // carries a .where() / eq() / inArray() clause that transitively limits
  // results to the caller's district.  New district-join files must use
  // getEnforcedDistrictId() instead; only add here if a join path is the
  // only feasible enforcement mechanism.
  'additionalFeatures.ts':                     'district-join',
  'agencies/contracts.ts':                     'district-join',
  'agencies/crud.ts':                          'district-join',
  'agencies/staffLinks.ts':                    'district-join',
  'agencies/utilization.ts':                   'district-join',
  'alerts.ts':                                 'district-join',
  'analytics/behaviorSummary.ts':              'district-join',
  'analytics/minutesSummary.ts':               'district-join',
  'analytics/overview.ts':                     'district-join',
  'analytics/programSummary.ts':               'district-join',
  'analytics/protectiveMeasures.ts':           'district-join',
  'analytics/studentAnalytics.ts':             'district-join',
  'auditLog.ts':                               'district-join',
  'billing.ts':                                'district-join',
  'compensatory.ts':                           'district-join',
  'compensatoryFinance/burndown.ts':           'district-join',
  'compensatoryFinance/export.ts':             'district-join',
  'compensatoryFinance/overview.ts':           'district-join',
  'compensatoryFinance/rates.ts':              'district-join',
  'compensatoryFinance/students.ts':           'district-join',
  'complianceChecklist.ts':                    'district-join',
  'complianceTimeline.ts':                     'district-join',
  'dashboard/alerts.ts':                       'district-join',
  'dashboard/chartsData.ts':                   'district-join',
  'dashboard/complianceMetrics.ts':            'district-join',
  'dashboard/overviewStats.ts':                'district-join',
  'fba/abcData.ts':                            'district-join',
  'fba/bipManagement.ts':                      'district-join',
  'fba/fbaCrud.ts':                            'district-join',
  'fba/functionalAnalysis.ts':                 'district-join',
  'guardians.ts':                              'district-join',
  'iepBuilder/context.ts':                     'district-join',
  'iepBuilder/drafts.ts':                      'district-join',
  'iepBuilder/generate.ts':                    'district-join',
  'iepMeetings/attendees.ts':                  'district-join',
  'iepMeetings/crud.ts':                       'district-join',
  'iepMeetings/notesMinutes.ts':               'district-join',
  'iepMeetings/scheduling.ts':                 'district-join',
  'iepSuggestions.ts':                         'district-join',
  'imports/validate.ts':                       'district-join',
  'legal.ts':                                  'district-join',
  'medicaidBilling/analytics.ts':              'district-join',
  'medicaidBilling/claims.ts':                 'district-join',
  'medicaidBilling/cptMappings.ts':            'district-join',
  'medicaidBilling/reports.ts':                'district-join',
  'para.ts':                                   'district-join',
  'parentCommunication/contacts.ts':           'district-join',
  'parentCommunication/progressSharing.ts':    'district-join',
  'parentMessages/conferences.ts':             'district-join',
  'parentMessages/staffMessages.ts':           'district-join',
  'programData/analytics.ts':                  'district-join',
  'programData/crud.ts':                       'district-join',
  'programData/dataCollection.ts':             'district-join',
  'programData/templates.ts':                  'district-join',
  'protectiveMeasures/analytics.ts':           'district-join',
  'protectiveMeasures/notifications.ts':       'district-join',
  'protectiveMeasures/transitions.ts':         'district-join',
  'recentlyDeleted.ts':                        'district-join',
  'reportExports/complianceReports.ts':        'district-join',
  'reportExports/csvExports.ts':               'district-join',
  'reportExports/historyAndScheduled.ts':      'district-join',
  'reportExports/providerReports.ts':          'district-join',
  'rollover.ts':                               'district-join',
  'schedules/scheduler.ts':                    'district-join',
  'sessions/reports.ts':                       'district-join',
  'sisIntegration.ts':                         'district-join',
  'studentNotes.ts':                           'district-join',
  'students/emergencyContacts.ts':             'district-join',
  'students/enrollment.ts':                    'district-join',
  'students/medicalAlerts.ts':                 'district-join',
  'students/snapshot.ts':                      'district-join',
  'supervision.ts':                            'district-join',
  'transitions.ts':                            'district-join',
};

// Tier-2: annotation → required enforcement signal(s).
// Every allowlisted file (and every platform-admin annotated file) must also
// contain at least one of these strings to prove runtime enforcement.
const ANNOTATION_ENFORCEMENT = {
  'tenant-scope: platform-admin':  ['requirePlatformAdmin'],
  'tenant-scope: guardian':        ['requireGuardianScope', 'tenantGuardianId'],
  'tenant-scope: student':         ['requireStudentScope', 'tenantStudentId'],
  'tenant-scope: param-guard':     [
    'assertStudentInCallerDistrict', 'assertStaffInCallerDistrict',
    'assertSchoolInCallerDistrict', 'assertClaimInCallerDistrict',
    'assertGuardianInCallerDistrict', 'assertAlertInCallerDistrict',
    'assertIncidentInCallerDistrict', 'registerStudentIdParam',
    'registerStaffIdParam', 'registerSchoolIdParam',
    'registerClaimIdParam', 'registerIncidentIdParam',
    'enforceDistrictScope', 'getEnforcedDistrictId',
  ],
  'tenant-scope: district-join':   ['.where(', 'eq(', 'and(', 'inArray('],
  // 'tenant-scope: public' has no Tier-2 requirement.
};

let checked = 0, failed = 0;
const failures = [];

for (const file of walkDir(ROUTES_ROOT)) {
  const basename = path.basename(file);
  if (SKIP_FILES.has(basename)) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('@workspace/db')) continue;
  checked++;

  const relPath      = file.replace(ROUTES_ROOT + '/', '');
  const allowedScope = SCOPE_ALLOWLIST[relPath];
  const usesEnforced = content.includes('getEnforcedDistrictId');
  const usesPlatformAdmin = content.includes('requirePlatformAdmin');

  // ── ALLOWLISTED FILE ────────────────────────────────────────────────────
  // Check first so that mixed files (e.g. billing.ts which has both
  // requirePlatformAdmin and resolveDistrictIdForCaller) use the allowlist
  // path rather than the platform-admin path.
  if (allowedScope) {
    const annotation = `tenant-scope: ${allowedScope}`;
    if (!content.includes(annotation)) {
      failures.push(`ALLOWLIST ANNOTATION MISMATCH: ${file}`);
      failures.push(`  → Allowlisted with scope "${allowedScope}" but // ${annotation} not found in file.`);
      failed++;
      continue;
    }
    // Tier-2: annotation must be backed by a runtime enforcement signal.
    const signals = ANNOTATION_ENFORCEMENT[annotation];
    if (signals && !signals.some(s => content.includes(s))) {
      failures.push(`ALLOWLIST ANNOTATION WITHOUT ENFORCEMENT: ${file}`);
      failures.push(`  → "${annotation}" declared but no enforcement signal found.`);
      failures.push(`    Expected one of: ${signals.slice(0, 6).join(', ')}${signals.length > 6 ? ', ...' : ''}`);
      failed++;
    }
    continue;
  }

  // ── REQUIRED POLICY (A): getEnforcedDistrictId ─────────────────────────
  if (usesEnforced) continue; // code IS the enforcement signal — pass

  // ── REQUIRED POLICY (B): requirePlatformAdmin + annotation ─────────────
  if (usesPlatformAdmin) {
    if (!content.includes('tenant-scope: platform-admin')) {
      failures.push(`MISSING PLATFORM-ADMIN ANNOTATION: ${file}`);
      failures.push(`  → Uses requirePlatformAdmin but lacks // tenant-scope: platform-admin annotation.`);
      failed++;
    }
    continue;
  }

  // ── NOT IN ALLOWLIST AND USES NO ENFORCEMENT FUNCTION ──────────────────
  failures.push(`MISSING TENANT SCOPE: ${file}`);
  failures.push(`  → New route files must call getEnforcedDistrictId() to enforce district scope.`);
  failures.push(`  → Platform-admin-only routes must use requirePlatformAdmin + // tenant-scope: platform-admin.`);
  failures.push(`  → If neither applies, add "${relPath}" to SCOPE_ALLOWLIST in scripts/check-tenant-scope.sh`);
  failures.push(`    with a documented scope type and ensure the appropriate annotation is in the file.`);
  failed++;
}

for (const line of failures) console.error(line);
console.log(`Tenant scope check: ${checked} files checked, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
NODEEOF
