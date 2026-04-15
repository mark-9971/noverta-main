import { useState, useMemo } from "react";
import { useListStudents, useListMinuteProgress, useListSpedStudents, useListSchools, createStudent } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Search, ChevronRight, GraduationCap, BookOpen, Plus, AlertCircle, Archive } from "lucide-react";
import { Link } from "wouter";
import { RISK_CONFIG, RISK_PRIORITY_ORDER } from "@/lib/constants";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type TypeFilter = "all" | "sped" | "gen_ed";
type StatusFilter = "active" | "inactive" | "all";

export default function Students() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", grade: "", schoolId: "", externalId: "" });

  const { filterParams } = useSchoolContext();
  const { role } = useRole();
  const statusParam = statusFilter !== "all" ? statusFilter : undefined;
  const { data: students, isLoading, isError, refetch } = useListStudents({ ...filterParams, limit: 500, ...(statusParam ? { status: statusParam } : {}) } as any);
  const { data: progress } = useListMinuteProgress({ ...filterParams } as any);
  const { data: spedStudentsRaw } = useListSpedStudents(filterParams as any);
  const { data: schoolsData } = useListSchools();
  const schoolsList = (Array.isArray(schoolsData) ? schoolsData : []) as any[];

  const isAdmin = role === "admin";
  // hasSIS: set to true once a Student Information System integration is configured.
  // When false, admins manually add students; when true, redirect to SIS sync flow.
  const hasSIS = false;

  async function handleAddStudent() {
    if (!addForm.firstName || !addForm.lastName) { toast.error("First and last name are required"); return; }
    setAddSaving(true);
    try {
      await createStudent({
        firstName: addForm.firstName,
        lastName: addForm.lastName,
        grade: addForm.grade || null,
        schoolId: addForm.schoolId ? Number(addForm.schoolId) : null,
        externalId: addForm.externalId || null,
        status: "active",
      });
      toast.success(`${addForm.firstName} ${addForm.lastName} added`);
      setAddDialogOpen(false);
      setAddForm({ firstName: "", lastName: "", grade: "", schoolId: "", externalId: "" });
      refetch();
    } catch { toast.error("Failed to add student"); }
    setAddSaving(false);
  }

  const spedIds = new Set<number>((Array.isArray(spedStudentsRaw) ? spedStudentsRaw : []).map((s: any) => s.id));

  const studentList = (students as any[]) ?? [];
  const progressList = (progress as any[]) ?? [];
  const loading = isLoading;

  const priorityOrder = RISK_PRIORITY_ORDER;
  const studentRisk: Record<number, string> = {};
  for (const p of progressList) {
    const current = studentRisk[p.studentId];
    if (!current || priorityOrder.indexOf(p.riskStatus) < priorityOrder.indexOf(current)) {
      studentRisk[p.studentId] = p.riskStatus;
    }
  }

  const studentMinutes: Record<number, { delivered: number; required: number }> = {};
  for (const p of progressList) {
    if (!studentMinutes[p.studentId]) studentMinutes[p.studentId] = { delivered: 0, required: 0 };
    studentMinutes[p.studentId].delivered += p.deliveredMinutes;
    studentMinutes[p.studentId].required += p.requiredMinutes;
  }

  const spedCount = studentList.filter(s => spedIds.has(s.id)).length;
  const genEdCount = studentList.length - spedCount;

  const filtered = useMemo(() => {
    return studentList.filter(s => {
      const matchSearch = search.trim() === "" ||
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase());
      const isSped = spedIds.has(s.id);
      const matchType = typeFilter === "all" || (typeFilter === "sped" && isSped) || (typeFilter === "gen_ed" && !isSped);
      const riskStatus = studentRisk[s.id] ?? "on_track";
      const matchRisk = riskFilter === "all" || riskStatus === riskFilter;
      return matchSearch && matchType && matchRisk;
    });
  }, [studentList, search, typeFilter, riskFilter, spedIds, studentRisk]);

  const riskCounts = useMemo(() => {
    const typeFiltered = studentList.filter(s => {
      const isSped = spedIds.has(s.id);
      return typeFilter === "all" || (typeFilter === "sped" && isSped) || (typeFilter === "gen_ed" && !isSped);
    });
    const counts: Record<string, number> = {};
    for (const s of typeFiltered) {
      const r = studentRisk[s.id] ?? "on_track";
      counts[r] = (counts[r] ?? 0) + 1;
    }
    return counts;
  }, [studentList, typeFilter, spedIds, studentRisk]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Students</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            {studentList.length} total students · {spedCount} SPED · {genEdCount} Gen Ed
          </p>
        </div>
        {isAdmin && !hasSIS && (
          <button
            onClick={() => { setAddForm({ firstName: "", lastName: "", grade: "", schoolId: "", externalId: "" }); setAddDialogOpen(true); }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add Student
          </button>
        )}
      </div>

      {isAdmin && !hasSIS && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[12px] text-gray-600">
          <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium text-gray-700">No SIS connected.</span> Student demographics are managed manually. Use the "Add Student" button above or{" "}
            <Link href="/import-data" className="text-emerald-700 hover:text-emerald-800 underline">import from CSV</Link>{" "}
            to add students in bulk.
          </div>
        </div>
      )}
      {isAdmin && hasSIS && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-[12px] text-gray-600">
          <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium text-gray-700">SIS connected.</span> Student records sync automatically. To add a student manually,{" "}
            <Link href="/import-data" className="text-emerald-700 hover:text-emerald-800 underline">use the SIS or CSV import</Link>{" "}
            to avoid duplicate records.
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {([
          { key: "all" as TypeFilter, label: "All Students", count: studentList.length, icon: null },
          { key: "sped" as TypeFilter, label: "SPED", count: spedCount, icon: GraduationCap },
          { key: "gen_ed" as TypeFilter, label: "Gen Ed", count: genEdCount, icon: BookOpen },
        ]).map(t => (
          <button
            key={t.key}
            aria-pressed={typeFilter === t.key}
            onClick={() => setTypeFilter(typeFilter === t.key && t.key !== "all" ? "all" : t.key)}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all flex items-center gap-1.5 ${
              typeFilter === t.key ? "bg-emerald-700 text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
            }`}
          >
            {t.icon && <t.icon className="w-3.5 h-3.5" />}
            {t.label} ({t.count})
          </button>
        ))}
        <div className="w-px bg-gray-200 mx-1 self-stretch" />
        {([
          { key: "active" as StatusFilter, label: "Active" },
          { key: "inactive" as StatusFilter, label: "Inactive", icon: Archive },
          { key: "all" as StatusFilter, label: "All Statuses" },
        ]).map(s => (
          <button
            key={s.key}
            aria-pressed={statusFilter === s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === s.key
                ? s.key === "inactive" ? "bg-amber-600 text-white" : "bg-gray-700 text-white"
                : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
            }`}
          >
            {s.key === "inactive" && <Archive className="w-3 h-3" />}
            {s.label}
          </button>
        ))}
        <div className="w-px bg-gray-200 mx-1 self-stretch" />
        {["out_of_compliance", "at_risk", "slightly_behind", "on_track"].map(r => {
          const cfg = RISK_CONFIG[r];
          return (
            <button
              key={r}
              aria-pressed={riskFilter === r}
              onClick={() => setRiskFilter(riskFilter === r ? "all" : r)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                riskFilter === r ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
              }`}
            >{cfg.label} ({riskCounts[r] ?? 0})</button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input className="pl-10 h-10 text-[13px] bg-white" placeholder="Search by student name..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {isError && studentList.length === 0 ? (
          <ErrorBanner message="Failed to load student list." onRetry={() => refetch()} />
        ) : loading ? (
          [...Array(8)].map((_, i) => <Skeleton key={i} className="w-full h-[72px] rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400"><p className="font-medium">No students found</p></div>
        ) : filtered.map(s => {
          const isSped = spedIds.has(s.id);
          const risk = studentRisk[s.id] ?? "on_track";
          const cfg = RISK_CONFIG[risk] ?? RISK_CONFIG.on_track;
          const mins = studentMinutes[s.id] ?? { delivered: 0, required: 0 };
          const pct = mins.required > 0 ? Math.round((mins.delivered / mins.required) * 100) : 0;

          return (
            <Link key={s.id} href={`/students/${s.id}`}>
              <Card className="hover:shadow-sm transition-all cursor-pointer group">
                <div className="flex items-center gap-4 p-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${
                    isSped ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {s.firstName?.[0]}{s.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-gray-800">{s.firstName} {s.lastName}</p>
                      <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${
                        isSped ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-500 border-gray-200"
                      }`}>
                        {isSped ? "SPED" : "Gen Ed"}
                      </Badge>
                      {s.status === "inactive" && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-400">
                      Grade {s.grade}{s.caseManagerId ? ` · CM #${s.caseManagerId}` : ""}
                    </p>
                  </div>
                  {isSped ? (
                    <>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} flex-shrink-0 hidden md:inline-flex`}>
                        {cfg.label}
                      </span>
                      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                        <MiniProgressRing value={pct} size={36} strokeWidth={3.5} color={cfg.ringColor} />
                        <div className="text-right w-14 md:w-20">
                          <p className="text-[13px] font-bold text-gray-700">{pct}%</p>
                          <p className="text-[10px] text-gray-400 hidden sm:block">{mins.delivered}/{mins.required}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-gray-50 text-gray-500 border-gray-200 flex-shrink-0 hidden md:inline-flex">
                      General Education
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Dialog open={addDialogOpen} onOpenChange={v => { if (!v) setAddDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Add Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">First Name</Label>
                <Input value={addForm.firstName} onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))} className="h-9 text-[13px]" placeholder="First name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Last Name</Label>
                <Input value={addForm.lastName} onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))} className="h-9 text-[13px]" placeholder="Last name" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Grade</Label>
                <Select value={addForm.grade} onValueChange={v => setAddForm(f => ({ ...f, grade: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {["PK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map(g => (
                      <SelectItem key={g} value={g} className="text-[13px]">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">School</Label>
                <Select value={addForm.schoolId} onValueChange={v => setAddForm(f => ({ ...f, schoolId: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {schoolsList.map((sch: any) => (
                      <SelectItem key={sch.id} value={String(sch.id)} className="text-[13px]">{sch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">External ID</Label>
                <Input value={addForm.externalId} onChange={e => setAddForm(f => ({ ...f, externalId: e.target.value }))} className="h-9 text-[13px]" placeholder="SIS ID" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)} disabled={addSaving}>Cancel</Button>
            <Button size="sm" onClick={handleAddStudent} disabled={addSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {addSaving ? "Adding…" : "Add Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
