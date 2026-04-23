import React from "react";
import { CheckCircle2, Minus, Crown, Sparkles, Shield, ArrowUpCircle, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTier } from "@/lib/tier-context";

type Tier = "core" | "pro" | "elite";

interface FeatureRow {
  label: string;
  core: boolean | "always";
  pro: boolean;
  elite: boolean;
  note?: string;
}

interface FeatureGroup {
  heading: string;
  features: FeatureRow[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    heading: "Core — Always Included",
    features: [
      { label: "Session Quick-Log", core: "always", pro: true, elite: true },
      { label: "Compliance Monitoring (service minutes)", core: "always", pro: true, elite: true },
      { label: "Action Center (alerts & flags)", core: "always", pro: true, elite: true },
      { label: "Basic Alerts", core: "always", pro: true, elite: true },
      { label: "IEP Tracking (basic)", core: "always", pro: true, elite: true },
      { label: "Student & Staff Directory", core: "always", pro: true, elite: true },
      { label: "Document Workflow", core: "always", pro: true, elite: true },
      { label: "Weekly Compliance Summary", core: "always", pro: true, elite: true },
      { label: "Reports (standard)", core: "always", pro: true, elite: true },
      { label: "Data Import & Health Check", core: "always", pro: true, elite: true },
    ],
  },
  {
    heading: "PRO — Clinical & Engagement",
    features: [
      { label: "Scheduling Overlay (staff calendar, coverage)", core: false, pro: true, elite: true },
      { label: "Advanced Reports", core: false, pro: true, elite: true },
      { label: "Compensatory Tracker", core: false, pro: true, elite: true },
      { label: "ABA Program Data & Graphing", core: false, pro: true, elite: true },
      { label: "FBA / BIP Management", core: false, pro: true, elite: true },
      { label: "AI-Powered IEP Goal Suggestions", core: false, pro: true, elite: true },
      { label: "BCBA Supervision Logging", core: false, pro: true, elite: true },
      { label: "Parent Communication Portal", core: false, pro: true, elite: true },
      { label: "Parent Portal & Document Sharing", core: false, pro: true, elite: true },
      { label: "Translation Services", core: false, pro: true, elite: true },
      { label: "IEP Meetings & Progress Reports", core: false, pro: true, elite: true },
      { label: "Transition Planning", core: false, pro: true, elite: true },
      { label: "Caseload Balancing (single school)", core: false, pro: true, elite: true },
    ],
  },
  {
    heading: "ELITE — District Leadership",
    features: [
      { label: "Executive Dashboard", core: false, pro: false, elite: true },
      { label: "District Overview (multi-school)", core: false, pro: false, elite: true },
      { label: "Cross-School Caseload Balancing", core: false, pro: false, elite: true },
      { label: "Medicaid Billing & Claims Management", core: false, pro: false, elite: true },
      { label: "Agency & Contracted Provider Management", core: false, pro: false, elite: true },
      { label: "Contract Utilization Reporting", core: false, pro: false, elite: true },
      { label: "District Budget & Cost-Avoidance Tracking", core: false, pro: false, elite: true },
      { label: "Single Sign-On (SSO / SAML)", core: false, pro: false, elite: true },
      { label: "State Reporting (Medicaid-ready exports)", core: false, pro: false, elite: true },
    ],
  },
];

function TierCheck({ value }: { value: boolean | "always" }) {
  if (value === "always") {
    return (
      <span className="flex items-center justify-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span className="hidden sm:inline">Always</span>
      </span>
    );
  }
  if (value) {
    return <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />;
  }
  return <Minus className="w-4 h-4 text-gray-300 mx-auto" />;
}

