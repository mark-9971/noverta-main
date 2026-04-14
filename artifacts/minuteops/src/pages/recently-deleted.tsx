import { useState, useEffect } from "react";
import { Trash2, RotateCcw, User, Users, Calendar, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";

interface DeletedStudent {
  id: number;
  firstName: string;
  lastName: string;
  grade: string | null;
  status: string;
  schoolName: string | null;
  deletedAt: string;
}

interface DeletedStaff {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  email: string | null;
  deletedAt: string;
}

interface DeletedSession {
  id: number;
  studentId: number;
  sessionDate: string;
  durationMinutes: number;
  status: string;
  studentFirst: string | null;
  studentLast: string | null;
  deletedAt: string;
}

interface DeletedScheduleBlock {
  id: number;
  staffId: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  blockType: string;
  staffFirst: string | null;
  staffLast: string | null;
  deletedAt: string;
}

interface DeletedData {
  students: DeletedStudent[];
  staff: DeletedStaff[];
  sessions: DeletedSession[];
  scheduleBlocks: DeletedScheduleBlock[];
}

type TabKey = "students" | "staff" | "sessions" | "scheduleBlocks";

export default function RecentlyDeletedPage() {
  const [data, setData] = useState<DeletedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("students");

  async function loadData() {
    try {
      const res = await authFetch("/api/recently-deleted");
      const json = await res.json();
      setData(json);
    } catch {
      toast.error("Failed to load deleted records");
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function restore(table: TabKey, id: number) {
    const key = `${table}-${id}`;
    setRestoring(key);
    try {
      const res = await authFetch("/api/recently-deleted/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error || "Failed to restore");
      } else {
        toast.success("Record restored");
        loadData();
      }
    } catch {
      toast.error("Failed to restore");
    }
    setRestoring(null);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const tabs: { key: TabKey; label: string; icon: typeof User; count: number }[] = [
    { key: "students", label: "Students", icon: User, count: data?.students.length ?? 0 },
    { key: "staff", label: "Staff", icon: Users, count: data?.staff.length ?? 0 },
    { key: "sessions", label: "Sessions", icon: Calendar, count: data?.sessions.length ?? 0 },
    { key: "scheduleBlocks", label: "Schedule Blocks", icon: Clock, count: data?.scheduleBlocks.length ?? 0 },
  ];

  const totalCount = tabs.reduce((sum, t) => sum + t.count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Recently Deleted</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totalCount === 0
            ? "No deleted records to show."
            : `${totalCount} deleted record${totalCount === 1 ? "" : "s"} available for restoration.`}
        </p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              activeTab === t.key ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-600"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count > 0 && (
              <span className={`ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === t.key ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-500"
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "students" && (
        <div className="space-y-2">
          {data?.students.length === 0 && <EmptyState label="students" />}
          {data?.students.map(s => (
            <RecordRow
              key={s.id}
              title={`${s.firstName} ${s.lastName}`}
              subtitle={[s.grade && `Grade ${s.grade}`, s.schoolName].filter(Boolean).join(" · ")}
              deletedAt={formatDate(s.deletedAt)}
              onRestore={() => restore("students", s.id)}
              restoring={restoring === `students-${s.id}`}
            />
          ))}
        </div>
      )}

      {activeTab === "staff" && (
        <div className="space-y-2">
          {data?.staff.length === 0 && <EmptyState label="staff" />}
          {data?.staff.map(s => (
            <RecordRow
              key={s.id}
              title={`${s.firstName} ${s.lastName}`}
              subtitle={[s.role, s.email].filter(Boolean).join(" · ")}
              deletedAt={formatDate(s.deletedAt)}
              onRestore={() => restore("staff", s.id)}
              restoring={restoring === `staff-${s.id}`}
            />
          ))}
        </div>
      )}

      {activeTab === "sessions" && (
        <div className="space-y-2">
          {data?.sessions.length === 0 && <EmptyState label="sessions" />}
          {data?.sessions.map(s => (
            <RecordRow
              key={s.id}
              title={`Session #${s.id} — ${s.studentFirst ?? ""} ${s.studentLast ?? ""}`}
              subtitle={`${s.sessionDate} · ${s.durationMinutes} min · ${s.status}`}
              deletedAt={formatDate(s.deletedAt)}
              onRestore={() => restore("sessions", s.id)}
              restoring={restoring === `sessions-${s.id}`}
            />
          ))}
        </div>
      )}

      {activeTab === "scheduleBlocks" && (
        <div className="space-y-2">
          {data?.scheduleBlocks.length === 0 && <EmptyState label="schedule blocks" />}
          {data?.scheduleBlocks.map(s => (
            <RecordRow
              key={s.id}
              title={`${s.staffFirst ?? ""} ${s.staffLast ?? ""} — ${s.dayOfWeek}`}
              subtitle={`${s.startTime}–${s.endTime} · ${s.blockType}`}
              deletedAt={formatDate(s.deletedAt)}
              onRestore={() => restore("scheduleBlocks", s.id)}
              restoring={restoring === `scheduleBlocks-${s.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordRow({ title, subtitle, deletedAt, onRestore, restoring }: {
  title: string; subtitle: string; deletedAt: string; onRestore: () => void; restoring: boolean;
}) {
  return (
    <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3.5 hover:border-gray-300 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-gray-700 truncate">{title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        <span className="text-[10px] text-red-400">Deleted {deletedAt}</span>
        <button
          onClick={onRestore}
          disabled={restoring}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md text-[11px] font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
          Restore
        </button>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <Trash2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
      <p className="text-sm">No deleted {label}</p>
    </div>
  );
}
