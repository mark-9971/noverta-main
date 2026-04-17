import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";

export function ErrorBanner({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Something went wrong</h3>
      <p className="text-[13px] text-gray-400 max-w-sm mb-4">{message || "We couldn't load this data. Please try again."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}
