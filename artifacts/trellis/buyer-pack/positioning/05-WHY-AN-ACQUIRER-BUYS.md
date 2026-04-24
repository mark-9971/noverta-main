# Why an Acquirer Buys Noverta

*Memo for corp dev at PowerSchool, Frontline, Instructure, Renaissance, or a
PE roll-up.*

---

## Strategic gap being filled

The K-12 special-education category is large, fragmented, and structurally
under-built. Every major incumbent has the same gap: they sell IEP forms
and call it sped. Nobody ships the *operations* layer underneath — service
delivery logging, minutes-at-risk compliance, comp-ed tracking, paras' daily
workflow, and director-level dashboards. The result is that districts buy
3–5 products to cover what should be one.

Noverta is built sped-first, modern stack, multi-tenant from day one. For an
acquirer, it slots in as the operations and compliance engine that turns an
existing IEP forms business (Frontline SEAS, PowerSchool Special Programs,
Embrace, SameGoal) into a workflow business — which is a meaningfully
better revenue and retention profile than forms alone.

## Multi-tenant architecture readiness

- Every tenant-scoped table is district-isolated through a single
  `getEnforcedDistrictId` helper plus per-table `assert*InCallerDistrict`
  guards. ~480 route handlers across 64 modules.
- A documented, ongoing tenant-isolation audit (see
  `buyer-pack/SECURITY-AUDIT.md`): 5 files / 14 handlers fixed in the last
  sweep, 13 files queued in Bucket-D and not yet cleared (none on the
  demo showcase path), with mechanical safeguards added so the same
  class of bug fails the next contributor's PR.
- Audit logging is centralized (`lib/auditLog.ts`) and covers every
  tenant-scoped write with actor, district, and before/after.
- A regression suite (`tests/23-bucket-a-tenant-isolation.test.ts`)
  asserts cross-district reads return 404 and cross-district writes
  create no rows.

This is not a single-tenant app retrofitted into a SaaS. The boundary is
load-bearing in the codebase.

## SIS-integration breadth already shipped

- **CSV roster import (GA)** — used by every demo district.
- **PowerSchool, Infinite Campus, Skyward, SFTP** — connectors are
  written and shipped at `early_pilot` tier in `lib/sis/STATUS.md`.
  Code lives in `lib/sis/{powerschool,infiniteCampus,skyward,sftpConnector}.ts`.
  Per the STATUS doc, these are **not yet validated against a live tenant**
  of those vendors — the framework, the credential capture, and the
  ingest path are all in place; production pilot validation is the
  remaining work.

For a PowerSchool acquirer this is a wedge into IC and Skyward districts
without a full rip-and-replace. For an Instructure or Renaissance acquirer
this is roster ingestion they don't have today.

## ARR-quality of the customer

- Districts are multi-year, sticky, and procurement-cycle predictable.
- Stripe-based district billing already shipped (`lib/stripe`,
  `/billing`, `/billing-rates`, `/upgrade`) — paid pilot collection is
  live, not a future project.
- Pilot model is structured: 30-day, paid, with an agreed success metric
  upfront. This filters out tire-kickers and produces a clean
  pilot→annual conversion narrative.

## Tech stack defensibility

- TypeScript end-to-end. Express + Drizzle + Postgres on the API. React
  + Vite on the web. pnpm monorepo with project references and shared
  zod schemas (`@workspace/api-zod`) generated from a single OpenAPI
  source of truth (`@workspace/api-spec`).
- Codegen pipeline is gated by CI (`scripts/check-api-codegen.sh`).
- Auth via Clerk. Object storage via the workspace `object-storage-web`
  abstraction. AI services routed through the integrations proxy
  (no API-key sprawl).
- Vitest test suite, including a tenant-isolation regression suite an
  acquirer can run on their own infra.

This is not a stack a buyer has to rewrite to integrate.

## "Build vs buy vs partner" math for the acquirer

- **Build:** multi-year and multi-million-dollar loaded cost (founder's
  rough order of magnitude, not a benchmarked figure), and the buyer's
  own engineering
  team has to learn special-ed compliance domain knowledge that took
  Noverta founders years.
- **Partner:** Reseller agreements in this category are notoriously
  brittle; districts buy from one vendor or none.
- **Buy:** Acquirer captures the operations layer, the existing
  pilot/customer relationships, the SIS connector library, and the
  domain-expert founding team, in one transaction.

## What an acquirer would *not* be buying yet (be honest about this)

Buyers who do diligence well will ask all of these. Pretending otherwise
lowers credibility and price.

- **Small ARR.** Pilot-stage. Don't price this as a recurring-revenue
  buyout; price it as a strategic acquihire-plus-tech.
- **Unproven at full district scale.** Largest current footprint is mid-
  sized district / collaborative scope, not a 50,000-student urban
  district.
- **No SOC 2 yet.** SOC 2 Type II is on the roadmap and honestly framed
  as such on the pitch deck. FERPA-aligned data handling is in place;
  formal certification is not.
- **No mobile native apps.** The para experience is mobile-web on a
  Chromebook, which works for the actual deployment context (school
  Chromebooks) but is not a native iOS/Android product.
- **State-reporting coverage is not all-50-states.** Coverage is real
  for the states the pilot districts operate in; expansion is straight-
  line work, not a research project, but it's work.
- **Direct Medicaid clearinghouse submission is not built.** Today the
  district exports CSV and uploads. This is a known roadmap item.
- **Outbound partner webhooks are not built.** Only Stripe webhooks
  exist today. Inbound integration is real; outbound event streaming is
  roadmap.

## The bottom line for corp dev

Noverta is the operations and compliance layer the K-12 special-education
category has been missing. The architecture is buyer-ready (multi-tenant,
audit-logged, OpenAPI-typed, codegen-gated). The customer model is
pilot-validated and Stripe-collected. The honest gaps (SOC 2, native
mobile, Medicaid direct-submit, scale) are all known and on the roadmap.

Acquired into a forms-incumbent stack, Noverta turns a transactional
forms business into a workflow business — which is the strategic
re-rating most of these incumbents need.
