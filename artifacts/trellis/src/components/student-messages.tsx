import { useState, useEffect } from "react";
import { useUser } from "@clerk/react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { MessageSquare, Send, ChevronDown, ChevronUp, Clock, Check, CheckCheck, FileText, Calendar, Plus, X, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Guardian {
  id: number;
  name: string;
  relationship: string;
  email: string | null;
}

interface MessageThread {
  threadId: number;
  subject: string;
  category: string;
  messageCount: number;
  lastMessageAt: string;
  hasUnread: boolean;
  messages: Array<{
    id: number;
    senderType: string;
    senderName: string;
    senderGuardianId: number | null;
    recipientGuardianId: number | null;
    subject: string;
    body: string;
    readAt: string | null;
    createdAt: string;
    category: string;
  }>;
}

interface Template {
  id: number;
  name: string;
  category: string;
  subject: string;
  body: string;
  placeholders: string[];
}

interface ConferenceRequest {
  id: number;
  title: string;
  description: string | null;
  proposedTimes: string[];
  selectedTime: string | null;
  status: string;
  location: string | null;
  guardianNotes: string | null;
  staffName: string | null;
  guardianName: string | null;
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

export default function StudentMessages({ studentId, studentName, guardians }: { studentId: number; studentName: string; guardians: Guardian[] }) {
  const { user } = useUser();
  const staffName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Staff" : "Staff";
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [conferences, setConferences] = useState<ConferenceRequest[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedThread, setExpandedThread] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [conferenceOpen, setConferenceOpen] = useState(false);
  const [replyThread, setReplyThread] = useState<MessageThread | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: number; senderType: string; senderName: string; category: string; subject: string; body: string; createdAt: string; threadId: number }> | null>(null);
  const [searching, setSearching] = useState(false);

  const [form, setForm] = useState({
    guardianId: "",
    templateId: "",
    subject: "",
    body: "",
    category: "general",
  });

  const [confForm, setConfForm] = useState({
    guardianId: "",
    title: "",
    description: "",
    location: "",
    proposedTimes: ["", "", ""],
  });

  useEffect(() => {
    loadData();
  }, [studentId]);

