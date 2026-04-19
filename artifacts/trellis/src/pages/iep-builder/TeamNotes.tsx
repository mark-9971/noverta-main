import { useState } from "react";
import { ChevronDown, ChevronRight, MessageCircle, Send, Trash2, Loader2 } from "lucide-react";
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
}

export function TeamNotes({
  studentId,
  wizardStep,
  comments,
  currentStaffId,
  onAdd,
  onDelete,
}: {
  studentId: number;
  wizardStep: number;
  comments: DraftComment[];
  currentStaffId: number | null;
  onAdd: (c: DraftComment) => void;
  onDelete: (id: number) => void;
}) {
  const stepComments = comments.filter(c => c.wizardStep === wizardStep);
  const [open, setOpen] = useState(stepComments.length > 0);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
          {stepComments.length > 0 && (
            <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5">
              {stepComments.length}
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
          {stepComments.map(c => {
            const ts = new Date(c.createdAt);
            const canDelete = currentStaffId != null && c.staffId === currentStaffId;
            return (
              <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-3" data-testid={`team-note-${c.id}`}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="text-[12px] font-semibold text-gray-800">
                    {c.authorName ?? "Unknown"}
                    <span className="text-[11px] font-normal text-gray-400 ml-2">
                      {ts.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
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
                <p className="text-[13px] text-gray-700 whitespace-pre-wrap">{c.body}</p>
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
