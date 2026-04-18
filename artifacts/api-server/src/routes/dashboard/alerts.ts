// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, alertsTable,
  complianceEventsTable, teamMeetingsTable,
  restraintIncidentsTable,
  medicalAlertsTable,
} from "@workspace/db";
import { eq, and, count, sql, desc, isNull, inArray } from "drizzle-orm";
import {
  parseSchoolDistrictFilters,
  buildAlertStudentFilter,
} from "./shared";

const router: IRouter = Router();

router.get("/dashboard/alerts-summary", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const alertFilter = buildAlertStudentFilter(sdFilters);
  const conditions: any[] = [
    eq(alertsTable.resolved, false),
    sql`(${alertsTable.snoozedUntil} IS NULL OR ${alertsTable.snoozedUntil} <= NOW())`,
  ];
  if (alertFilter) conditions.push(alertFilter);

  const rows = await db
    .select({
      severity: alertsTable.severity,
      count: count(),
    })
    .from(alertsTable)
    .where(and(...conditions))
    .groupBy(alertsTable.severity);

  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  let total = 0;
  for (const r of rows) {
    counts[r.severity] = r.count;
    total += r.count;
  }

  res.json({ ...counts, total });
});

router.get("/dashboard/needs-attention", async (req, res): Promise<void> => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [openIncidentsResult, unresolvedAlertsResult, actionItemsResult, pendingNotificationsResult] = await Promise.all([
      db.select({ count: count() })
        .from(restraintIncidentsTable)
        .where(eq(restraintIncidentsTable.status, "open")),
      db.select({ count: count() })
        .from(complianceEventsTable)
        .where(sql`${complianceEventsTable.status} NOT IN ('completed') AND ${complianceEventsTable.resolvedAt} IS NULL`),
      db.select({ actionItems: teamMeetingsTable.actionItems })
        .from(teamMeetingsTable)
        .where(
          and(
            sql`${teamMeetingsTable.actionItems} IS NOT NULL`,
            sql`jsonb_array_length(${teamMeetingsTable.actionItems}) > 0`,
          )
        ),
      db.select({ count: count() })
        .from(restraintIncidentsTable)
        .where(
          and(
            inArray(restraintIncidentsTable.status, ["under_review", "resolved"]),
            sql`${restraintIncidentsTable.parentNotificationSentAt} IS NULL`,
          )
        ),
    ]);

    const openIncidents = openIncidentsResult[0]?.count ?? 0;
    const unresolvedAlerts = unresolvedAlertsResult[0]?.count ?? 0;
    const pendingNotifications = pendingNotificationsResult[0]?.count ?? 0;

    type ActionItem = { status?: string; dueDate?: string };
    let overdueActionItems = 0;
    for (const row of actionItemsResult) {
      const items: ActionItem[] = Array.isArray(row.actionItems) ? (row.actionItems as ActionItem[]) : [];
      for (const item of items) {
        if (item.status === "open" && item.dueDate && item.dueDate < today) {
          overdueActionItems++;
        }
      }
    }

    const total = openIncidents + unresolvedAlerts + overdueActionItems + pendingNotifications;

    res.json({
      total,
      openIncidents,
      unresolvedAlerts,
      overdueActionItems,
      pendingNotifications,
    });
  } catch (e: any) {
    console.error("GET /dashboard/needs-attention error:", e);
    res.status(500).json({ error: "Failed to fetch needs-attention data" });
  }
});

router.get("/dashboard/critical-medical-alerts", async (req, res): Promise<void> => {
  try {
    const { restraintIncidentsTable } = await import("@workspace/db");
    const sdFilters = parseSchoolDistrictFilters(req, req.query);

    const today = new Date().toISOString().slice(0, 10);

    const conditions: any[] = [
      sql`${restraintIncidentsTable.incidentDate} = ${today}`,
      sql`(
        ${restraintIncidentsTable.emergencyServicesCalled} = true
        OR ${restraintIncidentsTable.medicalAttentionRequired} = true
        OR ${restraintIncidentsTable.studentInjury} = true
      )`,
      isNull(studentsTable.deletedAt),
    ];
    if (sdFilters.schoolId) {
      conditions.push(eq(studentsTable.schoolId, sdFilters.schoolId));
    } else if (sdFilters.districtId) {
      conditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);
    }

    const events = await db
      .select({
        id: restraintIncidentsTable.id,
        studentId: restraintIncidentsTable.studentId,
        incidentDate: restraintIncidentsTable.incidentDate,
        incidentTime: restraintIncidentsTable.incidentTime,
        incidentType: restraintIncidentsTable.incidentType,
        behaviorDescription: restraintIncidentsTable.behaviorDescription,
        emergencyServicesCalled: restraintIncidentsTable.emergencyServicesCalled,
        medicalAttentionRequired: restraintIncidentsTable.medicalAttentionRequired,
        medicalDetails: restraintIncidentsTable.medicalDetails,
        studentInjury: restraintIncidentsTable.studentInjury,
        studentInjuryDescription: restraintIncidentsTable.studentInjuryDescription,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
        studentGrade: studentsTable.grade,
      })
      .from(restraintIncidentsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, restraintIncidentsTable.studentId))
      .where(and(...conditions))
      .orderBy(
        desc(restraintIncidentsTable.emergencyServicesCalled),
        desc(restraintIncidentsTable.medicalAttentionRequired),
        desc(restraintIncidentsTable.incidentTime)
      )
      .limit(20);

    res.json(events);
  } catch (e: any) {
    console.error("GET /dashboard/critical-medical-alerts error:", e);
    res.status(500).json({ error: "Failed to fetch medical event alerts" });
  }
});

// Life-threatening profile-level medical alerts (not today's incidents).
// Returns all active students in the district who have at least one alert
// with severity = "life_threatening" AND notifyAllStaff = true.
// Role-gated: staff roles that interact with students only.
const LIFE_ALERT_READ_ROLES = ["admin", "case_manager", "coordinator", "sped_teacher", "provider", "bcba", "para"];

router.get("/dashboard/life-threatening-alerts", async (req, res): Promise<void> => {
  try {
    const { trellisRole, districtId } = req as any;
    if (!LIFE_ALERT_READ_ROLES.includes(trellisRole ?? "")) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const conditions: any[] = [
      eq(medicalAlertsTable.severity, "life_threatening"),
      eq(medicalAlertsTable.notifyAllStaff, true),
      isNull(studentsTable.deletedAt),
      eq(studentsTable.status, "active"),
    ];

    if (districtId) {
      conditions.push(
        sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${districtId})`
      );
    }

    const rows = await db
      .select({
        alertId: medicalAlertsTable.id,
        alertType: medicalAlertsTable.alertType,
        description: medicalAlertsTable.description,
        treatmentNotes: medicalAlertsTable.treatmentNotes,
        epiPenOnFile: medicalAlertsTable.epiPenOnFile,
        studentId: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        grade: studentsTable.grade,
      })
      .from(medicalAlertsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, medicalAlertsTable.studentId))
      .where(and(...conditions))
      .orderBy(studentsTable.lastName, studentsTable.firstName);

    res.json(rows);
  } catch (e: any) {
    console.error("GET /dashboard/life-threatening-alerts error:", e);
    res.status(500).json({ error: "Failed to fetch life-threatening alerts" });
  }
});

export default router;
