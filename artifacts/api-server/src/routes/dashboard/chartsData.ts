// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, sessionLogsTable,
  complianceEventsTable, iepDocumentsTable, teamMeetingsTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, sql, asc, isNull } from "drizzle-orm";
import {
  parseSchoolDistrictFilters,
  buildSessionStudentFilter,
} from "./shared";

const router: IRouter = Router();

router.get("/dashboard/missed-sessions-trend", async (req, res): Promise<void> => {
  const sdFilters = parseSchoolDistrictFilters(req, req.query);
  const sessionFilter = buildSessionStudentFilter(sdFilters);
  const today = new Date();
  const earliestMonday = new Date(today);
  earliestMonday.setDate(today.getDate() - 7 * 7);
  const dayOfWeek = earliestMonday.getDay();
  earliestMonday.setDate(earliestMonday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  earliestMonday.setHours(0, 0, 0, 0);

  const earliestStr = earliestMonday.toISOString().substring(0, 10);
  const todayStr = today.toISOString().substring(0, 10);

  const trendConditions: any[] = [
    gte(sessionLogsTable.sessionDate, earliestStr),
    lte(sessionLogsTable.sessionDate, todayStr),
    isNull(sessionLogsTable.deletedAt),
  ];
  if (sessionFilter) trendConditions.push(sessionFilter);

  const rows = await db
    .select({
      sessionDate: sessionLogsTable.sessionDate,
      status: sessionLogsTable.status,
      cnt: count(),
    })
    .from(sessionLogsTable)
    .where(and(...trendConditions))
    .groupBy(sessionLogsTable.sessionDate, sessionLogsTable.status);

  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const weekDate = new Date(today);
    weekDate.setDate(today.getDate() - i * 7);
    const monday = new Date(weekDate);
    monday.setDate(weekDate.getDate() - (weekDate.getDay() === 0 ? 6 : weekDate.getDay() - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mondayStr = monday.toISOString().substring(0, 10);
    const sundayStr = sunday.toISOString().substring(0, 10);

    let missedCount = 0;
    let completedCount = 0;
    for (const row of rows) {
      if (row.sessionDate >= mondayStr && row.sessionDate <= sundayStr) {
        if (row.status === "missed") missedCount += row.cnt;
        else if (row.status === "completed") completedCount += row.cnt;
      }
    }

    const month = monday.toLocaleString("default", { month: "short" });
    const day = monday.getDate();
    weeks.push({ weekLabel: `${month} ${day}`, missedCount, completedCount });
  }

  res.json(weeks);
});

router.get("/dashboard/iep-calendar", async (req, res): Promise<void> => {
  try {
    const { startDate, endDate, eventType } = req.query;
    const sdFilters = parseSchoolDistrictFilters(req, req.query);

    type CalendarEvent = {
      id: number | string;
      studentId: number;
      studentName: string;
      grade: string | null;
      eventType: string;
      title: string;
      dueDate: string;
      status: string;
      completedDate: string | null;
      notes: string | null;
      daysRemaining: number;
    };

    const today = new Date().toISOString().split("T")[0];
    const allEvents: CalendarEvent[] = [];

    const ceConditions: any[] = [];
    if (startDate) ceConditions.push(gte(complianceEventsTable.dueDate, startDate as string));
    if (endDate) ceConditions.push(lte(complianceEventsTable.dueDate, endDate as string));
    if (eventType && eventType !== "all") ceConditions.push(eq(complianceEventsTable.eventType, eventType as string));
    if (sdFilters.schoolId) ceConditions.push(sql`${complianceEventsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${sdFilters.schoolId})`);
    if (sdFilters.districtId) ceConditions.push(sql`${complianceEventsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId}))`);

    const ceEvents = await db.select({
      id: complianceEventsTable.id,
      studentId: complianceEventsTable.studentId,
      eventType: complianceEventsTable.eventType,
      title: complianceEventsTable.title,
      dueDate: complianceEventsTable.dueDate,
      status: complianceEventsTable.status,
      completedDate: complianceEventsTable.completedDate,
      notes: complianceEventsTable.notes,
      studentFirstName: studentsTable.firstName,
      studentLastName: studentsTable.lastName,
      studentGrade: studentsTable.grade,
    })
      .from(complianceEventsTable)
      .innerJoin(studentsTable, eq(complianceEventsTable.studentId, studentsTable.id))
      .where(ceConditions.length > 0 ? and(...ceConditions) : undefined)
      .orderBy(asc(complianceEventsTable.dueDate))
      .limit(500);

    for (const e of ceEvents) {
      const daysRemaining = Math.ceil((new Date(e.dueDate).getTime() - new Date(today).getTime()) / 86400000);
      let computedStatus = e.status;
      if (e.status !== "completed") {
        if (daysRemaining < 0) computedStatus = "overdue";
        else if (daysRemaining <= 7) computedStatus = "critical";
        else if (daysRemaining <= 30) computedStatus = "due_soon";
        else computedStatus = "upcoming";
      }
      allEvents.push({
        id: e.id,
        studentId: e.studentId,
        studentName: `${e.studentFirstName} ${e.studentLastName}`,
        grade: e.studentGrade,
        eventType: e.eventType,
        title: e.title,
        dueDate: e.dueDate,
        status: computedStatus,
        completedDate: e.completedDate,
        notes: e.notes,
        daysRemaining,
      });
    }

    const existingKeys = new Set(ceEvents.map(e => `${e.studentId}-${e.eventType}-${e.dueDate}`));

    if (!eventType || eventType === "all" || eventType === "annual_review" || eventType === "reeval_3yr") {
      const iepConditions: any[] = [eq(iepDocumentsTable.active, true), eq(studentsTable.status, "active")];
      if (sdFilters.schoolId) iepConditions.push(eq(studentsTable.schoolId, sdFilters.schoolId));
      if (sdFilters.districtId) iepConditions.push(sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);

      const iepDocs = await db.select({
        id: iepDocumentsTable.id,
        studentId: iepDocumentsTable.studentId,
        iepEndDate: iepDocumentsTable.iepEndDate,
        iepStartDate: iepDocumentsTable.iepStartDate,
        studentFirstName: studentsTable.firstName,
        studentLastName: studentsTable.lastName,
        studentGrade: studentsTable.grade,
      })
        .from(iepDocumentsTable)
        .innerJoin(studentsTable, eq(iepDocumentsTable.studentId, studentsTable.id))
        .where(and(...iepConditions));

      for (const doc of iepDocs) {
        const annualDate = doc.iepEndDate;
        const annualKey = `${doc.studentId}-annual_review-${annualDate}`;
        if (!existingKeys.has(annualKey) && (!eventType || eventType === "all" || eventType === "annual_review")) {
          if ((!startDate || annualDate >= (startDate as string)) && (!endDate || annualDate <= (endDate as string))) {
            const daysRemaining = Math.ceil((new Date(annualDate).getTime() - new Date(today).getTime()) / 86400000);
            let status = "upcoming";
            if (daysRemaining < 0) status = "overdue";
            else if (daysRemaining <= 7) status = "critical";
            else if (daysRemaining <= 30) status = "due_soon";
            allEvents.push({
              id: `iep-annual-${doc.id}`,
              studentId: doc.studentId,
              studentName: `${doc.studentFirstName} ${doc.studentLastName}`,
              grade: doc.studentGrade,
              eventType: "annual_review",
              title: `Annual IEP Review — ${doc.studentFirstName} ${doc.studentLastName}`,
              dueDate: annualDate,
              status,
              completedDate: null,
              notes: null,
              daysRemaining,
            });
            existingKeys.add(annualKey);
          }
        }

        if (!eventType || eventType === "all" || eventType === "reeval_3yr") {
          const reevalDate3yr = new Date(doc.iepStartDate);
          reevalDate3yr.setFullYear(reevalDate3yr.getFullYear() + 3);
          const reevalStr = reevalDate3yr.toISOString().split("T")[0];
          const reevalKey = `${doc.studentId}-reeval_3yr-${reevalStr}`;
          if (!existingKeys.has(reevalKey)) {
            if ((!startDate || reevalStr >= (startDate as string)) && (!endDate || reevalStr <= (endDate as string))) {
              const daysRemaining = Math.ceil((reevalDate3yr.getTime() - new Date(today).getTime()) / 86400000);
              let status = "upcoming";
              if (daysRemaining < 0) status = "overdue";
              else if (daysRemaining <= 7) status = "critical";
              else if (daysRemaining <= 30) status = "due_soon";
              allEvents.push({
                id: `iep-reeval-${doc.id}`,
                studentId: doc.studentId,
                studentName: `${doc.studentFirstName} ${doc.studentLastName}`,
                grade: doc.studentGrade,
                eventType: "reeval_3yr",
                title: `3-Year Reevaluation — ${doc.studentFirstName} ${doc.studentLastName}`,
                dueDate: reevalStr,
                status,
                completedDate: null,
                notes: null,
                daysRemaining,
              });
              existingKeys.add(reevalKey);
            }
          }
        }
      }
    }

    if (!eventType || eventType === "all" || eventType === "team_meeting") {
      const tmConditions: any[] = [
        sql`${teamMeetingsTable.status} IN ('scheduled', 'confirmed', 'completed')`,
      ];
      if (startDate) tmConditions.push(gte(teamMeetingsTable.scheduledDate, startDate as string));
      if (endDate) tmConditions.push(lte(teamMeetingsTable.scheduledDate, endDate as string));
      if (sdFilters.schoolId) tmConditions.push(eq(teamMeetingsTable.schoolId, sdFilters.schoolId));
      if (sdFilters.districtId) tmConditions.push(sql`${teamMeetingsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${sdFilters.districtId})`);

      const tmRows = await db.select({
        id: teamMeetingsTable.id,
        studentId: teamMeetingsTable.studentId,
        meetingType: teamMeetingsTable.meetingType,
        scheduledDate: teamMeetingsTable.scheduledDate,
        status: teamMeetingsTable.status,
        notes: teamMeetingsTable.notes,
        studentFirstName: studentsTable.firstName,
        studentLastName: studentsTable.lastName,
        studentGrade: studentsTable.grade,
      })
        .from(teamMeetingsTable)
        .innerJoin(studentsTable, eq(teamMeetingsTable.studentId, studentsTable.id))
        .where(and(...tmConditions))
        .limit(200);

      const mtLabels: Record<string, string> = {
        annual_review: "Annual Review Meeting",
        initial_iep: "Initial IEP Meeting",
        amendment: "IEP Amendment Meeting",
        reevaluation: "Reevaluation Meeting",
        transition: "Transition Meeting",
        manifestation_determination: "Manifestation Determination",
        eligibility: "Eligibility Meeting",
        progress_review: "Progress Review Meeting",
        other: "Team Meeting",
      };

      for (const m of tmRows) {
        const daysRemaining = Math.ceil((new Date(m.scheduledDate).getTime() - new Date(today).getTime()) / 86400000);
        let computedStatus = "upcoming";
        if (m.status === "completed") computedStatus = "completed";
        else if (daysRemaining < 0) computedStatus = "overdue";
        else if (daysRemaining <= 7) computedStatus = "critical";
        else if (daysRemaining <= 30) computedStatus = "due_soon";

        allEvents.push({
          id: `meeting-${m.id}`,
          studentId: m.studentId,
          studentName: `${m.studentFirstName} ${m.studentLastName}`,
          grade: m.studentGrade,
          eventType: "team_meeting",
          title: `${mtLabels[m.meetingType] ?? "Team Meeting"} — ${m.studentFirstName} ${m.studentLastName}`,
          dueDate: m.scheduledDate,
          status: computedStatus,
          completedDate: m.status === "completed" ? m.scheduledDate : null,
          notes: m.notes,
          daysRemaining,
        });
      }
    }

    allEvents.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const summary = {
      overdue: allEvents.filter(e => e.status === "overdue").length,
      critical: allEvents.filter(e => e.status === "critical").length,
      dueSoon: allEvents.filter(e => e.status === "due_soon").length,
      upcoming: allEvents.filter(e => e.status === "upcoming").length,
      completed: allEvents.filter(e => e.status === "completed").length,
      total: allEvents.length,
    };

    res.json({ events: allEvents, summary });
  } catch (e: any) {
    console.error("GET /dashboard/iep-calendar error:", e);
    res.status(500).json({ error: "Failed to fetch IEP calendar" });
  }
});

export default router;
