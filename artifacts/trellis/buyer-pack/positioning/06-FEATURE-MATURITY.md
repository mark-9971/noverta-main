# Noverta — Feature Maturity

Three honest buckets. Every item is tagged with the page or module that backs
it up. If a feature is in PROPOSED state on the project task board, it does
**not** appear in "Strong now" or "Pilot-ready."

---

## Strong now (GA-quality, demo with confidence)

- **Service-delivery logging** — `/sessions`, `/support-session`, `/today`,
  `/my-schedule`. Log, edit, mark missed, history dialog, goal-linked.
- **Minutes-at-risk compliance engine** — `/action-center`,
  `/compliance?tab=risk-report`, `/compliance-trends`,
  `/weekly-compliance-summary`. Computes minutes owed vs delivered per
  service line, surfaces risk before quarter-end.
- **Compensatory services tracking** — `/compensatory` (single workspace
  hosting both Services and Finance as tabs; legacy `/compensatory-services`
  and `/compensatory-finance` URLs redirect here). Obligation creation,
  burndown, log-against-obligation, shortfall calculator.
- **ABA / BIP / FBA clinical tools** — `/aba`, `/behavior-assessment`,
  `/protective-measures`. Program-target trial data, observation
  summaries, BIP CRUD, FBA workflow, restraint incident lifecycle.
- **SIS connectors (CSV)** — `lib/sis/csvConnector.ts`. CSV roster import
  is GA. Used by every demo district.
- **Audit logging** — `lib/auditLog.ts`. Every tenant-scoped write is
  audit-logged with actor, district, before/after.
- **Multi-school / multi-district tenancy** — `lib/districtScope.ts`,
  `getEnforcedDistrictId`, per-district isolation across 480+ route
  handlers (see `buyer-pack/SECURITY-AUDIT.md`).
- **Para "My Day"** — `/my-day`. Agenda, assigned BIPs, two-tap
  session log, goals summary, schedule blocks.
- **IEP meeting management** — `/iep-meetings` (legacy `/iep-calendar`
  redirects here as the calendar tab; `/iep-search` redirects to
  `/iep-builder`). Schedule, invite, agenda, notes.
- **Document workflow + e-sign** — `/document-workflow`,
  `/sign-document`. Routing, acknowledgments, signature capture.
- **State reporting exports** — `/state-reporting`, `/reports` (Audit
  Package, Compliance Trend, Missed Sessions, Parent Summary, Executive
  Summary, Risk, Pilot Health, Minute Summary).
- **Stripe-based tenant billing** — `lib/stripe`, `/billing`,
  `/billing-rates`, `/upgrade`. District subscriptions, plan tiers, paid
  pilot collection.

## Pilot-ready (works end-to-end, needs real-customer hardening)

- **IEP Builder (rule-based draft assembly)** — `/iep-builder` Steps 1–5.
  Pulls present-levels, parent input, teacher input, transition data,
  prior progress; assembles a defensible draft. Clinician reviews + signs.
  *Not* generative.
- **PowerSchool / Infinite Campus / Skyward / SFTP connectors** —
  `lib/sis/{powerschool,infiniteCampus,skyward,sftpConnector}.ts`.
  Tier = `early_pilot` per `lib/sis/STATUS.md`. Code is written; setup
  saves credentials and the connector ingest path runs end-to-end, but
  it is **not yet validated against a live tenant** of those vendors.
  Needs a pilot district on each vendor to harden.
- **Medicaid claim prep + CSV export** — `/medicaid-billing`,
  `routes/medicaidBilling/{claims,cptMappings,reports}.ts`. CPT mapping,
  claims queue, exports CSV the district uploads to its clearinghouse.
- **AI-assisted PDF IEP import** — `routes/imports/iepDocuments.ts`
  (LLM extracts goals, clinician reviews and approves). Saves hours
  during onboarding; needs more PDF variety.
- **Guardian / Parent Portal** — `/guardian-portal`. Documents, messages,
  meetings, contact history, acknowledgments.
- **District benchmarks / comparisons** — `/district-overview`,
  `DistrictComparisonCard`. Cross-district health for collaboratives /
  county offices.
- **Evaluation 60-day timeline tracking** — `/evaluations`,
  `complianceTimeline.ts`. Active referral timer, deadline surfacing.
- **Transition planning** — `/transitions`. Plans, goals, agency
  referrals (24 goals + 12 referrals seeded in MetroWest demo).
- **Contracted provider / agency management** — `/agencies`,
  `/agency-detail`, `/contract-utilization`. Outside-provider
  contracts, utilization, rate cards.
- **Caseload balancing** — `/caseload-balancing`. Workload visualization
  and reassignment workflow.

## Still roadmap (do **not** demo as live)

- **Direct Medicaid clearinghouse submission** — today the district
  exports CSV and uploads to its own clearinghouse. Direct submission is
  on the roadmap.
- **Real email-based parent invites at scale** — guardian-portal exists;
  bulk email-invite delivery and bounce handling is not GA.
- **Staff credentialing automation** — credentials are visible in staff
  records; automated expiration alerts and self-service renewal are
  proposed work.
- **Certain executive-finance dashboards** — top-line cost-avoidance
  views exist (`/cost-avoidance`); some board-finance roll-ups are
  planned.
- **Outbound partner webhooks** — only Stripe webhooks ship today.
  Outbound event streaming for SIS partners is on the roadmap.
- **Anything tagged PROPOSED on the project board** (#553–#591 etc.) —
  if it's not merged, it's not demoed. Includes: parent-portal email
  invites at scale, credential expiration emails, IEP-nav restructure,
  printable journey timeline, district-scoped 60-day risk panel on
  admin home, and other items currently in proposed state.
