import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Search, Globe, Building2, User, Layers, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  listProgramTemplates, cloneTemplateToStudent, duplicateProgramTemplate,
  deleteProgramTemplate,
} from "@workspace/api-client-react";
import { useFeatureAccess } from "@/lib/tier-context";
import { ProgramTemplate } from "./template-types";
import { TemplateList } from "./TemplateList";
import { TemplatePreview } from "./TemplatePreview";
import { TemplateEditor } from "./TemplateEditor";
import { BulkAssignModal } from "./BulkAssignModal";

interface TemplateManagerProps {
  studentId: number;
  onCloned: () => void;
  onTemplateUpdated: () => void;
}

export default function TemplateManager({ studentId, onCloned, onTemplateUpdated }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "school" | "custom">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState<ProgramTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ProgramTemplate | null>(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [bulkAssignTarget, setBulkAssignTarget] = useState<ProgramTemplate | null>(null);
  const [cloning, setCloning] = useState<number | null>(null);
  const { accessible: hasPremiumTemplates, requiredTierLabel } = useFeatureAccess("clinical.premium_templates");

  const loadTemplates = useCallback(async () => {
    try {
      const data = await listProgramTemplates({
        search: search || undefined,
        scope: scopeFilter !== "all" ? scopeFilter : undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
      } as any);
      setTemplates(data as any);
    } catch {
      toast.error("Failed to load templates");
    }
    setLoading(false);
  }, [search, scopeFilter, categoryFilter]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  async function cloneToStudent(template: ProgramTemplate) {
    setCloning(template.id);
    try {
      await cloneTemplateToStudent(template.id, { studentId });
      toast.success(`"${template.name}" applied to student`);
      onCloned();
    } catch { toast.error("Network error"); }
    setCloning(null);
  }

  async function duplicateTemplate(id: number) {
    try {
      await duplicateProgramTemplate(id);
      toast.success("Template duplicated");
      loadTemplates();
      onTemplateUpdated();
    } catch { toast.error("Failed to duplicate template"); }
  }

  async function deleteTemplate(id: number) {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    try {
      await deleteProgramTemplate(id);
      toast.success("Template deleted");
      setSelectedTemplate(null);
      loadTemplates();
      onTemplateUpdated();
    } catch { toast.error("Failed to delete template"); }
  }

  const scopeButtons = [
    { key: "all" as const, label: "All", icon: Layers },
    { key: "global" as const, label: "Global", icon: Globe },
    { key: "school" as const, label: "School", icon: Building2 },
    { key: "custom" as const, label: "Custom", icon: User },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-600">Template Library</h3>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
          onClick={() => setShowCreateTemplate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Create Template
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..."
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {scopeButtons.map(s => (
            <button key={s.key} onClick={() => setScopeFilter(s.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                scopeFilter === s.key ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-600"
              }`}>
              <s.icon className="w-3 h-3" /> {s.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {["all", "academic", "behavior"].map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all capitalize ${
                categoryFilter === c ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-600"
              }`}>{c}</button>
          ))}
        </div>

        {!hasPremiumTemplates && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-lg text-[11px] font-medium text-amber-700">
            <Lock className="w-3 h-3" />
            Premium templates require {requiredTierLabel}
          </div>
        )}
      </div>

      <TemplateList
        templates={templates}
        loading={loading}
        cloning={cloning}
        hasPremiumTemplates={hasPremiumTemplates}
        requiredTierLabel={requiredTierLabel}
        onSelect={setSelectedTemplate}
        onClone={cloneToStudent}
      />

      {selectedTemplate && (
        <TemplatePreview
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onClone={() => { cloneToStudent(selectedTemplate); setSelectedTemplate(null); }}
          onEdit={() => { setEditingTemplate(selectedTemplate); setSelectedTemplate(null); }}
          onDuplicate={() => { duplicateTemplate(selectedTemplate.id); setSelectedTemplate(null); }}
          onDelete={() => { deleteTemplate(selectedTemplate.id); }}
          onBulkAssign={() => { setBulkAssignTarget(selectedTemplate); setSelectedTemplate(null); }}
          cloning={cloning === selectedTemplate.id}
        />
      )}

      {bulkAssignTarget && (
        <BulkAssignModal
          template={bulkAssignTarget}
          onClose={() => setBulkAssignTarget(null)}
          onAssigned={() => { loadTemplates(); onTemplateUpdated(); }}
        />
      )}

      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => { setEditingTemplate(null); loadTemplates(); onTemplateUpdated(); }}
        />
      )}

      {showCreateTemplate && (
        <TemplateEditor
          template={null}
          onClose={() => setShowCreateTemplate(false)}
          onSaved={() => { setShowCreateTemplate(false); loadTemplates(); onTemplateUpdated(); }}
        />
      )}
    </div>
  );
}
