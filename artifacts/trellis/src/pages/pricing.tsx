import { useState } from "react";
import { useUser } from "@clerk/react";
import { Check, X, ArrowRight, Sprout, Building2, Shield, ChevronDown, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL || "/";

const FEATURE_LABELS: Record<string, string> = {
  "compliance.service_minutes": "Service minute tracking",
  "compliance.compensatory": "Compensatory services",
  "compliance.state_reporting": "State reporting (603 CMR)",
  "compliance.checklist": "Compliance checklists",
  "compliance.attendance": "Attendance tracking",
  "compliance.evaluations": "Evaluation management",
  "compliance.iep_calendar": "IEP calendar & deadlines",
  "compliance.iep_search": "IEP search & lookup",
  "compliance.transitions": "Transition planning",
  "clinical.program_data": "Program data collection",
  "clinical.fba_bip": "FBA/BIP management",
  "clinical.iep_suggestions": "IEP program & goal suggestions",
  "compliance.protective_measures": "Protective measures tracking",
  "district.medicaid_billing": "Medicaid billing & documentation",
  "clinical.supervision": "Supervision management",
  "clinical.aba_graphing": "ABA graphing & analysis",
  "clinical.premium_templates": "Premium goal templates",
  "district.overview": "District overview dashboard",
  "district.executive": "Executive analytics",
  "district.resource_management": "Resource management",
  "district.contract_utilization": "Contract utilization tracking",
  "district.caseload_balancing": "Caseload balancing",
  "district.budget": "Budget tracking & forecasting",
  "engagement.parent_communication": "Parent communication portal",
  "engagement.parent_portal": "Family self-service portal",
  "engagement.documents": "Document sharing & signatures",
  "engagement.translation": "Multi-language translation",
};

const MODULE_CONFIG = {
  compliance_core: {
    label: "Compliance Core",
    features: [
      "compliance.service_minutes", "compliance.compensatory", "compliance.state_reporting",
      "compliance.checklist", "compliance.attendance", "compliance.evaluations",
      "compliance.iep_calendar", "compliance.iep_search", "compliance.transitions",
      // Protective measures is state-mandated compliance reporting in MA — CORE tier
      "compliance.protective_measures",
    ],
  },
  clinical_instruction: {
    label: "Clinical & Instruction",
    features: [
      "clinical.program_data", "clinical.fba_bip", "clinical.iep_suggestions",
      "clinical.supervision", "clinical.aba_graphing",
      "clinical.premium_templates",
    ],
  },
  engagement_access: {
    label: "Engagement & Access",
    features: [
      "engagement.parent_communication", "engagement.parent_portal",
      "engagement.documents", "engagement.translation",
    ],
  },
  district_operations: {
    label: "District Operations",
    features: [
      "district.overview", "district.executive", "district.resource_management",
      "district.contract_utilization", "district.caseload_balancing",
      "district.medicaid_billing", "district.budget",
    ],
  },
};

const TIER_MODULES: Record<string, string[]> = {
  essentials: ["compliance_core"],
  professional: ["compliance_core", "clinical_instruction", "engagement_access"],
  enterprise: ["compliance_core", "clinical_instruction", "engagement_access", "district_operations"],
};

interface TierConfig {
  key: "essentials" | "professional" | "enterprise";
  name: string;
  tagline: string;
  price: string;
  priceUnit: string;
  /** What Stripe Checkout actually charges. Must stay in sync with seed-products.ts. */
  billedNote?: string;
  trialNote?: string;
  highlighted: boolean;
  cta: string;
  ctaVariant: "default" | "outline";
  schoolLimit: string;
}

// IMPORTANT: `price` (per-student/year list price) and `billedNote` (the actual
// flat amount Stripe will charge) MUST stay coordinated with the Stripe price
// rows seeded by `scripts/src/seed-products.ts`. The per-student headline is
// the way the platform is sold; the flat billed amount is what shows up on the
// invoice. Update both together when prices change.
const TIERS: TierConfig[] = [
  {
    key: "essentials",
    name: "Essentials",
    tagline: "Service-minute tracking and state-required reporting",
    price: "$10",
    priceUnit: "per student / year",
    billedNote: "Billed flat at $99/mo or $999/yr · up to ~100 students",
    trialNote: "Starts with a 14-day free trial",
    highlighted: false,
    cta: "Get Started",
    ctaVariant: "outline",
    schoolLimit: "Up to 5 schools",
  },
  {
    key: "professional",
    name: "Professional",
    tagline: "Adds clinical data and family communication",
    price: "$18",
    priceUnit: "per student / year",
    billedNote: "Billed flat at $299/mo or $2,999/yr · up to ~165 students",
    trialNote: "Starts with a 14-day free trial",
    highlighted: true,
    cta: "Get Started",
    ctaVariant: "default",
    schoolLimit: "Up to 15 schools",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    tagline: "Adds district-wide operations and finance",
    price: "$30",
    priceUnit: "per student / year",
    billedNote: "Annual contract priced per district",
    trialNote: "Custom procurement, multi-district, and premium implementation",
    highlighted: false,
    cta: "Contact Sales",
    ctaVariant: "outline",
    schoolLimit: "Unlimited schools",
  },
];

const ADD_ONS = [
  {
    title: "Medicaid Claim Prep",
    description: "Turns logged service minutes into a Medicaid-ready claim queue: CPT/HCPCS code mapping, unit calculation, diagnosis validation, and admin review. Exports a CSV your district (or your billing vendor / clearinghouse) uploads to your state Medicaid system. Noverta does not file claims, generate true X12 837P EDI, or follow up on adjudication.",
    pricing: "Included in Professional and Enterprise",
    detail: "No revenue share. Filing, clearinghouse fees, and reimbursement remain with the district or its billing vendor.",
    icon: "💰",
  },
  {
    title: "SIS Integrations",
    description: "CSV roster upload is fully supported today and is the recommended path for every district. Direct PowerSchool, Infinite Campus, and Skyward connectors are in early pilot — built but not yet validated against a live tenant of those vendors, so first-time setup is hands-on with Noverta engineering. Other systems (Aspen, Synergy, Aeries, Genesis, etc.) do not have a live API connector — bring your roster as a CSV export.",
    pricing: "Per connector",
    detail: "One-time setup + annual maintenance fee.",
    icon: "🔗",
  },
  {
    title: "Implementation & Training",
    description: "White-glove onboarding, data migration, and staff training to get your district up and running fast.",
    pricing: "One-time fee",
    detail: "Includes data migration, admin training, and 90-day support.",
    icon: "🎓",
  },
];

const FAQS = [
  {
    q: "How long does onboarding take?",
    a: "Pilot districts have moved from kickoff to live use in roughly 4–6 weeks, depending on how clean the source data is and how quickly admins can run the CSV imports and configure roles. Larger districts or messier data take longer. We do not lock in a guaranteed go-live date until after a data review.",
  },
  {
    q: "What about data migration from our current system?",
    a: "Migration today is CSV-based. Noverta ships generic CSV templates with a column-mapping wizard and row-level validation for students, staff, service requirements, session logs, and goals data, plus IEP PDF ingestion that auto-extracts goals, services, and accommodations. Two vendor-specific column presets are included out of the box today: Aspen X2 student rosters and eSPED service-grid exports. Any other system that can export to CSV — Frontline, SpedTrack, EasyIEP, SEIS, and similar — can be loaded through the generic templates, with column mapping done interactively in the wizard; we'll add a saved preset for your source system on request during onboarding. There are no live API connectors to those special-ed vendors today — those are roadmap items.",
  },
  {
    q: "How does Noverta handle student data privacy and security?",
    a: "Noverta is built to operate as a \u201cschool official\u201d under FERPA's legitimate educational interest provision and signs a Data Processing Agreement with every district (DPA, not a HIPAA BAA — Noverta does not process Protected Health Information). Data in transit is protected by TLS 1.2+; data at rest is encrypted by our managed PostgreSQL provider (AES-256). All data stays in the United States. Authentication is handled by Clerk, with optional MFA and SSO. Role-based access and district isolation are enforced server-side, and every change to student records is written to an append-only audit log. SOC 2 Type II is on the roadmap but not yet obtained, and no third-party penetration test has been performed on the current production environment yet — both are planned before broad enterprise rollout. Full details are in the Security Overview document on the Legal & Compliance page.",
  },
  {
    q: "What is the minimum contract length?",
    a: "Annual contracts with automatic renewal. We also offer multi-year agreements at a discounted rate. There are no long-term lock-ins — cancel with 60 days notice before renewal.",
  },
  {
    q: "Can we start with Essentials and upgrade later?",
    a: "Yes. You can upgrade your plan at any time and pay the prorated difference. Your data and configurations carry over when you move to a higher tier.",
  },
  {
    q: "Do you support Massachusetts state reporting requirements?",
    a: "Noverta is purpose-built against the Massachusetts SPED framework (603 CMR 28.00 and 46.00) and ships export templates structured around the fields DESE submissions require. The exports are designed to be uploaded into your district's existing state-reporting workflow — Noverta itself does not transmit data to DESE.",
  },
];

function FeatureCheck({ included }: { included: boolean }) {
  return included ? (
    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
  ) : (
    <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
  );
}

function TierCard({ tier, onCta }: { tier: TierConfig; onCta: (tier: string) => void }) {
  const modules = TIER_MODULES[tier.key] || [];

  return (
    <Card className={cn(
      "relative flex flex-col",
      tier.highlighted
        ? "border-emerald-600 border-2 shadow-lg scale-[1.02]"
        : "border-gray-200"
    )}>
      {tier.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-emerald-600 text-white px-3 py-1 text-xs font-medium">
            Most Popular
          </Badge>
        </div>
      )}

      <CardHeader className="pb-4 pt-6">
        <CardTitle className="text-xl font-semibold text-gray-900">{tier.name}</CardTitle>
        <p className="text-sm text-gray-500 mt-1">{tier.tagline}</p>
        <div className="mt-4">
          <span className="text-3xl font-bold text-gray-900">{tier.price}</span>
          <span className="text-sm text-gray-500 ml-1">{tier.priceUnit}</span>
        </div>
        {tier.billedNote && (
          <p className="text-xs text-gray-500 mt-1">{tier.billedNote}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">{tier.schoolLimit}</p>
        {tier.trialNote && (
          <p className="text-[11px] text-emerald-700 mt-2 font-medium">{tier.trialNote}</p>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        <div className="flex-1 space-y-5">
          {Object.entries(MODULE_CONFIG).map(([moduleKey, config]) => {
            const included = modules.includes(moduleKey);
            return (
              <div key={moduleKey}>
                <p className={cn(
                  "text-xs font-semibold uppercase tracking-wider mb-2",
                  included ? "text-emerald-700" : "text-gray-300"
                )}>
                  {config.label}
                </p>
                <ul className="space-y-1.5">
                  {config.features.map((fk) => (
                    <li key={fk} className="flex items-start gap-2">
                      <FeatureCheck included={included} />
                      <span className={cn(
                        "text-sm leading-tight",
                        included ? "text-gray-700" : "text-gray-300"
                      )}>
                        {FEATURE_LABELS[fk] ?? fk}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <Button
          className={cn(
            "w-full mt-6",
            tier.highlighted && "bg-emerald-600 hover:bg-emerald-700"
          )}
          variant={tier.ctaVariant}
          onClick={() => onCta(tier.key)}
        >
          {tier.cta}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

function FaqItem({ faq, open, onToggle }: { faq: { q: string; a: string }; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        className="w-full flex items-center justify-between py-4 text-left"
        onClick={onToggle}
      >
        <span className="text-sm font-medium text-gray-900 pr-4">{faq.q}</span>
        <ChevronDown className={cn(
          "w-5 h-5 text-gray-400 flex-shrink-0 transition-transform",
          open && "rotate-180"
        )} />
      </button>
      {open && (
        <p className="text-sm text-gray-600 pb-4 leading-relaxed">{faq.a}</p>
      )}
    </div>
  );
}

function DemoRequestForm({ defaultTier, onSuccess }: { defaultTier?: string; onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    district: "",
    role: "",
    message: "",
    tier: defaultTier || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${BASE_URL}api/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="demo-name">Full name</Label>
          <Input
            id="demo-name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            required
            placeholder="Jane Smith"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="demo-email">Work email</Label>
          <Input
            id="demo-email"
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
            placeholder="jane@district.org"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="demo-district">District name</Label>
          <Input
            id="demo-district"
            value={form.district}
            onChange={(e) => updateField("district", e.target.value)}
            required
            placeholder="Springfield Public Schools"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="demo-role">Your role</Label>
          <Input
            id="demo-role"
            value={form.role}
            onChange={(e) => updateField("role", e.target.value)}
            required
            placeholder="SPED Director"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="demo-message">Anything else we should know? (optional)</Label>
        <Textarea
          id="demo-message"
          value={form.message}
          onChange={(e) => updateField("message", e.target.value)}
          placeholder="Tell us about your district's needs..."
          rows={3}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700">
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            Request a Demo
          </>
        )}
      </Button>
    </form>
  );
}

export default function PricingPage() {
  const { isSignedIn, isLoaded: authLoaded } = useUser();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [selectedTier, setSelectedTier] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleCta = (tierKey: string) => {
    // Enterprise → demo / sales conversation. Self-serve checkout is not offered
    // for Enterprise because procurement, DPA review, and PO billing are negotiated.
    if (tierKey === "enterprise") {
      setSelectedTier(tierKey);
      setShowDemoForm(true);
      setSubmitted(false);
      setTimeout(() => {
        document.getElementById("demo-form-section")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      return;
    }

    // Essentials / Professional → real Stripe Checkout. The billing page reads
    // the ?plan=<tier> query param and auto-launches Checkout for the matching
    // monthly price. If the visitor is signed out, route through Clerk first.
    const target = `${BASE_URL}billing?plan=${tierKey}`;
    if (authLoaded && isSignedIn) {
      window.location.href = target;
    } else {
      const redirect = encodeURIComponent(target);
      window.location.href = `${BASE_URL}sign-in?redirect_url=${redirect}`;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Sprout className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-semibold text-gray-900">Noverta</span>
              <span className="text-xs text-gray-400 ml-2 hidden sm:inline">Service-minute compliance for SPED.</span>
            </div>
          </div>
          <a href={`${BASE_URL}sign-in`}>
            <Button variant="outline" size="sm">Sign In</Button>
          </a>
        </div>
      </header>

      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Shield className="w-4 h-4" />
            Purpose-built for Massachusetts SPED
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 tracking-tight">
            Make sure every IEP minute gets delivered.
          </h1>
          <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Noverta helps Massachusetts SPED teams track whether mandated services are actually being delivered, flag compliance gaps early, and reduce compensatory exposure before it grows.
          </p>
        </div>
      </section>

      <section className="pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
            {TIERS.map((tier) => (
              <TierCard key={tier.key} tier={tier} onCta={handleCta} />
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">
            All plans include unlimited staff accounts, TLS 1.2+ in transit, AES-256 at rest, FERPA-aligned data handling, and email support.
          </p>
        </div>
      </section>

      <section className="bg-gray-50 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900">Add-ons & Services</h2>
            <p className="text-sm text-gray-500 mt-2">Extend Noverta with additional capabilities for your district.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {ADD_ONS.map((addon) => (
              <Card key={addon.title} className="border-gray-200">
                <CardHeader className="pb-2">
                  <div className="text-2xl mb-2">{addon.icon}</div>
                  <CardTitle className="text-base font-semibold text-gray-900">{addon.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">{addon.description}</p>
                  <div className="bg-gray-50 rounded-md px-3 py-2">
                    <p className="text-sm font-medium text-emerald-700">{addon.pricing}</p>
                    <p className="text-xs text-gray-500">{addon.detail}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="demo-form-section" className="py-16 px-4">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <Building2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-gray-900">
              {showDemoForm ? "Talk to Sales — Enterprise" : "Multi-district or Enterprise?"}
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              {showDemoForm
                ? "Tell us about your district and we'll set up a personalized walkthrough of the Enterprise plan, including procurement, DPA review, and PO billing."
                : "Essentials and Professional are self-serve — start your 14-day free trial directly from the plan cards above. Enterprise (multi-district, custom procurement, dedicated implementation) goes through sales."}
            </p>
          </div>

          {!showDemoForm ? (
            <div className="text-center">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleCta("enterprise")}
              >
                Contact Enterprise Sales
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : submitted ? (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="py-8 text-center">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">We've received your request!</h3>
                <p className="text-sm text-gray-600">
                  Our team will reach out within one business day to schedule your demo.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <DemoRequestForm
                  defaultTier={selectedTier}
                  onSuccess={() => setSubmitted(true)}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="bg-gray-50 py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Frequently Asked Questions</h2>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200 px-6">
            {FAQS.map((faq, i) => (
              <FaqItem
                key={i}
                faq={faq}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-600 rounded-md flex items-center justify-center">
              <Sprout className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-700">Noverta</span>
            <span className="text-xs text-gray-400">Service-minute compliance for SPED.</span>
          </div>
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Noverta. FERPA-aligned. US-hosted. Data Processing Agreement available on request.
          </p>
        </div>
      </footer>

      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 p-3 z-50">
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          onClick={() => handleCta("enterprise")}
        >
          Request a Demo
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
      <div className="h-16 md:hidden" />
    </div>
  );
}
