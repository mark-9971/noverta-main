import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, Plus, Ban, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { STATUS_COLORS, STATUS_LABELS, STATUS_FILTERS, type ClaimStatus } from "./shared";

export function ClaimsQueueTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [genDateFrom, setGenDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [genDateTo, setGenDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  params.set("limit", "200");

  const { data, isLoading } = useQuery({
    queryKey: ["medicaid-claims", statusFilter, dateFrom, dateTo],
    queryFn: () => authFetch(`/api/medicaid/claims?${params}`).then(r => r.ok ? r.json() : null),
    staleTime: 30_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => authFetch("/api/medicaid/generate-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateFrom: genDateFrom, dateTo: genDateTo }),
    }).then(r => r.json()),
    onSuccess: (data) => {
      const noDx = (data.skippedDetails ?? []).filter((s: any) => s.reason === "no_diagnosis_on_student").length;
      const msg = `Generated ${data.generated} claims (${data.skipped} skipped)`;
      if (data.generated > 0) {
        toast.success(msg);
      } else {
        toast.warning(msg, { description: "No claims were created. Review the skipped sessions below before re-running." });
      }
      if (noDx > 0) {
        toast.error(
          `${noDx} session(s) skipped: student record has no diagnosis. Add the diagnosis to the student before re-running claim generation.`,
          { duration: 8000 }
        );
      }
      queryClient.invalidateQueries({ queryKey: ["medicaid-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medicaid-revenue"] });
    },
    onError: () => toast.error("Failed to generate claims"),
  });

  const batchMutation = useMutation({
    mutationFn: ({ action, rejectionReason }: { action: string; rejectionReason?: string }) =>
      authFetch("/api/medicaid/claims/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimIds: [...selectedIds], action, rejectionReason }),
      }).then(r => r.json()),
    onSuccess: (data) => {
      toast.success(`${data.action}: ${data.updated} claims updated`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["medicaid-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medicaid-revenue"] });
    },
    onError: () => toast.error("Failed to update claims"),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Record<string, string> }) =>
      authFetch(`/api/medicaid/claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).then(r => {
        if (!r.ok) return r.json().then((d: any) => Promise.reject(d));
        return r.json();
      }),
    onSuccess: () => {
      toast.success("Claim updated");
      setEditingId(null);
      setEditForm({});
      queryClient.invalidateQueries({ queryKey: ["medicaid-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medicaid-revenue"] });
    },
    onError: (err: any) => toast.error(err?.error || "Failed to update claim"),
  });

  const startEditing = useCallback((claim: any) => {
    setEditingId(claim.id);
    setEditForm({
      cptCode: claim.cptCode || "",
      modifier: claim.modifier || "",
      units: String(claim.units || ""),
      billedAmount: claim.billedAmount || "",
      placeOfService: claim.placeOfService || "03",
      diagnosisCode: claim.diagnosisCode || "",
      rejectionReason: claim.rejectionReason || "",
    });
  }, []);

  const saveEdit = useCallback(() => {
    if (editingId === null) return;
    editMutation.mutate({ id: editingId, updates: editForm });
  }, [editingId, editForm, editMutation]);

  const claims = data?.claims ?? [];
  const total = data?.total ?? 0;

  const toggleAll = () => {
    if (selectedIds.size === claims.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(claims.map((c: any) => c.id)));
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="space-y-4">
      <Card className="border-gray-200/60">
        <CardContent className="py-4 px-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-700">Generate Claim Drafts</span>
            <Input type="date" value={genDateFrom} onChange={e => setGenDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
            <span className="text-xs text-gray-400">to</span>
            <Input type="date" value={genDateTo} onChange={e => setGenDateTo(e.target.value)} className="w-36 h-8 text-xs" />
            <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              {generateMutation.isPending ? "Generating..." : "Generate Drafts"}
            </Button>
            <span className="text-[11px] text-gray-400 ml-auto">
              Builds local claim drafts only. Filing happens in your Medicaid billing system.
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {STATUS_FILTERS.map(({ value, label, title }) => (
            <button
              key={value}
              title={title}
              onClick={() => { setStatusFilter(value); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors ${
                statusFilter === value ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-32 h-7 text-xs" placeholder="From" />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-32 h-7 text-xs" placeholder="To" />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg">
          <span className="text-xs font-medium text-emerald-700">{selectedIds.size} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => batchMutation.mutate({ action: "approve" })}>
            <CheckCircle className="w-3 h-3 mr-1 text-emerald-600" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
            const reason = prompt("Rejection reason:");
            if (reason) batchMutation.mutate({ action: "reject", rejectionReason: reason });
          }}>
            <XCircle className="w-3 h-3 mr-1 text-red-500" /> Reject
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => batchMutation.mutate({ action: "void" })}>
            <Ban className="w-3 h-3 mr-1 text-gray-500" /> Void
          </Button>
        </div>
      )}

      <Card className="border-gray-200/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="py-2.5 px-3 w-8">
                    <input type="checkbox" checked={claims.length > 0 && selectedIds.size === claims.length} onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Date</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Student</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Provider</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Service</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">CPT</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium text-right">Units</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium text-right">Amount</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Status</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Medicaid ID</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">NPI</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td colSpan={12} className="py-3 px-3"><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                ) : claims.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-gray-400 text-sm">No claims found</td>
                  </tr>
                ) : claims.map((c: any) => editingId === c.id ? (
                  <tr key={c.id} className="border-b border-gray-50 bg-emerald-50/40">
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{c.serviceDate}</td>
                    <td className="py-2 px-3 font-medium text-gray-800 truncate max-w-[140px]">{c.studentName}</td>
                    <td className="py-2 px-3 text-gray-600 truncate max-w-[120px]">{c.staffName}</td>
                    <td className="py-2 px-3 text-gray-600 truncate max-w-[120px]">{c.serviceTypeName}</td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        <Input value={editForm.cptCode} onChange={e => setEditForm(f => ({ ...f, cptCode: e.target.value }))} className="w-16 h-6 text-[11px] font-mono px-1" placeholder="CPT" />
                        <Input value={editForm.modifier} onChange={e => setEditForm(f => ({ ...f, modifier: e.target.value }))} className="w-10 h-6 text-[11px] font-mono px-1" placeholder="Mod" />
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <Input type="number" value={editForm.units} onChange={e => setEditForm(f => ({ ...f, units: e.target.value }))} className="w-14 h-6 text-[11px] text-right px-1" />
                    </td>
                    <td className="py-2 px-3">
                      <Input value={editForm.billedAmount} onChange={e => setEditForm(f => ({ ...f, billedAmount: e.target.value }))} className="w-20 h-6 text-[11px] text-right px-1" placeholder="0.00" />
                    </td>
                    <td className="py-2 px-3">
                      <span title={STATUS_LABELS[c.status as ClaimStatus]?.title} className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status as ClaimStatus] || "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABELS[c.status as ClaimStatus]?.label || c.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-gray-500 text-[11px]">{c.studentMedicaidId || <span className="text-red-400">Missing</span>}</td>
                    <td className="py-2 px-3 font-mono text-gray-500 text-[11px]">{c.providerNpi || <span className="text-red-400">Missing</span>}</td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        <button onClick={saveEdit} disabled={editMutation.isPending} className="p-1 rounded hover:bg-emerald-100 text-emerald-600" title="Save">
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setEditingId(null); setEditForm({}); }} className="p-1 rounded hover:bg-gray-200 text-gray-400" title="Cancel">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 px-3">
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} className="rounded" />
                    </td>
                    <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{c.serviceDate}</td>
                    <td className="py-2 px-3 font-medium text-gray-800 truncate max-w-[140px]">{c.studentName}</td>
                    <td className="py-2 px-3 text-gray-600 truncate max-w-[120px]">{c.staffName}</td>
                    <td className="py-2 px-3 text-gray-600 truncate max-w-[120px]">{c.serviceTypeName}</td>
                    <td className="py-2 px-3 font-mono text-gray-700">{c.cptCode}{c.modifier ? `-${c.modifier}` : ""}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{c.units}</td>
                    <td className="py-2 px-3 text-right font-medium text-gray-800">${parseFloat(c.billedAmount).toFixed(2)}</td>
                    <td className="py-2 px-3">
                      <span title={STATUS_LABELS[c.status as ClaimStatus]?.title} className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status as ClaimStatus] || "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABELS[c.status as ClaimStatus]?.label || c.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-gray-500 text-[11px]">
                      {c.studentMedicaidId || <span className="text-red-400">Missing</span>}
                    </td>
                    <td className="py-2 px-3 font-mono text-gray-500 text-[11px]">
                      {c.providerNpi || <span className="text-red-400">Missing</span>}
                    </td>
                    <td className="py-2 px-3">
                      {(c.status === "pending" || c.status === "rejected") && (
                        <button onClick={() => startEditing(c)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-emerald-600" title="Edit claim">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div className="py-2 px-4 text-[11px] text-gray-400 border-t border-gray-100">
              Showing {claims.length} of {total} claims
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
