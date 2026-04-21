# Trellis — Risks and Gaps (Honest Edition)

A list of the things that will get challenged in a serious buyer or diligence
call, with talking points and mitigations next to each one. The point of this
document is not to hide anything; it is to make sure the founder is the first
voice to name each gap, with a credible mitigation in the same breath.

---

## 1. Pilot count is small

- **The challenge:** "How many districts are paying you today?"
- **The honest answer:** Pilot stage. Mid-sized districts and a
  collaborative. Not a 50,000-student urban yet.
- **Mitigation / talking point:** Pilots are 30-day, paid, with an agreed
  success metric upfront. We're optimizing for conversion quality, not
  logo count. The MetroWest pilot has comp-ed exposure, parent
  acknowledgments, and Medicaid claim prep all running on real data.

## 2. Security posture — SOC 2

- **The challenge:** "Are you SOC 2?"
- **The honest answer:** SOC 2 Type II is on the roadmap, not certified.
- **Mitigation / talking point:** FERPA-aligned data handling is in place
  today: per-district tenant isolation enforced at ~480 route handlers
  (`lib/districtScope.ts`), centralized audit logging
  (`lib/auditLog.ts`), Clerk-managed identity, US-hosted, DPA shipped in
  `buyer-pack/`. We've published an active tenant-isolation audit
  (`buyer-pack/SECURITY-AUDIT.md`) — fixed and documented in the open.
  The SOC 2 controls map cleanly onto what we already do; certification
  is paperwork and a window, not new engineering.

## 3. FERPA / HIPAA story

- **The challenge:** "Are you HIPAA?"
- **The honest answer:** We are FERPA-aligned, not HIPAA-certified.
  Districts operate under FERPA; we do not currently sign BAAs.
- **Mitigation / talking point:** Health-information surfaces (medical
  alerts, restraint incidents) are tenant-isolated, audit-logged, and
  scoped to authorized roles. If an acquirer needs HIPAA posture for an
  adjacent product line, the controls are largely overlapping with what
  we already do.

## 4. State-reporting coverage gaps

- **The challenge:** "Do you support state X?"
- **The honest answer:** Coverage is real for the states our pilot
  districts operate in. Other states are not a research project, but
  they are work.
- **Mitigation / talking point:** The reports module
  (`/state-reporting`, `/reports`) is a generic compliance-extract
  framework — adding a new state is configuration plus a tested export
  template, not new architecture.

## 5. Scale of real production data

- **The challenge:** "How does this perform at 30,000 students?"
- **The honest answer:** Largest live tenant is mid-sized. We have not
  load-tested at 30k.
- **Mitigation / talking point:** Postgres with explicit district
  predicates on every tenant query; the dominant access pattern is
  per-school or per-caseload, which is naturally bounded. Indexing and
  query plans are reviewed; the SIS connector ingest is the realistic
  bottleneck and is queue-able.

## 6. Mobile native apps

- **The challenge:** "Where's the iOS / Android app?"
- **The honest answer:** No native apps today. Para "My Day" is
  mobile-web optimized for Chromebooks.
- **Mitigation / talking point:** Schools deploy on Chromebooks, not
  phones. The actual user is a para in a classroom on district hardware.
  If an acquirer wants native apps for an adjacent buyer (e.g. parents),
  the API is OpenAPI-typed and a React Native client could be built on
  the same generated client library.

## 7. Places the demo could break

- **The challenge:** Live demos in front of a buyer.
- **Known surfaces, today:**
  - The 4 SIS vendor connectors are early-pilot tier per
    `lib/sis/STATUS.md` and have not been validated against a live
    tenant of those vendors — do not click "Sync now" against an
    unknown roster shape on a live demo. Use the GA CSV roster import
    path instead.
  - Some `~74` non-blocking trellis web TS errors exist
    (see `DEMO-READINESS-STATUS.md`); the two demo-risk ones (IEP
    Step 5 and admin dashboard) are fixed. The rest render blank
    cells, not crashes.
  - Bucket-D tenant-isolation files (13 files queued) are not on the
    showcase path but should be cleared before any second-stage
    diligence.
- **Mitigation:** Use the MetroWest demo district; do not improvise
  navigation outside the 10-screen path in `02-DEMO-NARRATIVE.md`. Have
  the screenshot-deck (`trellis-pitch`, `trellis-demo`) on standby as
  a fallback for any single screen that hiccups.

## 8. AI posture

- **The challenge:** "Are you using AI to write IEPs?" (often asked
  hopefully by a salesperson, fearfully by a special-ed director).
- **The honest answer:** No. IEP Builder is rule-based
  (`routes/iepBuilder/generate.ts` — no LLM calls). AI is used only for
  PDF IEP *import* during onboarding (`routes/imports/iepDocuments.ts`),
  with mandatory clinician review.
- **Mitigation / talking point:** This is a feature, not a gap. Districts
  that have been pitched "AI writes the IEP" are afraid of being sued;
  honest framing converts that fear into trust.

## 9. Outbound integrations

- **The challenge:** "Can you push events to our data warehouse / BI?"
- **The honest answer:** Only Stripe webhooks ship today. Outbound
  partner webhooks for SIS / data warehouse are roadmap.
- **Mitigation / talking point:** Inbound integration is real (CSV +
  4 SIS connectors). The OpenAPI surface is documented and typed; an
  acquirer's BI team could pull on a schedule today.

## 10. Founder / team risk

- **The challenge:** "What's the team look like?"
- **The honest answer:** Small team. Founder-driven.
- **Mitigation / talking point:** The codebase is documented, typed
  end-to-end, codegen-gated, monorepo-structured, and tested. An
  acquirer's engineering team can read this codebase and ship in it.
  This is *not* a fragile founder-only artifact.

---

## How to use this document

- Before any buyer or diligence call, re-read this list out loud.
- The first time any item is mentioned in the conversation, *the founder
  names it first*, with the mitigation immediately after.
- Never let a buyer "discover" one of these. Discovered gaps get
  discounted; pre-named gaps get respected.
