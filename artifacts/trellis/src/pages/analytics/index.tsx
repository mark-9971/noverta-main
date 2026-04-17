import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, BarChart3, Clock, GraduationCap, Shield, User,
} from "lucide-react";
import OverviewTab from "./OverviewTab";
import BehaviorTab from "./BehaviorTab";
import AcademicTab from "./AcademicTab";
import MinutesTab from "./MinutesTab";
import StudentTab from "./StudentTab";
import SafetyTab from "./SafetyTab";

export default function AnalyticsPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Analytics & Insights</h1>
        <p className="text-sm text-gray-500 mt-1">School-wide and per-student data visualization and performance analysis</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-white border border-gray-200 p-1 rounded-xl shadow-sm">
          <TabsTrigger value="overview" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <BarChart3 className="w-4 h-4 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="behavior" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <Activity className="w-4 h-4 mr-1.5" /> Behavior
          </TabsTrigger>
          <TabsTrigger value="academic" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <GraduationCap className="w-4 h-4 mr-1.5" /> Academic
          </TabsTrigger>
          <TabsTrigger value="minutes" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <Clock className="w-4 h-4 mr-1.5" /> Minutes
          </TabsTrigger>
          <TabsTrigger value="student" className="text-[13px] rounded-lg data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-800">
            <User className="w-4 h-4 mr-1.5" /> Student
          </TabsTrigger>
          <TabsTrigger value="safety" className="text-[13px] rounded-lg data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
            <Shield className="w-4 h-4 mr-1.5" /> Safety
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="behavior"><BehaviorTab /></TabsContent>
        <TabsContent value="academic"><AcademicTab /></TabsContent>
        <TabsContent value="minutes"><MinutesTab /></TabsContent>
        <TabsContent value="student"><StudentTab /></TabsContent>
        <TabsContent value="safety"><SafetyTab /></TabsContent>
      </Tabs>
    </div>
  );
}
