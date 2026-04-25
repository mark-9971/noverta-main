# Stripe Billing Failure-State Lifecycle

Noverta subscriptions are billed through Stripe. Until this workstream the
api-server only handled the happy path (`active` / `trialing`) and a single
`canceled` terminal state — every other Stripe failure mode either silently
let the customer keep working or hard-blocked them with no warning, no email,
and no recovery path. That made it unsafe to open public paid signup.

This document describes the now-supported failure lifecycle, the webhook
handlers that drive it, and the residual risks before we open the gate.

## Lifecycle

```
                                   ┌──────────────┐
                                   │   trialing   │
                                   └──────┬───────┘
            customer.subscription.trial_will_end (T-3d)
                                          │ notify admins, set trialEndsAt
                                          ▼
   ┌────────────┐  invoice.payment_succeeded   ┌──────────────┐
   │ incomplete │ ───────────────────────────▶ │   active     │
   └─────┬──────┘                              └──────┬───────┘
         │ initial charge fails > 1h                  │ invoice.payment_failed
         ▼                                            ▼
   ┌────────────────────┐                     ┌──────────────────┐
   │ incomplete_expired │                     │ past_due (grace) │ ← 7 days from
   └────────────────────┘                     └──────┬───────────┘   first failure
       HARD BLOCK                                    │
                                                    │ retries don't extend grace
                                                    │
                            ┌───────────────────────┼─────────────────────┐
                            │ payment_succeeded     │ grace expires       │ canceled / customer.deleted
                            ▼                       ▼                     ▼
                       ┌──────────┐          ┌──────────────┐       ┌──────────┐
                       │  active  │          │   past_due   │       │ canceled │
                       └──────────┘          │ (HARD BLOCK) │       └──────────┘
                                             └──────────────┘
```

### Grace anchor rule

The 7-day grace window is anchored to the **first** failed invoice in a
streak. Stripe's automatic dunning retries (typically 4 attempts over ~3 weeks)
generate additional `invoice.payment_failed` events; those are recorded
(`paymentFailureCount++`, `lastPaymentFailureAt`, `lastPaymentFailureReason`)
but **do not extend** `gracePeriodEndsAt`. The streak ends when an
`invoice.payment_succeeded` arrives, which clears all failure fields.

### Strict no-silent-downgrade (sticky terminal)

A stronger terminal state is never overwritten by a weaker event arriving
late. `canceled` and `incomplete_expired` are sticky for the visible status
field — every status-mutating handler (subscription projection, invoice
events, customer.deleted) checks `STICKY_TERMINAL_STATUSES` before writing.
A late `invoice.payment_succeeded` arriving after cancellation will still
clear the failure-streak fields (so the audit row is correct) but will
**not** flip status back to `active`. Auxiliary timestamps still record
later events for ops debugging.

### Webhook idempotency

Stripe retries any event the receiver doesn't 2xx, and during incidents the
same `event.id` can arrive several times concurrently. Without dedupe, a
duplicate `invoice.payment_failed` would re-increment
`paymentFailureCount`, re-anchor `gracePeriodEndsAt`, and re-send the admin
email.

`processed_stripe_events` (PK = `event_id`) is the dedupe table.
The dispatcher uses **claim-then-dispatch with rollback on failure**:

1. INSERT a row keyed on `event.id`. The unique constraint serializes
   concurrent retries — only one wins.
2. On `23505` (duplicate), log and 2xx without side effects so Stripe stops
   retrying.
3. Run dispatch. **If dispatch throws**, DELETE the dedupe row before
   re-throwing, so the next Stripe retry can re-attempt. Without this
   rollback, a single transient dispatch failure would permanently mask the
   status/grace projection — the orphaned dedupe row would silently
   suppress every retry. (Cleanup-failure of the rollback itself is logged;
   the original dispatch error is still surfaced to Stripe.)
4. On clean dispatch, the dedupe row stays and future retries no-op.

### Dispatcher reliability

The previous implementation wrapped `dispatchEvent` in a try/catch and
logged the error — Stripe always saw 2xx and never retried. That silently
dropped billing-state updates. The dispatcher now lets handler errors
propagate so the webhook returns non-2xx and Stripe's retry schedule
recovers (combined with idempotency above, retries are safe).

