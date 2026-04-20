/**
 * Panel 5 — Compensatory exposure simulator.
 *
 * Sliders for missed-session rate, recovery speed (minutes/wk delivered &
 * team capacity), staffing strain, and contractor cost. Calls the read-only
 * /demo-control/comp-forecast endpoint for the active demo district and
 * recomputes the exposure trajectory, top drivers, and projected close date
 * on every slider change (debounced).
 *
 * The endpoint never persists scenario state — pure recompute against real DB.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { TrendingDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Props {
  districtId: number;
}

interface ForecastResponse {
  ok: boolean;
  currentMinutesOpen: number;
  obligations: number;
  affectedStudents: number;
  effectiveDelivery: number;
  newExposurePerWeek: number;
  netDrawdown: number;
  capacityHeadroom: number;
  weeksToClose: number | null;
  projectedCloseDate: string | null;
  dollarsAvoidedAtClose: number;
  contractorCostToCloseIn4Weeks: number;
  topDrivers: Array<{ name: string; impact: number; hint: string }>;
  series: Array<{ week: number; minutesRemaining: number }>;
}

interface Sliders {
  minutesPerWeek: number;
  teamCapacity: number;
  missedSessionRate: number;
  staffingStrainPct: number;
  contractorRate: number;
}

const DEFAULTS: Sliders = {
  minutesPerWeek: 600, teamCapacity: 1500, missedSessionRate: 8,
  staffingStrainPct: 10, contractorRate: 95,
};

export default function CompExposurePanel({ districtId }: Props) {
  const [s, setS] = useState<Sliders>(DEFAULTS);
  // Debounce the query input so dragging a slider doesn't fire dozens of req.
  const [debounced, setDebounced] = useState<Sliders>(DEFAULTS);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(s), 200);
    return () => clearTimeout(t);
  }, [s]);

  const qs = new URLSearchParams({
    districtId: String(districtId),
    minutesPerWeek: String(debounced.minutesPerWeek),
    teamCapacity: String(Math.max(debounced.minutesPerWeek, debounced.teamCapacity)),
    missedSessionRate: String(debounced.missedSessionRate),
    staffingStrainPct: String(debounced.staffingStrainPct),
    contractorRate: String(debounced.contractorRate),
  }).toString();

  const { data, isLoading } = useQuery<ForecastResponse>({
    queryKey: ["demo-control", "comp-forecast", districtId, qs],
    queryFn: () => apiGet<ForecastResponse>(`/api/demo-control/comp-forecast?${qs}`),
  });

  return (
    <Card data-testid="demo-control-slot-5">
      <CardHeader className="py-3 bg-amber-50 border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-600 text-white text-[10px]">5</span>
          <TrendingDown className="w-4 h-4 text-amber-600" />
          Compensatory exposure simulator
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2.5">
          <SliderRow
            label="Missed session rate"
            testId="slider-missed-rate"
            value={s.missedSessionRate} min={0} max={50} step={1}
            display={`${s.missedSessionRate}%`}
            onChange={v => setS(p => ({ ...p, missedSessionRate: v }))}
          />
          <SliderRow
            label="Recovery delivery (min/wk)"
            testId="slider-minutes-per-week"
            value={s.minutesPerWeek} min={0} max={5000} step={50}
            display={`${s.minutesPerWeek.toLocaleString()} min`}
            onChange={v => setS(p => ({ ...p, minutesPerWeek: v }))}
          />
          <SliderRow
            label="Staffing strain"
            testId="slider-staffing-strain"
            value={s.staffingStrainPct} min={0} max={60} step={1}
            display={`${s.staffingStrainPct}%`}
            onChange={v => setS(p => ({ ...p, staffingStrainPct: v }))}
          />
          <SliderRow
            label="Contractor rate ($/hr)"
            testId="slider-contractor-rate"
            value={s.contractorRate} min={20} max={300} step={5}
            display={`$${s.contractorRate}/hr`}
            onChange={v => setS(p => ({ ...p, contractorRate: v }))}
          />
        </div>

        <div className="h-32 -mx-1" data-testid="chart-comp-trajectory">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.series ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} label={{ value: "weeks", fontSize: 9, position: "insideBottomRight", offset: -2 }} />
              <YAxis tick={{ fontSize: 10 }} width={38} />
              <Tooltip formatter={(v: number) => `${v.toLocaleString()} min`} labelFormatter={l => `Week ${l}`} />
              <Line type="monotone" dataKey="minutesRemaining" stroke="#d97706" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 border-t">
          <Stat label="Backlog open" value={data ? `${data.currentMinutesOpen.toLocaleString()}m` : "—"} />
          <Stat
            label="Weeks to close"
            value={data?.weeksToClose != null ? String(data.weeksToClose) : (isLoading ? "…" : "∞")}
            warn={data?.weeksToClose == null}
          />
          <Stat label="$ avoided" value={data ? `$${(data.dollarsAvoidedAtClose / 1000).toFixed(0)}k` : "—"} />
        </div>

        {data && (
          <div className="text-xs text-gray-600 space-y-1 pt-1 border-t">
            <div className="font-semibold text-gray-700">Top drivers</div>
            {data.topDrivers.slice(0, 3).map((d) => (
              <div key={d.name} className="flex justify-between">
                <span>{d.name}</span>
                <span className="text-gray-500">{d.impact.toLocaleString()} min/wk · {d.hint}</span>
              </div>
            ))}
            <div className="text-[11px] text-gray-500 pt-1">
              {data.affectedStudents} students affected · contractor close in 4 wks ≈ ${data.contractorCostToCloseIn4Weeks.toLocaleString()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SliderRow({
  label, testId, value, min, max, step, display, onChange,
}: {
  label: string; testId: string;
  value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <Label className="text-gray-600">{label}</Label>
        <span className="text-gray-900 font-medium tabular-nums">{display}</span>
      </div>
      <Slider
        data-testid={testId}
        value={[value]} min={min} max={max} step={step}
        onValueChange={v => onChange(v[0])}
        className="mt-1"
      />
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border rounded p-2 text-center bg-gray-50">
      <div className="text-[9px] uppercase text-gray-500 tracking-wide">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${warn ? "text-red-600" : "text-amber-700"}`}>
        {value}
      </div>
    </div>
  );
}
