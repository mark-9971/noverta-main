export const MEETING_TYPES: Record<string, string> = {
  annual_review: "Annual Review",
  initial_iep: "Initial IEP",
  amendment: "IEP Amendment",
  reevaluation: "Reevaluation",
  transition: "Transition Meeting",
  manifestation_determination: "Manifestation Determination",
  eligibility: "Eligibility Determination",
  progress_review: "Progress Review",
  other: "Other",
};

export const MEETING_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  confirmed: { label: "Confirmed", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  in_progress: { label: "In Progress", className: "bg-gray-100 text-gray-700 border-gray-300" },
  completed: { label: "Completed", className: "bg-gray-100 text-gray-600 border-gray-200" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-600 border-red-200" },
  rescheduled: { label: "Rescheduled", className: "bg-gray-50 text-gray-500 border-gray-200" },
};

export const FORMAT_LABELS: Record<string, string> = {
  in_person: "In Person",
  virtual: "Virtual",
  hybrid: "Hybrid",
  phone: "Phone",
};

export const NOTICE_TYPES: Record<string, string> = {
  propose_action: "Proposal to Initiate/Change",
  refuse_action: "Refusal to Initiate/Change",
  initial_evaluation: "Initial Evaluation",
  reevaluation: "Reevaluation",
  placement_change: "Change in Placement",
  services_change: "Change in Services",
  other: "Other",
};

export const CONSENT_TYPES: Record<string, string> = {
  initial_evaluation: "Initial Evaluation",
  reevaluation: "Reevaluation",
  placement: "Placement",
  services: "Services",
  iep_implementation: "IEP Implementation",
  release_records: "Release of Records",
  other: "Other",
};

export const ROLE_LABELS: Record<string, string> = {
  lea_representative: "LEA Rep",
  special_education_teacher: "SPED Teacher",
  general_education_teacher: "Gen Ed Teacher",
  parent_guardian: "Parent/Guardian",
  student: "Student",
  school_psychologist: "Psychologist",
  slp: "SLP",
  ot: "OT",
  pt: "PT",
  bcba: "BCBA",
  counselor: "Counselor",
  interpreter: "Interpreter",
  advocate: "Advocate",
  team_member: "Team Member",
  other: "Other",
};
