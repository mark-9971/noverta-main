/**
 * PilotOnboardingChecklist — nine-step "blank workspace → usable pilot"
 * checklist for district admins. Every item is completion-based and grounded
 * in real database state served by GET /api/onboarding/checklist (the
 * `pilotChecklist` field). See PILOT_CHECKLIST_ITEMS below for the rule set.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Building2, CalendarDays, Users, GraduationCap, ListChecks,
  UserCheck, ClipboardCheck, ShieldCheck, CheckCircle2, Circle,
  ChevronUp, ChevronDown, Rocket, ArrowRight, FileWarning, FileText,
  EyeOff, Eye,
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useChecklistVisibility } from "./useChecklistVisibility";

type ItemKey =
  | "districtProfileConfigured"
  | "schoolYearConfigured"
  | "staffImported"
  | "studentsImported"
  | "serviceRequirementsImported"
  | "providersAssigned"
  | "firstSessionsLogged"
  | "complianceDashboardActive"
  | "dpaAccepted";

interface PilotChecklistResponse {
  pilotChecklist: Record<ItemKey, boolean> & {
    completedCount: number;
    totalSteps: number;
    isComplete: boolean;
  };
  counts: {
    schools: number;
    serviceTypes: number;
    staff: number;
    students: number;
    serviceRequirements: number;
    requirementsWithProvider: number;
    sessions: number;
    schoolYears: number;
  };
  district: { name: string } | null;
  activeSchoolYearLabel: string | null;
  checklistDismissed?: boolean;
}

interface ItemDef {
  key: ItemKey;
  label: string;
  icon: typeof Building2;
  blurb: string;
  actionLabel: string;
  actionHref: string;
  detail: (data: PilotChecklistResponse) => string;
}

export const PILOT_CHECKLIST_ITEMS: ItemDef[] = [
  {
    key: "districtProfileConfigured",
    label: "District profile configured",
    icon: Building2,
    blurb: "Set the district name, schools, and the service types you support.",
    actionLabel: "Open settings",
    actionHref: "/settings",
    detail: d => d.pilotChecklist.districtProfileConfigured
      ? `${d.district?.name ?? "District"} • ${d.counts.schools} school${d.counts.schools === 1 ? "" : "s"} • ${d.counts.serviceTypes} service type${d.counts.serviceTypes === 1 ? "" : "s"}`
      : `${d.counts.schools} school${d.counts.schools === 1 ? "" : "s"}, ${d.counts.serviceTypes} service type${d.counts.serviceTypes === 1 ? "" : "s"} configured so far`,
  },
  {
    key: "schoolYearConfigured",
    label: "School year configured",
    icon: CalendarDays,
    blurb: "Pick the active school year so reports and rollover line up correctly.",
    actionLabel: "Set school year",
    actionHref: "/school-year",
    detail: d => d.activeSchoolYearLabel
      ? `Active: ${d.activeSchoolYearLabel}`
      : "No school year set yet",
  },
  {
    key: "staffImported",
    label: "Staff imported",
    icon: Users,
    blurb: "Import or invite the SPED teachers, related-service providers, and admins who will use Trellis.",
    actionLabel: "Manage staff",
    actionHref: "/staff",
    detail: d => `${d.counts.staff} staff member${d.counts.staff === 1 ? "" : "s"} on file`,
  },
  {
    key: "studentsImported",
    label: "Students imported",
    icon: GraduationCap,
    blurb: "Import the SPED roster from your SIS or upload a CSV.",
    actionLabel: "Import students",
    actionHref: "/import",
    detail: d => `${d.counts.students} active student${d.counts.students === 1 ? "" : "s"}`,
  },
  {
    key: "serviceRequirementsImported",
    label: "Service requirements imported",
    icon: ListChecks,
    blurb: "Capture what each IEP mandates (e.g. 120 min/month of speech).",
    actionLabel: "Add requirements",
    actionHref: "/students",
    detail: d => `${d.counts.serviceRequirements} active requirement${d.counts.serviceRequirements === 1 ? "" : "s"}`,
  },
  {
    key: "providersAssigned",
    label: "Providers assigned",
    icon: UserCheck,
    blurb: "Assign a staff provider to each service requirement so sessions can be logged.",
    actionLabel: "Review assignments",
    actionHref: "/staff",
    detail: d => {
      const total = d.counts.serviceRequirements;
      const assigned = d.counts.requirementsWithProvider;
      if (total === 0) return "Add service requirements first";
      const pct = Math.round((assigned / total) * 100);
      const remaining = total - assigned;
      if (remaining === 0) return `All ${total} requirements have a provider`;
      return `${assigned} of ${total} requirements have a provider (${pct}%) — ${remaining} still unassigned`;
    },
  },
  {
    key: "firstSessionsLogged",
    label: "First sessions logged",
    icon: ClipboardCheck,
    blurb: "Once providers log sessions, delivered minutes start flowing into compliance reports.",
    actionLabel: "Log a session",
    actionHref: "/sessions",
    detail: d => `${d.counts.sessions} session${d.counts.sessions === 1 ? "" : "s"} logged to date`,
  },
  {
    key: "complianceDashboardActive",
    label: "Compliance dashboard active",
    icon: ShieldCheck,
    blurb: "Once students, requirements, and sessions are flowing, the compliance dashboard becomes meaningful.",
    actionLabel: "Open compliance",
    actionHref: "/compliance",
    detail: d => d.pilotChecklist.complianceDashboardActive
      ? "Required vs. delivered minutes are being computed"
      : "Needs students, requirements, and sessions before it can compute",
  },
  {
    key: "dpaAccepted",
    label: "Sign Data Processing Agreement (DPA)",
    icon: FileText,
    blurb: "Review and accept the Data Processing Agreement before going live with student data.",
    actionLabel: "Review & sign",
    actionHref: "/settings#legal",
    detail: d => d.pilotChecklist.dpaAccepted
      ? "DPA accepted — data processing is authorised"
      : "Required before processing student data in a live environment",
  },
];

interface Props {
  /** "compact" hides the panel once the checklist is fully complete (for the
   *  dashboard surface). "full" always renders, even when complete (for the
   *  dedicated /onboarding page). */
  variant?: "compact" | "full";
  /** Default expanded state for the compact variant. */
  defaultExpanded?: boolean;
  /**
   * When true, shows a dismiss/hide button in the header. Defaults to true
   * for the compact variant (dashboard widget) and false for the full variant
   * (dedicated onboarding page). Pass allowDismiss={true} to the full variant
   * when rendering on the dashboard so admins can hide it from there too.
   */
  allowDismiss?: boolean;
}

