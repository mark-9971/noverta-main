import { useEffect, useState } from "react";
import { Clock, RefreshCw, Loader2 } from "lucide-react";

function formatSyncAge(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 6) return `${diffHr} hr ago`;
  return new Date(isoStr).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

interface Props {
  isoStr: string;
  className?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshLabel?: string;
  refreshTestId?: string;
}

export default function LastSyncedLabel({
  isoStr,
  className,
  onRefresh,
  isRefreshing,
  refreshLabel = "Refresh data",
  refreshTestId = "button-refresh-compliance",
}: Props) {
  const [label, setLabel] = useState(() => formatSyncAge(isoStr));

  useEffect(() => {
    setLabel(formatSyncAge(isoStr));
    const timer = setInterval(() => setLabel(formatSyncAge(isoStr)), 30_000);
    return () => clearInterval(timer);
  }, [isoStr]);

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] text-gray-400 ${className ?? "mt-1.5"}`}>
      <Clock className="w-3 h-3 flex-shrink-0" />
      Updated {label}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="ml-1 inline-flex items-center justify-center rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-label={refreshLabel}
          title={refreshLabel}
          data-testid={refreshTestId}
        >
          {isRefreshing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
        </button>
      )}
    </span>
  );
}
