import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";
import { ClipboardCheck, Plus, Download } from "lucide-react";
import {
  listSupervisionSessions, getSupervisionComplianceSummary, listStaff,
  getSupervisionTrend, updateSupervisionSession, createSupervisionSession,
  deleteSupervisionSession, exportSupervisionSessionsCsv,
} from "@workspace/api-client-react";
import type { SupervisionSession, ComplianceSummary, StaffOption, FormData } from "./types";
import { SessionForm } from "./SessionForm";
import { LogTab } from "./LogTab";
import { ComplianceTab } from "./ComplianceTab";
import { TrendTab } from "./TrendTab";

export default function Supervision() {
  const { selectedSchoolId } = useSchoolContext();
  const { role } = useRole();
  const isAdminOrTeacher = role === "admin" || role === "sped_teacher";
  const search = useSearch();
  const [, navigate] = useLocation();
  const rawTab = new URLSearchParams(search).get("tab");
  const VALID_TABS = ["log", "compliance", "trend"] as const;
  type SupervisionTab = typeof VALID_TABS[number];
  const activeTab: SupervisionTab = (VALID_TABS.includes(rawTab as SupervisionTab) ? rawTab : "log") as SupervisionTab;
  function setActiveTab(t: SupervisionTab) {
    navigate(`/supervision?tab=${t}`, { replace: true });
  }
  const [sessions, setSessions] = useState<SupervisionSession[]>([]);
  const [compliance, setCompliance] = useState<ComplianceSummary[]>([]);
  const [trend, setTrend] = useState<{ weekStart: string; totalMinutes: number }[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterSupervisor, setFilterSupervisor] = useState("");
  const [filterSupervisee, setFilterSupervisee] = useState("");
  const [filterType, setFilterType] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState<FormData>({
    supervisorId: "",
    superviseeId: "",
    sessionDate: new Date().toISOString().substring(0, 10),
    durationMinutes: "60",
    supervisionType: "individual",
    topics: "",
    feedbackNotes: "",
    status: "completed",
  });

  const bcbas = staff.filter(s => s.role === "bcba");
  const superviseeStaff = staff.filter(s => ["para", "provider"].includes(s.role));

  function fetchAll() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSupervisor) params.set("supervisorId", filterSupervisor);
    if (filterSupervisee) params.set("superviseeId", filterSupervisee);
    if (filterType) params.set("supervisionType", filterType);
    if (selectedSchoolId) params.set("schoolId", String(selectedSchoolId));

    Promise.all([
      listSupervisionSessions(Object.fromEntries(params) as any).catch(() => []),
      isAdminOrTeacher ? getSupervisionComplianceSummary(selectedSchoolId ? { schoolId: selectedSchoolId } as any : undefined).catch(() => []) : Promise.resolve([]),
      listStaff({ status: "active", ...(selectedSchoolId ? { schoolId: selectedSchoolId } : {}) } as any).catch(() => []),
      isAdminOrTeacher ? getSupervisionTrend(selectedSchoolId ? { schoolId: selectedSchoolId } as any : undefined).catch(() => []) : Promise.resolve([]),
    ]).then(([s, c, st, tr]) => {
      setSessions(s as any);
      setCompliance(c as any);
      setStaff(st);
      setTrend(tr);
    }).catch(() => toast.error("Failed to load supervision data"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchAll(); }, [selectedSchoolId, filterSupervisor, filterSupervisee, filterType]);

  function resetForm() {
    setFormData({
      supervisorId: "",
      superviseeId: "",
      sessionDate: new Date().toISOString().substring(0, 10),
      durationMinutes: "60",
      supervisionType: "individual",
      topics: "",
      feedbackNotes: "",
      status: "completed",
    });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.supervisorId || !formData.superviseeId) {
      toast.error("Please select both supervisor and supervisee");
      return;
    }
    try {
      const body = {
        ...formData,
        supervisorId: Number(formData.supervisorId),
        superviseeId: Number(formData.superviseeId),
        durationMinutes: Number(formData.durationMinutes),
      };
      if (editingId) {
        await updateSupervisionSession(editingId, body as any);
      } else {
        await createSupervisionSession(body as any);
      }
      toast.success(editingId ? "Session updated" : "Supervision session logged");
      resetForm();
      setShowForm(false);
      fetchAll();
    } catch {
      toast.error("Failed to save supervision session");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this supervision session?")) return;
    try {
      await deleteSupervisionSession(id);
      toast.success("Session deleted");
      fetchAll();
    } catch {
      toast.error("Failed to delete session");
    }
  }

  function startEdit(session: SupervisionSession) {
    setFormData({
      supervisorId: String(session.supervisorId),
      superviseeId: String(session.superviseeId),
      sessionDate: session.sessionDate,
      durationMinutes: String(session.durationMinutes),
      supervisionType: session.supervisionType,
      topics: session.topics || "",
      feedbackNotes: session.feedbackNotes || "",
      status: session.status,
    });
    setEditingId(session.id);
    setShowForm(true);
  }

  async function exportCSV() {
    try {
      const blob = await exportSupervisionSessionsCsv(
        {
          supervisorId: filterSupervisor ? Number(filterSupervisor) : null,
          superviseeId: filterSupervisee ? Number(filterSupervisee) : null,
          schoolId: selectedSchoolId ?? null,
        },
        { responseType: "blob" } as RequestInit,
      ) as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `supervision_sessions_${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export CSV");
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" />
            Clinical Supervision
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isAdminOrTeacher ? "Track BCBA supervision of RBTs and paraprofessionals" : "View your supervision history"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdminOrTeacher && (
            <>
              <Button variant="outline" size="sm" onClick={exportCSV} className="text-gray-600">
                <Download className="w-4 h-4 mr-1" /> Export CSV
              </Button>
              <Button size="sm" onClick={() => { resetForm(); setShowForm(!showForm); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4 mr-1" /> Log Session
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: "log" as const, label: isAdminOrTeacher ? "Session Log" : "My Supervision", count: sessions.length },
          ...(isAdminOrTeacher ? [
            { key: "compliance" as const, label: "Compliance Dashboard", count: compliance.length },
            { key: "trend" as const, label: "Trend", count: null as number | null },
          ] : []),
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.label}
            {t.count !== null && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{t.count}</span>}
          </button>
        ))}
      </div>

      {showForm && (
        <SessionForm
          formData={formData}
          setFormData={setFormData}
          bcbas={bcbas}
          superviseeStaff={superviseeStaff}
          editingId={editingId}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); resetForm(); }}
        />
      )}

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {!loading && activeTab === "log" && (
        <LogTab
          sessions={sessions}
          bcbas={bcbas}
          superviseeStaff={superviseeStaff}
          filterSupervisor={filterSupervisor}
          setFilterSupervisor={setFilterSupervisor}
          filterSupervisee={filterSupervisee}
          setFilterSupervisee={setFilterSupervisee}
          filterType={filterType}
          setFilterType={setFilterType}
          isAdminOrTeacher={isAdminOrTeacher}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onEdit={startEdit}
          onDelete={handleDelete}
        />
      )}

      {!loading && activeTab === "compliance" && <ComplianceTab compliance={compliance} />}
      {!loading && activeTab === "trend" && <TrendTab trend={trend} />}
    </div>
  );
}
