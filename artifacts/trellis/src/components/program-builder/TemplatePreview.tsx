import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Copy, Edit3, Trash2, BookOpen, ChevronDown, ChevronRight, Users } from "lucide-react";
import { ProgramTemplate, PROGRAM_TYPE_LABELS, PROMPT_LABELS } from "./template-types";

interface TemplatePreviewProps {
  template: ProgramTemplate;
  onClose: () => void;
  onClone: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBulkAssign?: () => void;
  cloning: boolean;
}

export function TemplatePreview({
  template, onClose, onClone, onEdit, onDuplicate, onDelete, onBulkAssign, cloning,
}: TemplatePreviewProps) {
  const [showSteps, setShowSteps] = useState(true);
  const stepsArr = (template.steps as any[]) ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-800">{template.name}</h2>
            </div>
            <p className="text-xs text-gray-400">
              {template.domain || template.category} · {PROGRAM_TYPE_LABELS[template.programType] ?? template.programType}
              {template.isGlobal ? " · Global" : template.schoolId ? " · School" : " · Custom"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {template.description && (
            <p className="text-[13px] text-gray-600">{template.description}</p>
          )}

          {template.tutorInstructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800">
              <BookOpen className="w-4 h-4 inline mr-1.5" /> <strong>Tutor Instructions:</strong> {template.tutorInstructions}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Mastery</p>
              <p className="text-sm font-bold text-gray-600">{template.defaultMasteryPercent}% x{template.defaultMasterySessions}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Regression</p>
              <p className="text-sm font-bold text-gray-600">&lt;{template.defaultRegressionThreshold}%</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Reinforcement</p>
              <p className="text-sm font-bold text-gray-600 capitalize">{(template.defaultReinforcementSchedule || "CRF").replace(/_/g, " ")}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Uses</p>
              <p className="text-sm font-bold text-emerald-700">{template.usageCount}</p>
            </div>
          </div>

          {(template.tags as string[])?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(template.tags as string[]).map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{tag}</span>
              ))}
            </div>
          )}

          {template.promptHierarchy && (
            <div>
              <p className="text-[12px] font-semibold text-gray-500 mb-2">Prompt Hierarchy</p>
              <div className="flex flex-wrap gap-1">
                {(template.promptHierarchy as string[]).map((level, i) => (
                  <span key={level} className={`text-[10px] font-medium px-2 py-0.5 rounded ${PROMPT_LABELS[level]?.color ?? "bg-gray-100"}`}>
                    {i + 1}. {PROMPT_LABELS[level]?.label ?? level}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stepsArr.length > 0 && (
            <div>
              <button onClick={() => setShowSteps(!showSteps)} className="flex items-center gap-1 text-[12px] font-semibold text-gray-600 mb-2">
                {showSteps ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {stepsArr.length} Steps
              </button>
              {showSteps && (
                <div className="space-y-1">
                  {stepsArr.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded text-[12px]">
                      <span className="text-gray-400 font-bold w-5 text-center flex-shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-gray-700 font-medium">{s.name}</p>
                        {s.sdInstruction && <p className="text-[10px] text-gray-400 mt-0.5">SD: "{s.sdInstruction}"</p>}
                        {s.targetResponse && <p className="text-[10px] text-gray-400">R: {s.targetResponse}</p>}
                        {s.materials && <p className="text-[10px] text-gray-400">Materials: {s.materials}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={onEdit}>
                <Edit3 className="w-3 h-3 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={onDuplicate}>
                <Copy className="w-3 h-3 mr-1" /> Duplicate
              </Button>
              <Button variant="outline" size="sm" className="text-[11px] h-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onDelete}>
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            </div>
            <div className="flex gap-1.5">
              {onBulkAssign && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-8 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  onClick={onBulkAssign}
                >
                  <Users className="w-3 h-3 mr-1" /> Bulk Assign
                </Button>
              )}
              <Button size="sm" className="text-[12px] h-8 bg-emerald-700 hover:bg-emerald-800 text-white" onClick={onClone} disabled={cloning}>
                <Copy className="w-3 h-3 mr-1" /> Apply to Student
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
