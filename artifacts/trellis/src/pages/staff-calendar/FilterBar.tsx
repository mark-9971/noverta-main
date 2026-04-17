import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffOption, SchoolOption, ServiceTypeOption } from "./types";

interface Props {
  staffList: StaffOption[];
  schoolList: SchoolOption[];
  serviceTypeList: ServiceTypeOption[];
  filterStaff: string; setFilterStaff: (v: string) => void;
  filterSchool: string; setFilterSchool: (v: string) => void;
  filterServiceType: string; setFilterServiceType: (v: string) => void;
}

export function FilterBar({
  staffList, schoolList, serviceTypeList,
  filterStaff, setFilterStaff,
  filterSchool, setFilterSchool,
  filterServiceType, setFilterServiceType,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Filter className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-500">Filters:</span>
      </div>
      <Select value={filterStaff} onValueChange={setFilterStaff}>
        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="All Staff" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Staff</SelectItem>
          {staffList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterSchool} onValueChange={setFilterSchool}>
        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="All Schools" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Schools</SelectItem>
          {schoolList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filterServiceType} onValueChange={setFilterServiceType}>
        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="All Service Types" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Service Types</SelectItem>
          {serviceTypeList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {(filterStaff !== "all" || filterSchool !== "all" || filterServiceType !== "all") && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-500" onClick={() => { setFilterStaff("all"); setFilterSchool("all"); setFilterServiceType("all"); }}>
          <X className="w-3 h-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
