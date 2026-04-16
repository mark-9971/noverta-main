import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Search,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Printer,
  BarChart3,
  Users,
  Eye,
} from "lucide-react";

interface ComplianceRow {
  studentId: number;
  studentName: string;
  grade: string | null;
  totalAccommodations: number;
  verifiedCount: number;
  overdueCount: number;
  complianceRate: number;
  lastVerified: string | null;
}

interface ComplianceData {
  districtId: number;
  totalStudents: number;
  overallComplianceRate: number;
  students: ComplianceRow[];
}

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  not_implemented: "bg-red-100 text-red-800",
  not_applicable: "bg-gray-100 text-gray-600",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function AccommodationLookup() {
  const { role } = useRole();
  const [, navigate] = useLocation();
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    authFetch("/api/accommodation-compliance")
      .then((r: Response) => r.json())
      .then((d: ComplianceData) => setData(d))
      .catch(() => toast.error("Failed to load accommodation compliance"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data?.students.filter(s =>
    s.studentName.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const overdueStudents = filtered.filter(s => s.overdueCount > 0);
  const compliantStudents = filtered.filter(s => s.overdueCount === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            Accommodation Verification
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and verify IEP accommodation implementation across your caseload
          </p>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-gray-200 rounded-lg" />
          <div className="h-64 bg-gray-200 rounded-lg" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Unable to load compliance data.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold text-gray-900">{data.totalStudents}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Users className="w-3 h-3" /> Students with Accommodations
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className={`text-2xl font-bold ${data.overallComplianceRate >= 80 ? "text-emerald-700" : data.overallComplianceRate >= 50 ? "text-amber-700" : "text-red-700"}`}>
                  {data.overallComplianceRate}%
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <BarChart3 className="w-3 h-3" /> Overall Compliance Rate
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold text-emerald-700">
                  {data.students.filter(s => s.complianceRate === 100).length}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Fully Compliant
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold text-amber-700">
                  {overdueStudents.length}
                </div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Need Attention
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search students..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {overdueStudents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                  Needs Verification ({overdueStudents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {overdueStudents.map(s => (
                    <StudentRow key={s.studentId} student={s} onNavigate={() => navigate(`/students/${s.studentId}#accommodations`)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {compliantStudents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-700">
                  <CheckCircle className="w-4 h-4" />
                  Up to Date ({compliantStudents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {compliantStudents.map(s => (
                    <StudentRow key={s.studentId} student={s} onNavigate={() => navigate(`/students/${s.studentId}#accommodations`)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StudentRow({ student, onNavigate }: { student: ComplianceRow; onNavigate: () => void }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onNavigate}
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          student.complianceRate === 100
            ? "bg-emerald-100 text-emerald-700"
            : student.complianceRate >= 50
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700"
        }`}>
          {student.complianceRate}%
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{student.studentName}</p>
          <p className="text-xs text-muted-foreground">
            {student.grade ? `Grade ${student.grade} · ` : ""}
            {student.totalAccommodations} accommodations ·{" "}
            {student.verifiedCount} verified
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {student.overdueCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            {student.overdueCount} overdue
          </span>
        )}
        {student.lastVerified && (
          <span className="text-xs text-gray-400">
            Last: {timeAgo(student.lastVerified)}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
}
