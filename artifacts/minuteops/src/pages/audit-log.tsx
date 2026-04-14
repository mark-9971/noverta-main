import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
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
} from "lucide-react";
import { toast } from "sonner";

const API = "/api";
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
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
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

export default function AuditLogPage() {
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);

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
      return params.toString();
    },
    [offset, actionFilter, tableFilter, dateFrom, dateTo, searchText]
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
    ],
    queryFn: async () => {
      const res = await authFetch(`${API}/audit-logs?${buildParams()}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
  });

  const { data: stats } = useQuery<AuditStats>({
    queryKey: ["audit-logs-stats", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await authFetch(
        `${API}/audit-logs/stats?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const logs = data?.logs ?? [];
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

      const res = await authFetch(
        `${API}/audit-logs/export?${params.toString()}`
      );
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
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
    setOffset(0);
  };

  const hasFilters =
    actionFilter || tableFilter || dateFrom || dateTo || searchText;

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
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

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
          <div className="p-3 border-b border-gray-100 bg-gray-50/50 grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <div className="p-12 text-center text-gray-400">
            No audit log entries found
          </div>
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
