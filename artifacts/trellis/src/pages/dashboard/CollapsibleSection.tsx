import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false, onFirstOpen }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onFirstOpen?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !mounted) {
      setMounted(true);
      onFirstOpen?.();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-600 flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {mounted && (
        <div
          className="space-y-4 mt-1"
          style={open ? undefined : { display: "none" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
