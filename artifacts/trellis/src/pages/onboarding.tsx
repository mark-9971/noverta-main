/**
 * Unified first-run hub. Single canonical entry point a new district admin
 * can be linked to (from PilotAdminHome, the welcome email, the action
 * queue, etc.) that walks them through one coherent path:
 *
 *   1. Try the product with sample data (optional, reversible)
 *   2. Configure the district (8-step checklist + setup wizard)
 *   3. Confirm pilot readiness (audit panel)
 *   4. See first value (open the Compliance Risk Report)
 *   5. Decide what to do next (back to the admin home)
 *
 * The 8-step checklist (PilotOnboardingChecklist) is the single source of
 * truth for setup completion; it polls /api/onboarding/status and is also
 * embedded on PilotAdminHome and DashboardFull so progress is always
 * visible in context. The /setup route is the form behind each checklist
 * row's CTA.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  FlaskConical, ListChecks, ShieldCheck, AlertTriangle,
  ArrowRight, Sparkles, Rocket, Compass, FileSpreadsheet,
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import PilotOnboardingChecklist from "@/components/onboarding/PilotOnboardingChecklist";
import PilotReadinessPanel from "@/components/dashboard/PilotReadinessPanel";

interface SampleStatus {
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
}

interface OnboardingStatusLite {
  pilotChecklist?: { isComplete: boolean; completedCount: number; totalSteps: number };
  isComplete?: boolean;
}

export default function OnboardingPage() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
            <ShieldCheck className="w-3 h-3" /> Admin only
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight mt-2">
            District setup is run by an admin
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            The first-run setup hub configures your district profile, school year, roster import,
            staff invites, and pilot readiness. Only district admins and coordinators can complete
            these steps. If you need something configured here, please ask your district admin.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 mt-4"
          >
            Back to your dashboard <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  }

  const { data: sample } = useQuery<SampleStatus>({
    queryKey: ["sample-data/status"],
    queryFn: async () => {
      const r = await authFetch("/api/sample-data");
      if (!r.ok) throw new Error("sample-data status failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: onboarding } = useQuery<OnboardingStatusLite>({
    queryKey: ["onboarding/status"],
    queryFn: async () => {
      const r = await authFetch("/api/onboarding/status");
      if (!r.ok) throw new Error("onboarding/status failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const pilotReady = onboarding?.pilotChecklist?.isComplete ?? onboarding?.isComplete ?? false;
  const completed = onboarding?.pilotChecklist?.completedCount ?? 0;
  // Default to the canonical 9-step pilot checklist length when the API
  // hasn't responded yet, so the header doesn't briefly show "0/8".
  const total = onboarding?.pilotChecklist?.totalSteps ?? 9;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      {/* Hub header */}
      <header>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
          <Rocket className="w-3 h-3" /> First-run hub
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight mt-2">
          Get your district from a blank workspace to a usable pilot
        </h1>
        <p className="text-sm text-gray-500 mt-1.5">
          One coherent path. Each step below is grounded in real data — items check off
          automatically as the underlying records exist in Trellis.
        </p>
      </header>

      {/* Step 1 — Sample data path */}
      <section className="bg-white border border-gray-200 rounded-xl p-5" data-testid="hub-step-sample-data">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
            <FlaskConical className="w-4 h-4 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-gray-400 tabular-nums">STEP 1</span>
              <h2 className="text-sm font-semibold text-gray-900">Try Trellis with sample data (optional)</h2>
              {sample?.hasSampleData && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100">
                  Loaded · {sample.sampleStudents} students, {sample.sampleStaff} staff
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              If you want to explore the product before importing your own roster, load a
              realistic sample district. You can remove it from the amber banner at the top of
              every page — it's fully reversible.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/setup"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                data-testid="link-sample-data-provision"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {sample?.hasSampleData ? "Manage sample data in setup" : "Load sample data"}
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Pilot kickoff CSV path — fast lane for districts whose SIS sync isn't connected yet */}
      <section
        className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50/70 via-white to-white p-5"
        data-testid="hub-step-pilot-kickoff"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-gray-400 tabular-nums">FAST LANE</span>
              <h2 className="text-sm font-semibold text-gray-900">Start with a CSV import</h2>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                No SIS sync needed
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Most pilots can't get a clean SIS sync running in week one. Walk through four
              CSV uploads — students, staff, services, schedules — and your district will be
              live with real data in under 30 minutes. Imports are tagged so they reconcile
              cleanly with SIS sync later.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/pilot-kickoff"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-2.5 py-1.5"
                data-testid="link-pilot-kickoff-start"
              >
                <Rocket className="w-3.5 h-3.5" /> Open pilot kickoff wizard <ArrowRight className="w-3 h-3" />
              </Link>
              <Link
                href="/setup"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 px-2.5 py-1.5"
                data-testid="link-pilot-kickoff-sis"
              >
                Or set up SIS sync instead <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2 — Setup checklist (canonical 9-step) */}
      <section data-testid="hub-step-checklist">
        <div className="flex items-center gap-2 mb-2 ml-1">
          <span className="text-[10px] font-bold text-gray-400 tabular-nums">STEP 2</span>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-emerald-700" /> Configure your district
          </h2>
          <span className="text-xs text-gray-400">{completed}/{total} done</span>
        </div>
        <p className="text-xs text-gray-500 mb-3 ml-1">
          Each row links to the right setup screen. The 4-step wizard at <span className="font-mono text-gray-600">/setup</span> covers
          district, service types, and staff invites; later rows live in their own pages
          (school year, students, requirements, providers, sessions).
        </p>
        <PilotOnboardingChecklist variant="full" />
      </section>

      {/* Step 3 — Readiness audit */}
      <section data-testid="hub-step-readiness">
        <div className="flex items-center gap-2 mb-2 ml-1">
          <span className="text-[10px] font-bold text-gray-400 tabular-nums">STEP 3</span>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700" /> Confirm pilot readiness
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-3 ml-1">
          A second pass over your configuration that flags blockers and warnings the
          completion checklist alone can't catch (data shape, role coverage, operational gaps).
        </p>
        <PilotReadinessPanel />
      </section>

      {/* Step 4 — First value */}
      <section
        className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-white p-5"
        data-testid="hub-step-first-value"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-700 tabular-nums">STEP 4</span>
              <h2 className="text-sm font-semibold text-gray-900">See first value</h2>
              {!pilotReady && (
                <span className="text-[10px] font-medium text-gray-500">
                  available once students, requirements & sessions exist
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              The Compliance Risk Report shows required vs. delivered minutes, students at
              risk of comp time, and the next best actions — the wedge of Trellis in one place.
            </p>
            <Link
              href="/compliance-risk-report"
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
              data-testid="link-first-value-risk-report"
            >
              Open the Compliance Risk Report <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Step 5 — Next actions */}
      <section className="bg-white border border-gray-200 rounded-xl p-5" data-testid="hub-step-next-actions">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
            <Compass className="w-4 h-4 text-gray-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 tabular-nums">STEP 5</span>
              <h2 className="text-sm font-semibold text-gray-900">Decide what's next</h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Your admin home keeps a live, ranked queue of what to do next based on
              compliance risk, urgent flags, missed sessions, and remaining setup. Head back
              there once you're oriented.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                data-testid="link-back-to-admin-home"
              >
                Go to admin home <ArrowRight className="w-3 h-3" />
              </Link>
              <Link
                href="/weekly-compliance-summary"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                See this week's summary <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
