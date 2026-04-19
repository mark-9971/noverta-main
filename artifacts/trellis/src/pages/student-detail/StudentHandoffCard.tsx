import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Heart,
  Brain,
  Zap,
  BookOpen,
  Layers,
  Phone,
  StickyNote,
  ShieldAlert,
  ArrowRight,
  Ban,
  CheckCircle2,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MedicalAlert {
  id: number;
  alertType: string;
  description: string;
  severity: string;
  treatmentNotes: string | null;
  epiPenOnFile: boolean;
  notifyAllStaff: boolean;
}

interface EmergencyContact {
  id: number;
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  phoneSecondary: string | null;
  isAuthorizedForPickup: boolean;
  priority: number;
}

interface Bip {
  id: number;
  targetBehavior: string;
  hypothesizedFunction: string | null;
  replacementBehaviors: string | null;
  preventionStrategies: string | null;
  teachingStrategies: string | null;
  consequenceStrategies: string | null;
  reinforcementSchedule: string | null;
  crisisPlan: string | null;
}

interface Reinforcer {
  id: number;
  name: string;
  category: string;
  notes: string | null;
}

interface ProgramTarget {
  id: number;
  name: string;
  domain: string | null;
  programType: string;
  currentPromptLevel: string | null;
  phase: string;
  tutorInstructions: string | null;
  masteryPercentCriterion: number | null;
}

interface Accommodation {
  id: number;
  category: string;
  description: string;
  frequency: string | null;
  provider: string | null;
}

interface PinnedNote {
  id: number;
  content: string;
  createdAt: string;
  authorId: number | null;
}

