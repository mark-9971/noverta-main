import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Loader2, Users, Search } from "lucide-react";
import { StudentOption, QUARTER_PRESETS } from "./types";

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filteredStudents: StudentOption[];
  studentSearch: string;
  setStudentSearch: (v: string) => void;
  genStudentId: string;
  setGenStudentId: (v: string) => void;
  genPreset: string;
  setGenPreset: (v: string) => void;
  genPeriodStart: string;
  setGenPeriodStart: (v: string) => void;
  genPeriodEnd: string;
  setGenPeriodEnd: (v: string) => void;
  generating: boolean;
  onGenerate: () => void;
}

export function GenerateDialog({
  open, onOpenChange, filteredStudents, studentSearch, setStudentSearch,
  genStudentId, setGenStudentId, genPreset, setGenPreset,
  genPeriodStart, setGenPeriodStart, genPeriodEnd, setGenPeriodEnd,
  generating, onGenerate,
}: GenerateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Generate Progress Report</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Student</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search students..." className="pl-9" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg">
              {filteredStudents.slice(0, 20).map(s => (
                <button key={s.id} type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors ${String(s.id) === genStudentId ? "bg-emerald-50 font-medium text-emerald-700" : ""}`}
                  onClick={() => setGenStudentId(String(s.id))}>
                  {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
                </button>
              ))}
              {filteredStudents.length === 0 && <p className="text-sm text-gray-400 p-3">No students found</p>}
            </div>
          </div>
          <div>
            <Label>Reporting Period</Label>
            <Select value={genPreset} onValueChange={setGenPreset}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUARTER_PRESETS.map(p => <SelectItem key={p.reportingPeriod} value={p.reportingPeriod}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={genPeriodStart} onChange={e => setGenPeriodStart(e.target.value)} className="mt-1" /></div>
            <div><Label>End Date</Label><Input type="date" value={genPeriodEnd} onChange={e => setGenPeriodEnd(e.target.value)} className="mt-1" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onGenerate} disabled={generating}>
            {generating ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating...</> : <><FileText className="w-4 h-4 mr-1.5" /> Generate</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BatchDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: StudentOption[];
  filteredStudents: StudentOption[];
  studentSearch: string;
  setStudentSearch: (v: string) => void;
  batchStudentIds: number[];
  setBatchStudentIds: (ids: number[] | ((prev: number[]) => number[])) => void;
  genPreset: string;
  setGenPreset: (v: string) => void;
  genPeriodStart: string;
  setGenPeriodStart: (v: string) => void;
  genPeriodEnd: string;
  setGenPeriodEnd: (v: string) => void;
  batchProgress: { total: number; succeeded: number; failed: number } | null;
  generating: boolean;
  onBatchGenerate: () => void;
}

export function BatchDialog({
  open, onOpenChange, students, filteredStudents, studentSearch, setStudentSearch,
  batchStudentIds, setBatchStudentIds, genPreset, setGenPreset,
  genPeriodStart, setGenPeriodStart, genPeriodEnd, setGenPeriodEnd,
  batchProgress, generating, onBatchGenerate,
}: BatchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Batch Generate Progress Reports</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Reporting Period</Label>
            <Select value={genPreset} onValueChange={setGenPreset}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUARTER_PRESETS.map(p => <SelectItem key={p.reportingPeriod} value={p.reportingPeriod}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={genPeriodStart} onChange={e => setGenPeriodStart(e.target.value)} className="mt-1" /></div>
            <div><Label>End Date</Label><Input type="date" value={genPeriodEnd} onChange={e => setGenPeriodEnd(e.target.value)} className="mt-1" /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Select Students ({batchStudentIds.length} selected)</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setBatchStudentIds(students.map(s => s.id))}>Select All</Button>
                <Button variant="ghost" size="sm" onClick={() => setBatchStudentIds([])}>Clear</Button>
              </div>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search students..." className="pl-9" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {filteredStudents.map(s => (
                <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={batchStudentIds.includes(s.id)}
                    onChange={e => {
                      if (e.target.checked) setBatchStudentIds(prev => [...prev, s.id]);
                      else setBatchStudentIds(prev => prev.filter(id => id !== s.id));
                    }}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
                </label>
              ))}
            </div>
          </div>
          {batchProgress && (
            <div className={`p-3 rounded-lg text-sm ${batchProgress.failed > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
              <strong>Results:</strong> {batchProgress.succeeded} generated, {batchProgress.failed} failed out of {batchProgress.total} total
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onBatchGenerate}
            disabled={generating || batchStudentIds.length === 0}>
            {generating ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating {batchStudentIds.length}...</>
              : <><Users className="w-4 h-4 mr-1.5" /> Generate {batchStudentIds.length} Reports</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
