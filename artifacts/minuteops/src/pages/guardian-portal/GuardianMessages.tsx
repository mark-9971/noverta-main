import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { MessageSquare, Send, ChevronDown, ChevronUp, Check, CheckCheck, Clock, Calendar, X, Inbox } from "lucide-react";

interface MessageThread {
  threadId: number;
  subject: string;
  category: string;
  studentName: string | null;
  messageCount: number;
  unreadCount: number;
  lastMessageAt: string;
  messages: Array<{
    id: number;
    senderType: string;
    senderName: string;
    subject: string;
    body: string;
    readAt: string | null;
    createdAt: string;
    category: string;
  }>;
}

interface Conference {
  id: number;
  title: string;
  description: string | null;
  proposedTimes: string[];
  selectedTime: string | null;
  status: string;
  location: string | null;
  staffName: string | null;
  studentName: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  prior_written_notice: "Prior Written Notice",
  iep_meeting_invitation: "Meeting Invitation",
  progress_update: "Progress Update",
  conference_request: "Conference",
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-gray-100 text-gray-700",
  prior_written_notice: "bg-amber-100 text-amber-800",
  iep_meeting_invitation: "bg-blue-100 text-blue-800",
  progress_update: "bg-emerald-100 text-emerald-800",
  conference_request: "bg-purple-100 text-purple-800",
};

export default function GuardianMessages() {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedThread, setExpandedThread] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confAction, setConfAction] = useState<{ id: number; action: string; time?: string } | null>(null);
  const [confNotes, setConfNotes] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [msgRes, confRes] = await Promise.all([
        authFetch("/api/guardian-portal/messages").then(r => r.ok ? r.json() : { threads: [], unreadTotal: 0 }),
        authFetch("/api/guardian-portal/conferences").then(r => r.ok ? r.json() : []),
      ]);
      setThreads(msgRes.threads ?? []);
      setUnreadTotal(msgRes.unreadTotal ?? 0);
      setConferences(Array.isArray(confRes) ? confRes : []);
    } catch {
      toast.error("Failed to load messages");
    }
    setLoading(false);
  }

  async function markRead(msgId: number) {
    try {
      await authFetch(`/api/guardian-portal/messages/${msgId}/read`, { method: "PATCH" });
    } catch {}
  }

  async function handleExpandThread(thread: MessageThread) {
    if (expandedThread === thread.threadId) {
      setExpandedThread(null);
      return;
    }
    setExpandedThread(thread.threadId);
    for (const msg of thread.messages) {
      if (!msg.readAt && msg.senderType === "staff") {
        await markRead(msg.id);
      }
    }
    loadData();
  }

  async function handleReply(threadId: number) {
    if (!replyBody.trim()) return;
    const thread = threads.find(t => t.threadId === threadId);
    if (!thread) return;

    const lastMsg = thread.messages[thread.messages.length - 1];
    setSending(true);
    try {
      const r = await authFetch(`/api/guardian-portal/messages/${lastMsg.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (!r.ok) throw new Error();
      toast.success("Reply sent");
      setReplyingTo(null);
      setReplyBody("");
      loadData();
    } catch {
      toast.error("Failed to send reply");
    }
    setSending(false);
  }

  async function handleConferenceAction(confId: number, status: string, selectedTime?: string) {
    setSending(true);
    try {
      const r = await authFetch(`/api/guardian-portal/conferences/${confId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, selectedTime, guardianNotes: confNotes.trim() || null }),
      });
      if (!r.ok) throw new Error();
      toast.success(status === "accepted" ? "Conference accepted" : "Conference declined");
      setConfAction(null);
      setConfNotes("");
      loadData();
    } catch {
      toast.error("Failed to update conference");
    }
    setSending(false);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-1">
        <div className="flex items-center justify-center min-h-64">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-1">
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Inbox className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Messages</h1>
              <p className="text-xs text-gray-500">
                {unreadTotal > 0 ? (
                  <span className="text-emerald-600 font-medium">{unreadTotal} unread message{unreadTotal !== 1 ? "s" : ""}</span>
                ) : (
                  "All caught up"
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {conferences.filter(c => c.status === "proposed").length > 0 && (
        <div className="bg-white rounded-xl border border-purple-200/80 shadow-sm p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-semibold text-gray-900">Pending Conference Requests</h2>
          </div>
          {conferences.filter(c => c.status === "proposed").map(conf => (
            <div key={conf.id} className="p-4 bg-purple-50/50 rounded-lg border border-purple-100 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{conf.title}</p>
                <p className="text-xs text-gray-500">From {conf.staffName} &middot; {new Date(conf.createdAt).toLocaleDateString()}</p>
                {conf.description && <p className="text-xs text-gray-600 mt-1">{conf.description}</p>}
                {conf.location && <p className="text-xs text-gray-500 mt-1">Location: {conf.location}</p>}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Proposed Times:</p>
                <div className="space-y-1">
                  {(conf.proposedTimes || []).map((time: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 flex-1">
                        {new Date(time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                      <button
                        onClick={() => handleConferenceAction(conf.id, "accepted", time)}
                        disabled={sending}
                        className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 transition"
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-purple-100">
                <input
                  value={confNotes}
                  onChange={e => setConfNotes(e.target.value)}
                  placeholder="Add a note (optional)..."
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  onClick={() => handleConferenceAction(conf.id, "declined")}
                  disabled={sending}
                  className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-3">
        {threads.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-300 mt-1">Messages from your child's school team will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map(thread => (
              <div key={thread.threadId} className="border border-gray-100 rounded-lg overflow-hidden">
                <button
                  onClick={() => handleExpandThread(thread)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {thread.unreadCount > 0 && (
                      <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${thread.unreadCount > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                          {thread.subject}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[thread.category] ?? "bg-gray-100 text-gray-600"}`}>
                          {CATEGORY_LABELS[thread.category] ?? thread.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""} &middot; {new Date(thread.lastMessageAt).toLocaleDateString()}
                        {thread.unreadCount > 0 && <span className="text-emerald-600 font-medium ml-1"> &middot; {thread.unreadCount} new</span>}
                      </p>
                    </div>
                  </div>
                  {expandedThread === thread.threadId ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {expandedThread === thread.threadId && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
                      {thread.messages.map(msg => (
                        <div key={msg.id} className={`p-3 rounded-lg ${msg.senderType === "guardian" ? "bg-emerald-50/80 ml-8 mr-0" : "bg-white border border-gray-200 ml-0 mr-8"}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-700">{msg.senderName}</span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(msg.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-line">{msg.body}</p>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 border-t border-gray-100">
                      {replyingTo === thread.threadId ? (
                        <div className="space-y-2">
                          <textarea
                            value={replyBody}
                            onChange={e => setReplyBody(e.target.value)}
                            className="w-full min-h-[80px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-y"
                            placeholder="Type your reply..."
                            autoFocus
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setReplyingTo(null); setReplyBody(""); }}
                              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReply(thread.threadId)}
                              disabled={sending || !replyBody.trim()}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              <Send className="w-3 h-3" /> {sending ? "Sending..." : "Send Reply"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setReplyingTo(thread.threadId)}
                          className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                        >
                          <Send className="w-3.5 h-3.5" /> Reply
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {conferences.filter(c => c.status !== "proposed").length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Past Conference Requests</h2>
          {conferences.filter(c => c.status !== "proposed").map(conf => (
            <div key={conf.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{conf.title}</p>
                <p className="text-xs text-gray-400">{conf.staffName} &middot; {new Date(conf.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                {conf.selectedTime && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {new Date(conf.selectedTime).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${conf.status === "accepted" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {conf.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
