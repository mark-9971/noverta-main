/**
 * Sentry dashboard provisioning.
 *
 * Idempotently configures the dashboard-side pieces of the Sentry setup that
 * cannot be expressed in code: alert rules, inbound filters, ownership rules,
 * and (when the Slack integration is installed) Slack routing on the alerts.
 *
 * Usage:
 *   SENTRY_AUTH_TOKEN=... \
 *   SENTRY_ORG=trellis \
 *   SENTRY_PROJECTS=trellis-frontend,trellis-api \
 *   [SLACK_CHANNEL=#trellis-alerts] \
 *   [ONCALL_EMAIL=oncall@trellis.example] \
 *   pnpm --filter @workspace/scripts run sentry-provision
 *
 * Things that still must be done manually in the Sentry UI (no API for them):
 *   - Install the Slack integration (Settings -> Integrations -> Slack).
 *   - Set the monthly spend cap (Settings -> Subscription).
 *   - Subscribe the on-call distribution list to "Issue Alerts".
 *
 * Once those are done, re-run this script and Slack actions will be attached
 * automatically wherever SLACK_CHANNEL is provided.
 */

export {};

const SENTRY_API = "https://sentry.io/api/0";

type Env = {
  token: string;
  org: string;
  projects: string[];
  slackChannel?: string;
  oncallEmail?: string;
};

function loadEnv(): Env {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const projectsRaw = process.env.SENTRY_PROJECTS ?? process.env.SENTRY_PROJECT;
  if (!token || !org || !projectsRaw) {
    console.error(
      "Missing required env: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECTS",
    );
    process.exit(2);
  }
  return {
    token,
    org,
    projects: projectsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    slackChannel: process.env.SLACK_CHANNEL?.trim() || undefined,
    oncallEmail: process.env.ONCALL_EMAIL?.trim() || undefined,
  };
}

async function api<T = unknown>(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${SENTRY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Sentry API ${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`,
    );
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

type IntegrationSummary = {
  id: string;
  provider: { key: string };
  externalId?: string;
  name?: string;
};

async function findSlackIntegration(env: Env): Promise<IntegrationSummary | null> {
  if (!env.slackChannel) return null;
  const list = await api<IntegrationSummary[]>(
    env,
    "GET",
    `/organizations/${env.org}/integrations/?provider_key=slack`,
  );
  return list[0] ?? null;
}

function buildIssueActions(env: Env, slack: IntegrationSummary | null) {
  const actions: Record<string, unknown>[] = [
    {
      id: "sentry.mail.actions.NotifyEmailAction",
      targetType: "IssueOwners",
      fallthroughType: "ActiveMembers",
    },
  ];
  if (slack && env.slackChannel) {
    actions.push({
      id: "sentry.integrations.slack.notify_action.SlackNotifyServiceAction",
      workspace: slack.id,
      channel: env.slackChannel,
      tags: "environment,level",
      notes: "",
    });
  }
  return actions;
}

type IssueRule = { id: string; name: string };

async function listIssueRules(env: Env, project: string): Promise<IssueRule[]> {
  return api<IssueRule[]>(env, "GET", `/projects/${env.org}/${project}/rules/`);
}

async function ensureIssueRule(
  env: Env,
  project: string,
  payload: Record<string, unknown>,
) {
  const existing = await listIssueRules(env, project);
  const match = existing.find((r) => r.name === payload.name);
  if (match) {
    console.log(`  · issue rule "${payload.name}" already present (id ${match.id})`);
    return;
  }
  await api(env, "POST", `/projects/${env.org}/${project}/rules/`, payload);
  console.log(`  ✓ created issue rule "${payload.name}"`);
}

async function ensureMetricRule(
  env: Env,
  project: string,
  payload: Record<string, unknown>,
) {
  type MetricRule = { id: string; name: string; projects: string[] };
  const existing = await api<MetricRule[]>(
    env,
    "GET",
    `/organizations/${env.org}/alert-rules/`,
  );
  const match = existing.find(
    (r) => r.name === payload.name && r.projects?.includes(project),
  );
  if (match) {
    console.log(`  · metric rule "${payload.name}" already present (id ${match.id})`);
    return;
  }
  await api(env, "POST", `/organizations/${env.org}/alert-rules/`, {
    ...payload,
    projects: [project],
  });
  console.log(`  ✓ created metric rule "${payload.name}"`);
}

async function configureAlerts(env: Env, slack: IntegrationSummary | null) {
  const actions = buildIssueActions(env, slack);

  for (const project of env.projects) {
    console.log(`\n[alerts] project=${project}`);

    const productionFilter = {
      id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
      key: "environment",
      match: "eq",
      value: "production",
    };

    await ensureIssueRule(env, project, {
      name: "New issue in production",
      actionMatch: "all",
      filterMatch: "all",
      frequency: 30,
      conditions: [
        { id: "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition" },
      ],
      filters: [productionFilter],
      actions,
    });

    await ensureIssueRule(env, project, {
      name: "Issue spike (>50 events / hour)",
      actionMatch: "all",
      filterMatch: "all",
      frequency: 60,
      conditions: [
        {
          id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
          value: 50,
          interval: "1h",
        },
      ],
      filters: [productionFilter],
      actions,
    });

    const metricActions: Record<string, unknown>[] = [];
    if (slack && env.slackChannel) {
      metricActions.push({
        type: "slack",
        targetType: "specific",
        targetIdentifier: env.slackChannel,
        integrationId: slack.id,
      });
    }
    if (env.oncallEmail) {
      metricActions.push({
        type: "email",
        targetType: "user",
        targetIdentifier: env.oncallEmail,
      });
    }

    if (metricActions.length === 0) {
      console.log(
        `  · skipping metric rule "Error rate spike" — needs SLACK_CHANNEL (with Slack integration installed) or ONCALL_EMAIL to attach an action`,
      );
    } else {
      await ensureMetricRule(env, project, {
        name: "Error rate spike (>25/min for 5m)",
        aggregate: "count()",
        timeWindow: 5,
        dataset: "events",
        query: "event.type:error environment:production",
        thresholdType: 0,
        resolveThreshold: null,
        triggers: [
          {
            label: "critical",
            alertThreshold: 25,
            thresholdType: 0,
            actions: metricActions,
          },
        ],
      });
    }
  }
}

async function configureInboundFilters(env: Env) {
  const wanted = ["legacy-browsers", "web-crawlers", "localhost"];
  for (const project of env.projects) {
    console.log(`\n[inbound filters] project=${project}`);
    for (const filterId of wanted) {
      const body =
        filterId === "legacy-browsers"
          ? { subfilters: ["ie_pre_9", "ie9", "ie10", "ie11", "safari_pre_6", "opera_pre_15", "android_pre_4"] }
          : { active: true };
      try {
        await api(env, "PUT", `/projects/${env.org}/${project}/filters/${filterId}/`, body);
        console.log(`  ✓ enabled "${filterId}"`);
      } catch (err) {
        console.log(`  ! could not enable "${filterId}": ${(err as Error).message}`);
      }
    }
  }
}

const OWNERSHIP_TEMPLATE: { path: string; team: string }[] = [
  { path: "artifacts/trellis/*", team: "frontend-team" },
  { path: "artifacts/api-server/src/routes/iep*", team: "case-management-team" },
  { path: "artifacts/api-server/src/lib/sis/*", team: "integrations-team" },
  { path: "artifacts/api-server/src/lib/reminders.ts", team: "platform-team" },
  { path: "artifacts/api-server/*", team: "backend-team" },
];

async function configureOwnership(env: Env) {
  type Team = { slug: string };
  const teams = await api<Team[]>(env, "GET", `/organizations/${env.org}/teams/`);
  const teamSlugs = new Set(teams.map((t) => t.slug));
  const usable = OWNERSHIP_TEMPLATE.filter((r) => teamSlugs.has(r.team));
  const skipped = OWNERSHIP_TEMPLATE.filter((r) => !teamSlugs.has(r.team));

  for (const project of env.projects) {
    console.log(`\n[ownership] project=${project}`);
    if (usable.length === 0) {
      console.log(
        `  · skipped — none of the placeholder teams exist yet (${skipped.map((s) => `#${s.team}`).join(", ")}). Create them in Settings → Teams, then re-run.`,
      );
      continue;
    }
    const raw = [
      "# Provisioned by scripts/src/sentry-provision.ts.",
      ...usable.map((r) => `path:${r.path} #${r.team}`),
    ].join("\n") + "\n";
    await api(env, "PUT", `/projects/${env.org}/${project}/ownership/`, {
      raw,
      fallthrough: true,
      autoAssignment: "Auto Assign to Issue Owner",
      codeownersAutoSync: false,
    });
    console.log(`  ✓ ownership rules applied (${usable.length} rule(s))`);
    if (skipped.length > 0) {
      console.log(
        `  · skipped lines for missing teams: ${skipped.map((s) => `#${s.team}`).join(", ")}`,
      );
    }
  }
}

