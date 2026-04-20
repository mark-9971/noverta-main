// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, serviceTypesTable, serviceRequirementsTable, staffTable,
} from "@workspace/db";
import { GenerateScheduleBody, AcceptGeneratedScheduleBody } from "@workspace/api-zod";
import { eq, and, sql } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "../../lib/minuteCalc";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.post("/scheduler/generate", async (req, res): Promise<void> => {
  const parsed = GenerateScheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { weekOf, staffIds, studentIds } = parsed.data;

  // Tenant scope: only consider service requirements / staff that belong to
  // the caller's district. Without this, generating a schedule from a small
  // district would propose blocks against students and providers in EVERY
  // district in the system.
  const authed = req as unknown as AuthedRequest;
  const did = getEnforcedDistrictId(authed);
  const reqDistrictPredicate = did == null
    ? sql`TRUE`
    : sql`${serviceRequirementsTable.studentId} IN (
        SELECT s.id FROM students s
        JOIN schools sch ON sch.id = s.school_id
        WHERE sch.district_id = ${did}
      )`;
  const staffDistrictPredicate = did == null
    ? sql`TRUE`
    : sql`${staffTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${did})`;

  const reqs = await db
    .select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      providerId: serviceRequirementsTable.providerId,
      serviceTypeId: serviceRequirementsTable.serviceTypeId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      serviceTypeName: serviceTypesTable.name,
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .where(and(eq(serviceRequirementsTable.active, true), reqDistrictPredicate));

  const allStaff = await db.select().from(staffTable)
    .where(and(eq(staffTable.status, "active"), staffDistrictPredicate));

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const timeSlots = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];
  const SLOT_DURATION = 60;

  const proposedBlocks: any[] = [];
  const unresolvedDeficits: any[] = [];

  const staffBookings = new Map<string, string[]>();

  function isSlotAvailable(staffId: number, day: string, startTime: string): boolean {
    const key = `${staffId}-${day}`;
    const bookings = staffBookings.get(key) ?? [];
    const slotEnd = addMinutes(startTime, SLOT_DURATION);
    return !bookings.some(b => {
      const [bStart, bEnd] = b.split("-");
      return startTime < bEnd && slotEnd > bStart;
    });
  }

  function bookSlot(staffId: number, day: string, startTime: string) {
    const key = `${staffId}-${day}`;
    if (!staffBookings.has(key)) staffBookings.set(key, []);
    staffBookings.get(key)!.push(`${startTime}-${addMinutes(startTime, SLOT_DURATION)}`);
  }

  function addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(":").map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  for (const req of reqs) {
    const provider = req.providerId ? allStaff.find(s => s.id === req.providerId) : null;
    if (!provider) {
      unresolvedDeficits.push({
        studentId: req.studentId,
        studentName: req.studentFirst ? `${req.studentFirst} ${req.studentLast}` : `Student ${req.studentId}`,
        serviceRequirementId: req.id,
        serviceTypeName: req.serviceTypeName ?? "Unknown",
        gapDescription: `No provider assigned for ${req.serviceTypeName}`,
        severity: "high",
      });
      continue;
    }

    let sessionsPerWeek = 1;
    if (req.intervalType === "weekly") sessionsPerWeek = Math.ceil(req.requiredMinutes / SLOT_DURATION);
    else if (req.intervalType === "monthly") sessionsPerWeek = Math.ceil(req.requiredMinutes / (SLOT_DURATION * 4));
    else if (req.intervalType === "daily") sessionsPerWeek = 5;

    let scheduled = 0;
    for (const day of days) {
      if (scheduled >= sessionsPerWeek) break;
      for (const time of timeSlots) {
        if (scheduled >= sessionsPerWeek) break;
        if (isSlotAvailable(provider.id, day, time)) {
          bookSlot(provider.id, day, time);
          proposedBlocks.push({
            id: -(proposedBlocks.length + 1),
            staffId: provider.id,
            staffName: `${provider.firstName} ${provider.lastName}`,
            studentId: req.studentId,
            studentName: req.studentFirst ? `${req.studentFirst} ${req.studentLast}` : null,
            serviceTypeId: req.serviceTypeId,
            serviceTypeName: req.serviceTypeName,
            dayOfWeek: day,
            startTime: time,
            endTime: addMinutes(time, SLOT_DURATION),
            location: null,
            blockLabel: req.serviceTypeName ?? null,
            blockType: "service",
            notes: `Auto-generated for week of ${weekOf}`,
            isRecurring: false,
            weekOf,
            isAutoGenerated: true,
            createdAt: new Date().toISOString(),
          });
          scheduled++;
        }
      }
    }

    if (scheduled < sessionsPerWeek) {
      unresolvedDeficits.push({
        studentId: req.studentId,
        studentName: req.studentFirst ? `${req.studentFirst} ${req.studentLast}` : `Student ${req.studentId}`,
        serviceRequirementId: req.id,
        serviceTypeName: req.serviceTypeName ?? "Unknown",
        gapDescription: `Could only schedule ${scheduled} of ${sessionsPerWeek} sessions for ${req.serviceTypeName}`,
        severity: scheduled === 0 ? "high" : "medium",
      });
    }
  }

  // Tenant scope: clamp the projected-fulfillment summary to the caller's
  // district. The default (no filter) returns global rows across all districts,
  // which would re-leak the same data the predicates above were closing.
  const projectedFulfillment = await computeAllActiveMinuteProgress(
    did == null ? undefined : { districtId: did },
  );

  res.json({
    weekOf,
    proposedBlocks,
    unresolvedDeficits,
    conflicts: [],
    projectedFulfillment,
    summary: `Generated ${proposedBlocks.length} proposed schedule blocks for week of ${weekOf}. ${unresolvedDeficits.length} unresolved gaps remain.`,
  });
});

router.post("/scheduler/accept", async (req, res): Promise<void> => {
  const parsed = AcceptGeneratedScheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json({ acceptedCount: parsed.data.blockIds.length, message: `Accepted ${parsed.data.blockIds.length} schedule blocks for week of ${parsed.data.weekOf}` });
});

export default router;
