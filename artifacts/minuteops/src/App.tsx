import { Switch, Route, Router as WouterRouter, Redirect, useLocation, useSearch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, RedirectToSignIn, useAuth } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { registerTokenProvider } from "@/lib/auth-fetch";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleProvider, useRole, type UserRole } from "@/lib/role-context";
import { ThemeProvider } from "@/lib/theme-context";
import { SchoolProvider } from "@/lib/school-context";
import { TierProvider } from "@/lib/tier-context";
import { SessionTimerProvider } from "@/lib/session-timer-context";
import { FeatureGate } from "@/components/FeatureGate";
import { type FeatureKey } from "@/lib/module-tiers";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense, useEffect } from "react";

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  </div>
);

const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Students = lazy(() => import("@/pages/students"));
const Sessions = lazy(() => import("@/pages/sessions"));
const Schedule = lazy(() => import("@/pages/schedule"));
const StaffCalendar = lazy(() => import("@/pages/staff-calendar"));
const StaffPage = lazy(() => import("@/pages/staff"));
const AlertsPage = lazy(() => import("@/pages/alerts"));
const Compliance = lazy(() => import("@/pages/compliance"));
const Reports = lazy(() => import("@/pages/reports"));
const StudentDetail = lazy(() => import("@/pages/student-detail"));
const ImportData = lazy(() => import("@/pages/import-data"));
const ProgramDataPage = lazy(() => import("@/pages/program-data"));
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
const ExecutiveDashboard = lazy(() => import("@/pages/executive-dashboard"));
const IepCalendarPage = lazy(() => import("@/pages/iep-calendar"));
const ResourceManagement = lazy(() => import("@/pages/resource-management"));
const CaseloadBalancing = lazy(() => import("@/pages/caseload-balancing"));
const CompensatoryServices = lazy(() => import("@/pages/compensatory-services"));
const ParentCommunication = lazy(() => import("@/pages/parent-communication"));
const Supervision = lazy(() => import("@/pages/supervision"));
const ParaMyDayPage = lazy(() => import("@/pages/para-my-day"));
const MyCaseloadPage = lazy(() => import("@/pages/my-caseload"));
const EvaluationsPage = lazy(() => import("@/pages/evaluations"));
const TransitionsPage = lazy(() => import("@/pages/transitions"));
const IepMeetingsPage = lazy(() => import("@/pages/iep-meetings"));
const AgenciesPage = lazy(() => import("@/pages/agencies"));
const AgencyDetailPage = lazy(() => import("@/pages/agency-detail"));
const ContractUtilizationPage = lazy(() => import("@/pages/contract-utilization"));
const BillingPage = lazy(() => import("@/pages/billing"));
const MedicaidBillingPage = lazy(() => import("@/pages/medicaid-billing"));
const CostAvoidancePage = lazy(() => import("@/pages/cost-avoidance"));
const CompensatoryFinancePage = lazy(() => import("@/pages/compensatory-finance"));
const TenantsPage = lazy(() => import("@/pages/tenants"));
const SettingsHubPage = lazy(() => import("@/pages/settings"));
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

const STAFF_ROLES: UserRole[] = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para"];

