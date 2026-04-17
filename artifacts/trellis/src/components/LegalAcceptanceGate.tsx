import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, FileText, Scale, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface AcceptanceDoc {
  documentType: string;
  documentLabel: string;
  documentVersion: string;
  required: boolean;
  acceptedAt: string | null;
}

interface AcceptanceStatusResponse {
  required: boolean;
  documents: AcceptanceDoc[];
}

const DOC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  tos: FileText,
  dpa: Scale,
};

const DOC_PATHS: Record<string, string> = {
  tos: "/docs/legal/terms-of-service.md",
  dpa: "/docs/legal/dpa-template.md",
};

const DOC_DESCRIPTIONS: Record<string, string> = {
  tos: "Governs how you may use the Trellis platform as an authorized staff member.",
  dpa: "Describes how Trellis processes your district's student data and your FERPA obligations.",
};

function MarkdownDoc({ path }: { path: string }) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}${path}`)
      .then(r => r.text())
      .then(setContent)
      .catch(() => setContent("(Could not load document. Contact legal@trellis.app)"));
  }, [path]);

  if (!content) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-gray-700">
      {content}
    </pre>
  );
}

interface Props {
  children: React.ReactNode;
  /** Roles that are exempt from the gate (parent/student portals handle their own ToS). */
  exemptRoles?: string[];
  currentRole?: string;
}

export function LegalAcceptanceGate({ children, exemptRoles = ["sped_parent", "sped_student"], currentRole }: Props) {
  const queryClient = useQueryClient();
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const isExempt = currentRole ? exemptRoles.includes(currentRole) : false;

  const { data, isLoading, isError } = useQuery<AcceptanceStatusResponse>({
    queryKey: ["legal-acceptance-status"],
    queryFn: async () => {
      const r = await authFetch(`${BASE}/api/legal/acceptance-status`);
      if (!r.ok) throw new Error("Failed to fetch acceptance status");
      return r.json();
    },
    enabled: !isExempt,
    staleTime: 5 * 60_000,
    retry: 2,
  });

  const mutation = useMutation({
    mutationFn: async (acceptances: Array<{ documentType: string; documentVersion: string }>) => {
      const r = await authFetch(`${BASE}/api/legal/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptances }),
      });
      if (!r.ok) throw new Error("Failed to record acceptance");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-acceptance-status"] });
    },
  });

  if (isExempt) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-400 font-medium">Loading Trellis...</p>
        </div>
      </div>
    );
  }

  // Fail-closed: if the status check errored, block access until it resolves.
  // Never let children render when acceptance is unconfirmed.
  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-xl shadow border border-gray-200 p-8 max-w-sm w-full text-center">
          <Shield className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <h2 className="font-semibold text-gray-900 mb-1">Unable to verify acceptance status</h2>
          <p className="text-sm text-gray-500 mb-4 leading-relaxed">
            Trellis could not confirm your legal acceptance status. Please reload to try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  const requiredDocs = data?.documents?.filter(d => d.required) ?? [];

  // Only pass through once acceptance is positively confirmed as not-required.
  if (data && !data.required && requiredDocs.length === 0) return <>{children}</>;

  // Still waiting for data (edge case) — keep gate closed.
  if (!data) return null;

  const allChecked = requiredDocs.every(d => checked[d.documentType]);

  function handleAccept() {
    const acceptances = requiredDocs.map(d => ({
      documentType: d.documentType,
      documentVersion: d.documentVersion,
    }));
    mutation.mutate(acceptances);
  }

  if (activeDoc) {
    const doc = requiredDocs.find(d => d.documentType === activeDoc);
    const path = DOC_PATHS[activeDoc] ?? "";
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            <span className="font-semibold text-gray-900">{doc?.documentLabel}</span>
            <span className="text-xs text-gray-400 ml-1">v{doc?.documentVersion}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setActiveDoc(null)}>
            ← Back
          </Button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-auto px-8 py-6 max-w-3xl mx-auto w-full">
          <MarkdownDoc path={path} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-xl">
        <div className="px-8 pt-8 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">Review and accept to continue</h1>
              <p className="text-sm text-gray-500">Required before accessing Trellis</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Your district requires all staff to acknowledge Trellis's legal documents before accessing student data.
            Please read each document carefully and check the box to confirm you have read and agree.
          </p>
        </div>

        <div className="px-8 py-6 space-y-4">
          {requiredDocs.map(doc => {
            const Icon = DOC_ICONS[doc.documentType] ?? FileText;
            const isChecked = !!checked[doc.documentType];
            return (
              <div
                key={doc.documentType}
                className={`rounded-lg border p-4 transition-colors ${isChecked ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{doc.documentLabel}</span>
                      <span className="text-[11px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                        v{doc.documentVersion}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      {DOC_DESCRIPTIONS[doc.documentType] ?? ""}
                    </p>
                    <button
                      onClick={() => setActiveDoc(doc.documentType)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 underline mt-1.5 font-medium"
                    >
                      Read document →
                    </button>
                  </div>
                  <div className="flex-shrink-0 pt-0.5">
                    <Checkbox
                      id={`check-${doc.documentType}`}
                      checked={isChecked}
                      onCheckedChange={v =>
                        setChecked(prev => ({ ...prev, [doc.documentType]: !!v }))
                      }
                      className="border-gray-300"
                    />
                  </div>
                </div>
                <label
                  htmlFor={`check-${doc.documentType}`}
                  className={`block text-xs mt-3 pl-11 cursor-pointer leading-relaxed ${isChecked ? "text-emerald-700" : "text-gray-500"}`}
                >
                  I have read and agree to the {doc.documentLabel}
                </label>
              </div>
            );
          })}
        </div>

        <div className="px-8 pb-8">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!allChecked || mutation.isPending}
            onClick={handleAccept}
          >
            {mutation.isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Recording acceptance…
              </span>
            ) : (
              "Accept and continue"
            )}
          </Button>
          {mutation.isError && (
            <p className="text-xs text-red-600 text-center mt-2">
              Something went wrong. Please try again or contact support.
            </p>
          )}
          <p className="text-[11px] text-gray-400 text-center mt-3 leading-relaxed">
            Your acceptance is recorded with a timestamp and linked to your account.
            Questions? Email <a href="mailto:legal@trellis.app" className="underline">legal@trellis.app</a>
          </p>
        </div>
      </div>
    </div>
  );
}
