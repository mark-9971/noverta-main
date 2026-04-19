// Lightweight in-memory ring buffer of recent console errors and unhandled
// rejections. Installed once at app boot; the pilot feedback widget reads
// the buffer when a user submits so the assigned account manager can see
// what was failing in the browser at the moment of report.
//
// We deliberately don't ship these errors anywhere automatically — only when
// the user explicitly hits the feedback button. This avoids surprising users
// with silent telemetry and keeps the buffer small (last 25 entries).
//
// Stack traces and message bodies are truncated to keep submissions under
// the 2 MB POST cap that the API enforces.

const MAX_ENTRIES = 25;
const MAX_MESSAGE_LEN = 1500;

export interface ConsoleErrorEntry {
  at: string;
  message: string;
}

const buffer: ConsoleErrorEntry[] = [];

function pushEntry(message: string): void {
  const trimmed = message.length > MAX_MESSAGE_LEN
    ? `${message.slice(0, MAX_MESSAGE_LEN)}…`
    : message;
  buffer.push({ at: new Date().toISOString(), message: trimmed });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack ?? `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

let installed = false;

export function installConsoleErrorTracker(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      pushEntry(args.map(formatArg).join(" "));
    } catch {
      // Never let the tracker break the app's logging.
    }
    originalError(...args);
  };

  window.addEventListener("error", (event) => {
    const msg = event.error instanceof Error
      ? (event.error.stack ?? `${event.error.name}: ${event.error.message}`)
      : (event.message || "window error");
    pushEntry(`[window.error] ${msg}`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error
      ? (reason.stack ?? `${reason.name}: ${reason.message}`)
      : formatArg(reason);
    pushEntry(`[unhandledrejection] ${msg}`);
  });
}

export function getRecentConsoleErrors(): ConsoleErrorEntry[] {
  return buffer.slice();
}

export function clearConsoleErrors(): void {
  buffer.length = 0;
}