## DB columns added (`district_subscriptions`)

| Column                       | Purpose                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `grace_period_ends_at`       | When `past_due` access stops being allowed (anchored to first failure) |
| `last_payment_failure_at`    | Most recent failed `invoice.payment_failed`                            |
| `last_payment_failure_reason`| Stripe's `outcome.seller_message` / decline code                       |
| `payment_failure_count`      | Failures in the current streak; reset to 0 on success                  |
| `last_successful_payment_at` | Cleared on every payment_succeeded (used for ops + receipts)           |
| `trial_ends_at`              | Set from `customer.subscription.trial_will_end` for UI countdown       |

## Webhook event → DB mapping

Endpoint: `POST /webhooks/stripe` (Stripe-signed). Dispatcher lives in
`artifacts/api-server/src/lib/webhookHandlers.ts`.

| Stripe event                           | Status / field changes                                                                                       | Side effects                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `customer.subscription.created`        | upsert subscription row from Stripe object                                                                   | none                                               |
| `customer.subscription.updated`        | sync status, plan, period end                                                                                | downgrades district tier on cancellation only      |
| `customer.subscription.deleted`        | `status → canceled`                                                                                          | downgrades district to `essentials`; emails admins |
| `customer.subscription.trial_will_end` | `trialEndsAt = subscription.trial_end`                                                                       | emails admins ("trial ending in 3 days")           |
| `invoice.payment_failed`               | `status → past_due`; on **first** failure of streak set `gracePeriodEndsAt = now + 7d`; `++paymentFailureCount`; record reason/ts | emails admins with decline reason and grace deadline |
| `invoice.payment_succeeded`            | `status → active`; clears `gracePeriodEndsAt`, `lastPaymentFailureAt/Reason`, resets `paymentFailureCount=0`; sets `lastSuccessfulPaymentAt` | none                                               |
| `payment_method.detached`              | none (Stripe will surface the next renewal as `payment_failed`)                                              | emails admins ("we no longer have a card on file") |
| `customer.deleted`                     | `status → canceled` (sticky); downgrades district tier                                                       | emails admins                                      |
| unknown / unmapped                     | none                                                                                                         | logged for ops                                     |

All branches require Stripe signature verification — unsigned calls return
`400`. Existing handlers (`subscription.created/updated`) are unchanged
except for being routed through the new dispatcher.

## Subscription gate (`subscriptionGate.ts`)

| Status                          | Behavior                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| `active`, `trialing`            | always allowed                                                    |
| `past_due` w/ grace in future   | allowed; banner shows countdown                                   |
| `past_due` w/ grace expired/null| **403 SUBSCRIPTION_PAST_DUE**                                     |
| `incomplete` (≤ 1h since create)| allowed (Stripe initial-charge race window)                       |
| `incomplete` (> 1h)             | **403 SUBSCRIPTION_INCOMPLETE**                                   |
| `incomplete_expired`            | **403 SUBSCRIPTION_INACTIVE** (initial charge never landed)       |
| `canceled`, `unpaid`            | **403 SUBSCRIPTION_INACTIVE**                                     |
| no subscription row             | **403 NO_SUBSCRIPTION**                                           |

Demo and pilot districts (`isDemo` / `isPilot`) bypass the gate entirely;
`/billing/*`, `/health`, and `/auth` are exempt paths so the user can always
reach the recovery flow.

## `/billing/status` response

`GET /billing/status` (gate-exempt) returns the data the SubscriptionBanner
needs to render the right message:

```json
{
  "status": "past_due",
  "planTier": "essentials",
  "gracePeriodEndsAt": "2026-04-24T16:00:00.000Z",
  "inGracePeriod": true,
  "trialEndsAt": null,
  "trialEndingSoon": false,
  "lastPaymentFailureAt": "2026-04-17T16:00:00.000Z",
  "lastPaymentFailureReason": "Your card was declined.",
  "paymentFailureCount": 1
}
```

## UI surfaces changed