interface HandoffData {
  medicalAlerts: MedicalAlert[];
  emergencyContacts: EmergencyContact[];
  activeBips: Bip[];
  reinforcers: Reinforcer[];
  activePrograms: ProgramTarget[];
  accommodations: Accommodation[];
  pinnedNotes: PinnedNote[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  life_threatening: 0,
  severe: 1,
  moderate: 2,
  mild: 3,
};

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    life_threatening: "bg-red-600 text-white",
    severe: "bg-orange-500 text-white",
    moderate: "bg-amber-400 text-black",
    mild: "bg-yellow-200 text-yellow-900",
  };
  const label: Record<string, string> = {
    life_threatening: "LIFE-THREATENING",
    severe: "Severe",
    moderate: "Moderate",
    mild: "Mild",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${map[severity] ?? "bg-gray-100 text-gray-700"}`}>
      {label[severity] ?? severity}
    </span>
  );
}

function alertTypeLabel(t: string) {
  const m: Record<string, string> = {
    allergy: "Allergy",
    medication: "Medication",
    condition: "Medical Condition",
    seizure: "Seizure Protocol",
    other: "Alert",
  };
  return m[t] ?? t;
}

function promptLevelLabel(p: string | null) {
  if (!p) return "—";
  const m: Record<string, string> = {
    full_physical: "Full Physical",
    partial_physical: "Partial Physical",
    model: "Model",
    gestural: "Gestural",
    verbal: "Verbal",
    independent: "Independent",
  };
  return m[p] ?? p;
}

function programTypeLabel(t: string) {
  const m: Record<string, string> = {
    discrete_trial: "DTT",
    task_analysis: "Task Analysis",
    incidental: "Incidental",
    naturalistic: "Naturalistic",
    group: "Group",
  };
  return m[t] ?? t;
}

function functionLabel(f: string | null) {
  if (!f) return null;
  const m: Record<string, string> = {
    escape: "Escape / Avoidance",
    attention: "Attention",
    tangible: "Access to Tangibles",
    sensory: "Sensory / Automatic",
    "sensory/escape": "Sensory / Escape",
    multiple: "Multiple Functions",
  };
  return m[f.toLowerCase()] ?? f;
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${accent} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 ${accent.replace("border-", "bg-").split(" ")[0].replace("bg-", "bg-")} font-semibold text-sm`}>
        {icon}
        {title}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 italic">{text}</p>;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function StudentHandoffCard({ studentId }: { studentId: number }) {
  const [data, setData] = useState<HandoffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!studentId || isNaN(studentId)) return;
    setLoading(true);
    setError(false);
    authFetch(`/api/students/${studentId}/handoff`)
      .then(r => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((d: HandoffData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [studentId]);

  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="mt-4">
        <CardContent className="p-6 text-center text-gray-400">
          Unable to load staff guide. Please refresh and try again.
        </CardContent>
      </Card>
    );
  }

  const {
    medicalAlerts,
    emergencyContacts,
    activeBips,
    reinforcers,
    activePrograms,
    accommodations,
    pinnedNotes,
  } = data;

  const sortedAlerts = [...medicalAlerts].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );

  const lifeThreateningAlerts = sortedAlerts.filter(a => a.severity === "life_threatening" || a.severity === "severe");

  return (
    <div className="space-y-4 mt-2 max-w-3xl">

      {/* ── SAFETY BANNER (life-threatening only) ─────────────────────────── */}
      {lifeThreateningAlerts.length > 0 && (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 flex gap-3">
          <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="font-bold text-red-700 text-sm uppercase tracking-wide">Safety Alert — Read First</p>
            {lifeThreateningAlerts.map(a => (
              <div key={a.id}>
                <p className="font-semibold text-red-800 text-sm">{alertTypeLabel(a.alertType)}: {a.description}</p>
                {a.treatmentNotes && <p className="text-xs text-red-700 mt-0.5">{a.treatmentNotes}</p>}
                {a.epiPenOnFile && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded px-2 py-0.5 mt-1">
                    ⚠ Epi-pen on file
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MEDICAL ALERTS ────────────────────────────────────────────────── */}
      <Section
        icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
        title="Medical Alerts"
        accent="border-orange-200 bg-orange-50"
      >
        {sortedAlerts.length === 0 ? (
          <EmptyNote text="No medical alerts on file." />
        ) : (
          sortedAlerts.map(a => (
            <div key={a.id} className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-800">{alertTypeLabel(a.alertType)}:</span>
                  <span className="text-sm text-gray-700">{a.description}</span>
                  {severityBadge(a.severity)}
                  {a.epiPenOnFile && (
                    <Badge variant="outline" className="text-xs border-red-400 text-red-700">Epi-pen on file</Badge>
                  )}
                </div>
                {a.treatmentNotes && (
                  <p className="text-xs text-gray-500 mt-0.5 pl-0.5">{a.treatmentNotes}</p>
                )}
              </div>
            </div>
          ))
        )}
      </Section>

      {/* ── BIP BEHAVIOR GUIDES ───────────────────────────────────────────── */}
      {activeBips.length === 0 ? (
        <Section
          icon={<Brain className="w-4 h-4 text-amber-700" />}
          title="Behavior Guide"
          accent="border-amber-200 bg-amber-50"
        >
          <EmptyNote text="No active Behavior Intervention Plan on file." />
        </Section>
      ) : (
        activeBips.map((bip, idx) => (
          <Section
            key={bip.id}
            icon={<Brain className="w-4 h-4 text-amber-700" />}
            title={activeBips.length > 1 ? `Behavior Guide (Plan ${idx + 1})` : "Behavior Guide"}
            accent="border-amber-200 bg-amber-50"
          >
            {/* Target behavior */}
            <div>
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-0.5">Target Behavior</p>
              <p className="text-sm text-gray-800">{bip.targetBehavior}</p>
            </div>

            {/* Function */}
            {bip.hypothesizedFunction && (
              <div>
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-0.5">Why It Happens (Function)</p>
                <p className="text-sm text-gray-800">{functionLabel(bip.hypothesizedFunction)}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
              {/* DO: replacement behavior */}
              {bip.replacementBehaviors && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <p className="text-xs font-bold text-green-800 uppercase tracking-wide">DO</p>
                  </div>
                  <p className="text-xs text-green-900">{bip.replacementBehaviors}</p>
                </div>
              )}

              {/* AVOID: prevention / antecedents */}
              {bip.preventionStrategies && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Ban className="w-3.5 h-3.5 text-red-600" />
                    <p className="text-xs font-bold text-red-800 uppercase tracking-wide">AVOID</p>
                  </div>
                  <p className="text-xs text-red-900">{bip.preventionStrategies}</p>
                </div>
              )}

              {/* WHEN IT HAPPENS: consequences */}
              {(bip.consequenceStrategies || bip.teachingStrategies) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">WHEN IT HAPPENS</p>
                  </div>
                  <p className="text-xs text-blue-900">{bip.consequenceStrategies ?? bip.teachingStrategies}</p>
                </div>
              )}
            </div>

            {/* Crisis plan */}
            {bip.crisisPlan && (
              <div className="bg-red-100 border border-red-300 rounded-lg p-3 mt-1">
                <p className="text-xs font-bold text-red-800 uppercase tracking-wide mb-1">Crisis / Escalation Plan</p>
                <p className="text-xs text-red-900">{bip.crisisPlan}</p>
              </div>
            )}

            {/* Reinforcement schedule */}
            {bip.reinforcementSchedule && (
              <div>
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-0.5">Reinforcement Schedule</p>
                <p className="text-sm text-gray-700">{bip.reinforcementSchedule}</p>
              </div>
            )}
          </Section>
        ))
      )}

      {/* ── WHAT WORKS (reinforcers) ─────────────────────────────────────── */}
      <Section
        icon={<Heart className="w-4 h-4 text-emerald-600" />}
        title="What Works — Reinforcers & Preferences"
        accent="border-emerald-200 bg-emerald-50"
      >
        {reinforcers.length === 0 ? (
          <EmptyNote text="No reinforcers logged. Check preference assessment or ask the case manager." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {reinforcers.map(r => (
              <div key={r.id} className="flex flex-col items-start bg-white border border-emerald-200 rounded-lg px-3 py-2 text-sm min-w-[120px]">
                <span className="font-medium text-gray-800">{r.name}</span>
                <span className="text-xs text-emerald-600 capitalize">{r.category}</span>
                {r.notes && <span className="text-xs text-gray-500 mt-0.5">{r.notes}</span>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── ACTIVE ABA PROGRAMS ──────────────────────────────────────────── */}
      <Section
        icon={<Zap className="w-4 h-4 text-blue-600" />}
        title="Active ABA Programs"
        accent="border-blue-200 bg-blue-50"
      >
        {activePrograms.length === 0 ? (
          <EmptyNote text="No active program targets found." />
        ) : (
          <div className="space-y-2">
            {activePrograms.map(p => (
              <div key={p.id} className="flex items-start gap-3 bg-white border border-blue-100 rounded-lg px-3 py-2">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm text-gray-800">{p.name}</span>
                    {p.domain && (
                      <Badge variant="outline" className="text-xs text-blue-700 border-blue-200">{p.domain}</Badge>
                    )}
                    <Badge variant="outline" className="text-xs text-gray-500">{programTypeLabel(p.programType)}</Badge>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                    <span>Prompt: <strong>{promptLevelLabel(p.currentPromptLevel)}</strong></span>
                    <span>Phase: <strong className="capitalize">{p.phase}</strong></span>
                    {p.masteryPercentCriterion != null && (
                      <span>Mastery: <strong>{p.masteryPercentCriterion}%</strong></span>
                    )}
                  </div>
                  {p.tutorInstructions && (
                    <p className="text-xs text-gray-500 mt-1 italic">{p.tutorInstructions}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── IEP ACCOMMODATIONS ──────────────────────────────────────────── */}
      <Section
        icon={<BookOpen className="w-4 h-4 text-violet-600" />}
        title="IEP Accommodations"
        accent="border-violet-200 bg-violet-50"
      >
        {accommodations.length === 0 ? (
          <EmptyNote text="No active accommodations on file." />
        ) : (
          <div className="space-y-1.5">
            {accommodations.map(a => (
              <div key={a.id} className="flex items-start gap-2 text-sm">
                <Badge variant="outline" className="text-xs capitalize shrink-0 mt-0.5 text-violet-700 border-violet-200">
                  {a.category}
                </Badge>
                <span className="text-gray-800">{a.description}</span>
                {a.frequency && <span className="text-gray-400 text-xs shrink-0">({a.frequency})</span>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── PINNED STAFF NOTES ──────────────────────────────────────────── */}
      {pinnedNotes.length > 0 && (
        <Section
          icon={<StickyNote className="w-4 h-4 text-amber-600" />}
          title="Pinned Staff Notes"
          accent="border-amber-200 bg-amber-50"
        >
          {pinnedNotes.map(n => (
            <div key={n.id} className="text-sm text-gray-800 bg-white border border-amber-100 rounded-lg p-3">
              {n.content}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </Section>
      )}

      {/* ── EMERGENCY CONTACTS ──────────────────────────────────────────── */}
      <Section
        icon={<Phone className="w-4 h-4 text-gray-600" />}
        title="Emergency Contacts"
        accent="border-gray-200 bg-gray-50"
      >
        {emergencyContacts.length === 0 ? (
          <EmptyNote text="No emergency contacts on file." />
        ) : (
          <div className="space-y-2">
            {emergencyContacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium text-gray-800">{c.firstName} {c.lastName}</span>
                  <span className="text-gray-400 mx-1">·</span>
                  <span className="text-gray-600 capitalize">{c.relationship}</span>
                  {c.isAuthorizedForPickup && (
                    <Badge variant="outline" className="ml-2 text-xs text-emerald-700 border-emerald-200">Authorized pickup</Badge>
                  )}
                </div>
                <a href={`tel:${c.phone}`} className="font-mono text-blue-700 hover:underline text-sm">
                  {c.phone}
                </a>
                {c.phoneSecondary && (
                  <a href={`tel:${c.phoneSecondary}`} className="font-mono text-blue-600 hover:underline text-xs">
                    {c.phoneSecondary}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

    </div>
  );
}
