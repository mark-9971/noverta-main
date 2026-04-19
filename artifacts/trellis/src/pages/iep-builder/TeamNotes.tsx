import { useState } from "react";
import { ChevronDown, ChevronRight, MessageCircle, Send, Trash2, Loader2, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { API_BASE } from "./types";

export interface DraftComment {
  id: number;
  wizardStep: number;
  staffId: number | null;
  body: string;
  createdAt: string;
  authorName: string | null;
  resolvedAt: string | null;
  resolvedByStaffId: number | null;
  resolvedByName: string | null;
}

export function TeamNotes({
  studentId,
  wizardStep,
  comments,
  currentStaffId,
  onAdd,
  onUpdate,
  onDelete,
}: {
  studentId: number;
  wizardStep: number;
  comments: DraftComment[];
  currentStaffId: number | null;
  onAdd: (c: DraftComment) => void;
  onUpdate: (c: DraftComment) => void;
  onDelete: (id: number) => void;
}) {
  const stepComments = comments.filter(c => c.wizardStep === wizardStep);
  const openCount = stepComments.filter(c => !c.resolvedAt).length;
  const [open, setOpen] = useState(stepComments.length > 0);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  async function submit() {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const res = await authFetch(`${API_BASE}/students/${studentId}/iep-builder/draft/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wizardStep, body: text }),
      });
      if (!res.ok) {
        toast.error("Could not add note");
      } else {
        const c = (await res.json()) as DraftComment;
        onAdd(c);
        setBody("");
      }
    } catch {
      toast.error("Could not add note");
    }
    setPosting(false);
  }

  async function toggleResolved(c: DraftComment) {
    setResolvingId(c.id);
    try {
      const res = await authFetch(`${API_BASE}/students/${studentId}/iep-builder/draft/comments/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !c.resolvedAt }),
      });
      if (!res.ok) {
        toast.error("Could not update note");
      } else {
        const data = await res.json() as { resolvedAt: string | null; resolvedByStaffId: number | null; resolvedByName: string | null };
        onUpdate({ ...c, ...data });
      }
    } catch {
      toast.error("Could not update note");
    }
    setResolvingId(null);
  }

  async function remove(id: number) {
    setDeletingId(id);
    try {
      const res = await authFetch(`${API_BASE}/students/${studentId}/iep-builder/draft/comments/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete(id);
      } else if (res.status === 403) {
        toast.error("Only the author can delete this note");
      } else {
        toast.error("Could not delete note");
      }
    } catch {
      toast.error("Could not delete note");
    }
    setDeletingId(null);
  }

  return (
    <div className="mt-6 border border-gray-200 rounded-lg bg-gray-50/50" data-testid={`team-notes-step-${wizardStep}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 rounded-lg"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <MessageCircle className="w-4 h-4 text-emerald-700" />
          <span className="text-[13px] font-semibold text-gray-700">Team notes</span>
          {openCount > 0 && (
            <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5">
              {openCount}
            </span>
          )}
          {stepComments.length > openCount && (
            <span className="text-[11px] text-gray-400">
              · {stepComments.length - openCount} resolved
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-400">Cleared when the draft is submitted</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          {stepComments.length === 0 && (
            <p className="text-[12px] text-gray-400 italic">No notes for this section yet.</p>
          )}
          {stepComments.length > openCount && (
            <button
              type="button"
              onClick={() => setShowResolved(s => !s)}
              className="text-[11px] text-gray-500 hover:text-gray-700 underline"
              data-testid={`team-notes-toggle-resolved-step-${wizardStep}`}
            >
              {showResolved ? "Hide" : "Show"} {stepComments.length - openCount} resolved
            </button>
          )}
          {stepComments
            .filter(c => showResolved || !c.resolvedAt)
            .map(c => {
            const ts = new Date(c.createdAt);
            const canDelete = currentStaffId != null && c.staffId === currentStaffId;
            const isResolved = !!c.resolvedAt;
            return (
              <div
                key={c.id}
                className={`border rounded-lg p-3 ${isResolved ? "bg-gray-50 border-gray-100 opacity-70" : "bg-white border-gray-200"}`}
                data-testid={`team-note-${c.id}`}
                data-resolved={isResolved ? "true" : "false"}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-[12px] font-semibold text-gray-800">
                    {c.authorName ?? "Unknown"}
                    <span className="text-[11px] font-normal text-gray-400 ml-2">
                      {ts.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    {isResolved && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5 ml-2 align-middle">
                        Resolved{c.resolvedByName ? ` by ${c.resolvedByName}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleResolved(c)}
                      disabled={resolvingId === c.id}
                      className={`disabled:opacity-50 ${isResolved ? "text-gray-400 hover:text-gray-700" : "text-gray-300 hover:text-emerald-700"}`}
                      aria-label={isResolved ? "Reopen note" : "Resolve note"}
                      title={isResolved ? "Reopen" : "Resolve"}
                      data-testid={`team-note-resolve-${c.id}`}
                    >
                      {resolvingId === c.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : isResolved
                          ? <RotateCcw className="w-3.5 h-3.5" />
                          : <Check className="w-3.5 h-3.5" />}
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={deletingId === c.id}
                        className="text-gray-300 hover:text-red-600 disabled:opacity-50"
                        aria-label="Delete note"
                      >
                        {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
                <p className={`text-[13px] whitespace-pre-wrap ${isResolved ? "text-gray-500 line-through decoration-gray-300" : "text-gray-700"}`}>{c.body}</p>
              </div>
            );
          })}

          <div className="flex items-start gap-2 pt-1">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Add a note for the team about this section…"
              rows={2}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none bg-white"
              data-testid={`team-notes-input-step-${wizardStep}`}
            />
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={submit}
              disabled={posting || body.trim().length === 0}
              data-testid={`team-notes-submit-step-${wizardStep}`}
            >
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-1" /> Post</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
