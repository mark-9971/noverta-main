import { ArrowLeft, X } from "lucide-react";

export function QuickLogHeader({ stepIdx, stepTotal, onBack, onClose }: {
  stepIdx: number;
  stepTotal: number;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
      <button
        onClick={onBack}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 flex-shrink-0"
        aria-label="Back"
      >
        <ArrowLeft className="w-5 h-5 text-gray-600" />
      </button>
      <div className="flex-1">
        <p className="text-[13px] font-semibold text-gray-800">Quick Log</p>
        <div className="flex gap-1 mt-0.5">
          {Array.from({ length: stepTotal }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 transition-colors ${i < stepIdx ? "bg-emerald-500" : "bg-gray-200"}`}
            />
          ))}
        </div>
      </div>
      <button
        onClick={onClose}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 flex-shrink-0"
        aria-label="Close"
      >
        <X className="w-5 h-5 text-gray-500" />
      </button>
    </div>
  );
}
