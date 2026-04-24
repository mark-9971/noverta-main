import { useEffect, useState } from "react";
import { Bell, CheckCircle2, AlertCircle, ExternalLink, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { authFetch } from "@/lib/auth-fetch";

interface DistrictStatus {
  districtId: number;
  districtName: string;
}

interface NotificationPrefs {
  weeklyRiskEmailEnabled: boolean;
  pilotScorecardEmailEnabled: boolean;
  isPilot: boolean;
}

export default function NotificationPreferencesPage() {
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [weeklyEnabled, setWeeklyEnabled] = useState<boolean | null>(null);
  const [scorecardEnabled, setScorecardEnabled] = useState<boolean | null>(null);
  const [isPilot, setIsPilot] = useState<boolean>(false);
  const [digestEnabled, setDigestEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingScorecard, setSavingScorecard] = useState(false);
  const [savingDigest, setSavingDigest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [scorecardSavedAt, setScorecardSavedAt] = useState<number | null>(null);
  const [digestSavedAt, setDigestSavedAt] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

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
        const data = (await prefRes.json()) as NotificationPrefs;
        if (cancelled) return;
        setWeeklyEnabled(data.weeklyRiskEmailEnabled);
        setScorecardEnabled(data.pilotScorecardEmailEnabled);
        setIsPilot(data.isPilot);
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
    return () => { cancelled = true; };
  }, []);

  async function patchPref(payload: Record<string, boolean>): Promise<void> {
    if (districtId === null) return;
    const res = await authFetch(
      `/api/districts/${districtId}/notification-preferences`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to update preference");
    }
  }

  async function toggleWeekly(next: boolean) {
    const prev = weeklyEnabled;
    setWeeklyEnabled(next); setSaving(true); setError(null);
    try {
      await patchPref({ weeklyRiskEmailEnabled: next });
      setSavedAt(Date.now());
    } catch (e) {
      setWeeklyEnabled(prev);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  async function toggleScorecard(next: boolean) {
    const prev = scorecardEnabled;
    setScorecardEnabled(next); setSavingScorecard(true); setError(null);
    try {
      await patchPref({ pilotScorecardEmailEnabled: next });
      setScorecardSavedAt(Date.now());
    } catch (e) {
      setScorecardEnabled(prev);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSavingScorecard(false); }
  }

  async function toggleDigest(next: boolean) {
    if (districtId === null) return;
    const prev = digestEnabled;
    setDigestEnabled(next); setSavingDigest(true); setError(null);
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
    } finally { setSavingDigest(false); }
  }

  async function sendTestScorecard() {
    if (districtId === null) return;
    setSendingTest(true); setTestResult(null); setError(null);
    try {
      const res = await authFetch(
        `/api/districts/${districtId}/pilot-scorecard-preview/send-test`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send test email");
      if (data.notConfigured) {
        setTestResult(`Email provider not configured. Would have sent to ${data.recipient}.`);
      } else if (data.sent) {
        setTestResult(`Test email sent to ${data.recipient}.`);
      } else {
        setTestResult("Test email did not send.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send test");
    } finally { setSendingTest(false); }
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

      {isPilot && (
        <div
          className="rounded-lg border border-gray-200 bg-white p-4 space-y-4"
          data-testid="card-pilot-scorecard"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">Weekly Pilot Success Scorecard</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Every Monday during your pilot, district administrators receive a "This week on
                Noverta" email summarizing minutes logged, % delivered, missed-session financial
                exposure surfaced, comp-ed minutes flagged, and compliance alerts acted on.
                Each metric links into the matching in-app view.
              </p>
              {scorecardSavedAt !== null && !savingScorecard && !error && (
                <p
                  className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700"
                  data-testid="notif-prefs-scorecard-saved"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                </p>
              )}
            </div>
            <div className="flex-shrink-0 pt-0.5">
              <Switch
                checked={scorecardEnabled === true}
                disabled={savingScorecard || scorecardEnabled === null}
                onCheckedChange={toggleScorecard}
                data-testid="switch-pilot-scorecard"
                aria-label="Weekly Pilot Success Scorecard"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setPreviewOpen(p => !p)}
              data-testid="button-toggle-scorecard-preview"
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {previewOpen ? "Hide preview" : "Preview next scorecard"}
            </button>
            <button
              type="button"
              onClick={sendTestScorecard}
              disabled={sendingTest || districtId === null}
              data-testid="button-send-test-scorecard"
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingTest ? "Sending..." : "Send a test to me"}
            </button>
            {testResult && (
              <span className="text-xs text-gray-600" data-testid="scorecard-test-result">
                {testResult}
              </span>
            )}
          </div>

          {previewOpen && districtId !== null && (
            <div className="border border-gray-200 rounded-md overflow-hidden bg-gray-50">
              <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 bg-gray-100 border-b border-gray-200">
                Preview — what your admins will receive on Monday
              </div>
              <iframe
                title="Pilot Scorecard Preview"
                src={`/api/districts/${districtId}/pilot-scorecard-preview`}
                className="w-full h-[640px] bg-white"
                data-testid="iframe-scorecard-preview"
              />
            </div>
          )}
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
