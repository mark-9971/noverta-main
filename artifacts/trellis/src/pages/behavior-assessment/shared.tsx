import { Card, CardContent } from "@/components/ui/card";
import { STATUS_CONFIG } from "./constants";
import type { BipRecord } from "./types";

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export function FunctionBadge({ func }: { func: string }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 capitalize">
      {func}
    </span>
  );
}

export function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{message}</p>
      </CardContent>
    </Card>
  );
}

export function BipSection({ title, field, value, editing, onEdit, multiline }: {
  title?: string; field: string; value: string;
  editing: Partial<BipRecord> | null; onEdit: (b: Partial<BipRecord> | null) => void;
  multiline?: boolean;
}) {
  if (editing) {
    const editVal = (editing as any)[field] ?? value;
    if (multiline) {
      return (
        <textarea value={editVal} rows={3}
          onChange={e => onEdit({ ...editing, [field]: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
      );
    }
    return (
      <input value={editVal}
        onChange={e => onEdit({ ...editing, [field]: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
    );
  }
  return (
    <div>
      {title && <p className="text-xs font-medium text-gray-500 mb-0.5">{title}</p>}
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{value || <span className="text-gray-400 italic">Not specified</span>}</p>
    </div>
  );
}
