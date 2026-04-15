import { useState, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database, Plus, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Trash2, TestTube, Upload, Clock, Plug, Settings2, FileSpreadsheet,
  ChevronDown, ChevronRight,
} from "lucide-react";

interface SisProvider {
  key: string;
  label: string;
  description: string;
}

interface SisConnection {
  id: number;
  provider: string;
  label: string;
  schoolId: number | null;
  status: string;
  syncSchedule: string;
  lastSyncAt: string | null;
  enabled: boolean;
  createdAt: string;
}

interface SyncLog {
  id: number;
  connectionId: number;
  syncType: string;
  status: string;
  studentsAdded: number;
  studentsUpdated: number;
  studentsArchived: number;
  staffAdded: number;
  staffUpdated: number;
  totalRecords: number;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

const PROVIDER_ICONS: Record<string, typeof Database> = {
  powerschool: Database,
  infinite_campus: Database,
  skyward: Database,
  csv: FileSpreadsheet,
};

const CREDENTIAL_FIELDS: Record<string, Array<{ key: string; label: string; type: string; placeholder: string }>> = {
  powerschool: [
    { key: "baseUrl", label: "PowerSchool Base URL", type: "url", placeholder: "https://district.powerschool.com" },
    { key: "clientId", label: "Client ID", type: "text", placeholder: "OAuth2 Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "OAuth2 Client Secret" },
  ],
  infinite_campus: [
    { key: "baseUrl", label: "Infinite Campus Base URL", type: "url", placeholder: "https://district.infinitecampus.com" },
    { key: "apiToken", label: "API Token", type: "password", placeholder: "API Bearer Token" },
  ],
  skyward: [
    { key: "baseUrl", label: "Skyward Base URL", type: "url", placeholder: "https://district.skyward.com" },
    { key: "apiKey", label: "API Key", type: "text", placeholder: "API Key" },
    { key: "apiSecret", label: "API Secret", type: "password", placeholder: "API Secret" },
  ],
  csv: [],
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  connected: { bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
  disconnected: { bg: "bg-gray-100", text: "text-gray-500", icon: Plug },
  error: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
  completed_with_errors: { bg: "bg-amber-50", text: "text-amber-700", icon: AlertTriangle },
  failed: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  running: { bg: "bg-blue-50", text: "text-blue-700", icon: RefreshCw },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.disconnected;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ConnectionCard({
  connection,
  onRefresh,
}: {
  connection: SisConnection;
  onRefresh: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, unknown> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvType, setCsvType] = useState<"students" | "staff">("students");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<Record<string, unknown> | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch(`/api/sis/connections/${connection.id}/test`, { method: "POST" });
      if (res.ok) setTestResult(await res.json());
      else setTestResult({ ok: false, message: "Test request failed" });
    } finally {
      setTesting(false);
      onRefresh();
    }
  }, [connection.id, onRefresh]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await authFetch(`/api/sis/connections/${connection.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncType: "full" }),
      });
      if (res.ok) setSyncResult(await res.json());
    } finally {
      setSyncing(false);
      onRefresh();
    }
  }, [connection.id, onRefresh]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this SIS connection? Sync history will also be removed.")) return;
    setDeleting(true);
    try {
      await authFetch(`/api/sis/connections/${connection.id}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setDeleting(false);
    }
  }, [connection.id, onRefresh]);

