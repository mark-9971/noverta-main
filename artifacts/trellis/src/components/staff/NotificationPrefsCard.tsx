import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type DigestOverride = "inherit" | "on" | "off";

function digestModeToOverride(value: boolean | null | undefined): DigestOverride {
  if (value === true) return "on";
  if (value === false) return "off";
  return "inherit";
}

function overrideToDigestMode(value: DigestOverride): boolean | null {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

export function NotificationPrefsCard({
  staff,
  onSave,
}: {
  staff: any;
  onSave: (s: any) => void;
}) {
  const [receiveAlerts, setReceiveAlerts] = useState<boolean>(staff.receiveRiskAlerts !== false);
  const [digestOverride, setDigestOverride] = useState<DigestOverride>(
    digestModeToOverride(staff.alertDigestMode),
  );
  const [saving, setSaving] = useState(false);
  const [savingDigest, setSavingDigest] = useState(false);
  const [districtDefault, setDistrictDefault] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await authFetch("/api/district-data/status");
        if (!statusRes.ok) return;
        const status = (await statusRes.json()) as { districtId: number };
        const dRes = await authFetch(`/api/districts/${status.districtId}`);
        if (!dRes.ok) return;
        const dist = (await dRes.json()) as { alertDigestMode?: boolean };
        if (!cancelled) setDistrictDefault(dist.alertDigestMode === true);
      } catch {
        // Non-fatal: just don't show the inherited-default hint
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(value: boolean) {
    setReceiveAlerts(value);
    setSaving(true);
    try {
      const res = await authFetch(`/api/staff/${staff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiveRiskAlerts: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      onSave(updated);
      toast.success(value ? "Cost avoidance alert emails enabled" : "Cost avoidance alert emails disabled");
    } catch {
      setReceiveAlerts(!value);
      toast.error("Failed to update notification preference");
    } finally {
      setSaving(false);
    }
  }

  async function handleDigestChange(next: DigestOverride) {
    const prev = digestOverride;
    setDigestOverride(next);
    setSavingDigest(true);
    try {
      const res = await authFetch(`/api/staff/${staff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertDigestMode: overrideToDigestMode(next) }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      onSave(updated);
      toast.success(
        next === "inherit"
          ? "Using district digest default"
          : next === "on"
            ? "Daily digest enabled for this staff member"
            : "Immediate alerts enabled for this staff member",
      );
    } catch {
      setDigestOverride(prev);
      toast.error("Failed to update digest preference");
    } finally {
      setSavingDigest(false);
    }
  }

  const OPTIONS: Array<{ value: DigestOverride; label: string }> = [
    { value: "inherit", label: "Inherit" },
    { value: "on", label: "On" },
    { value: "off", label: "Off" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Bell className="w-4 h-4 text-emerald-600" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-700">Cost avoidance risk email alerts</p>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Receive email notifications when critical cost avoidance risks are detected for assigned students.
            </p>
          </div>
          <Switch
            checked={receiveAlerts}
            onCheckedChange={handleToggle}
            disabled={saving}
            aria-label="Toggle cost avoidance risk email alerts"
          />
        </div>

        <div className="flex items-start justify-between py-1 border-t border-gray-100 pt-3">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-medium text-gray-700">Override district digest mode</p>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Inherit uses the district default
              {districtDefault !== null && (
                <> (currently <span className="font-medium text-gray-600">{districtDefault ? "daily digest" : "immediate"}</span>)</>
              )}
              . On batches critical risk alerts into one email per day. Off sends them immediately.
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Override district digest mode"
            className="inline-flex flex-shrink-0 rounded-md border border-gray-200 bg-gray-50 p-0.5"
            data-testid="staff-digest-override"
          >
            {OPTIONS.map(opt => {
              const active = digestOverride === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={savingDigest}
                  onClick={() => {
                    if (opt.value !== digestOverride) handleDigestChange(opt.value);
                  }}
                  data-testid={`staff-digest-override-${opt.value}`}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    active
                      ? "bg-white text-emerald-700 shadow-sm border border-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                  } ${savingDigest ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
