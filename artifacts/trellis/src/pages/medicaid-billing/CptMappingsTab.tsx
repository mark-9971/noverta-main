import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Edit, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";

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

const EMPTY_FORM = { serviceTypeId: "", cptCode: "", modifier: "", description: "", minDurationMinutes: "", maxDurationMinutes: "", unitDurationMinutes: "15", ratePerUnit: "", placeOfService: "03" };

export function CptMappingsTab() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const callerDistrictId = Number(user?.publicMetadata?.districtId) || null;
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

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

  const { data: districts } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["districts-list-for-cpt-copy"],
    queryFn: () => authFetch("/api/districts").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
  });
  const [copySourceId, setCopySourceId] = useState("");

  const seedDefaultsMutation = useMutation({
    mutationFn: () => authFetch("/api/medicaid/cpt-mappings/seed-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then(async r => {
      if (!r.ok) throw new Error("Seed failed");
      return r.json() as Promise<{ inserted: number; skippedExisting: number }>;
    }),
    onSuccess: (data) => {
      if (data.inserted > 0) {
        toast.success(`Added ${data.inserted} default CPT mapping${data.inserted === 1 ? "" : "s"}`);
      } else {
        toast.info("No new defaults to add — all matching service types are already mapped");
      }
      queryClient.invalidateQueries({ queryKey: ["cpt-mappings"] });
    },
    onError: () => toast.error("Failed to seed defaults"),
  });

  const copyFromDistrictMutation = useMutation({
    mutationFn: (sourceId: number) => authFetch(`/api/medicaid/cpt-mappings/copy-from/${sourceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then(async r => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Copy failed");
      }
      return r.json() as Promise<{ copied: number; skippedDuplicates: number }>;
    }),
    onSuccess: (data) => {
      toast.success(`Copied ${data.copied} mapping${data.copied === 1 ? "" : "s"}${data.skippedDuplicates ? ` (${data.skippedDuplicates} duplicates skipped)` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["cpt-mappings"] });
      setCopySourceId("");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to copy mappings"),
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
      setForm(EMPTY_FORM);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">CPT Code Mappings</h3>
          <p className="text-xs text-gray-400 mt-0.5">Map service types to CPT/HCPCS codes for Medicaid billing</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm("Seed common Medicaid CPT mappings for this district? Existing mappings will be left untouched.")) {
                seedDefaultsMutation.mutate();
              }
            }}
            disabled={seedDefaultsMutation.isPending}
            className="h-8 text-xs"
            title="Add a starter set of CPT mappings for this district"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            {seedDefaultsMutation.isPending ? "Seeding..." : "Seed defaults"}
          </Button>
          {(() => {
            // Prefer the authenticated user's own district id; fall back to
            // the district id on existing mappings (covers platform admins
            // viewing a specific district whose Clerk metadata may differ).
            const currentDistrictId = callerDistrictId ?? (mappings ?? [])[0]?.districtId;
            const otherDistricts = (districts ?? []).filter(d => d.id !== currentDistrictId);
            if (otherDistricts.length === 0) return null;
            return (
            <div className="flex items-center gap-1">
              <select
                value={copySourceId}
                onChange={e => setCopySourceId(e.target.value)}
                className="h-8 text-xs border rounded-md px-2 bg-white max-w-[180px]"
                aria-label="Copy CPT mappings from district"
              >
                <option value="">Copy from district…</option>
                {otherDistricts.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!copySourceId) return;
                  const name = (districts ?? []).find(d => String(d.id) === copySourceId)?.name ?? "selected district";
                  if (confirm(`Copy CPT mappings from ${name}? Duplicates (same service type + CPT code) will be skipped.`)) {
                    copyFromDistrictMutation.mutate(Number(copySourceId));
                  }
                }}
                disabled={!copySourceId || copyFromDistrictMutation.isPending}
                className="h-8 text-xs"
              >
                <Copy className="w-3 h-3 mr-1" />
                {copyFromDistrictMutation.isPending ? "Copying..." : "Copy"}
              </Button>
            </div>
            );
          })()}
          <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowForm(!showForm); }} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Add Mapping
          </Button>
        </div>
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
