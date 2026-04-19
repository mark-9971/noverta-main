import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  Filter,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { listAuditLogs, getAuditLogStats, customFetch } from "@workspace/api-client-react";
import { DemoEmptyState } from "@/components/DemoEmptyState";
const PAGE_SIZE = 50;

interface AuditLogEntry {
  id: number;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetTable: string;
  targetId: string | null;
  studentId: number | null;
  ipAddress: string | null;
  summary: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogsResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface AuditStats {
  total: number;
  byAction: Record<string, number>;
  topTables: Array<{ table: string; count: number }>;
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  read: "bg-gray-50 text-gray-600 border-gray-200",
  update: "bg-amber-50 text-amber-700 border-amber-200",
  delete: "bg-red-50 text-red-700 border-red-200",
};

const TABLE_LABELS: Record<string, string> = {
  students: "Students",
  iep_goals: "IEP Goals",
  session_logs: "Sessions",
  restraint_incidents: "Restraint Incidents",
  progress_reports: "Progress Reports",
  behavior_targets: "Behavior Targets",
  program_targets: "Program Targets",
  staff: "Staff",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type TabKey = "all" | "rate_limit";
type RateLimitWindow = "1h" | "24h" | "7d";

const RATE_LIMIT_WINDOW_MS: Record<RateLimitWindow, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const RATE_LIMIT_WINDOW_LABEL: Record<RateLimitWindow, string> = {
  "1h": "Last 1 hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
};

export default function AuditLogPage() {
  const [tab, setTab] = useState<TabKey>("all");
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [studentIdFilter, setStudentIdFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [rlWindow, setRlWindow] = useState<RateLimitWindow>("24h");
  const [rlOffset, setRlOffset] = useState(0);

  const rlSinceIso = (() => {
    const d = new Date(Date.now() - RATE_LIMIT_WINDOW_MS[rlWindow]);
    return d.toISOString();
  })();

  const buildParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(extra?.offset ?? offset));
      if (actionFilter) params.set("action", actionFilter);
      if (tableFilter) params.set("targetTable", tableFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (searchText) params.set("search", searchText);
      if (actorFilter) params.set("actorUserId", actorFilter);
      if (studentIdFilter) params.set("studentId", studentIdFilter);
      return params.toString();
    },
    [offset, actionFilter, tableFilter, dateFrom, dateTo, searchText, actorFilter, studentIdFilter]
  );

  const { data, isLoading, error } = useQuery<AuditLogsResponse>({
    queryKey: [
      "audit-logs",
      offset,
      actionFilter,
      tableFilter,
      dateFrom,
      dateTo,
      searchText,
      actorFilter,
      studentIdFilter,
    ],
    queryFn: async () => {
      return listAuditLogs(Object.fromEntries(new URLSearchParams(buildParams())) as any) as unknown as AuditLogsResponse;
    },
    enabled: tab === "all",
  });

  const { data: rlData, isLoading: rlLoading, error: rlError } = useQuery<AuditLogsResponse>({
    queryKey: ["audit-logs-rate-limit", rlWindow, rlOffset],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(rlOffset));
      params.set("action", "rate_limit_exceeded");
      params.set("dateFrom", rlSinceIso);
      return listAuditLogs(
        Object.fromEntries(params) as any
      ) as unknown as AuditLogsResponse;
    },
    enabled: tab === "rate_limit",
  });

  const { data: _statsData } = useQuery({
    queryKey: ["audit-logs-stats", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      return getAuditLogStats(Object.fromEntries(params) as any);
    },
  });
  const stats = _statsData as AuditStats | undefined;

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (tableFilter) params.set("targetTable", tableFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (actorFilter) params.set("actorUserId", actorFilter);
      if (studentIdFilter) params.set("studentId", studentIdFilter);

      const blob = await customFetch<Blob>(
        `/api/audit-logs/export?${params.toString()}`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Audit log exported");
    } catch {
      toast.error("Failed to export audit log");
    }
  };

  const clearFilters = () => {
    setActionFilter("");
    setTableFilter("");
    setDateFrom("");
    setDateTo("");
    setSearchText("");
    setActorFilter("");
    setStudentIdFilter("");
    setOffset(0);
  };

  const hasFilters =
    actionFilter || tableFilter || dateFrom || dateTo || searchText || actorFilter || studentIdFilter;

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">FERPA Audit Log</h1>
            <p className="text-sm text-gray-500">
              Track all access and changes to student records
            </p>
          </div>
        </div>
        {tab === "all" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "all"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          All Events
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("rate_limit");
            setRlOffset(0);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            tab === "rate_limit"
              ? "border-amber-600 text-amber-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Rate Limit Breaches
          {stats?.byAction?.rate_limit_exceeded ? (
            <span className="ml-1 bg-amber-100 text-amber-800 text-[10px] rounded-full px-1.5 py-0.5">
              {stats.byAction.rate_limit_exceeded}
            </span>
          ) : null}
        </button>
      </div>

      {tab === "rate_limit" ? (
        <RateLimitBreachesPanel
          windowKey={rlWindow}
          onWindowChange={(w) => {
            setRlWindow(w);
            setRlOffset(0);
          }}
          data={rlData}
          isLoading={rlLoading}
          error={rlError as Error | null}
          offset={rlOffset}
          onOffsetChange={setRlOffset}
          onRowClick={setSelectedLog}
        />
      ) : (
        <>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
              Total Events
            </p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              {stats.total.toLocaleString()}
            </p>
          </div>
          {(["create", "read", "update", "delete"] as const).map((action) => (
            <div
              key={action}
              className="bg-white rounded-lg border border-gray-200 p-3"
            >
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                {action === "create"
                  ? "Creates"
                  : action === "read"
                    ? "Reads"
                    : action === "update"
                      ? "Updates"
                      : "Deletes"}
              </p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {(stats.byAction[action] ?? 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search summaries..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setOffset(0);
              }}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={`gap-1.5 ${hasFilters ? "border-emerald-300 text-emerald-700" : ""}`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {hasFilters && (
              <span className="bg-emerald-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                !
              </span>
            )}
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="p-3 border-b border-gray-100 bg-gray-50/50 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                Action
              </label>
              <Select
                value={actionFilter}
                onValueChange={(v) => {
                  setActionFilter(v === "all" ? "" : v);
                  setOffset(0);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                Table
              </label>
              <Select
                value={tableFilter}
                onValueChange={(v) => {
                  setTableFilter(v === "all" ? "" : v);
                  setOffset(0);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All tables" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tables</SelectItem>
                  <SelectItem value="students">Students</SelectItem>
                  <SelectItem value="iep_goals">IEP Goals</SelectItem>
                  <SelectItem value="session_logs">Sessions</SelectItem>
                  <SelectItem value="restraint_incidents">
                    Restraint Incidents
                  </SelectItem>
                  <SelectItem value="progress_reports">
                    Progress Reports
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setOffset(0);
                }}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                To
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setOffset(0);
                }}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                Actor User ID
              </label>
              <Input
                placeholder="user_..."
                value={actorFilter}
                onChange={(e) => {
                  setActorFilter(e.target.value);
                  setOffset(0);
                }}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                Student ID
              </label>
              <Input
                type="number"
                placeholder="e.g. 42"
                value={studentIdFilter}
                onChange={(e) => {
                  setStudentIdFilter(e.target.value);
                  setOffset(0);
                }}
                className="h-8 text-sm"
              />
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            Loading audit logs...
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">
            Failed to load audit logs. You may not have admin access.
          </div>
        ) : logs.length === 0 ? (
          <DemoEmptyState setupHint="The audit log records changes made by real users in production. The sample dataset is created by an automated seeder, so there is no end-user activity to show here.">
            <div className="p-12 text-center text-gray-400">
              No audit log entries found
            </div>
          </DemoEmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Timestamp</TableHead>
                    <TableHead className="w-[80px]">Action</TableHead>
                    <TableHead className="w-[120px]">Table</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="w-[100px]">Role</TableHead>
                    <TableHead className="w-[80px]">Student</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="text-xs text-gray-500 font-mono">
                        {formatDate(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${ACTION_COLORS[log.action] ?? ""}`}
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {TABLE_LABELS[log.targetTable] ?? log.targetTable}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-[300px] truncate">
                        {log.summary || "—"}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-500">
                          {formatRole(log.actorRole)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {log.studentId ? `#${log.studentId}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Eye className="w-3.5 h-3.5 text-gray-400" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="p-3 border-t border-gray-100 flex items-center justify-between text-sm">
              <p className="text-gray-500">
                {total.toLocaleString()} total entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-600 text-sm">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
        </>
      )}

      <Dialog
        open={!!selectedLog}
        onOpenChange={() => setSelectedLog(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Audit Entry #{selectedLog?.id}
              {selectedLog && (
                <Badge
                  variant="outline"
                  className={ACTION_COLORS[selectedLog.action] ?? ""}
                >
                  {selectedLog.action}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase">
                    Timestamp
                  </p>
                  <p className="text-gray-700">
                    {formatDate(selectedLog.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase">
                    Actor Role
                  </p>
                  <p className="text-gray-700">
                    {formatRole(selectedLog.actorRole)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase">
                    Table
                  </p>
                  <p className="text-gray-700">
                    {TABLE_LABELS[selectedLog.targetTable] ??
                      selectedLog.targetTable}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase">
                    Target ID
                  </p>
                  <p className="text-gray-700">
                    {selectedLog.targetId ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase">
                    Student ID
                  </p>
                  <p className="text-gray-700">
                    {selectedLog.studentId ? `#${selectedLog.studentId}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase">
                    IP Address
                  </p>
                  <p className="text-gray-700 font-mono text-xs">
                    {selectedLog.ipAddress ?? "—"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-medium text-gray-400 uppercase">
                  Actor User ID
                </p>
                <p className="text-gray-700 font-mono text-xs break-all">
                  {selectedLog.actorUserId}
                </p>
              </div>

              {selectedLog.summary && (
                <div>
                  <p className="text-[11px] font-medium text-gray-400 uppercase">
                    Summary
                  </p>
                  <p className="text-gray-700">{selectedLog.summary}</p>
                </div>
              )}

              {selectedLog.oldValues &&
                Object.keys(selectedLog.oldValues).length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase mb-1">
                      Previous Values
                    </p>
                    <pre className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-800 overflow-x-auto max-h-40">
                      {JSON.stringify(selectedLog.oldValues, null, 2)}
                    </pre>
                  </div>
                )}

              {selectedLog.newValues &&
                Object.keys(selectedLog.newValues).length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-gray-400 uppercase mb-1">
                      New Values
                    </p>
                    <pre className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 overflow-x-auto max-h-40">
                      {JSON.stringify(selectedLog.newValues, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RateLimitBreachesPanelProps {
  windowKey: RateLimitWindow;
  onWindowChange: (w: RateLimitWindow) => void;
  data: AuditLogsResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  offset: number;
  onOffsetChange: (o: number) => void;
  onRowClick: (log: AuditLogEntry) => void;
}

function RateLimitBreachesPanel({
  windowKey,
  onWindowChange,
  data,
  isLoading,
  error,
  offset,
  onOffsetChange,
  onRowClick,
}: RateLimitBreachesPanelProps) {
  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const breakdown = (() => {
    const map = new Map<string, { count: number; latest: string }>();
    for (const log of logs) {
      const meta = (log.metadata ?? {}) as Record<string, unknown>;
      const key = (typeof meta.endpointKey === "string" ? meta.endpointKey : log.targetTable) || "(unknown)";
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (log.createdAt > existing.latest) existing.latest = log.createdAt;
      } else {
        map.set(key, { count: 1, latest: log.createdAt });
      }
    }
    return Array.from(map.entries())
      .map(([endpointKey, v]) => ({ endpointKey, ...v }))
      .sort((a, b) => b.count - a.count);
  })();

  return (
    <div className="space-y-4">
      <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            Rate limit breach breakdown
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Shows endpoints where clients hit the rate limit. Use this to spot
            abuse patterns or misconfigured clients.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-amber-800 font-medium">Window:</label>
          <Select
            value={windowKey}
            onValueChange={(v) => onWindowChange(v as RateLimitWindow)}
          >
            <SelectTrigger className="h-8 text-sm w-[140px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RATE_LIMIT_WINDOW_LABEL) as RateLimitWindow[]).map(
                (k) => (
                  <SelectItem key={k} value={k}>
                    {RATE_LIMIT_WINDOW_LABEL[k]}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {breakdown.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">
              Top endpoints — {RATE_LIMIT_WINDOW_LABEL[windowKey]}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Aggregated from the {logs.length.toLocaleString()} most recent
              breach events on this page.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {breakdown.slice(0, 8).map((row) => {
              const max = breakdown[0]?.count || 1;
              const pct = Math.round((row.count / max) * 100);
              return (
                <div key={row.endpointKey} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-gray-800 truncate">
                      {row.endpointKey}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Latest: {formatDate(row.latest)}
                    </p>
                  </div>
                  <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-sm font-semibold text-amber-700 w-12 text-right tabular-nums">
                    {row.count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            Loading rate limit breaches...
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-500">
            Failed to load rate limit breaches.
          </div>
        ) : logs.length === 0 ? (
          <DemoEmptyState setupHint="Rate limit breaches are recorded when clients exceed configured request limits. None have occurred in the selected window.">
            <div className="p-12 text-center text-gray-400">
              No rate limit breaches in the selected window
            </div>
          </DemoEmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Timestamp</TableHead>
                    <TableHead>Endpoint Key</TableHead>
                    <TableHead className="w-[140px]">Actor</TableHead>
                    <TableHead className="w-[100px] text-right">
                      Breach Count
                    </TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const meta = (log.metadata ?? {}) as Record<string, unknown>;
                    const endpointKey =
                      typeof meta.endpointKey === "string"
                        ? meta.endpointKey
                        : log.targetTable;
                    const breachCount =
                      typeof meta.count === "number" ? meta.count : null;
                    const max = typeof meta.max === "number" ? meta.max : null;
                    return (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => onRowClick(log)}
                      >
                        <TableCell className="text-xs text-gray-500 font-mono">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-gray-800">
                          {endpointKey}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-gray-700">
                            {formatRole(log.actorRole)}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono truncate max-w-[120px]">
                            {log.actorUserId}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold text-amber-700 tabular-nums">
                            {breachCount ?? "—"}
                          </span>
                          {max != null && (
                            <span className="text-[10px] text-gray-400 ml-1">
                              / {max}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Eye className="w-3.5 h-3.5 text-gray-400" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="p-3 border-t border-gray-100 flex items-center justify-between text-sm">
              <p className="text-gray-500">
                {total.toLocaleString()} breach event
                {total === 1 ? "" : "s"} in {RATE_LIMIT_WINDOW_LABEL[windowKey].toLowerCase()}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => onOffsetChange(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-gray-600 text-sm">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => onOffsetChange(offset + PAGE_SIZE)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