  async function loadData() {
    setLoading(true);
    try {
      const [threadsRes, confRes, templatesRes] = await Promise.all([
        authFetch(`/api/students/${studentId}/messages`).then(r => r.ok ? r.json() : { threads: [] }),
        authFetch(`/api/students/${studentId}/conference-requests`).then(r => r.ok ? r.json() : []),
        authFetch(`/api/message-templates`).then(r => r.ok ? r.json() : []),
      ]);
      setThreads(threadsRes.threads ?? []);
      setConferences(Array.isArray(confRes) ? confRes : []);
      setTemplates(Array.isArray(templatesRes) ? templatesRes : []);
    } catch {
      toast.error("Failed to load messages");
    }
    setLoading(false);
  }

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const r = await authFetch(`/api/students/${studentId}/messages/search?q=${encodeURIComponent(query)}`);
      if (r.ok) {
        const data = await r.json();
        setSearchResults(data.results ?? []);
      }
    } catch {
      toast.error("Search failed");
    }
    setSearching(false);
  }

  function applyTemplate(templateId: string) {
    const tmpl = templates.find(t => t.id === Number(templateId));
    if (!tmpl) return;

    let subject = tmpl.subject;
    let body = tmpl.body;

    subject = subject.replace(/\{\{studentName\}\}/g, studentName);
    body = body.replace(/\{\{studentName\}\}/g, studentName);
    subject = subject.replace(/\{\{staffName\}\}/g, staffName);
    body = body.replace(/\{\{staffName\}\}/g, staffName);

    const guardian = guardians.find(g => g.id === Number(form.guardianId));
    if (guardian) {
      subject = subject.replace(/\{\{guardianName\}\}/g, guardian.name);
      body = body.replace(/\{\{guardianName\}\}/g, guardian.name);
    }

    setForm(f => ({ ...f, templateId, subject, body, category: tmpl.category }));
  }

  type EmailDelivery = {
    attempted: boolean;
    status: "sent" | "not_configured" | "failed" | "no_email_on_file" | "skipped";
    error?: string;
    communicationEventId?: number;
  };

  function reportDelivery(savedLabel: string, delivery: EmailDelivery | undefined) {
    if (!delivery || !delivery.attempted) {
      toast.success(`${savedLabel} saved to portal`, {
        description: "No email on file for this guardian — they'll see it next time they sign in.",
      });
      return;
    }
    if (delivery.status === "sent") {
      toast.success(`${savedLabel} sent — email delivered to guardian`);
      return;
    }
    if (delivery.status === "not_configured") {
      toast.warning(`${savedLabel} saved to portal — email not delivered`, {
        description: "Email provider is not configured. Ask an admin to add RESEND_API_KEY to enable real email delivery.",
        duration: 8000,
      });
      return;
    }
    toast.warning(`${savedLabel} saved to portal — email delivery failed`, {
      description: delivery.error ?? "The guardian will still see the message on their next portal sign-in. Retry from the message thread.",
      duration: 8000,
    });
  }

  async function handleSend() {
    if (!form.guardianId || !form.subject.trim() || !form.body.trim()) {
      toast.error("Please select a recipient and fill in the subject and message");
      return;
    }
    setSending(true);
    try {
      const r = await authFetch(`/api/students/${studentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardianId: Number(form.guardianId),
          subject: form.subject.trim(),
          body: form.body.trim(),
          category: form.category,
          templateId: form.templateId ? Number(form.templateId) : null,
        }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json().catch(() => ({}));
      reportDelivery("Message", data?.emailDelivery);
      setComposeOpen(false);
      setForm({ guardianId: "", templateId: "", subject: "", body: "", category: "general" });
      loadData();
    } catch {
      toast.error("Failed to send message");
    }
    setSending(false);
  }

  async function handleReply() {
    if (!replyThread || !replyBody.trim()) return;
    setReplySending(true);
    try {
      const firstMsg = replyThread.messages[0];
      const r = await authFetch(`/api/students/${studentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardianId: firstMsg.senderType === "guardian"
            ? replyThread.messages.find(m => m.senderType === "guardian")?.senderGuardianId
            : replyThread.messages.find(m => m.senderType === "staff")?.recipientGuardianId,
          subject: replyThread.subject.startsWith("Re: ") ? replyThread.subject : `Re: ${replyThread.subject}`,
          body: replyBody.trim(),
          category: replyThread.category,
          threadId: replyThread.threadId,
        }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json().catch(() => ({}));
      reportDelivery("Reply", data?.emailDelivery);
      setReplyThread(null);
      setReplyBody("");
      loadData();
    } catch {
      toast.error("Failed to send reply");
    }
    setReplySending(false);
  }

  async function handleConference() {
    const times = confForm.proposedTimes.filter(t => t.trim());
    if (!confForm.guardianId || !confForm.title.trim() || times.length === 0) {
      toast.error("Please select a guardian, enter a title, and propose at least one time");
      return;
    }
    setSending(true);
    try {
      const r = await authFetch(`/api/students/${studentId}/conference-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardianId: Number(confForm.guardianId),
          title: confForm.title.trim(),
          description: confForm.description.trim() || null,
          proposedTimes: times,
          location: confForm.location.trim() || null,
        }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json().catch(() => ({}));
      reportDelivery("Conference request", data?.emailDelivery);
      setConferenceOpen(false);
      setConfForm({ guardianId: "", title: "", description: "", location: "", proposedTimes: ["", "", ""] });
      loadData();
    } catch {
      toast.error("Failed to create conference request");
    }
    setSending(false);
  }

  const statusIcon = (status: string) => {
    if (status === "accepted") return <Check className="w-3.5 h-3.5 text-emerald-600" />;
    if (status === "declined") return <X className="w-3.5 h-3.5 text-red-500" />;
    return <Clock className="w-3.5 h-3.5 text-amber-500" />;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold text-gray-900">Messages</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold text-gray-900">Messages</h3>
          <span className="text-xs text-gray-400">{threads.length} thread{threads.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setConferenceOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition"
            disabled={guardians.length === 0}
          >
            <Calendar className="w-3.5 h-3.5" /> Schedule Conference
          </button>
          <button
            onClick={() => setComposeOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
            disabled={guardians.length === 0}
          >
            <Plus className="w-3.5 h-3.5" /> New Message
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search messages..."
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-gray-50"
        />
        {searchQuery && (
          <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {searchResults !== null && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {searching ? "Searching..." : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
          </h4>
          {searchResults.map(msg => (
            <div
              key={msg.id}
              onClick={() => { setExpandedThread(msg.threadId); setSearchQuery(""); setSearchResults(null); }}
              className="p-3 bg-gray-50 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-100 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700">{msg.senderName}</span>
                <span className="text-[10px] text-gray-400">{new Date(msg.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-sm font-medium text-gray-900 truncate">{msg.subject}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{msg.body.substring(0, 100)}</p>
            </div>
          ))}
        </div>
      )}

      {guardians.length === 0 && (
        <p className="text-xs text-gray-400 italic">No guardians on file — add a guardian to enable messaging.</p>
      )}

      {searchResults === null && conferences.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conference Requests</h4>
          {conferences.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 bg-purple-50/50 rounded-lg border border-purple-100">
              <div className="flex items-center gap-3 min-w-0">
                {statusIcon(c.status)}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                  <p className="text-xs text-gray-500">{c.guardianName} &middot; {new Date(c.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.selectedTime && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                    {new Date(c.selectedTime).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === "accepted" ? "bg-emerald-100 text-emerald-700" : c.status === "declined" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {c.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {threads.length === 0 && guardians.length > 0 && (
        <div className="text-center py-6">
          <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No messages yet</p>
          <p className="text-xs text-gray-300 mt-1">Send a message to start a conversation</p>
        </div>
      )}

      {searchResults === null && threads.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversations</h4>
          {threads.map(thread => (
            <div key={thread.threadId} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => {
                  const opening = expandedThread !== thread.threadId;
                  setExpandedThread(opening ? thread.threadId : null);
                  if (opening && thread.hasUnread) {
                    thread.messages
                      .filter(m => m.senderType === "guardian" && !m.readAt)
                      .forEach(m => {
                        authFetch(`/api/students/${studentId}/messages/${m.id}/read`, { method: "PATCH" })
                          .catch(() => {});
                      });
                  }
                }}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition text-left"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {thread.hasUnread && <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm truncate ${thread.hasUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                        {thread.subject}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[thread.category] ?? "bg-gray-100 text-gray-600"}`}>
                        {CATEGORY_LABELS[thread.category] ?? thread.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""} &middot; {new Date(thread.lastMessageAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {expandedThread === thread.threadId ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {expandedThread === thread.threadId && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
                    {thread.messages.map(msg => (
                      <div key={msg.id} className={`p-3 rounded-lg ${msg.senderType === "staff" ? "bg-emerald-50/80 ml-0 mr-8" : "bg-white border border-gray-200 ml-8 mr-0"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-700">{msg.senderName}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400">
                              {new Date(msg.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </span>
                            {msg.senderType === "staff" && (
                              msg.readAt
                                ? <CheckCheck className="w-3 h-3 text-emerald-600" title="Read" />
                                : <Check className="w-3 h-3 text-gray-300" title="Sent" />
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-line">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-gray-100">
                    <button
                      onClick={() => { setReplyThread(thread); setReplyBody(""); }}
                      className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      <Send className="w-3.5 h-3.5" /> Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-gray-500">Recipient</Label>
              <Select value={form.guardianId} onValueChange={v => setForm(f => ({ ...f, guardianId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select guardian..." /></SelectTrigger>
                <SelectContent>
                  {guardians.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name} ({g.relationship})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-gray-500">Template (optional)</Label>
              <Select value={form.templateId} onValueChange={v => applyTemplate(v)}>
                <SelectTrigger><SelectValue placeholder="Start from template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-gray-500">Subject</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Message subject..." />
            </div>

            <div>
              <Label className="text-xs text-gray-500">Message</Label>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                className="w-full min-h-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-y"
                placeholder="Type your message..."
              />
              {form.body.includes("{{") && (
                <p className="text-[10px] text-amber-600 mt-1">Note: Replace placeholder values marked with {"{{ }}"} before sending</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700">
              {sending ? "Sending..." : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!replyThread} onOpenChange={v => { if (!v) setReplyThread(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reply: {replyThread?.subject}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <textarea
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              className="w-full min-h-[120px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-y"
              placeholder="Type your reply..."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyThread(null)}>Cancel</Button>
            <Button onClick={handleReply} disabled={replySending || !replyBody.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {replySending ? "Sending..." : "Send Reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={conferenceOpen} onOpenChange={setConferenceOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Conference</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-gray-500">Guardian</Label>
              <Select value={confForm.guardianId} onValueChange={v => setConfForm(f => ({ ...f, guardianId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select guardian..." /></SelectTrigger>
                <SelectContent>
                  {guardians.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name} ({g.relationship})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Conference Title</Label>
              <Input value={confForm.title} onChange={e => setConfForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g., IEP Progress Review" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Description (optional)</Label>
              <textarea
                value={confForm.description}
                onChange={e => setConfForm(f => ({ ...f, description: e.target.value }))}
                className="w-full min-h-[60px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-y"
                placeholder="Brief description of conference purpose..."
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Location (optional)</Label>
              <Input value={confForm.location} onChange={e => setConfForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g., Room 204 or Virtual" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Proposed Times</Label>
              <div className="space-y-2">
                {confForm.proposedTimes.map((t, i) => (
                  <Input
                    key={i}
                    type="datetime-local"
                    value={t}
                    onChange={e => {
                      const times = [...confForm.proposedTimes];
                      times[i] = e.target.value;
                      setConfForm(f => ({ ...f, proposedTimes: times }));
                    }}
                  />
                ))}
                <button
                  onClick={() => setConfForm(f => ({ ...f, proposedTimes: [...f.proposedTimes, ""] }))}
                  className="text-xs text-emerald-600 hover:text-emerald-700"
                >
                  + Add another time
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConferenceOpen(false)}>Cancel</Button>
            <Button onClick={handleConference} disabled={sending} className="bg-purple-600 hover:bg-purple-700">
              {sending ? "Sending..." : "Send Conference Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
