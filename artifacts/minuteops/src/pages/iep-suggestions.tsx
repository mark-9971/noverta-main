import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Sparkles, Search, ChevronRight, ChevronDown, Users, Brain,
  Target, ListChecks, BookOpen, Stethoscope, Check, Loader2,
  AlertTriangle, ArrowLeft, Zap, TrendingUp
} from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

interface StudentSummary {
  id: number; firstName: string; lastName: string; grade: string;
  disabilityCategory: string | null; goalAreas: string[]; serviceTypes: string[];
  existingBehaviors: number; existingPrograms: number;
  suggestedBehaviors: number; suggestedPrograms: number;
  suggestedRelatedServices: number; totalSuggestions: number;
}

interface Suggestion {
  name: string; relevance: number; reason: string;
  measurementType?: string; targetDirection?: string;
  baselineValue?: string; goalValue?: string;
  programType?: string; domain?: string; targetCriterion?: string;
  tags?: string[]; steps?: string[];
  description?: string; category?: string; linkedService?: string;
}

interface StudentSuggestions {
  student: { id: number; firstName: string; lastName: string; grade: string; disabilityCategory: string | null };
  iepGoalAreas: string[]; serviceTypes: string[];
  existingBehaviorCount: number; existingProgramCount: number;
  suggestions: {
    behaviors: Suggestion[]; dtt: Suggestion[];
    taskAnalyses: Suggestion[]; academicPrograms: Suggestion[];
    relatedServices: Suggestion[];
  };
  totalSuggestions: number;
}

type Category = "behaviors" | "dtt" | "taskAnalyses" | "academicPrograms" | "relatedServices";

const CATEGORY_META: Record<Category, { label: string; icon: any; color: string; bgColor: string; description: string }> = {
  behaviors: { label: "Behaviors to Track", icon: AlertTriangle, color: "text-rose-600", bgColor: "bg-rose-50", description: "Behaviors to monitor and track based on IEP behavioral goals" },
  dtt: { label: "Discrete Trial Training (DTT)", icon: Target, color: "text-blue-600", bgColor: "bg-blue-50", description: "Structured teaching programs using SD-Response-Consequence format" },
  taskAnalyses: { label: "Task Analyses (TA)", icon: ListChecks, color: "text-amber-600", bgColor: "bg-amber-50", description: "Multi-step functional skills broken into teachable components" },
  academicPrograms: { label: "Academic Programs", icon: BookOpen, color: "text-emerald-600", bgColor: "bg-emerald-50", description: "Academic skill targets for reading, math, and study skills" },
  relatedServices: { label: "Related Service Programs", icon: Stethoscope, color: "text-purple-600", bgColor: "bg-purple-50", description: "Therapy and support programs aligned with mandated services" },
};

function RelevanceBadge({ score }: { score: number }) {
  if (score >= 5) return <Badge className="bg-green-100 text-green-700 text-[10px]">High Match</Badge>;
  if (score >= 3) return <Badge className="bg-amber-100 text-amber-700 text-[10px]">Good Match</Badge>;
  return <Badge className="bg-slate-100 text-slate-600 text-[10px]">Possible</Badge>;
}

