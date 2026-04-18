import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  Save,
  Info,
  CheckCircle2,
  AlertCircle,
  Pencil,
  X,
  Trash2,
  Upload,
  FileText,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

interface ServiceType {
  id: number;
  name: string;
  category: string;
  defaultBillingRate: string | null;
  cptCode: string | null;
}

interface RateConfig {
  id: number;
  serviceTypeId: number;
  inHouseRate: string | null;
  contractedRate: string | null;
  effectiveDate: string;
  notes: string | null;
  serviceTypeName: string;
}

interface RatesResponse {
  configs: RateConfig[];
  serviceTypes: Pick<ServiceType, "id" | "name" | "defaultBillingRate">[];
}

const CATEGORY_LABELS: Record<string, string> = {
  aba: "Applied Behavior Analysis",
  speech: "Speech-Language",
  ot: "Occupational Therapy",
  pt: "Physical Therapy",
  counseling: "Counseling",
  para_support: "Paraprofessional Support",
  other: "Other",
};

const SYSTEM_DEFAULT_RATE = 75;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseRate(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** CSV row splitter that handles quoted fields containing commas and escaped quotes (doubled-quote style). Does not support quoted fields spanning multiple lines. */
function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ",") { fields.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current.trim());
  return fields;
}

interface CsvRow {
  rawLabel: string;
  cptCode: string | null;
  rate: number;
}

