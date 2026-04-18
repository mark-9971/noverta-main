import { useEffect, useState } from "react";
import { Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { authFetch } from "@/lib/auth-fetch";

interface DistrictStatus {
  districtId: number;
  districtName: string;
}

export default function NotificationPreferencesPage() {
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [weeklyEnabled, setWeeklyEnabled] = useState<boolean | null>(null);
  const [digestEnabled, setDigestEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDigest, setSavingDigest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [digestSavedAt, setDigestSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await authFetch("/api/district-data/status");
        if (!statusRes.ok) throw new Error("Failed to load district");
        const status = (await statusRes.json()) as DistrictStatus;
        if (cancelled) return;
        setDistrictId(status.districtId);

        const [prefRes, districtRes] = await Promise.all([
          authFetch(`/api/districts/${status.districtId}/notification-preferences`),
          authFetch(`/api/districts/${status.districtId}`),
        ]);
        if (!prefRes.ok) throw new Error("Failed to load notification preferences");
        const data = (await prefRes.json()) as { weeklyRiskEmailEnabled: boolean };
        if (cancelled) return;
        setWeeklyEnabled(data.weeklyRiskEmailEnabled);
        if (districtRes.ok) {
          const dist = (await districtRes.json()) as { alertDigestMode?: boolean };
          if (!cancelled) setDigestEnabled(dist.alertDigestMode === true);
        } else {
          if (!cancelled) setDigestEnabled(false);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleWeekly(next: boolean) {
    if (districtId === null) return;
    const prev = weeklyEnabled;
    setWeeklyEnabled(next);
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/districts/${districtId}/notification-preferences`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weeklyRiskEmailEnabled: next }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update preference");
      }
      setSavedAt(Date.now());
    } catch (e) {
      setWeeklyEnabled(prev);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDigest(next: boolean) {
    if (districtId === null) return;
    const prev = digestEnabled;
    setDigestEnabled(next);
    setSavingDigest(true);
    setError(null);
    try {
      const res = await authFetch(`/api/districts/${districtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertDigestMode: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update preference");
      }
      setDigestSavedAt(Date.now());
    } catch (e) {
      setDigestEnabled(prev);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingDigest(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-700">Email preferences</h2>
      </div>

      {error && (
        <div
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          data-testid="notif-prefs-error"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">Weekly Risk Exposure Summary</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Sends district administrators a Monday morning email summarizing the past week's
            compliance risk exposure and cost-avoidance trends. Turn off to stop these emails for
            the entire district.
          </p>
          {savedAt !== null && !saving && !error && (
            <p
              className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700"
              data-testid="notif-prefs-saved"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Saved
            </p>
          )}
        </div>
        <div className="flex-shrink-0 pt-0.5">
          <Switch
            checked={weeklyEnabled === true}
            disabled={saving || weeklyEnabled === null}
            onCheckedChange={toggleWeekly}
            data-testid="switch-weekly-risk-email"
            aria-label="Weekly Risk Exposure Summary"
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">Daily digest emails (batch critical risks into one email per day)</p>
          <p className="text-xs text-gray-500 mt-0.5">
            When enabled, critical cost-avoidance risk alerts for assigned students are batched
            into a single daily email per staff member instead of being sent immediately. Individual
            staff can override this default from their profile.
          </p>
          {digestSavedAt !== null && !savingDigest && !error && (
            <p
              className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700"
              data-testid="notif-prefs-digest-saved"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Saved
            </p>
          )}
        </div>
        <div className="flex-shrink-0 pt-0.5">
          <Switch
            checked={digestEnabled === true}
            disabled={savingDigest || digestEnabled === null}
            onCheckedChange={toggleDigest}
            data-testid="switch-district-digest-mode"
            aria-label="Daily digest emails"
          />
        </div>
      </div>
    </div>
  );
}
