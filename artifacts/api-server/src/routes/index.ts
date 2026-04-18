import { Router, type IRouter } from "express";
import { requireAuth, requireRoles, requireDistrictScope } from "../middlewares/auth";
import healthRouter from "./health";
import schoolsRouter from "./schools";
import studentsRouter from "./students";
import staffRouter from "./staff";
import servicesRouter from "./services";
import sessionsRouter from "./sessions";
import schedulesRouter from "./schedules";
import alertsRouter from "./alerts";
import dashboardRouter from "./dashboard";
import minuteProgressRouter from "./minuteProgress";
import reportsRouter from "./reports";
import importsRouter from "./imports";
import programDataRouter from "./programData";
import iepRouter from "./iep";
import complianceTimelineRouter from "./complianceTimeline";
import additionalFeaturesRouter from "./additionalFeatures";
import protectiveMeasuresRouter from "./protectiveMeasures";
import analyticsRouter from "./analytics";
import preferenceAssessmentsRouter from "./preferenceAssessments";
import classesRouter from "./classes";
import assignmentsRouter from "./assignments";
import iepSuggestionsRouter from "./iepSuggestions";
import classroomRouter from "./classroom";
import districtsRouter from "./districts";
import fbaRouter from "./fba";
import iepBuilderRouter from "./iepBuilder";
import resourceManagementRouter from "./resourceManagement";
import caseloadBalancingRouter from "./caseloadBalancing";
import compensatoryRouter from "./compensatory";
import parentCommunicationRouter from "./parentCommunication";
import sharedProgressPublicRouter from "./parentCommunication/sharedProgressPublic";
import complianceSnapshotRouter, { complianceSnapshotPublicRouter } from "./complianceSnapshot";
import supervisionRouter from "./supervision";
import paraRouter from "./para";
import auditLogRouter from "./auditLog";
import recentlyDeletedRouter from "./recentlyDeleted";
import onboardingRouter from "./onboarding";
import evaluationsRouter from "./evaluations";
import transitionsRouter from "./transitions";
import iepMeetingsRouter from "./iepMeetings";
import storageRouter from "./storage";
import documentsRouter from "./documents";
import complianceChecklistRouter from "./complianceChecklist";
import { stateReportingRouter } from "./stateReporting";
import sisIntegrationRouter from "./sisIntegration";
import studentPortalRouter from "./studentPortal";
import agenciesRouter from "./agencies";
import billingRouter from "./billing";
import adminReadinessRouter from "./adminReadiness";
import demoRequestsRouter from "./demoRequests";
import guardiansRouter from "./guardians";
import reportExportsRouter from "./reportExports";
import rolloverRouter from "./rollover";
import legalRouter from "./legal";
import generatedDocumentsRouter from "./generatedDocuments";
import communicationEventsRouter from "./communicationEvents";
import guardianPortalRouter from "./guardianPortal";
import parentMessagesRouter, { guardianMessagesRouter } from "./parentMessages";
import staffSchedulesRouter from "./staffSchedules";
import documentWorkflowRouter from "./documentWorkflow";
import studentNotesRouter from "./studentNotes";
import accommodationVerificationsRouter from "./accommodationVerifications";
import dataHealthRouter from "./dataHealth";
import supportRouter from "./support";
import medicaidBillingRouter from "./medicaidBilling";
import costAvoidanceRouter from "./costAvoidance";
import serviceForecastRouter from "./serviceForecast";
import compensatoryFinanceRouter from "./compensatoryFinance";
import sampleDataRouter from "./sampleData";
import { requireLegalAcceptance } from "../middlewares/requireLegalAcceptance";
import { createDbRateLimitMiddleware } from "../lib/dbRateLimiter";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(demoRequestsRouter);

// Public, unauthenticated parent share-link consumption. Mounted BEFORE
// requireAuth because the random token IS the capability — parents have no
// Clerk session. All hardening (rate limits, atomic claim, audit log) lives
// inside the router.
router.use(sharedProgressPublicRouter);

// Public, unauthenticated compliance snapshot consumption.
// GET /share/compliance/:token is the capability — no Clerk session required.
// POST /compliance/share-snapshot is authenticated and mounted after requireAuth below.
router.use(complianceSnapshotPublicRouter);

router.use(requireAuth);

// ── Global authenticated rate limit ─────────────────────────────────────────
// Applied immediately after requireAuth so every authenticated route is covered.
// 300 requests per minute per user is generous for interactive use while still
// providing a meaningful ceiling against bulk abuse or runaway clients.
const globalAuthRateLimit = createDbRateLimitMiddleware({
  endpointKey: "global",
  windowMs: 60 * 1000,
  max: 300,
});
router.use(globalAuthRateLimit);