function parseCsv(text: string): { rows: CsvRow[]; error?: string } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], error: "CSV must have at least a header row and one data row." };

  const rawHeaders = splitCsvRow(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  const nameIdx = headers.findIndex(h => ["name", "servicetype", "service", "servicetypename", "description", "label"].includes(h));
  const cptIdx = headers.findIndex(h => ["cptcode", "cpt", "procedurecode", "code"].includes(h));
  const rateIdx = headers.findIndex(h => ["rate", "billingrate", "amount", "fee", "price", "unitrate", "hourlyrate"].includes(h));

  if (rateIdx === -1) {
    return { rows: [], error: "Could not find a rate column. Expected a column named: rate, billing_rate, amount, fee, or price." };
  }
  if (nameIdx === -1 && cptIdx === -1) {
    return { rows: [], error: "Could not find a service type column. Expected: name, service_type, cpt_code, or similar." };
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitCsvRow(line);
    const rawName = nameIdx !== -1 ? (cells[nameIdx] ?? "").trim() : "";
    const rawCpt = cptIdx !== -1 ? (cells[cptIdx] ?? "").trim() : "";
    const rawRate = (cells[rateIdx] ?? "").trim();

    const rate = parseRate(rawRate);
    if (!rate) continue;

    rows.push({
      rawLabel: rawName || rawCpt || `Row ${i}`,
      cptCode: rawCpt || null,
      rate,
    });
  }
  return { rows };
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

interface MatchResult {
  csvRow: CsvRow;
  matchedServiceType: ServiceType | null;
  suggestions: ServiceType[];
  assignedServiceTypeId: number | null;
}

function computeMatches(csvRows: CsvRow[], serviceTypes: ServiceType[]): MatchResult[] {
  const byNameLower = new Map<string, ServiceType>();
  const byCpt = new Map<string, ServiceType>();
  for (const st of serviceTypes) {
    byNameLower.set(st.name.toLowerCase(), st);
    if (st.cptCode) byCpt.set(st.cptCode.toLowerCase(), st);
  }

  return csvRows.map(row => {
    const labelLower = row.rawLabel.toLowerCase();
    const cptLower = row.cptCode?.toLowerCase() ?? "";

    let matched: ServiceType | null = null;
    if (cptLower && byCpt.has(cptLower)) {
      matched = byCpt.get(cptLower)!;
    } else if (byNameLower.has(labelLower)) {
      matched = byNameLower.get(labelLower)!;
    }

    let suggestions: ServiceType[] = [];
    if (!matched) {
      suggestions = serviceTypes.filter(st => {
        const sn = st.name.toLowerCase();
        return sn.includes(labelLower) || labelLower.includes(sn) ||
          (cptLower && st.cptCode?.toLowerCase().includes(cptLower));
      }).slice(0, 5);
    }

    return {
      csvRow: row,
      matchedServiceType: matched,
      suggestions,
      assignedServiceTypeId: matched?.id ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// ImportDialog component
// ---------------------------------------------------------------------------

function ImportDialog({
  serviceTypes,
  onClose,
  onImported,
}: {
  serviceTypes: ServiceType[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: async (rows: { serviceTypeId: number; inHouseRate: number }[]) => {
      const res = await authFetch("/api/compensatory-finance/rates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, effectiveDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Import failed");
      }
      return res.json() as Promise<{ imported: number }>;
    },
    onSuccess: (data) => {
      toast.success(`${data.imported} rate${data.imported !== 1 ? "s" : ""} imported successfully`);
      onImported();
      onClose();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Import failed");
    },
  });

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows, error } = parseCsv(text);
      if (error) {
        setParseError(error);
        return;
      }
      if (rows.length === 0) {
        setParseError("No valid rows found in the CSV. Check that the rate column has positive numbers.");
        return;
      }
      const results = computeMatches(rows, serviceTypes);
      setMatches(results);
      setStep("review");
    };
    reader.readAsText(file);
  }, [serviceTypes]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) handleFile(file);
    else setParseError("Please upload a .csv file.");
  }, [handleFile]);

  const handleAssign = (idx: number, serviceTypeId: number | null) => {
    setMatches(prev => prev.map((m, i) => i === idx ? { ...m, assignedServiceTypeId: serviceTypeId } : m));
  };

  const toApply = matches.filter(m => m.assignedServiceTypeId != null);
  const unmatched = matches.filter(m => m.assignedServiceTypeId == null && m.matchedServiceType == null);
  const seenIds = new Set<number>();
  const duplicatedInApply = toApply.filter(m => {
    const dup = seenIds.has(m.assignedServiceTypeId!);
    seenIds.add(m.assignedServiceTypeId!);
    return dup;
  }).length;
  const uniqueToApplyCount = toApply.length - duplicatedInApply;

  const handleApply = () => {
    const rows = toApply.map(m => ({
      serviceTypeId: m.assignedServiceTypeId!,
      inHouseRate: m.csvRow.rate,
    }));
    importMutation.mutate(rows);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-gray-900">Import Billing Rates from CSV</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === "upload" && (
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-800 space-y-1">
                <p className="font-medium">Accepted CSV format</p>
                <p>Columns: <code className="bg-blue-100 px-1 rounded">service_type</code> or <code className="bg-blue-100 px-1 rounded">cpt_code</code> (or both), plus a <code className="bg-blue-100 px-1 rounded">rate</code> column (also accepts: billing_rate, amount, fee).</p>
                <p>Example: <code className="bg-blue-100 px-1 rounded">service_type,cpt_code,rate</code></p>
              </div>

              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
              >
                <Upload className="w-8 h-8 text-gray-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Drop a CSV file here</p>
                  <p className="text-xs text-gray-400 mt-0.5">or click to browse</p>
                </div>
                {fileName && <p className="text-xs text-emerald-700 font-medium">{fileName}</p>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />

              {parseError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {parseError}
                </div>
              )}
            </div>
          )}

          {step === "review" && (
            <div className="p-5 space-y-4">
              {/* Effective date + dedup note */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 flex-shrink-0">Effective date</label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={e => setEffectiveDate(e.target.value)}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                {duplicatedInApply > 0 && (
                  <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                    {duplicatedInApply} duplicate service type{duplicatedInApply !== 1 ? "s" : ""} — last rate value kept
                  </p>
                )}
              </div>
              {/* Summary banner */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-lg font-bold text-emerald-700">{toApply.length}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">Ready to apply</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="text-lg font-bold text-amber-700">{unmatched.length}</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">Unmatched</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                  <p className="text-lg font-bold text-gray-500">{matches.length}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Total rows</p>
                </div>
              </div>

              {/* Matched rows */}
              {matches.filter(m => m.assignedServiceTypeId != null).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Matched — will be applied</p>
                  <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                    {matches.map((m, idx) => {
                      if (m.assignedServiceTypeId == null) return null;
                      const st = serviceTypes.find(s => s.id === m.assignedServiceTypeId);
                      return (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">{m.csvRow.rawLabel}</p>
                            {m.matchedServiceType?.id !== m.assignedServiceTypeId && (
                              <p className="text-[10px] text-blue-500">→ {st?.name}</p>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-gray-900 tabular-nums">${m.csvRow.rate.toFixed(2)}/hr</span>
                          <button
                            onClick={() => handleAssign(idx, null)}
                            className="text-[10px] text-gray-400 hover:text-red-500 ml-1"
                            title="Skip this row"
                          >
                            skip
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unmatched rows */}
              {unmatched.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Unmatched — assign manually or skip</p>
                  <div className="rounded-lg border border-amber-100 divide-y divide-amber-50">
                    {matches.map((m, idx) => {
                      if (m.assignedServiceTypeId != null || m.matchedServiceType != null) return null;
                      return (
                        <div key={idx} className="flex items-start gap-3 px-3 py-2.5 bg-amber-50/30">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-gray-700 truncate">{m.csvRow.rawLabel}</p>
                              {m.csvRow.cptCode && (
                                <span className="text-[10px] text-gray-400">CPT {m.csvRow.cptCode}</span>
                              )}
                              <span className="ml-auto text-xs font-semibold text-gray-900 tabular-nums flex-shrink-0">${m.csvRow.rate.toFixed(2)}/hr</span>
                            </div>
                            <UnmatchedAssigner
                              serviceTypes={serviceTypes}
                              suggestions={m.suggestions}
                              onAssign={(stId) => handleAssign(idx, stId)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Explicitly-skipped rows (auto-matched but user clicked skip) */}
              {matches.filter(m => m.matchedServiceType != null && m.assignedServiceTypeId == null).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Skipped — will not be applied</p>
                  <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                    {matches.map((m, idx) => {
                      if (m.matchedServiceType == null || m.assignedServiceTypeId != null) return null;
                      return (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2.5 bg-white opacity-60">
                          <X className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-500 truncate line-through">{m.csvRow.rawLabel}</p>
                          </div>
                          <span className="text-xs text-gray-400 tabular-nums">${m.csvRow.rate.toFixed(2)}/hr</span>
                          <button
                            onClick={() => handleAssign(idx, m.matchedServiceType!.id)}
                            className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium ml-1 flex-shrink-0"
                            title="Restore this row"
                          >
                            restore
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          {step === "review" && (
            <button
              onClick={() => { setStep("upload"); setMatches([]); setFileName(null); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ← Upload different file
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
              Cancel
            </Button>
            {step === "review" && (
              <Button
                size="sm"
                onClick={handleApply}
                disabled={uniqueToApplyCount === 0 || importMutation.isPending}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {importMutation.isPending ? "Importing…" : `Apply ${uniqueToApplyCount} rate${uniqueToApplyCount !== 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnmatchedAssigner({
  serviceTypes,
  suggestions,
  onAssign,
}: {
  serviceTypes: ServiceType[];
  suggestions: ServiceType[];
  onAssign: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? serviceTypes.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : suggestions.length > 0 ? suggestions : serviceTypes.slice(0, 10);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[10px] text-blue-600 hover:text-blue-800 font-medium"
      >
        Assign to service type <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-10 bg-white rounded-lg border border-gray-200 shadow-lg w-72 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              autoFocus
              placeholder="Search service types…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">No matches</p>
            ) : (
              filtered.map(st => (
                <button
                  key={st.id}
                  onClick={() => { onAssign(st.id); setOpen(false); setSearch(""); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 text-gray-700 flex items-center gap-2"
                >
                  <span className="flex-1">{st.name}</span>
                  {st.cptCode && <span className="text-gray-400 text-[10px]">CPT {st.cptCode}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RateRow component
// ---------------------------------------------------------------------------

function RateRow({
  serviceType,
  config,
  onSaved,
}: {
  serviceType: ServiceType;
  config: RateConfig | undefined;
  onSaved: () => void;
}) {
  const activeRate = config?.inHouseRate ?? config?.contractedRate ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(activeRate ?? "");
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (rate: number) => {
      const res = await authFetch("/api/compensatory-finance/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTypeId: serviceType.id,
          inHouseRate: rate,
          effectiveDate: today(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to save rate");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["district-rates"] });
      queryClient.invalidateQueries({ queryKey: ["cost-avoidance-risks"] });
      setEditing(false);
      onSaved();
      toast.success(`Rate saved for ${serviceType.name}`);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to save rate");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/compensatory-finance/rates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to remove rate");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["district-rates"] });
      queryClient.invalidateQueries({ queryKey: ["cost-avoidance-risks"] });
      onSaved();
      toast.success(`Rate removed for ${serviceType.name}`);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to remove rate");
    },
  });

  const hasDistrictRate = activeRate != null;
  const displayRate = hasDistrictRate
    ? `$${parseFloat(activeRate!).toFixed(2)}/hr`
    : null;

  const fallbackLabel = serviceType.defaultBillingRate
    ? `$${parseFloat(serviceType.defaultBillingRate).toFixed(2)}/hr (catalog)`
    : `$${SYSTEM_DEFAULT_RATE}.00/hr (system default)`;

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed === "") {
      toast.error("Enter a valid dollar amount (e.g. 85.00)");
      return;
    }
    const parsed = parseFloat(trimmed);
    if (!isFinite(parsed) || parsed <= 0) {
      toast.error("Rate must be a positive number greater than zero");
      return;
    }
    saveMutation.mutate(parsed);
  };

  const handleCancel = () => {
    setValue(config?.inHouseRate ?? "");
    setEditing(false);
  };

  const isPending = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-gray-50/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{serviceType.name}</span>
          {hasDistrictRate ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> District rate
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
              <AlertCircle className="w-2.5 h-2.5" /> Using fallback
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 capitalize mt-0.5">
          {CATEGORY_LABELS[serviceType.category] || serviceType.category}
          {serviceType.cptCode && ` · CPT ${serviceType.cptCode}`}
        </p>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={String(SYSTEM_DEFAULT_RATE)}
              className="w-24 pl-5 pr-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
            />
          </div>
          <span className="text-xs text-gray-400">/hr</span>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending}
            className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
          >
            <Save className="w-3 h-3" />
          </Button>
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="text-right min-w-[96px]">
            {displayRate ? (
              <span className="text-sm font-semibold text-gray-900">{displayRate}</span>
            ) : (
              <span className="text-sm text-gray-400">{fallbackLabel}</span>
            )}
          </div>
          <button
            onClick={() => { setValue(activeRate ?? ""); setEditing(true); }}
            disabled={isPending}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit rate"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {config && (
            <button
              onClick={() => deleteMutation.mutate(config.id)}
              disabled={isPending}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
              title="Remove district rate"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingRatesPage() {
  const queryClient = useQueryClient();
  const [showImport, setShowImport] = useState(false);

  const { data: serviceTypes, isLoading: stLoading, isError: stError } = useQuery<ServiceType[]>({
    queryKey: ["service-types"],
    queryFn: () => authFetch("/api/service-types").then(r => {
      if (!r.ok) throw new Error("Failed to load service types");
      return r.json();
    }),
    staleTime: 60_000,
  });

  const { data: ratesData, isLoading: ratesLoading, isError: ratesError } = useQuery<RatesResponse>({
    queryKey: ["district-rates"],
    queryFn: () => authFetch("/api/compensatory-finance/rates").then(r => {
      if (!r.ok) throw new Error("Failed to load rate configs");
      return r.json();
    }),
    staleTime: 30_000,
  });

  const isLoading = stLoading || ratesLoading;
  const isError = stError || ratesError;

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["cost-avoidance-risks"] });
  };

  const handleImported = () => {
    queryClient.invalidateQueries({ queryKey: ["district-rates"] });
    queryClient.invalidateQueries({ queryKey: ["cost-avoidance-risks"] });
  };

  const configsByServiceType = new Map<number, RateConfig>();
  for (const c of (ratesData?.configs ?? [])) {
    if (!configsByServiceType.has(c.serviceTypeId)) {
      configsByServiceType.set(c.serviceTypeId, c);
    }
  }

  const withRate = serviceTypes?.filter(s => configsByServiceType.has(s.id)) ?? [];
  const withoutRate = serviceTypes?.filter(s => !configsByServiceType.has(s.id)) ?? [];

  return (
    <div className="space-y-5">
      {showImport && serviceTypes && (
        <ImportDialog
          serviceTypes={serviceTypes}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Billing Rates</h2>
          <p className="text-sm text-gray-500 mt-1">
            Set your district's hourly billing rates for each service type. These rates are used to
            estimate financial exposure on the Cost Avoidance dashboard.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowImport(true)}
          disabled={!serviceTypes}
          className="h-8 text-xs flex items-center gap-1.5 flex-shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          Import CSV
        </Button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-blue-800">
          <p className="font-medium mb-0.5">Rate priority: district rate → catalog rate → ${SYSTEM_DEFAULT_RATE}/hr system default</p>
          <p>
            District rates you configure here take precedence over any shared catalog rates.
            Service types without a district rate fall back to the catalog default, then to the
            ${SYSTEM_DEFAULT_RATE}/hr system default. Rates marked "system default" on the
            Cost Avoidance dashboard indicate an estimate — configure a rate to improve accuracy.
          </p>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load billing rates. Please refresh and try again.
        </div>
      )}

      {serviceTypes && ratesData && (
        <>
          {withoutRate.length > 0 && (
            <Card className="border-amber-200/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  No district rate set ({withoutRate.length} service type{withoutRate.length !== 1 ? "s" : ""})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {withoutRate.map(st => (
                    <RateRow
                      key={st.id}
                      serviceType={st}
                      config={undefined}
                      onSaved={handleSaved}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {withRate.length > 0 && (
            <Card className="border-emerald-200/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  District-configured rates ({withRate.length} service type{withRate.length !== 1 ? "s" : ""})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {withRate.map(st => (
                    <RateRow
                      key={st.id}
                      serviceType={st}
                      config={configsByServiceType.get(st.id)}
                      onSaved={handleSaved}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {serviceTypes.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
              <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No service types configured yet.</p>
              <p className="text-xs text-gray-400 mt-1">Add service types in Settings → Service Types to get started.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
