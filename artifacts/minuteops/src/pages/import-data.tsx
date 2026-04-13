import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileSpreadsheet, Users, Clock, ClipboardList,
  CheckCircle, XCircle, AlertTriangle, Download, RefreshCw
} from "lucide-react";

const API_BASE = import.meta.env.DEV ? "/api" : "/api";

type ImportType = "students" | "service-requirements" | "sessions";

const IMPORT_TYPES: { key: ImportType; label: string; description: string; icon: any; templateKey: string }[] = [
  { key: "students", label: "Students", description: "Import student roster with names, grades, IDs", icon: Users, templateKey: "students" },
  { key: "service-requirements", label: "IEP Service Requirements", description: "Import mandated service minutes per student", icon: ClipboardList, templateKey: "service_requirements" },
  { key: "sessions", label: "Session Logs", description: "Import delivered session/minute logs", icon: Clock, templateKey: "sessions" },
];

const PREBUILT_TEMPLATES = [
  { key: "aspen_students", label: "Aspen X2 Student Export", description: "Matches Aspen X2 student roster export format" },
  { key: "esped_services", label: "eSPED Service Grid", description: "Matches eSPED IEP service requirement export" },
];

interface ImportResult {
  id: number;
  importType: string;
  fileName: string | null;
  status: string;
  rowsProcessed: number;
  rowsImported: number;
  rowsErrored: number;
  errors?: string[];
  createdAt: string;
}

