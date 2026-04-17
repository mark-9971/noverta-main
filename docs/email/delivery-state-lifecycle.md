# Email Delivery-State Lifecycle

Parental and guardian notifications carry legal weight under MA 603 CMR 46/28.
The platform must therefore distinguish provider-acceptance from
inbox-delivery and never claim "sent" when the provider has only accepted
(or queued) the message.

## Lifecycle

```
                        ┌──────────────┐
                        │ not_configured│  RESEND_API_KEY missing — never attempted
                        └──────────────┘

   ┌────────┐   sendEmail()    ┌──────────┐   email.delivered    ┌───────────┐
   │ queued │ ───────────────▶ │ accepted │ ──────────────────▶  │ delivered │
   └────────┘                  └──────────┘                      └───────────┘
                                    │  email.bounced      email.complained
                                    │      ↓                       ↓
                                    │  ┌────────┐             ┌────────────┐
                                    │  │ bounced│             │ complained │
                                    │  └────────┘             └────────────┘
                                    │
                                    │  email.failed   /   provider error    /   retries exhausted
                                    └──────────────────────────────────────▶  ┌────────┐
                                                                              │ failed │
                                                                              └────────┘
```

`sent` is a **legacy alias for `accepted`** — rows written before this change
keep status `sent` and the UI/back-end treat it as `accepted` without a data
migration.

### Strict monotonicity

Once a row reaches a terminal state (`delivered`, `bounced`, `complained`,
`failed`) the visible `status` field is **never** overwritten by a later
webhook. Auxiliary timestamps (`bouncedAt`, `complainedAt`, `lastWebhookAt`,
`lastWebhookEventType`) are still recorded so ops/legal can see late events.

The audit-log UI keys off these auxiliary timestamps to render
"Delivered, then marked spam" or "Delivered, then bounced" badges, so a
delivery never silently looks like a non-delivery and a complaint after
delivery is never invisible.

## DB columns added (`communication_events`)

| Column                  | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `accepted_at`           | Provider returned 200 + `email_id`                          |
| `bounced_at`            | `email.bounced` webhook arrived (recorded even post-deliver)|
| `complained_at`         | `email.complained` webhook arrived (recorded post-deliver)  |
| `last_webhook_event_type` | Most recent provider event for ops debugging              |
| `last_webhook_at`       | Timestamp of most recent provider event                     |

Existing columns kept: `sent_at` (now mirrors `accepted_at` for back-compat),
`delivered_at`, `failed_at`, `failed_reason`, `status`.

## Webhook event → DB mapping

Endpoint: `POST /webhooks/resend` (Svix-signed).

| Resend event             | Status transition                                | Side effects                                   |
| ------------------------ | ------------------------------------------------ | ---------------------------------------------- |
| `email.sent`             | `queued → accepted` (else no-op)                 | `acceptedAt`, `sentAt` if promoted             |
| `email.delivered`        | pre-terminal → `delivered` (else no-op)          | `deliveredAt`                                  |
| `email.delivery_delayed` | none                                             | `lastWebhookEventType`, `lastWebhookAt`        |
| `email.bounced`          | pre-terminal → `bounced` (else no-op)            | `bouncedAt` always; `failedAt`, `failedReason` if promoted |
| `email.complained`       | pre-terminal → `complained` (else no-op)         | `complainedAt` always; `failedAt`, `failedReason` if promoted |
| `email.failed`           | pre-terminal → `failed` (else no-op)             | `failedAt`, `failedReason`                     |
| `email.opened`/`clicked` | none                                             | `lastWebhookEventType`, `lastWebhookAt` only   |
| unknown / unmapped       | none                                             | `lastWebhookEventType`, `lastWebhookAt` only   |

`pre-terminal` ≡ `queued | accepted | sent`. Every branch updates
`updatedAt`. All branches require Svix signature verification — unsigned
calls return 401 (or 400 if Svix headers are missing entirely).

## UI surfaces changed

1. **Parent Communication → Audit Log** (`CommsAuditLog.tsx`)
   - Replaced single "Sent" badge with distinct, color-coded badges per
     status with explanatory tooltips:
     - Queued (gray clock)
     - Accepted (blue send) — "Accepted by email provider — awaiting delivery confirmation"
     - Delivered (emerald check) — "Provider confirmed delivery to the recipient"
     - Bounced (red triangle) — "Recipient address rejected the email"
     - Marked spam (orange flag) — "Recipient marked the email as spam/junk"
     - Failed (red alert) — "Delivery failed"
     - Not Configured (yellow ban) — "Add RESEND_API_KEY to enable real email delivery"
   - Composite badges when a complaint or bounce arrives **after** delivery:
     "Delivered, then marked spam" / "Delivered, then bounced".

2. **Staff messaging composer** (`student-messages.tsx` `reportDelivery`)
   - Old toast: "sent to guardian's email" (false positive — the provider
     had only accepted the request).
   - New toasts, one per status:
     - accepted/queued/sent → "accepted by email provider — awaiting delivery confirmation"
     - delivered → "delivered to guardian's inbox"
     - bounced → "bounced — recipient rejected the email"
     - complained → "flagged as spam by recipient"
     - not_configured → "saved to portal — email not delivered (RESEND_API_KEY missing)"
     - failed → "saved to portal — email delivery failed"

3. **API response shape** (`POST /students/:id/messages`,
   `POST /students/:id/conference-requests`)
   - `emailDelivery.status` is now the full lifecycle union
     (`queued | accepted | delivered | bounced | complained | failed | not_configured | sent | no_email_on_file | skipped`),
     not just `sent | not_configured | failed | …`.

## Test coverage

`artifacts/api-server/tests/04-email-delivery-state.test.ts` (10 cases):

1. `RESEND_API_KEY` unset → `not_configured`, never `sent`/`accepted`.
2. `email.delivered` promotes `accepted` → `delivered`, stamps webhook fields.
3. Legacy `sent` rows still promote to `delivered`.
4. `email.bounced` sets `bounced` + `bouncedAt` + reason from `accepted`.
5. `email.complained` sets `complained` + `complainedAt` (distinct from bounce).
6. `email.delivery_delayed` does NOT change status; only stamps webhook fields.
7. **Strict precedence**: late `email.bounced` after `delivered` keeps status
   `delivered`, records `bouncedAt`.
8. **Strict precedence**: late `email.complained` after `delivered` keeps
   status `delivered`, records `complainedAt` so the UI can flag spam.
9. **Strict precedence**: terminal-to-terminal overwrites blocked
   (`failed → bounced` keeps `failed`).
10. Webhook endpoint rejects unsigned requests (400 / 401).

Full suite: 90/90 passing after the change.
