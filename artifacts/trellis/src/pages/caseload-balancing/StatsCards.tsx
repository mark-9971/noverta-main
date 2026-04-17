import { Card, CardContent } from "@/components/ui/card";
import { Users, AlertTriangle, TrendingUp, CheckCircle } from "lucide-react";

interface Props {
  totals: { totalProviders: number; overloaded: number; approaching: number; balanced: number };
}

export function StatsCards({ totals }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Providers</p>
              <p className="text-2xl font-bold mt-1">{totals.totalProviders}</p>
            </div>
            <Users className="w-8 h-8 text-gray-300" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-red-200 bg-red-50/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-red-600 uppercase tracking-wide">Overloaded</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{totals.overloaded}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-300" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-600 uppercase tracking-wide">Approaching</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{totals.approaching}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-amber-300" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-600 uppercase tracking-wide">Balanced</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{totals.balanced}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-300" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
