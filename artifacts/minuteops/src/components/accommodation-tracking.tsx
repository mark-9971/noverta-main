import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, Clock, ChevronDown, ChevronUp, Printer, Shield, Eye } from "lucide-react";

interface Verification {
  createdAt: string;
  verifierName: string | null;
  status: string;
  notes: string | null;
  staffRole: string | null;
}

interface Accommodation {
  id: number;
  category: string;
  description: string;
  setting: string | null;
  frequency: string | null;
  provider: string | null;
  lastVerification: Verification | null;
  verificationCount: number;
  isOverdue: boolean;
}

interface AccommodationSummary {
  studentId: number;
  studentName: string | null;
  totalAccommodations: number;
  verifiedCount: number;
  overdueCount: number;
  verificationRate: number;
  accommodationsByCategory: Record<string, Accommodation[]>;
}

const STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  partial: "Partially Implemented",
  not_implemented: "Not Implemented",
  not_applicable: "N/A",
};

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  not_implemented: "bg-red-100 text-red-800",
  not_applicable: "bg-gray-100 text-gray-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  instruction: "Instructional",
  assessment: "Assessment / Testing",
  environment: "Environmental",
  materials: "Materials",
  behavioral: "Behavioral",
  communication: "Communication",
  other: "Other",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function AccommodationTracking({ studentId }: { studentId: number }) {
  const { role } = useRole();
  const [data, setData] = useState<AccommodationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [verifyStatus, setVerifyStatus] = useState("verified");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [history, setHistory] = useState<Verification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    authFetch(`/api/students/${studentId}/accommodation-summary`)
      .then((r: Response) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: AccommodationSummary) => setData(d))
      .catch(() => toast.error("Failed to load accommodations"))
      .finally(() => setLoading(false));
  }, [studentId]);

  async function handleVerify(accommodationId: number) {
    setSaving(true);
    try {
      const r = await authFetch(`/api/accommodations/${accommodationId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: verifyStatus,
          notes: verifyNotes || null,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast.success("Accommodation verification recorded");
      setVerifyingId(null);
      setVerifyStatus("verified");
      setVerifyNotes("");
      const refreshRes = await authFetch(`/api/students/${studentId}/accommodation-summary`);
      if (refreshRes.ok) {
        setData(await refreshRes.json());
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to verify");
    }
    setSaving(false);
  }

  async function loadHistory(accommodationId: number) {
    if (historyId === accommodationId) {
      setHistoryId(null);
      return;
    }
    setHistoryId(accommodationId);
    setHistoryLoading(true);
    try {
      const r = await authFetch(`/api/accommodations/${accommodationId}/verifications`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: Verification[] = await r.json();
      setHistory(Array.isArray(d) ? d : []);
    } catch {
      setHistory([]);
    }
    setHistoryLoading(false);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" /> Accommodation Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalAccommodations === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" /> Accommodation Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active accommodations found for this student.</p>
        </CardContent>
      </Card>
    );
  }

  const categories = Object.keys(data.accommodationsByCategory);

  return (
    <Card className={printMode ? "print:shadow-none print:border-0" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-base font-semibold flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setExpanded(!expanded)}
          >
            <Shield className="w-4 h-4 text-emerald-600" />
            Accommodation Tracking
            <span className="text-xs font-normal text-muted-foreground ml-1">
              ({data.totalAccommodations} active)
            </span>
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.verificationRate < 100 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                {data.overdueCount} need verification
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPrintMode(true);
                setTimeout(() => { window.print(); setPrintMode(false); }, 200);
              }}
              className="h-7 px-2 text-xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1" /> Print Card
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 rounded bg-emerald-50">
              <div className="text-lg font-bold text-emerald-700">{data.verifiedCount}</div>
              <div className="text-xs text-emerald-600">Verified</div>
            </div>
            <div className="text-center p-2 rounded bg-amber-50">
              <div className="text-lg font-bold text-amber-700">{data.overdueCount}</div>
              <div className="text-xs text-amber-600">Need Verification</div>
            </div>
            <div className="text-center p-2 rounded bg-gray-50">
              <div className="text-lg font-bold text-gray-700">{data.verificationRate}%</div>
              <div className="text-xs text-gray-600">Compliance Rate</div>
            </div>
          </div>

          {categories.map(cat => (
            <div key={cat}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                {CATEGORY_LABELS[cat] || cat}
              </h4>
              <div className="space-y-2">
                {data.accommodationsByCategory[cat].map(acc => (
                  <div
                    key={acc.id}
                    className={`border rounded-lg p-3 text-sm ${
                      acc.isOverdue ? "border-amber-200 bg-amber-50/50" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{acc.description}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {acc.setting && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{acc.setting}</span>
                          )}
                          {acc.frequency && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">{acc.frequency}</span>
                          )}
                          {acc.provider && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{acc.provider}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {acc.lastVerification ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[acc.lastVerification.status] || "bg-gray-100 text-gray-600"}`}>
                            <CheckCircle className="w-3 h-3 inline mr-0.5" />
                            {timeAgo(acc.lastVerification.createdAt)}
                          </span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                            Unverified
                          </span>
                        )}
                      </div>
                    </div>

                    {acc.lastVerification && (
                      <div className="mt-1.5 text-xs text-gray-500">
                        Last verified by {acc.lastVerification.verifierName || "Unknown"} · {STATUS_LABELS[acc.lastVerification.status] || acc.lastVerification.status}
                        {acc.lastVerification.notes && <span className="italic"> — "{acc.lastVerification.notes}"</span>}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      {verifyingId === acc.id ? (
                        <div className="flex-1 space-y-2 border-t pt-2">
                          <select
                            className="text-xs border rounded px-2 py-1 w-full"
                            value={verifyStatus}
                            onChange={e => setVerifyStatus(e.target.value)}
                          >
                            <option value="verified">Verified — fully implemented</option>
                            <option value="partial">Partially implemented</option>
                            <option value="not_implemented">Not implemented</option>
                            <option value="not_applicable">Not applicable right now</option>
                          </select>
                          <input
                            className="text-xs border rounded px-2 py-1 w-full"
                            placeholder="Optional notes..."
                            value={verifyNotes}
                            onChange={e => setVerifyNotes(e.target.value)}
                            maxLength={2000}
                          />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-6 text-xs" onClick={() => handleVerify(acc.id)} disabled={saving}>
                              {saving ? "Saving..." : "Confirm"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setVerifyingId(null); setVerifyNotes(""); setVerifyStatus("verified"); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs"
                            onClick={() => setVerifyingId(acc.id)}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => loadHistory(acc.id)}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            {historyId === acc.id ? "Hide" : "History"}
                          </Button>
                        </>
                      )}
                    </div>

                    {historyId === acc.id && (
                      <div className="mt-2 border-t pt-2">
                        {historyLoading ? (
                          <p className="text-xs text-gray-400">Loading...</p>
                        ) : history.length === 0 ? (
                          <p className="text-xs text-gray-400">No verification history</p>
                        ) : (
                          <div className="space-y-1">
                            {history.map((v: Verification, i: number) => (
                              <div key={i} className="text-xs text-gray-600 flex items-center gap-2">
                                <span className={`px-1 py-0.5 rounded ${STATUS_COLORS[v.status] || "bg-gray-100"}`}>
                                  {STATUS_LABELS[v.status] || v.status}
                                </span>
                                <span>{v.verifierName || "Unknown"}</span>
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-400">{timeAgo(v.createdAt)}</span>
                                {v.notes && <span className="italic text-gray-400">— {v.notes}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
