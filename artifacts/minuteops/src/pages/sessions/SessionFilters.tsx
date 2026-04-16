import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

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
};

export function SessionFilters({
  search, onSearch, statusFilter, onStatusFilter, counts,
  selectedYearId, onYearChange, schoolYears, dateFrom, dateTo, onDateFrom, onDateTo,
}: Props) {
  const pills = [
    { key: "all", label: "All", count: counts.all },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "missed", label: "Missed", count: counts.missed },
    { key: "makeup", label: "Makeup", count: counts.makeup },
  ];
  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {pills.map(item => (
          <button
            key={item.key}
            aria-pressed={statusFilter === item.key}
            onClick={() => onStatusFilter(item.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              statusFilter === item.key ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
            }`}
          >{item.label} ({item.count})</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-10 h-9 text-[13px] bg-white" placeholder="Search sessions..." value={search} onChange={e => onSearch(e.target.value)} />
        </div>
        {schoolYears.length > 0 && (
          <Select value={selectedYearId} onValueChange={onYearChange}>
            <SelectTrigger className="h-9 text-[12px] bg-white w-[130px]">
              <SelectValue placeholder="School Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {[...schoolYears].reverse().map(y => (
                <SelectItem key={y.id} value={String(y.id)}>{y.label}{y.isActive ? " (Active)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1.5">
          <Input type="date" className="h-9 text-[12px] bg-white w-[140px]" value={dateFrom} onChange={e => onDateFrom(e.target.value)} />
          <span className="text-[11px] text-gray-400">to</span>
          <Input type="date" className="h-9 text-[12px] bg-white w-[140px]" value={dateTo} onChange={e => onDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { onDateFrom(""); onDateTo(""); }} className="text-[11px] text-gray-400 hover:text-gray-600 px-1.5">Clear</button>
          )}
        </div>
      </div>
    </>
  );
}
