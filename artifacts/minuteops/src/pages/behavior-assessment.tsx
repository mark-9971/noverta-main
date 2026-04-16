import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardList, BarChart3, Eye, Shield } from "lucide-react";
import {
  listStudents, listFbas, getStudentBips, listFbaObservations,
  getFbaObservationsSummary, listFaSessions
} from "@workspace/api-client-react";
import { EmptyState } from "./behavior-assessment/shared";
import { StudentPicker } from "./behavior-assessment/StudentPicker";
import { FbaListPanel } from "./behavior-assessment/FbaListPanel";
import { AbcDataPanel } from "./behavior-assessment/AbcDataPanel";
import { FaPanel } from "./behavior-assessment/FaPanel";
import { BipPanel } from "./behavior-assessment/BipPanel";
import type {
  Student, FbaRecord, Observation, FaSession, ObsSummary, BipRecord
} from "./behavior-assessment/types";

export default function BehaviorAssessmentPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"fbas" | "abc" | "fa" | "bip">("fbas");

  const [fbas, setFbas] = useState<FbaRecord[]>([]);
  const [selectedFba, setSelectedFba] = useState<FbaRecord | null>(null);
  const [showNewFba, setShowNewFba] = useState(false);

  const [observations, setObservations] = useState<Observation[]>([]);
  const [obsSummary, setObsSummary] = useState<ObsSummary | null>(null);
  const [showNewObs, setShowNewObs] = useState(false);

  const [faSessions, setFaSessions] = useState<FaSession[]>([]);
  const [showNewFa, setShowNewFa] = useState(false);

  const [bips, setBips] = useState<BipRecord[]>([]);
  const [selectedBip, setSelectedBip] = useState<BipRecord | null>(null);
  const [editingBip, setEditingBip] = useState<Partial<BipRecord> | null>(null);

  useEffect(() => {
    listStudents({ limit: 200 } as any).then(d => {
      const list = Array.isArray(d) ? d : (d as any).students || [];
      setStudents(list);
    }).catch(() => {});
  }, []);

  const loadFbas = useCallback(async (sid: number) => {
    const data = await listFbas(sid);
    setFbas(data as any);
  }, []);

  const loadBips = useCallback(async (sid: number) => {
    const data = await getStudentBips(sid);
    setBips(data as any);
  }, []);

  const loadObservations = useCallback(async (fbaId: number) => {
    const [obsR, sumR] = await Promise.all([
      listFbaObservations(fbaId),
      getFbaObservationsSummary(fbaId),
    ]);
    setObservations(obsR as any);
    setObsSummary(sumR as any);
  }, []);

  const loadFaSessions = useCallback(async (fbaId: number) => {
    const data = await listFaSessions(fbaId);
    setFaSessions(data as any);
  }, []);

  const selectStudent = (s: Student) => {
    setSelectedStudent(s);
    setSelectedFba(null);
    setSelectedBip(null);
    loadFbas(s.id);
    loadBips(s.id);
  };

  const selectFba = (fba: FbaRecord) => {
    setSelectedFba(fba);
    loadObservations(fba.id);
    loadFaSessions(fba.id);
  };

  const filteredStudents = students.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const tabs = [
    { key: "fbas" as const, label: "FBAs", icon: ClipboardList },
    { key: "abc" as const, label: "ABC Data", icon: Eye },
    { key: "fa" as const, label: "Functional Analysis", icon: BarChart3 },
    { key: "bip" as const, label: "BIP", icon: Shield },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Behavior Assessment</h1>
        <p className="text-sm text-gray-500 mt-1">FBA, Functional Analysis, and Behavior Intervention Plans</p>
      </div>

      {!selectedStudent ? (
        <StudentPicker
          students={filteredStudents}
          search={studentSearch}
          onSearch={setStudentSearch}
          onSelect={selectStudent}
        />
      ) : (
        <>
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-sm">
              {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{selectedStudent.firstName} {selectedStudent.lastName}</p>
              <p className="text-xs text-gray-500">{fbas.length} FBA{fbas.length !== 1 ? "s" : ""} · {bips.length} BIP{bips.length !== 1 ? "s" : ""}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedStudent(null); setSelectedFba(null); setSelectedBip(null); }}>
              Change Student
            </Button>
          </div>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {tabs.map(t => (
              <button key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                  activeTab === t.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <t.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {activeTab === "fbas" && (
            <FbaListPanel
              fbas={fbas}
              selectedFba={selectedFba}
              student={selectedStudent}
              onSelect={selectFba}
              showNew={showNewFba}
              onShowNew={setShowNewFba}
              onCreated={() => { loadFbas(selectedStudent.id); setShowNewFba(false); }}
            />
          )}

          {activeTab === "abc" && (
            selectedFba ? (
              <AbcDataPanel
                fba={selectedFba}
                observations={observations}
                summary={obsSummary}
                showNew={showNewObs}
                onShowNew={setShowNewObs}
                onCreated={() => loadObservations(selectedFba.id)}
                onDeleted={() => loadObservations(selectedFba.id)}
              />
            ) : (
              <EmptyState icon={Eye} message="Select an FBA first to record ABC observations" />
            )
          )}

          {activeTab === "fa" && (
            selectedFba ? (
              <FaPanel
                fba={selectedFba}
                sessions={faSessions}
                showNew={showNewFa}
                onShowNew={setShowNewFa}
                onCreated={() => loadFaSessions(selectedFba.id)}
                onDeleted={() => loadFaSessions(selectedFba.id)}
              />
            ) : (
              <EmptyState icon={BarChart3} message="Select an FBA first to run a Functional Analysis" />
            )
          )}

          {activeTab === "bip" && (
            <BipPanel
              student={selectedStudent}
              bips={bips}
              selectedBip={selectedBip}
              editingBip={editingBip}
              selectedFba={selectedFba}
              onSelectBip={(b) => { setSelectedBip(b); setEditingBip(null); }}
              onEdit={setEditingBip}
              onRefresh={() => loadBips(selectedStudent.id)}
            />
          )}
        </>
      )}
    </div>
  );
}
