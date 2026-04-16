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
import classesRouter from "./classes";
import assignmentsRouter from "./assignments";
import iepSuggestionsRouter from "./iepSuggestions";
import classroomRouter from "./classroom";
import districtsRouter from "./districts";
import fbaRouter from "./fba";
import iepBuilderRouter from "./iepBuilder";
import resourceManagementRouter from "./resourceManagement";
import compensatoryRouter from "./compensatory";
import parentCommunicationRouter from "./parentCommunication";
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
import demoRequestsRouter from "./demoRequests";
import guardiansRouter from "./guardians";
import reportExportsRouter from "./reportExports";
import rolloverRouter from "./rollover";
import legalRouter from "./legal";
import generatedDocumentsRouter from "./generatedDocuments";
import communicationEventsRouter from "./communicationEvents";
import guardianPortalRouter from "./guardianPortal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(demoRequestsRouter);

router.use(requireAuth);

// Guardian portal: scoped separately from district-authenticated routes.
// requireGuardianScope (inside guardianPortalRouter) handles its own auth & role enforcement.
// Mounted before requireDistrictScope because guardian accounts have no district claim.
// Must be path-scoped so requireGuardianScope inside the sub-router doesn't bleed
// into all other routes.
router.use("/guardian-portal", guardianPortalRouter);

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
// Scheduling data is staff-only; sped_students and unauthenticated callers must not see it.
router.use("/schedule-blocks", requireDistrictScope);
router.use("/schedule-blocks", requireStaffOnly);
router.use("/staff-assignments", requireDistrictScope);
router.use("/staff-assignments", requireStaffOnly);
// Reports router previously had a blanket router.use(requirePrivilegedStaff) with no
// path, which bled into every subsequent router. Scoped here instead.
router.use("/reports", requirePrivilegedStaffOnly);
// Export routes are more restricted than general reports: admin/coordinator/case_manager only.
// This guard runs AFTER the /reports guard (both apply to /reports/exports/*).
const requireReportExport = requireRoles("admin", "case_manager", "coordinator");
router.use("/reports/exports", requireReportExport);
// Incidents / protective measures — PRIVILEGED_STAFF only (para, provider, sped_student excluded)
router.use("/protective-measures", requirePrivilegedStaffOnly);

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
router.use(programDataRouter);
router.use(iepRouter);
router.use(complianceTimelineRouter);
router.use(additionalFeaturesRouter);
router.use(protectiveMeasuresRouter);
router.use(analyticsRouter);
router.use(classesRouter);
router.use(assignmentsRouter);
router.use(iepSuggestionsRouter);
router.use(classroomRouter);
router.use(fbaRouter);
router.use(iepBuilderRouter);
router.use(resourceManagementRouter);
router.use(compensatoryRouter);
router.use(parentCommunicationRouter);
router.use(supervisionRouter);
router.use(paraRouter);
router.use(auditLogRouter);
router.use(recentlyDeletedRouter);
router.use(onboardingRouter);
router.use(evaluationsRouter);
router.use(transitionsRouter);
router.use(iepMeetingsRouter);
router.use(complianceChecklistRouter);
router.use(stateReportingRouter);
router.use(sisIntegrationRouter);
router.use(studentPortalRouter);
router.use(agenciesRouter);
router.use(billingRouter);
router.use(guardiansRouter);
router.use(reportExportsRouter);
router.use(rolloverRouter);
router.use(legalRouter);
router.use(generatedDocumentsRouter);
router.use(communicationEventsRouter);

export default router;
