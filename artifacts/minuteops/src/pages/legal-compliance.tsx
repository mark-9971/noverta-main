import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, FileText, Database, AlertTriangle, Scale,
  ExternalLink, Download, Mail, ChevronRight, Lock, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/lib/role-context";

interface DocCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  fileName: string;
  badgeLabel: string;
  badgeColor: string;
  href: string;
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const docPath = (f: string) => `${BASE}/docs/legal/${f}`;

const DOCS: DocCard[] = [
  {
    title: "Data Processing Agreement (DPA)",
    description:
      "The contract that governs how Trellis processes your district's student and staff data. Defines sub-processors, data subject rights, deletion obligations, and breach notification. Review with district counsel before signing.",
    icon: Scale,
    fileName: "dpa-template.md",
    badgeLabel: "Requires Signature",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    href: docPath("dpa-template.md"),
  },
  {
    title: "Privacy Summary",
    description:
      "Plain-language explanation of what data Trellis collects, how it is used, who can access it, and how parents can exercise their FERPA rights. Suitable for sharing with your school community.",
    icon: FileText,
    fileName: "privacy-summary.md",
    badgeLabel: "FERPA",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    href: docPath("privacy-summary.md"),
  },
  {
    title: "Security Overview",
    description:
      "Technical security architecture document covering hosting environment, TLS encryption, authentication (Clerk), role-based access control, tenant isolation, session management, and audit logging.",
    icon: Shield,
    fileName: "security-overview.md",
    badgeLabel: "Technical",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    href: docPath("security-overview.md"),
  },
  {
    title: "Backup & Data Retention Policy",
    description:
      "Covers database backup cadence (continuous WAL + daily snapshots, 30-day retention), data retention schedule (7 years for student records per MA law), how to request a restore, and the deletion request process.",
    icon: Database,
    fileName: "backup-retention.md",
    badgeLabel: "Operational",
    badgeColor: "bg-gray-100 text-gray-700 border-gray-200",
    href: docPath("backup-retention.md"),
  },
  {
    title: "Incident Response Plan",
    description:
      "How Trellis detects, contains, and notifies affected parties in the event of a data security incident. Covers FERPA 72-hour notification requirement, triage steps, district notification letter template, and post-incident review process.",
    icon: AlertTriangle,
    fileName: "incident-response.md",
    badgeLabel: "FERPA / M.G.L. c.93H",
    badgeColor: "bg-red-50 text-red-700 border-red-200",
    href: docPath("incident-response.md"),
  },
];

const COMMITMENTS = [
  "Student data is never sold or used for advertising",
  "All data stored and processed in the United States",
  "Role-based access enforced at the API layer — not just the UI",
  "Audit trail logs every change to student records",
  "District data is logically isolated — cross-tenant access is blocked in production",
  "FERPA breach notification within 72 hours of confirmed disclosure",
];

