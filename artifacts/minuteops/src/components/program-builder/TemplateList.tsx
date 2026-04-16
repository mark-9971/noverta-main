import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Lock, Layers } from "lucide-react";
import { ProgramTemplate, PROGRAM_TYPE_LABELS } from "./template-types";

interface TemplateListProps {
  templates: ProgramTemplate[];
  loading: boolean;
  cloning: number | null;
  hasPremiumTemplates: boolean;
  requiredTierLabel: string;
  onSelect: (t: ProgramTemplate) => void;
  onClone: (t: ProgramTemplate) => void;
}

export function TemplateList({
  templates, loading, cloning, hasPremiumTemplates, requiredTierLabel, onSelect, onClone,
}: TemplateListProps) {
  if (loading) {
    return <div className="py-12 text-center text-gray-400 text-sm">Loading templates...</div>;
  }
  if (templates.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm font-medium">No templates found</p>
        <p className="text-xs mt-1">Try adjusting your filters or create a new template</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {templates.map(t => (
        <Card key={t.id} className="hover:shadow-md transition-all cursor-pointer group relative"
          onClick={() => onSelect(t)}>
          <CardContent className="p-3.5 md:p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-semibold text-gray-700 truncate">{t.name}</p>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {t.domain || t.category} · {PROGRAM_TYPE_LABELS[t.programType] ?? t.programType}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {t.isGlobal ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Global</span>
                ) : t.schoolId ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">School</span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Custom</span>
                )}
              </div>
            </div>

            {t.description && <p className="text-[11px] text-gray-500 mb-2 line-clamp-2">{t.description}</p>}

            <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-3 flex-wrap">
              {(t.steps as any[])?.length > 0 && <span>{(t.steps as any[]).length} steps</span>}
              <span>Mastery: {t.defaultMasteryPercent}%</span>
              {t.usageCount > 0 && <span>{t.usageCount} uses</span>}
            </div>

            {(t.tags as string[])?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {(t.tags as string[]).slice(0, 3).map(tag => (
                  <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{tag}</span>
                ))}
              </div>
            )}

            <div className="flex gap-1.5">
              {t.tier === "premium" && !hasPremiumTemplates ? (
                <Button size="sm" className="flex-1 h-8 text-[11px] bg-gray-100 text-gray-500 cursor-not-allowed" disabled>
                  <Lock className="w-3 h-3 mr-1" />
                  {requiredTierLabel} Required
                </Button>
              ) : (
                <Button size="sm" className="flex-1 h-8 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white"
                  onClick={e => { e.stopPropagation(); onClone(t); }} disabled={cloning === t.id}>
                  <Copy className="w-3 h-3 mr-1" />
                  {cloning === t.id ? "Applying..." : "Apply to Student"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
