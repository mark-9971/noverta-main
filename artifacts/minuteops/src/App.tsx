import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleProvider, useRole, type UserRole } from "@/lib/role-context";
import { ThemeProvider } from "@/lib/theme-context";
import { SchoolProvider } from "@/lib/school-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Students from "@/pages/students";
import Sessions from "@/pages/sessions";
import Schedule from "@/pages/schedule";
import StaffPage from "@/pages/staff";
import AlertsPage from "@/pages/alerts";
import Compliance from "@/pages/compliance";
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

import SpedStudentDashboard from "@/pages/sped-student/SpedStudentDashboard";
import SpedStudentGoals from "@/pages/sped-student/SpedStudentGoals";
import SpedStudentSessions from "@/pages/sped-student/SpedStudentSessions";
import SpedStudentServices from "@/pages/sped-student/SpedStudentServices";
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

import SignInPage from "@/pages/sign-in";
import SignDocumentPage from "@/pages/sign-document";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

const STAFF_ROLES: UserRole[] = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para"];

function isSignedIn(): boolean {
  try {
    const token = localStorage.getItem("trellis_session");
    if (!token) return false;
    // Token is base64url(payload).base64url(sig) — extract payload before the last dot
    const dotIdx = token.lastIndexOf(".");
    const b64 = dotIdx >= 0 ? token.slice(0, dotIdx) : token;
    const json = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return Boolean(payload.userId && payload.role);
  } catch {
    return false;
  }
}

function ProtectedRoutes({ children }: { children: React.ReactNode }) {
  if (!isSignedIn()) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

function BoundedRoute({ component: Comp, fallbackTitle, ...rest }: { component: React.ComponentType<any>; fallbackTitle?: string; path?: string }) {
  return (
    <Route {...rest}>
      {(params: any) => (
        <ErrorBoundary fallbackTitle={fallbackTitle}>
          <Comp {...params} />
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
      <BoundedRoute path="/compliance" component={Compliance} fallbackTitle="Compliance error" />
      <BoundedRoute path="/reports" component={Reports} fallbackTitle="Reports error" />
      <BoundedRoute path="/import" component={ImportData} fallbackTitle="Import error" />
      <BoundedRoute path="/program-data" component={ProgramDataPage} fallbackTitle="Program data error" />
      <BoundedRoute path="/iep-suggestions" component={IepSuggestions} fallbackTitle="IEP suggestions error" />
      <BoundedRoute path="/protective-measures" component={ProtectiveMeasuresPage} fallbackTitle="Protective measures error" />
      <BoundedRoute path="/executive" component={ExecutiveDashboard} fallbackTitle="Executive dashboard error" />
      <BoundedRoute path="/iep-calendar" component={IepCalendarPage} fallbackTitle="IEP calendar error" />
      <BoundedRoute path="/analytics" component={AnalyticsPage} fallbackTitle="Analytics error" />
      <BoundedRoute path="/behavior-assessment" component={BehaviorAssessmentPage} fallbackTitle="Behavior assessment error" />
      <BoundedRoute path="/district" component={DistrictOverview} fallbackTitle="District overview error" />
      <BoundedRoute path="/resource-management" component={ResourceManagement} fallbackTitle="Resource management error" />
      <BoundedRoute path="/compensatory-services" component={CompensatoryServices} fallbackTitle="Compensatory services error" />
      <BoundedRoute path="/parent-communication" component={ParentCommunication} fallbackTitle="Parent communication error" />
      <BoundedRoute path="/supervision" component={Supervision} fallbackTitle="Supervision error" />
      <BoundedRoute path="/my-day" component={ParaMyDayPage} fallbackTitle="My Day error" />
      <BoundedRoute path="/audit-log" component={AuditLogPage} fallbackTitle="Audit log error" />
      <BoundedRoute path="/recently-deleted" component={RecentlyDeletedPage} fallbackTitle="Recently deleted error" />
      <BoundedRoute path="/setup" component={SetupPage} fallbackTitle="Setup error" />
      <BoundedRoute path="/my-caseload" component={MyCaseloadPage} fallbackTitle="My Caseload error" />
      <BoundedRoute path="/evaluations" component={EvaluationsPage} fallbackTitle="Evaluations error" />
      <BoundedRoute path="/transitions" component={TransitionsPage} fallbackTitle="Transitions error" />
      <BoundedRoute path="/iep-meetings" component={IepMeetingsPage} fallbackTitle="IEP Meetings error" />
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
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={base}>
          <Switch>
            <Route path="/sign-in" component={SignInPage} />
            <Route path="/sign-in/:rest*" component={SignInPage} />
            <Route path="/sign/:token" component={SignDocumentPage} />
            <Route>
              <ProtectedRoutes>
                <RoleProvider>
                  <ThemeProvider>
                    <SchoolProvider>
                      <AppRouter />
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
  );
}

export default App;