function RequestDpaModal({ onClose }: { onClose: () => void }) {
  const { user } = useRole();
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setSending(true);

    const districtName = String(data.get("districtName") ?? "");
    const contactName = String(data.get("contactName") ?? "");
    const contactEmail = String(data.get("contactEmail") ?? "");
    const contactTitle = String(data.get("contactTitle") ?? "");
    const notes = String(data.get("notes") ?? "");

    try {
      const body = {
        districtName,
        contactName,
        contactEmail,
        contactTitle,
        notes,
        requestedBy: user.name,
        requestedAt: new Date().toISOString(),
      };

      // Log the request server-side (audit trail)
      const res = await fetch("/api/legal/request-dpa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Server error logging request. Please email legal@trellis.app directly.");
        return;
      }

      // Open pre-filled email to Trellis legal so the notification is sent immediately
      const emailSubject = encodeURIComponent(`DPA Request — ${districtName}`);
      const emailBody = encodeURIComponent(
        `Hello Trellis Team,\n\n${districtName} would like to request a signed Data Processing Agreement.\n\n` +
        `Contact: ${contactName}\nTitle: ${contactTitle}\nEmail: ${contactEmail}\n` +
        (notes ? `\nNotes: ${notes}` : "") +
        `\n\nRequested at: ${new Date().toLocaleString()}\n`
      );
      window.open(`mailto:legal@trellis.app?subject=${emailSubject}&body=${emailBody}`, "_blank");

      toast.success("Your email client has opened with a pre-filled request. Trellis will follow up within 2 business days.");
      onClose();
    } catch {
      toast.error("Could not send request. Please email legal@trellis.app directly.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Scale className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Request a Signed DPA</h2>
            <p className="text-xs text-gray-500">Trellis will follow up within 2 business days</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">District Name *</label>
            <input name="districtName" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contact Name *</label>
              <input name="contactName" required defaultValue={user.name} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
              <input name="contactTitle" required placeholder="e.g. Director of Special Education" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact Email *</label>
            <input name="contactEmail" type="email" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea name="notes" rows={3} placeholder="Any specific requirements or questions about the DPA…" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={sending} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60">
              {sending ? "Sending…" : "Send Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LegalCompliancePage() {
  const { user } = useRole();
  const [dpaModalOpen, setDpaModalOpen] = useState(false);
  const isAdmin = ["admin", "coordinator"].includes(user.role ?? "");

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Lock className="w-10 h-10 text-gray-300" />
        <h1 className="text-xl font-semibold text-gray-700">Admin Access Required</h1>
        <p className="text-sm text-gray-400">Legal and compliance documents are available to district administrators.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      {dpaModalOpen && <RequestDpaModal onClose={() => setDpaModalOpen(false)} />}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Legal &amp; Compliance</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Privacy, security, and data processing documentation for your district
          </p>
        </div>
        <Button
          onClick={() => setDpaModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm shrink-0"
        >
          <Mail className="w-4 h-4 mr-2" />
          Request Signed DPA
        </Button>
      </div>

      <Card className="border-emerald-100 bg-emerald-50/40">
        <CardContent className="py-4 px-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-emerald-800">Trellis Data Commitments</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
            {COMMITMENTS.map(c => (
              <div key={c} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                <span className="text-xs text-emerald-900">{c}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {DOCS.map((doc) => (
          <Card key={doc.fileName} className="border-gray-200/70 hover:shadow-sm transition-shadow">
            <CardContent className="py-5 px-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <doc.icon className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-semibold text-gray-800">{doc.title}</h3>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${doc.badgeColor}`}>
                      {doc.badgeLabel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{doc.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <a
                    href={`/docs/legal/${doc.fileName}`}
                    download={doc.fileName}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                    title={`Download ${doc.fileName}`}
                    onClick={() => toast.success(`Downloading ${doc.fileName}`)}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                    title="View on GitHub"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-gray-200/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Regulatory Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              label: "FERPA (Family Educational Rights and Privacy Act)",
              description: "Federal law protecting the privacy of student education records. Trellis processes records as a \u201cschool official\u201d under FERPA's legitimate educational interest provision. 20 U.S.C. \u00a7 1232g; 34 CFR Part 99.",
              badge: "Federal",
            },
            {
              label: "IDEA (Individuals with Disabilities Education Act)",
              description: "Federal law governing special education services. Trellis is specifically built to support IDEA compliance — IEP delivery, service minutes, compensatory services, transition planning.",
              badge: "Federal",
            },
            {
              label: "603 CMR 28.00 — Massachusetts Special Education Regulations",
              description: "The Massachusetts SPED framework Trellis is built against. Governs IEP content, timelines, service delivery, evaluations, and parent rights.",
              badge: "Massachusetts",
            },
            {
              label: "M.G.L. c. 93H — Massachusetts Data Breach Notification Law",
              description: "Requires notification to the MA Attorney General and affected individuals in the event of a breach of personal information.",
              badge: "Massachusetts",
            },
            {
              label: "603 CMR 23.00 — Massachusetts Student Records Regulations",
              description: "Governs retention periods for student records. Trellis retains withdrawn student records for 7 years consistent with these requirements.",
              badge: "Massachusetts",
            },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3">
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{item.badge}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-[11px] text-gray-400 text-center pb-2">
        These documents are templates and operational policies. They do not constitute legal advice. 
        Trellis recommends district counsel review the DPA before signing.
        Questions? Email <a href="mailto:legal@trellis.app" className="underline hover:text-gray-600">legal@trellis.app</a>
      </p>
    </div>
  );
}
