import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export function MetricCard({ title, value, icon: Icon, accent = "emerald", subtitle, href, footer, delta, emptyState }: any) {
  const accents: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-500",
    amber: "bg-amber-50 text-amber-600",
  };

  const ringAccents: Record<string, string> = {
    red: "ring-1 ring-red-100",
    amber: "ring-1 ring-amber-100",
    emerald: "",
  };

  const isLoaded = value !== null && value !== undefined;
  const isEmpty = isLoaded && value === "—" && !!emptyState;

  const content = (
    <Card className={`hover:shadow-md transition-shadow cursor-pointer group border-gray-200/60 ${ringAccents[accent] ?? ""}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accents[accent] || accents.emerald}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-gray-500 font-medium">{title}</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-gray-900">
                {isLoaded ? value : <Skeleton className="w-8 h-7" />}
              </span>
              {isLoaded && !isEmpty && subtitle && (
                <span className="text-[11px] text-gray-400 leading-tight">{subtitle}</span>
              )}
            </div>
            {isEmpty && (
              <p className="text-[11px] text-gray-500 leading-tight mt-1 line-clamp-1" data-testid="metric-empty-state">
                {emptyState}
              </p>
            )}
            {isLoaded && !isEmpty && delta && <div className="mt-1">{delta}</div>}
            {isLoaded && !isEmpty && footer}
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
