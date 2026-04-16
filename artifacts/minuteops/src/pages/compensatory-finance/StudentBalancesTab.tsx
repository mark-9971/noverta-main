import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";
import { formatDollars, formatMinutesAsHours } from "./types";
import type { StudentBalance } from "./types";

export function StudentBalancesTab({ students, loading }: { students: StudentBalance[]; loading: boolean }) {
  const [sortField, setSortField] = useState<"remainingDollars" | "studentName" | "pctDelivered">("remainingDollars");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sorted = useMemo(() => {
    const arr = [...students];
    arr.sort((a, b) => {
      const av = sortField === "studentName" ? a.studentName : a[sortField];
      const bv = sortField === "studentName" ? b.studentName : b[sortField];
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [students, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "studentName" ? "asc" : "desc"); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <p className="text-center text-muted-foreground">No students with compensatory obligations</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 pr-4">
                  <button onClick={() => toggleSort("studentName")} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                    Student <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="pb-2 pr-4 text-muted-foreground font-medium">School</th>
                <th className="pb-2 pr-4">
                  <button onClick={() => toggleSort("remainingDollars")} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                    Remaining <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="pb-2 pr-4 text-muted-foreground font-medium">Hours Owed</th>
                <th className="pb-2 pr-4">
                  <button onClick={() => toggleSort("pctDelivered")} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                    Fulfilled <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="pb-2 text-muted-foreground font-medium">Obligations</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(s => (
                <StudentRow
                  key={s.studentId}
                  student={s}
                  expanded={expandedId === s.studentId}
                  onToggle={() => setExpandedId(expandedId === s.studentId ? null : s.studentId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentRow({ student: s, expanded, onToggle }: {
  student: StudentBalance;
  expanded: boolean;
  onToggle: () => void;
}) {
  const remainingMinutes = s.totalMinutesOwed - s.totalMinutesDelivered;

  return (
    <>
      <tr className="hover:bg-muted/50 cursor-pointer" onClick={onToggle}>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Link href={`/students/${s.studentId}`} onClick={(e: React.MouseEvent) => e.stopPropagation()} className="text-blue-600 hover:underline font-medium">
              {s.studentName}
            </Link>
          </div>
        </td>
        <td className="py-3 pr-4 text-muted-foreground">{s.schoolName}</td>
        <td className="py-3 pr-4 font-semibold">{formatDollars(s.remainingDollars)}</td>
        <td className="py-3 pr-4">{formatMinutesAsHours(remainingMinutes)}</td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-20 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${s.pctDelivered >= 75 ? "bg-green-500" : s.pctDelivered >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(s.pctDelivered, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{s.pctDelivered}%</span>
          </div>
        </td>
        <td className="py-3">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
            {s.pendingCount} active
          </span>
        </td>
      </tr>
      {expanded && s.services.length > 0 && (
        <tr>
          <td colSpan={6} className="pb-3 px-8">
            <div className="bg-muted/30 rounded-lg p-3 mt-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">Service Breakdown</p>
              <div className="space-y-1">
                {s.services.map(svc => (
                  <div key={svc.serviceTypeId} className="flex items-center justify-between text-xs">
                    <span>{svc.name}</span>
                    <span>{formatMinutesAsHours(svc.minutesOwed - svc.minutesDelivered)} remaining &middot; {formatDollars(svc.dollarsOwed)}</span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
