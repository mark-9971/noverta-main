import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-fetch";
import { TEAM_ROLES } from "./constants";
import type { StatusColor, StudentOption, StaffOption } from "./types";

export function statusBadge(label: string, color: StatusColor) {
  const styles: Record<StatusColor, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${styles[color]}`}>{label}</span>;
}

export function deadlineBadge(daysUntil: number | null) {
  if (daysUntil === null) return statusBadge("No deadline", "gray");
  if (daysUntil < 0) return statusBadge(`${Math.abs(daysUntil)}d overdue`, "red");
  if (daysUntil <= 7) return statusBadge(`${daysUntil}d left`, "red");
  if (daysUntil <= 14) return statusBadge(`${daysUntil}d left`, "amber");
  return statusBadge(`${daysUntil}d left`, "emerald");
}

export function consentStatusBadge(status: string) {
  if (status === "obtained") return statusBadge("Consent Obtained", "emerald");
  if (status === "refused") return statusBadge("Consent Refused", "red");
  return statusBadge("Consent Pending", "amber");
}

export function referralStatusBadge(status: string) {
  const map: Record<string, [string, StatusColor]> = {
    open: ["Open", "blue"],
    evaluation_in_progress: ["Eval In Progress", "amber"],
    evaluation_complete: ["Eval Complete", "emerald"],
    closed: ["Closed", "gray"],
    withdrawn: ["Withdrawn", "gray"],
  };
  const [label, color] = map[status] ?? ["Unknown", "gray"];
  return statusBadge(label, color);
}

export function evalStatusBadge(status: string) {
  const map: Record<string, [string, StatusColor]> = {
    pending: ["Pending", "gray"],
    in_progress: ["In Progress", "blue"],
    completed: ["Completed", "emerald"],
    overdue: ["Overdue", "red"],
  };
  const [label, color] = map[status] ?? ["Unknown", "gray"];
  return statusBadge(label, color);
}

export async function fetchStudents(): Promise<StudentOption[]> {
  const res = await authFetch("/api/students?limit=500");
  if (!res.ok) return [];
  return res.json();
}

export async function fetchStaff(): Promise<StaffOption[]> {
  const res = await authFetch("/api/staff");
  if (!res.ok) return [];
  return res.json();
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-gray-500 font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}

export function TimelineStep({ step, label, desc }: { step: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step}</div>
      <div>
        <p className="text-[12px] font-semibold text-gray-700">{label}</p>
        <p className="text-[11px] text-gray-500">{desc}</p>
      </div>
    </div>
  );
}

export function MetricCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-50 text-gray-500",
  };
  return (
    <Card>
      <CardContent className="py-3 px-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color] ?? colors.gray}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-gray-800 leading-tight">{value}</p>
            <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TeamMemberPicker({ selected, onChange }: { selected: string[]; onChange: (members: string[]) => void }) {
  const [custom, setCustom] = useState("");

  function addCustom() {
    const trimmed = custom.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
    }
    setCustom("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {TEAM_ROLES.map(role => (
          <button key={role} onClick={() => onChange(selected.includes(role) ? selected.filter(r => r !== role) : [...selected, role])}
            className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${selected.includes(role) ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
            {role}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustom())}
          placeholder="Add custom team member…" className="form-input flex-1" />
        <Button size="sm" variant="outline" className="text-[11px] h-7" onClick={addCustom} disabled={!custom.trim()}>Add</Button>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(m => (
            <span key={m} className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
              {m}
              <button onClick={() => onChange(selected.filter(r => r !== m))} className="text-emerald-400 hover:text-emerald-700">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
