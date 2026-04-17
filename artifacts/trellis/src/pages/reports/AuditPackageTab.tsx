import { useState } from "react";
import { getAuditPackageReport } from "@workspace/api-client-react";
import type { GetAuditPackageReportParams, AuditPackageResponse } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, FileText } from "lucide-react";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { downloadCsv } from "./utils";

export function AuditPackageTab() {
  const { filterParams } = useSchoolContext();
  const { user } = useRole();
  const [data, setData] = useState<AuditPackageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);

  function generate() {
    const params: GetAuditPackageReportParams = { startDate, endDate, preparedBy: user.name };
    if (filterParams.schoolId) params.schoolId = Number(filterParams.schoolId);
    if (filterParams.districtId) params.districtId = Number(filterParams.districtId);
    setLoading(true);
    getAuditPackageReport(params)
      .then(d => setData(d as AuditPackageResponse))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }

  function exportAuditCsv() {
    if (!data?.students) return;
    const headers = ["Student", "Grade", "School", "Service", "Required (min)", "Interval",
      "Completed Sessions", "Missed Sessions", "Makeup Sessions", "Delivered (min)", "Parent Contacts"];
    const rows: string[][] = [];
    for (const s of data.students) {
      for (const req of s.serviceRequirements) {
        rows.push([
          s.studentName, s.grade ?? "", s.school ?? "", req.serviceTypeName ?? "",
          String(req.requiredMinutes), req.intervalType,
          String(s.sessionSummary.totalCompleted), String(s.sessionSummary.totalMissed),
          String(s.sessionSummary.totalMakeup), String(s.sessionSummary.deliveredMinutes),
          String(s.parentContacts.length),
        ]);
      }
      if (s.serviceRequirements.length === 0) {
        rows.push([
          s.studentName, s.grade ?? "", s.school ?? "", "None", "0", "",
          String(s.sessionSummary.totalCompleted), String(s.sessionSummary.totalMissed),
          String(s.sessionSummary.totalMakeup), String(s.sessionSummary.deliveredMinutes),
          String(s.parentContacts.length),
        ]);
      }
    }
    const meta = { generatedAt: data.generatedAt, preparedBy: data.preparedBy };
    downloadCsv(`audit_package_${startDate}_${endDate}.csv`, headers, rows, meta);
  }

  function exportDetailedCsv() {
    if (!data?.students) return;
    const headers = ["Student", "Date", "Service", "Duration (min)", "Status", "Missed Reason", "Makeup", "Provider", "Notes"];
    const rows: string[][] = [];
    for (const s of data.students) {
      for (const sess of s.sessions) {
        rows.push([
          s.studentName, sess.date, sess.service ?? "", String(sess.duration),
          sess.status, sess.missedReason ?? "", sess.isMakeup ? "Yes" : "No", sess.provider ?? "", sess.notes ?? "",
        ]);
      }
    }
    const meta = { generatedAt: data.generatedAt, preparedBy: data.preparedBy };
    downloadCsv(`audit_sessions_detail_${startDate}_${endDate}.csv`, headers, rows, meta);
  }

  function exportParentContactsCsv() {
    if (!data?.students) return;
    const headers = ["Student", "Grade", "School", "Contact Date", "Method", "Notes"];
    const rows: string[][] = [];
    for (const s of data.students) {
      for (const c of s.parentContacts) {
        rows.push([s.studentName, s.grade ?? "", s.school ?? "", c.date, c.method ?? "", c.notes ?? ""]);
      }
      if (s.parentContacts.length === 0) {
        rows.push([s.studentName, s.grade ?? "", s.school ?? "", "", "No contacts recorded", ""]);
      }
    }
    const meta = { generatedAt: data.generatedAt, preparedBy: data.preparedBy };
    downloadCsv(`audit_parent_contacts_${startDate}_${endDate}.csv`, headers, rows, meta);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div className="pt-4">
            <Button size="sm" onClick={generate} disabled={loading} className="gap-1.5 text-[12px]"
              style={{ backgroundColor: "#059669" }}>
              {loading ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </div>
        {data?.students && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportAuditCsv}>
              <Download className="w-3.5 h-3.5" /> Summary CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportDetailedCsv}>
              <Download className="w-3.5 h-3.5" /> Detailed CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportParentContactsCsv}>
              <Download className="w-3.5 h-3.5" /> Parent Contacts CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
            </Button>
          </div>
        )}
      </div>

      {data && (
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>Generated: {new Date(data.generatedAt).toLocaleString()}</span>
          <span>Date range: {data.dateRange.start} to {data.dateRange.end}</span>
          <span>{data.students.length} students</span>
        </div>
      )}

      {data && (
        <div className="hidden print:block mb-6">
          <h2 className="text-xl font-bold text-gray-900 text-center">SPED Audit Package</h2>
          <p className="text-sm text-gray-500 text-center">
            {data.dateRange.start} — {data.dateRange.end} | {data.students.length} students
            {data.preparedBy ? ` | Prepared by ${data.preparedBy}` : ""}
            {` | Generated ${new Date(data.generatedAt).toLocaleString()}`}
          </p>
        </div>
      )}

      {data?.students && data.students.length > 0 ? (
        <Card className="border-gray-200/60">
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {data.students.map(student => (
                <div key={student.studentId} className="print:break-inside-avoid">
                  <button
                    onClick={() => setExpandedStudent(expandedStudent === student.studentId ? null : student.studentId)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left print:hidden"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                        {student.studentName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-800">{student.studentName}</span>
                        <span className="text-xs text-gray-400 ml-2">Gr. {student.grade ?? "?"}</span>
                        {student.school && <span className="text-xs text-gray-400 ml-2">{student.school}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{student.serviceRequirements.length} services</span>
                      <span className="text-emerald-600">{student.sessionSummary.totalCompleted} completed</span>
                      {student.sessionSummary.totalMissed > 0 && <span className="text-red-500">{student.sessionSummary.totalMissed} missed</span>}
                      <span>{student.sessionSummary.deliveredMinutes.toLocaleString()} min</span>
                      <span className={`transform transition-transform ${expandedStudent === student.studentId ? "rotate-180" : ""}`}>▼</span>
                    </div>
                  </button>
                  <div className="hidden print:block px-5 py-2 border-b border-gray-200">
                    <span className="text-sm font-semibold text-gray-800">{student.studentName}</span>
                    <span className="text-xs text-gray-400 ml-2">Gr. {student.grade ?? "?"}</span>
                    {student.school && <span className="text-xs text-gray-400 ml-2">{student.school}</span>}
                    <span className="text-xs text-gray-500 ml-3">{student.sessionSummary.totalCompleted} completed, {student.sessionSummary.totalMissed} missed, {student.sessionSummary.deliveredMinutes.toLocaleString()} min</span>
                  </div>
                  <div className={`px-5 pb-4 bg-gray-50/50 space-y-3 ${expandedStudent === student.studentId ? "" : "hidden print:block"}`}>
                      <div>
                        <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">Service Requirements</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {student.serviceRequirements.map((r, i) => (
                            <div key={i} className="bg-white rounded-lg border border-gray-100 p-2.5 text-xs">
                              <div className="font-medium text-gray-700">{r.serviceTypeName}</div>
                              <div className="text-gray-500 mt-0.5">{r.requiredMinutes} min/{r.intervalType} {r.provider && `· ${r.provider}`}</div>
                              <div className="text-gray-400 mt-0.5">{r.startDate} — {r.endDate ?? "ongoing"} {r.active ? "" : "(inactive)"}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {student.sessions.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">
                            Recent Sessions ({student.sessions.length})
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Date</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Service</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Duration</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Status</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Reason</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Provider</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {student.sessions.slice(-20).map((s, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1.5 text-gray-600">{s.date}</td>
                                    <td className="px-2 py-1.5 text-gray-600">{s.service}</td>
                                    <td className="px-2 py-1.5 text-gray-600">{s.duration} min</td>
                                    <td className="px-2 py-1.5">
                                      <span className={s.status === "missed" ? "text-red-500 font-medium" : s.isMakeup ? "text-emerald-600" : "text-gray-600"}>
                                        {s.status}{s.isMakeup ? " (makeup)" : ""}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1.5 text-gray-500">{s.status === "missed" ? (s.missedReason ?? "—") : "—"}</td>
                                    <td className="px-2 py-1.5 text-gray-500">{s.provider ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {student.parentContacts.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">
                            Parent Contacts ({student.parentContacts.length})
                          </h4>
                          <div className="space-y-1.5">
                            {student.parentContacts.map((c, i) => (
                              <div key={i} className="bg-white rounded-lg border border-gray-100 p-2.5 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-600 font-medium">{c.date}</span>
                                  <span className="text-gray-400">{c.method}</span>
                                  <span className="text-gray-700 font-medium">{c.subject}</span>
                                </div>
                                {c.outcome && <div className="text-gray-500 mt-0.5">Outcome: {c.outcome}</div>}
                                {c.parentName && <div className="text-gray-400 mt-0.5">Parent: {c.parentName}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : data && (
        <div className="py-12 text-center text-sm text-gray-400">No students found for the selected filters</div>
      )}

      {!data && !loading && (
        <div className="py-16 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Select a date range and click Generate Report</p>
          <p className="text-xs text-gray-400 mt-1">This report includes per-student service requirements, sessions, and parent contacts</p>
        </div>
      )}
    </div>
  );
}