export default function PilotOnboardingChecklist({
  variant = "compact",
  defaultExpanded = true,
  allowDismiss,
}: Props) {
  const { data, isLoading, isError, error } = useQuery<PilotChecklistResponse, Error & { status?: number }>({
    queryKey: ["onboarding/pilot-checklist"],
    queryFn: async () => {
      const r = await authFetch("/api/onboarding/checklist");
      if (!r.ok) {
        const err = new Error("onboarding/checklist failed") as Error & { status?: number };
        err.status = r.status;
        throw err;
      }
      return r.json();
    },
    staleTime: 30_000,
    retry: (failureCount, err) => {
      const status = (err as Error & { status?: number })?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });
  const [expanded, setExpanded] = useState(defaultExpanded);

  const canDismiss = allowDismiss ?? variant === "compact";
  const {
    isDismissing,
    isShowing,
    dismiss,
    show,
  } = useChecklistVisibility();

  if (isError) {
    const status = (error as Error & { status?: number })?.status;
    const isPermission = status === 401 || status === 403;
    if (variant === "compact") return null;
    return (
      <Card data-testid="card-pilot-checklist-error">
        <CardContent className="p-4 text-sm text-amber-700 flex items-center gap-2">
          <FileWarning className="w-4 h-4" />
          {isPermission
            ? "Setup progress is visible to district admins and coordinators only. Ask an admin to walk through the onboarding checklist."
            : "Could not load setup progress. Refresh the page to try again."}
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    if (variant === "compact") return null;
    return (
      <Card><CardContent className="p-6 text-sm text-gray-400">Loading setup progress…</CardContent></Card>
    );
  }

  const { pilotChecklist, counts } = data;
  const pct = Math.round((pilotChecklist.completedCount / pilotChecklist.totalSteps) * 100);
  const isDismissed = (data.checklistDismissed ?? false) && canDismiss;

  if (variant === "compact" && pilotChecklist.isComplete) return null;

  if (isDismissed) {
    return (
      <div
        className="flex items-center gap-2 text-xs text-gray-400 px-1"
        data-testid="pilot-checklist-dismissed-strip"
      >
        <EyeOff className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Setup checklist is hidden.</span>
        <button
          type="button"
          onClick={() => show()}
          disabled={isShowing}
          className="text-emerald-700 hover:text-emerald-800 font-medium inline-flex items-center gap-1 disabled:opacity-50"
          data-testid="button-pilot-checklist-show"
        >
          <Eye className="w-3 h-3" /> Show it again
        </button>
      </div>
    );
  }

  const allItems = PILOT_CHECKLIST_ITEMS;
  const nextStep = allItems.find(item => !pilotChecklist[item.key]);

  return (
    <Card className="border-emerald-200/60" data-testid="card-pilot-checklist">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => variant === "compact" && setExpanded(e => !e)}
            className={`flex-1 flex items-center justify-between gap-3 ${variant === "compact" ? "cursor-pointer" : "cursor-default"}`}
            data-testid="button-pilot-checklist-toggle"
          >
            <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-emerald-600" />
              District onboarding
              <span className="text-xs font-medium text-gray-400 tabular-nums">
                {pilotChecklist.completedCount}/{pilotChecklist.totalSteps}
              </span>
              {pilotChecklist.isComplete && (
                <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                  Pilot ready
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="w-28 sm:w-40 bg-gray-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                  aria-label={`${pct}% complete`}
                />
              </div>
              <span className="text-xs font-medium text-gray-500 tabular-nums w-9 text-right">{pct}%</span>
              {variant === "compact" && (
                expanded
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </div>
          </button>
          {canDismiss && (
            <button
              type="button"
              onClick={() => dismiss()}
              disabled={isDismissing}
              title="Hide setup checklist"
              className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
              data-testid="button-pilot-checklist-dismiss"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          )}
        </div>
        {!pilotChecklist.isComplete && nextStep && (
          <p className="text-xs text-gray-500 mt-1.5 ml-6">
            Next up: <Link href={nextStep.actionHref} className="text-emerald-700 hover:text-emerald-800 font-medium">{nextStep.label}</Link>
          </p>
        )}
      </CardHeader>
      {(variant === "full" || expanded) && (
        <CardContent className="px-0 pb-2">
          <ul className="divide-y divide-gray-50">
            {allItems.map((item, idx) => {
              const done = pilotChecklist[item.key];
              const Icon = item.icon;
              return (
                <li
                  key={item.key}
                  className="px-4 py-3 hover:bg-gray-50/60 transition-colors"
                  data-testid={`pilot-checklist-item-${item.key}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 mt-0.5">
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" data-testid={`icon-done-${item.key}`} />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" data-testid={`icon-todo-${item.key}`} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-gray-400 tabular-nums font-medium">{idx + 1}.</span>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${done ? "text-gray-300" : "text-gray-400"}`} />
                        <p className={`text-[13px] font-medium ${done ? "text-gray-400 line-through" : "text-gray-900"}`}>
                          {item.label}
                        </p>
                      </div>
                      <p className={`text-[12px] mt-1 ml-7 ${done ? "text-gray-300" : "text-gray-500"}`}>
                        {done ? item.detail(data) : item.blurb}
                      </p>
                      {!done && (
                        <p className="text-[11px] mt-0.5 ml-7 text-gray-400">{item.detail(data)}</p>
                      )}
                    </div>
                    <Link href={item.actionHref} className="flex-shrink-0">
                      <span
                        className={`text-[12px] font-medium inline-flex items-center gap-0.5 whitespace-nowrap ${
                          done ? "text-gray-400 hover:text-gray-600" : "text-emerald-700 hover:text-emerald-800"
                        }`}
                        data-testid={`pilot-checklist-action-${item.key}`}
                      >
                        {done ? "Review" : item.actionLabel} <ArrowRight className="w-3 h-3" />
                      </span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          {pilotChecklist.isComplete && variant === "full" && (
            <div className="px-4 py-3 text-xs text-emerald-700 bg-emerald-50/60 border-t border-emerald-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Your district is pilot-ready. Visit <Link href="/compliance" className="underline font-medium">Compliance</Link> to start tracking service delivery.
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
