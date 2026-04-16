import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
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
import { FeatureGate } from "@/components/FeatureGate";
import { type FeatureKey } from "@/lib/module-tiers";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense } from "react";

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
const StaffPage = lazy(() => import("@/pages/staff"));
const AlertsPage = lazy(() => import("@/pages/alerts"));
const Compliance = lazy(() => import("@/pages/compliance"));
const ComplianceChecklist = lazy(() => import("@/pages/compliance-checklist"));
const Reports = lazy(() => import("@/pages/reports"));
const StudentDetail = lazy(() => import("@/pages/student-detail"));
const ImportData = lazy(() => import("@/pages/import-data"));
const ProgramDataPage = lazy(() => import("@/pages/program-data"));
const StudentIepPage = lazy(() => import("@/pages/student-iep"));
const ComplianceTimelinePage = lazy(() => import("@/pages/compliance-timeline"));
const StaffDetailPage = lazy(() => import("@/pages/staff-detail"));
const IepSearchPage = lazy(() => import("@/pages/iep-search"));
const ProtectiveMeasuresPage = lazy(() => import("@/pages/protective-measures"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const StateReportingPage = lazy(() => import("@/pages/state-reporting"));

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
const IepSuggestions = lazy(() => import("@/pages/iep-suggestions"));
const DistrictOverview = lazy(() => import("@/pages/district-overview"));
const BehaviorAssessmentPage = lazy(() => import("@/pages/behavior-assessment"));
const IepBuilderPage = lazy(() => import("@/pages/iep-builder"));
const ExecutiveDashboard = lazy(() => import("@/pages/executive-dashboard"));
const IepCalendarPage = lazy(() => import("@/pages/iep-calendar"));
const ResourceManagement = lazy(() => import("@/pages/resource-management"));
const CompensatoryServices = lazy(() => import("@/pages/compensatory-services"));
const ParentCommunication = lazy(() => import("@/pages/parent-communication"));
const Supervision = lazy(() => import("@/pages/supervision"));
const ParaMyDayPage = lazy(() => import("@/pages/para-my-day"));
const AuditLogPage = lazy(() => import("@/pages/audit-log"));
const RecentlyDeletedPage = lazy(() => import("@/pages/recently-deleted"));
const SetupPage = lazy(() => import("@/pages/setup"));
const MyCaseloadPage = lazy(() => import("@/pages/my-caseload"));
const EvaluationsPage = lazy(() => import("@/pages/evaluations"));
const TransitionsPage = lazy(() => import("@/pages/transitions"));
const IepMeetingsPage = lazy(() => import("@/pages/iep-meetings"));
const SisSettingsPage = lazy(() => import("@/pages/sis-settings"));
const AgenciesPage = lazy(() => import("@/pages/agencies"));
const AgencyDetailPage = lazy(() => import("@/pages/agency-detail"));
const ContractUtilizationPage = lazy(() => import("@/pages/contract-utilization"));
const BillingPage = lazy(() => import("@/pages/billing"));
const TenantsPage = lazy(() => import("@/pages/tenants"));
const SystemStatusPage = lazy(() => import("@/pages/system-status"));
const LegalCompliancePage = lazy(() => import("@/pages/legal-compliance"));

const CoveragePage = lazy(() => import("@/pages/coverage"));
const SchoolYearPage = lazy(() => import("@/pages/school-year"));
const SignInPage = lazy(() => import("@/pages/sign-in"));
const SignUpPage = lazy(() => import("@/pages/sign-up"));
const SignDocumentPage = lazy(() => import("@/pages/sign-document"));
const PricingPage = lazy(() => import("@/pages/pricing"));

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
      <BoundedRoute path="/coverage" component={CoveragePage} fallbackTitle="Coverage error" />
      <BoundedRoute path="/staff/:id" component={StaffDetailPage} fallbackTitle="Staff details error" />
      <BoundedRoute path="/staff" component={StaffPage} fallbackTitle="Staff page error" />
      <BoundedRoute path="/search" component={IepSearchPage} fallbackTitle="Search error" />
      <BoundedRoute path="/alerts" component={AlertsPage} fallbackTitle="Alerts error" />
      <BoundedRoute path="/compliance/timeline" component={ComplianceTimelinePage} fallbackTitle="Compliance timeline error" />
      <BoundedRoute path="/compliance/checklist" component={ComplianceChecklist} fallbackTitle="Compliance checklist error" featureKey="compliance.checklist" />
      <BoundedRoute path="/compliance" component={Compliance} fallbackTitle="Compliance error" featureKey="compliance.service_minutes" />
      <BoundedRoute path="/reports" component={Reports} fallbackTitle="Reports error" />
      <BoundedRoute path="/state-reporting" component={StateReportingPage} fallbackTitle="State reporting error" featureKey="compliance.state_reporting" />
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
      <BoundedRoute path="/compensatory-services" component={CompensatoryServices} fallbackTitle="Compensatory services error" featureKey="compliance.compensatory" />
      <BoundedRoute path="/parent-communication" component={ParentCommunication} fallbackTitle="Parent communication error" featureKey="engagement.parent_communication" />
      <BoundedRoute path="/supervision" component={Supervision} fallbackTitle="Supervision error" featureKey="clinical.supervision" />
      <BoundedRoute path="/my-day" component={ParaMyDayPage} fallbackTitle="My Day error" />
      <BoundedRoute path="/audit-log" component={AuditLogPage} fallbackTitle="Audit log error" />
      <BoundedRoute path="/recently-deleted" component={RecentlyDeletedPage} fallbackTitle="Recently deleted error" />
      <BoundedRoute path="/system-status" component={SystemStatusPage} fallbackTitle="System status error" />
      <BoundedRoute path="/legal-compliance" component={LegalCompliancePage} fallbackTitle="Legal & Compliance error" />
      <BoundedRoute path="/school-year" component={SchoolYearPage} fallbackTitle="School year error" />
      <BoundedRoute path="/setup" component={SetupPage} fallbackTitle="Setup error" />
      <BoundedRoute path="/my-caseload" component={MyCaseloadPage} fallbackTitle="My Caseload error" />
      <BoundedRoute path="/evaluations" component={EvaluationsPage} fallbackTitle="Evaluations error" featureKey="compliance.evaluations" />
      <BoundedRoute path="/transitions" component={TransitionsPage} fallbackTitle="Transitions error" featureKey="compliance.transitions" />
      <BoundedRoute path="/iep-meetings" component={IepMeetingsPage} fallbackTitle="IEP Meetings error" />
      <BoundedRoute path="/sis-settings" component={SisSettingsPage} fallbackTitle="SIS settings error" />
      <BoundedRoute path="/agencies/:id" component={AgencyDetailPage} fallbackTitle="Agency detail error" />
      <BoundedRoute path="/agencies" component={AgenciesPage} fallbackTitle="Agencies error" />
      <BoundedRoute path="/contract-utilization" component={ContractUtilizationPage} fallbackTitle="Contract utilization error" featureKey="district.contract_utilization" />
      <BoundedRoute path="/billing" component={BillingPage} fallbackTitle="Billing error" />
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
              <Route>
                <ProtectedRoutes>
                  <RoleProvider>
                    <ThemeProvider>
                      <SchoolProvider>
                        <TierProvider>
                          <AppRouter />
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
