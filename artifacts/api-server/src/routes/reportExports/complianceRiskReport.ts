import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, schoolsTable, serviceRequirementsTable, serviceTypesTable,
  staffTable, compensatoryObligationsTable, districtsTable,
} from "@workspace/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import type { AuthedRequest } from "../../middlewares/auth";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import { computeAllActiveMinuteProgress, type MinuteProgressResult } from "../../lib/minuteCalc";
import { getRateMap, minutesToDollars as sharedMinutesToDollars, type RateInfo } from "../compensatoryFinance/shared";
import { logAudit } from "../../lib/auditLog";
import { buildCSV, recordExport, fmtDate } from "./utils";

const router = Router();

function minutesToDollars(minutes: number, rate: RateInfo): number | null {
  return sharedMinutesToDollars(minutes, rate);
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

function riskSortOrder(status: string): number {
  switch (status) {
    case "out_of_compliance": return 0;
    case "at_risk": return 1;
    case "slightly_behind": return 2;
    case "on_track": return 3;
    case "completed": return 4;
    default: return 5;
  }
}

router.get("/reports/compliance-risk-report", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (!districtId) {
      res.status(403).json({ error: "District context required" });
      return;
    }

    const rawSchoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    if (rawSchoolId !== undefined && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
      res.status(400).json({ error: "Invalid schoolId parameter" });
      return;
    }
    const schoolId = rawSchoolId;

    const compObligationConditions = [
      eq(compensatoryObligationsTable.status, "pending"),
      eq(schoolsTable.districtId, districtId),
    ];
    if (schoolId) compObligationConditions.push(eq(schoolsTable.id, schoolId) as any);

    const [districtRows, progress, rateMap, outstandingObligations] = await Promise.all([
      db.select({ name: districtsTable.name }).from(districtsTable).where(eq(districtsTable.id, districtId)),
      computeAllActiveMinuteProgress({ districtId, schoolId }),
      getRateMap(districtId),
      db.select({
        studentId: compensatoryObligationsTable.studentId,
        minutesOwed: compensatoryObligationsTable.minutesOwed,
        minutesDelivered: compensatoryObligationsTable.minutesDelivered,
      }).from(compensatoryObligationsTable)
        .innerJoin(studentsTable, eq(studentsTable.id, compensatoryObligationsTable.studentId))
        .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
        .where(and(...compObligationConditions)),
    ]);

    const districtName = districtRows[0]?.name ?? "District";

    const schoolIds = [...new Set(progress.map(p => p.studentId))];
    const studentSchools = schoolIds.length > 0
      ? await db.select({
          studentId: studentsTable.id,
          schoolName: schoolsTable.name,
          grade: studentsTable.grade,
        }).from(studentsTable)
          .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
          .where(sql`${studentsTable.id} IN (${sql.join(schoolIds.map(id => sql`${id}`), sql`, `)})`)
      : [];

    const schoolMap = new Map(studentSchools.map(s => [s.studentId, { schoolName: s.schoolName ?? "", grade: s.grade ?? "" }]));

    const studentRows: {
      studentId: number;
      studentName: string;
      school: string;
      grade: string;
      service: string;
      intervalType: string;
      requiredMinutes: number;
      deliveredMinutes: number;
      shortfallMinutes: number;
      percentComplete: number;
      riskStatus: string;
      riskLabel: string;
      providerName: string;
      estimatedExposure: number | null;
      rateConfigured: boolean;
      missedSessions: number;
    }[] = [];

    let totalRequired = 0;
    let totalDelivered = 0;
    let totalExpectedByNow = 0;
    let totalExposure = 0;
    const uniqueStudents = new Set<number>();
    const providerMap = new Map<string, {
      providerName: string;
      studentsServed: Set<number>;
      totalDelivered: number;
      totalRequired: number;
      totalShortfall: number;
      servicesCount: number;
    }>();

    let unpricedShortfallMinutes = 0;
    const unpricedServiceTypes = new Set<string>();
    for (const p of progress) {
      const info = schoolMap.get(p.studentId);
      const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
      const rates = rateMap.get(p.serviceTypeId);
      const rateInfo: RateInfo = rates?.inHouse ?? { rate: null, source: "unconfigured" };
      // Per-row exposure is null (not 0) when the rate is unconfigured, so
      // downstream consumers can distinguish "actually $0 owed" from "couldn't
      // compute a dollar value" without re-deriving it from the row contents.
      const exposureValue: number | null = shortfall > 0 ? minutesToDollars(shortfall, rateInfo) : 0;

      totalRequired += p.requiredMinutes;
      totalDelivered += p.deliveredMinutes;
      totalExpectedByNow += p.expectedMinutesByNow;
      if (exposureValue != null) {
        totalExposure += exposureValue;
      } else if (shortfall > 0) {
        unpricedShortfallMinutes += shortfall;
        unpricedServiceTypes.add(p.serviceTypeName);
      }
      uniqueStudents.add(p.studentId);

      studentRows.push({
        studentId: p.studentId,
        studentName: p.studentName,
        school: info?.schoolName ?? "",
        grade: info?.grade ?? "",
        service: p.serviceTypeName,
        intervalType: p.intervalType,
        requiredMinutes: p.requiredMinutes,
        deliveredMinutes: p.deliveredMinutes,
        shortfallMinutes: shortfall,
        percentComplete: p.percentComplete,
        riskStatus: p.riskStatus,
        riskLabel: riskLabel(p.riskStatus),
        providerName: p.providerName ?? "Unassigned",
        estimatedExposure: exposureValue,
        rateConfigured: exposureValue != null,
        missedSessions: p.missedSessionsCount,
      });

      const provKey = p.providerName ?? "Unassigned";
      if (!providerMap.has(provKey)) {
        providerMap.set(provKey, {
          providerName: provKey,
          studentsServed: new Set(),
          totalDelivered: 0,
          totalRequired: 0,
          totalShortfall: 0,
          servicesCount: 0,
        });
      }
      const prov = providerMap.get(provKey)!;
      prov.studentsServed.add(p.studentId);
      prov.totalDelivered += p.deliveredMinutes;
      prov.totalRequired += p.requiredMinutes;
      prov.totalShortfall += shortfall;
      prov.servicesCount++;
    }

    studentRows.sort((a, b) => riskSortOrder(a.riskStatus) - riskSortOrder(b.riskStatus) || a.studentName.localeCompare(b.studentName));

    const needsAttention = studentRows.filter(r => r.riskStatus === "out_of_compliance" || r.riskStatus === "at_risk");

    // Existing compensatory obligations are not joined to a service type here,
    // so we do NOT fabricate a dollar exposure with a default rate. Surface
    // them as unpriced minutes that the finance UI can highlight separately.
    let existingCompUnpricedMinutes = 0;
    for (const ob of outstandingObligations) {
      const remaining = (ob.minutesOwed ?? 0) - (ob.minutesDelivered ?? 0);
      if (remaining > 0) existingCompUnpricedMinutes += remaining;
    }
    const existingCompExposure: number | null = null;

    const providerSummary = Array.from(providerMap.values())
      .map(p => ({
        providerName: p.providerName,
        studentsServed: p.studentsServed.size,
        totalDelivered: p.totalDelivered,
        totalRequired: p.totalRequired,
        totalShortfall: p.totalShortfall,
        complianceRate: p.totalRequired > 0 ? Math.round((p.totalDelivered / p.totalRequired) * 1000) / 10 : 100,
        servicesCount: p.servicesCount,
      }))
      .sort((a, b) => a.complianceRate - b.complianceRate);

    const totalShortfall = Math.max(0, totalRequired - totalDelivered);
    const overallComplianceRate = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 1000) / 10 : 100;
    const paceShortfall = Math.max(0, Math.round(totalExpectedByNow - totalDelivered));
    const paceAheadBy = Math.max(0, Math.round(totalDelivered - totalExpectedByNow));
    const paceComplianceRate = totalExpectedByNow > 0 ? Math.min(100, Math.round((totalDelivered / totalExpectedByNow) * 1000) / 10) : 100;

    const today = new Date();
    const intervalLabel = progress.length > 0
      ? `${fmtDate(progress[0].intervalStart)} – ${fmtDate(progress[0].intervalEnd)}`
      : `As of ${fmtDate(today.toISOString())}`;

    const report = {
      meta: {
        districtName,
        generatedAt: today.toISOString(),
        reportPeriod: intervalLabel,
        schoolFilter: schoolId ?? null,
      },
      summary: {
        totalStudents: uniqueStudents.size,
        totalServiceRequirements: progress.length,
        totalRequiredMinutes: totalRequired,
        totalDeliveredMinutes: totalDelivered,
        totalShortfallMinutes: totalShortfall,
        overallComplianceRate,
        totalExpectedByNow: Math.round(totalExpectedByNow),
        paceShortfall,
        paceAheadBy,
        paceComplianceRate,
        totalCurrentExposure: totalExposure,
        unpricedShortfallMinutes,
        unpricedShortfallServiceTypes: [...unpricedServiceTypes],
        existingCompensatoryExposure: existingCompExposure,
        existingCompensatoryUnpricedMinutes: existingCompUnpricedMinutes,
        combinedExposure: Math.round(totalExposure * 100) / 100,
        rateConfigNote:
          unpricedShortfallMinutes > 0 || existingCompUnpricedMinutes > 0
            ? "Some service types do not have a configured hourly rate. Their minutes are reported but excluded from dollar exposure totals. Configure rates in Settings → Compensatory Finance → Rates."
            : null,
        studentsOutOfCompliance: new Set(studentRows.filter(r => r.riskStatus === "out_of_compliance").map(r => r.studentId)).size,
        studentsAtRisk: new Set(studentRows.filter(r => r.riskStatus === "at_risk").map(r => r.studentId)).size,
        studentsOnTrack: new Set(studentRows.filter(r => r.riskStatus === "on_track" || r.riskStatus === "completed").map(r => r.studentId)).size,
      },
      needsAttention,
      studentDetail: studentRows,
      providerSummary,
    };

    logAudit(req, {
      action: "read",
      targetTable: "service_requirements",
      summary: `Generated compliance risk report (${uniqueStudents.size} students, ${progress.length} requirements)`,
      metadata: { reportType: "compliance-risk-report" },
    });

    res.json(report);
  } catch (e: any) {
    console.error("GET /reports/compliance-risk-report error:", e);
    res.status(500).json({ error: "Failed to generate compliance risk report" });
  }
});

