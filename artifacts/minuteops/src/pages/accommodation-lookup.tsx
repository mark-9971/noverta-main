import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
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
  ChevronDown,
  ChevronRight,
  BarChart3,
  Users,
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
  verificationWindowDays: number;
  students: ComplianceRow[];
}

interface AccommodationDetail {
  id: number;
  category: string;
  description: string;
  setting: string | null;
  frequency: string | null;
  provider: string | null;
  isOverdue: boolean;
  verificationCount: number;
  lastVerification: {
    status: string;
    verifierName: string | null;
    createdAt: string;
    notes: string | null;
  } | null;
}

interface AccommodationSummary {
  studentId: number;
  studentName: string | null;
  totalAccommodations: number;
  verifiedCount: number;
  overdueCount: number;
  verificationRate: number;
  accommodationsByCategory: Record<string, AccommodationDetail[]>;
}

const STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  partial: "Partial",
  not_implemented: "Not Implemented",
  not_applicable: "N/A",
};

const STATUS_COLORS: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  not_implemented: "bg-red-100 text-red-800",
  not_applicable: "bg-gray-100 text-gray-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  instruction: "Instructional",
  assessment: "Assessment / Testing",
  environment: "Environmental",
  materials: "Materials",
  behavioral: "Behavioral",
  communication: "Communication",
  other: "Other",
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
  const [, navigate] = useLocation();
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null);
  const [studentDetails, setStudentDetails] = useState<Record<number, AccommodationSummary>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    authFetch("/api/accommodation-compliance")
      .then((r: Response) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ComplianceData) => setData(d))
      .catch(() => toast.error("Failed to load accommodation compliance"))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = useCallback(async (studentId: number) => {
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null);
      return;
    }
    setExpandedStudentId(studentId);
    if (studentDetails[studentId]) return;

    setDetailLoading(studentId);
    try {
      const r = await authFetch(`/api/students/${studentId}/accommodation-summary`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: AccommodationSummary = await r.json();
      setStudentDetails(prev => ({ ...prev, [studentId]: d }));
    } catch {
      toast.error("Failed to load accommodation details");
    }
    setDetailLoading(null);
  }, [expandedStudentId, studentDetails]);

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
                    <StudentRow
                      key={s.studentId}
                      student={s}
                      expanded={expandedStudentId === s.studentId}
                      onToggle={() => toggleExpand(s.studentId)}
                      onNavigate={() => navigate(`/students/${s.studentId}#accommodations`)}
                      details={studentDetails[s.studentId]}
                      detailLoading={detailLoading === s.studentId}
                    />
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
                    <StudentRow
                      key={s.studentId}
                      student={s}
                      expanded={expandedStudentId === s.studentId}
                      onToggle={() => toggleExpand(s.studentId)}
                      onNavigate={() => navigate(`/students/${s.studentId}#accommodations`)}
                      details={studentDetails[s.studentId]}
                      detailLoading={detailLoading === s.studentId}
                    />
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

interface StudentRowProps {
  student: ComplianceRow;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  details: AccommodationSummary | undefined;
  detailLoading: boolean;
}

function StudentRow({ student, expanded, onToggle, onNavigate, details, detailLoading }: StudentRowProps) {
  return (
    <div>
      <div
        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={onToggle}
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
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 bg-gray-50/50">
          {detailLoading ? (
            <div className="animate-pulse space-y-2 py-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          ) : details ? (
            <div className="space-y-3 pt-1">
              {Object.entries(details.accommodationsByCategory).map(([cat, accommodations]) => (
                <div key={cat}>
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                    {CATEGORY_LABELS[cat] || cat}
                  </h5>
                  <div className="space-y-1.5">
                    {accommodations.map((acc: AccommodationDetail) => (
                      <div
                        key={acc.id}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          acc.isOverdue ? "border-amber-200 bg-amber-50/60" : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 text-sm">{acc.description}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {acc.setting && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{acc.setting}</span>
                              )}
                              {acc.frequency && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">{acc.frequency}</span>
                              )}
                              {acc.provider && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{acc.provider}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {acc.lastVerification ? (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[acc.lastVerification.status] || "bg-gray-100 text-gray-600"}`}>
                                {STATUS_LABELS[acc.lastVerification.status] || acc.lastVerification.status}
                                {" · "}{timeAgo(acc.lastVerification.createdAt)}
                              </span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                                Unverified
                              </span>
                            )}
                          </div>
                        </div>
                        {acc.lastVerification?.verifierName && (
                          <p className="text-xs text-gray-500 mt-1">
                            Verified by {acc.lastVerification.verifierName}
                            {acc.lastVerification.notes && <span className="italic"> — "{acc.lastVerification.notes}"</span>}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={(e) => { e.stopPropagation(); onNavigate(); }}
              >
                Open Full Detail
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-2">No details available</p>
          )}
        </div>
      )}
    </div>
  );
}
