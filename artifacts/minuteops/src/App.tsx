import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, RedirectToSignIn, useAuth } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { registerTokenProvider } from "@/lib/auth-fetch";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleProvider, useRole, type UserRole } from "@/lib/role-context";
import { SchoolProvider } from "@/lib/school-context";
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

import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";

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

  useEffect(() => {
    registerTokenProvider(() => getToken());
  }, [getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <RedirectToSignIn />;
  return <>{children}</>;
}

function StaffRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/students/:id/iep-builder" component={IepBuilderPage} />
      <Route path="/students/:id/iep" component={StudentIepPage} />
      <Route path="/students/:id" component={StudentDetail} />
      <Route path="/students" component={Students} />
      <Route path="/sessions" component={Sessions} />
      <Route path="/schedule" component={Schedule} />
      <Route path="/staff/:id" component={StaffDetailPage} />
      <Route path="/staff" component={StaffPage} />
      <Route path="/search" component={IepSearchPage} />
      <Route path="/alerts" component={AlertsPage} />
      <Route path="/compliance/timeline" component={ComplianceTimelinePage} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/reports" component={Reports} />
      <Route path="/import" component={ImportData} />
      <Route path="/program-data" component={ProgramDataPage} />
      <Route path="/iep-suggestions" component={IepSuggestions} />
      <Route path="/protective-measures" component={ProtectiveMeasuresPage} />
      <Route path="/executive" component={ExecutiveDashboard} />
      <Route path="/iep-calendar" component={IepCalendarPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/behavior-assessment" component={BehaviorAssessmentPage} />
      <Route path="/district" component={DistrictOverview} />
      <Route path="/resource-management" component={ResourceManagement} />
      <Route path="/compensatory-services" component={CompensatoryServices} />
      <Route path="/parent-communication" component={ParentCommunication} />
      <Route path="/supervision" component={Supervision} />
      <Route path="/my-day" component={ParaMyDayPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function SpedStudentRouter() {
  return (
    <Switch>
      <Route path="/sped-portal" component={SpedStudentDashboard} />
      <Route path="/sped-portal/goals" component={SpedStudentGoals} />
      <Route path="/sped-portal/sessions" component={SpedStudentSessions} />
      <Route path="/sped-portal/services" component={SpedStudentServices} />
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
              <Route path="/sign-in" component={SignInPage} />
              <Route path="/sign-in/:rest*" component={SignInPage} />
              <Route path="/sign-up" component={SignUpPage} />
              <Route path="/sign-up/:rest*" component={SignUpPage} />
              <Route>
                <ProtectedRoutes>
                  <RoleProvider>
                    <SchoolProvider>
                      <AppRouter />
                    </SchoolProvider>
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
