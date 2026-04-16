import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-600 flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-4 mt-1">{children}</div>}
    </div>
  );
}
