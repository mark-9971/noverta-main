# Trellis — 10-Screen Demo Narrative

A click-by-click walkthrough for a live 15–20 minute district demo. Every screen
listed below maps to a real route in `artifacts/trellis/src/pages`. Do not
deviate; do not invent screens.

The order is deliberate: open with the director's pain (Action Center), prove
the data is real (Compliance Roster + Student Detail), show the work the staff
actually does (IEP Builder, Para My Day), close with the dollar story
(Compensatory + Executive + Reports).

## Demo operator notes (read before you start)

- **Demo as a district admin / director role.** Several of these screens are
  role-gated (notably `/executive`, `/aba`, `/medicaid-billing`, and parts of
  `/reports` are gated by `featureKey` flags such as `district.executive`,
  `clinical.program_data`, `district.medicaid_billing`). The MetroWest demo
  district admin user has all flags on; do not improvise into a staff or
  para session for the director walkthrough.
- **Use the MetroWest demo tenant.** It is the rehearsed seed (see
  `DEMO-READINESS-STATUS.md` Phase #5). Variety in claims, comp-ed
  obligations, parent-message categories, and transition plans is already
  populated.
- **Fallback navigation if a screen hiccups.** `/compliance` opens the
  compliance workspace if the `?tab=risk-report` query fails to land;
  `/iep-meetings?tab=calendar` is the canonical IEP calendar entry; the
  guardian portal is its own role-gated tenant — for a staff-role demo,
  show the parent-communication module at `/parent-communication` instead
  and describe the parent-side surface in words.
- **Do not click "Sync now" on any SIS connector** — vendor connectors are
  early-pilot tier per `lib/sis/STATUS.md` and not validated against a
  live tenant of those vendors. The CSV roster import is the GA path.

---

## 1. Action Center — `/action-center`

- **What to say:** "This is what your director sees the morning of any school
  day. Every red item is a student whose minutes-of-service are at risk this
  week. Not at quarter-end. This week."
- **What the prospect should feel:** Recognition. They have lived this Monday
  morning, on a spreadsheet.
- **Money moment:** Point at the count of "minutes at risk" in the header.
  "That's a comp-ed check the district isn't going to write."

## 2. Compliance Roster / Compliance Risk Report — `/compliance?tab=risk-report`

- **What to say:** "Same data, auditor's view. Sortable by school, case
  manager, service type. Every line shows minutes owed, minutes delivered,
  variance, and dollar exposure."
- **What the prospect should feel:** "Oh, this is what state monitoring is
  actually going to ask me for."
- **Money moment:** The estimated-exposure column. Even if it reads $0 in the
  demo seed, the *capability to compute it* is the point.

## 3. Student Detail — `/students/:id`

- **What to say:** "One student, one screen. Services on the left, IEP and
  goals in the middle, behavior plan and journey timeline on the right.
  This is the page a brand-new case manager opens on day one and
  immediately knows what to do."
- **What the prospect should feel:** Relief. Today their case managers keep
  this in their head.
- **Money moment:** "When a case manager quits in October, the next one
  picks this up in fifteen minutes instead of fifteen days."

## 4. IEP Builder — `/iep-builder` (walk Steps 1 → 5)

- **What to say:** "Eight to twelve hours of IEP drafting, down to about
  forty minutes. *Rule-based*, not generative — pulls present-levels,
  parent input, teacher input, transition data, and last year's progress
  data into a defensible draft. Clinician reviews and signs."
- **What the prospect should feel:** "We won't get sued for this." This is
  the slide where directors lean forward.
- **Money moment:** Step 5, the printable draft preview. "This is what
  goes into the meeting. Same format your clinicians already use."

## 5. Para "My Day" — `/my-day`

- **What to say:** "This is what a para sees on a Chromebook at 7:45 AM.
  Their day, their kids, their goals, their behavior plan. Two taps to
  log a session."
- **What the prospect should feel:** Empathy for the person doing the
  hardest job in the building. And recognition that paperwork is the #1
  reason paras quit.
- **Money moment:** Show the BIP card — the para can see the actual
  behavior plan instructions in plain language without hunting for a PDF.

## 6. Compensatory Services — `/compensatory`

- **What to say:** "When minutes do slip, this is the obligation tracker.
  Every owed minute, who owes it, when it has to be made up by, and the
  burndown."
- **What the prospect should feel:** "We are currently doing this on a
  legal pad."
- **Money moment:** The burndown chart — districts can see the obligation
  decreasing in real time, week by week.

## 7. Parent / Guardian Portal — `/guardian-portal`

- **What to say:** "Parents see their kid's services, their meeting
  invites, their messages, their signed documents. Auditable. They acknowledge,
  we log it, the date is defensible."
- **What the prospect should feel:** "This kills 80% of our parent
  complaints before they become due-process filings."
- **Money moment:** The acknowledgment timestamp. "PWN delivery is a
  due-process landmine. This removes it."

## 8. ABA Hub — `/aba`

- **What to say:** "For the BCBAs and behavior teams. FBAs, BIPs,
  program-target trial data, observation summaries — all in one place
  instead of in CentralReach plus four spreadsheets."
- **What the prospect should feel:** Either "we don't have BCBAs" (fine,
  skip) or "wait, you do *clinical* tooling too?"
- **Money moment:** Program-target trial data view. "BCBA can pull a
  full progress packet for the team meeting in under a minute."

## 9. Executive / Principal Dashboard — `/executive`

- **What to say:** "Up a level. This is the superintendent's view. Health
  score, by school. Compliance trend over the year. District comparisons
  if you're a collaborative or a county office."
- **What the prospect should feel:** Board-meeting confidence. "I can
  show this to the board next month."
- **Money moment:** The trend line going up. "This is what 'we fixed it'
  looks like to the people who fund you."

## 10. State Reporting / Reports — `/reports` and `/state-reporting`

- **What to say:** "And finally — the export the state actually asks for.
  Audit package, compliance trend, missed sessions, parent summary,
  executive summary, risk report. PDF or CSV, all signed and stamped with
  the audit log."
- **What the prospect should feel:** "Oh thank god."
- **Money moment:** "Last year your state-reporting cycle was three
  weeks of manual work. This is fifteen minutes."

---

## Closing line (verbatim)

> "Nine production modules. CSV roster import is GA; the four SIS
> connectors (PowerSchool, Infinite Campus, Skyward, SFTP) are written
> and in early-pilot tier. Tenant-isolated, audit-logged, FERPA-aligned.
> Pilot is thirty days, paid, with a real success metric we agree to
> upfront. What's the right next step on your side?"
