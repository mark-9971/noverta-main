import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Building2, TrendingUp, UserCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from "recharts";
import { CHART_COLORS, formatDollars, formatMinutesAsHours } from "./types";
import type { OverviewData, BurndownPoint } from "./types";

export function OverviewTab({ overview, burndown, loadingBurndown }: {
  overview: OverviewData | undefined;
  burndown: BurndownPoint[] | undefined;
  loadingBurndown: boolean;
}) {
  if (!overview) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4" /> By Service Type</CardTitle></CardHeader>
          <CardContent>
            {overview.byServiceType.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No obligations by service type</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={overview.byServiceType} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatDollars(v)} />
                  <Bar dataKey="dollarsOwed" name="Owed" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="dollarsDelivered" name="Delivered" stackId="b" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> By School</CardTitle></CardHeader>
          <CardContent>
            {overview.bySchool.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No obligations by school</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={overview.bySchool} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatDollars(v)} />
                  <Bar dataKey="dollarsOwed" name="Owed" fill="#f59e0b">
                    {overview.bySchool.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Compensatory Burn-Down</CardTitle></CardHeader>
        <CardContent>
          {loadingBurndown ? (
            <Skeleton className="h-64 w-full" />
          ) : !burndown || burndown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No trend data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={burndown} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatDollars(v as number)} />
                <Legend />
                <Line type="monotone" dataKey="accruedDollars" name="Accrued" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="deliveredDollars" name="Delivered" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cumulativeOwedDollars" name="Cumulative Outstanding" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {overview.byProvider.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-4 w-4" /> By Provider</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {overview.byProvider.map((p) => (
                <div key={p.providerId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.count} obligation{p.count !== 1 ? "s" : ""} &middot; {formatMinutesAsHours(p.minutesOwed)}</p>
                  </div>
                  <p className="font-semibold text-sm">{formatDollars(p.dollarsOwed)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
