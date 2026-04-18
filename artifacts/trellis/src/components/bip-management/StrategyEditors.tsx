/**
 * StrategyEditors — structured entry UI for the five BIP strategy sections.
 *
 * Design principles:
 *  - Each editor is a self-contained component that manages an array of typed items.
 *  - A toggle lets clinicians switch between legacy-text mode and structured mode.
 *    The two modes coexist — switching does NOT delete either layer.
 *  - Clinical vocabulary is enforced via dropdowns; free text is allowed only for
 *    descriptions and contextual notes.
 *  - Empty structured arrays are stored as null (not []) so legacy BIPs stay legacy.
 */

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, LayoutList, AlignLeft } from "lucide-react";
import {
  AntecedentStrategyItem, AntecedentStrategyCategory, ANTECEDENT_CATEGORY_LABELS,
  TeachingStrategyItem, TeachingStrategyMethod, TEACHING_METHOD_LABELS,
  ConsequenceProcedureItem, ConsequenceTriggerLevel, CONSEQUENCE_LEVEL_LABELS, CONSEQUENCE_LEVEL_COLORS,
  ReinforcementItem, ReinforcerType, ReinforcementScheduleType, REINFORCER_TYPE_LABELS, REINFORCEMENT_SCHEDULE_LABELS,
  CrisisSupportItem, CrisisPhase, CRISIS_PHASE_LABELS, CRISIS_PHASE_COLORS,
  newId,
} from "./types";

/* ─── Shared sub-components ─────────────────────────────────────────── */

function SectionToggle({ structured, onToggle }: { structured: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
      title={structured ? "Switch to plain text entry" : "Switch to structured entry"}
    >
      {structured
        ? <><AlignLeft className="w-3 h-3" /> Use plain text</>
        : <><LayoutList className="w-3 h-3" /> Structured entry</>
      }
    </button>
  );
}

function ItemCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 relative">
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 text-gray-300 hover:text-red-400 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">{children}</label>;
}

function SmallInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
    />
  );
}

function SmallSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
    >
      {children}
    </select>
  );
}

