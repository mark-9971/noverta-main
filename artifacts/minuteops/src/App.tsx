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
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Students from "@/pages/students";
import Sessions from "@/pages/sessions";
import Schedule from "@/pages/schedule";
import StaffPage from "@/pages/staff";
import AlertsPage from "@/pages/alerts";
import Compliance from "@/pages/compliance";
import ComplianceChecklist from "@/pages/compliance-checklist";
import Reports from "@/pages/reports";
import StudentDetail from "@/pages/student-detail";
import ImportData from "@/pages/import-data";
import ProgramDataPage from "@/pages/program-data";
import StudentIepPage from "@/pages/student-iep";
import ComplianceTimelinePage from "@/pages/compliance-timeline";
import StaffDetailPage from "@/pages/staff-detail";
import IepSearchPage from "@/pages/iep-search";
import ProtectiveMeasuresPage from "@/pages/protective-measures";
import AnalyticsPage from "@/pages/analytics";
import StateReportingPage from "@/pages/state-reporting";

import SpedStudentDashboard from "@/pages/sped-student/SpedStudentDashboard";
import SpedStudentGoals from "@/pages/sped-student/SpedStudentGoals";
import SpedStudentSessions from "@/pages/sped-student/SpedStudentSessions";
import SpedStudentServices from "@/pages/sped-student/SpedStudentServices";
import SpedStudentCheckIn from "@/pages/sped-student/SpedStudentCheckIn";
import SpedStudentWins from "@/pages/sped-student/SpedStudentWins";
import IepSuggestions from "@/pages/iep-suggestions";
import DistrictOverview from "@/pages/district-overview";
import BehaviorAssessmentPage from "@/pages/behavior-assessment";
import IepBuilderPage from "@/pages/iep-builder";
import ExecutiveDashboard from "@/pages/executive-dashboard";
import IepCalendarPage from "@/pages/iep-calendar";
import ResourceManagement from "@/pages/resource-management";
import CompensatoryServices from "@/pages/compensatory-services";
import ParentCommunication from "@/pages/parent-communication";
import Supervision from "@/pages/supervision";
import ParaMyDayPage from "@/pages/para-my-day";
import AuditLogPage from "@/pages/audit-log";
import RecentlyDeletedPage from "@/pages/recently-deleted";
import SetupPage from "@/pages/setup";
import MyCaseloadPage from "@/pages/my-caseload";
import EvaluationsPage from "@/pages/evaluations";
import TransitionsPage from "@/pages/transitions";
import IepMeetingsPage from "@/pages/iep-meetings";
import SisSettingsPage from "@/pages/sis-settings";
import AgenciesPage from "@/pages/agencies";
import AgencyDetailPage from "@/pages/agency-detail";
import ContractUtilizationPage from "@/pages/contract-utilization";
import BillingPage from "@/pages/billing";
import TenantsPage from "@/pages/tenants";

import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import SignDocumentPage from "@/pages/sign-document";
import PricingPage from "@/pages/pricing";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

const STAFF_ROLES: UserRole[] = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para"];

function ProtectedRoutes({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  // Register synchronously during render so the token is available before
  // any child component's useQuery fires on first mount (parent renders first).
  registerTokenProvider(() => getToken());

  if (!isLoaded) return null;
  if (!isSignedIn) return <RedirectToSignIn />;
  return <>{children}</>;
}

function BoundedRoute({ component: Comp, fallbackTitle, featureKey, ...rest }: { component: React.ComponentType<any>; fallbackTitle?: string; path?: string; featureKey?: FeatureKey }) {
  return (
    <Route {...rest}>
      {(params: any) => (
        <ErrorBoundary fallbackTitle={fallbackTitle}>
          {featureKey ? (
            <FeatureGate featureKey={featureKey}>
              <Comp {...params} />
            </FeatureGate>
          ) : (
            <Comp {...params} />
          )}
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

function AppRouter() {
  const { role } = useRole();
  const isStaff = (STAFF_ROLES as string[]).includes(role);

  return (
    <AppLayout>
      {isStaff && <StaffRouter />}
      {role === "sped_student" && <SpedStudentRouter />}
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
