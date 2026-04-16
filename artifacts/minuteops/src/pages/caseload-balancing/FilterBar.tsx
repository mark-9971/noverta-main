import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS } from "./types";

interface Props {
  searchQuery: string; setSearchQuery: (v: string) => void;
  filterRole: string; setFilterRole: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  availableRoles: string[];
}

export function FilterBar({ searchQuery, setSearchQuery, filterRole, setFilterRole, filterStatus, setFilterStatus, availableRoles }: Props) {
  return (
    <div className="flex flex-wrap gap-3 print:hidden">
      <div className="flex-1 min-w-[200px]">
        <Input
          placeholder="Search providers or schools..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>
      <Select value={filterRole} onValueChange={setFilterRole}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Roles" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Roles</SelectItem>
          {availableRoles.map(r => (
            <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filterStatus} onValueChange={setFilterStatus}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="overloaded">Overloaded</SelectItem>
          <SelectItem value="approaching">Approaching</SelectItem>
          <SelectItem value="balanced">Balanced</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