// ── Tighter per-route overrides for write-heavy / sensitive endpoints ────────
// These are applied path-first so they are checked before the global limit
// bucket, giving independent accounting per sensitive operation.
const shareLinkCreateLimit = createDbRateLimitMiddleware({
  endpointKey: "share_link_create",
  windowMs: 60 * 1000,
  max: 10,
});
router.post("/share-links", shareLinkCreateLimit);
router.post("/share-links/", shareLinkCreateLimit);

const signatureRequestLimit = createDbRateLimitMiddleware({
  endpointKey: "signature_request",
  windowMs: 60 * 1000,
  max: 20,
});
router.post("/signature-requests", signatureRequestLimit);
router.post("/signature-requests/", signatureRequestLimit);

const csvUploadLimit = createDbRateLimitMiddleware({
  endpointKey: "csv_upload",
  windowMs: 60 * 1000,
  max: 10,
});
router.post("/imports", csvUploadLimit);
router.post("/imports/", csvUploadLimit);

// Guardian portal: scoped separately from district-authenticated routes.
// requireGuardianScope (inside guardianPortalRouter) handles its own auth & role enforcement.
// Mounted before requireDistrictScope because guardian accounts have no district claim.
// Must be path-scoped so requireGuardianScope inside the sub-router doesn't bleed
// into all other routes.
router.use("/guardian-portal", guardianPortalRouter);
router.use("/guardian-portal", guardianMessagesRouter);

// Global district scope enforcement: non-platform-admin users without a district claim
// in their token are blocked from all authenticated data routes. Platform admins pass through.
// Individual sub-routers may add supplementary district checks on top of this.
router.use(requireDistrictScope);

// Path-scoped role guards — applied before their respective routers so they only
// block sped_student (and where appropriate, lower-privilege roles) from staff-facing
// resources without leaking middleware across unrelated sub-routers.
const requireStaffOnly = requireRoles(
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para",
);
const requirePrivilegedStaffOnly = requireRoles(
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator",
);
// District scope: regular users without a district claim in their token are denied
// before reaching any student/session/staff data. Platform admins pass through.
router.use("/students", requireDistrictScope);
router.use("/sessions", requireDistrictScope);
router.use("/staff", requireDistrictScope);
// Role guards applied after district scope.
router.use("/students", requireStaffOnly);
router.use("/sessions", requireStaffOnly);
router.use("/staff", requireStaffOnly);
// Legal acceptance gate — must come after requireDistrictScope but before any data routers.
// Exempt only the two consent-flow endpoints; all other routes require acceptance.
// Exempt /guardian-portal/* (guardian accounts handle their own consent flow).
// sped_parent and sped_student role exemptions are handled inside the middleware.
router.use((req, res, next) => {
  const path = req.path;
  // Only exempt the two endpoints that must be reachable before acceptance to avoid
  // a circular dependency. All other /legal/* routes (report, request-dpa) require acceptance.
  const CONSENT_FLOW_EXEMPTIONS = ["/legal/acceptance-status", "/legal/accept"];
  if (CONSENT_FLOW_EXEMPTIONS.includes(path) || path.startsWith("/guardian-portal/")) {
    return next();
  }
  return requireLegalAcceptance(req, res, next);
});
// Scheduling data is staff-only; sped_students and unauthenticated callers must not see it.
router.use("/schedule-blocks", requireDistrictScope);
router.use("/schedule-blocks", requireStaffOnly);
router.use("/staff-assignments", requireDistrictScope);
router.use("/staff-assignments", requireStaffOnly);
router.use("/staff-schedules", requireDistrictScope);
router.use("/staff-schedules", requireStaffOnly);
router.use("/schedules/export", requireDistrictScope);
router.use("/schedules/export", requireStaffOnly);
// Reports router previously had a blanket router.use(requirePrivilegedStaff) with no
// path, which bled into every subsequent router. Scoped here instead.
router.use("/reports", requireRoles("admin", "coordinator", "case_manager", "sped_teacher", "bcba", "provider"));
// Export routes inherit the /reports guard above; this is a parallel allowlist, not narrower.
const requireReportExport = requireRoles("admin", "case_manager", "coordinator", "provider");
router.use("/reports/exports", requireReportExport);
// Incidents / protective measures — privileged staff plus providers (providers respond to and
// log behavioral incidents on their assigned students).
router.use("/protective-measures", requireRoles("admin", "coordinator", "case_manager", "sped_teacher", "bcba", "provider"));
router.use("/progress-reports", requirePrivilegedStaffOnly);
router.use("/document-workflow", requirePrivilegedStaffOnly);

