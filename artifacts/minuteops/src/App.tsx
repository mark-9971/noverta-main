import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleProvider, useRole } from "@/lib/role-context";
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
import AdminClasses from "@/pages/admin-classes";
import AdminGradebook from "@/pages/admin-gradebook";

import StudentDashboard from "@/pages/student-portal/StudentDashboard";
import StudentClasses from "@/pages/student-portal/StudentClasses";
import StudentClassDetail from "@/pages/student-portal/StudentClassDetail";
import StudentAssignments from "@/pages/student-portal/StudentAssignments";
import StudentAssignmentDetail from "@/pages/student-portal/StudentAssignmentDetail";
import StudentGrades from "@/pages/student-portal/StudentGrades";

import TeacherDashboard from "@/pages/teacher-portal/TeacherDashboard";
import TeacherClasses from "@/pages/teacher-portal/TeacherClasses";
import TeacherClassDetail from "@/pages/teacher-portal/TeacherClassDetail";
import TeacherGradebook from "@/pages/teacher-portal/TeacherGradebook";
import TeacherAssignments from "@/pages/teacher-portal/TeacherAssignments";
import TeacherGradeAssignment from "@/pages/teacher-portal/TeacherGradeAssignment";
import TeacherSubmissions from "@/pages/teacher-portal/TeacherSubmissions";
import TeacherRoster from "@/pages/teacher-portal/TeacherRoster";

import SpedStudentDashboard from "@/pages/sped-student/SpedStudentDashboard";
import SpedStudentGoals from "@/pages/sped-student/SpedStudentGoals";
import SpedStudentSessions from "@/pages/sped-student/SpedStudentSessions";
import SpedStudentServices from "@/pages/sped-student/SpedStudentServices";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function AdminRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
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
      <Route path="/protective-measures" component={ProtectiveMeasuresPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/classes" component={AdminClasses} />
      <Route path="/gradebook" component={AdminGradebook} />
      <Route component={NotFound} />
    </Switch>
  );
}

function GenEdTeacherRouter() {
  return (
    <Switch>
      <Route path="/teacher" component={TeacherDashboard} />
      <Route path="/teacher/classes/:id" component={TeacherClassDetail} />
      <Route path="/teacher/classes" component={TeacherClasses} />
      <Route path="/teacher/gradebook" component={TeacherGradebook} />
      <Route path="/teacher/assignments/:id/grade" component={TeacherGradeAssignment} />
      <Route path="/teacher/assignments" component={TeacherAssignments} />
      <Route path="/teacher/submissions" component={TeacherSubmissions} />
      <Route path="/teacher/roster" component={TeacherRoster} />
      <Route>{() => <Redirect to="/teacher" />}</Route>
    </Switch>
  );
}

function GenEdStudentRouter() {
  return (
    <Switch>
      <Route path="/portal" component={StudentDashboard} />
      <Route path="/portal/classes/:id" component={StudentClassDetail} />
      <Route path="/portal/classes" component={StudentClasses} />
      <Route path="/portal/assignments/:id" component={StudentAssignmentDetail} />
      <Route path="/portal/assignments" component={StudentAssignments} />
      <Route path="/portal/grades" component={StudentGrades} />
      <Route>{() => <Redirect to="/portal" />}</Route>
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

  return (
    <AppLayout>
      {(role === "admin" || role === "sped_teacher") && <AdminRouter />}
      {role === "gen_ed_teacher" && <GenEdTeacherRouter />}
      {role === "gen_ed_student" && <GenEdStudentRouter />}
      {role === "sped_student" && <SpedStudentRouter />}
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RoleProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
        </RoleProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
