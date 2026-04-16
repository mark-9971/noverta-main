import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, iepDocumentsTable, progressReportsTable,
  teamMeetingsTable, parentContactsTable, iepAccommodationsTable,
  iepGoalsTable, alertsTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sql, isNull, ne } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { requireTierAccess } from "../middlewares/tierGate";

const router: IRouter = Router();
router.use(requireTierAccess("compliance.checklist"));

const PRIVILEGED_ROLES = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider"] as const;

const TODAY = () => new Date().toISOString().split("T")[0];
const daysDiff = (a: string, b: string) =>
  Math.ceil((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

interface ChecklistItem {
  key: string;
  label: string;
  status: "ok" | "warning" | "critical" | "info";
  detail: string;
  actionUrl?: string;
  actionLabel?: string;
  dueDate?: string;
  daysUntilDue?: number;
}

interface StudentChecklist {
  studentId: number;
  studentName: string;
  grade: string | null;
  schoolId: number | null;
  overallStatus: "ok" | "warning" | "critical";
  items: ChecklistItem[];
  criticalCount: number;
  warningCount: number;
}

function overallStatus(items: ChecklistItem[]): "ok" | "warning" | "critical" {
  if (items.some(i => i.status === "critical")) return "critical";
  if (items.some(i => i.status === "warning")) return "warning";
  return "ok";
}

router.get("/compliance/checklist", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  try {
    const authed = req as AuthedRequest;
    const today = TODAY();
    const schoolIdFilter = req.query.schoolId ? Number(req.query.schoolId) : null;

    // 1. Fetch all active students
    const activeCond = and(eq(studentsTable.status, "active"), isNull(studentsTable.deletedAt));
    const studentsCond = schoolIdFilter
      ? and(eq(studentsTable.schoolId, schoolIdFilter), activeCond)
      : activeCond;

    const students = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      schoolId: studentsTable.schoolId,
      dob: studentsTable.dateOfBirth,
    }).from(studentsTable).where(studentsCond).orderBy(studentsTable.lastName);

    const studentIds = students.map(s => s.id);
    if (studentIds.length === 0) { res.json([]); return; }

    // 2. Fetch latest IEP doc per student
    const allIeps = await db.select({
      studentId: iepDocumentsTable.studentId,
      id: iepDocumentsTable.id,
      status: iepDocumentsTable.status,
      iepStartDate: iepDocumentsTable.iepStartDate,
      iepEndDate: iepDocumentsTable.iepEndDate,
      meetingDate: iepDocumentsTable.meetingDate,
    })
      .from(iepDocumentsTable)
      .where(sql`${iepDocumentsTable.studentId} = ANY(${sql.raw(`ARRAY[${studentIds.join(",")}]::int[]`)})`)
      .orderBy(desc(iepDocumentsTable.iepEndDate));

    const iepByStudent = new Map<number, typeof allIeps[0]>();
    for (const iep of allIeps) {
      if (!iepByStudent.has(iep.studentId)) iepByStudent.set(iep.studentId, iep);
    }

    // 3. Fetch latest progress report per student
    const allPRs = await db.select({
      studentId: progressReportsTable.studentId,
      id: progressReportsTable.id,
      reportingPeriod: progressReportsTable.reportingPeriod,
      periodEnd: progressReportsTable.periodEnd,
      status: progressReportsTable.status,
      parentNotificationDate: progressReportsTable.parentNotificationDate,
    })
      .from(progressReportsTable)
      .where(sql`${progressReportsTable.studentId} = ANY(${sql.raw(`ARRAY[${studentIds.join(",")}]::int[]`)})`)
      .orderBy(desc(progressReportsTable.periodEnd));

    const prByStudent = new Map<number, typeof allPRs[0]>();
    const prCountByStudent = new Map<number, number>();
    for (const pr of allPRs) {
      if (!prByStudent.has(pr.studentId)) prByStudent.set(pr.studentId, pr);
      prCountByStudent.set(pr.studentId, (prCountByStudent.get(pr.studentId) ?? 0) + 1);
    }

    // 4. Fetch latest team meeting per student
    const allMeetings = await db.select({
      studentId: teamMeetingsTable.studentId,
      id: teamMeetingsTable.id,
      meetingType: teamMeetingsTable.meetingType,
      scheduledDate: teamMeetingsTable.scheduledDate,
      status: teamMeetingsTable.status,
      minutesFinalized: teamMeetingsTable.minutesFinalized,
    })
      .from(teamMeetingsTable)
      .where(sql`${teamMeetingsTable.studentId} = ANY(${sql.raw(`ARRAY[${studentIds.join(",")}]::int[]`)})`)
      .orderBy(desc(teamMeetingsTable.scheduledDate));

    const latestMeetingByStudent = new Map<number, typeof allMeetings[0]>();
    const annualMeetingByStudent = new Map<number, boolean>();
    for (const m of allMeetings) {
      if (!latestMeetingByStudent.has(m.studentId)) latestMeetingByStudent.set(m.studentId, m);
      const isThisYear = m.scheduledDate >= `${new Date().getFullYear()}-01-01` && m.scheduledDate <= today;
      if (isThisYear && (m.meetingType.toLowerCase().includes("annual") || m.meetingType.toLowerCase().includes("iep"))) {
        annualMeetingByStudent.set(m.studentId, true);
      }
    }

    // 5. Fetch accommodation counts per student
    const accomRows = await db.select({
      studentId: iepAccommodationsTable.studentId,
      count: sql<number>`COUNT(*)::int`,
    })
      .from(iepAccommodationsTable)
      .where(
        and(
          sql`${iepAccommodationsTable.studentId} = ANY(${sql.raw(`ARRAY[${studentIds.join(",")}]::int[]`)})`,
          eq(iepAccommodationsTable.active, true)
        )
      )
      .groupBy(iepAccommodationsTable.studentId);

    const accomByStudent = new Map<number, number>();
    for (const a of accomRows) accomByStudent.set(a.studentId, a.count);

    // 6. Fetch IEP goal counts per student
    const goalRows = await db.select({
      studentId: iepGoalsTable.studentId,
      count: sql<number>`COUNT(*)::int`,
    })
      .from(iepGoalsTable)
      .where(sql`${iepGoalsTable.studentId} = ANY(${sql.raw(`ARRAY[${studentIds.join(",")}]::int[]`)})`)
      .groupBy(iepGoalsTable.studentId);

    const goalsByStudent = new Map<number, number>();
    for (const g of goalRows) goalsByStudent.set(g.studentId, g.count);

    // 7. Build checklist per student
    const checklists: StudentChecklist[] = [];

    for (const student of students) {
      const items: ChecklistItem[] = [];
      const sid = student.id;
      const iep = iepByStudent.get(sid);
      const pr = prByStudent.get(sid);
      const meeting = latestMeetingByStudent.get(sid);
      const hasAnnualMeeting = annualMeetingByStudent.get(sid) ?? false;
      const accomCount = accomByStudent.get(sid) ?? 0;
      const goalCount = goalsByStudent.get(sid) ?? 0;
      const prCount = prCountByStudent.get(sid) ?? 0;

      // ── IEP Status ──────────────────────────────────────────────────────────
      if (!iep) {
        items.push({
          key: "iep_missing",
          label: "Active IEP",
          status: "critical",
          detail: "No IEP document found for this student.",
          actionUrl: `/students/${sid}/iep`,
          actionLabel: "Create IEP",
        });
      } else {
        const daysUntilEnd = daysDiff(iep.iepEndDate, today);
        if (daysUntilEnd < 0) {
          items.push({
            key: "iep_expired",
            label: "IEP Annual Review",
            status: "critical",
            detail: `IEP expired ${Math.abs(daysUntilEnd)} days ago (${iep.iepEndDate}). Annual review is overdue.`,
            actionUrl: `/students/${sid}/iep`,
            actionLabel: "Review IEP",
            dueDate: iep.iepEndDate,
            daysUntilDue: daysUntilEnd,
          });
        } else if (daysUntilEnd <= 30) {
          items.push({
            key: "iep_expiring",
            label: "IEP Annual Review",
            status: "critical",
            detail: `IEP expires in ${daysUntilEnd} day${daysUntilEnd === 1 ? "" : "s"} on ${iep.iepEndDate}. Schedule annual review meeting immediately.`,
            actionUrl: `/students/${sid}/iep`,
            actionLabel: "Schedule Review",
            dueDate: iep.iepEndDate,
            daysUntilDue: daysUntilEnd,
          });
        } else if (daysUntilEnd <= 60) {
          items.push({
            key: "iep_expiring_soon",
            label: "IEP Annual Review",
            status: "warning",
            detail: `IEP expires in ${daysUntilEnd} days on ${iep.iepEndDate}. Begin annual review planning.`,
            actionUrl: `/students/${sid}/iep`,
            actionLabel: "Plan Review",
            dueDate: iep.iepEndDate,
            daysUntilDue: daysUntilEnd,
          });
        } else {
          items.push({
            key: "iep_ok",
            label: "IEP Annual Review",
            status: "ok",
            detail: `IEP is current through ${iep.iepEndDate} (${daysUntilEnd} days remaining).`,
            dueDate: iep.iepEndDate,
            daysUntilDue: daysUntilEnd,
          });
        }

        // IEP draft status check
        if (iep.status === "draft") {
          items.push({
            key: "iep_draft",
            label: "IEP Finalized",
            status: "warning",
            detail: "Current IEP is still in Draft status and has not been finalized.",
            actionUrl: `/students/${sid}/iep`,
            actionLabel: "Finalize IEP",
          });
        } else {
          items.push({
            key: "iep_finalized",
            label: "IEP Finalized",
            status: "ok",
            detail: `IEP status: ${iep.status}.`,
          });
        }
      }

      // ── IEP Goals ───────────────────────────────────────────────────────────
      if (goalCount === 0) {
        items.push({
          key: "goals_missing",
          label: "IEP Goals",
          status: "critical",
          detail: "No IEP goals found for this student.",
          actionUrl: `/students/${sid}/iep`,
          actionLabel: "Add Goals",
        });
      } else {
        items.push({
          key: "goals_ok",
          label: "IEP Goals",
          status: "ok",
          detail: `${goalCount} IEP goal${goalCount === 1 ? "" : "s"} on file.`,
        });
      }

      // ── Accommodations ──────────────────────────────────────────────────────
      if (accomCount === 0) {
        items.push({
          key: "accommodations_missing",
          label: "Accommodations",
          status: "warning",
          detail: "No active accommodations documented for this student.",
          actionUrl: `/students/${sid}/iep`,
          actionLabel: "Add Accommodations",
        });
      } else {
        items.push({
          key: "accommodations_ok",
          label: "Accommodations",
          status: "ok",
          detail: `${accomCount} active accommodation${accomCount === 1 ? "" : "s"} on file.`,
        });
      }

      // ── Progress Reports ─────────────────────────────────────────────────────
      const currentSchoolYearStart = `${new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1}-09-01`;
      const monthsInYear = daysDiff(today, currentSchoolYearStart) / 30;
      const expectedReports = Math.max(1, Math.floor(monthsInYear / 3)); // quarterly

      if (prCount === 0) {
        items.push({
          key: "progress_report_missing",
          label: "Progress Reports",
          status: "critical",
          detail: "No progress reports found for this student this school year.",
          actionUrl: `/students/${sid}`,
          actionLabel: "Generate Report",
        });
      } else if (prCount < expectedReports) {
        items.push({
          key: "progress_report_behind",
          label: "Progress Reports",
          status: "warning",
          detail: `${prCount} of ~${expectedReports} expected progress report${expectedReports === 1 ? "" : "s"} for this school year.`,
          actionUrl: `/students/${sid}`,
          actionLabel: "Generate Report",
        });
      } else {
        items.push({
          key: "progress_report_ok",
          label: "Progress Reports",
          status: "ok",
          detail: `${prCount} progress report${prCount === 1 ? "" : "s"} on file for this school year.`,
        });
      }

      // Parent notification for latest progress report
      if (pr) {
        if (!pr.parentNotificationDate) {
          items.push({
            key: "pr_parent_notification",
            label: "Progress Report – Parent Notification",
            status: "warning",
            detail: `Latest progress report (${pr.reportingPeriod}) has not been sent to parent/guardian.`,
            actionUrl: `/students/${sid}`,
            actionLabel: "Notify Parent",
          });
        } else {
          const daysSinceNotif = daysDiff(today, pr.parentNotificationDate);
          items.push({
            key: "pr_parent_notification_ok",
            label: "Progress Report – Parent Notification",
            status: daysSinceNotif <= 120 ? "ok" : "warning",
            detail: `Latest report (${pr.reportingPeriod}) sent to parent on ${pr.parentNotificationDate}.`,
          });
        }
      }

      // ── Parent Meetings ──────────────────────────────────────────────────────
      if (!meeting) {
        items.push({
          key: "meeting_none",
          label: "Parent Meeting (Annual IEP)",
          status: "critical",
          detail: "No team meetings on record for this student.",
          actionUrl: `/iep-meetings`,
          actionLabel: "Schedule Meeting",
        });
      } else {
        const daysSinceMeeting = daysDiff(today, meeting.scheduledDate);

        if (!hasAnnualMeeting) {
          items.push({
            key: "annual_meeting_missing",
            label: "Annual IEP Meeting",
            status: daysSinceMeeting > 365 ? "critical" : "warning",
            detail: `No Annual IEP meeting recorded this school year. Last meeting: ${meeting.scheduledDate} (${daysSinceMeeting}d ago).`,
            actionUrl: `/iep-meetings`,
            actionLabel: "Schedule Annual Meeting",
          });
        } else {
          items.push({
            key: "annual_meeting_ok",
            label: "Annual IEP Meeting",
            status: "ok",
            detail: `Annual IEP meeting held ${meeting.scheduledDate}.`,
          });
        }

        if (!meeting.minutesFinalized && meeting.status === "completed") {
          items.push({
            key: "meeting_minutes",
            label: "Meeting Minutes Finalized",
            status: "warning",
            detail: `Meeting on ${meeting.scheduledDate} is complete but minutes are not finalized.`,
            actionUrl: `/iep-meetings`,
            actionLabel: "Finalize Minutes",
          });
        } else if (meeting.minutesFinalized || meeting.status !== "completed") {
          items.push({
            key: "meeting_minutes_ok",
            label: "Meeting Minutes Finalized",
            status: meeting.minutesFinalized ? "ok" : "info",
            detail: meeting.minutesFinalized
              ? `Minutes finalized for meeting on ${meeting.scheduledDate}.`
              : `Upcoming meeting scheduled for ${meeting.scheduledDate}.`,
          });
        }
      }

      const critical = items.filter(i => i.status === "critical").length;
      const warning = items.filter(i => i.status === "warning").length;

      checklists.push({
        studentId: sid,
        studentName: `${student.firstName} ${student.lastName}`,
        grade: student.grade,
        schoolId: student.schoolId,
        overallStatus: overallStatus(items),
        items,
        criticalCount: critical,
        warningCount: warning,
      });
    }

    // Sort: critical first, then warning, then ok
    checklists.sort((a, b) => {
      const order = { critical: 0, warning: 1, ok: 2 };
      return order[a.overallStatus] - order[b.overallStatus] || a.studentName.localeCompare(b.studentName);
    });

    res.json(checklists);
  } catch (e: any) {
    console.error("GET /compliance/checklist error:", e);
    res.status(500).json({ error: "Failed to compute compliance checklist" });
  }
});