export default function ImportData() {
  const [selectedType, setSelectedType] = useState<ImportType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<ImportResult[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/imports`);
      if (res.ok) setHistory(await res.json());
    } catch (_) {}
    setLoadingHistory(false);
  }, []);

  useEffect(() => { loadHistory(); }, []);

  function parsePreview(text: string) {
    const lines = text.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;
    const parseLine = (line: string) => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseLine(lines[0]);
    const rows = lines.slice(1, 6).map(parseLine);
    return { headers, rows };
  }

  async function handleFile(f: File) {
    setFile(f);
    setResult(null);
    const text = await f.text();
    setCsvPreview(parsePreview(text));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".tsv") || f.name.endsWith(".txt"))) {
      handleFile(f);
    }
  }

  async function handleImport() {
    if (!file || !selectedType) return;
    setImporting(true);
    setResult(null);
    try {
      const csvData = await file.text();
      const res = await fetch(`${API_BASE}/imports/${selectedType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvData, fileName: file.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ id: 0, importType: selectedType, fileName: file.name, status: "failed", rowsProcessed: 0, rowsImported: 0, rowsErrored: 0, errors: [data.error || "Import failed"], createdAt: new Date().toISOString() });
      } else {
        setResult(data);
      }
      loadHistory();
    } catch (e: any) {
      setResult({ id: 0, importType: selectedType, fileName: file.name, status: "failed", rowsProcessed: 0, rowsImported: 0, rowsErrored: 0, errors: [e.message], createdAt: new Date().toISOString() });
    }
    setImporting(false);
  }

  function downloadTemplate(templateKey: string) {
    window.open(`${API_BASE}/imports/templates/${templateKey}`, "_blank");
  }

  function resetForm() {
    setFile(null);
    setCsvPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Import Data</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Bulk import students, IEP requirements, and session logs from CSV</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {IMPORT_TYPES.map(type => {
          const active = selectedType === type.key;
          return (
            <button
              key={type.key}
              onClick={() => { setSelectedType(type.key); resetForm(); }}
              className={`text-left p-5 rounded-xl border transition-all ${
                active ? "border-emerald-300 bg-emerald-50/50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                  <type.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-[14px] font-semibold ${active ? "text-emerald-800" : "text-gray-700"}`}>{type.label}</p>
                  <p className="text-[12px] text-gray-400">{type.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedType && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold text-gray-600">
                  Upload {IMPORT_TYPES.find(t => t.key === selectedType)?.label} CSV
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                    dragActive ? "border-emerald-400 bg-emerald-50/50" : "border-gray-200 hover:border-gray-300 bg-gray-50/30"
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                      <div className="text-left">
                        <p className="text-[14px] font-semibold text-gray-700">{file.name}</p>
                        <p className="text-[12px] text-gray-400">{(file.size / 1024).toFixed(1)} KB · {csvPreview?.rows.length ?? 0}+ data rows</p>
                      </div>
                      <Button variant="outline" size="sm" className="ml-4 text-[11px]" onClick={e => { e.stopPropagation(); resetForm(); }}>
                        Change file
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-[14px] font-medium text-gray-600">Drop your CSV file here</p>
                      <p className="text-[12px] text-gray-400 mt-1">or click to browse · Supports .csv, .tsv, .txt</p>
                    </>
                  )}
                </div>

                {csvPreview && (
                  <div className="mt-4">
                    <p className="text-[12px] font-semibold text-gray-500 mb-2">Preview (first {csvPreview.rows.length} rows)</p>
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            {csvPreview.headers.map((h, i) => (
                              <th key={i} className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {csvPreview.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50/50">
                              {row.map((cell, j) => (
                                <td key={j} className="px-3 py-1.5 text-gray-600 whitespace-nowrap max-w-[200px] truncate">{cell || "—"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {file && !result && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px]"
                      disabled={importing}
                      onClick={handleImport}
                    >
                      {importing ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                      ) : (
                        <><Upload className="w-4 h-4 mr-2" /> Import {csvPreview?.rows.length ?? 0} rows</>
                      )}
                    </Button>
                  </div>
                )}

                {result && (
                  <div className={`mt-4 p-4 rounded-xl border ${result.status === "completed" ? "bg-emerald-50/50 border-emerald-200" : "bg-red-50/50 border-red-200"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      {result.status === "completed" ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                      <p className="text-[14px] font-semibold text-gray-700">
                        {result.status === "completed" ? "Import Complete" : "Import Failed"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-3">
                      <div>
                        <p className="text-[11px] text-gray-400">Processed</p>
                        <p className="text-lg font-bold text-gray-700">{result.rowsProcessed}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400">Imported</p>
                        <p className="text-lg font-bold text-emerald-600">{result.rowsImported}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400">Errors</p>
                        <p className="text-lg font-bold text-red-500">{result.rowsErrored}</p>
                      </div>
                    </div>
                    {result.errors && result.errors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[11px] font-semibold text-gray-500">Error Details:</p>
                        {result.errors.slice(0, 10).map((err, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px]">
                            <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span className="text-gray-600">{err}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button variant="outline" size="sm" className="text-[12px]" onClick={resetForm}>Import Another File</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold text-gray-600">Templates</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-2">
                <p className="text-[12px] text-gray-400 mb-3">Download a template, fill it in, then upload here.</p>

                <button
                  onClick={() => downloadTemplate(IMPORT_TYPES.find(t => t.key === selectedType)?.templateKey ?? "students")}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-left"
                >
                  <Download className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-gray-700">Trellis Template</p>
                    <p className="text-[11px] text-gray-400">Standard format with sample data</p>
                  </div>
                </button>

                {PREBUILT_TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.key}
                    onClick={() => downloadTemplate(tmpl.key)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-left"
                  >
                    <Download className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-[13px] font-medium text-gray-700">{tmpl.label}</p>
                      <p className="text-[11px] text-gray-400">{tmpl.description}</p>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold text-gray-600">Supported Sources</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="space-y-2 text-[12px] text-gray-500">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span><span className="font-semibold text-gray-700">Aspen X2</span> — Student roster export</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span><span className="font-semibold text-gray-700">eSPED</span> — Service grid export</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span><span className="font-semibold text-gray-700">Excel / Sheets</span> — Save as CSV</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span><span className="font-semibold text-gray-700">Any CSV</span> — Flexible column matching</span>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-[11px] text-gray-500">
                    <span className="font-semibold">Tip:</span> Export from your SIS as CSV. The importer matches columns by name — exact headers aren't required.
                    Common variations like "first" / "first_name" / "First Name" all work.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-0 flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600">Import History</CardTitle>
          <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={loadHistory}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {loadingHistory ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No imports yet. Upload a file above to get started.</div>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 20).map(imp => (
                <div key={imp.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 bg-white">
                  {imp.status === "completed" ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  ) : imp.status === "failed" ? (
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  ) : (
                    <RefreshCw className="w-5 h-5 text-amber-500 flex-shrink-0 animate-spin" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700">
                      {imp.importType?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      {imp.fileName && <span className="text-gray-400 font-normal"> — {imp.fileName}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {new Date(imp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] flex-shrink-0">
                    <div className="text-center">
                      <p className="font-bold text-emerald-600">{imp.rowsImported}</p>
                      <p className="text-gray-400 text-[10px]">imported</p>
                    </div>
                    {(imp.rowsErrored ?? 0) > 0 && (
                      <div className="text-center">
                        <p className="font-bold text-red-500">{imp.rowsErrored}</p>
                        <p className="text-gray-400 text-[10px]">errors</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