function SmallTextarea({ value, onChange, placeholder, rows = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full border border-gray-200 rounded px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white resize-y"
    />
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold border border-dashed border-emerald-300 rounded-lg px-3 py-2 hover:bg-emerald-50 transition-colors w-full justify-center"
    >
      <Plus className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function LegacyTextarea({
  label, value, onChange, placeholder
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 resize-y"
      />
    </div>
  );
}

/* ─── Section header with mode toggle ───────────────────────────────── */

function SectionHeader({
  label, structured, onToggle, count
}: { label: string; structured: boolean; onToggle: () => void; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
        {label}
        {structured && count != null && count > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold normal-case tracking-normal">
            {count} item{count !== 1 ? "s" : ""}
          </span>
        )}
      </span>
      <SectionToggle structured={structured} onToggle={onToggle} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 1. Antecedent Strategies Editor
 * ═══════════════════════════════════════════════════════════════════════ */

export function AntecedentStrategiesEditor({
  items, legacyText,
  onItemsChange, onLegacyChange,
}: {
  items: AntecedentStrategyItem[] | null;
  legacyText: string;
  onItemsChange: (v: AntecedentStrategyItem[] | null) => void;
  onLegacyChange: (v: string) => void;
}) {
  const structured = items !== null;

  function toggleMode() {
    if (structured) {
      onItemsChange(null);
    } else {
      onItemsChange([]);
    }
  }

  function addItem() {
    const next: AntecedentStrategyItem = { id: newId(), category: "environmental_modification", description: "" };
    onItemsChange([...(items ?? []), next]);
  }

  function updateItem(id: string, patch: Partial<AntecedentStrategyItem>) {
    onItemsChange((items ?? []).map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function removeItem(id: string) {
    const next = (items ?? []).filter(i => i.id !== id);
    onItemsChange(next.length === 0 ? null : next);
  }

  return (
    <div>
      <SectionHeader
        label="Prevention / Antecedent Strategies"
        structured={structured}
        onToggle={toggleMode}
        count={items?.length}
      />
      {structured ? (
        <div className="space-y-2">
          {(items ?? []).map(item => (
            <ItemCard key={item.id} onRemove={() => removeItem(item.id)}>
              <div className="grid grid-cols-2 gap-2 pr-5">
                <div>
                  <FieldLabel>Strategy Type</FieldLabel>
                  <SmallSelect value={item.category} onChange={v => updateItem(item.id, { category: v as AntecedentStrategyCategory })}>
                    {Object.entries(ANTECEDENT_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SmallSelect>
                </div>
                <div>
                  <FieldLabel>Implemented By</FieldLabel>
                  <SmallInput value={item.implementedBy ?? ""} onChange={v => updateItem(item.id, { implementedBy: v || undefined })} placeholder="e.g. Para, Teacher" />
                </div>
              </div>
              <div>
                <FieldLabel>Description</FieldLabel>
                <SmallTextarea value={item.description} onChange={v => updateItem(item.id, { description: v })} placeholder="Describe the strategy in specific, implementable terms…" />
              </div>
              <div>
                <FieldLabel>Setting / Context</FieldLabel>
                <SmallInput value={item.setting ?? ""} onChange={v => updateItem(item.id, { setting: v || undefined })} placeholder="e.g. All settings, Math class, Lunch" />
              </div>
            </ItemCard>
          ))}
          <AddButton onClick={addItem} label="Add Antecedent Strategy" />
        </div>
      ) : (
        <LegacyTextarea
          label=""
          value={legacyText}
          onChange={onLegacyChange}
          placeholder="Describe antecedent / prevention strategies…"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2. Teaching Strategies Editor
 * ═══════════════════════════════════════════════════════════════════════ */

export function TeachingStrategiesEditor({
  items, legacyText,
  onItemsChange, onLegacyChange,
}: {
  items: TeachingStrategyItem[] | null;
  legacyText: string;
  onItemsChange: (v: TeachingStrategyItem[] | null) => void;
  onLegacyChange: (v: string) => void;
}) {
  const structured = items !== null;

  function toggleMode() {
    onItemsChange(structured ? null : []);
  }

  function addItem() {
    onItemsChange([...(items ?? []), { id: newId(), skill: "", method: "direct_instruction" }]);
  }

  function updateItem(id: string, patch: Partial<TeachingStrategyItem>) {
    onItemsChange((items ?? []).map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function removeItem(id: string) {
    const next = (items ?? []).filter(i => i.id !== id);
    onItemsChange(next.length === 0 ? null : next);
  }

  return (
    <div>
      <SectionHeader
        label="Teaching / Replacement Strategies"
        structured={structured}
        onToggle={toggleMode}
        count={items?.length}
      />
      {structured ? (
        <div className="space-y-2">
          {(items ?? []).map(item => (
            <ItemCard key={item.id} onRemove={() => removeItem(item.id)}>
              <div className="grid grid-cols-2 gap-2 pr-5">
                <div>
                  <FieldLabel>Skill / Target Behavior</FieldLabel>
                  <SmallInput value={item.skill} onChange={v => updateItem(item.id, { skill: v })} placeholder="e.g. Request a break using card" />
                </div>
                <div>
                  <FieldLabel>Instructional Method</FieldLabel>
                  <SmallSelect value={item.method} onChange={v => updateItem(item.id, { method: v as TeachingStrategyMethod })}>
                    {Object.entries(TEACHING_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SmallSelect>
                </div>
              </div>
              <div>
                <FieldLabel>Replaces / Competes With</FieldLabel>
                <SmallInput value={item.replacementFor ?? ""} onChange={v => updateItem(item.id, { replacementFor: v || undefined })} placeholder="Which behavior does this replace?" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Prompting Strategy</FieldLabel>
                  <SmallInput value={item.promptingStrategy ?? ""} onChange={v => updateItem(item.id, { promptingStrategy: v || undefined })} placeholder="e.g. Least-to-most, Full physical" />
                </div>
                <div>
                  <FieldLabel>Materials / Tools</FieldLabel>
                  <SmallInput value={item.materials ?? ""} onChange={v => updateItem(item.id, { materials: v || undefined })} placeholder="e.g. Break card, AAC device" />
                </div>
              </div>
            </ItemCard>
          ))}
          <AddButton onClick={addItem} label="Add Teaching Strategy" />
        </div>
      ) : (
        <LegacyTextarea
          label=""
          value={legacyText}
          onChange={onLegacyChange}
          placeholder="Describe teaching and replacement behavior strategies…"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 3. Consequence Procedures Editor
 * ═══════════════════════════════════════════════════════════════════════ */

export function ConsequenceProceduresEditor({
  items, legacyText,
  onItemsChange, onLegacyChange,
}: {
  items: ConsequenceProcedureItem[] | null;
  legacyText: string;
  onItemsChange: (v: ConsequenceProcedureItem[] | null) => void;
  onLegacyChange: (v: string) => void;
}) {
  const structured = items !== null;

  function toggleMode() {
    onItemsChange(structured ? null : []);
  }

  function addItem() {
    onItemsChange([...(items ?? []), { id: newId(), targetBehavior: "", triggerLevel: "minor", procedure: "" }]);
  }

  function updateItem(id: string, patch: Partial<ConsequenceProcedureItem>) {
    onItemsChange((items ?? []).map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function removeItem(id: string) {
    const next = (items ?? []).filter(i => i.id !== id);
    onItemsChange(next.length === 0 ? null : next);
  }

  return (
    <div>
      <SectionHeader
        label="Consequence Procedures"
        structured={structured}
        onToggle={toggleMode}
        count={items?.length}
      />
      {structured ? (
        <div className="space-y-2">
          {(items ?? []).map(item => (
            <ItemCard key={item.id} onRemove={() => removeItem(item.id)}>
              <div className="grid grid-cols-2 gap-2 pr-5">
                <div>
                  <FieldLabel>Behavior / Trigger</FieldLabel>
                  <SmallInput value={item.targetBehavior} onChange={v => updateItem(item.id, { targetBehavior: v })} placeholder="e.g. Elopement, Physical aggression" />
                </div>
                <div>
                  <FieldLabel>Intensity Level</FieldLabel>
                  <SmallSelect value={item.triggerLevel} onChange={v => updateItem(item.id, { triggerLevel: v as ConsequenceTriggerLevel })}>
                    {Object.entries(CONSEQUENCE_LEVEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SmallSelect>
                </div>
              </div>
              <div>
                <FieldLabel>Staff Procedure (what TO do)</FieldLabel>
                <SmallTextarea value={item.procedure} onChange={v => updateItem(item.id, { procedure: v })} placeholder="Describe exactly what staff should do in response…" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Responsible Staff</FieldLabel>
                  <SmallInput value={item.responsibleStaff ?? ""} onChange={v => updateItem(item.id, { responsibleStaff: v || undefined })} placeholder="e.g. Lead teacher, Para" />
                </div>
                <div>
                  <FieldLabel>What NOT To Do (avoid)</FieldLabel>
                  <SmallInput value={item.avoidResponse ?? ""} onChange={v => updateItem(item.id, { avoidResponse: v || undefined })} placeholder="e.g. Do not argue, avoid prolonged attention" />
                </div>
              </div>
            </ItemCard>
          ))}
          <AddButton onClick={addItem} label="Add Consequence Procedure" />
        </div>
      ) : (
        <LegacyTextarea
          label=""
          value={legacyText}
          onChange={onLegacyChange}
          placeholder="Describe consequence strategies and procedures…"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 4. Reinforcement Components Editor
 * ═══════════════════════════════════════════════════════════════════════ */

export function ReinforcementEditor({
  items, legacyText,
  onItemsChange, onLegacyChange,
}: {
  items: ReinforcementItem[] | null;
  legacyText: string;
  onItemsChange: (v: ReinforcementItem[] | null) => void;
  onLegacyChange: (v: string) => void;
}) {
  const structured = items !== null;

  function toggleMode() {
    onItemsChange(structured ? null : []);
  }

  function addItem() {
    onItemsChange([...(items ?? []), { id: newId(), reinforcer: "", reinforcerType: "social", schedule: "continuous" }]);
  }

  function updateItem(id: string, patch: Partial<ReinforcementItem>) {
    onItemsChange((items ?? []).map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function removeItem(id: string) {
    const next = (items ?? []).filter(i => i.id !== id);
    onItemsChange(next.length === 0 ? null : next);
  }

  return (
    <div>
      <SectionHeader
        label="Reinforcement Components"
        structured={structured}
        onToggle={toggleMode}
        count={items?.length}
      />
      {structured ? (
        <div className="space-y-2">
          {(items ?? []).map(item => (
            <ItemCard key={item.id} onRemove={() => removeItem(item.id)}>
              <div className="grid grid-cols-2 gap-2 pr-5">
                <div>
                  <FieldLabel>Reinforcer</FieldLabel>
                  <SmallInput value={item.reinforcer} onChange={v => updateItem(item.id, { reinforcer: v })} placeholder="e.g. Verbal praise, 5-min iPad time" />
                </div>
                <div>
                  <FieldLabel>Type</FieldLabel>
                  <SmallSelect value={item.reinforcerType} onChange={v => updateItem(item.id, { reinforcerType: v as ReinforcerType })}>
                    {Object.entries(REINFORCER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SmallSelect>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Schedule</FieldLabel>
                  <SmallSelect value={item.schedule} onChange={v => updateItem(item.id, { schedule: v as ReinforcementScheduleType })}>
                    {Object.entries(REINFORCEMENT_SCHEDULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SmallSelect>
                </div>
                <div>
                  <FieldLabel>Schedule Detail</FieldLabel>
                  <SmallInput value={item.scheduleDetail ?? ""} onChange={v => updateItem(item.id, { scheduleDetail: v || undefined })} placeholder="e.g. Every 3 correct responses" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Delivered By</FieldLabel>
                  <SmallInput value={item.deliveredBy ?? ""} onChange={v => updateItem(item.id, { deliveredBy: v || undefined })} placeholder="e.g. Any staff" />
                </div>
                <div>
                  <FieldLabel>Thinning Plan</FieldLabel>
                  <SmallInput value={item.thinningPlan ?? ""} onChange={v => updateItem(item.id, { thinningPlan: v || undefined })} placeholder="e.g. Move to VR-3 after mastery" />
                </div>
              </div>
            </ItemCard>
          ))}
          <AddButton onClick={addItem} label="Add Reinforcement Component" />
        </div>
      ) : (
        <LegacyTextarea
          label=""
          value={legacyText}
          onChange={onLegacyChange}
          placeholder="Describe reinforcement schedule and components…"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 5. Crisis / Escalation Supports Editor
 * ═══════════════════════════════════════════════════════════════════════ */

export function CrisisSupportsEditor({
  items, legacyText,
  onItemsChange, onLegacyChange,
}: {
  items: CrisisSupportItem[] | null;
  legacyText: string;
  onItemsChange: (v: CrisisSupportItem[] | null) => void;
  onLegacyChange: (v: string) => void;
}) {
  const structured = items !== null;

  function toggleMode() {
    onItemsChange(structured ? null : []);
  }

  function addItem() {
    onItemsChange([...(items ?? []), { id: newId(), phase: "escalation", procedure: "" }]);
  }

  function updateItem(id: string, patch: Partial<CrisisSupportItem>) {
    onItemsChange((items ?? []).map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function removeItem(id: string) {
    const next = (items ?? []).filter(i => i.id !== id);
    onItemsChange(next.length === 0 ? null : next);
  }

  return (
    <div>
      <SectionHeader
        label="Crisis / Escalation Supports"
        structured={structured}
        onToggle={toggleMode}
        count={items?.length}
      />
      {structured ? (
        <div className="space-y-2">
          {(items ?? []).map(item => (
            <ItemCard key={item.id} onRemove={() => removeItem(item.id)}>
              <div className="grid grid-cols-2 gap-2 pr-5">
                <div>
                  <FieldLabel>Phase</FieldLabel>
                  <SmallSelect value={item.phase} onChange={v => updateItem(item.id, { phase: v as CrisisPhase })}>
                    {Object.entries(CRISIS_PHASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SmallSelect>
                </div>
                <div>
                  <FieldLabel>Staff Role</FieldLabel>
                  <SmallInput value={item.staffRole ?? ""} onChange={v => updateItem(item.id, { staffRole: v || undefined })} placeholder="e.g. Para, Lead teacher, Admin" />
                </div>
              </div>
              <div>
                <FieldLabel>Staff Procedure</FieldLabel>
                <SmallTextarea value={item.procedure} onChange={v => updateItem(item.id, { procedure: v })} placeholder="Exactly what staff should do at this phase…" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>De-escalation Tips</FieldLabel>
                  <SmallInput value={item.deescalationTips ?? ""} onChange={v => updateItem(item.id, { deescalationTips: v || undefined })} placeholder="e.g. Low voice, offer space" />
                </div>
                <div>
                  <FieldLabel>Notify / Contact</FieldLabel>
                  <SmallInput value={item.contactNotify ?? ""} onChange={v => updateItem(item.id, { contactNotify: v || undefined })} placeholder="e.g. Parent, Admin if >5 min" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`phys-${item.id}`}
                  checked={item.physicalProcedureInvolved ?? false}
                  onChange={e => updateItem(item.id, { physicalProcedureInvolved: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-red-500"
                />
                <label htmlFor={`phys-${item.id}`} className="text-[11px] text-gray-600 font-medium">
                  Physical management procedure involved — requires separate documentation
                </label>
              </div>
            </ItemCard>
          ))}
          <AddButton onClick={addItem} label="Add Crisis Support Step" />
        </div>
      ) : (
        <LegacyTextarea
          label=""
          value={legacyText}
          onChange={onLegacyChange}
          placeholder="Describe crisis plan and escalation procedures…"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Structured display components (read-only, for BipPanel view)
 * ═══════════════════════════════════════════════════════════════════════ */

function PhaseBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>{label}</span>
  );
}

export function StructuredAntecedentDisplay({ items }: { items: AntecedentStrategyItem[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-400 italic">No strategies recorded.</p>;
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="rounded-lg border border-gray-100 bg-white p-2.5">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 flex-shrink-0 mt-0.5">
              {ANTECEDENT_CATEGORY_LABELS[item.category]}
            </span>
            <p className="text-[12px] text-gray-700 leading-relaxed">{item.description}</p>
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5 ml-0">
            {item.implementedBy && <span className="text-[10px] text-gray-400">By: <span className="text-gray-600">{item.implementedBy}</span></span>}
            {item.setting && <span className="text-[10px] text-gray-400">Where: <span className="text-gray-600">{item.setting}</span></span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StructuredTeachingDisplay({ items }: { items: TeachingStrategyItem[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-400 italic">No teaching strategies recorded.</p>;
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="rounded-lg border border-gray-100 bg-white p-2.5">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 flex-shrink-0 mt-0.5">
              {TEACHING_METHOD_LABELS[item.method]}
            </span>
            <p className="text-[12px] font-semibold text-gray-800">{item.skill}</p>
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5">
            {item.replacementFor && <span className="text-[10px] text-gray-400">Replaces: <span className="text-gray-600">{item.replacementFor}</span></span>}
            {item.promptingStrategy && <span className="text-[10px] text-gray-400">Prompting: <span className="text-gray-600">{item.promptingStrategy}</span></span>}
            {item.materials && <span className="text-[10px] text-gray-400">Materials: <span className="text-gray-600">{item.materials}</span></span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StructuredConsequenceDisplay({ items }: { items: ConsequenceProcedureItem[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-400 italic">No consequence procedures recorded.</p>;
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="rounded-lg border border-gray-100 bg-white p-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CONSEQUENCE_LEVEL_COLORS[item.triggerLevel]}`}>
              {CONSEQUENCE_LEVEL_LABELS[item.triggerLevel]}
            </span>
            <span className="text-[12px] font-semibold text-gray-700">{item.targetBehavior}</span>
          </div>
          <p className="text-[12px] text-gray-700 leading-relaxed">{item.procedure}</p>
          {item.avoidResponse && (
            <p className="text-[11px] text-red-500 mt-1.5">
              <span className="font-semibold">⚠ Avoid:</span> {item.avoidResponse}
            </p>
          )}
          {item.responsibleStaff && (
            <p className="text-[10px] text-gray-400 mt-1">Responsible: <span className="text-gray-600">{item.responsibleStaff}</span></p>
          )}
        </div>
      ))}
    </div>
  );
}

export function StructuredReinforcementDisplay({ items }: { items: ReinforcementItem[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-400 italic">No reinforcement components recorded.</p>;
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="rounded-lg border border-gray-100 bg-white p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700">
              {REINFORCER_TYPE_LABELS[item.reinforcerType]}
            </span>
            <span className="text-[12px] font-semibold text-gray-800">{item.reinforcer}</span>
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5">
            <span className="text-[10px] text-gray-400">Schedule: <span className="text-gray-600">{REINFORCEMENT_SCHEDULE_LABELS[item.schedule]}{item.scheduleDetail ? ` — ${item.scheduleDetail}` : ""}</span></span>
            {item.deliveredBy && <span className="text-[10px] text-gray-400">By: <span className="text-gray-600">{item.deliveredBy}</span></span>}
          </div>
          {item.thinningPlan && (
            <p className="text-[10px] text-gray-400 mt-1">Thinning plan: <span className="text-gray-600">{item.thinningPlan}</span></p>
          )}
        </div>
      ))}
    </div>
  );
}

export function StructuredCrisisDisplay({ items }: { items: CrisisSupportItem[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-400 italic">No crisis supports recorded.</p>;
  const phaseOrder: CrisisPhase[] = ["antecedent", "escalation", "crisis", "recovery"];
  const sorted = [...items].sort((a, b) => phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase));
  return (
    <div className="space-y-2">
      {sorted.map(item => (
        <div key={item.id} className="rounded-lg border border-gray-100 bg-white p-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <PhaseBadge label={CRISIS_PHASE_LABELS[item.phase]} color={CRISIS_PHASE_COLORS[item.phase]} />
            {item.staffRole && <span className="text-[10px] text-gray-400">{item.staffRole}</span>}
            {item.physicalProcedureInvolved && (
              <span className="text-[10px] font-semibold text-red-600 px-1.5 py-0.5 rounded bg-red-50 border border-red-200">Physical procedure</span>
            )}
          </div>
          <p className="text-[12px] text-gray-700 leading-relaxed">{item.procedure}</p>
          <div className="flex flex-wrap gap-3 mt-1.5">
            {item.deescalationTips && <span className="text-[10px] text-gray-400">De-escalation: <span className="text-gray-600">{item.deescalationTips}</span></span>}
            {item.contactNotify && <span className="text-[10px] text-gray-400">Notify: <span className="text-gray-600">{item.contactNotify}</span></span>}
          </div>
        </div>
      ))}
    </div>
  );
}
