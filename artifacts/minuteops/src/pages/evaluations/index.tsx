import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  FileSearch, ClipboardList, Users,
  Shield, Columns3, List,
} from "lucide-react";
import { PipelineView } from "./PipelineView";
import { EvalDashboard } from "./EvalDashboard";
import { ReferralsTab } from "./ReferralsTab";
import { EvaluationsTab } from "./EvaluationsTab";
import { EligibilityTab } from "./EligibilityTab";
import type { PipelineCard } from "./types";

export default function EvaluationsPage() {
  const [viewMode, setViewMode] = useState<"tabs" | "pipeline">(() =>
    typeof window !== "undefined" && window.innerWidth >= 768 ? "pipeline" : "tabs"
  );
  const [activeTab, setActiveTab] = useState("dashboard");
  const [, navigate] = useLocation();

  function handleCardClick(card: PipelineCard) {
    navigate(`/students/${card.studentId}`);
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Evaluations & Eligibility</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">IDEA evaluation lifecycle — referrals, evaluations, eligibility, re-evaluation tracking</p>
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => setViewMode("tabs")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${viewMode === "tabs" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
          <button
            onClick={() => setViewMode("pipeline")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${viewMode === "pipeline" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Columns3 className="w-3.5 h-3.5" /> Pipeline
          </button>
        </div>
      </div>

      {viewMode === "pipeline" ? (
        <PipelineView onCardClick={handleCardClick} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="dashboard" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Dashboard</TabsTrigger>
            <TabsTrigger value="referrals" className="gap-1.5"><FileSearch className="w-3.5 h-3.5" /> Referrals</TabsTrigger>
            <TabsTrigger value="evaluations" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Evaluations</TabsTrigger>
            <TabsTrigger value="eligibility" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Eligibility</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-4"><EvalDashboard /></TabsContent>
          <TabsContent value="referrals" className="mt-4"><ReferralsTab /></TabsContent>
          <TabsContent value="evaluations" className="mt-4"><EvaluationsTab /></TabsContent>
          <TabsContent value="eligibility" className="mt-4"><EligibilityTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
