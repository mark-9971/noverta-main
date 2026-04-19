export const RISK_CONFIG: Record<string, { label: string; color: string; ringColor: string; bg: string }> = {
  on_track: { label: "On Track", color: "text-emerald-700", ringColor: "#10b981", bg: "bg-emerald-50 border-emerald-200" },
  slightly_behind: { label: "Slightly Behind", color: "text-amber-700", ringColor: "#f59e0b", bg: "bg-amber-50 border-amber-200" },
  at_risk: { label: "At Risk", color: "text-orange-700", ringColor: "#f97316", bg: "bg-orange-50 border-orange-200" },
  out_of_compliance: { label: "Out of Compliance", color: "text-red-700", ringColor: "#ef4444", bg: "bg-red-50 border-red-200" },
  completed: { label: "Completed", color: "text-emerald-800", ringColor: "#065f46", bg: "bg-emerald-50 border-emerald-200" },
  no_data: { label: "Not Started", color: "text-gray-600", ringColor: "#9ca3af", bg: "bg-gray-50 border-gray-200" },
};

export const RISK_PRIORITY_ORDER = ["out_of_compliance", "at_risk", "slightly_behind", "no_data", "on_track", "completed"];

export const ROLE_COLORS: Record<string, string> = {
  bcba: "bg-emerald-100 text-emerald-800",
  slp: "bg-sky-100 text-sky-700",
  ot: "bg-emerald-100 text-emerald-700",
  pt: "bg-teal-100 text-teal-700",
  counselor: "bg-violet-100 text-violet-700",
  psychologist: "bg-pink-100 text-pink-700",
  teacher: "bg-amber-100 text-amber-700",
  para: "bg-orange-100 text-orange-700",
  case_manager: "bg-blue-100 text-blue-700",
};

export const ROLE_LABELS: Record<string, string> = {
  bcba: "BCBA",
  slp: "SLP",
  ot: "OT",
  pt: "PT",
  counselor: "Counselor",
  psychologist: "Psychologist",
  teacher: "Teacher",
  para: "Paraeducator",
  direct_provider: "Direct Provider",
  case_manager: "Case Manager",
};
