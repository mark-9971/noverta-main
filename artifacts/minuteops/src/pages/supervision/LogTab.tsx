import { Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ClipboardCheck } from "lucide-react";
import { TYPE_LABELS } from "./types";
import type { SupervisionSession, StaffOption } from "./types";

export function LogTab({
  sessions,
  bcbas,
  superviseeStaff,
  filterSupervisor,
  setFilterSupervisor,
  filterSupervisee,
  setFilterSupervisee,
  filterType,
  setFilterType,
  isAdminOrTeacher,
  expandedId,
  setExpandedId,
  onEdit,
  onDelete,
}: {
  sessions: SupervisionSession[];
  bcbas: StaffOption[];
  superviseeStaff: StaffOption[];
  filterSupervisor: string;
  setFilterSupervisor: (v: string) => void;
  filterSupervisee: string;
  setFilterSupervisee: (v: string) => void;
  filterType: string;
  setFilterType: (v: string) => void;
  isAdminOrTeacher: boolean;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  onEdit: (s: SupervisionSession) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <Label className="text-[11px] text-gray-400">Supervisor</Label>
          <select
            value={filterSupervisor}
            onChange={e => setFilterSupervisor(e.target.value)}
            className="block mt-0.5 px-2 py-1.5 border rounded text-sm bg-white min-w-[160px]"
          >
            <option value="">All Supervisors</option>
            {bcbas.map(s => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[11px] text-gray-400">Supervisee</Label>
          <select
            value={filterSupervisee}
            onChange={e => setFilterSupervisee(e.target.value)}
            className="block mt-0.5 px-2 py-1.5 border rounded text-sm bg-white min-w-[160px]"
          >
            <option value="">All Supervisees</option>
            {superviseeStaff.map(s => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[11px] text-gray-400">Type</Label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="block mt-0.5 px-2 py-1.5 border rounded text-sm bg-white min-w-[140px]"
          >
            <option value="">All Types</option>
            <option value="individual">Individual</option>
            <option value="group">Group</option>
            <option value="direct_observation">Direct Observation</option>
          </select>
        </div>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No supervision sessions found</p>
            <p className="text-xs mt-1">Click "Log Session" to record your first supervision</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Date</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Supervisor</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Supervisee</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Type</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Duration</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                {isAdminOrTeacher && <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <Fragment key={s.id}>
                  <tr
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  >
                    <td className="px-4 py-2.5 text-gray-700">{s.sessionDate}</td>
                    <td className="px-4 py-2.5 text-gray-700">{s.supervisorName}</td>
                    <td className="px-4 py-2.5 text-gray-700">{s.superviseeName}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                        {TYPE_LABELS[s.supervisionType] || s.supervisionType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{s.durationMinutes} min</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        s.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                        s.status === "scheduled" ? "bg-gray-100 text-gray-600" :
                        "bg-red-100 text-red-600"
                      }`}>{s.status}</span>
                    </td>
                    {isAdminOrTeacher && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => onEdit(s)}
                            className="text-gray-400 hover:text-emerald-600 text-[11px] px-2 py-1"
                          >Edit</button>
                          <button
                            onClick={() => onDelete(s.id)}
                            className="text-gray-400 hover:text-red-600 text-[11px] px-2 py-1"
                          >Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {expandedId === s.id && (
                    <tr key={`${s.id}-detail`} className="bg-gray-50/50">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
                          {s.topics && (
                            <div>
                              <p className="font-semibold text-gray-500 mb-1">Topics Covered</p>
                              <p className="text-gray-700 whitespace-pre-wrap">{s.topics}</p>
                            </div>
                          )}
                          {s.feedbackNotes && (
                            <div>
                              <p className="font-semibold text-gray-500 mb-1">Feedback Notes</p>
                              <p className="text-gray-700 whitespace-pre-wrap">{s.feedbackNotes}</p>
                            </div>
                          )}
                          {!s.topics && !s.feedbackNotes && (
                            <p className="text-gray-400 italic">No additional details recorded</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
