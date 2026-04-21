# Trellis — Executive Summary

**One-sentence positioning.** Trellis is the special-education operations
platform that turns a district's IEP minutes, paperwork, and compliance
deadlines into a single accountable system — so case managers stop
drowning, paras stop guessing, and directors stop writing comp-ed checks.

**The wedge.** Most sped software is a filing cabinet (Frontline, PowerSchool
Special Programs, Embrace). Trellis is the operations layer on top: real-
time minutes-at-risk, comp-ed obligations as a first-class object, a para
tool paras actually use on a Chromebook, and ABA/IEP/dashboards in one
tenant — so districts stop buying 3–5 products to cover what should be one.

**The buyer.** Director of Special Education and Assistant Superintendent at
mid-sized districts and collaboratives. They sign because the dollar story
(comp-ed exposure, Medicaid recapture, due-process risk) lands before the
feature story does. Procurement is on a 30-day paid pilot with an agreed
success metric.

**The moat.** Sped-first, multi-tenant from day one, ~480 route handlers
across 64 modules with district-scope enforcement and an active,
in-the-open tenant-isolation audit (Bucket-A: 5 files / 14 handlers
fixed; Bucket-D: 13 files queued, none on the demo showcase path). OpenAPI-typed, codegen-gated, Stripe-billed,
GA CSV roster import in production, plus PowerSchool / Infinite Campus /
Skyward / SFTP connectors written at early-pilot tier (per
`lib/sis/STATUS.md` — not yet validated against a live tenant). The code
an acquirer would buy is buildable-on, not rewritable.

**Current maturity.** GA today: service-delivery logging, minutes-at-risk
compliance engine, comp-ed tracking, ABA/BIP clinical tools, audit
logging, multi-tenancy, Para "My Day," IEP meetings, e-sign, state-
reporting exports, Stripe billing, CSV roster import. Pilot-ready: IEP
Builder (rule-based), the four SIS vendor connectors (early-pilot tier,
not live-tenant verified), Medicaid claim prep + CSV
export, AI-assisted PDF IEP import, guardian portal, district benchmarks,
60-day evaluation timer, transition planning, agency management. Not yet
shipped: direct Medicaid clearinghouse submission, bulk parent-portal
email invites, staff credentialing automation, SOC 2 certification, native
mobile apps. Honest gaps named in `07-RISKS-AND-GAPS.md`.
