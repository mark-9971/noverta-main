import { AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface SystemStatusBannerProps {
  errorsLast24h: number;
}

export default function SystemStatusBanner({ errorsLast24h }: SystemStatusBannerProps) {
  if (errorsLast24h > 0) {
    return (
      <Link href="/system-status">
        <div
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 hover:bg-red-100 transition-colors cursor-pointer"
          data-testid="banner-system-errors"
        >
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-red-800">
              {errorsLast24h} system error{errorsLast24h === 1 ? "" : "s"} in the last 24 hours
            </span>
            <span className="text-xs text-red-600 ml-2">View System Status for details</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
        </div>
      </Link>
    );
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5"
      data-testid="banner-system-healthy"
    >
      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      <span className="text-sm text-gray-500">No system errors in the last 24 hours</span>
      <Link href="/system-status" className="ml-auto text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
        System Status <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
