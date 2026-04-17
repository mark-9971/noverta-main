export function BipSection({ label, content, highlight }: { label: string; content: string | null; highlight?: boolean }) {
  if (!content) return null;
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-red-50 border border-red-100" : "bg-gray-50 border border-gray-100"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${highlight ? "text-red-500" : "text-gray-500"}`}>
        {label}
      </p>
      <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">{content}</p>
    </div>
  );
}
