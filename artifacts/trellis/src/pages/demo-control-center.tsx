/**
 * Demo Control Center — internal admin console for running smooth Trellis
 * demos.
 *
 * This is the SHELL ONLY (Task #882): a 13-slot grid of numbered placeholder
 * cards plus an in-page demo-district selector. The five downstream cluster
 * tasks fill in the actual panel functionality (readiness, hero cast,
 * before/after, etc.) — see .local/tasks/ for the cluster task list.
 *
 * Strict route guards:
 *   - Non-platform-admins see a 404-style stub. The route is also hidden
 *     from their nav (only platformAdminSection in nav-config.ts links it).
 *   - When the user's active scope is NOT a demo district, the page renders
 *     a 404-style stub instead of the panels. Admins must select a demo
 *     district from the global district picker (or this page's selector,
 *     once a demo scope is active) before the shell will render.
 *
 * Why strict: every cluster task downstream writes data scoped to the
 * targeted district, so a misrouted action could mutate real tenant data.
 * The simplest defense is to refuse to render when the scope isn't a
 * known is_demo=true district.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiGet } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { useActiveDemoDistrict } from "@/components/DemoBanner";
import { useSchoolContext } from "@/lib/school-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Activity, FlaskConical } from "lucide-react";

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

/**
 * A numbered, empty placeholder card. The cluster tasks replace these
 * one-by-one with real panels in the same slot positions, keeping the
 * shell stable while parallel work lands.
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
  const slots = Array.from({ length: TOTAL_PANEL_SLOTS }, (_, i) => i + 1);

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
        {slots.map((n) => <PlaceholderSlot key={n} num={n} />)}
      </div>
    </div>
  );
}