export default function IepSuggestions() {
  const [view, setView] = useState<"overview" | "detail">("overview");
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [detail, setDetail] = useState<StudentSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(new Set(["behaviors", "dtt", "taskAnalyses", "academicPrograms", "relatedServices"]));
  const [selected, setSelected] = useState<{ behaviors: Set<string>; programs: Set<string> }>({ behaviors: new Set(), programs: new Set() });
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetch(`${API}/iep-suggestions/all-students`)
      .then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); })
      .then(d => { setStudents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { toast.error("Failed to load suggestions"); setLoading(false); });
  }, []);

  const loadDetail = useCallback((studentId: number) => {
    setDetailLoading(true);
    setSelected({ behaviors: new Set(), programs: new Set() });
    fetch(`${API}/students/${studentId}/iep-suggestions`)
      .then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); })
      .then(d => { setDetail(d); setView("detail"); setDetailLoading(false); })
      .catch(() => { toast.error("Failed to load student suggestions"); setDetailLoading(false); });
  }, []);

  const toggleCategory = (cat: Category) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const toggleBehavior = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev.behaviors);
      next.has(name) ? next.delete(name) : next.add(name);
      return { ...prev, behaviors: next };
    });
  };

  const toggleProgram = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev.programs);
      next.has(name) ? next.delete(name) : next.add(name);
      return { ...prev, programs: next };
    });
  };

  const selectAllInCategory = (cat: Category) => {
    if (!detail) return;
    const items = detail.suggestions[cat];
    if (cat === "behaviors") {
      setSelected(prev => ({ ...prev, behaviors: new Set(items.map(i => i.name)) }));
    } else if (cat !== "relatedServices") {
      setSelected(prev => ({ ...prev, programs: new Set([...prev.programs, ...items.map(i => i.name)]) }));
    }
  };

  const applySelected = async () => {
    if (!detail) return;
    const totalSelected = selected.behaviors.size + selected.programs.size;
    if (totalSelected === 0) { toast.error("Select at least one suggestion to apply"); return; }
    setApplying(true);
    try {
      const resp = await fetch(`${API}/students/${detail.student.id}/apply-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          behaviors: [...selected.behaviors].map(name => ({ name })),
          programs: [...selected.programs].map(name => ({ name })),
        }),
      });
      const result = await resp.json();
      toast.success(`Created ${result.behaviorsCreated} behavior targets and ${result.programsCreated} programs`);
      loadDetail(detail.student.id);
    } catch {
      toast.error("Failed to apply suggestions");
    }
    setApplying(false);
  };

  const filtered = students.filter(s =>
    !search || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalSelected = selected.behaviors.size + selected.programs.size;

  if (view === "detail" && detail) {
    const { student: stu, suggestions: sug } = detail;
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("overview")} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> All Students
          </Button>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-600" />
              IEP Suggestions: {stu.firstName} {stu.lastName}
            </h1>
            <p className="text-slate-500 mt-1">
              Grade {stu.grade} · {detail.iepGoalAreas.length} IEP goal areas · {detail.serviceTypes.length} services
            </p>
          </div>
          {totalSelected > 0 && (
            <Button onClick={applySelected} disabled={applying} className="gap-2 bg-emerald-700 hover:bg-emerald-800">
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Apply {totalSelected} Selected
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "IEP Goal Areas", value: detail.iepGoalAreas.length, color: "bg-emerald-50 text-emerald-800" },
            { label: "Active Services", value: detail.serviceTypes.length, color: "bg-blue-50 text-blue-700" },
            { label: "Existing Behaviors", value: detail.existingBehaviorCount, color: "bg-rose-50 text-rose-700" },
            { label: "Existing Programs", value: detail.existingProgramCount, color: "bg-emerald-50 text-emerald-700" },
          ].map(stat => (
            <div key={stat.label} className={`rounded-xl p-3 ${stat.color}`}>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs opacity-70">{stat.label}</p>
            </div>
          ))}
        </div>

        {detail.iepGoalAreas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-slate-400 mr-1 self-center">Goal areas:</span>
            {detail.iepGoalAreas.map(a => (
              <Badge key={a} variant="outline" className="text-[11px] bg-slate-50">{a}</Badge>
            ))}
          </div>
        )}
        {detail.serviceTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-slate-400 mr-1 self-center">Services:</span>
            {detail.serviceTypes.map(s => (
              <Badge key={s} variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700">{s}</Badge>
            ))}
          </div>
        )}

        {detail.totalSuggestions === 0 ? (
          <Card className="text-center py-12 text-slate-400">
            <Check className="w-10 h-10 mx-auto mb-3 text-green-400" />
            <p className="font-medium text-slate-600">All caught up!</p>
            <p className="text-sm mt-1">This student already has programs assigned for all IEP-matched areas</p>
          </Card>
        ) : (
          (Object.keys(CATEGORY_META) as Category[]).map(cat => {
            const items = sug[cat];
            if (!items || items.length === 0) return null;
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const isExpanded = expandedCategories.has(cat);
            const isBehavior = cat === "behaviors";
            const isRelated = cat === "relatedServices";
            return (
              <Card key={cat} className="overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-left"
                  onClick={() => toggleCategory(cat)}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${meta.bgColor}`}>
                    <Icon className={`w-5 h-5 ${meta.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 text-sm">{meta.label}</p>
                    <p className="text-xs text-slate-400">{meta.description}</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-600">{items.length}</Badge>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>
                {isExpanded && (
                  <CardContent className="pt-0 pb-3 space-y-2">
                    {!isRelated && (
                      <div className="flex justify-end mb-1">
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => selectAllInCategory(cat)}>
                          Select All ({items.length})
                        </Button>
                      </div>
                    )}
                    {items.map(item => {
                      const isSelected = isBehavior ? selected.behaviors.has(item.name) : selected.programs.has(item.name);
                      return (
                        <div
                          key={item.name}
                          className={`rounded-lg border p-3 transition-all cursor-pointer ${
                            isRelated ? "cursor-default" : ""
                          } ${isSelected ? "border-emerald-300 bg-emerald-50/50 ring-1 ring-emerald-200" : "border-slate-200 hover:border-slate-300"}`}
                          onClick={() => {
                            if (isRelated) return;
                            isBehavior ? toggleBehavior(item.name) : toggleProgram(item.name);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            {!isRelated && (
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                                isSelected ? "bg-emerald-700 border-emerald-700" : "border-slate-300"
                              }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm text-slate-800">{item.name}</p>
                                <RelevanceBadge score={item.relevance} />
                                {item.programType && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.programType === "discrete_trial" ? "DTT" : "TA"}
                                  </Badge>
                                )}
                                {item.domain && (
                                  <Badge variant="outline" className="text-[10px] bg-slate-50">{item.domain}</Badge>
                                )}
                                {item.linkedService && (
                                  <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-600">{item.linkedService}</Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                              )}
                              {item.reason && (
                                <p className="text-[11px] text-slate-400 mt-1">
                                  <TrendingUp className="w-3 h-3 inline mr-1" />
                                  {item.reason}
                                </p>
                              )}
                              {item.measurementType && (
                                <div className="flex gap-3 mt-1.5 text-[11px] text-slate-500">
                                  <span>Measure: {item.measurementType}</span>
                                  <span>Direction: {item.targetDirection}</span>
                                  <span>Baseline: {item.baselineValue} → Goal: {item.goalValue}</span>
                                </div>
                              )}
                              {item.targetCriterion && (
                                <p className="text-[11px] text-slate-500 mt-1">Criterion: {item.targetCriterion}</p>
                              )}
                              {item.steps && item.steps.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {item.steps.map((s, i) => (
                                    <span key={i} className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
                                      {i + 1}. {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-emerald-600" />
          IEP Program Suggestions
        </h1>
        <p className="text-slate-500 mt-1">
          Auto-generated suggestions for behaviors, DTTs, task analyses, academic programs, and related services based on each student's IEP goals and service requirements.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search students..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No SPED students found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "SPED Students", value: students.length, icon: Users, color: "bg-emerald-50 text-emerald-800" },
              { label: "Total Suggestions", value: students.reduce((s, st) => s + st.totalSuggestions, 0), icon: Sparkles, color: "bg-amber-50 text-amber-700" },
              { label: "Avg per Student", value: Math.round(students.reduce((s, st) => s + st.totalSuggestions, 0) / students.length), icon: Brain, color: "bg-blue-50 text-blue-700" },
              { label: "With 10+ Suggestions", value: students.filter(s => s.totalSuggestions >= 10).length, icon: Target, color: "bg-emerald-50 text-emerald-700" },
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`rounded-xl p-3 ${stat.color}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 opacity-60" />
                    <p className="text-xs opacity-70">{stat.label}</p>
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            {filtered.map(stu => (
              <Card
                key={stu.id}
                className="hover:border-emerald-200 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => loadDetail(stu.id)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                    {stu.firstName[0]}{stu.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800">{stu.firstName} {stu.lastName}</p>
                      <span className="text-xs text-slate-400">Grade {stu.grade}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {stu.serviceTypes.slice(0, 4).map(s => (
                        <Badge key={s} variant="outline" className="text-[10px] py-0">{s}</Badge>
                      ))}
                      {stu.goalAreas.slice(0, 3).map(a => (
                        <Badge key={a} variant="outline" className="text-[10px] py-0 bg-slate-50 text-slate-500">{a}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span className="font-bold text-lg text-slate-800">{stu.totalSuggestions}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">suggestions</p>
                    </div>
                    <div className="text-right hidden md:block">
                      <div className="flex gap-2 text-[11px]">
                        {stu.suggestedBehaviors > 0 && <span className="text-rose-500">{stu.suggestedBehaviors} bhv</span>}
                        {stu.suggestedPrograms > 0 && <span className="text-blue-500">{stu.suggestedPrograms} prog</span>}
                        {stu.suggestedRelatedServices > 0 && <span className="text-purple-500">{stu.suggestedRelatedServices} svc</span>}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {stu.existingBehaviors} bhv + {stu.existingPrograms} prog assigned
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {detailLoading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 flex items-center gap-3 shadow-lg">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <p className="text-slate-600">Analyzing IEP data...</p>
          </div>
        </div>
      )}
    </div>
  );
}
