import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Building2, AlertTriangle, CheckCircle2, Clock, Users } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface DemoDistrict {
  id: number;
  name: string;
  demoExpiresAt: string | null;
  hasSampleData: boolean;
  createdAt: string;
  expired: boolean;
  requester: {
    name: string;
    email: string;
    role: string;
    status: string;
    provisionedAt: string | null;
  } | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "District Admin",
  provider: "Provider",
  para: "Para",
  guardian: "Guardian",
  sped_parent: "Guardian",
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function daysUntilExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days}d left`;
}

function StatusBadge({ status, expired }: { status: string | undefined; expired: boolean }) {
  if (expired) return <Badge variant="destructive">Expired</Badge>;
  if (status === "ready") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>;
  if (status === "provisioning") return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Provisioning</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "email_failed") return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Email Failed</Badge>;
  if (status === "pending") return <Badge variant="outline">Pending</Badge>;
  return <Badge variant="outline">{status ?? "Unknown"}</Badge>;
}

export default function AdminDemoDistrictsPage() {
  const { data: districts, isLoading, error } = useQuery<DemoDistrict[]>({
    queryKey: ["admin", "demo-districts"],
    queryFn: async () => {
      const resp = await authFetch(`${BASE_URL}/api/demo-districts`);
      if (!resp.ok) throw new Error("Failed to load demo districts");
      return resp.json();
    },
    refetchInterval: 15_000,
  });

  const total = districts?.length ?? 0;
  const active = districts?.filter(d => !d.expired && d.requester?.status === "ready").length ?? 0;
  const provisioning = districts?.filter(d => d.requester?.status === "provisioning").length ?? 0;
  const expired = districts?.filter(d => d.expired).length ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Demo Districts</h1>
        <p className="text-sm text-gray-500 mt-1">Active self-guided demo accounts provisioned via /demo/request</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: total, icon: Building2, color: "text-gray-700" },
          { label: "Active", value: active, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Provisioning", value: provisioning, icon: Clock, color: "text-amber-600" },
          { label: "Expired", value: expired, icon: AlertTriangle, color: "text-red-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                </div>
                <Icon className={`h-6 w-6 ${color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            All Demo Districts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          )}
          {error && (
            <p className="text-center text-sm text-red-500 py-8">Failed to load demo districts.</p>
          )}
          {!isLoading && !error && districts?.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-12">No demo districts yet. They appear here when prospects submit the /demo/request form.</p>
          )}
          {!isLoading && !error && districts && districts.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>District</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {districts.map(d => (
                  <TableRow key={d.id} className={d.expired ? "opacity-60" : ""}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{d.name}</p>
                        <p className="text-xs text-gray-400">ID {d.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {d.requester ? (
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.requester.name}</p>
                          <p className="text-xs text-gray-500">{d.requester.email}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-700">
                        {ROLE_LABELS[d.requester?.role ?? ""] ?? d.requester?.role ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.requester?.status} expired={d.expired} />
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm ${d.expired ? "text-red-500" : "text-gray-600"}`}>
                        {daysUntilExpiry(d.demoExpiresAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-500">
                        {formatRelativeTime(d.createdAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
