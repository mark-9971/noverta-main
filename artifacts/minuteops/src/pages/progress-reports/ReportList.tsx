import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Plus, ChevronDown, Users, Search } from "lucide-react";
import { ProgressReport, STATUS_CONFIG, formatDate } from "./types";

interface Props {
  reports: ProgressReport[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  onOpenDetail: (id: number) => void;
  onOpenGenerate: () => void;
  onOpenBatch: () => void;
}

export function ReportList({
  reports, loading, searchQuery, setSearchQuery, filterStatus, setFilterStatus,
  onOpenDetail, onOpenGenerate, onOpenBatch,
}: Props) {
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Progress Reports</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">Generate, review, and finalize IEP progress reports per 603 CMR 28.07(8)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onOpenBatch}>
            <Users className="w-4 h-4 mr-1.5" /> Batch Generate
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onOpenGenerate}>
            <Plus className="w-4 h-4 mr-1.5" /> New Report
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search by student, period, or school..." className="pl-9 h-9" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="review">In Review</SelectItem>
            <SelectItem value="final">Final</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No progress reports found</p>
            <p className="text-sm text-gray-400 mt-1">Generate your first report using the button above</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map(report => {
            const statusConf = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
            const StatusIcon = statusConf.icon;
            const goalCount = report.goalProgress?.length || 0;
            const masteredCount = report.goalProgress?.filter(g => g.progressRating === "mastered").length || 0;
            return (
              <Card key={report.id} className="hover:shadow-md transition-shadow cursor-pointer border-l-4"
                style={{ borderLeftColor: report.status === "final" || report.status === "sent" ? "#059669" : report.status === "review" ? "#3b82f6" : "#f59e0b" }}
                onClick={() => onOpenDetail(report.id)}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-800 truncate">{report.studentName || `Student #${report.studentId}`}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConf.bg} ${statusConf.color}`}>
                          <StatusIcon className="w-3 h-3" /> {statusConf.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{report.reportingPeriod}</span>
                        <span>{formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</span>
                        <span>{report.schoolName}</span>
                        {goalCount > 0 && <span>{masteredCount}/{goalCount} goals mastered</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <span className="text-xs">{formatDate(report.createdAt)}</span>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
