import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Pin, PinOff, Trash2, Send, Filter, ChevronDown, ChevronUp, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";

interface StaffOption {
  id: number;
  name: string;
  role: string;
}

interface Note {
  id: number;
  studentId: number;
  authorStaffId: number;
  authorName: string;
  authorRole: string;
  content: string;
  pinned: boolean;
  mentions: number[];
  parentNoteId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface StudentNotesProps {
  studentId: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  bcba: "bg-blue-100 text-blue-700",
  provider: "bg-teal-100 text-teal-700",
  para: "bg-amber-100 text-amber-700",
  coordinator: "bg-indigo-100 text-indigo-700",
  case_manager: "bg-emerald-100 text-emerald-700",
  teacher: "bg-orange-100 text-orange-700",
  sped_teacher: "bg-rose-100 text-rose-700",
};

function roleLabel(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function renderContent(content: string, staffList: StaffOption[]): React.ReactNode {
  const staffMap = new Map(staffList.map(s => [s.id, s]));
  const parts = content.split(/(@\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^@\[(\d+)\]$/);
    if (match) {
      const staffId = parseInt(match[1], 10);
      const staff = staffMap.get(staffId);
      return (
        <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-medium mx-0.5">
          @{staff ? staff.name : `Staff #${staffId}`}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function StudentNotes({ studentId }: StudentNotesProps) {
  const { role: currentRole, teacherId: currentStaffId } = useRole();
  const [notes, setNotes] = useState<Note[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filterAuthor, setFilterAuthor] = useState<string>("");
  const [filterPinned, setFilterPinned] = useState(false);
  const [mentionDropdown, setMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterAuthor) params.set("author", filterAuthor);
      if (filterPinned) params.set("pinned", "true");
      const qs = params.toString();
      const res = await authFetch(`/api/students/${studentId}/notes${qs ? `?${qs}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [studentId, filterAuthor, filterPinned]);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await authFetch(`/api/students/${studentId}/notes/staff`);
      if (res.ok) setStaffList(await res.json());
    } catch {}
  }, [studentId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);
  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  async function handleSubmit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/students/${studentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        setContent("");
        fetchNotes();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePin(noteId: number, current: boolean) {
    try {
      const res = await authFetch(`/api/students/${studentId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !current }),
      });
      if (res.ok) fetchNotes();
    } catch {}
  }

  async function deleteNote(noteId: number) {
    try {
      const res = await authFetch(`/api/students/${studentId}/notes/${noteId}`, {
        method: "DELETE",
      });
      if (res.ok) fetchNotes();
    } catch {}
  }

  function insertMention(staff: StaffOption) {
    const before = content.slice(0, cursorPos).replace(/@\S*$/, "");
    const after = content.slice(cursorPos);
    const mention = `@[${staff.id}]`;
    const newContent = before + mention + " " + after;
    setContent(newContent);
    setMentionDropdown(false);
    setMentionSearch("");
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + mention.length + 1;
        textareaRef.current.setSelectionRange(pos, pos);
        textareaRef.current.focus();
      }
    }, 0);
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    const pos = e.target.selectionStart ?? 0;
    setCursorPos(pos);
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setMentionSearch(atMatch[1].toLowerCase());
      setMentionDropdown(true);
    } else {
      setMentionDropdown(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !mentionDropdown) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      setMentionDropdown(false);
    }
  }

  const filteredStaffForMention = staffList.filter(s =>
    s.name.toLowerCase().includes(mentionSearch) ||
    s.role.toLowerCase().includes(mentionSearch)
  ).slice(0, 8);

  const hasActiveFilters = filterAuthor || filterPinned;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <CardTitle className="text-sm font-semibold text-gray-600">Team Notes</CardTitle>
            <span className="text-[10px] text-gray-400 ml-1">({notes.length})</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
                hasActiveFilters ? "text-emerald-700 bg-emerald-50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Filter className="w-3 h-3" />
              Filter
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {showFilters && (
            <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-[11px]">
              <select
                value={filterAuthor}
                onChange={e => setFilterAuthor(e.target.value)}
                className="px-2 py-1 border border-gray-200 rounded text-[11px] bg-white"
              >
                <option value="">All authors</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterPinned}
                  onChange={e => setFilterPinned(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Pinned only
              </label>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterAuthor(""); setFilterPinned(false); }}
                  className="flex items-center gap-0.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Add a note... Type @ to mention a team member"
              rows={2}
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 pr-10"
              maxLength={5000}
            />
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || submitting}
              className="absolute right-2 bottom-2 p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>

            {mentionDropdown && filteredStaffForMention.length > 0 && (
              <div className="absolute z-50 left-0 bottom-full mb-1 w-64 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                {filteredStaffForMention.map(s => (
                  <button
                    key={s.id}
                    onClick={() => insertMention(s)}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center gap-2 text-[11px]"
                  >
                    <span className="font-medium text-gray-700">{s.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${ROLE_COLORS[s.role] || "bg-gray-100 text-gray-600"}`}>
                      {roleLabel(s.role)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-6 text-[11px] text-gray-400">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-[12px] font-medium">No team notes yet</p>
              <p className="text-[10px] mt-0.5">Be the first to add a note about this student</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {notes.map(note => (
                <div
                  key={note.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    note.pinned ? "border-amber-200 bg-amber-50/50" : "border-gray-100 bg-white hover:bg-gray-50/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-700">{note.authorName}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${ROLE_COLORS[note.authorRole] || "bg-gray-100 text-gray-600"}`}>
                        {roleLabel(note.authorRole)}
                      </span>
                      <span className="text-[9px] text-gray-400">{timeAgo(note.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => togglePin(note.id, note.pinned)}
                        className={`p-1 rounded hover:bg-gray-100 transition-colors ${note.pinned ? "text-amber-500" : "text-gray-300 hover:text-gray-500"}`}
                        title={note.pinned ? "Unpin" : "Pin"}
                      >
                        {note.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                      {(note.authorStaffId === currentStaffId || currentRole === "admin") && (
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {renderContent(note.content, staffList)}
                  </div>
                  {note.pinned && (
                    <div className="mt-1.5 flex items-center gap-1 text-[9px] text-amber-600">
                      <Pin className="w-2.5 h-2.5" /> Pinned
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
