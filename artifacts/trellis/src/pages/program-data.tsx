import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, GraduationCap, Calendar, Layers, Play } from "lucide-react";
import ProgramBuilderWizard from "@/components/program-builder/ProgramBuilderWizard";
import TemplateManager from "@/components/program-builder/TemplateManager";
import SaveAsTemplateModal from "@/components/program-builder/SaveAsTemplateModal";
import {
  listStudents, listProgramTemplates, listBehaviorTargets, listProgramTargets,
  listDataSessions, getBehaviorDataTrends, getProgramDataTrends, listProgramSteps,
} from "@workspace/api-client-react";

import {
  BehaviorTarget, ProgramTarget, DataSession, ProgramTemplate, Student, TrendPoint,
} from "./program-data/constants";
import LiveDataCollection from "./program-data/LiveDataCollection";
import BehaviorsTab from "./program-data/BehaviorsTab";
import ProgramsTab from "./program-data/ProgramsTab";
import DataSessionsTab from "./program-data/DataSessionsTab";
import ProgramDetailModal from "./program-data/ProgramDetailModal";
import AddBehaviorModal from "./program-data/AddBehaviorModal";
import AddProgramModal from "./program-data/AddProgramModal";
import LogDataSessionModal from "./program-data/LogDataSessionModal";

