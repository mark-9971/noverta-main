import { FileText } from "lucide-react";

interface Props {
  goalArea: string;
  notes: string;
  onChange: (notes: string) => void;
}

export function GoalNotesWidget({ goalArea, notes, onChange }: Props) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-gray-500" />
        <span className="text-xs font-semibold text-gray-600 uppercase">{goalArea} — Notes</span>
      </div>
      <textarea
        className="w-full h-20 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 resize-none"
        placeholder="Record observations, progress notes..."
        value={notes}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
