# Why Districts Buy Trellis

*Memo for the Director of Special Education / Assistant Superintendent.*

---

## The dollar and risk story

Special education is the single largest line item in your district that can
turn into a check you didn't budget for. Compensatory services owed at the
end of the year. Medicaid reimbursement you didn't capture. A due-process
filing that can cost a district tens of thousands to settle plus more in
attorney fees.
A state monitoring finding that puts you on a corrective action plan.

Trellis is built around the idea that all four of those costs come from the
same root cause: nobody sees the gap between what the IEP promised and what
actually happened until it's too late to fix.

What the system does about it, today:

- **Comp-ed exposure surfaces in real time.** Every minute owed vs delivered,
  every week, by student and by service line — not at quarter-end.
  (`/action-center`, `/compliance?tab=risk-report`, `/compensatory`)
- **Medicaid claim prep with CPT mapping.** Your billable services get
  mapped, queued, and exported in the format your clearinghouse already
  accepts. Recapture rate goes up because nothing falls off the page.
  (`/medicaid-billing`)
- **A defensible audit trail.** Every write is logged with actor, district,
  and before/after. When the state monitor or due-process attorney asks
  "show me the records," you can. (`lib/auditLog.ts`)
- **The 60-day evaluation timer is always visible.** Active referral
  countdowns surface on the dashboard so an evaluation never quietly slips
  into noncompliance. (`/evaluations`)

## The staff-retention story

Case managers and paras don't quit because of the kids. They quit because of
the paperwork.

Today, a case manager on a 28-student caseload spends an average of 12 to 15
hours a week on documentation that is duplicated across three systems and
two spreadsheets. A para spends 30 minutes at the end of every day trying to
remember what happened in the morning.

What the system does about it, today:

- **One screen per student.** Services, IEP, behavior plan, comp-ed,
  parent communications, journey timeline. The case manager's mental
  model finally has a home. (`/students/:id`, Student Detail)
- **Para "My Day" on a Chromebook.** Their day, their kids, their goals,
  their BIP — and a two-tap session log that takes seconds, not minutes.
  (`/my-day`)
- **IEP Builder cuts drafting from 8–12 hours to about 40 minutes.** Rule-
  based, defensible, clinician-reviewed. The single highest-leverage time
  save in the entire workflow. (`/iep-builder`)
- **Caseload balancing.** Workload visibility for the director, so the
  20%-of-staff-doing-50%-of-work problem stops happening. (`/caseload-balancing`)

## The parent-trust story

The fastest path to a due-process filing is a parent who feels unheard.
Most filings come from communication failures, not service failures.

What the system does about it, today:

- **A parent portal where guardians see their kid's services, meetings,
  messages, and signed documents.** Acknowledgments are timestamped and
  audit-logged, which kills 80% of "I never received that PWN" disputes.
  (`/guardian-portal`)
- **Parent communications categorized and tracked.** PWN, IEP-invite,
  progress reports, conference scheduling — all logged, all retrievable.
  (`/parent-communication`)
- **Document e-sign workflow.** The signed copy lives in the same system
  the case manager and director use; no PDF email chains to lose.
  (`/document-workflow`, `/sign-document`)

## First 90 days of value

These are grounded in features actually shipped today, not the roadmap.

- **Days 1–14:** CSV roster import live; pilot district configured;
  baseline compliance snapshot captured. Case managers and paras
  onboarded on Student Detail and Para "My Day."
- **Days 15–45:** Service-delivery logging running for every active
  service line. Action Center surfacing minutes-at-risk by Monday of
  each week. First comp-ed obligations created and started burning down.
- **Days 46–75:** IEP Builder used for first 5–10 annual reviews.
  Medicaid claim prep + CSV export running; first batch sent to district
  clearinghouse. Guardian portal opened to a pilot cohort of families.
- **Days 76–90:** First state-reporting export run end-to-end. First
  monthly comparison vs baseline shared with the superintendent.
  Decision point: expand to remaining schools.

## The bottom line

You buy Trellis because in 90 days you will be able to walk into a board
meeting, point at a chart, and say: *we know exactly which students are at
risk, exactly how many minutes we owe, exactly how many we recovered, and
exactly what we'll claim back from Medicaid.* And then you will say it again
the next month, and the month after.

That sentence, said with evidence, is what districts are buying.