// Classroom + academic + service catalog — staff-only.
// `/students/:id/...` paths (iep-goals-summary, progress-reports, classes,
// assignments, grades-summary) are already guarded by the `/students` block above.
const requireStaffOrStudent = requireRoles(
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para", "sped_student",
);
router.use("/teacher-observations", requireStaffOnly);
router.use("/progress-note-contributions", requirePrivilegedStaffOnly);
router.use("/classes", requireStaffOnly);
router.use("/students-with-enrollments", requireStaffOnly);
router.use("/teachers-with-classes", requireStaffOnly);
router.use("/assignments", requireStaffOnly);
router.use("/submissions", requireStaffOnly);
router.use("/teacher", requireStaffOnly);
router.use("/academics", requireStaffOnly);
// /student/:id/dashboard is the sped_student self-service dashboard — allow students.
router.use("/student", requireStaffOrStudent);
router.use("/service-types", requireStaffOnly);
router.use("/service-requirements", requireStaffOnly);
router.use("/schools", requireStaffOnly);
router.use("/programs", requireStaffOnly);
router.use("/districts", requireStaffOnly);
router.use("/district-tier", requireStaffOnly);
router.use("/district-overview", requireStaffOnly);

const isProgressReportPath = (path: string) =>
  /\/progress-reports/.test(path);
router.use("/students", (req, _res, next) => {
  if (isProgressReportPath(req.path)) {
    return requirePrivilegedStaffOnly(req, _res, next);
  }
  next();
});

router.use(storageRouter);

router.use(schoolsRouter);
router.use(districtsRouter);
router.use(studentsRouter);
router.use(staffRouter);
router.use(servicesRouter);
router.use(sessionsRouter);
router.use(schedulesRouter);
router.use(alertsRouter);
router.use(dashboardRouter);
router.use(minuteProgressRouter);
router.use(reportsRouter);
router.use(importsRouter);
router.use(dataHealthRouter);
router.use(supportRouter);
router.use(programDataRouter);
router.use(iepRouter);
router.use(complianceTimelineRouter);
router.use(additionalFeaturesRouter);
router.use(protectiveMeasuresRouter);
router.use(analyticsRouter);
router.use(preferenceAssessmentsRouter);
router.use(classesRouter);
router.use(assignmentsRouter);
router.use(iepSuggestionsRouter);
router.use(classroomRouter);
router.use(fbaRouter);
router.use(iepBuilderRouter);
router.use(resourceManagementRouter);
router.use(caseloadBalancingRouter);
router.use(compensatoryRouter);
router.use(parentCommunicationRouter);
router.use(supervisionRouter);
router.use(paraRouter);
router.use(auditLogRouter);
router.use(recentlyDeletedRouter);
router.use(onboardingRouter);
router.use(sampleDataRouter);
router.use(evaluationsRouter);
router.use(transitionsRouter);
router.use(iepMeetingsRouter);
router.use(complianceChecklistRouter);
router.use(stateReportingRouter);
router.use(sisIntegrationRouter);
router.use(studentPortalRouter);
router.use(agenciesRouter);
router.use(billingRouter);
router.use(adminReadinessRouter);
router.use(guardiansRouter);
router.use(reportExportsRouter);
router.use(rolloverRouter);
router.use(legalRouter);
router.use(generatedDocumentsRouter);
router.use(communicationEventsRouter);
router.use(parentMessagesRouter);
router.use(staffSchedulesRouter);
router.use(documentWorkflowRouter);
router.use(studentNotesRouter);
router.use("/accommodations", requireDistrictScope);
router.use("/accommodations", requireStaffOnly);
router.use("/accommodation-compliance", requireDistrictScope);
router.use("/accommodation-compliance", requireStaffOnly);
router.use(accommodationVerificationsRouter);

const requireBillingAdmin = requireRoles("admin", "coordinator");
router.use("/medicaid", requireDistrictScope);
router.use("/medicaid", requireBillingAdmin);
router.use(medicaidBillingRouter);

router.use("/cost-avoidance", requireDistrictScope);
router.use("/cost-avoidance", requireRoles("admin", "coordinator"));
router.use(costAvoidanceRouter);

router.use("/service-forecast", requireDistrictScope);
router.use("/service-forecast", requireRoles("admin", "coordinator"));
router.use(serviceForecastRouter);

router.use("/compensatory-finance", requireDistrictScope);
router.use("/compensatory-finance", requireRoles("admin", "coordinator"));
router.use(compensatoryFinanceRouter);

// Compliance snapshot creation — authenticated, district-scoped.
// Roles: admin, coordinator, case_manager (same as /reports).
router.use("/compliance", requireRoles("admin", "coordinator", "case_manager", "sped_teacher", "bcba"));
router.use(complianceSnapshotRouter);

export default router;
