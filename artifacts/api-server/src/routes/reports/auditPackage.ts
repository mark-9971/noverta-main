import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import {
  studentsTable, sessionLogsTable, serviceTypesTable, staffTable,
  serviceRequirementsTable, parentContactsTable, schoolsTable,
  missedReasonsTable, compensatoryObligationsTable,
} from "@workspace/db";
import { GetAuditPackageReportQueryParams } from "@workspace/api-zod";
import { eq, and, gte, lte, sql, asc } from "drizzle-orm";
import { requireReportExport } from "./shared";

const router: IRouter = Router();

router.get("/reports/audit-package", requireReportExport, async (req: Request, res): Promise<void> => {
  try {
    const parsed = GetAuditPackageReportQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }
    const { startDate, endDate, schoolId, studentId } = req.query;
    const auditEnforcedDistrictId = getEnforcedDistrictId(req as AuthedRequest);
    const districtId = auditEnforcedDistrictId !== null ? String(auditEnforcedDistrictId) : null;
    const now = new Date();
    const defaultEnd = now.toISOString().split("T")[0];
    const defaultStart = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    const start = (startDate as string) || defaultStart;
    const end = (endDate as string) || defaultEnd;

    const studentConditions: any[] = [eq(studentsTable.status, "active")];
    if (schoolId) studentConditions.push(eq(studentsTable.schoolId, Number(schoolId)));
    if (districtId) studentConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${Number(districtId)})`);
    if (studentId) studentConditions.push(eq(studentsTable.id, Number(studentId)));

    const students = await db.select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      grade: studentsTable.grade,
      schoolId: studentsTable.schoolId,
      schoolName: schoolsTable.name,
    })
      .from(studentsTable)
      .leftJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
      .where(and(...studentConditions))
      .orderBy(asc(studentsTable.lastName), asc(studentsTable.firstName));

    if (students.length === 0) {
      res.json({ generatedAt: new Date().toISOString(), preparedBy: (req.query.preparedBy as string) || null, dateRange: { start, end }, students: [] });
      return;
    }

    const sIds = students.map(s => s.id);

    const [reqs, sessions, contacts, compObligations] = await Promise.all([
      db.select({
        id: serviceRequirementsTable.id,
        studentId: serviceRequirementsTable.studentId,
        serviceTypeName: serviceTypesTable.name,
        requiredMinutes: serviceRequirementsTable.requiredMinutes,
        intervalType: serviceRequirementsTable.intervalType,
        startDate: serviceRequirementsTable.startDate,
        endDate: serviceRequirementsTable.endDate,
        active: serviceRequirementsTable.active,
        providerFirstName: staffTable.firstName,
        providerLastName: staffTable.lastName,
      })
        .from(serviceRequirementsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
        .leftJoin(staffTable, eq(staffTable.id, serviceRequirementsTable.providerId))
        .where(sql`${serviceRequirementsTable.studentId} IN (${sql.join(sIds.map(id => sql`${id}`), sql`, `)})`),

      db.select({
        id: sessionLogsTable.id,
        studentId: sessionLogsTable.studentId,
        serviceRequirementId: sessionLogsTable.serviceRequirementId,
        sessionDate: sessionLogsTable.sessionDate,
        durationMinutes: sessionLogsTable.durationMinutes,
        status: sessionLogsTable.status,
        isMakeup: sessionLogsTable.isMakeup,
        isCompensatory: sessionLogsTable.isCompensatory,
        compensatoryObligationId: sessionLogsTable.compensatoryObligationId,
        notes: sessionLogsTable.notes,
        serviceTypeName: serviceTypesTable.name,
        staffFirstName: staffTable.firstName,
        staffLastName: staffTable.lastName,
        missedReason: missedReasonsTable.label,
        missedReasonCategory: missedReasonsTable.category,
      })
        .from(sessionLogsTable)
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
        .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
        .leftJoin(missedReasonsTable, eq(missedReasonsTable.id, sessionLogsTable.missedReasonId))
        .where(and(
          sql`${sessionLogsTable.studentId} IN (${sql.join(sIds.map(id => sql`${id}`), sql`, `)})`,
          gte(sessionLogsTable.sessionDate, start),
          lte(sessionLogsTable.sessionDate, end)
        ))
        .orderBy(asc(sessionLogsTable.sessionDate)),

      db.select({
        id: parentContactsTable.id,
        studentId: parentContactsTable.studentId,
        contactType: parentContactsTable.contactType,
        contactDate: parentContactsTable.contactDate,
        contactMethod: parentContactsTable.contactMethod,
        subject: parentContactsTable.subject,
        notes: parentContactsTable.notes,
        outcome: parentContactsTable.outcome,
        parentName: parentContactsTable.parentName,
        contactedBy: parentContactsTable.contactedBy,
      })
        .from(parentContactsTable)
        .where(and(
          sql`${parentContactsTable.studentId} IN (${sql.join(sIds.map(id => sql`${id}`), sql`, `)})`,
          gte(parentContactsTable.contactDate, start),
          lte(parentContactsTable.contactDate, end)
        ))
        .orderBy(asc(parentContactsTable.contactDate)),

      db.select({
        id: compensatoryObligationsTable.id,
        studentId: compensatoryObligationsTable.studentId,
        serviceRequirementId: compensatoryObligationsTable.serviceRequirementId,
        periodStart: compensatoryObligationsTable.periodStart,
        periodEnd: compensatoryObligationsTable.periodEnd,
        minutesOwed: compensatoryObligationsTable.minutesOwed,
        minutesDelivered: compensatoryObligationsTable.minutesDelivered,
        status: compensatoryObligationsTable.status,
        source: compensatoryObligationsTable.source,
        notes: compensatoryObligationsTable.notes,
        agreedDate: compensatoryObligationsTable.agreedDate,
        agreedWith: compensatoryObligationsTable.agreedWith,
        createdAt: compensatoryObligationsTable.createdAt,
        serviceTypeName: serviceTypesTable.name,
      })
        .from(compensatoryObligationsTable)
        .leftJoin(serviceRequirementsTable, eq(serviceRequirementsTable.id, compensatoryObligationsTable.serviceRequirementId))
        .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
        .where(sql`${compensatoryObligationsTable.studentId} IN (${sql.join(sIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(asc(compensatoryObligationsTable.periodStart)),
    ]);

    const reqsByStudent = new Map<number, typeof reqs>();
    for (const r of reqs) {
      if (!reqsByStudent.has(r.studentId)) reqsByStudent.set(r.studentId, []);
      reqsByStudent.get(r.studentId)!.push(r);
    }
    const sessionsByStudent = new Map<number, typeof sessions>();
    for (const s of sessions) {
      if (!sessionsByStudent.has(s.studentId)) sessionsByStudent.set(s.studentId, []);
      sessionsByStudent.get(s.studentId)!.push(s);
    }
    const contactsByStudent = new Map<number, typeof contacts>();
    for (const c of contacts) {
      if (!contactsByStudent.has(c.studentId)) contactsByStudent.set(c.studentId, []);
      contactsByStudent.get(c.studentId)!.push(c);
    }
    const compByStudent = new Map<number, typeof compObligations>();
    for (const co of compObligations) {
      if (!compByStudent.has(co.studentId)) compByStudent.set(co.studentId, []);
      compByStudent.get(co.studentId)!.push(co);
    }

    const result = students.map(student => {
      const sReqs = reqsByStudent.get(student.id) ?? [];
      const sSessions = sessionsByStudent.get(student.id) ?? [];
      const sContacts = contactsByStudent.get(student.id) ?? [];
      const sComp = compByStudent.get(student.id) ?? [];

      const completedSessions = sSessions.filter(s => s.status === "completed" || s.status === "makeup");
      const missedSessions = sSessions.filter(s => s.status === "missed");
      const makeupSessions = sSessions.filter(s => s.isMakeup);
      const compSessions = sSessions.filter(s => s.isCompensatory);

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        grade: student.grade,
        school: student.schoolName,
        serviceRequirements: sReqs.map(r => ({
          serviceTypeName: r.serviceTypeName,
          requiredMinutes: r.requiredMinutes,
          intervalType: r.intervalType,
          startDate: r.startDate,
          endDate: r.endDate,
          active: r.active,
          provider: r.providerFirstName ? `${r.providerFirstName} ${r.providerLastName}` : null,
        })),
        sessionSummary: {
          totalCompleted: completedSessions.length,
          totalMissed: missedSessions.length,
          totalMakeup: makeupSessions.length,
          totalCompensatory: compSessions.length,
          deliveredMinutes: completedSessions.reduce((s, sess) => s + sess.durationMinutes, 0),
          compensatoryMinutes: compSessions.filter(s => s.status === "completed" || s.status === "makeup").reduce((s, sess) => s + sess.durationMinutes, 0),
        },
        sessions: sSessions.map(s => ({
          date: s.sessionDate,
          service: s.serviceTypeName,
          duration: s.durationMinutes,
          status: s.status,
          isMakeup: s.isMakeup,
          isCompensatory: s.isCompensatory,
          compensatoryObligationId: s.compensatoryObligationId,
          provider: s.staffFirstName ? `${s.staffFirstName} ${s.staffLastName}` : null,
          notes: s.notes,
          missedReason: s.missedReason ?? null,
          missedReasonCategory: s.missedReasonCategory ?? null,
        })),
        compensatoryObligations: sComp.map(co => ({
          id: co.id,
          serviceTypeName: co.serviceTypeName,
          periodStart: co.periodStart,
          periodEnd: co.periodEnd,
          minutesOwed: co.minutesOwed,
          minutesDelivered: co.minutesDelivered,
          remainingMinutes: co.minutesOwed - co.minutesDelivered,
          status: co.status,
          source: co.source,
          notes: co.notes,
          agreedDate: co.agreedDate,
          agreedWith: co.agreedWith,
          createdAt: co.createdAt ? co.createdAt.toISOString() : null,
        })),
        compensatorySummary: {
          totalObligations: sComp.length,
          totalMinutesOwed: sComp.reduce((s, co) => s + co.minutesOwed, 0),
          totalMinutesDelivered: sComp.reduce((s, co) => s + co.minutesDelivered, 0),
          totalMinutesRemaining: sComp.reduce((s, co) => s + (co.minutesOwed - co.minutesDelivered), 0),
          pending: sComp.filter(co => co.status === "pending").length,
          inProgress: sComp.filter(co => co.status === "in_progress").length,
          completed: sComp.filter(co => co.status === "completed").length,
          waived: sComp.filter(co => co.status === "waived").length,
        },
        parentContacts: sContacts.map(c => ({
          date: c.contactDate,
          type: c.contactType,
          method: c.contactMethod,
          subject: c.subject,
          outcome: c.outcome,
          notes: c.notes,
          parentName: c.parentName,
          contactedBy: c.contactedBy,
        })),
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      preparedBy: (req.query.preparedBy as string) || null,
      dateRange: { start, end },
      students: result,
    });
  } catch (e: any) {
    console.error("GET /reports/audit-package error:", e);
    res.status(500).json({ error: "Failed to generate audit package" });
  }
});

export default router;