export async function generateComplianceAlerts(): Promise<{ created: number; checked: number }> {
    const today = TODAY();
    const alerts: Array<{
      type: string; severity: string; studentId: number; message: string; suggestedAction?: string;
    }> = [];

    // Gather students with active IEPs
    const ieps = await db.select({
      studentId: iepDocumentsTable.studentId,
      id: iepDocumentsTable.id,
      iepEndDate: iepDocumentsTable.iepEndDate,
      status: iepDocumentsTable.status,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
    })
      .from(iepDocumentsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, iepDocumentsTable.studentId))
      .where(and(eq(studentsTable.status, "active"), isNull(studentsTable.deletedAt)))
      .orderBy(desc(iepDocumentsTable.iepEndDate));

    const latestIepByStudent = new Map<number, typeof ieps[0]>();
    for (const iep of ieps) {
      if (!latestIepByStudent.has(iep.studentId)) latestIepByStudent.set(iep.studentId, iep);
    }

    for (const [sid, iep] of latestIepByStudent) {
      const name = `${iep.firstName} ${iep.lastName}`;
      const daysUntilEnd = daysDiff(iep.iepEndDate, today);

      if (daysUntilEnd < 0) {
        alerts.push({
          type: "iep_overdue",
          severity: "critical",
          studentId: sid,
          message: `IEP for ${name} expired ${Math.abs(daysUntilEnd)} days ago (${iep.iepEndDate}). Annual review is overdue.`,
          suggestedAction: "Schedule Annual IEP Review meeting immediately and update IEP document.",
        });
      } else if (daysUntilEnd <= 30) {
        alerts.push({
          type: "iep_expiring_soon",
          severity: "critical",
          studentId: sid,
          message: `IEP for ${name} expires in ${daysUntilEnd} day${daysUntilEnd === 1 ? "" : "s"} (${iep.iepEndDate}). Annual review meeting must be held before this date.`,
          suggestedAction: "Schedule Annual IEP Review meeting and prepare updated IEP document.",
        });
      } else if (daysUntilEnd <= 60) {
        alerts.push({
          type: "iep_expiring_soon",
          severity: "high",
          studentId: sid,
          message: `IEP for ${name} expires in ${daysUntilEnd} days (${iep.iepEndDate}). Begin annual review planning.`,
          suggestedAction: "Send 10-day meeting notice to parent and begin drafting updated IEP.",
        });
      }
    }

    // Progress report alerts: students with no PR or PR not sent to parent
    const students = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
    }).from(studentsTable).where(and(eq(studentsTable.status, "active"), isNull(studentsTable.deletedAt)));

    const allPRs = await db.select({
      studentId: progressReportsTable.studentId,
      parentNotificationDate: progressReportsTable.parentNotificationDate,
      reportingPeriod: progressReportsTable.reportingPeriod,
      periodEnd: progressReportsTable.periodEnd,
      status: progressReportsTable.status,
    }).from(progressReportsTable).orderBy(desc(progressReportsTable.periodEnd));

    const latestPRByStudent = new Map<number, typeof allPRs[0]>();
    const prCountByStu = new Map<number, number>();
    for (const pr of allPRs) {
      if (!latestPRByStudent.has(pr.studentId)) latestPRByStudent.set(pr.studentId, pr);
      prCountByStu.set(pr.studentId, (prCountByStu.get(pr.studentId) ?? 0) + 1);
    }

    for (const student of students) {
      const name = `${student.firstName} ${student.lastName}`;
      const pr = latestPRByStudent.get(student.id);
      const count = prCountByStu.get(student.id) ?? 0;

      if (count === 0) {
        alerts.push({
          type: "progress_report_missing",
          severity: "high",
          studentId: student.id,
          message: `No progress reports on file for ${name} this school year. Progress reports are required at least 3× per year per 603 CMR 28.00.`,
          suggestedAction: "Generate Q1 progress report and send to parent with notification date.",
        });
      } else if (pr && !pr.parentNotificationDate) {
        alerts.push({
          type: "progress_report_not_sent",
          severity: "medium",
          studentId: student.id,
          message: `Progress report for ${name} (${pr.reportingPeriod}) has not been sent to parent/guardian.`,
          suggestedAction: "Send progress report to parent and record notification date in the system.",
        });
      }
    }

    // Parent meeting alerts
    const allMeetings = await db.select({
      studentId: teamMeetingsTable.studentId,
      scheduledDate: teamMeetingsTable.scheduledDate,
      meetingType: teamMeetingsTable.meetingType,
      status: teamMeetingsTable.status,
      minutesFinalized: teamMeetingsTable.minutesFinalized,
    }).from(teamMeetingsTable).orderBy(desc(teamMeetingsTable.scheduledDate));

    const latestMeetingByStu = new Map<number, typeof allMeetings[0]>();
    const annualMeetingThisYear = new Map<number, boolean>();
    const yearStart = `${new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1}-09-01`;

    for (const m of allMeetings) {
      if (!latestMeetingByStu.has(m.studentId)) latestMeetingByStu.set(m.studentId, m);
      if (m.scheduledDate >= yearStart && m.scheduledDate <= today) {
        const type = m.meetingType.toLowerCase();
        if (type.includes("annual") || type.includes("iep")) {
          annualMeetingThisYear.set(m.studentId, true);
        }
      }
    }

    for (const student of students) {
      const name = `${student.firstName} ${student.lastName}`;
      const meeting = latestMeetingByStu.get(student.id);
      const hasAnnual = annualMeetingThisYear.get(student.id) ?? false;

      if (!meeting) {
        alerts.push({
          type: "meeting_missing",
          severity: "high",
          studentId: student.id,
          message: `No IEP team meetings on record for ${name}.`,
          suggestedAction: "Schedule Annual IEP Review meeting and provide 10-day notice to parent.",
        });
      } else {
        const daysSince = daysDiff(today, meeting.scheduledDate);

        if (!hasAnnual && daysSince > 300) {
          alerts.push({
            type: "annual_meeting_overdue",
            severity: "critical",
            studentId: student.id,
            message: `Annual IEP meeting has not been held this school year for ${name}. Last meeting: ${meeting.scheduledDate} (${daysSince} days ago).`,
            suggestedAction: "Schedule Annual IEP Review meeting immediately. Parent notification required at least 10 days in advance.",
          });
        } else if (!hasAnnual && daysSince > 180) {
          alerts.push({
            type: "annual_meeting_due_soon",
            severity: "high",
            studentId: student.id,
            message: `Annual IEP meeting has not been held this school year for ${name}. Last meeting: ${meeting.scheduledDate}.`,
            suggestedAction: "Begin scheduling Annual IEP Review meeting. Send parent notice at least 10 days before.",
          });
        }

        // Unfinalized meeting minutes
        if (meeting.status === "completed" && !meeting.minutesFinalized) {
          alerts.push({
            type: "meeting_minutes_unfinalized",
            severity: "medium",
            studentId: student.id,
            message: `Meeting minutes for ${name}'s ${meeting.meetingType} (${meeting.scheduledDate}) have not been finalized.`,
            suggestedAction: "Finalize and distribute meeting minutes within 2 business days of the meeting.",
          });
        }
      }
    }

    // Upsert: avoid duplicates by checking existing unresolved alerts of same type/student
    let created = 0;
    for (const alert of alerts) {
      const existing = await db.select({ id: alertsTable.id })
        .from(alertsTable)
        .where(and(
          eq(alertsTable.type, alert.type),
          eq(alertsTable.studentId, alert.studentId),
          eq(alertsTable.resolved, false)
        ))
        .limit(1);
      if (existing.length > 0) continue;

      await db.insert(alertsTable).values({
        type: alert.type,
        severity: alert.severity,
        studentId: alert.studentId,
        message: alert.message,
        suggestedAction: alert.suggestedAction,
        resolved: false,
      });
      created++;
    }

    return { created, checked: alerts.length };
}

router.post("/compliance/checklist/run-alerts", requireRoles("admin", "case_manager"), async (req: Request, res: Response) => {
  try {
    const result = await generateComplianceAlerts();
    res.json(result);
  } catch (e: any) {
    console.error("POST /compliance/checklist/run-alerts error:", e);
    res.status(500).json({ error: "Failed to run compliance alerts" });
  }
});

export default router;
