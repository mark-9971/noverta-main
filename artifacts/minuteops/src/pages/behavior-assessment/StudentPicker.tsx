import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";
import type { Student } from "./types";

export function StudentPicker({ students, search, onSearch, onSelect }: {
  students: Student[]; search: string; onSearch: (s: string) => void; onSelect: (s: Student) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Select a Student</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Search students..."
            value={search} onChange={e => onSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
          {students.slice(0, 50).map(s => (
            <button key={s.id} onClick={() => onSelect(s)}
              className="flex items-center gap-2.5 p-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition text-left"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-xs">
                {s.firstName[0]}{s.lastName[0]}
              </div>
              <span className="text-sm font-medium text-gray-900">{s.firstName} {s.lastName}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