export default function ProgramDataPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [behaviorTargets, setBehaviorTargets] = useState<BehaviorTarget[]>([]);
  const [programTargets, setProgramTargets] = useState<ProgramTarget[]>([]);
  const [dataSessions, setDataSessions] = useState<DataSession[]>([]);
  const [behaviorTrends, setBehaviorTrends] = useState<TrendPoint[]>([]);
  const [programTrends, setProgramTrends] = useState<TrendPoint[]>([]);
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"behaviors" | "programs" | "sessions" | "templates" | "collect">("behaviors");
  const [showAddBehavior, setShowAddBehavior] = useState(false);
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [showLogSession, setShowLogSession] = useState(false);
  const [editingProgram, setEditingProgram] = useState<ProgramTarget | null>(null);
  const [showProgramBuilder, setShowProgramBuilder] = useState(false);
  const [builderEditProgram, setBuilderEditProgram] = useState<ProgramTarget | null>(null);
  const [builderEditSteps, setBuilderEditSteps] = useState<any[]>([]);
  const [saveAsTemplateProgram, setSaveAsTemplateProgram] = useState<ProgramTarget | null>(null);

  useEffect(() => {
    Promise.all([
      listStudents(),
      listProgramTemplates(),
    ]).then(([data, tmpl]) => {
      const withData = (data as any[]).filter((s: any) => s.status === "active");
      setStudents(withData);
      setTemplates(tmpl as any[]);
      if (withData.length > 0) setSelectedStudent(withData[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadStudentData = useCallback(async (sid: number) => {
    const [bt, pt, ds, btrend, ptrend] = await Promise.all([
      listBehaviorTargets(sid),
      listProgramTargets(sid),
      listDataSessions(sid, { limit: 30 }),
      getBehaviorDataTrends(sid),
      getProgramDataTrends(sid),
    ]);
    setBehaviorTargets(bt as any);
    setProgramTargets(pt as any);
    setDataSessions(ds as any);
    setBehaviorTrends(btrend as any);
    setProgramTrends(ptrend as any);
  }, []);

  useEffect(() => {
    if (selectedStudent) loadStudentData(selectedStudent);
  }, [selectedStudent, loadStudentData]);

  const student = students.find(s => s.id === selectedStudent);

  function handleEditBuilder(pt: ProgramTarget) {
    listProgramSteps(pt.id).then(s => {
      setBuilderEditProgram(pt);
      setBuilderEditSteps(s as any[]);
    });
  }

  if (loading) return <div className="p-8"><Skeleton className="w-full h-96" /></div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Program Data</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1 hidden sm:block">ABA programs, behavior tracking, and data collection</p>
        </div>
        <select
          value={selectedStudent ?? ""}
          onChange={e => setSelectedStudent(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 w-full sm:w-auto"
        >
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
          ))}
        </select>
      </div>

      {selectedStudent && (
        <>
          <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
            {([
              { key: "collect" as const, label: "Collect", fullLabel: "Data Collection", icon: Play, count: null, mobile: true },
              { key: "behaviors" as const, label: "Behaviors", fullLabel: "Behavior Targets", icon: Activity, count: behaviorTargets.length, mobile: false },
              { key: "programs" as const, label: "Programs", fullLabel: "Skill Programs", icon: GraduationCap, count: programTargets.length, mobile: false },
              { key: "sessions" as const, label: "Sessions", fullLabel: "Data Sessions", icon: Calendar, count: dataSessions.length, mobile: false },
              { key: "templates" as const, label: "Library", fullLabel: "Template Library", icon: Layers, count: templates.length, mobile: false },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 text-[12px] md:text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
                  tab === t.key ? "border-emerald-700 text-emerald-800" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <t.icon className="w-4 h-4" />
                <span className="md:hidden">{t.label}</span>
                <span className="hidden md:inline">{t.fullLabel}</span>
                {t.count !== null && <span className="hidden sm:inline">({t.count})</span>}
              </button>
            ))}
          </div>

          {tab === "collect" && (
            <LiveDataCollection
              studentId={selectedStudent}
              student={student!}
              behaviorTargets={behaviorTargets}
              programTargets={programTargets}
              onSessionSaved={() => loadStudentData(selectedStudent)}
            />
          )}

          {tab === "behaviors" && (
            <BehaviorsTab
              student={student}
              behaviorTargets={behaviorTargets}
              behaviorTrends={behaviorTrends}
              onAdd={() => setShowAddBehavior(true)}
            />
          )}

          {tab === "programs" && (
            <ProgramsTab
              student={student}
              programTargets={programTargets}
              programTrends={programTrends}
              onQuickAdd={() => setShowAddProgram(true)}
              onOpenBuilder={() => setShowProgramBuilder(true)}
              onEditProgram={(pt) => setEditingProgram(pt)}
              onEditBuilder={handleEditBuilder}
              onSaveAsTemplate={(pt) => setSaveAsTemplateProgram(pt)}
            />
          )}

          {tab === "sessions" && (
            <DataSessionsTab
              dataSessions={dataSessions}
              onLogSession={() => setShowLogSession(true)}
            />
          )}

          {tab === "templates" && (
            <TemplateManager
              studentId={selectedStudent}
              onCloned={() => loadStudentData(selectedStudent)}
              onTemplateUpdated={() => listProgramTemplates().then(t => setTemplates(t as any[]))}
            />
          )}
        </>
      )}

      {showAddBehavior && selectedStudent && (
        <AddBehaviorModal
          studentId={selectedStudent}
          onClose={() => setShowAddBehavior(false)}
          onSaved={() => { setShowAddBehavior(false); loadStudentData(selectedStudent); }}
        />
      )}
      {showAddProgram && selectedStudent && (
        <AddProgramModal
          studentId={selectedStudent}
          templates={templates}
          onClose={() => setShowAddProgram(false)}
          onSaved={() => { setShowAddProgram(false); loadStudentData(selectedStudent); }}
        />
      )}
      {showLogSession && selectedStudent && (
        <LogDataSessionModal
          studentId={selectedStudent}
          behaviorTargets={behaviorTargets}
          programTargets={programTargets}
          onClose={() => setShowLogSession(false)}
          onSaved={() => { setShowLogSession(false); loadStudentData(selectedStudent); }}
        />
      )}
      {editingProgram && (
        <ProgramDetailModal
          program={editingProgram}
          onClose={() => setEditingProgram(null)}
          onSaved={() => { setEditingProgram(null); if (selectedStudent) loadStudentData(selectedStudent); }}
        />
      )}
      {showProgramBuilder && selectedStudent && student && (
        <ProgramBuilderWizard
          studentId={selectedStudent}
          studentName={`${student.firstName} ${student.lastName}`}
          onClose={() => setShowProgramBuilder(false)}
          onSaved={() => { setShowProgramBuilder(false); if (selectedStudent) loadStudentData(selectedStudent); }}
        />
      )}
      {builderEditProgram && student && (
        <ProgramBuilderWizard
          studentId={builderEditProgram.studentId}
          studentName={`${student.firstName} ${student.lastName}`}
          editingProgram={builderEditProgram}
          existingSteps={builderEditSteps}
          onClose={() => { setBuilderEditProgram(null); setBuilderEditSteps([]); }}
          onSaved={() => { setBuilderEditProgram(null); setBuilderEditSteps([]); if (selectedStudent) loadStudentData(selectedStudent); }}
        />
      )}
      {saveAsTemplateProgram && (
        <SaveAsTemplateModal
          programId={saveAsTemplateProgram.id}
          programName={saveAsTemplateProgram.name}
          onClose={() => setSaveAsTemplateProgram(null)}
          onSaved={() => { setSaveAsTemplateProgram(null); listProgramTemplates().then(t => setTemplates(t as any[])); }}
        />
      )}
    </div>
  );
}