function ProtectedRoutes({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  registerTokenProvider(() => getToken());

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
      <BoundedRoute path="/students/:id/iep-builder" component={IepBuilderPage} fallbackTitle="IEP Builder error" />
      <BoundedRoute path="/students/:id/iep" component={StudentIepPage} fallbackTitle="Student IEP error" />
      <BoundedRoute path="/students/:id" component={StudentDetail} fallbackTitle="Student details error" />
      <BoundedRoute path="/students" component={Students} fallbackTitle="Students page error" />
      <BoundedRoute path="/sessions" component={Sessions} fallbackTitle="Sessions error" />
      <BoundedRoute path="/schedule" component={Schedule} fallbackTitle="Schedule error" />
      <BoundedRoute path="/staff-calendar" component={StaffCalendar} fallbackTitle="Staff calendar error" />
      <BoundedRoute path="/coverage" component={CoveragePage} fallbackTitle="Coverage error" />
      <BoundedRoute path="/staff/:id" component={StaffDetailPage} fallbackTitle="Staff details error" />
      <BoundedRoute path="/staff" component={StaffPage} fallbackTitle="Staff page error" />
      <BoundedRoute path="/search" component={IepSearchPage} fallbackTitle="Search error" />
      <BoundedRoute path="/alerts" component={AlertsPage} fallbackTitle="Alerts error" />
      <Route path="/compliance/timeline">{() => <HashRedirect to="/compliance#timeline" />}</Route>
      <Route path="/compliance/checklist">{() => <HashRedirect to="/compliance#checklist" />}</Route>
      <BoundedRoute path="/compliance" component={Compliance} fallbackTitle="Compliance error" featureKey="compliance.service_minutes" />
      <BoundedRoute path="/progress-reports" component={ProgressReportsPage} fallbackTitle="Progress reports error" />
      <BoundedRoute path="/reports" component={Reports} fallbackTitle="Reports error" />
      <BoundedRoute path="/state-reporting" component={StateReportingPage} fallbackTitle="State reporting error" featureKey="compliance.state_reporting" />
      <BoundedRoute path="/document-workflow" component={DocumentWorkflowPage} fallbackTitle="Document workflow error" />
      <BoundedRoute path="/accommodation-lookup" component={AccommodationLookupPage} fallbackTitle="Accommodation lookup error" />
      <BoundedRoute path="/import" component={ImportData} fallbackTitle="Import error" />
      <BoundedRoute path="/program-data" component={ProgramDataPage} fallbackTitle="Program data error" featureKey="clinical.program_data" />
      <BoundedRoute path="/iep-suggestions" component={IepSuggestions} fallbackTitle="IEP suggestions error" featureKey="clinical.iep_suggestions" />
      <BoundedRoute path="/protective-measures" component={ProtectiveMeasuresPage} fallbackTitle="Protective measures error" featureKey="clinical.protective_measures" />
      <BoundedRoute path="/executive" component={ExecutiveDashboard} fallbackTitle="Executive dashboard error" featureKey="district.executive" />
      <BoundedRoute path="/iep-calendar" component={IepCalendarPage} fallbackTitle="IEP calendar error" />
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
      <Route path="/audit-log">{() => <HashRedirect to="/settings#audit-log" />}</Route>
      <Route path="/recently-deleted">{() => <HashRedirect to="/settings#recently-deleted" />}</Route>
      <Route path="/system-status">{() => <HashRedirect to="/settings#system-status" />}</Route>
      <Route path="/legal-compliance">{() => <HashRedirect to="/settings#legal" />}</Route>
      <Route path="/school-year">{() => <HashRedirect to="/settings#school-year" />}</Route>
      <Route path="/sis-settings">{() => <HashRedirect to="/settings#sis" />}</Route>
      <Route path="/setup">{() => <HashRedirect to="/settings" />}</Route>
      <BoundedRoute path="/my-caseload" component={MyCaseloadPage} fallbackTitle="My Caseload error" />
      <BoundedRoute path="/evaluations" component={EvaluationsPage} fallbackTitle="Evaluations error" featureKey="compliance.evaluations" />
      <BoundedRoute path="/transitions" component={TransitionsPage} fallbackTitle="Transitions error" featureKey="compliance.transitions" />
      <BoundedRoute path="/iep-meetings" component={IepMeetingsPage} fallbackTitle="IEP Meetings error" />
      <BoundedRoute path="/agencies/:id" component={AgencyDetailPage} fallbackTitle="Agency detail error" />
      <BoundedRoute path="/agencies" component={AgenciesPage} fallbackTitle="Agencies error" />
      <BoundedRoute path="/contract-utilization" component={ContractUtilizationPage} fallbackTitle="Contract utilization error" featureKey="district.contract_utilization" />
      <BoundedRoute path="/billing" component={BillingPage} fallbackTitle="Billing error" />
      <BoundedRoute path="/medicaid-billing" component={MedicaidBillingPage} fallbackTitle="Medicaid billing error" />
      <BoundedRoute path="/cost-avoidance" component={CostAvoidancePage} fallbackTitle="Cost avoidance error" />
      <BoundedRoute path="/compensatory-finance" component={CompensatoryFinancePage} fallbackTitle="Compensatory finance error" />
      <BoundedRoute path="/tenants" component={TenantsPage} fallbackTitle="Tenants error" />
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
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={base}>
            <Switch>
              <Route path="/pricing" component={PricingPage} />
              <Route path="/sign-in" component={SignInPage} />
              <Route path="/sign-in/:rest*" component={SignInPage} />
              <Route path="/sign-up" component={SignUpPage} />
              <Route path="/sign-up/:rest*" component={SignUpPage} />
              <Route path="/sign/:token" component={SignDocumentPage} />
              <Route path="/data-panel">
                <ProtectedRoutes>
                  <RoleProvider>
                    <Suspense fallback={<PageLoader />}>
                      <DataPanelPage />
                    </Suspense>
                  </RoleProvider>
                </ProtectedRoutes>
              </Route>
              <Route>
                <ProtectedRoutes>
                  <RoleProvider>
                    <ThemeProvider>
                      <SchoolProvider>
                        <TierProvider>
                          <SessionTimerProvider>
                            <AppRouter />
                          </SessionTimerProvider>
                        </TierProvider>
                      </SchoolProvider>
                    </ThemeProvider>
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
