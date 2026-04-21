# Trellis — Competitive Differentiation

The honest field map. Every competitor below is a real product a district has
to actively switch from (or supplement). For each: one line on what they
genuinely do well, one line on where Trellis wins *today* (not on the
roadmap).

---

## Frontline Education / SEAS

- **Good at:** Entrenched. Most-installed sped IEP system in the US.
  Recognizable to every director.
- **Where Trellis wins today:** Frontline is a filing cabinet. Trellis is the
  daily ops layer on top of the filing cabinet — minutes-at-risk, comp-ed
  burndown, para "My Day," and the director's Action Center are absent or
  bolt-on in SEAS.

## PowerSchool Special Programs

- **Good at:** Tight integration with PowerSchool SIS, brand trust,
  district-procurement bundle deals.
- **Where Trellis wins today:** Special Programs is a forms engine. Trellis
  ships service-delivery logging, ABA/BIP clinical tools, real compensatory
  obligation tracking, and parent-portal acknowledgments out of the box.
  We also already integrate *into* PowerSchool — we don't compete with the
  SIS layer.

## Embrace (IlluminatED)

- **Good at:** Lightweight IEP authoring, popular in mid-sized districts,
  easy to procure.
- **Where Trellis wins today:** Embrace stops at the IEP. Trellis covers the
  *execution* of the IEP — service minutes, missed sessions, comp-ed,
  paras' daily workflow, parent communications.

## Infinite Campus SPED Module

- **Good at:** Bundled with the IC SIS, low marginal cost for IC districts.
- **Where Trellis wins today:** It's an SIS bolt-on built by a SIS company.
  Compliance computation, ABA tooling, and director-level dashboards are not
  the focus. Trellis treats IC as a roster source and layers the operations
  product on top.

## SameGoal

- **Good at:** Strong in specific states (OH, NY) for IEP forms and
  state-specific reporting compliance.
- **Where Trellis wins today:** SameGoal is forms + state reporting. Trellis
  is forms + state reporting + service delivery + comp-ed + ABA + parent
  portal + director ops, in one tenant.

## CentralReach (for ABA)

- **Good at:** Best-of-breed clinical ABA platform for private clinics
  doing insurance billing.
- **Where Trellis wins today:** CentralReach is built for private clinics,
  not school districts. Trellis ships ABA/BIP/FBA *inside* the same system
  the case manager, para, and director already use. Districts don't have to
  buy and integrate two products.

## General SIS that pretend to do SPED (Skyward, Aeries, Synergy SPED tabs)

- **Good at:** Already in the building. Already paid for.
- **Where Trellis wins today:** None of these are sped-first. They lack the
  compliance engine, the comp-ed math, and the para/clinical tooling. Their
  "sped tab" is a roster filter. Trellis treats them as a roster source via
  CSV/SFTP.

---

## The Trellis wedge — what is genuinely differentiated in the current build

1. **Minutes-at-risk before quarter-end.** Most competitors report
   compliance after the period closes. Trellis surfaces risk on Monday so
   it's fixed by Friday. (`/action-center`, `/compliance?tab=risk-report`)
2. **Compensatory services as a first-class object.** Obligation creation,
   burndown, log-against-obligation, shortfall calculator. Most
   competitors track comp-ed in a Google Doc. (`/compensatory`)
3. **A para tool paras actually use.** Two-tap session log on a
   Chromebook, with the BIP visible in plain language. Frontline /
   PowerSchool / Embrace do not ship this. (`/my-day`)
4. **One tenant for case managers, paras, BCBAs, and the director.** ABA
   clinical tooling, IEP authoring, service delivery, and director-level
   dashboards in the same system. No CentralReach + Frontline + Excel
   stack. (`/aba`, `/iep-builder`, `/sessions`, `/executive`)
5. **Honest AI posture.** AI assists PDF IEP import for onboarding speed;
   IEP Builder is rule-based and not generative. Districts that have been
   burned by "AI writes the IEP" pitches recognize this immediately and
   trust us more for it. (`routes/imports/iepDocuments.ts`,
   `routes/iepBuilder/generate.ts`)