async function configureCronMonitors(env: Env, slack: IntegrationSummary | null) {
  console.log(`\n[cron monitors]`);
  type Monitor = { id: string; slug: string; name: string; alertRule?: unknown };
  const monitors = await api<Monitor[]>(
    env,
    "GET",
    `/organizations/${env.org}/monitors/`,
  );
  const wanted = ["reminder-scheduler", "sis-scheduler"];
  for (const slug of wanted) {
    const monitor = monitors.find((m) => m.slug === slug);
    if (!monitor) {
      console.log(
        `  ! monitor "${slug}" not found yet — it auto-registers on first check-in`,
      );
      continue;
    }
    const targets: Record<string, unknown>[] = [];
    if (env.oncallEmail) {
      targets.push({ targetType: "Member", targetIdentifier: env.oncallEmail });
    }
    if (slack && env.slackChannel) {
      targets.push({
        targetType: "Specific",
        targetIdentifier: env.slackChannel,
        integrationId: slack.id,
      });
    }
    try {
      await api(env, "PUT", `/organizations/${env.org}/monitors/${monitor.slug}/`, {
        alertRule: { targets, environment: "production" },
      });
      console.log(`  ✓ alert routing set on cron monitor "${slug}"`);
    } catch (err) {
      console.log(`  ! could not update monitor "${slug}": ${(err as Error).message}`);
    }
  }
}

async function main() {
  const env = loadEnv();
  console.log(
    `Sentry provisioning -> org=${env.org} projects=${env.projects.join(", ")}`,
  );
  const slack = await findSlackIntegration(env);
  if (env.slackChannel && !slack) {
    console.log(
      `! Slack integration not installed in org "${env.org}" — install it in Sentry UI, then re-run.`,
    );
  } else if (slack) {
    console.log(`✓ Slack integration detected (workspace id ${slack.id})`);
  }

  await configureAlerts(env, slack);
  await configureInboundFilters(env);
  await configureOwnership(env);
  await configureCronMonitors(env, slack);

  console.log(`\nDone. Re-run safely; this script is idempotent.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
