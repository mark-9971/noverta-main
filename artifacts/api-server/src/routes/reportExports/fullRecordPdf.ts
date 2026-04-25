import { Router, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "@workspace/db";
import {
  studentsTable, iepDocumentsTable, iepGoalsTable, schoolsTable,
  restraintIncidentsTable, teamMeetingsTable, iepAccommodationsTable,
  parentContactsTable, progressReportsTable, complianceEventsTable,
  meetingConsentRecordsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import { logAudit } from "../../lib/auditLog";
import { getPublicMeta } from "../../lib/clerkClaims";
import { isDistrictDemo } from "../../lib/districtMode";
import type { BufferedPDFDoc } from "./utils";

const router = Router();

router.get("/reports/exports/student/:studentId/full-record.pdf", async (req: Request, res: Response): Promise<void> => {
  const studentId = parseInt(req.params.studentId as string, 10);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }

  const { platformAdmin } = getPublicMeta(req);

  let resolvedDistrictId: number | null = null;

  if (!platformAdmin) {
    const callerDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);
    if (callerDistrictId == null) {
      res.status(403).json({ error: "Access denied: your account is not assigned to a district" });
      return;
    }
    const scopeResult = await db.execute(
      sql`SELECT sc.district_id FROM students st LEFT JOIN schools sc ON sc.id = st.school_id WHERE st.id = ${studentId} LIMIT 1`
    );
    const scopeRow = (scopeResult.rows as Array<{ district_id: number | null }>)[0];
    const studentDistrictId = scopeRow?.district_id ?? null;
    if (studentDistrictId === null || callerDistrictId !== Number(studentDistrictId)) {
      res.status(403).json({ error: "Access denied: student is outside your district" });
      return;
    }
    resolvedDistrictId = callerDistrictId;
  } else {
    const scopeResult = await db.execute(
      sql`SELECT sc.district_id FROM students st LEFT JOIN schools sc ON sc.id = st.school_id WHERE st.id = ${studentId} LIMIT 1`
    );
    const scopeRow = (scopeResult.rows as Array<{ district_id: number | null }>)[0];
    resolvedDistrictId = scopeRow?.district_id != null ? Number(scopeRow.district_id) : null;
  }

  const demoDistrict = resolvedDistrictId != null && await isDistrictDemo(resolvedDistrictId);

  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, bottom: 60, left: 60, right: 60 }, bufferPages: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="student-record-${studentId}.pdf"`);
  doc.pipe(res);

  const safeStr = (v: unknown): string => v == null ? "" : String(v);

  const fmtDateLong = (d: string | null | undefined): string => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
    catch { return safeStr(d); }
  };

  try {
    const [
      [student], iepDocs, goals, incidents, meetings,
      accommodations, contacts, progressReports, complianceEvents, consentRecords,
    ] = await Promise.all([
      db.select({
        id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName,
        grade: studentsTable.grade, dateOfBirth: studentsTable.dateOfBirth,
        disabilityCategory: studentsTable.disabilityCategory, placementType: studentsTable.placementType,
        primaryLanguage: studentsTable.primaryLanguage, parentGuardianName: studentsTable.parentGuardianName,
        parentEmail: studentsTable.parentEmail, parentPhone: studentsTable.parentPhone, schoolName: schoolsTable.name,
      })
        .from(studentsTable)
        .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
        .where(eq(studentsTable.id, studentId)),

      db.select().from(iepDocumentsTable)
        .where(eq(iepDocumentsTable.studentId, studentId))
        .orderBy(desc(iepDocumentsTable.iepStartDate)).limit(5),

      db.select().from(iepGoalsTable)
        .where(and(eq(iepGoalsTable.studentId, studentId), eq(iepGoalsTable.active, true)))
        .orderBy(asc(iepGoalsTable.goalArea), asc(iepGoalsTable.goalNumber)),

      db.select({
        id: restraintIncidentsTable.id, incidentDate: restraintIncidentsTable.incidentDate,
        incidentType: restraintIncidentsTable.incidentType, durationMinutes: restraintIncidentsTable.durationMinutes,
        behaviorDescription: restraintIncidentsTable.behaviorDescription,
        studentInjury: restraintIncidentsTable.studentInjury, staffInjury: restraintIncidentsTable.staffInjury,
        status: restraintIncidentsTable.status, deseReportRequired: restraintIncidentsTable.deseReportRequired,
        parentVerbalNotification: restraintIncidentsTable.parentVerbalNotification,
        writtenReportSent: restraintIncidentsTable.writtenReportSent,
      })
        .from(restraintIncidentsTable)
        .where(eq(restraintIncidentsTable.studentId, studentId))
        .orderBy(desc(restraintIncidentsTable.incidentDate)).limit(50),

      db.select({
        id: teamMeetingsTable.id, meetingType: teamMeetingsTable.meetingType,
        scheduledDate: teamMeetingsTable.scheduledDate, status: teamMeetingsTable.status,
        outcome: teamMeetingsTable.outcome, minutesFinalized: teamMeetingsTable.minutesFinalized,
        consentStatus: teamMeetingsTable.consentStatus, noticeSentDate: teamMeetingsTable.noticeSentDate,
      })
        .from(teamMeetingsTable)
        .where(eq(teamMeetingsTable.studentId, studentId))
        .orderBy(desc(teamMeetingsTable.scheduledDate)).limit(20),

      db.select().from(iepAccommodationsTable)
        .where(and(eq(iepAccommodationsTable.studentId, studentId), eq(iepAccommodationsTable.active, true))),

      db.select({
        contactDate: parentContactsTable.contactDate, contactType: parentContactsTable.contactType,
        contactMethod: parentContactsTable.contactMethod, subject: parentContactsTable.subject,
        outcome: parentContactsTable.outcome, parentName: parentContactsTable.parentName,
      })
        .from(parentContactsTable)
        .where(eq(parentContactsTable.studentId, studentId))
        .orderBy(desc(parentContactsTable.contactDate)).limit(30),

      db.select({
        reportingPeriod: progressReportsTable.reportingPeriod, periodStart: progressReportsTable.periodStart,
        periodEnd: progressReportsTable.periodEnd, status: progressReportsTable.status,
        overallSummary: progressReportsTable.overallSummary, recommendations: progressReportsTable.recommendations,
        createdAt: progressReportsTable.createdAt,
      })
        .from(progressReportsTable)
        .where(eq(progressReportsTable.studentId, studentId))
        .orderBy(desc(progressReportsTable.createdAt)).limit(10),

      db.select({
        eventType: complianceEventsTable.eventType, title: complianceEventsTable.title,
        dueDate: complianceEventsTable.dueDate, status: complianceEventsTable.status,
        completedDate: complianceEventsTable.completedDate,
      })
        .from(complianceEventsTable)
        .where(eq(complianceEventsTable.studentId, studentId))
        .orderBy(asc(complianceEventsTable.dueDate)),

      db.select({
        consentType: meetingConsentRecordsTable.consentType, decision: meetingConsentRecordsTable.decision,
        decisionDate: meetingConsentRecordsTable.decisionDate, respondentName: meetingConsentRecordsTable.respondentName,
        respondentRelationship: meetingConsentRecordsTable.respondentRelationship,
        notes: meetingConsentRecordsTable.notes, followUpRequired: meetingConsentRecordsTable.followUpRequired,
        followUpDate: meetingConsentRecordsTable.followUpDate, createdAt: meetingConsentRecordsTable.createdAt,
      })
        .from(meetingConsentRecordsTable)
        .where(eq(meetingConsentRecordsTable.studentId, studentId))
        .orderBy(desc(meetingConsentRecordsTable.createdAt)).limit(30),
    ]);

    if (!student) {
      doc.fontSize(14).text("Student not found.");
      doc.end();
      return;
    }

    const PAGE_W = 492;
    const EMERALD = "#059669";
    const GRAY_DARK = "#111827";
    const GRAY_MID = "#6b7280";

    const sectionTitle = (title: string) => {
      doc.moveDown(0.6);
      doc.fontSize(13).font("Helvetica-Bold").fillColor(EMERALD).text(title);
      doc.moveTo(60, doc.y + 2).lineTo(552, doc.y + 2).strokeColor("#d1fae5").lineWidth(1).stroke();
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").fillColor(GRAY_DARK);
    };

    const row = (label: string, value: string) => {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value || "—");
    };

    doc.fontSize(20).font("Helvetica-Bold").fillColor(GRAY_DARK)
      .text("Student Record Export", { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(10).font("Helvetica").fillColor(GRAY_MID)
      .text("Massachusetts SPED — 603 CMR 28.00 / 46.00 — Confidential", { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(GRAY_MID)
      .text(`Generated: ${fmtDateLong(new Date().toISOString().split("T")[0])}`, { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(552, doc.y).strokeColor("#e5e7eb").lineWidth(1).stroke();

    if (demoDistrict) {
      doc.moveDown(0.5);
      const bannerY = doc.y;
      doc.rect(60, bannerY, PAGE_W, 22).fill("#fef3c7");
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#92400e")
        .text("SAMPLE DATA — NOT REAL STUDENT RECORDS", 60, bannerY + 6, { width: PAGE_W, align: "center" });
      doc.y = bannerY + 26;
      doc.moveDown(0.3);
    }

    sectionTitle("Student Information");
    row("Name", `${safeStr(student.firstName)} ${safeStr(student.lastName)}`);
    row("Date of Birth", fmtDateLong(student.dateOfBirth));
    row("Grade", safeStr(student.grade));
    row("School", safeStr(student.schoolName));
    row("Disability Category", safeStr(student.disabilityCategory));
    row("Placement Type", safeStr(student.placementType));
    row("Primary Language", safeStr(student.primaryLanguage));
    row("Parent / Guardian", safeStr(student.parentGuardianName));
    if (student.parentEmail) row("Parent Email", safeStr(student.parentEmail));
    if (student.parentPhone) row("Parent Phone", safeStr(student.parentPhone));

    if (iepDocs.length > 0) {
      sectionTitle("IEP Documents");
      for (const d of iepDocs) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${d.iepType ?? "Annual"} IEP — ${fmtDateLong(d.iepStartDate)} to ${fmtDateLong(d.iepEndDate)}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID);
        if (d.meetingDate) doc.text(`  Meeting Date: ${fmtDateLong(d.meetingDate)}`, { indent: 20 });
        doc.text(`  Status: ${safeStr(d.status)} | Active: ${d.active ? "Yes" : "No"}`, { indent: 20 });
        if (d.plaafpAcademic) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_DARK).text("  Academic PLAAFP:", { indent: 20 });
          doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
            .text(d.plaafpAcademic.slice(0, 500) + (d.plaafpAcademic.length > 500 ? "…" : ""), { indent: 30, width: PAGE_W - 30 });
        }
        doc.moveDown(0.3);
      }
    }

    if (goals.length > 0) {
      sectionTitle("Active IEP Goals");
      const byArea = goals.reduce<Record<string, typeof goals>>((acc, g) => {
        if (!acc[g.goalArea]) acc[g.goalArea] = [];
        acc[g.goalArea].push(g);
        return acc;
      }, {});
      for (const [area, areaGoals] of Object.entries(byArea)) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK).text(area, { indent: 10 });
        for (const g of areaGoals) {
          doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
            .text(`  Goal ${g.goalNumber}: ${safeStr(g.annualGoal)}`, { indent: 20, width: PAGE_W - 20 });
          if (g.baseline) doc.text(`  Baseline: ${safeStr(g.baseline)}`, { indent: 30 });
          if (g.targetCriterion) doc.text(`  Target: ${safeStr(g.targetCriterion)}`, { indent: 30 });
          doc.moveDown(0.2);
        }
      }
    }

    if (accommodations.length > 0) {
      sectionTitle("Accommodations");
      for (const a of accommodations) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_DARK)
          .text(`${safeStr(a.category).charAt(0).toUpperCase() + safeStr(a.category).slice(1)}: `, { continued: true, indent: 10 })
          .font("Helvetica").fillColor(GRAY_MID).text(safeStr(a.description));
        if (a.setting) doc.text(`  Setting: ${safeStr(a.setting)} | Frequency: ${safeStr(a.frequency)}`, { indent: 20 });
      }
    }

    if (progressReports.length > 0) {
      sectionTitle("Progress Reports");
      for (const r of progressReports) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${safeStr(r.reportingPeriod)} (${fmtDateLong(r.periodStart)} – ${fmtDateLong(r.periodEnd)})`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Status: ${safeStr(r.status)} | Generated: ${r.createdAt ? fmtDateLong(r.createdAt.toISOString().split("T")[0]) : "—"}`, { indent: 20 });
        if (r.overallSummary) {
          doc.text(r.overallSummary.slice(0, 400) + (r.overallSummary.length > 400 ? "…" : ""), { indent: 20, width: PAGE_W - 20 });
        }
        doc.moveDown(0.3);
      }
    }

    if (meetings.length > 0) {
      sectionTitle("Team Meetings");
      for (const m of meetings) {
        const mtgLabel: Record<string, string> = {
          annual: "Annual IEP Review", initial: "Initial Eligibility", reevaluation: "Reevaluation",
          amendment: "IEP Amendment", transition: "Transition Planning",
          manifestation: "Manifestation Determination", eligibility: "Eligibility Meeting", other: "Other Meeting",
        };
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${mtgLabel[m.meetingType] ?? m.meetingType} — ${fmtDateLong(m.scheduledDate)}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Status: ${safeStr(m.status)} | Notice Sent: ${m.noticeSentDate ? fmtDateLong(m.noticeSentDate) : "No"}`, { indent: 20 });
        if (m.outcome) doc.text(`Outcome: ${m.outcome}`, { indent: 20, width: PAGE_W - 20 });
        doc.moveDown(0.2);
      }
    }

    if (incidents.length > 0) {
      sectionTitle("Restraint / Seclusion Incidents");
      const TYPE_LABELS: Record<string, string> = {
        physical_restraint: "Physical Restraint", seclusion: "Seclusion",
        time_out: "Time-Out", physical_escort: "Physical Escort",
      };
      for (const i of incidents) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${fmtDateLong(i.incidentDate)} — ${TYPE_LABELS[i.incidentType] ?? i.incidentType}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Duration: ${i.durationMinutes ?? "—"} min | Student Injury: ${i.studentInjury ? "Yes" : "No"} | Status: ${safeStr(i.status)}`, { indent: 20 });
        doc.text(`DESE Report: ${i.deseReportRequired ? "Required" : "Not required"} | Parent Notified: ${i.parentVerbalNotification ? "Yes" : "No"}`, { indent: 20 });
        if (i.behaviorDescription) doc.text(i.behaviorDescription.slice(0, 200), { indent: 20, width: PAGE_W - 20 });
        doc.moveDown(0.2);
      }
    }

    if (contacts.length > 0) {
      sectionTitle("Parent Contact Log");
      for (const c of contacts) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_DARK)
          .text(`${fmtDateLong(c.contactDate)} — ${safeStr(c.contactType)} (${safeStr(c.contactMethod)})`, { indent: 10 });
        if (c.subject) doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Subject: ${c.subject}`, { indent: 20, width: PAGE_W - 20 });
        if (c.outcome) doc.text(`Outcome: ${c.outcome}`, { indent: 20 });
        doc.moveDown(0.2);
      }
    }

    if (complianceEvents.length > 0) {
      sectionTitle("Compliance Events");
      for (const e of complianceEvents) {
        const statusColor = e.status === "completed" ? EMERALD : e.status === "overdue" ? "#ef4444" : GRAY_MID;
        doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY_DARK)
          .text(`${safeStr(e.title)} — Due: ${fmtDateLong(e.dueDate)}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(statusColor)
          .text(`Status: ${safeStr(e.status)}${e.completedDate ? ` (completed ${fmtDateLong(e.completedDate)})` : ""}`, { indent: 20 });
        doc.moveDown(0.2);
      }
    }

    if (consentRecords.length > 0) {
      sectionTitle("Consent & Acknowledgment History");
      const CONSENT_LABELS: Record<string, string> = {
        iep_initial: "Initial IEP Consent", iep_amendment: "IEP Amendment Consent",
        evaluation: "Evaluation Consent", placement: "Placement Consent",
        reeval: "Re-evaluation Consent", reevaluation: "Re-evaluation Consent",
        services: "Services Consent", other: "Other Consent",
      };
      for (const cr of consentRecords) {
        const label = CONSENT_LABELS[cr.consentType] ?? safeStr(cr.consentType);
        const decisionDate = cr.decisionDate ? fmtDateLong(cr.decisionDate) : fmtDateLong(cr.createdAt?.toISOString());
        doc.font("Helvetica-Bold").fontSize(10).fillColor(GRAY_DARK)
          .text(`${label} — ${decisionDate}`, { indent: 10 });
        doc.font("Helvetica").fontSize(9).fillColor(GRAY_MID)
          .text(`Decision: ${safeStr(cr.decision)}${cr.respondentName ? ` | Respondent: ${cr.respondentName}${cr.respondentRelationship ? ` (${cr.respondentRelationship})` : ""}` : ""}`, { indent: 20 });
        if (cr.notes) doc.text(`Notes: ${cr.notes.slice(0, 200)}`, { indent: 20, width: PAGE_W - 20 });
        if (cr.followUpRequired === "yes" && cr.followUpDate) {
          doc.text(`Follow-up required by: ${fmtDateLong(cr.followUpDate)}`, { indent: 20 });
        }
        doc.moveDown(0.2);
      }
    }

    const pageCount = (doc as unknown as BufferedPDFDoc).bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      const footerLabel = demoDistrict
        ? `SAMPLE DATA — NOT REAL STUDENT RECORDS | Noverta — Confidential Student Record | Page ${i + 1} of ${pageCount} | Generated ${new Date().toLocaleDateString()}`
        : `Noverta — Confidential Student Record | Page ${i + 1} of ${pageCount} | Generated ${new Date().toLocaleDateString()}`;
      doc.fontSize(8).fillColor(GRAY_MID)
        .text(footerLabel, 60, 762, { align: "center", width: PAGE_W });
    }

    logAudit(req, {
      action: "read",
      targetTable: "students",
      targetId: studentId,
      studentId,
      summary: `Exported full student record PDF for student ${studentId}`,
      metadata: { reportType: "full-record-pdf" },
    });

    doc.end();
  } catch (e: any) {
    console.error("GET student full-record.pdf error:", e);
    if (!res.headersSent) {
      try { doc.end(); } catch {}
      res.status(500).json({ error: "Failed to generate student record PDF" });
    } else {
      try { doc.end(); } catch {}
    }
  }
});

export default router;