`artifacts/trellis/src/components/SubscriptionBanner.tsx` now renders by
priority (hard block > grace > trial-ending > none):

1. **Hard block** (canceled / unpaid / incomplete_expired / past_due after
   grace) — red banner, "Update payment method" CTA, decline reason if known.
2. **Grace period** (past_due, grace in future) — amber banner, day countdown
   ("3 days left to update payment"), decline reason inline.
3. **Trial ending soon** (`trialEndsAt` within 3 days) — blue banner with
   day countdown.
4. Otherwise: hidden.

Admin notification emails go through `lib/billingEmail.ts` which joins
through `schools → staff (role='admin')` and sends via Resend; if
`RESEND_API_KEY` is unset the helper logs a structured no-op rather than
throwing, matching the email lifecycle's "not_configured" pattern.

## Test coverage

`artifacts/api-server/tests/12-billing-failure-lifecycle.test.ts` — 13 cases,
all passing:

1. `invoice.payment_failed` (first in streak) → `past_due`, grace = now+7d,
   `paymentFailureCount=1`, reason recorded.
2. `invoice.payment_failed` (second in streak) → counter increments, grace
   anchor **not** extended, reason updates.
3. `invoice.payment_succeeded` → `active`, all failure fields cleared,
   `lastSuccessfulPaymentAt` set.
4. `customer.subscription.trial_will_end` → `trialEndsAt` recorded.
5. `customer.deleted` → `canceled` (sticky), district downgraded to
   `essentials`.
6. Gate allows `past_due` while `gracePeriodEndsAt > now`.
7. Gate blocks `past_due` after grace expiry (403 SUBSCRIPTION_PAST_DUE).
8. Gate hard-blocks `incomplete_expired` (403 SUBSCRIPTION_INACTIVE).
9. Gate blocks `past_due` with `gracePeriodEndsAt = null` (defensive — a
   `past_due` row that somehow never anchored a grace window is still
   blocked, never silently allowed).
10. `invoice.payment_failed` drives `status → past_due` directly (not just
    failure metadata) so the gate doesn't depend on a follow-up
    `subscription.updated`.
11. `invoice.payment_succeeded` drives `status → active` and clears all
    failure fields.
12. **Sticky terminal**: a late `invoice.payment_succeeded` arriving after
    `canceled` does NOT silently re-activate the subscription.
13. `/billing/status` surfaces `gracePeriodEndsAt`, `inGracePeriod`,
    failure reason and count while `past_due`.

Full api-server suite: **103 / 103 passing**.

## Residual risks before public paid signup

1. **Webhook signature verification not unit-tested in this suite.** The
   Stripe-sync handler enforces it in production, but there's no regression
   test that spoofed events are rejected. (The email lifecycle has the
   equivalent test for Svix.) Recommendation: copy the `04-email`
   "rejects unsigned requests" pattern to `12-billing` before launch.
2. **Idempotency dedupe is unit-verified in code path but not yet covered
   by an end-to-end "replay the same event id twice" test.** The dedupe
   table and its 23505-handling are in place; the next test pass should
   exercise replay through `WebhookHandlers.processWebhook` to lock in the
   contract.
3. **`payment_method.detached` notification path is exercised only through
   the dispatcher**, not via an end-to-end webhook test. Low risk (the
   handler is a thin wrapper around `sendBillingNotification`) but worth
   adding before public signup.
4. **Districts with no admin-role staff get silent no-op emails.** The
   helper logs `no admin recipients on file` and returns. New tenants must
   have at least one `staff.role='admin'` row created during signup, or
   billing failures will never reach a human. Recommendation: enforce in
   the signup flow (or fall back to the Clerk-known billing contact) before
   opening public signup.
4. **Dunning retries are owned by Stripe, not the app.** If Stripe's
   retry schedule is reconfigured (Dashboard → Billing → Subscriptions →
   Smart retries), the 7-day grace anchor may no longer line up with the
   final retry attempt. Document the assumption in the Stripe Dashboard.
5. **No `customer.subscription.paused` handling.** We don't currently use
   pause-collection, but if we add it, the gate will treat `paused` as an
   "invalid" status and 403. Add a branch when the feature ships.