router.get("/reports/compliance-risk-report.csv", async (req: Request, res: Response): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (!districtId) {
      res.status(403).json({ error: "District context required" });
      return;
    }

    const rawSchoolId = req.query.schoolId ? Number(req.query.schoolId) : undefined;
    if (rawSchoolId !== undefined && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
      res.status(400).json({ error: "Invalid schoolId parameter" });
      return;
    }
    const schoolId = rawSchoolId;

    const [progress, rateMap] = await Promise.all([
      computeAllActiveMinuteProgress({ districtId, schoolId }),
      getRateMap(districtId),
    ]);

    const studentSchoolData = progress.length > 0
      ? await db.select({
          studentId: studentsTable.id,
          schoolName: schoolsTable.name,
          grade: studentsTable.grade,
        }).from(studentsTable)
          .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
          .where(sql`${studentsTable.id} IN (${sql.join([...new Set(progress.map(p => p.studentId))].map(id => sql`${id}`), sql`, `)})`)
      : [];

    const schoolMap = new Map(studentSchoolData.map(s => [s.studentId, { schoolName: s.schoolName ?? "", grade: s.grade ?? "" }]));

    const headers = ["Student", "School", "Grade", "Service", "Interval", "Required Min", "Delivered Min", "Shortfall Min", "% Complete", "Risk Level", "Provider", "Est. Exposure ($)", "Missed Sessions"];
    const rows = progress
      .map(p => {
        const info = schoolMap.get(p.studentId);
        const shortfall = Math.max(0, p.requiredMinutes - p.deliveredMinutes);
        const rates = rateMap.get(p.serviceTypeId);
        const rateInfo: RateInfo = rates?.inHouse ?? { rate: null, source: "unconfigured" };
        const exposure = shortfall > 0 ? minutesToDollars(shortfall, rateInfo) : 0;
        const exposureCell = exposure == null ? "RATE NOT CONFIGURED" : `$${exposure.toFixed(2)}`;
        return {
          sort: riskSortOrder(p.riskStatus),
          row: [
            p.studentName, info?.schoolName ?? "", info?.grade ?? "", p.serviceTypeName, p.intervalType,
            p.requiredMinutes, p.deliveredMinutes, shortfall, `${p.percentComplete}%`,
            riskLabel(p.riskStatus), p.providerName ?? "Unassigned", exposureCell, p.missedSessionsCount,
          ],
        };
      })
      .sort((a, b) => a.sort - b.sort)
      .map(r => r.row);

    const filename = `Compliance_Risk_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    recordExport(req, { reportType: "compliance-risk-report", reportLabel: "Compliance Risk Report", format: "csv", fileName: filename, recordCount: rows.length });
    logAudit(req, { action: "read", targetTable: "service_requirements", summary: `Exported compliance risk report CSV (${rows.length} rows)`, metadata: { reportType: "compliance-risk-report-csv" } });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buildCSV(headers, rows));
  } catch (e: any) {
    console.error("GET /reports/compliance-risk-report.csv error:", e);
    res.status(500).json({ error: "Failed to generate compliance risk report CSV" });
  }
});

export default router;