export default function UpgradePage() {
  const { tier } = useTier();

  const currentLabel =
    tier === "enterprise" ? "ELITE" : tier === "professional" ? "PRO" : "CORE";

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8 text-center">
        <Badge variant="outline" className="mb-3 text-xs font-medium">
          Currently on <strong className="ml-1">{currentLabel}</strong>
        </Badge>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Plans &amp; Features</h1>
        <p className="text-gray-500 max-w-xl mx-auto text-sm">
          Every Noverta plan starts with the survival features your team depends on every day.
          Upgrade to unlock clinical workflows, engagement tools, and district-wide oversight.
        </p>
      </div>

      {/* Tier header cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <TierCard
          tier="core"
          label="CORE"
          icon={<Shield className="w-5 h-5 text-gray-600" />}
          tagline="Compliance essentials"
          highlight={tier === "essentials"}
          price="Contact us"
          cta={null}
          colorClass="border-gray-200"
          badgeClass="bg-gray-100 text-gray-700"
        />
        <TierCard
          tier="pro"
          label="PRO"
          icon={<Sparkles className="w-5 h-5 text-emerald-600" />}
          tagline="Clinical & engagement"
          highlight={tier === "professional"}
          price="Contact us"
          cta={
            <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm gap-2 mt-3">
              <Link href="/billing">
                <ArrowUpCircle className="w-4 h-4" />
                Get PRO
              </Link>
            </Button>
          }
          colorClass="border-emerald-300 shadow-emerald-100"
          badgeClass="bg-emerald-100 text-emerald-700"
        />
        <TierCard
          tier="elite"
          label="ELITE"
          icon={<Crown className="w-5 h-5 text-violet-600" />}
          tagline="District leadership"
          highlight={tier === "enterprise"}
          price="Contact us"
          cta={
            <Button asChild className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm gap-2 mt-3">
              <a
                href="mailto:sales@trellis.education?subject=Noverta%20ELITE%20Inquiry"
                target="_blank"
                rel="noreferrer"
              >
                <Crown className="w-4 h-4" />
                Talk to Sales
                <ExternalLink className="w-3 h-3 ml-1 opacity-70" />
              </a>
            </Button>
          }
          colorClass="border-violet-200 shadow-violet-100"
          badgeClass="bg-violet-100 text-violet-700"
        />
      </div>

      {/* Feature comparison table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 font-semibold text-gray-700 w-1/2">Feature</th>
              <th className="text-center px-3 py-3 font-semibold text-gray-600 w-[16.66%]">CORE</th>
              <th className="text-center px-3 py-3 font-semibold text-emerald-700 w-[16.66%]">PRO</th>
              <th className="text-center px-3 py-3 font-semibold text-violet-700 w-[16.66%]">ELITE</th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_GROUPS.map((group) => (
              <React.Fragment key={group.heading}>
                <tr className="bg-gray-50 border-t border-b border-gray-100">
                  <td colSpan={4} className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                    {group.heading}
                  </td>
                </tr>
                {group.features.map((row, i) => (
                  <tr
                    key={row.label}
                    className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"} hover:bg-emerald-50/30 transition-colors`}
                  >
                    <td className="px-5 py-2.5 text-gray-700">
                      <span className="flex items-center gap-2">
                        {row.label}
                        {row.core === "always" && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap">
                            Always included
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <TierCheck value={row.core} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <TierCheck value={row.pro} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <TierCheck value={row.elite} />
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom CTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-emerald-800 text-sm">Ready for PRO?</span>
          </div>
          <p className="text-xs text-emerald-700 mb-3">
            Unlock ABA data, parent engagement, advanced scheduling, and clinical workflows for your team.
          </p>
          <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            <Link href="/billing">
              <ArrowUpCircle className="w-3.5 h-3.5" />
              View Billing &amp; Upgrade
            </Link>
          </Button>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-violet-600" />
            <span className="font-semibold text-violet-800 text-sm">Interested in ELITE?</span>
          </div>
          <p className="text-xs text-violet-700 mb-3">
            District-wide dashboards, Medicaid billing, multi-school oversight, SSO — built for leadership teams.
          </p>
          <Button asChild size="sm" className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
            <a
              href="mailto:sales@trellis.education?subject=Noverta%20ELITE%20Inquiry"
              target="_blank"
              rel="noreferrer"
            >
              <Crown className="w-3.5 h-3.5" />
              Talk to Sales
            </a>
          </Button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Questions about pricing or a custom quote?{" "}
        <a
          href="mailto:sales@trellis.education"
          className="text-emerald-600 hover:underline"
        >
          Contact our team
        </a>
        .
      </p>
    </div>
  );
}

interface TierCardProps {
  tier: Tier;
  label: string;
  icon: React.ReactNode;
  tagline: string;
  highlight: boolean;
  price: string;
  cta: React.ReactNode;
  colorClass: string;
  badgeClass: string;
}

function TierCard({
  label,
  icon,
  tagline,
  highlight,
  price,
  cta,
  colorClass,
  badgeClass,
}: TierCardProps) {
  return (
    <div
      className={`rounded-xl border-2 px-4 py-4 shadow-sm ${colorClass} ${highlight ? "ring-2 ring-offset-1 ring-emerald-400" : ""}`}
    >
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold mb-2 ${badgeClass}`}>
        {icon}
        {label}
      </div>
      {highlight && (
        <span className="ml-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
          Current plan
        </span>
      )}
      <p className="text-xs text-gray-500 mt-1">{tagline}</p>
      <p className="text-xs font-medium text-gray-400 mt-2">{price}</p>
      {cta}
    </div>
  );
}
