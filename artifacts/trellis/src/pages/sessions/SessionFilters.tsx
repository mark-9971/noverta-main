import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, SlidersHorizontal } from "lucide-react";

type Option = { id: number | string; label: string };

type Props = {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  counts: { all: number; completed: number; missed: number; makeup: number };
  selectedYearId: string;
  onYearChange: (v: string) => void;
  schoolYears: any[];
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  providers: Option[];
  selectedProviderId: string;
  onProviderChange: (v: string) => void;
  students: Option[];
  selectedStudentId: string;
  onStudentChange: (v: string) => void;
  serviceTypes: Option[];
  selectedServiceTypeId: string;
  onServiceTypeChange: (v: string) => void;
  missedReasons: Option[];
  selectedMissedReasonId: string;
  onMissedReasonChange: (v: string) => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
  /**
   * When true, the "All providers" select and any "or staff" hint in the
   * search placeholder are hidden. Used for hands-on roles whose data is
   * already pinned to themselves and should not see a global staff picker.
   */
  hideProviderFilter?: boolean;
};

export function SessionFilters({
  search, onSearch, statusFilter, onStatusFilter, counts,
  selectedYearId, onYearChange, schoolYears, dateFrom, dateTo, onDateFrom, onDateTo,
  providers, selectedProviderId, onProviderChange,
  students, selectedStudentId, onStudentChange,
  serviceTypes, selectedServiceTypeId, onServiceTypeChange,
  missedReasons, selectedMissedReasonId, onMissedReasonChange,
  onResetFilters, hasActiveFilters, hideProviderFilter = false,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActiveCount = [
    !hideProviderFilter && selectedProviderId !== "all",
    selectedStudentId !== "all",
    selectedServiceTypeId !== "all",
    selectedMissedReasonId !== "all",
  ].filter(Boolean).length;

  const pills = [
    { key: "all", label: "All", count: counts.all },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "missed", label: "Missed", count: counts.missed },
    { key: "makeup", label: "Makeup", count: counts.makeup },
  ];

  return (
    <>
      {/* Row 1: Status pills */}
      <div className="flex gap-2 flex-wrap">
        {pills.map(item => (
          <button
            key={item.key}
            aria-pressed={statusFilter === item.key}
            onClick={() => onStatusFilter(item.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              statusFilter === item.key
                ? "bg-gray-800 text-white"
                : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
            }`}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </div>

      {/* Row 2: Search + date range + More filters button */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-10 h-9 text-[13px] bg-white"
            placeholder={hideProviderFilter ? "Search by student or service…" : "Search by student, service or staff…"}
            value={search}
            onChange={e => onSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="h-9 text-[12px] bg-white w-[140px]"
            value={dateFrom}
            onChange={e => onDateFrom(e.target.value)}
          />
          <span className="text-[11px] text-gray-400">to</span>
          <Input
            type="date"
            className="h-9 text-[12px] bg-white w-[140px]"
            value={dateTo}
            onChange={e => onDateTo(e.target.value)}
          />
        </div>

        <button
          onClick={() => setMoreOpen(o => !o)}
          className={`h-9 px-3 flex items-center gap-1.5 rounded-md border text-[12px] font-medium transition-colors ${
            moreOpen || moreActiveCount > 0
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {moreActiveCount > 0 && (
            <span className="ml-0.5 w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center">
              {moreActiveCount}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md border border-gray-200 bg-white hover:border-gray-300"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Row 3: Secondary filters (hidden by default) */}
      {moreOpen && (
        <div className="flex flex-wrap gap-2 items-center p-3 rounded-xl border border-gray-100 bg-gray-50/60">
          {schoolYears.length > 0 && (
            <Select value={selectedYearId} onValueChange={onYearChange}>
              <SelectTrigger className="h-9 text-[12px] bg-white w-[130px]">
                <SelectValue placeholder="School Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {[...schoolYears].reverse().map(y => (
                  <SelectItem key={y.id} value={String(y.id)}>
                    {y.label}{y.isActive ? " (Active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {!hideProviderFilter && (
            <Select value={selectedProviderId} onValueChange={onProviderChange}>
              <SelectTrigger className="h-9 text-[12px] bg-white w-[180px]">
                <SelectValue placeholder="All providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providers.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedStudentId} onValueChange={onStudentChange}>
            <SelectTrigger className="h-9 text-[12px] bg-white w-[180px]">
              <SelectValue placeholder="All students" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="all">All students</SelectItem>
              {students.map(s => (
                <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedServiceTypeId} onValueChange={onServiceTypeChange}>
            <SelectTrigger className="h-9 text-[12px] bg-white w-[170px]">
              <SelectValue placeholder="All service types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All service types</SelectItem>
              {serviceTypes.map(t => (
                <SelectItem key={t.id} value={String(t.id)}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMissedReasonId} onValueChange={onMissedReasonChange}>
            <SelectTrigger className="h-9 text-[12px] bg-white w-[170px]">
              <SelectValue placeholder="Any missed reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any missed reason</SelectItem>
              {missedReasons.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
