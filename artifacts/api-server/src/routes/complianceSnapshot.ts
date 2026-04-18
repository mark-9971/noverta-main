// tenant-scope: mixed (see individual exports below)
/**
 * Compliance snapshot share link routes.
 *
 * complianceSnapshotPublicRouter  — GET /share/compliance/:token
 *   Public, no auth. Looks up the token, checks expiry, and returns the snapshot.
 *   Returns 404 (not 403) for expired or nonexistent tokens to prevent enumeration.
 *   No student PII is included in the response.
 *
 * complianceSnapshotRouter  — POST /compliance/share-snapshot
 *   Authenticated, district-scoped. Computes a compliance snapshot, stores it
 *   with a random UUID token, and returns the share URL. Valid for 7 days.
 */
import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { complianceSnapshotsTable, districtsTable, schoolYearsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";
import { getEnforcedDistrictId } from "../middlewares/auth";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";
import { getRateMap, minutesToDollars as sharedMinutesToDollars, type RateInfo } from "./compensatoryFinance/shared";

function resolveDistrictId(req: Request): number | null {
  const enforced = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforced !== null) return enforced;
  const qd = req.query.districtId;
  if (qd) {
    const n = Number(qd);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function riskLabel(status: string): string {
  switch (status) {
    case "out_of_compliance": return "Out of Compliance";
    case "at_risk": return "At Risk";
    case "slightly_behind": return "Slightly Behind";
    case "on_track": return "On Track";
    case "completed": return "Completed";
    default: return status;
  }
}

function anonymizeStudentId(studentId: number): string {
  return `STU-${String(studentId).padStart(4, "0").slice(-4)}`;
}

// ── Public GET — no auth required ────────────────────────────────────────────

export const complianceSnapshotPublicRouter = Router();

complianceSnapshotPublicRouter.get("/share/compliance/:token", async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== "string" || token.length > 128) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [row] = await db
      .select({
        id: complianceSnapshotsTable.id,
        snapshotJson: complianceSnapshotsTable.snapshotJson,
        expiresAt: complianceSnapshotsTable.expiresAt,
        createdAt: complianceSnapshotsTable.createdAt,
      })
      .from(complianceSnapshotsTable)
      .where(eq(complianceSnapshotsTable.token, token))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (row.expiresAt < new Date()) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const snapshot = JSON.parse(row.snapshotJson);
    res.json({
      ...snapshot,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    });
  } catch (e: any) {
    console.error("GET /share/compliance/:token error:", e);
    res.status(500).json({ error: "Failed to load snapshot" });
  }
});

// ── Authenticated POST — district-scoped ──────────────────────────────────────

const router = Router();

router.post("/compliance/share-snapshot", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = resolveDistrictId(req);
    if (!districtId) {
      res.status(403).json({ error: "District context required" });
      return;
    }

    const rawSchoolId = req.body?.schoolId ? Number(req.body.schoolId) : undefined;
    const rawSchoolYearId = req.body?.schoolYearId ? Number(req.body.schoolYearId) : undefined;

    let yearDates: { startDate: string; endDate: string } | null = null;
    if (rawSchoolYearId) {
      const [year] = await db
        .select({ startDate: schoolYearsTable.startDate, endDate: schoolYearsTable.endDate })
        .from(schoolYearsTable)
        .where(eq(schoolYearsTable.id, rawSchoolYearId))
        .limit(1);
      yearDates = year ?? null;
    }

    const [districtRows, progress, rateMap] = await Promise.all([
      db.select({ name: districtsTable.name }).from(districtsTable).where(eq(districtsTable.id, districtId)),
      computeAllActiveMinuteProgress({ districtId, schoolId: rawSchoolId, ...(yearDates ?? {}) }),
      getRateMap(districtId),
    ]);

    const districtName = districtRows[0]?.name ?? "District";

    const today = new Date();
    const intervalLabel = progress.length > 0
      ? `${progress[0].intervalStart} – ${progress[0].intervalEnd}`
      : `As of ${today.toISOString().slice(0, 10)}`;

    let totalRequired = 0;
    let totalDelivered = 0;
    let totalExposure = 0;
    const uniqueStudents = new Set<number>();
    const providerMap = new Map<string, {
      providerName: string;
      studentsServed: Set<number>;
      totalDelivered: number;
      totalRequired: number;
      totalShortfall: number;
    }>();

    const atRiskRows: {
      anonymizedId: string;
      service: string;
      shortfallMinutes: number;
      percentComplete: number;
      riskStatus: string;
      riskLabel: string;
      estimatedExposure: number;
    }[] = [];

    for (const p of progress) {
      const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
      const rates = rateMap.get(p.serviceTypeId);
      const rateInfo: RateInfo = rates?.inHouse ?? { rate: null, source: "unconfigured" };
      const exposureValue: number = shortfall > 0 ? (sharedMinutesToDollars(shortfall, rateInfo) ?? 0) : 0;

      totalRequired += p.requiredMinutes;
      totalDelivered += p.deliveredMinutes;
      totalExposure += exposureValue;
      uniqueStudents.add(p.studentId);

      if (p.riskStatus === "out_of_compliance" || p.riskStatus === "at_risk") {
        atRiskRows.push({
          anonymizedId: anonymizeStudentId(p.studentId),
          service: p.serviceTypeName,
          shortfallMinutes: shortfall,
          percentComplete: p.percentComplete,
          riskStatus: p.riskStatus,
          riskLabel: riskLabel(p.riskStatus),
          estimatedExposure: exposureValue,
        });
      }

      const provKey = p.providerName ?? "Unassigned";
      if (!providerMap.has(provKey)) {
        providerMap.set(provKey, { providerName: provKey, studentsServed: new Set(), totalDelivered: 0, totalRequired: 0, totalShortfall: 0 });
      }
      const prov = providerMap.get(provKey)!;
      prov.studentsServed.add(p.studentId);
      prov.totalDelivered += p.deliveredMinutes;
      prov.totalRequired += p.requiredMinutes;
      prov.totalShortfall += shortfall;
    }

    const overallComplianceRate = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 1000) / 10 : 100;
    const atRiskCount = new Set(
      progress.filter(p => p.riskStatus === "out_of_compliance" || p.riskStatus === "at_risk").map(p => p.studentId)
    ).size;

    const providerSummary = Array.from(providerMap.values()).map(p => ({
      providerName: p.providerName,
      studentsServed: p.studentsServed.size,
      totalDelivered: p.totalDelivered,
      totalRequired: p.totalRequired,
      totalShortfall: p.totalShortfall,
      complianceRate: p.totalRequired > 0 ? Math.round((p.totalDelivered / p.totalRequired) * 1000) / 10 : 100,
    })).sort((a, b) => a.complianceRate - b.complianceRate);

    const snapshot = {
      districtName,
      schoolYear: intervalLabel,
      generatedAt: today.toISOString(),
      summary: {
        overallComplianceRate,
        totalStudents: uniqueStudents.size,
        atRiskCount,
        totalExposure: Math.round(totalExposure * 100) / 100,
      },
      atRiskRows: atRiskRows.slice(0, 50),
      providerSummary,
    };

    const token = randomUUID();
    const expiresAt = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(complianceSnapshotsTable).values({
      token,
      districtId,
      snapshotJson: JSON.stringify(snapshot),
      expiresAt,
    });

    res.json({ token, expiresAt: expiresAt.toISOString() });
  } catch (e: any) {
    console.error("POST /compliance/share-snapshot error:", e);
    res.status(500).json({ error: "Failed to create compliance snapshot" });
  }
});

export default router;
