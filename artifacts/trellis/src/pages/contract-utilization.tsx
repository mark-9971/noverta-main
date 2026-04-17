import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  AlertTriangle,
  Clock,
  Building2,
  Calendar,
  TrendingUp,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface UtilizationRow {
  id: number;
  agencyId: number;
  agencyName: string;
  serviceTypeId: number;
  serviceTypeName: string | null;
  serviceTypeCategory: string | null;
  contractedHours: string;
  hourlyRate: string | null;
  startDate: string;
  endDate: string;
  alertThresholdPct: number;
  status: string;
  consumedHours: number;
  remainingHours: number;
  utilizationPct: number;
  daysUntilEnd: number;
  isExpiringSoon: boolean;
  isOverThreshold: boolean;
  staffCount: number;
}

interface ContractAlert {
  contractId: number;
  agencyName: string;
  serviceTypeName: string | null;
  alertType: "threshold" | "renewal";
  message: string;
  severity: "warning" | "critical";
  utilizationPct?: number;
  daysUntilEnd?: number;
}

function utilizationColor(pct: number, threshold: number): string {
  if (pct >= 95) return "text-red-600";
  if (pct >= threshold) return "text-amber-600";
  if (pct >= 50) return "text-emerald-600";
  return "text-gray-600";
}

function progressColor(pct: number, threshold: number): string {
  if (pct >= 95) return "bg-red-500";
  if (pct >= threshold) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function ContractUtilizationPage() {
  const { data: utilization = [], isLoading } = useQuery<UtilizationRow[]>({
    queryKey: ["contractUtilization"],
    queryFn: () => customFetch("/api/contracts/utilization"),
  });

  const { data: alerts = [] } = useQuery<ContractAlert[]>({
    queryKey: ["contractAlerts"],
    queryFn: () => customFetch("/api/contracts/alerts"),
  });

  const totalContracted = utilization.reduce((s, u) => s + Number(u.contractedHours), 0);
  const totalConsumed = utilization.reduce((s, u) => s + u.consumedHours, 0);
  const activeContracts = utilization.filter((u) => u.status === "active").length;
  const atRiskContracts = utilization.filter((u) => u.isOverThreshold || u.isExpiringSoon).length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-emerald-600" />
          Contract Utilization
        </h1>
        <p className="text-gray-500 mt-1">Track consumed vs. remaining contracted hours by agency and service</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeContracts}</p>
                <p className="text-sm text-gray-500">Active Contracts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalContracted.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Total Contracted Hours</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalConsumed.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Hours Consumed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{atRiskContracts}</p>
                <p className="text-sm text-gray-500">At-Risk Contracts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Contract Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    alert.severity === "critical" ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"
                  }`}
                >
                  {alert.severity === "critical" ? (
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">
                      {alert.agencyName} — {alert.serviceTypeName || "Unknown Service"}
                    </p>
                    <p className="text-sm text-gray-600">{alert.message}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`ml-auto shrink-0 ${
                      alert.alertType === "threshold" ? "border-amber-400 text-amber-700" : "border-blue-400 text-blue-700"
                    }`}
                  >
                    {alert.alertType === "threshold" ? "Hours" : "Renewal"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading utilization data...</div>
      ) : utilization.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No contracts found. Create agency contracts to start tracking utilization.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Contract Details</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Providers</TableHead>
                  <TableHead className="text-right">Contracted</TableHead>
                  <TableHead className="text-right">Consumed</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="w-[200px]">Utilization</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utilization.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.agencyName}</TableCell>
                    <TableCell>
                      <div>
                        <span>{row.serviceTypeName || "—"}</span>
                        {row.serviceTypeCategory && (
                          <Badge variant="outline" className="ml-2 text-xs">{row.serviceTypeCategory}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {row.startDate} — {row.endDate}
                      </div>
                      {row.daysUntilEnd > 0 ? (
                        <span className={`text-xs ${row.isExpiringSoon ? "text-amber-600 font-medium" : "text-gray-400"}`}>
                          {row.daysUntilEnd}d remaining
                        </span>
                      ) : (
                        <span className="text-xs text-red-500 font-medium">Expired</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{row.staffCount}</TableCell>
                    <TableCell className="text-right font-mono">{Number(row.contractedHours).toLocaleString()}h</TableCell>
                    <TableCell className="text-right font-mono">{row.consumedHours.toLocaleString()}h</TableCell>
                    <TableCell className="text-right font-mono">{row.remainingHours.toLocaleString()}h</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className={`font-bold ${utilizationColor(row.utilizationPct, row.alertThresholdPct)}`}>
                            {row.utilizationPct}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${progressColor(row.utilizationPct, row.alertThresholdPct)}`}
                            style={{ width: `${Math.min(row.utilizationPct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant={row.status === "active" ? "default" : "secondary"}
                          className={row.status === "active" ? "bg-emerald-100 text-emerald-800" : ""}
                        >
                          {row.status}
                        </Badge>
                        {row.isOverThreshold && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                            Over threshold
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
