/**
 * Demo Control Center — internal admin console for running smooth Trellis
 * demos.
 *
 * Panels currently filled in:
 *   - Slot 3:  Hero student / problem case generator (HeroCastPanel)
 *   - Slot 12: Environment reset / refresh district (ResetDistrictPanel)
 * Other slots remain numbered placeholders awaiting their cluster tasks.
 *
 * Strict route guards:
 *   - Non-platform-admins see a 404-style stub. The route is also hidden
 *     from their nav (only platformAdminSection in nav-config.ts links it).
 *   - When the user's active scope is NOT a demo district, the page renders
 *     a 404-style stub instead of the panels. Admins must select a demo
 *     district from the global district picker (or this page's selector,
 *     once a demo scope is active) before the shell will render.
 *
 * Why strict: every panel writes data scoped to the targeted demo district,
 * so a misrouted action could mutate real tenant data. The simplest
 * defense is to refuse to render when the scope isn't a known
 * is_demo=true district — and on the backend every endpoint re-verifies
 * is_demo before doing any work.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { useActiveDemoDistrict } from "@/components/DemoBanner";
import { useSchoolContext } from "@/lib/school-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity, FlaskConical, Users, RefreshCw, Sparkles, Loader2,
  AlertTriangle, ExternalLink, RotateCcw,
} from "lucide-react";

interface OverviewResponse {
  demoDistricts: Array<{
    id: number;
    name: string;
    schools: number;
    students: number;
    staff: number;
    openAlerts: number;
  }>;
}

interface HeroCastEntry {
  key: string;
  label: string;
  studentId?: number;
  studentName?: string;
  staffId?: number;
  staffName?: string;
  status: string;
  description: string;
}

interface HeroCastResponse {
  ok: true;
  districtId: number;
  districtName: string;
  action: "ensure" | "refresh";
  cast: HeroCastEntry[];
}

interface ResetResponse {
  ok: true;
  districtId: number;
  districtName: string;
  elapsedMs: number;
  teardown: { studentsRemoved?: number; staffRemoved?: number };
  seed: { studentsCreated?: number; staffCreated?: number };
}

const TOTAL_PANEL_SLOTS = 13;

/**
 * 404-style stub used both for non-admin callers and for admins whose
 * active scope isn't a demo district. Intentionally generic — we don't
 * tell strangers that this admin page exists.
 */
function NotFoundStub() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center" data-testid="demo-control-center-not-found">
      <h1 className="text-xl font-semibold text-gray-900">Not found</h1>
      <p className="text-sm text-gray-500 mt-2">
        The page you requested does not exist.
      </p>
    </div>
  );
}

/** Shared header for filled-in panels: numbered chip + title. */
function PanelHeader({ num, title, icon: Icon }: {
  num: number; title: string; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <CardHeader className="py-3 bg-gray-50 border-b">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] text-gray-700"
          aria-label={`Panel ${num}`}
        >
          {num}
        </span>
        <Icon className="w-4 h-4 text-gray-500" />
        <span>{title}</span>
      </CardTitle>
    </CardHeader>
  );
}

/**
 * A numbered, empty placeholder card. The remaining cluster tasks replace
 * these one-by-one with real panels in the same slot positions.
 */
