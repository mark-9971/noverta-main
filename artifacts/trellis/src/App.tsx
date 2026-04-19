import { Switch, Route, Router as WouterRouter, Redirect, useLocation, useSearch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, RedirectToSignIn, useAuth, useUser } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { registerTokenProvider, setAuthFetchExtraHeaders, getDevAuthBypassHeaders } from "@/lib/auth-fetch";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleProvider, useRole, type UserRole } from "@/lib/role-context";
import { ViewAsProvider } from "@/lib/view-as-context";
import { SupportSessionProvider } from "@/lib/support-session-context";
import { ThemeProvider } from "@/lib/theme-context";
import { SchoolProvider } from "@/lib/school-context";
import { TierProvider } from "@/lib/tier-context";
import { SessionTimerProvider } from "@/lib/session-timer-context";
import { FeatureGate } from "@/components/FeatureGate";
import { type FeatureKey } from "@/lib/module-tiers";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LegalAcceptanceGate } from "@/components/LegalAcceptanceGate";
import { setSentryUser } from "@/lib/sentry";
import { lazy, Suspense, useEffect } from "react";

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  </div>
);

const ComplianceSnapshotPage = lazy(() => import("@/pages/ComplianceSnapshotPage"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Students = lazy(() => import("@/pages/students"));
const Sessions = lazy(() => import("@/pages/sessions"));
const Schedule = lazy(() => import("@/pages/schedule"));
function StaffCalendarRedirect() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const parts: string[] = ["tab=staff-calendar"];
  if (params.has("staffId")) parts.push(`staffId=${params.get("staffId")!}`);
  if (params.has("date")) parts.push(`date=${params.get("date")!}`);
  return <Redirect to={`/scheduling?${parts.join("&")}`} />;
}
const StaffPage = lazy(() => import("@/pages/staff"));
const AlertsPage = lazy(() => import("@/pages/alerts"));
const ActionCenterPage = lazy(() => import("@/pages/action-center"));
const Compliance = lazy(() => import("@/pages/compliance"));
const LeadershipPacketPage = lazy(() => import("@/pages/leadership-packet"));
const Reports = lazy(() => import("@/pages/reports"));
const StudentDetail = lazy(() => import("@/pages/student-detail"));
const ImportData = lazy(() => import("@/pages/import-data"));
const PilotKickoff = lazy(() => import("@/pages/pilot-kickoff"));
const DataHealthPage = lazy(() => import("@/pages/data-health"));
const DataVisualizedPage = lazy(() => import("@/pages/data-visualized"));
const ProgramDataPage = lazy(() => import("@/pages/program-data"));
const AbaHub = lazy(() => import("@/pages/aba"));
const IepHub = lazy(() => import("@/pages/iep"));
const SchedulingHub = lazy(() => import("@/pages/scheduling"));
const StudentIepPage = lazy(() => import("@/pages/student-iep"));
const StaffDetailPage = lazy(() => import("@/pages/staff-detail"));
const IepSearchPage = lazy(() => import("@/pages/iep-search"));
const ProtectiveMeasuresPage = lazy(() => import("@/pages/protective-measures"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const StateReportingPage = lazy(() => import("@/pages/state-reporting"));
const ProgressReportsPage = lazy(() => import("@/pages/progress-reports"));

const SpedStudentDashboard = lazy(() => import("@/pages/sped-student/SpedStudentDashboard"));
const SpedStudentGoals = lazy(() => import("@/pages/sped-student/SpedStudentGoals"));
const SpedStudentSessions = lazy(() => import("@/pages/sped-student/SpedStudentSessions"));
const SpedStudentServices = lazy(() => import("@/pages/sped-student/SpedStudentServices"));
const SpedStudentCheckIn = lazy(() => import("@/pages/sped-student/SpedStudentCheckIn"));
const SpedStudentWins = lazy(() => import("@/pages/sped-student/SpedStudentWins"));

const GuardianPortalHome = lazy(() => import("@/pages/guardian-portal/GuardianPortalHome"));
const GuardianDocuments = lazy(() => import("@/pages/guardian-portal/GuardianDocuments"));
const GuardianMeetings = lazy(() => import("@/pages/guardian-portal/GuardianMeetings"));
const GuardianContactHistory = lazy(() => import("@/pages/guardian-portal/GuardianContactHistory"));
const GuardianMessages = lazy(() => import("@/pages/guardian-portal/GuardianMessages"));
const IepSuggestions = lazy(() => import("@/pages/iep-suggestions"));
const DistrictOverview = lazy(() => import("@/pages/district-overview"));
const BehaviorAssessmentPage = lazy(() => import("@/pages/behavior-assessment"));
const IepBuilderPage = lazy(() => import("@/pages/iep-builder"));
const IepBuilderLanding = lazy(() => import("@/pages/iep-builder-landing"));
const ExecutiveDashboard = lazy(() => import("@/pages/executive-dashboard"));
const ResourceManagement = lazy(() => import("@/pages/resource-management"));
const CaseloadBalancing = lazy(() => import("@/pages/caseload-balancing"));
const CompensatoryServices = lazy(() => import("@/pages/compensatory-services"));
const ParentCommunication = lazy(() => import("@/pages/parent-communication"));
const Supervision = lazy(() => import("@/pages/supervision"));
const ParaMyDayPage = lazy(() => import("@/pages/para-my-day"));
const MyCaseloadPage = lazy(() => import("@/pages/my-caseload"));
const MySchedulePage = lazy(() => import("@/pages/my-schedule"));
const TodayPage = lazy(() => import("@/pages/today"));
const EvaluationsPage = lazy(() => import("@/pages/evaluations"));
const TransitionsPage = lazy(() => import("@/pages/transitions"));
const IepMeetingsPage = lazy(() => import("@/pages/iep-meetings"));
const AgenciesPage = lazy(() => import("@/pages/agencies"));
const AgencyDetailPage = lazy(() => import("@/pages/agency-detail"));
const ContractUtilizationPage = lazy(() => import("@/pages/contract-utilization"));
const BillingPage = lazy(() => import("@/pages/billing"));
const PilotDecisionPage = lazy(() => import("@/pages/pilot-decision"));
const MedicaidBillingPage = lazy(() => import("@/pages/medicaid-billing"));
const CostAvoidancePage = lazy(() => import("@/pages/cost-avoidance"));
const WeeklyComplianceSummaryPage = lazy(() => import("@/pages/weekly-compliance-summary"));
const CompensatoryFinancePage = lazy(() => import("@/pages/compensatory-finance"));
const TenantsPage = lazy(() => import("@/pages/tenants"));
const DemoReadinessPage = lazy(() => import("@/pages/demo-readiness"));
const DemoRequestPage = lazy(() => import("@/pages/demo-request"));
const AdminDemoDistrictsPage = lazy(() => import("@/pages/admin-demo-districts"));
const SupportPage = lazy(() => import("@/pages/support"));
const PilotFeedbackPage = lazy(() => import("@/pages/pilot-feedback"));
const PilotStatusPage = lazy(() => import("@/pages/pilot-status"));
const SettingsHubPage = lazy(() => import("@/pages/settings"));
const SupportSessionPage = lazy(() => import("@/pages/support-session"));
const MySettingsPage = lazy(() => import("@/pages/my-settings"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const CoveragePage = lazy(() => import("@/pages/coverage"));
const DocumentWorkflowPage = lazy(() => import("@/pages/document-workflow"));
const AccommodationLookupPage = lazy(() => import("@/pages/accommodation-lookup"));
const SignInPage = lazy(() => import("@/pages/sign-in"));
const SignUpPage = lazy(() => import("@/pages/sign-up"));
const SignDocumentPage = lazy(() => import("@/pages/sign-document"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const DataPanelPage = lazy(() => import("@/pages/data-panel"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Includes `trellis_support` so the support-session picker page is reachable.
// trellis_support users are not actually staff; they hit the standard router
// only so they can land on /support-session and (after opening a session)
// browse the rest of the app under the read-only override.
const STAFF_ROLES: UserRole[] = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para", "direct_provider", "trellis_support"];

function SentryUserSync() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user) {
      const role = user.publicMetadata?.role as string | undefined;
      const districtId = user.publicMetadata?.districtId as string | undefined;
      const tags: Record<string, string> = {};
      if (role) tags.role = role;
      if (districtId) tags.districtId = districtId;
      setSentryUser(
        user.id,
        Object.keys(tags).length > 0 ? tags : undefined,
        user.primaryEmailAddress?.emailAddress,
      );
    } else {
      setSentryUser(null);
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}

// Dev-only auth bypass: when VITE_DEV_AUTH_BYPASS=1, skip the Clerk sign-in gate
// and inject x-test-* headers so API calls authenticate as a test admin. This lets
// the agent test the app without a real Clerk session. Production rejects the
// headers server-side regardless. Never enable this in production.
const DEV_AUTH_BYPASS =
  import.meta.env.VITE_DEV_AUTH_BYPASS === "1" && import.meta.env.MODE !== "production";

if (DEV_AUTH_BYPASS) {
  setAuthFetchExtraHeaders(getDevAuthBypassHeaders());
}

function ProtectedRoutes({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  registerTokenProvider(() => getToken());

  if (DEV_AUTH_BYPASS) return <>{children}</>;

  if (!isLoaded) return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-400 font-medium">Loading Trellis...</p>
      </div>
    </div>
  );
  if (!isSignedIn) return <RedirectToSignIn />;
  return <>{children}</>;
}

function BoundedRoute({ component: Comp, fallbackTitle, featureKey, ...rest }: { component: React.ComponentType<any>; fallbackTitle?: string; path?: string; featureKey?: FeatureKey }) {
  return (
    <Route {...rest}>
      {(params: any) => (
        <ErrorBoundary fallbackTitle={fallbackTitle}>
          <Suspense fallback={<PageLoader />}>
            {featureKey ? (
              <FeatureGate featureKey={featureKey}>
                <Comp {...params} />
              </FeatureGate>
            ) : (
              <Comp {...params} />
            )}
          </Suspense>
        </ErrorBoundary>
      )}
    </Route>
  );
}

function HashRedirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  useEffect(() => {
    const [path, hash] = to.split("#");
    const preservedSearch = search ? `?${search}` : "";
    setLocation(`${path}${preservedSearch}`, { replace: true });
    if (hash) {
      requestAnimationFrame(() => {
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
    }
  }, [to, setLocation, search]);
  return null;
}

function StaffRouter() {
  return (
    <Switch>
      <BoundedRoute path="/" component={Dashboard} fallbackTitle="Dashboard error" />
      <BoundedRoute path="/iep-builder" component={IepBuilderLanding} fallbackTitle="IEP Builder error" />
      <BoundedRoute path="/students/:id/iep-builder" component={IepBuilderPage} fallbackTitle="IEP Builder error" />
      <BoundedRoute path="/students/:id/iep" component={StudentIepPage} fallbackTitle="Student IEP error" />
      <BoundedRoute path="/students/:id" component={StudentDetail} fallbackTitle="Student details error" />
      <BoundedRoute path="/students" component={Students} fallbackTitle="Students page error" />
      <BoundedRoute path="/sessions" component={Sessions} fallbackTitle="Sessions error" />
      <BoundedRoute path="/schedule" component={Schedule} fallbackTitle="Schedule error" />
      <Route path="/staff-calendar" component={StaffCalendarRedirect} />
      <BoundedRoute path="/coverage" component={CoveragePage} fallbackTitle="Coverage error" />
      <BoundedRoute path="/staff/:id" component={StaffDetailPage} fallbackTitle="Staff details error" />
      <BoundedRoute path="/staff" component={StaffPage} fallbackTitle="Staff page error" />
      <BoundedRoute path="/search" component={IepSearchPage} fallbackTitle="Search error" />
      <BoundedRoute path="/iep-search" component={IepSearchPage} fallbackTitle="Search error" />
      <BoundedRoute path="/action-center" component={ActionCenterPage} fallbackTitle="Action center error" />
      <BoundedRoute path="/alerts" component={AlertsPage} fallbackTitle="Alerts error" />
      <Route path="/compliance/timeline">{() => <Redirect to="/compliance?tab=timeline" />}</Route>
      <Route path="/compliance/checklist">{() => <Redirect to="/compliance?tab=checklist" />}</Route>
      <Route path="/compliance/trends">{() => <Redirect to="/compliance?tab=trends" />}</Route>
      <BoundedRoute path="/leadership-packet" component={LeadershipPacketPage} fallbackTitle="Leadership packet error" featureKey="district.executive" />
      <BoundedRoute path="/compliance" component={Compliance} fallbackTitle="Compliance error" featureKey="compliance.service_minutes" />
      <BoundedRoute path="/progress-reports" component={ProgressReportsPage} fallbackTitle="Progress reports error" />
      <BoundedRoute path="/reports" component={Reports} fallbackTitle="Reports error" />
      <BoundedRoute path="/state-reporting" component={StateReportingPage} fallbackTitle="State reporting error" featureKey="compliance.state_reporting" />
      <BoundedRoute path="/document-workflow" component={DocumentWorkflowPage} fallbackTitle="Document workflow error" />
      <BoundedRoute path="/accommodation-lookup" component={AccommodationLookupPage} fallbackTitle="Accommodation lookup error" />
      <BoundedRoute path="/import" component={ImportData} fallbackTitle="Import error" />
      <BoundedRoute path="/pilot-kickoff" component={PilotKickoff} fallbackTitle="Pilot kickoff error" />
      <BoundedRoute path="/data-health" component={DataHealthPage} fallbackTitle="Data health error" />
      <BoundedRoute path="/data-visualized" component={DataVisualizedPage} fallbackTitle="Data visualized error" />
      <BoundedRoute path="/program-data" component={ProgramDataPage} fallbackTitle="Program data error" featureKey="clinical.program_data" />
      <BoundedRoute path="/aba" component={AbaHub} fallbackTitle="ABA hub error" featureKey="clinical.program_data" />
      <BoundedRoute path="/iep" component={IepHub} fallbackTitle="IEP hub error" />
      <BoundedRoute path="/scheduling" component={SchedulingHub} fallbackTitle="Scheduling hub error" />
      <BoundedRoute path="/iep-suggestions" component={IepSuggestions} fallbackTitle="IEP suggestions error" featureKey="clinical.iep_suggestions" />
      <BoundedRoute path="/protective-measures" component={ProtectiveMeasuresPage} fallbackTitle="Protective measures error" featureKey="compliance.protective_measures" />
      <BoundedRoute path="/executive" component={ExecutiveDashboard} fallbackTitle="Executive dashboard error" featureKey="district.executive" />
      <Route path="/iep-calendar"><Redirect to="/iep-meetings?tab=calendar" /></Route>
      <BoundedRoute path="/analytics" component={AnalyticsPage} fallbackTitle="Analytics error" />
      <BoundedRoute path="/behavior-assessment" component={BehaviorAssessmentPage} fallbackTitle="Behavior assessment error" featureKey="clinical.fba_bip" />
      <BoundedRoute path="/district" component={DistrictOverview} fallbackTitle="District overview error" featureKey="district.overview" />
      <BoundedRoute path="/resource-management" component={ResourceManagement} fallbackTitle="Resource management error" featureKey="district.resource_management" />
      <BoundedRoute path="/caseload-balancing" component={CaseloadBalancing} fallbackTitle="Caseload balancing error" featureKey="district.caseload_balancing" />
      <BoundedRoute path="/compensatory-services" component={CompensatoryServices} fallbackTitle="Compensatory services error" featureKey="compliance.compensatory" />
      <BoundedRoute path="/parent-communication" component={ParentCommunication} fallbackTitle="Parent communication error" featureKey="engagement.parent_communication" />
      <BoundedRoute path="/supervision" component={Supervision} fallbackTitle="Supervision error" featureKey="clinical.supervision" />
      <BoundedRoute path="/my-day" component={ParaMyDayPage} fallbackTitle="My Day error" />
      <BoundedRoute path="/settings" component={SettingsHubPage} fallbackTitle="Settings error" />
      <BoundedRoute path="/support-session" component={SupportSessionPage} fallbackTitle="Support session error" />
      <BoundedRoute path="/my-settings" component={MySettingsPage} fallbackTitle="My Settings error" />
      <BoundedRoute path="/onboarding" component={OnboardingPage} fallbackTitle="Onboarding error" />
      <Route path="/audit-log">{() => <HashRedirect to="/settings#audit-log" />}</Route>
      <Route path="/recently-deleted">{() => <HashRedirect to="/settings#recently-deleted" />}</Route>
      <Route path="/system-status">{() => <HashRedirect to="/settings#system-status" />}</Route>
      <Route path="/legal-compliance">{() => <HashRedirect to="/settings#legal" />}</Route>
      <Route path="/school-year">{() => <HashRedirect to="/settings#school-year" />}</Route>
      <Route path="/sis-settings">{() => <HashRedirect to="/settings#sis" />}</Route>
      <Route path="/setup">{() => <HashRedirect to="/settings" />}</Route>
      <BoundedRoute path="/my-caseload" component={MyCaseloadPage} fallbackTitle="My Caseload error" />
      <BoundedRoute path="/my-schedule" component={MySchedulePage} fallbackTitle="My Schedule error" />
      <BoundedRoute path="/today" component={TodayPage} fallbackTitle="Today error" />
      <BoundedRoute path="/evaluations" component={EvaluationsPage} fallbackTitle="Evaluations error" featureKey="compliance.evaluations" />
      <BoundedRoute path="/transitions" component={TransitionsPage} fallbackTitle="Transitions error" featureKey="compliance.transitions" />
      <BoundedRoute path="/iep-meetings" component={IepMeetingsPage} fallbackTitle="IEP Meetings error" />
      <BoundedRoute path="/agencies/:id" component={AgencyDetailPage} fallbackTitle="Agency detail error" />
      <BoundedRoute path="/agencies" component={AgenciesPage} fallbackTitle="Agencies error" />
      <BoundedRoute path="/contract-utilization" component={ContractUtilizationPage} fallbackTitle="Contract utilization error" featureKey="district.contract_utilization" />
      <BoundedRoute path="/billing" component={BillingPage} fallbackTitle="Billing error" />
      <BoundedRoute path="/pilot-decision" component={PilotDecisionPage} fallbackTitle="Pilot decision error" />
      <BoundedRoute path="/medicaid-billing" component={MedicaidBillingPage} fallbackTitle="Medicaid billing error" featureKey="district.medicaid_billing" />
      <BoundedRoute path="/cost-avoidance" component={CostAvoidancePage} fallbackTitle="Cost avoidance error" />
      <Route path="/compliance-risk-report">{() => <Redirect to="/compliance?tab=risk-report" />}</Route>
      <BoundedRoute path="/weekly-compliance-summary" component={WeeklyComplianceSummaryPage} fallbackTitle="Weekly compliance summary error" />
      <BoundedRoute path="/compensatory-finance" component={CompensatoryFinancePage} fallbackTitle="Compensatory finance error" />
      <BoundedRoute path="/tenants" component={TenantsPage} fallbackTitle="Tenants error" />
      <BoundedRoute path="/admin/demo-readiness" component={DemoReadinessPage} fallbackTitle="Demo readiness error" />
      <BoundedRoute path="/pilot-feedback" component={PilotFeedbackPage} fallbackTitle="Pilot feedback error" />
      <BoundedRoute path="/admin/demo-districts" component={AdminDemoDistrictsPage} fallbackTitle="Demo districts error" />
      <BoundedRoute path="/support" component={SupportPage} fallbackTitle="Support tools error" />
      <BoundedRoute path="/pilot-status" component={PilotStatusPage} fallbackTitle="Pilot status error" />
      <Route component={NotFound} />
    </Switch>
  );
}

function SpedStudentRouter() {
  return (
    <Switch>
      <BoundedRoute path="/sped-portal" component={SpedStudentDashboard} fallbackTitle="Student portal error" />
      <BoundedRoute path="/sped-portal/goals" component={SpedStudentGoals} fallbackTitle="Goals error" />
      <BoundedRoute path="/sped-portal/sessions" component={SpedStudentSessions} fallbackTitle="Sessions error" />
      <BoundedRoute path="/sped-portal/services" component={SpedStudentServices} fallbackTitle="Services error" />
      <BoundedRoute path="/sped-portal/check-in" component={SpedStudentCheckIn} fallbackTitle="Check-in error" />
      <BoundedRoute path="/sped-portal/wins" component={SpedStudentWins} fallbackTitle="Wins error" />
      <Route>{() => <Redirect to="/sped-portal" />}</Route>
    </Switch>
  );
}

function GuardianPortalRouter() {
  return (
    <Switch>
      <BoundedRoute path="/guardian-portal" component={GuardianPortalHome} fallbackTitle="Guardian portal error" />
      <BoundedRoute path="/guardian-portal/documents" component={GuardianDocuments} fallbackTitle="Documents error" />
      <BoundedRoute path="/guardian-portal/meetings" component={GuardianMeetings} fallbackTitle="Meetings error" />
      <BoundedRoute path="/guardian-portal/contact-history" component={GuardianContactHistory} fallbackTitle="Contact history error" />
      <BoundedRoute path="/guardian-portal/messages" component={GuardianMessages} fallbackTitle="Messages error" />
      <Route>{() => <Redirect to="/guardian-portal" />}</Route>
    </Switch>
  );
}

function GatedContent({ children }: { children?: React.ReactNode }) {
  const { role } = useRole();
  return (
    <LegalAcceptanceGate currentRole={role}>
      {children ?? <AppRouter />}
    </LegalAcceptanceGate>
  );
}

function AppRouter() {
  const { role } = useRole();
  const isStaff = (STAFF_ROLES as string[]).includes(role);

  return (
    <AppLayout>
      {isStaff && <StaffRouter />}
      {role === "sped_student" && <SpedStudentRouter />}
      {role === "sped_parent" && <GuardianPortalRouter />}
    </AppLayout>
  );
}

function App() {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl={`${base}/sign-in`}
      signUpUrl={`${base}/sign-up`}
      afterSignOutUrl={`${base}/sign-in`}
    >
      <SentryUserSync />
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={base}>
            <Switch>
              <Route path="/pricing" component={PricingPage} />
              <Route path="/demo/request">
                <Suspense fallback={<PageLoader />}>
                  <DemoRequestPage />
                </Suspense>
              </Route>
              <Route path="/sign-in" component={SignInPage} />
              <Route path="/sign-in/:rest*" component={SignInPage} />
              <Route path="/sign-up" component={SignUpPage} />
              <Route path="/sign-up/:rest*" component={SignUpPage} />
              <Route path="/sign/:token" component={SignDocumentPage} />
              <Route path="/share/compliance/:token">
                {(params) => (
                  <Suspense fallback={<PageLoader />}>
                    <ComplianceSnapshotPage />
                  </Suspense>
                )}
              </Route>
              <Route path="/data-panel">
                <ProtectedRoutes>
                  <RoleProvider>
                    <ViewAsProvider>
                      <SupportSessionProvider>
                        <GatedContent>
                          <Suspense fallback={<PageLoader />}>
                            <DataPanelPage />
                          </Suspense>
                        </GatedContent>
                      </SupportSessionProvider>
                    </ViewAsProvider>
                  </RoleProvider>
                </ProtectedRoutes>
              </Route>
              <Route>
                <ProtectedRoutes>
                  <RoleProvider>
                    <ViewAsProvider>
                      <SupportSessionProvider>
                        <ThemeProvider>
                          <SchoolProvider>
                            <TierProvider>
                              <SessionTimerProvider>
                                <GatedContent />
                              </SessionTimerProvider>
                            </TierProvider>
                          </SchoolProvider>
                        </ThemeProvider>
                      </SupportSessionProvider>
                    </ViewAsProvider>
                  </RoleProvider>
                </ProtectedRoutes>
              </Route>
            </Switch>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
