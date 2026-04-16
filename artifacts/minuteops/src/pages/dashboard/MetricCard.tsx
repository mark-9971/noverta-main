import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export function MetricCard({ title, value, icon: Icon, accent = "emerald", subtitle, href }: any) {
  const accents: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-500",
    amber: "bg-amber-50 text-amber-600",
  };
  const content = (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group border-gray-200/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accents[accent] || accents.emerald}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-gray-500 font-medium">{title}</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-gray-900">{value ?? <Skeleton className="w-8 h-7" />}</span>
              {subtitle && <span className="text-[11px] text-gray-400">{subtitle}</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
