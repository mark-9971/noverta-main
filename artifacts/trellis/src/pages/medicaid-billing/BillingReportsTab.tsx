import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Download, Clock, AlertTriangle, Users, TrendingUp, Camera, ChevronDown, ChevronUp, ArrowRight, Trash2 } from "lucide-react";
import type { DrillFilter } from "./index";

// ─── CSV export helper ────────────────────────────────────────────────────────

function csvEscape(val: unknown): string {
  const s = String(val ?? "");
  if (/^[=+\-@\t\r]/.test(s)) return `"'${s.replace(/"/g, '""')}"`;
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(header: string, rows: string[][], filename: string) {
  const csv = [header, ...rows.map(r => r.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchAllClaims(params: URLSearchParams): Promise<any[]> {
  const PAGE = 500;
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const p = new URLSearchParams(params);
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    const res = await authFetch(`/api/medicaid/claims?${p}`);
    if (!res.ok) break;
    const json = await res.json();
    const page: any[] = json.claims ?? [];
    all.push(...page);
    if (all.length >= (json.total ?? 0) || page.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ─── Save Snapshot button ─────────────────────────────────────────────────────

// ─── Snapshot types ───────────────────────────────────────────────────────────

interface SnapshotMeta {
  id: number;
  reportType: string;
  label: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  savedByName: string;
  createdAt: string;
}

function SaveSnapshotButton({
  reportType,
  dateFrom,
  dateTo,
  getData,
  activeView,
}: {
  reportType: string;
  dateFrom: string;
  dateTo: string;
  getData: () => unknown;
  activeView?: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"idle" | "prompting" | "saving" | "saved" | "error">("idle");
  const [label, setLabel] = useState("");

  async function handleConfirm() {
    const rawData = getData();
    if (!rawData) return;
    const data = activeView ? { ...(rawData as object), _view: activeView } : rawData;
    setStatus("saving");
    try {
      const res = await authFetch("/api/medicaid/reports/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, dateFrom, dateTo, label: label.trim() || undefined, data }),
      });
      if (!res.ok) throw new Error("Failed to save snapshot");
      setStatus("saved");
      setLabel("");
      queryClient.invalidateQueries({ queryKey: ["medicaid-snapshots"] });
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }

  if (status === "prompting") {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") { setStatus("idle"); setLabel(""); }
          }}
          placeholder="Optional label (e.g. End of Q1 2025)"
          maxLength={120}
          className="h-7 text-xs w-56"
        />
        <Button size="sm" variant="outline" onClick={handleConfirm} className="h-7 text-xs">Save</Button>
        <Button size="sm" variant="ghost" onClick={() => { setStatus("idle"); setLabel(""); }} className="h-7 text-xs">Cancel</Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setStatus("prompting")}
      disabled={status === "saving"}
      className={`h-7 text-xs gap-1 ${status === "saved" ? "border-emerald-400 text-emerald-600" : status === "error" ? "border-red-400 text-red-600" : ""}`}
    >
      <Camera className="w-3 h-3" />
      {status === "saving" ? "Saving…" : status === "saved" ? "Saved!" : status === "error" ? "Error" : "Save snapshot"}
    </Button>
  );
}

// ─── Saved Snapshots Panel ────────────────────────────────────────────────────

const REPORT_LABELS: Record<string, string> = {
  aging: "Claim Aging",
  denials: "Denial Analysis",
  "provider-productivity": "Provider Productivity",
  "revenue-trend": "Revenue Trend",
};

function SavedSnapshotsPanel() {
  const [open, setOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["medicaid-snapshots", filterType],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("reportType", filterType);
      return authFetch(`/api/medicaid/reports/snapshots?${params}`).then(r => r.ok ? r.json() : { snapshots: [] });
    },
    enabled: open,
    staleTime: 30_000,
  });

  const snapshots: SnapshotMeta[] = data?.snapshots ?? [];

  async function handleDownload(snapshot: SnapshotMeta) {
    try {
      const res = await authFetch(`/api/medicaid/reports/snapshots/${snapshot.id}/csv`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${snapshot.reportType}-snapshot-${snapshot.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Snapshot download failed:", err);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await authFetch(`/api/medicaid/reports/snapshots/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      queryClient.invalidateQueries({ queryKey: ["medicaid-snapshots"] });
    } catch (err) {
      console.error("Snapshot delete failed:", err);
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  function formatPeriod(snapshot: SnapshotMeta) {
    if (snapshot.dateFrom && snapshot.dateTo) return `${snapshot.dateFrom} → ${snapshot.dateTo}`;
    if (snapshot.dateFrom) return `From ${snapshot.dateFrom}`;
    if (snapshot.dateTo) return `To ${snapshot.dateTo}`;
    return "All dates";
  }

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-2">
        <button
          className="flex items-center justify-between w-full group"
          onClick={() => setOpen(v => !v)}
        >
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-indigo-400" />
            <CardTitle className="text-sm font-semibold text-gray-700">Saved Snapshots</CardTitle>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-gray-600">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        <p className="text-[11px] text-gray-400 mt-1">Point-in-time captures of report data for historical comparison and sharing.</p>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Filter:</span>
            <div className="flex rounded-md border border-gray-200 text-xs overflow-hidden">
              {(["all", "aging", "denials", "provider-productivity", "revenue-trend"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2 py-1 border-l first:border-l-0 border-gray-200 ${filterType === t ? "bg-gray-100 font-medium text-gray-700" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  {t === "all" ? "All" : REPORT_LABELS[t] ?? t}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No snapshots saved yet. Use the "Save snapshot" button on any report.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 font-medium text-gray-500">Report</th>
                    <th className="text-left pb-2 font-medium text-gray-500">Label</th>
                    <th className="text-left pb-2 font-medium text-gray-500">Period</th>
                    <th className="text-left pb-2 font-medium text-gray-500">Saved by</th>
                    <th className="text-left pb-2 font-medium text-gray-500">Saved on</th>
                    <th className="text-right pb-2 font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2 font-medium text-gray-700">{REPORT_LABELS[s.reportType] ?? s.reportType}</td>
                      <td className="py-2 text-gray-700">
                        {s.label ? s.label : <span className="text-gray-300 italic">—</span>}
                      </td>
                      <td className="py-2 text-gray-500 font-mono text-[11px]">{formatPeriod(s)}</td>
                      <td className="py-2 text-gray-600">{s.savedByName}</td>
                      <td className="py-2 text-gray-500">{formatDate(s.createdAt)}</td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(s)}
                            className="h-6 text-[11px] gap-1"
                          >
                            <Download className="w-3 h-3" /> CSV
                          </Button>
                          {confirmId === s.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(s.id)}
                                disabled={deletingId === s.id}
                                className="h-6 text-[11px] gap-1 border-red-300 text-red-600 hover:bg-red-50"
                              >
                                {deletingId === s.id ? "Deleting…" : "Confirm"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmId(null)}
                                className="h-6 text-[11px]"
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmId(s.id)}
                              title="Delete snapshot"
                              className="h-6 text-[11px] text-gray-500 hover:text-red-600 hover:border-red-200"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Shared date range picker ─────────────────────────────────────────────────

function DateRangePicker({
  dateFrom, dateTo,
  onFrom, onTo,
}: {
  dateFrom: string; dateTo: string;
  onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input type="date" value={dateFrom} onChange={e => onFrom(e.target.value)} className="w-36 h-8 text-xs" />
      <span className="text-xs text-gray-400">to</span>
      <Input type="date" value={dateTo} onChange={e => onTo(e.target.value)} className="w-36 h-8 text-xs" />
    </div>
  );
}

// ─── Claim Aging Report ───────────────────────────────────────────────────────

const BUCKET_LABELS: Record<string, string> = {
  "0-30": "0–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};
const BUCKET_COLORS: Record<string, string> = {
  "0-30": "#10b981",
  "31-60": "#f59e0b",
  "61-90": "#ef4444",
  "90+": "#991b1b",
};
const BUCKET_ORDER = ["0-30", "31-60", "61-90", "90+"];

function AgingReport({ dateFrom, dateTo, onDrillDown }: { dateFrom: string; dateTo: string; onDrillDown: (f: DrillFilter) => void }) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["medicaid-aging", dateFrom, dateTo],
    queryFn: () => authFetch(`/api/medicaid/reports/aging?${params}`).then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const bucketTotals: Record<string, { claimCount: number; totalBilled: string }> = {};
  for (const b of (data?.bucketTotals ?? [])) {
    bucketTotals[b.ageBucket] = b;
  }

  const chartData = BUCKET_ORDER.map(b => ({
    bucket: BUCKET_LABELS[b] ?? b,
    claims: bucketTotals[b]?.claimCount ?? 0,
    billed: parseFloat(bucketTotals[b]?.totalBilled ?? "0"),
  }));

  const rows: Record<string, Record<string, { claimCount: number; totalBilled: string; avgDaysOld: number }>> = {};
  for (const row of (data?.rows ?? [])) {
    if (!rows[row.ageBucket]) rows[row.ageBucket] = {};
    rows[row.ageBucket][row.status] = row;
  }

  function handleExport() {
    const header = "Age Bucket,Status,Claims,Total Billed (est.),Avg Days Old";
    const exportRows: string[][] = [];
    for (const b of BUCKET_ORDER) {
      for (const status of ["pending", "approved", "rejected", "exported"]) {
        const cell = rows[b]?.[status];
        if (cell) {
          exportRows.push([BUCKET_LABELS[b] ?? b, status, String(cell.claimCount), cell.totalBilled, String(cell.avgDaysOld)]);
        }
      }
    }
    downloadCsv(header, exportRows, `claim-aging-${dateFrom}-to-${dateTo}.csv`);
  }

  async function handleExportClaimsWithIds() {
    const p = new URLSearchParams();
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    const allClaims = await fetchAllClaims(p);
    const nonVoid = allClaims.filter((c: any) => c.status !== "void");
    const header = "Claim ID,Age Bucket,Service Date,Student,Student Medicaid ID,Provider,Provider NPI,Service,CPT,Units,Amount,Status";
    const rows: string[][] = nonVoid.map((c: any) => {
      const days = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86_400_000);
      const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
      return [
        String(c.id), BUCKET_LABELS[bucket] ?? bucket, c.serviceDate,
        c.studentName ?? "", c.studentMedicaidId ?? "",
        c.staffName ?? "", c.providerNpi ?? "",
        c.serviceTypeName ?? "", c.cptCode ?? "",
        String(c.units ?? ""), parseFloat(c.billedAmount ?? "0").toFixed(2), c.status,
      ];
    });
    downloadCsv(header, rows, `claim-aging-detail-${dateFrom}-to-${dateTo}.csv`);
  }

  function handleBucketClick(bucket: string) {
    onDrillDown({ ageBucket: bucket, dateFrom, dateTo, label: `Aging: ${BUCKET_LABELS[bucket] ?? bucket}` });
  }

  function handleRowClick(bucket: string, status: string) {
    onDrillDown({ ageBucket: bucket, status, dateFrom, dateTo, label: `Aging: ${BUCKET_LABELS[bucket] ?? bucket} · ${status}` });
  }

  const grandTotal = Object.values(bucketTotals).reduce((s, b) => s + parseFloat(b.totalBilled), 0);
  const totalClaims = Object.values(bucketTotals).reduce((s, b) => s + b.claimCount, 0);

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">Claim Aging</CardTitle>
          </div>
          <div className="flex gap-1.5">
            <SaveSnapshotButton
              reportType="aging"
              dateFrom={dateFrom}
              dateTo={dateTo}
              getData={() => data}
            />
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!data} className="h-7 text-xs gap-1" title="Export aggregate summary">
              <Download className="w-3 h-3" /> Summary CSV
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportClaimsWithIds} disabled={!data} className="h-7 text-xs gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50" title="Export individual claims with Claim IDs">
              <Download className="w-3 h-3" /> Claims with IDs
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Days since claim draft was created, by status. Focuses on non-voided claims. Click any row or bucket to view those claims — or export them with IDs.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : totalClaims === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No claims in this date range</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              {BUCKET_ORDER.map(b => {
                const total = bucketTotals[b];
                return (
                  <button
                    key={b}
                    onClick={() => handleBucketClick(b)}
                    className="rounded-lg border p-3 space-y-1 text-left hover:shadow-sm transition-shadow group"
                    style={{ borderColor: BUCKET_COLORS[b] + "40" }}
                    title={`View claims in ${BUCKET_LABELS[b]} bucket`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium" style={{ color: BUCKET_COLORS[b] }}>{BUCKET_LABELS[b]}</p>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: BUCKET_COLORS[b] }} />
                    </div>
                    <p className="text-xl font-bold text-gray-900">{total?.claimCount ?? 0}</p>
                    <p className="text-[10px] text-gray-500">${parseFloat(total?.totalBilled ?? "0").toLocaleString(undefined, { minimumFractionDigits: 2 })} est.</p>
                  </button>
                );
              })}
            </div>

            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number, name: string) => [name === "billed" ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : v, name === "billed" ? "Estimated Value" : "Claims"]} />
                <Bar dataKey="claims" name="claims" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 font-medium text-gray-500">Bucket</th>
                    <th className="text-left pb-2 font-medium text-gray-500">Status</th>
                    <th className="text-right pb-2 font-medium text-gray-500">Claims</th>
                    <th className="text-right pb-2 font-medium text-gray-500">Est. Value</th>
                    <th className="text-right pb-2 font-medium text-gray-500">Avg Age (days)</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {BUCKET_ORDER.flatMap(b =>
                    ["pending", "approved", "rejected", "exported"].map(status => {
                      const cell = rows[b]?.[status];
                      if (!cell) return null;
                      return (
                        <tr
                          key={`${b}-${status}`}
                          className="border-b border-gray-50 hover:bg-indigo-50/40 cursor-pointer group"
                          onClick={() => handleRowClick(b, status)}
                          title={`View ${cell.claimCount} ${status} claims in ${BUCKET_LABELS[b]} bucket`}
                        >
                          <td className="py-1.5 font-medium" style={{ color: BUCKET_COLORS[b] }}>{BUCKET_LABELS[b]}</td>
                          <td className="py-1.5 text-gray-600 capitalize">{status}</td>
                          <td className="py-1.5 text-right text-gray-800">{cell.claimCount}</td>
                          <td className="py-1.5 text-right text-gray-800">${parseFloat(cell.totalBilled).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="py-1.5 text-right text-gray-500">{cell.avgDaysOld}</td>
                          <td className="py-1.5 text-right">
                            <ArrowRight className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity inline-block" />
                          </td>
                        </tr>
                      );
                    }).filter(Boolean)
                  )}
                  <tr className="border-t border-gray-200 font-semibold">
                    <td colSpan={2} className="py-2 text-gray-700">Total</td>
                    <td className="py-2 text-right text-gray-900">{totalClaims}</td>
                    <td className="py-2 text-right text-gray-900">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Denial / Rejection Analysis ──────────────────────────────────────────────

function DenialsReport({ dateFrom, dateTo, onDrillDown }: { dateFrom: string; dateTo: string; onDrillDown: (f: DrillFilter) => void }) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["medicaid-denials", dateFrom, dateTo],
    queryFn: () => authFetch(`/api/medicaid/reports/denials?${params}`).then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const totals = data?.totals ?? {};
  const byReason: any[] = data?.byReason ?? [];
  const byService: any[] = data?.byService ?? [];
  const denialRate = totals.totalClaims > 0 ? Math.round((totals.rejectedClaims / totals.totalClaims) * 100) : 0;

  function handleExport() {
    const header = "Rejection Reason,Claims,Total Billed (est.)";
    const rows: string[][] = byReason.map((r: any) => [r.reason, String(r.claimCount), r.totalBilled]);
    downloadCsv(header, rows, `denial-analysis-${dateFrom}-to-${dateTo}.csv`);
  }

  function handleReasonClick(reason: string) {
    // "No reason provided" is a display label for null/blank rejection_reason;
    // pass the sentinel so the API can filter with IS NULL / trim = ''
    const apiReason = reason === "No reason provided" ? "__NO_REASON__" : reason;
    onDrillDown({ status: "rejected", rejectionReason: apiReason, dateFrom, dateTo, label: `Denials: ${reason}` });
  }

  function handleAllDenialsClick() {
    onDrillDown({ status: "rejected", dateFrom, dateTo, label: "All Denied Claims" });
  }

  async function handleExportDenialClaimsWithIds() {
    const p = new URLSearchParams({ status: "rejected" });
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    const claims = await fetchAllClaims(p);
    const header = "Claim ID,Service Date,Student,Student Medicaid ID,Provider,Provider NPI,Service,CPT,Units,Amount,Rejection Reason";
    const rows: string[][] = claims.map((c: any) => [
      String(c.id), c.serviceDate, c.studentName ?? "", c.studentMedicaidId ?? "",
      c.staffName ?? "", c.providerNpi ?? "", c.serviceTypeName ?? "",
      c.cptCode ?? "", String(c.units ?? ""),
      parseFloat(c.billedAmount ?? "0").toFixed(2),
      c.rejectionReason ?? "",
    ]);
    downloadCsv(header, rows, `denied-claims-detail-${dateFrom}-to-${dateTo}.csv`);
  }

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">Denial / Rejection Analysis</CardTitle>
          </div>
          <div className="flex gap-1.5">
            <SaveSnapshotButton
              reportType="denials"
              dateFrom={dateFrom}
              dateTo={dateTo}
              getData={() => data}
            />
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!data} className="h-7 text-xs gap-1" title="Export aggregate by reason">
              <Download className="w-3 h-3" /> Summary CSV
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportDenialClaimsWithIds} disabled={!data} className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" title="Export denied claims with Claim IDs">
              <Download className="w-3 h-3" /> Claims with IDs
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Breakdown of internally rejected claims by reason and service type. Click a reason to drill into those claims — or export all denied claims with IDs.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : totals.rejectedClaims === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No rejected claims in this date range</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleAllDenialsClick}
                className="rounded-lg bg-red-50 border border-red-100 p-3 text-left group hover:bg-red-100/60 transition-colors"
                title="View all denied claims"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-red-600 font-medium">Rejection Rate</p>
                  <ArrowRight className="w-3 h-3 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-2xl font-bold text-red-700">{denialRate}%</p>
                <p className="text-[10px] text-red-400">{totals.rejectedClaims} of {totals.totalClaims} claims</p>
              </button>
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 col-span-2">
                <p className="text-[11px] text-gray-500 font-medium">Est. Value Rejected</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${parseFloat(totals.totalRejectedAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-gray-400">Estimated amount in rejected drafts</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">By Reason</p>
                <div className="space-y-2">
                  {byReason.map((r: any, i: number) => {
                    const pct = totals.rejectedClaims > 0 ? Math.round((r.claimCount / totals.rejectedClaims) * 100) : 0;
                    return (
                      <button
                        key={i}
                        className="w-full space-y-1 text-left hover:bg-red-50/60 rounded p-1 -mx-1 group transition-colors"
                        onClick={() => handleReasonClick(r.reason)}
                        title={`View ${r.claimCount} claims denied for: ${r.reason}`}
                      >
                        <div className="flex justify-between items-baseline">
                          <span className="text-[11px] text-gray-700 max-w-[200px] truncate" title={r.reason}>{r.reason}</span>
                          <span className="text-[11px] text-gray-500 shrink-0 ml-2 flex items-center gap-1">
                            {r.claimCount} ({pct}%)
                            <ArrowRight className="w-3 h-3 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-red-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">By Service Type</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left pb-1.5 font-medium text-gray-500">Service</th>
                        <th className="text-right pb-1.5 font-medium text-gray-500">Claims</th>
                        <th className="text-right pb-1.5 font-medium text-gray-500">Est. Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byService.map((s: any, i: number) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1.5 text-gray-700">{s.serviceTypeName ?? "Unknown"}</td>
                          <td className="py-1.5 text-right text-gray-800">{s.claimCount}</td>
                          <td className="py-1.5 text-right text-gray-800">${parseFloat(s.totalBilled).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Provider Productivity ────────────────────────────────────────────────────

function ProviderProductivityReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["medicaid-productivity", dateFrom, dateTo],
    queryFn: () => authFetch(`/api/medicaid/reports/provider-productivity?${params}`).then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const providers: any[] = data?.providers ?? [];

  function handleExport() {
    const header = "Provider,NPI,Total Claims,Approved Claims,Rejected Claims,Pending Claims,Approval Rate (%),Total Billed (est.),Approved Billed (est.),Total Units";
    const rows: string[][] = providers.map((p: any) => [
      p.staffName, p.providerNpi ?? "", String(p.totalClaims), String(p.approvedClaims),
      String(p.rejectedClaims), String(p.pendingClaims), String(p.approvalRate),
      p.totalBilled, p.approvedBilled, String(p.totalUnits),
    ]);
    downloadCsv(header, rows, `provider-productivity-${dateFrom}-to-${dateTo}.csv`);
  }

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">Provider Productivity</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <SaveSnapshotButton
              reportType="provider-productivity"
              dateFrom={dateFrom}
              dateTo={dateTo}
              getData={() => data}
            />
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!data} className="h-7 text-xs gap-1">
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Claims generated, approval rate, and estimated billing value per rendering provider.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No provider data in this date range</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 font-medium text-gray-500">Provider</th>
                  <th className="text-left pb-2 font-medium text-gray-500">NPI</th>
                  <th className="text-right pb-2 font-medium text-gray-500">Claims</th>
                  <th className="text-right pb-2 font-medium text-gray-500">Approved</th>
                  <th className="text-right pb-2 font-medium text-gray-500">Rejected</th>
                  <th className="text-right pb-2 font-medium text-gray-500">Approval Rate</th>
                  <th className="text-right pb-2 font-medium text-gray-500">Est. Billed</th>
                  <th className="text-right pb-2 font-medium text-gray-500">Est. Approved</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p: any) => (
                  <tr key={p.staffId} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 font-medium text-gray-800">{p.staffName}</td>
                    <td className="py-2 text-gray-500 font-mono">{p.providerNpi ?? <span className="text-amber-500">Missing</span>}</td>
                    <td className="py-2 text-right text-gray-700">{p.totalClaims}</td>
                    <td className="py-2 text-right text-emerald-700">{p.approvedClaims}</td>
                    <td className="py-2 text-right text-red-600">{p.rejectedClaims}</td>
                    <td className="py-2 text-right">
                      <span className={`font-semibold ${p.approvalRate >= 80 ? "text-emerald-600" : p.approvalRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                        {p.approvalRate}%
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-800">${parseFloat(p.totalBilled).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 text-right text-emerald-700">${parseFloat(p.approvedBilled).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Revenue Trend ────────────────────────────────────────────────────────────

function RevenueTrendReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [view, setView] = useState<"monthly" | "quarterly">("monthly");

  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["medicaid-trend", dateFrom, dateTo],
    queryFn: () => authFetch(`/api/medicaid/reports/revenue-trend?${params}`).then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const monthly: any[] = data?.monthly ?? [];
  const quarterly: any[] = data?.quarterly ?? [];
  const periods = view === "monthly" ? monthly : quarterly;

  function handleExport() {
    const header = view === "monthly"
      ? "Period,Label,Claims,Total Billed (est.),Approved Billed (est.),Pending Billed,Rejected Billed,Exported Billed,Prev Period Billed,Change %"
      : "Period,Label,Claims,Total Billed (est.),Approved Billed (est.),Rejected Billed,Exported Billed,Prev Period Billed,Change %";
    const rows: string[][] = periods.map((p: any) => view === "monthly"
      ? [p.period, p.label, String(p.totalClaims), p.totalBilled, p.approvedBilled, p.pendingBilled, p.rejectedBilled, p.exportedBilled, p.prevPeriodBilled ?? "", p.changePercent !== null ? String(p.changePercent) : ""]
      : [p.period, p.label, String(p.totalClaims), p.totalBilled, p.approvedBilled, p.rejectedBilled, p.exportedBilled, p.prevPeriodBilled ?? "", p.changePercent !== null ? String(p.changePercent) : ""]
    );
    downloadCsv(header, rows, `revenue-trend-${view}-${dateFrom}-to-${dateTo}.csv`);
  }

  const chartData = periods.map((p: any) => ({
    label: p.label,
    total: parseFloat(p.totalBilled),
    approved: parseFloat(p.approvedBilled),
    rejected: parseFloat(p.rejectedBilled ?? "0"),
  }));

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <CardTitle className="text-sm font-semibold text-gray-700">Revenue Trend</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-200 text-xs overflow-hidden">
              <button
                onClick={() => setView("monthly")}
                className={`px-2.5 py-1 ${view === "monthly" ? "bg-gray-100 font-medium text-gray-700" : "text-gray-500 hover:bg-gray-50"}`}
              >Monthly</button>
              <button
                onClick={() => setView("quarterly")}
                className={`px-2.5 py-1 border-l border-gray-200 ${view === "quarterly" ? "bg-gray-100 font-medium text-gray-700" : "text-gray-500 hover:bg-gray-50"}`}
              >Quarterly</button>
            </div>
            <SaveSnapshotButton
              reportType="revenue-trend"
              dateFrom={dateFrom}
              dateTo={dateTo}
              getData={() => data}
              activeView={view}
            />
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!data} className="h-7 text-xs gap-1">
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Estimated claim value over time with period-over-period comparison. Values are prepared claim drafts, not booked revenue.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : periods.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No data in this date range</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number, name: string) => [`$${parseFloat(String(v)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, name === "total" ? "Total Prepared" : name === "approved" ? "Approved/Exported" : "Rejected"]} />
                <Bar dataKey="total" name="total" fill="#d1fae5" radius={[4, 4, 0, 0]} barSize={22} />
                <Bar dataKey="approved" name="approved" fill="#10b981" radius={[4, 4, 0, 0]} barSize={22} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 font-medium text-gray-500">Period</th>
                    <th className="text-right pb-2 font-medium text-gray-500">Claims</th>
                    <th className="text-right pb-2 font-medium text-gray-500">Total Est.</th>
                    <th className="text-right pb-2 font-medium text-gray-500">Approved Est.</th>
                    <th className="text-right pb-2 font-medium text-gray-500">Rejected Est.</th>
                    <th className="text-right pb-2 font-medium text-gray-500">vs Prior Period</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p: any) => (
                    <tr key={p.period} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2 font-medium text-gray-800">{p.label}</td>
                      <td className="py-2 text-right text-gray-600">{p.totalClaims}</td>
                      <td className="py-2 text-right text-gray-800">${parseFloat(p.totalBilled).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 text-right text-emerald-700">${parseFloat(p.approvedBilled).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 text-right text-red-600">${parseFloat(p.rejectedBilled ?? "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 text-right">
                        {p.changePercent === null ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span className={`font-semibold ${p.changePercent > 0 ? "text-emerald-600" : p.changePercent < 0 ? "text-red-600" : "text-gray-500"}`}>
                            {p.changePercent > 0 ? "+" : ""}{p.changePercent}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Reports Tab ─────────────────────────────────────────────────────────

export function BillingReportsTab({ onDrillDown }: { onDrillDown: (f: DrillFilter) => void }) {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-6">
      <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
        <b>Estimated values, not booked revenue.</b> All dollar figures are calculated from CPT/HCPCS mappings × units on
        prepared claim drafts. Trellis does not file claims and cannot show actual reimbursement.
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500">Date range:</span>
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
        <span className="text-[11px] text-gray-400 ml-2">Click any row or bucket to drill into the individual claims behind those numbers.</span>
      </div>

      <AgingReport dateFrom={dateFrom} dateTo={dateTo} onDrillDown={onDrillDown} />
      <DenialsReport dateFrom={dateFrom} dateTo={dateTo} onDrillDown={onDrillDown} />
      <ProviderProductivityReport dateFrom={dateFrom} dateTo={dateTo} />
      <RevenueTrendReport dateFrom={dateFrom} dateTo={dateTo} />
      <SavedSnapshotsPanel />
    </div>
  );
}
