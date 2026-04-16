import { toast } from "sonner";

export function sanitizeCell(v: string): string {
  const s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][],
  meta?: { generatedAt?: string; preparedBy?: string | null },
) {
  const escape = (v: string) => `"${sanitizeCell(v).replace(/"/g, '""')}"`;
  const metaLines: string[] = [];
  if (meta?.generatedAt) metaLines.push(`"Generated At","${sanitizeCell(meta.generatedAt)}"`);
  if (meta?.preparedBy) metaLines.push(`"Prepared By","${sanitizeCell(meta.preparedBy)}"`);
  if (metaLines.length) metaLines.push("");
  const csv = [...metaLines, headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${rows.length} rows to ${filename}`);
}

export function formatPeriodLabel(period: string, granularity: string): string {
  if (granularity === "monthly") {
    const [y, m] = period.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(m) - 1]} ${y}`;
  }
  const d = new Date(period + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
