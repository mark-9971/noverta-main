import { useEffect, useState } from "react";
import { Loader2, Save, Compass } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api";
import { useRole } from "@/lib/role-context";

interface PilotStatusResponse {
  district: { id: number; name: string; isPilot: boolean };
  pilot: {
    startDate: string | null;
    endDate: string | null;
    stage: "kickoff" | "mid_pilot" | "readout" | null;
    accountManagerName: string | null;
    accountManagerEmail: string | null;
  };
}

const STAGE_OPTIONS: { value: "kickoff" | "mid_pilot" | "readout" | ""; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "kickoff", label: "Kickoff" },
  { value: "mid_pilot", label: "Mid-pilot" },
  { value: "readout", label: "Readout" },
];

export default function PilotConfigPage() {
  const { role, isPlatformAdmin } = useRole();
  const allowed = role === "admin" || isPlatformAdmin;

  const [districtId, setDistrictId] = useState<number | null>(null);
  const [districtName, setDistrictName] = useState<string>("");
  const [isPilot, setIsPilot] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [stage, setStage] = useState<"" | "kickoff" | "mid_pilot" | "readout">("");
  const [amName, setAmName] = useState("");
  const [amEmail, setAmEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    apiGet<PilotStatusResponse>("/pilot-status")
      .then((r) => {
        if (cancelled) return;
        setDistrictId(r.district.id);
        setDistrictName(r.district.name);
        setIsPilot(r.district.isPilot);
        setStartDate(r.pilot.startDate ?? "");
        setEndDate(r.pilot.endDate ?? "");
        setStage(r.pilot.stage ?? "");
        setAmName(r.pilot.accountManagerName ?? "");
        setAmEmail(r.pilot.accountManagerEmail ?? "");
        setError(null);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="text-sm text-amber-800">
          Only district administrators and Noverta support staff can edit pilot configuration.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || districtId == null) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
        <p className="text-sm text-rose-800">{error ?? "Failed to load district"}</p>
      </div>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (startDate && endDate && startDate > endDate) {
      toast.error("End date can't be before start date");
      return;
    }
    if (amEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(amEmail.trim())) {
      toast.error("Account manager email is not valid");
      return;
    }
    setSaving(true);
    try {
      await apiPatch(`/districts/${districtId}/pilot-config`, {
        pilotStartDate: startDate || null,
        pilotEndDate: endDate || null,
        pilotStage: stage || null,
        pilotAccountManagerName: amName.trim() || null,
        pilotAccountManagerEmail: amEmail.trim() || null,
      });
      toast.success("Pilot configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Compass className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pilot Configuration</h2>
          <p className="text-sm text-gray-500">
            Set the pilot dates, stage, and account manager for {districtName}. These power
            the Pilot Status page shown to admins and the Noverta team.
          </p>
        </div>
      </div>

      {!isPilot && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          This district is not currently flagged as a pilot. You can still save these
          settings, but the Pilot Status page won't render until a platform admin enables
          the pilot flag.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="pilot-start">Pilot start date</label>
            <input
              id="pilot-start"
              data-testid="input-pilot-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="pilot-end">Scheduled end date</label>
            <input
              id="pilot-end"
              data-testid="input-pilot-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="pilot-stage">Pilot stage</label>
          <select
            id="pilot-stage"
            data-testid="select-pilot-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as typeof stage)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="am-name">Account manager name</label>
            <input
              id="am-name"
              data-testid="input-pilot-am-name"
              type="text"
              value={amName}
              onChange={(e) => setAmName(e.target.value)}
              placeholder="e.g. Riley Chen"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="am-email">Account manager email</label>
            <input
              id="am-email"
              data-testid="input-pilot-am-email"
              type="email"
              value={amEmail}
              onChange={(e) => setAmEmail(e.target.value)}
              placeholder="riley@noverta.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            data-testid="button-save-pilot-config"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium px-4 py-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
