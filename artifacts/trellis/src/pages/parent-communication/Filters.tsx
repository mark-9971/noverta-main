import { Filter, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  filterStudent: string; setFilterStudent: (v: string) => void;
  filterStartDate: string; setFilterStartDate: (v: string) => void;
  filterEndDate: string; setFilterEndDate: (v: string) => void;
  filterFollowUp: string; setFilterFollowUp: (v: string) => void;
  filterContactType: string; setFilterContactType: (v: string) => void;
  students: { id: number; firstName: string; lastName: string }[];
}

export function Filters({
  showFilters, setShowFilters,
  filterStudent, setFilterStudent,
  filterStartDate, setFilterStartDate,
  filterEndDate, setFilterEndDate,
  filterFollowUp, setFilterFollowUp,
  filterContactType, setFilterContactType,
  students,
}: Props) {
  const hasFilters = filterStudent || filterStartDate || filterEndDate || filterFollowUp || filterContactType;
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Filter className="w-3.5 h-3.5" /> Filters
          {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {hasFilters && (
          <button
            onClick={() => { setFilterStudent(""); setFilterStartDate(""); setFilterEndDate(""); setFilterFollowUp(""); setFilterContactType(""); }}
            className="text-xs text-emerald-600 hover:text-emerald-700"
          >
            Clear all
          </button>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50 rounded-xl">
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Student</label>
            <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white">
              <option value="">All Students</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Start Date</label>
            <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">End Date</label>
            <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Follow-up</label>
            <select value={filterFollowUp} onChange={e => setFilterFollowUp(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Type</label>
            <select value={filterContactType} onChange={e => setFilterContactType(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white">
              <option value="">All Types</option>
              <option value="progress_update">Progress Update</option>
              <option value="missed_service_notification">Missed Service</option>
              <option value="iep_meeting">IEP Meeting</option>
              <option value="general">General</option>
              <option value="concern">Concern</option>
            </select>
          </div>
        </div>
      )}
    </>
  );
}
