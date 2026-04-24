# Sentry — Manual Dashboard Setup

The code-side hardening (source-map upload, releases, replay, Express
context, cron monitors, noise filters, smoke-test endpoint) lives in the
repo and runs automatically on each build/deploy. Most of the
dashboard-side configuration is now also automated via the
`scripts/src/sentry-provision.ts` provisioner — see
[Automated provisioner](#0-automated-provisioner) below. The items
flagged "manual only" further down are the ones that genuinely cannot
be done from outside the Sentry web UI.

## 0. Automated provisioner

Run once per environment after installing the Slack integration in the
Sentry UI:

```bash
SENTRY_AUTH_TOKEN=<token with project:write + alerts:write + org:read> \
SENTRY_ORG=trellis \
SENTRY_PROJECTS=trellis-frontend,trellis-api \
SLACK_CHANNEL=#trellis-alerts \
ONCALL_EMAIL=oncall@noverta.example \
pnpm --filter @workspace/scripts run sentry-provision
```

The script is idempotent — re-running it will skip rules that already
exist and only fill in what is missing. It provisions:

- The three production alert rules in section 2 below.
- The three inbound filters in section 4 below.
- The ownership rules in section 5 below (with placeholder team handles
  — edit the `OWNERSHIP_TEMPLATE` constant in the script when real teams
  are created).
- Slack + email routing on the `reminder-scheduler` and `sis-scheduler`
  cron monitors (only after they have first checked in, which auto-
  registers them).

**What still must be done manually in the UI** (no API for them):

- Install the Slack integration (Settings → Integrations → Slack).
- Set the monthly spend cap (Settings → Subscription).
- Subscribe the on-call distribution list to "Issue Alerts" for the
  production project (Settings → Notifications).

## 1. Project secrets (one-time)

Set these as deploy-time secrets so source maps upload and releases tag
correctly:

| Secret               | Where it's used                                          |
| -------------------- | -------------------------------------------------------- |
| `SENTRY_AUTH_TOKEN`  | `artifacts/trellis/vite.config.ts`, `artifacts/api-server/build.mjs` |
| `SENTRY_ORG`         | both build configs                                       |
| `SENTRY_PROJECT`     | both build configs                                       |
| `SENTRY_RELEASE`     | optional override for the release name (defaults to `VITE_APP_VERSION` / `APP_VERSION` / git SHA / `npm_package_version`) |
| `VITE_APP_VERSION`   | baked into the frontend bundle as the release (Vite mirrors `SENTRY_RELEASE` / git SHA when unset) |
| `APP_VERSION`        | read by the backend `Sentry.init` for the release tag (api-server build bakes the resolved release in via `define`, so this only needs to be set explicitly to override) |
| `SENTRY_TEST_ENABLED`| set to `true` on the API to allow `GET /api/_internal/sentry-test` |

When the auth token is unset the build skips upload gracefully — dev
builds and contributor builds without Sentry creds still succeed.

## 2. Alert rules

Create the following in **Alerts → Create Alert Rule**:

- **New issue in production** — environment = `production`, "An issue is
  first seen", action: notify Slack channel + on-call email.
- **Issue spike** — "Number of events in an issue is more than 50 in 1
  hour", environment = `production`.
- **Error rate spike** — metric alert on `event.type:error`, threshold
  > 25 events/min for 5 minutes, environment = `production`.
- **Cron monitor failed/missed** — Alerts → Crons → enable email + Slack
  notifications for both `reminder-scheduler` and `sis-scheduler`
  monitors. Confirm the expected interval matches the schedule registered
  in code (6h and 15m respectively).

## 3. Slack / email integration

- Settings → Integrations → **Slack** → install + authorize, route alerts
  above to `#trellis-alerts` (or the equivalent channel).
- Settings → Notifications → confirm the on-call distribution list is
  subscribed to "Issue Alerts" for the production project.

## 4. Inbound filters

Settings → Projects → \<project\> → **Inbound Filters**:

- Filter out events from legacy browsers (IE ≤ 11, etc.).
- Filter out events from web crawlers.
- Filter out events from `localhost` (the `beforeSend` hook also covers
  this, but enabling here keeps them out of quota counting).

## 5. Issue owners

Settings → Projects → \<project\> → **Ownership Rules**. Suggested
starting rules (adjust to your team layout):

```
path:artifacts/trellis/* #frontend-team
path:artifacts/api-server/src/routes/iep* @case-management-team
path:artifacts/api-server/src/lib/sis/* @integrations-team
path:artifacts/api-server/src/lib/reminders.ts @platform-team
path:artifacts/api-server/* #backend-team
```

## 6. Quota & sample-rate review

- Settings → Subscription → confirm event quota headroom is > 30% of
  monthly cap with current traffic.
- Verify the spend cap is set so a runaway frontend loop can't burn the
  whole month in an hour.
- Sampling currently in code: frontend `tracesSampleRate: 0.1`,
  `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`;
  backend `tracesSampleRate: 0`. Revisit if the bill creeps up.

## 7. Post-deploy smoke test

After each major deploy:

1. As an admin, open the **System Status** page in the app.
2. Expand "Sentry smoke test" and fire both buttons.
3. Confirm in Sentry that:
   - The frontend issue arrived with a session replay link, the correct
     release tag, environment = `production`, and the user's id/email
     attached.
   - The backend issue arrived with the request URL, method, route,
     `districtId` tag, `role` tag, and the user id attached.
   - Both stack traces show real source file/line numbers (source maps
     uploaded successfully).
4. Confirm the `reminder-scheduler` and `sis-scheduler` cron monitors
   each show a recent OK check-in within the configured interval.
