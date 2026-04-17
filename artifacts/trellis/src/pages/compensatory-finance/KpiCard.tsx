import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function KpiCard({ icon: Icon, label, value, loading }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