function PlaceholderSlot({ num }: { num: number }) {
  return (
    <Card data-testid={`demo-control-slot-${num}`}>
      <CardHeader className="py-3 bg-gray-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] text-gray-700"
            aria-label={`Panel slot ${num}`}
          >
            {num}
          </span>
          <span className="text-gray-500">Panel slot {num}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 text-sm text-gray-400">
        Reserved for an upcoming Demo Control Center panel.
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panel 3 — Hero student / problem case generator
// ---------------------------------------------------------------------------
/**
 * One click to generate (or re-pin) the curated 6-archetype demo cast in the
 * active demo district. The backend is idempotent: running "Generate" twice
 * is a no-op and just returns the existing pinned cast. "Re-pin" clears the
 * cast tags and picks fresh archetype students.
 */
function HeroCastPanel({ districtId }: { districtId: number }) {
  const qc = useQueryClient();
  const [data, setData] = useState<HeroCastResponse | null>(null);

  const mutation = useMutation({
    mutationFn: (action: "ensure" | "refresh") =>
      apiPost<HeroCastResponse>("/api/demo-control/hero-cast", { districtId, action }),
    onSuccess: (resp, action) => {
      setData(resp);
      toast.success(action === "refresh"
        ? "Hero cast re-pinned."
        : "Hero cast ready.");
      // Anything that consumes alerts/comp-ed in the rest of the demo will
      // want a refetch.
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["compensatory-services"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to set up hero cast";
      toast.error(msg);
    },
  });

  const cast = data?.cast ?? [];
  const ensureLoading = mutation.isPending && mutation.variables === "ensure";
  const refreshLoading = mutation.isPending && mutation.variables === "refresh";

  return (
    <Card data-testid="demo-control-slot-3" className="md:col-span-2">
      <PanelHeader num={3} title="Hero cast" icon={Sparkles} />
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-gray-500">
          Pins six archetype personas — overloaded case manager, missed-minutes
          student, comp-ed owed, overdue IEP, behavior-heavy, and a healthy
          success story. Idempotent: re-running won't duplicate.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => mutation.mutate("ensure")}
            disabled={mutation.isPending}
            data-testid="button-hero-cast-generate"
            className="gap-1.5"
          >
            {ensureLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate cast
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => mutation.mutate("refresh")}
            disabled={mutation.isPending || cast.length === 0}
            data-testid="button-hero-cast-refresh"
            className="gap-1.5"
          >
            {refreshLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Re-pin
          </Button>
        </div>
        {cast.length > 0 && (
          <ul
            className="divide-y divide-gray-100 border border-gray-100 rounded-md"
            data-testid="hero-cast-list"
          >
            {cast.map((entry) => (
              <li
                key={entry.key}
                className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                data-testid={`hero-cast-entry-${entry.key}`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{entry.label}</div>
                  <div className="text-xs text-gray-500 truncate">{entry.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.studentId != null && (
                    <Link href={`/students/${entry.studentId}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        data-testid={`hero-cast-link-student-${entry.studentId}`}
                      >
                        <Users className="w-3 h-3" />
                        {entry.studentName ?? `Student #${entry.studentId}`}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </Button>
                    </Link>
                  )}
                  {entry.staffId != null && entry.studentId == null && (
                    <Link href={`/staff/${entry.staffId}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        data-testid={`hero-cast-link-staff-${entry.staffId}`}
                      >
                        <Users className="w-3 h-3" />
                        {entry.staffName ?? `Staff #${entry.staffId}`}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </Button>
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {cast.length === 0 && !mutation.isPending && (
          <p className="text-xs text-gray-400 italic">
            No cast loaded yet. Click "Generate cast" to pin the curated personas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panel 12 — Environment reset / refresh district
// ---------------------------------------------------------------------------
/**
 * Wipes the active demo district's sample data and re-seeds it from a clean
 * baseline. Strong type-to-confirm gate so a stray click can't blow away
 * the demo mid-presentation. The backend additionally re-verifies
 * is_demo=true on the targeted district, so even a forged direct API call
 * cannot reset a real tenant.
 */
function ResetDistrictPanel({ districtId, districtName }: {
  districtId: number; districtName: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [lastResult, setLastResult] = useState<ResetResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () => apiPost<ResetResponse>("/api/demo-control/reset-district", { districtId }),
    onSuccess: (resp) => {
      setLastResult(resp);
      setOpen(false);
      setTyped("");
      toast.success(`Reset complete — ${districtName} restored to baseline.`);
      // Nuke every cached query — every list in the app is now stale.
      qc.invalidateQueries();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Reset failed";
      toast.error(msg);
    },
  });

  // Confirmation phrase must match the district name exactly. Case-insensitive
  // and whitespace-tolerant so muscle memory ("metrowest" instead of
  // "MetroWest Collaborative") doesn't trip up a quick reset between demos.
  const confirmReady = typed.trim().toLowerCase() === districtName.trim().toLowerCase();

  return (
    <Card data-testid="demo-control-slot-12" className="md:col-span-2 border-red-200">
      <PanelHeader num={12} title="Environment reset" icon={RefreshCw} />
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-gray-500">
          Wipes <span className="font-medium text-gray-700">{districtName}</span>'s
          sample data and re-seeds the canonical demo baseline. Hard-locked to
          demo districts — cannot touch real tenants.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => { setTyped(""); setOpen(true); }}
            disabled={mutation.isPending}
            data-testid="button-reset-district-open"
            className="gap-1.5"
          >
            {mutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Reset district…
          </Button>
        </div>
        {lastResult && (
          <div
            className="text-xs text-gray-600 border border-gray-100 rounded-md p-2 bg-gray-50"
            data-testid="reset-district-result"
          >
            Last reset: {(lastResult.elapsedMs / 1000).toFixed(1)}s ·
            {" "}{lastResult.seed?.studentsCreated ?? 0} students,
            {" "}{lastResult.seed?.staffCreated ?? 0} staff seeded.
          </div>
        )}
      </CardContent>

      <AlertDialog open={open} onOpenChange={(o) => { if (!mutation.isPending) setOpen(o); }}>
        <AlertDialogContent data-testid="reset-district-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" /> Reset {districtName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This wipes every student, staff, alert, session, and obligation in
              this demo district and re-seeds the canonical baseline.
              {" "}<span className="font-medium">This cannot be undone.</span>
              {" "}Type the district name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 pt-2">
            <Label htmlFor="reset-confirm-input" className="text-xs text-gray-600">
              Type "<span className="font-mono">{districtName}</span>" to enable reset.
            </Label>
            <Input
              id="reset-confirm-input"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={districtName}
              disabled={mutation.isPending}
              data-testid="input-reset-confirm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={mutation.isPending}
              data-testid="button-reset-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); mutation.mutate(); }}
              disabled={!confirmReady || mutation.isPending}
              data-testid="button-reset-confirm"
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
            >
              {mutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Reset now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function DemoControlCenterPage() {
  const { isPlatformAdmin } = useRole();
  const demoDistrict = useActiveDemoDistrict();
  const { setSelectedDistrictId } = useSchoolContext();

  // Overview is informational — it populates the in-page selector with
  // demo districts the admin can switch BETWEEN once at least one is
  // already in scope. NEVER auto-applied: switching scope must be an
  // explicit user action so we don't silently drag a non-demo admin
  // into demo-district scope.
  const { data: overview } = useQuery<OverviewResponse>({
    queryKey: ["demo-control", "overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/demo-control/overview"),
    enabled: isPlatformAdmin && !!demoDistrict,
  });

  // Guard 1: non-admins see a 404 stub. Nav also hides the entry, but
  // anyone hitting the URL directly still gets a stub, not the shell.
  if (!isPlatformAdmin) return <NotFoundStub />;

  // Guard 2: admins whose active scope is non-demo (or unset) see the
  // same 404 stub. They must select a demo district from the global
  // district picker first; this page intentionally does not surface
  // any UI that could nudge them into picking one without an explicit
  // action elsewhere.
  if (!demoDistrict) return <NotFoundStub />;

  const demoOptions = overview?.demoDistricts ?? [];

  // Render slots in order; replace the implemented slots with their real
  // panels and leave the rest as numbered placeholders.
  const renderSlot = (n: number) => {
    // Key filled panels by both slot AND demo district id so switching the
    // active demo district unmounts/remounts them — that drops any local
    // cast / reset-result state from the previous district instead of
    // leaving stale rows visible.
    if (n === 3) return <HeroCastPanel key={`${n}-${demoDistrict.id}`} districtId={demoDistrict.id} />;
    if (n === 12) return (
      <ResetDistrictPanel
        key={`${n}-${demoDistrict.id}`}
        districtId={demoDistrict.id}
        districtName={demoDistrict.name}
      />
    );
    return <PlaceholderSlot key={n} num={n} />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-amber-600" />
            Demo Control Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Internal console for running flawless Trellis demos. All actions are scoped to demo districts only.
            {" "}Targeting <span className="font-medium text-gray-700">{demoDistrict.name}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="demo-district-selector" className="text-xs text-gray-500 whitespace-nowrap">
            Demo district
          </Label>
          <Select
            value={String(demoDistrict.id)}
            onValueChange={(v) => setSelectedDistrictId(Number(v))}
            disabled={demoOptions.length <= 1}
          >
            <SelectTrigger
              id="demo-district-selector"
              data-testid="select-demo-district"
              className="w-[240px] h-8 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {demoOptions.map((d) => (
                <SelectItem
                  key={d.id}
                  value={String(d.id)}
                  data-testid={`option-demo-district-${d.id}`}
                >
                  {d.name}
                </SelectItem>
              ))}
              {/* Fall back to the currently-active demo district if the
                  overview hasn't loaded yet, so the trigger always has
                  a matching option to render. */}
              {demoOptions.length === 0 && (
                <SelectItem value={String(demoDistrict.id)} data-testid={`option-demo-district-${demoDistrict.id}`}>
                  {demoDistrict.name}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Link href="/admin/demo-readiness">
            <Button variant="outline" size="sm" className="gap-2">
              <Activity className="w-3.5 h-3.5" />Open Pre-Flight
            </Button>
          </Link>
        </div>
      </header>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        data-testid="demo-control-grid"
      >
        {Array.from({ length: TOTAL_PANEL_SLOTS }, (_, i) => renderSlot(i + 1))}
      </div>
    </div>
  );
}
