import { useState } from "react";
import { CheckCircle2, ArrowRight, Loader2, Sparkles, Users, BarChart3, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const ROLES = [
  { value: "admin", label: "District Admin", description: "Full district oversight, compliance reports" },
  { value: "provider", label: "Provider / Specialist", description: "Session logging, caseload management" },
  { value: "para", label: "Paraprofessional", description: "Daily schedule, student notes" },
  { value: "guardian", label: "Guardian / Parent", description: "Student progress, IEP documents" },
];

const FEATURE_HIGHLIGHTS = [
  { icon: ClipboardList, text: "Live IEPs with goals, accommodations, and service plans" },
  { icon: BarChart3, text: "Real compliance metrics and risk alerts seeded in" },
  { icon: Users, text: "5 staff members and 10+ students — fully staffed demo district" },
  { icon: Sparkles, text: "Credentials delivered by email in under 60 seconds" },
];

export default function DemoRequestPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    district: "",
    role: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = form.name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
    form.district.trim().length > 1 &&
    form.role.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const resp = await fetch(`${BASE_URL}/api/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (resp.status === 429) {
        setError("Too many requests from this address — please try again in an hour.");
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-emerald-100 rounded-full p-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your inbox</h1>
            <p className="text-gray-600">
              We're provisioning your demo district right now. You'll receive login credentials at{" "}
              <strong>{form.email}</strong> within 60 seconds.
            </p>
          </div>
          <Card className="text-left border-emerald-200 bg-emerald-50/60">
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm font-medium text-emerald-800">What's included in your demo:</p>
              {FEATURE_HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-2">
                  <Icon className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-900">{text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="text-xs text-gray-400">Your demo district is active for 7 days.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            No sales call required
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
            See Noverta with your<br />own eyes — instantly
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            Fill in the form and we'll provision a fully-seeded demo district for you in under 60 seconds. Real product, real data, no setup.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          {/* Form */}
          <Card className="shadow-lg border-0 ring-1 ring-gray-200">
            <CardContent className="p-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Start your demo</h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    disabled={submitting}
                    autoComplete="name"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@district.edu"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    disabled={submitting}
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="district">District or organization name</Label>
                  <Input
                    id="district"
                    placeholder="e.g. Springfield USD"
                    value={form.district}
                    onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Your role</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {ROLES.map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => !submitting && setForm(f => ({ ...f, role: r.value }))}
                        className={[
                          "flex flex-col items-start text-left px-4 py-3 rounded-lg border transition-all text-sm",
                          form.role === r.value
                            ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400"
                            : "border-gray-200 hover:border-emerald-300 hover:bg-gray-50",
                          submitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                        ].join(" ")}
                      >
                        <span className="font-medium text-gray-900">{r.label}</span>
                        <span className="text-gray-500 text-xs">{r.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={!valid || submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-11"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Provisioning your demo…
                    </>
                  ) : (
                    <>
                      Start My Demo
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>

                <p className="text-xs text-gray-400 text-center">
                  Your demo district stays active for 7 days and contains only sample data.
                </p>
              </form>
            </CardContent>
          </Card>

          {/* Value props */}
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-4 text-base">What you'll get</h3>
              <div className="space-y-3">
                {FEATURE_HIGHLIGHTS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-3">
                    <div className="bg-emerald-100 rounded-lg p-2 shrink-0">
                      <Icon className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="text-sm text-gray-700 pt-1.5">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <h4 className="font-medium text-gray-900 text-sm mb-3">How it works</h4>
              <ol className="space-y-3">
                {[
                  "Fill in your name, email, district, and role",
                  "We provision a seeded demo district in the background",
                  "Login credentials land in your inbox in under 60 seconds",
                  "Sign in and explore — no credit card, no commitment",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                    <span className="bg-emerald-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <p className="text-xs text-gray-400">
              Already have an account?{" "}
              <a href={`${BASE_URL}/sign-in`} className="text-emerald-600 hover:underline">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
