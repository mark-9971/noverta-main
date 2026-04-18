import * as Sentry from "@sentry/react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

function ErrorFallback({
  error,
  fallbackTitle,
  resetError,
}: {
  error: Error | null;
  fallbackTitle?: string;
  resetError: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            {fallbackTitle || "Something went wrong"}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            This section encountered an error. The rest of the app is unaffected.
          </p>
        </div>
        {process.env.NODE_ENV !== "production" && error && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-left">
            <p className="text-xs font-mono text-red-600 break-all">
              {error.message}
            </p>
          </div>
        )}
        <button
          onClick={resetError}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}

export function ErrorBoundary({ children, fallbackTitle }: Props) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <ErrorFallback
          error={error instanceof Error ? error : null}
          fallbackTitle={fallbackTitle}
          resetError={resetError}
        />
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
