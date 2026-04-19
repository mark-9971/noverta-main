// tenant-scope: district-token
// Pilot renewal decision routes. Read uses getEnforcedDistrictId so a caller
// always sees their own district's decision and never another tenant's.
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  pilotDecisionsTable,
  districtsTable,
  pilotBaselineSnapshotsTable,
  districtSubscriptionsTable,
  subscriptionPlansTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getEnforcedDistrictId, requireRoles } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";
import { logger } from "../lib/logger";
import { computePilotBaselineMetrics, captureBaselineForDistrict } from "../lib/pilotBaselineSnapshots";
import { sendAdminEmail, getAppBaseUrl } from "../lib/email";
import { getDistrictAdminEmails } from "../lib/billingEmail";

const router: IRouter = Router();

const PILOT_LENGTH_DAYS = 90;
const DECISION_WINDOW_OPENS_DAY = 60;
/** Default plan tier we quote in the contract preview when nothing else is set. */
const DEFAULT_RENEWAL_TIER = "professional";
/** Internal CC for renewal decisions. Optional — falls back to log-only. */
const ACCOUNT_MANAGER_EMAIL = process.env.PILOT_ACCOUNT_MANAGER_EMAIL ?? null;

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

async function loadDistrictStaffSeats(districtId: number): Promise<number> {
  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS cnt
        FROM staff
        WHERE deleted_at IS NULL
          AND school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})`,
  );
  const row = result.rows?.[0] as Record<string, unknown> | undefined;
  return Number(row?.cnt ?? 0);
}

interface ContractPreview {
  tier: string;
  planName: string;
  description: string | null;
  seats: number;
  currentStaffCount: number;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  billingCycle: "monthly" | "yearly";
  /** Effective annualized price the admin would commit to. */
  termPriceCents: number;
  termLengthMonths: number;
  source: "subscription_plan" | "fallback";
}

async function buildContractPreview(districtId: number): Promise<ContractPreview | null> {
  const [sub] = await db
    .select({
      planTier: districtSubscriptionsTable.planTier,
      seatLimit: districtSubscriptionsTable.seatLimit,
      billingCycle: districtSubscriptionsTable.billingCycle,
    })
    .from(districtSubscriptionsTable)
    .where(eq(districtSubscriptionsTable.districtId, districtId))
    .limit(1);

  // For pilots the plan_tier is usually "trial". Map that to the default
  // renewal tier so the quote is meaningful instead of $0.
  const targetTier =
    sub?.planTier && sub.planTier !== "trial" ? sub.planTier : DEFAULT_RENEWAL_TIER;
  const billingCycle: "monthly" | "yearly" =
    sub?.billingCycle === "yearly" ? "yearly" : "monthly";

  const [plan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(and(eq(subscriptionPlansTable.tier, targetTier), eq(subscriptionPlansTable.isActive, true)))
    .limit(1);

  const currentStaffCount = await loadDistrictStaffSeats(districtId);
  const seats = Math.max(plan?.seatLimit ?? sub?.seatLimit ?? 25, currentStaffCount);

  if (!plan) {
    return {
      tier: targetTier,
      planName: targetTier.charAt(0).toUpperCase() + targetTier.slice(1),
      description: null,
      seats,
      currentStaffCount,
      monthlyPriceCents: 0,
      yearlyPriceCents: 0,
      billingCycle,
      termPriceCents: 0,
      termLengthMonths: billingCycle === "yearly" ? 12 : 1,
      source: "fallback",
    };
  }

  const termLengthMonths = billingCycle === "yearly" ? 12 : 12; // Renewals quoted as 12-month
  const termPriceCents =
    billingCycle === "yearly" ? plan.yearlyPriceCents : plan.monthlyPriceCents * 12;

  return {
    tier: plan.tier,
    planName: plan.name,
    description: plan.description,
    seats,
    currentStaffCount,
    monthlyPriceCents: plan.monthlyPriceCents,
    yearlyPriceCents: plan.yearlyPriceCents,
    billingCycle,
    termPriceCents,
    termLengthMonths,
    source: "subscription_plan",
  };
}

interface RoiPanel {
  capturedAt: string | null;
  baseline: {
    compliancePercent: number | null;
    exposureDollars: number;
    compEdMinutesOutstanding: number;
    overdueEvaluations: number;
    expiringIepsNext60: number;
  } | null;
  current: {
    compliancePercent: number | null;
    exposureDollars: number;
    compEdMinutesOutstanding: number;
    overdueEvaluations: number;
    expiringIepsNext60: number;
  };
}

async function buildRoiPanel(districtId: number): Promise<RoiPanel> {
  const [baselineRow] = await db
    .select()
    .from(pilotBaselineSnapshotsTable)
    .where(eq(pilotBaselineSnapshotsTable.districtId, districtId))
    .limit(1);
  const current = await computePilotBaselineMetrics(districtId);
  return {
    capturedAt: baselineRow?.capturedAt?.toISOString() ?? null,
    baseline: baselineRow
      ? {
          compliancePercent: baselineRow.compliancePercent,
          exposureDollars: baselineRow.exposureDollars,
          compEdMinutesOutstanding: baselineRow.compEdMinutesOutstanding,
          overdueEvaluations: baselineRow.overdueEvaluations,
          expiringIepsNext60: baselineRow.expiringIepsNext60,
        }
      : null,
    current,
  };
}

/**
 * GET /api/pilot/decision/status
 * Returns everything the Pilot Decision page needs in a single round-trip:
 * pilot day count, whether the day-60 banner / page should be active, the
 * already-recorded decision (if any), the ROI panel, and the contract
 * preview pulled from the district's subscription plan.
 */
router.get(
  "/pilot/decision/status",
  requireRoles("admin", "coordinator"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
      if (districtId == null) {
        res.status(400).json({ error: "District scope required" });
        return;
      }

      const [district] = await db
        .select({ id: districtsTable.id, isPilot: districtsTable.isPilot, name: districtsTable.name })
        .from(districtsTable)
        .where(eq(districtsTable.id, districtId))
        .limit(1);
      if (!district) {
        res.status(404).json({ error: "District not found" });
        return;
      }

      // Self-heal: capture the baseline if we somehow don't have one yet, so
      // pilotStartedAt is always populated for pilots.
      if (district.isPilot) {
        await captureBaselineForDistrict(districtId).catch((err) =>
          logger.warn({ err, districtId }, "lazy baseline capture failed (non-fatal)"),
        );
      }

      const [baselineRow] = await db
        .select({ capturedAt: pilotBaselineSnapshotsTable.capturedAt })
        .from(pilotBaselineSnapshotsTable)
        .where(eq(pilotBaselineSnapshotsTable.districtId, districtId))
        .limit(1);

      const pilotStartedAt = baselineRow?.capturedAt ?? null;
      const dayInPilot = pilotStartedAt ? daysBetween(new Date(pilotStartedAt), new Date()) : null;
      const decisionWindowOpen =
        district.isPilot && dayInPilot !== null && dayInPilot >= DECISION_WINDOW_OPENS_DAY;

      const [existingDecision] = await db
        .select()
        .from(pilotDecisionsTable)
        .where(eq(pilotDecisionsTable.districtId, districtId))
        .limit(1);

      const decisionPayload = existingDecision
        ? {
            outcome: existingDecision.outcome,
            reasonNote: existingDecision.reasonNote,
            surveyResponses: existingDecision.surveyResponses,
            decidedByName: existingDecision.decidedByName,
            createdAt: existingDecision.createdAt.toISOString(),
          }
        : null;

      // Banner shows only when the window is open AND no decision recorded yet.
      const showBanner = decisionWindowOpen && !existingDecision;

      const [roi, contractPreview] = await Promise.all([
        buildRoiPanel(districtId),
        buildContractPreview(districtId),
      ]);

      res.json({
        districtId,
        districtName: district.name,
        isPilot: district.isPilot,
        pilotStartedAt: pilotStartedAt ? pilotStartedAt.toISOString() : null,
        pilotLengthDays: PILOT_LENGTH_DAYS,
        decisionWindowOpensDay: DECISION_WINDOW_OPENS_DAY,
        dayInPilot,
        decisionWindowOpen,
        showBanner,
        decision: decisionPayload,
        roi,
        contractPreview,
      });
    } catch (err) {
      logger.error({ err }, "GET /pilot/decision/status failed");
      res.status(500).json({ error: "Failed to load pilot decision status" });
    }
  },
);

const submitSchema = z.object({
  outcome: z.enum(["renew", "request_changes", "decline"]),
  surveyResponses: z.record(z.string(), z.unknown()).default({}),
  reasonNote: z.string().trim().max(4000).optional(),
});

/**
 * POST /api/pilot/decision
 * Record a renewal decision. Idempotent on (districtId): a second submission
 * returns 409 with the existing row so the UI can render the read-only state
 * without losing data. The "Renew now" outcome does NOT itself charge or
 * upgrade the subscription — the existing /billing/checkout flow handles
 * that. We just capture intent + notify.
 */
router.post(
  "/pilot/decision",
  requireRoles("admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const districtId = getEnforcedDistrictId(req as unknown as AuthedRequest);
      if (districtId == null) {
        res.status(400).json({ error: "District scope required" });
        return;
      }

      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
        return;
      }
      const { outcome, surveyResponses, reasonNote } = parsed.data;

      // Require a reason note for non-renew outcomes so the account manager
      // has something to follow up on.
      if ((outcome === "request_changes" || outcome === "decline") && !reasonNote) {
        res.status(400).json({ error: "A reason note is required for this outcome" });
        return;
      }

      const authed = req as unknown as AuthedRequest;

      // Block submission if the window isn't open or the district isn't a pilot.
      const [district] = await db
        .select({ isPilot: districtsTable.isPilot, name: districtsTable.name })
        .from(districtsTable)
        .where(eq(districtsTable.id, districtId))
        .limit(1);
      if (!district || !district.isPilot) {
        res.status(409).json({ error: "District is not in an active pilot" });
        return;
      }

      // Enforce the day-60 decision window so the API matches the banner/page
      // gating. Without this an admin could submit on day 1 via direct API call.
      const [baselineRow] = await db
        .select({ capturedAt: pilotBaselineSnapshotsTable.capturedAt })
        .from(pilotBaselineSnapshotsTable)
        .where(eq(pilotBaselineSnapshotsTable.districtId, districtId))
        .limit(1);
      const pilotStartedAt = baselineRow?.capturedAt ?? null;
      const dayInPilot = pilotStartedAt ? daysBetween(new Date(pilotStartedAt), new Date()) : null;
      if (dayInPilot === null || dayInPilot < DECISION_WINDOW_OPENS_DAY) {
        res.status(409).json({
          error: "Pilot decision window is not open yet",
          decisionWindowOpensDay: DECISION_WINDOW_OPENS_DAY,
          dayInPilot,
        });
        return;
      }

      const [existing] = await db
        .select()
        .from(pilotDecisionsTable)
        .where(eq(pilotDecisionsTable.districtId, districtId))
        .limit(1);
      if (existing) {
        res.status(409).json({
          error: "A pilot decision has already been recorded for this district",
          decision: {
            outcome: existing.outcome,
            reasonNote: existing.reasonNote,
            surveyResponses: existing.surveyResponses,
            decidedByName: existing.decidedByName,
            createdAt: existing.createdAt.toISOString(),
          },
        });
        return;
      }

      const [created] = await db
        .insert(pilotDecisionsTable)
        .values({
          districtId,
          outcome,
          surveyResponses: surveyResponses ?? {},
          reasonNote: reasonNote ?? null,
          decidedByUserId: authed.userId,
          decidedByName: authed.displayName ?? null,
        })
        .returning();

      logAudit(req, {
        action: "create",
        targetTable: "pilot_decisions",
        targetId: created.id,
        summary: `Pilot decision recorded: ${outcome}`,
        newValues: {
          outcome,
          hasReason: Boolean(reasonNote),
          surveyResponseKeys: Object.keys(surveyResponses ?? {}),
        },
        metadata: { districtId, districtName: district.name },
      });

      // Fire-and-forget notification. Failures are logged but never fail the
      // request — the decision is already persisted and audit-logged.
      void notifyAccountManager({
        districtId,
        districtName: district.name,
        outcome,
        reasonNote: reasonNote ?? null,
        decidedByName: authed.displayName ?? "District admin",
      }).catch((err) => logger.warn({ err, districtId }, "pilot decision notification failed (non-fatal)"));

      res.status(201).json({
        decision: {
          outcome: created.outcome,
          reasonNote: created.reasonNote,
          surveyResponses: created.surveyResponses,
          decidedByName: created.decidedByName,
          createdAt: created.createdAt.toISOString(),
        },
      });
    } catch (err) {
      logger.error({ err }, "POST /pilot/decision failed");
      res.status(500).json({ error: "Failed to record pilot decision" });
    }
  },
);

interface NotifyArgs {
  districtId: number;
  districtName: string;
  outcome: "renew" | "request_changes" | "decline";
  reasonNote: string | null;
  decidedByName: string;
}

async function notifyAccountManager(args: NotifyArgs): Promise<void> {
  const recipients: string[] = [];
  if (ACCOUNT_MANAGER_EMAIL) recipients.push(ACCOUNT_MANAGER_EMAIL);
  // Also CC district admins so they have a record of the submission.
  const districtAdmins = await getDistrictAdminEmails(args.districtId);
  for (const e of districtAdmins) if (!recipients.includes(e)) recipients.push(e);
  if (recipients.length === 0) {
    logger.info({ districtId: args.districtId, outcome: args.outcome }, "pilot decision: no notification recipients configured");
    return;
  }

  const outcomeLabel = {
    renew: "Renew now",
    request_changes: "Request changes",
    decline: "Decline",
  }[args.outcome];

  const baseUrl = getAppBaseUrl();
  const link = baseUrl ? `${baseUrl}/pilot-decision` : null;

  const reasonHtml = args.reasonNote
    ? `<p><strong>Reason / notes:</strong><br>${escapeHtml(args.reasonNote)}</p>`
    : "";
  const linkHtml = link ? `<p><a href="${link}">Open the pilot decision page</a></p>` : "";

  const subject = `Pilot decision (${outcomeLabel}): ${args.districtName}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px">
    <h2 style="margin:0 0 12px">Pilot decision recorded</h2>
    <p><strong>${escapeHtml(args.districtName)}</strong> chose <strong>${outcomeLabel}</strong>.</p>
    <p>Submitted by ${escapeHtml(args.decidedByName)}.</p>
    ${reasonHtml}
    ${linkHtml}
  </div>`;
  const text = `Pilot decision recorded for ${args.districtName}: ${outcomeLabel}. Submitted by ${args.decidedByName}.${args.reasonNote ? `\n\nReason: ${args.reasonNote}` : ""}`;

  await sendAdminEmail({
    to: recipients,
    subject,
    html,
    text,
    notificationType: `pilot_decision_${args.outcome}`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default router;