  const handleCsvUpload = useCallback(async () => {
    if (!csvText.trim()) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await authFetch(`/api/sis/connections/${connection.id}/upload-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, dataType: csvType }),
      });
      if (res.ok) {
        setUploadResult(await res.json());
        setCsvText("");
        onRefresh();
      }
    } finally {
      setUploading(false);
    }
  }, [connection.id, csvText, csvType, onRefresh]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(reader.result as string);
    reader.readAsText(file);
  }, []);

  const ProviderIcon = PROVIDER_ICONS[connection.provider] ?? Database;

  return (
    <Card className="border border-gray-100 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <ProviderIcon className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-gray-800 truncate">{connection.label}</h3>
              <StatusBadge status={connection.status} />
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {connection.provider.replace(/_/g, " ")} &middot;{" "}
              {connection.lastSyncAt
                ? `Last sync: ${new Date(connection.lastSyncAt).toLocaleDateString()}`
                : "Never synced"}
              {" "}&middot; Schedule: {connection.syncSchedule}
            </p>
          </div>
          <button onClick={() => setExpanded((e) => !e)} className="text-gray-300 hover:text-gray-500">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-gray-50">
            <div className="flex gap-2 flex-wrap">
              {connection.provider !== "csv" && (
                <>
                  <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="text-[11px] gap-1 h-7">
                    <TestTube className={`w-3 h-3 ${testing ? "animate-spin" : ""}`} />
                    {testing ? "Testing…" : "Test Connection"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} className="text-[11px] gap-1 h-7">
                    <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "Syncing…" : "Sync Now"}
                  </Button>
                </>
              )}
              {connection.provider === "csv" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCsvUpload((v) => !v)}
                  className="text-[11px] gap-1 h-7"
                >
                  <Upload className="w-3 h-3" />
                  Upload CSV
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-[11px] gap-1 h-7 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <Trash2 className="w-3 h-3" />
                {deleting ? "Deleting…" : "Remove"}
              </Button>
            </div>

            {testResult && (
              <div className={`text-[12px] px-3 py-2 rounded-lg ${testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> : <XCircle className="w-3.5 h-3.5 inline mr-1" />}
                {testResult.message}
              </div>
            )}

            {syncResult && (
              <div className="text-[12px] px-3 py-2 rounded-lg bg-blue-50 text-blue-700 space-y-1">
                <p className="font-semibold">Sync Complete</p>
                <p>Students: +{(syncResult as Record<string, number>).studentsAdded} added, {(syncResult as Record<string, number>).studentsUpdated} updated</p>
                <p>Staff: +{(syncResult as Record<string, number>).staffAdded} added, {(syncResult as Record<string, number>).staffUpdated} updated</p>
                <p>{(syncResult as Record<string, number>).totalRecords} total records processed</p>
              </div>
            )}

            {showCsvUpload && (
              <div className="space-y-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex gap-2">
                  <button
                    onClick={() => setCsvType("students")}
                    className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${csvType === "students" ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-500"}`}
                  >
                    Student Roster
                  </button>
                  <button
                    onClick={() => setCsvType("staff")}
                    className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${csvType === "staff" ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-500"}`}
                  >
                    Staff Directory
                  </button>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="text-[12px] text-gray-600"
                />
                {csvText && (
                  <p className="text-[11px] text-gray-400">
                    {csvText.split("\n").length - 1} rows detected
                  </p>
                )}
                <Button size="sm" onClick={handleCsvUpload} disabled={uploading || !csvText} className="text-[11px] gap-1 h-7 bg-emerald-600 hover:bg-emerald-700">
                  <Upload className={`w-3 h-3 ${uploading ? "animate-spin" : ""}`} />
                  {uploading ? "Importing…" : `Import ${csvType}`}
                </Button>
                {uploadResult && (
                  <div className="text-[12px] px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700">
                    Imported: +{(uploadResult as Record<string, number>).studentsAdded || 0} students,
                    +{(uploadResult as Record<string, number>).staffAdded || 0} staff,{" "}
                    {(uploadResult as Record<string, number>).totalRecords} records total
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewConnectionForm({ onCreated }: { onCreated: () => void }) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: providers } = useQuery<SisProvider[]>({
    queryKey: ["sis-providers"],
    queryFn: async () => {
      const res = await authFetch("/api/sis/providers");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleCreate = useCallback(async () => {
    if (!selectedProvider || !label.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/sis/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          label: label.trim(),
          credentials,
        }),
      });
      if (res.ok) {
        setSelectedProvider(null);
        setLabel("");
        setCredentials({});
        onCreated();
      }
    } finally {
      setSaving(false);
    }
  }, [selectedProvider, label, credentials, onCreated]);

  if (!selectedProvider) {
    return (
      <Card className="border border-dashed border-gray-200 shadow-none">
        <CardContent className="p-4">
          <p className="text-[13px] font-semibold text-gray-700 mb-3">Connect a Student Information System</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(providers ?? []).map((p) => {
              const Icon = PROVIDER_ICONS[p.key] ?? Database;
              return (
                <button
                  key={p.key}
                  onClick={() => { setSelectedProvider(p.key); setLabel(p.label); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition-colors text-center"
                >
                  <Icon className="w-5 h-5 text-emerald-600" />
                  <span className="text-[12px] font-semibold text-gray-700">{p.label}</span>
                  <span className="text-[10px] text-gray-400 leading-snug">{p.description}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  const fields = CREDENTIAL_FIELDS[selectedProvider] ?? [];

  return (
    <Card className="border border-emerald-200 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-gray-700">
            New {(providers ?? []).find((p) => p.key === selectedProvider)?.label ?? selectedProvider} Connection
          </p>
          <button onClick={() => setSelectedProvider(null)} className="text-[11px] text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>

        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Connection Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full text-[13px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
            placeholder="e.g., District PowerSchool"
          />
        </div>

        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">{f.label}</label>
            <input
              type={f.type}
              value={credentials[f.key] ?? ""}
              onChange={(e) => setCredentials((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full text-[13px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder={f.placeholder}
            />
          </div>
        ))}

        <Button onClick={handleCreate} disabled={saving || !label.trim()} className="text-[12px] gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-3.5 h-3.5" />
          {saving ? "Creating…" : "Create Connection"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SyncLogTable({ connectionId }: { connectionId?: number }) {
  const { data: logs, isLoading } = useQuery<SyncLog[]>({
    queryKey: ["sis-sync-logs", connectionId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "15" });
      if (connectionId) params.set("connectionId", String(connectionId));
      const res = await authFetch(`/api/sis/sync-logs?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8 text-[12px] text-gray-400">
        No sync history yet. Run a sync to see results here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-100">
            <th className="py-2 px-3 font-medium">Date</th>
            <th className="py-2 px-3 font-medium">Type</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">Students</th>
            <th className="py-2 px-3 font-medium">Staff</th>
            <th className="py-2 px-3 font-medium">Total</th>
            <th className="py-2 px-3 font-medium">Issues</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="py-2 px-3 text-gray-600">
                {new Date(log.startedAt).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </td>
              <td className="py-2 px-3 text-gray-600">{log.syncType.replace(/_/g, " ")}</td>
              <td className="py-2 px-3"><StatusBadge status={log.status} /></td>
              <td className="py-2 px-3 text-gray-600">
                {log.studentsAdded > 0 && <span className="text-emerald-600">+{log.studentsAdded}</span>}
                {log.studentsAdded > 0 && log.studentsUpdated > 0 && " / "}
                {log.studentsUpdated > 0 && <span className="text-blue-600">{log.studentsUpdated} upd</span>}
                {log.studentsAdded === 0 && log.studentsUpdated === 0 && "—"}
              </td>
              <td className="py-2 px-3 text-gray-600">
                {log.staffAdded > 0 && <span className="text-emerald-600">+{log.staffAdded}</span>}
                {log.staffAdded > 0 && log.staffUpdated > 0 && " / "}
                {log.staffUpdated > 0 && <span className="text-blue-600">{log.staffUpdated} upd</span>}
                {log.staffAdded === 0 && log.staffUpdated === 0 && "—"}
              </td>
              <td className="py-2 px-3 text-gray-600">{log.totalRecords}</td>
              <td className="py-2 px-3">
                {log.errors.length > 0 && (
                  <span className="text-red-500">{log.errors.length} error{log.errors.length !== 1 ? "s" : ""}</span>
                )}
                {log.warnings.length > 0 && (
                  <span className="text-amber-500 ml-1">{log.warnings.length} warn</span>
                )}
                {log.errors.length === 0 && log.warnings.length === 0 && (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SisSettings() {
  const queryClient = useQueryClient();

  const { data: connections, isLoading } = useQuery<SisConnection[]>({
    queryKey: ["sis-connections"],
    queryFn: async () => {
      const res = await authFetch("/api/sis/connections");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sis-connections"] });
    queryClient.invalidateQueries({ queryKey: ["sis-sync-logs"] });
  }, [queryClient]);

  const hasConnections = (connections ?? []).length > 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-600" />
            SIS Integration
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Connect your Student Information System to sync student rosters and staff directories automatically.
          </p>
        </div>
      </div>

      {!hasConnections && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-amber-800">No SIS Connected</p>
              <p className="text-[12px] text-amber-600 mt-0.5">
                Connect a Student Information System below to automatically sync your student roster and staff directory.
                You can also upload a CSV file if your SIS is not listed.
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {(connections ?? []).map((conn) => (
        <ConnectionCard key={conn.id} connection={conn} onRefresh={refresh} />
      ))}

      <NewConnectionForm onCreated={refresh} />

      {hasConnections && (
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px] font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Sync History
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <SyncLogTable />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
