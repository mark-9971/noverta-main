/**
 * RoleFirstRunCard — honest, role-specific empty state for non-admin
 * roles when the district isn't fully set up for their part of Noverta
 * yet. Each variant explains four things in plain language:
 *
 *   1. What this role uses Noverta for
 *   2. What needs to happen first (and who does it)
 *   3. What they can do *now* (concrete safe links)
 *   4. What to expect next (so the empty state doesn't feel like a bug)
 *
 * Drop this in wherever a role's primary surface has no data yet — e.g.
 * `/my-caseload` for providers with no assignments, `/para-my-day` for
 * paras with no schedule blocks, `/guardian-portal` for parents with no
 * documents/messages/meetings, `/sped-portal` for students with no
 * goals/sessions.
 *
 * The copy is intentionally specific (not generic placeholder text) so
 * a brand-new user understands their place in the system on first
 * login.
 */
import { Link } from "wouter";
import {
  Briefcase, Clock, Users, GraduationCap,
  ArrowRight, ListChecks, MessageSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type FirstRunRole = "provider" | "para" | "guardian" | "student";

interface ActionLink {
  label: string;
  href: string;
  testId?: string;
}

interface RoleCopy {
  icon: LucideIcon;
  accent: string;          // Tailwind classes for the icon tile
  ring: string;            // Tailwind class for the card ring
  eyebrow: string;         // small uppercase label
  title: string;           // primary headline
  whatItsFor: string;      // 1–2 sentence "what you'll use Noverta for"
  whatsNeededFirst: string;// who needs to do what before this surface lights up
  whatYouCanDoNow: string; // a sentence describing the safe actions
  whatToExpectNext: string;// what will appear automatically once setup catches up
  actions: ActionLink[];   // 1–3 concrete links the role can use right now
}

const COPY: Record<FirstRunRole, RoleCopy> = {
  provider: {
    icon: Briefcase,
    accent: "bg-emerald-50 text-emerald-700 border-emerald-100",
    ring: "ring-emerald-100",
    eyebrow: "Provider · first login",
    title: "Your caseload will appear here once students are assigned to you",
    whatItsFor:
      "Noverta is where you log service sessions, see required vs. delivered minutes per student, and spot the IEPs that need attention before they fall out of compliance.",
    whatsNeededFirst:
      "Your district admin needs to (1) import the SPED roster, (2) capture each student's service requirements (e.g. 120 min/month of speech), and (3) assign you as the provider on the requirements you cover. Until step 3 happens, your caseload will be empty.",
    whatYouCanDoNow:
      "You can browse the student directory to confirm your students are on file, log a one-off session if a student you cover is already in the system, and review the schedule view to see anything already on your calendar.",
    whatToExpectNext:
      "The moment an admin assigns you to a service requirement, the student appears here with their weekly minute target and a Log Session button. Compliance percentages update automatically as you log.",
    actions: [
      { label: "Browse all students", href: "/students", testId: "first-run-action-students" },
      { label: "Open the schedule", href: "/schedule", testId: "first-run-action-schedule" },
      { label: "Log a session", href: "/sessions", testId: "first-run-action-sessions" },
    ],
  },
  para: {
    icon: Clock,
    accent: "bg-amber-50 text-amber-700 border-amber-100",
    ring: "ring-amber-100",
    eyebrow: "Paraprofessional · first login",
    title: "Your day will fill in once you're assigned to a schedule",
    whatItsFor:
      "Noverta is where you see your daily schedule of student support blocks, run quick session timers, log behavior data and BIP trials, and check the alerts your supervising teacher has flagged for you.",
    whatsNeededFirst:
      "Your supervising teacher or admin needs to (1) build the daily schedule blocks that you cover, and (2) attach you to those blocks as the assigned para. If you support BIPs (behavior intervention plans), they'll also assign those to you so you can record trials.",
    whatYouCanDoNow:
      "You can pick a different date to check whether the schedule is set up for a future day, and review any BIPs already assigned to you. If you're supposed to be on the schedule today, ping your supervising teacher.",
    whatToExpectNext:
      "Once your blocks are in, this page becomes your live agenda — current block, what's next, quick start/stop timer, and one-tap missed-session reasons. Anything you log here flows straight into the student's compliance record.",
    actions: [
      { label: "View any assigned BIPs", href: "/behavior-assessment", testId: "first-run-action-bips" },
      { label: "Open the schedule", href: "/schedule", testId: "first-run-action-schedule" },
    ],
  },
  guardian: {
    icon: Users,
    accent: "bg-blue-50 text-blue-700 border-blue-100",
    ring: "ring-blue-100",
    eyebrow: "Parent / Guardian · first login",
    title: "Your child's documents and messages will appear here",
    whatItsFor:
      "This is your secure portal to see IEP documents, sign or acknowledge what the school sends you, view upcoming meetings, message the team directly, and keep a record of every contact.",
    whatsNeededFirst:
      "Your child's case manager needs to (1) link your guardian record to your child in Noverta, then (2) share documents, schedule meetings, or send a message for anything to appear here. Most schools set this up around the IEP meeting cycle.",
    whatYouCanDoNow:
      "If you were expecting documents or a meeting invite and don't see one, contact your child's case manager or the special-education office at your school. They can confirm your portal is correctly linked.",
    whatToExpectNext:
      "When the team shares something — an IEP draft, a consent form, a meeting invite, a progress note — you'll see it here right away, and you can respond from this screen without printing or scanning anything.",
    actions: [
      { label: "Check messages", href: "/guardian-portal/messages", testId: "first-run-action-messages" },
      { label: "View upcoming meetings", href: "/guardian-portal/meetings", testId: "first-run-action-meetings" },
      { label: "Contact history", href: "/guardian-portal/contact-history", testId: "first-run-action-contact" },
    ],
  },
  student: {
    icon: GraduationCap,
    accent: "bg-rose-50 text-rose-700 border-rose-100",
    ring: "ring-rose-100",
    eyebrow: "Student portal · first login",
    title: "Your goals and support sessions will show up here",
    whatItsFor:
      "This is your space to see the goals your IEP team is helping you work toward, check your sessions and streak, do a quick daily check-in about how you're feeling, and celebrate the wins your teachers log for you.",
    whatsNeededFirst:
      "Your case manager needs to (1) make sure your IEP goals are entered in Noverta and (2) make sure the providers who help you (speech, OT, counseling, etc.) are logging your sessions. Once that's happening, this page lights up.",
    whatYouCanDoNow:
      "You can do a daily check-in any time — it just takes a moment and helps your team understand how things are going. Your check-in streak starts as soon as you do your first one.",
    whatToExpectNext:
      "After your team logs a few sessions, you'll see your goal progress, recent sessions, and any wins they've recorded for you. Don't worry if it's quiet at first — that's normal in the first week or two.",
    actions: [
      { label: "Do today's check-in", href: "/sped-portal/check-in", testId: "first-run-action-checkin" },
      { label: "See my goals", href: "/sped-portal/goals", testId: "first-run-action-goals" },
    ],
  },
};

interface Props {
  role: FirstRunRole;
  /** Optional name to personalize the headline ("Hi, Jamie — …"). */
  personName?: string;
  /** Compact variant: smaller padding, no ring, suitable for embedding
   *  at the top of an existing dashboard surface. */
  compact?: boolean;
}

export default function RoleFirstRunCard({ role, personName, compact = false }: Props) {
  const c = COPY[role];
  const Icon = c.icon;

  return (
    <section
      className={`bg-white border border-gray-200 rounded-2xl ${compact ? "p-4 md:p-5" : "p-5 md:p-6"} shadow-sm ring-1 ${c.ring}`}
      data-testid={`first-run-card-${role}`}
      aria-label={`First-run guide for ${role}`}
    >
      <header className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${c.accent}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {c.eyebrow}
          </p>
          <h2 className="text-base md:text-lg font-bold text-gray-900 leading-snug mt-0.5">
            {personName ? `Hi, ${personName} — ` : ""}{c.title}
          </h2>
        </div>
      </header>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 ${compact ? "mt-3" : "mt-4"}`}>
        <Block n={1} label="What you'll use Noverta for" body={c.whatItsFor} />
        <Block n={2} label="What needs to happen first" body={c.whatsNeededFirst} />
        <Block n={3} label="What you can do right now" body={c.whatYouCanDoNow} />
        <Block n={4} label="What to expect next" body={c.whatToExpectNext} />
      </div>

      {c.actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {c.actions.map((a, i) => (
            <Link
              key={a.href}
              href={a.href}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg ${
                i === 0
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
              data-testid={a.testId}
            >
              {a.label} <ArrowRight className="w-3 h-3" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function Block({ n, label, body }: { n: number; label: string; body: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-[13px] text-gray-700 mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

/* Re-exports kept in case a caller wants to extend with a custom icon row. */
export const FIRST_RUN_ICONS = { ListChecks, MessageSquare };
