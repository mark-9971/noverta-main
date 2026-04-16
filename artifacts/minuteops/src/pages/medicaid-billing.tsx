import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, FileText, CheckCircle, XCircle, Upload, Download,
  AlertTriangle, TrendingUp, Clock, Filter, ChevronDown, Search,
  Plus, Trash2, Edit, Eye, Ban, Pencil, Save, X
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";

type ClaimStatus = "pending" | "approved" | "rejected" | "exported" | "void";

const STATUS_COLORS: Record<ClaimStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  exported: "bg-blue-50 text-blue-700",
  void: "bg-gray-100 text-gray-500",
};

function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; icon: any }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
            active === t.key ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <t.icon className="w-4 h-4" />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ClaimsQueueTab() {
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

  const { data, isLoading, refetch } = useQuery({
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
      toast.success(`Generated ${data.generated} claims (${data.skipped} skipped)`);
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
    if (selectedIds.size === claims.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(claims.map((c: any) => c.id)));
    }
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
            <span className="text-sm font-semibold text-gray-700">Generate Claims</span>
            <Input type="date" value={genDateFrom} onChange={e => setGenDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
            <span className="text-xs text-gray-400">to</span>
            <Input type="date" value={genDateTo} onChange={e => setGenDateTo(e.target.value)} className="w-36 h-8 text-xs" />
            <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              {generateMutation.isPending ? "Generating..." : "Generate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(["pending", "approved", "rejected", "exported", "void", ""] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors ${
                statusFilter === s ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {s || "All"}
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
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status as ClaimStatus] || "bg-gray-100 text-gray-500"}`}>
                        {c.status}
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
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status as ClaimStatus] || "bg-gray-100 text-gray-500"}`}>
                        {c.status}
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

function CptMappingsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    serviceTypeId: "",
    cptCode: "",
    modifier: "",
    description: "",
    minDurationMinutes: "",
    maxDurationMinutes: "",
    unitDurationMinutes: "15",
    ratePerUnit: "",
    placeOfService: "03",
  });

  const { data: mappings, isLoading } = useQuery({
    queryKey: ["cpt-mappings"],
    queryFn: () => authFetch("/api/medicaid/cpt-mappings").then(r => r.ok ? r.json() : []),
    staleTime: 60_000,
  });

  const { data: serviceTypes } = useQuery({
    queryKey: ["service-types-list"],
    queryFn: () => authFetch("/api/service-types").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const url = editId ? `/api/medicaid/cpt-mappings/${editId}` : "/api/medicaid/cpt-mappings";
      const method = editId ? "PUT" : "POST";
      return authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          serviceTypeId: Number(form.serviceTypeId),
          minDurationMinutes: form.minDurationMinutes ? Number(form.minDurationMinutes) : null,
          maxDurationMinutes: form.maxDurationMinutes ? Number(form.maxDurationMinutes) : null,
          unitDurationMinutes: Number(form.unitDurationMinutes),
        }),
      }).then(r => {
        if (!r.ok) throw new Error("Save failed");
        return r.json();
      });
    },
    onSuccess: () => {
      toast.success(editId ? "Mapping updated" : "Mapping created");
      queryClient.invalidateQueries({ queryKey: ["cpt-mappings"] });
      setShowForm(false);
      setEditId(null);
      resetForm();
    },
    onError: () => toast.error("Failed to save mapping"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authFetch(`/api/medicaid/cpt-mappings/${id}`, { method: "DELETE" }).then(r => {
      if (!r.ok) throw new Error("Delete failed");
    }),
    onSuccess: () => {
      toast.success("Mapping deleted");
      queryClient.invalidateQueries({ queryKey: ["cpt-mappings"] });
    },
  });

  const resetForm = () => setForm({ serviceTypeId: "", cptCode: "", modifier: "", description: "", minDurationMinutes: "", maxDurationMinutes: "", unitDurationMinutes: "15", ratePerUnit: "", placeOfService: "03" });

  const startEdit = (m: any) => {
    setForm({
      serviceTypeId: String(m.serviceTypeId),
      cptCode: m.cptCode,
      modifier: m.modifier || "",
      description: m.description || "",
      minDurationMinutes: m.minDurationMinutes ? String(m.minDurationMinutes) : "",
      maxDurationMinutes: m.maxDurationMinutes ? String(m.maxDurationMinutes) : "",
      unitDurationMinutes: String(m.unitDurationMinutes || 15),
      ratePerUnit: m.ratePerUnit,
      placeOfService: m.placeOfService || "03",
    });
    setEditId(m.id);
    setShowForm(true);
  };

  const COMMON_CODES = [
    { code: "92507", desc: "Speech-Language Therapy", rate: "65.00" },
    { code: "97530", desc: "Occupational Therapy", rate: "70.00" },
    { code: "97110", desc: "Physical Therapy", rate: "68.00" },
    { code: "90837", desc: "Psychotherapy (53+ min)", rate: "85.00" },
    { code: "90834", desc: "Psychotherapy (38-52 min)", rate: "75.00" },
    { code: "97153", desc: "ABA — Adaptive Behavior", rate: "55.00" },
    { code: "97155", desc: "ABA — Protocol Modification", rate: "65.00" },
    { code: "97156", desc: "ABA — Family Training", rate: "60.00" },
    { code: "96112", desc: "Developmental Testing", rate: "90.00" },
    { code: "92523", desc: "Speech Evaluation", rate: "120.00" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">CPT Code Mappings</h3>
          <p className="text-xs text-gray-400 mt-0.5">Map service types to CPT/HCPCS codes for Medicaid billing</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setEditId(null); setShowForm(!showForm); }} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
          <Plus className="w-3 h-3 mr-1" /> Add Mapping
        </Button>
      </div>

      {showForm && (
        <Card className="border-emerald-200 bg-emerald-50/20">
          <CardContent className="py-4 px-5 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Service Type</label>
                <select value={form.serviceTypeId} onChange={e => setForm({ ...form, serviceTypeId: e.target.value })} className="w-full h-8 text-xs border rounded-md px-2 bg-white">
                  <option value="">Select...</option>
                  {(serviceTypes ?? []).map((st: any) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">CPT Code</label>
                <select value={form.cptCode} onChange={e => {
                  const found = COMMON_CODES.find(c => c.code === e.target.value);
                  setForm({ ...form, cptCode: e.target.value, description: found?.desc || form.description, ratePerUnit: found?.rate || form.ratePerUnit });
                }} className="w-full h-8 text-xs border rounded-md px-2 bg-white">
                  <option value="">Select or type...</option>
                  {COMMON_CODES.map(c => (
                    <option key={c.code} value={c.code}>{c.code} — {c.desc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Modifier</label>
                <Input value={form.modifier} onChange={e => setForm({ ...form, modifier: e.target.value })} className="h-8 text-xs" placeholder="e.g., 76, HO" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Rate per Unit ($)</label>
                <Input type="number" step="0.01" value={form.ratePerUnit} onChange={e => setForm({ ...form, ratePerUnit: e.target.value })} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Unit Duration (min)</label>
                <Input type="number" value={form.unitDurationMinutes} onChange={e => setForm({ ...form, unitDurationMinutes: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Min Duration</label>
                <Input type="number" value={form.minDurationMinutes} onChange={e => setForm({ ...form, minDurationMinutes: e.target.value })} className="h-8 text-xs" placeholder="Optional" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Max Duration</label>
                <Input type="number" value={form.maxDurationMinutes} onChange={e => setForm({ ...form, maxDurationMinutes: e.target.value })} className="h-8 text-xs" placeholder="Optional" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Place of Service</label>
                <select value={form.placeOfService} onChange={e => setForm({ ...form, placeOfService: e.target.value })} className="w-full h-8 text-xs border rounded-md px-2 bg-white">
                  <option value="03">03 — School</option>
                  <option value="11">11 — Office</option>
                  <option value="12">12 — Home</option>
                  <option value="02">02 — Telehealth</option>
                  <option value="99">99 — Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!form.serviceTypeId || !form.cptCode || !form.ratePerUnit || saveMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditId(null); }} className="h-8 text-xs">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-gray-200/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Service Type</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">CPT Code</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Modifier</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Description</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium text-right">Rate/Unit</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium text-right">Unit (min)</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Duration Range</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">POS</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium">Active</th>
                  <th className="py-2.5 px-3 text-gray-500 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td colSpan={10} className="py-3 px-3"><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                ) : (mappings ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-gray-400 text-sm">No CPT mappings configured yet</td>
                  </tr>
                ) : (mappings ?? []).map((m: any) => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 px-3 font-medium text-gray-800">{m.serviceTypeName}</td>
                    <td className="py-2 px-3 font-mono text-gray-700">{m.cptCode}</td>
                    <td className="py-2 px-3 text-gray-600">{m.modifier || "—"}</td>
                    <td className="py-2 px-3 text-gray-500 truncate max-w-[160px]">{m.description || "—"}</td>
                    <td className="py-2 px-3 text-right font-medium text-gray-800">${parseFloat(m.ratePerUnit).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{m.unitDurationMinutes}</td>
                    <td className="py-2 px-3 text-gray-500">
                      {m.minDurationMinutes || m.maxDurationMinutes
                        ? `${m.minDurationMinutes || "—"}–${m.maxDurationMinutes || "—"} min`
                        : "Any"}
                    </td>
                    <td className="py-2 px-3 text-gray-600">{m.placeOfService}</td>
                    <td className="py-2 px-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.isActive === "true" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {m.isActive === "true" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(m)} className="p-1 text-gray-400 hover:text-emerald-600">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { if (confirm("Delete this mapping?")) deleteMutation.mutate(m.id); }} className="p-1 text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueDashboardTab() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["medicaid-revenue", dateFrom, dateTo],
    queryFn: () => authFetch(`/api/medicaid/revenue-summary?${params}`).then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const summary = data?.summary ?? {};
  const byService = data?.byService ?? [];
  const byMonth = data?.byMonth ?? [];
  const quality = data?.dataQuality ?? {};

  const kpis = [
    { label: "Total Billed", value: `$${parseFloat(summary.totalBilled || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign, accent: "emerald", sub: `${summary.totalClaims || 0} claims` },
    { label: "Pending Review", value: `$${parseFloat(summary.pendingAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: Clock, accent: "amber", sub: `${summary.pendingCount || 0} claims` },
    { label: "Approved / Exported", value: `$${(parseFloat(summary.approvedAmount || "0") + parseFloat(summary.exportedAmount || "0")).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: CheckCircle, accent: "emerald", sub: `${(summary.approvedCount || 0) + (summary.exportedCount || 0)} claims` },
    { label: "Rejected", value: `$${parseFloat(summary.rejectedAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: XCircle, accent: "red", sub: `${summary.rejectedCount || 0} claims` },
  ];

  const accents: Record<string, string> = { emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-500" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
        <span className="text-xs text-gray-400">to</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-xs" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="border-gray-200/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accents[k.accent]}`}>
                  <k.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 font-medium">{k.label}</p>
                  <p className="text-lg font-bold text-gray-900">{isLoading ? "..." : k.value}</p>
                  <p className="text-[10px] text-gray-400">{k.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(quality.missingMedicaidId > 0 || quality.missingNpi > 0) && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-800">Data Quality Issues</span>
            </div>
            <div className="mt-2 flex gap-4 text-[12px]">
              {quality.missingMedicaidId > 0 && (
                <span className="text-amber-700">{quality.missingMedicaidId} students missing Medicaid ID</span>
              )}
              {quality.missingNpi > 0 && (
                <span className="text-amber-700">{quality.missingNpi} providers missing NPI number</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-gray-200/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {byMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byMonth} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${parseFloat(String(v)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, ""]} />
                  <Bar dataKey="totalBilled" name="Total Billed" fill="#10b981" radius={[4, 4, 0, 0]} barSize={28} />
                  <Bar dataKey="approvedAmount" name="Approved" fill="#059669" radius={[4, 4, 0, 0]} barSize={28} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">No billing data yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Revenue by Service Type</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {byService.length > 0 ? byService.map((svc: any) => {
              const total = parseFloat(svc.totalBilled);
              const approved = parseFloat(svc.approvedAmount);
              const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
              return (
                <div key={svc.serviceTypeId} className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[13px] font-medium text-gray-800">{svc.serviceTypeName}</span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-gray-500">{svc.claimCount} claims</span>
                      <span className="font-medium text-gray-700">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm text-gray-400 py-8 text-center">No service data yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExportTab() {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<"csv" | "json">("csv");

  const { data: preview } = useQuery({
    queryKey: ["medicaid-claims", "approved"],
    queryFn: () => authFetch("/api/medicaid/claims?status=approved&limit=1").then(r => r.ok ? r.json() : null),
    staleTime: 30_000,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/medicaid/claims/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Export failed");
      }
      if (format === "csv") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `medicaid-claims-export.csv`;
        a.click();
        URL.revokeObjectURL(url);
        return { claimCount: 0 };
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (format === "json") {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `medicaid-claims-${data.batchId || "export"}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success("Claims exported successfully");
      queryClient.invalidateQueries({ queryKey: ["medicaid-claims"] });
      queryClient.invalidateQueries({ queryKey: ["medicaid-revenue"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approvedCount = preview?.total ?? 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-gray-200/60">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">Export Approved Claims</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <p className="text-[13px] text-gray-500">
            Export all <b className="text-gray-800">{approvedCount} approved</b> claims for upload to your district's Medicaid billing system.
            Exported claims will be marked as "exported" to prevent double-billing.
          </p>

          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-2 block">Export Format</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} className="text-emerald-600" />
                <div>
                  <span className="text-sm font-medium text-gray-700">CSV (837P-style)</span>
                  <p className="text-[10px] text-gray-400">Standard billing CSV for most systems</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={format === "json"} onChange={() => setFormat("json")} className="text-emerald-600" />
                <div>
                  <span className="text-sm font-medium text-gray-700">JSON</span>
                  <p className="text-[10px] text-gray-400">Structured data for API integrations</p>
                </div>
              </label>
            </div>
          </div>

          <Button
            onClick={() => exportMutation.mutate()}
            disabled={approvedCount === 0 || exportMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            {exportMutation.isPending ? "Exporting..." : `Export ${approvedCount} Claims`}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-gray-200/60">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">Export Format Details</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="text-[12px] text-gray-500 space-y-2">
            <p><b className="text-gray-700">CSV columns:</b> ClaimID, PatientMedicaidID, PatientLastName, PatientFirstName, PatientDOB, ProviderNPI, ProviderMedicaidID, ServiceDate, CPTCode, Modifier, PlaceOfService, Units, BilledAmount, DiagnosisCode, ServiceDescription</p>
            <p><b className="text-gray-700">837P compatibility:</b> The CSV format includes all fields needed for standard Medicaid professional claims. Map columns to your billing system's import template.</p>
            <p><b className="text-gray-700">Audit trail:</b> Each export creates a batch ID linking claims to the export event for reconciliation.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MedicaidBillingPage() {
  const [activeTab, setActiveTab] = useState("claims");

  const tabs = [
    { key: "claims", label: "Claims Queue", icon: FileText },
    { key: "mappings", label: "CPT Mappings", icon: Edit },
    { key: "revenue", label: "Revenue Dashboard", icon: TrendingUp },
    { key: "export", label: "Export", icon: Download },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Medicaid Billing</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">
          Generate claims from session logs, review, and export for Medicaid reimbursement
        </p>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "claims" && <ClaimsQueueTab />}
      {activeTab === "mappings" && <CptMappingsTab />}
      {activeTab === "revenue" && <RevenueDashboardTab />}
      {activeTab === "export" && <ExportTab />}
    </div>
  );
}
