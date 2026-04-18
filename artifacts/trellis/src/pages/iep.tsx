import { GraduationCap, Users, Calendar, Search, Sparkles } from "lucide-react";
import { Link } from "wouter";

const QUICK_LINKS = [
  {
    href: "/iep-meetings",
    label: "IEP Meetings",
    description: "Schedule, track attendees, and log consent",
    icon: Users,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100 hover:border-emerald-300",
  },
  {
    href: "/iep-calendar",
    label: "IEP Calendar",
    description: "Annual reviews, reevals, and compliance deadlines",
    icon: Calendar,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100 hover:border-blue-300",
  },
  {
    href: "/iep-search",
    label: "IEP Search",
    description: "Find IEP documents and goals across students",
    icon: Search,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-100 hover:border-violet-300",
  },
  {
    href: "/iep-builder",
    label: "IEP Builder",
    description: "Draft a new IEP with AI-assisted questionnaires",
    icon: Sparkles,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-100 hover:border-amber-300",
  },
];

export default function IepHub() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
          <GraduationCap className="w-5 h-5 text-emerald-600" />
          IEP Hub
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage meetings, compliance deadlines, document search, and IEP drafting.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {QUICK_LINKS.map(({ href, label, description, icon: Icon, color, bg, border }) => (
          <Link key={href} href={href}>
            <a className={`flex items-start gap-4 p-5 rounded-xl border bg-white transition-colors ${border} group`}>
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>
              </div>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
