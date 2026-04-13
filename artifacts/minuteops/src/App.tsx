import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function Router() {
  return (
    <AppLayout>
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
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
