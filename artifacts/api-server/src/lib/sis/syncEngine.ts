import { db } from "@workspace/db";
import {
  studentsTable, staffTable, sisConnectionsTable, sisSyncLogsTable,
} from "@workspace/db";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import type { SisStudentRecord, SisStaffRecord } from "./types";
import { getConnector, getCsvConnector } from "./index";
import type { SisProvider } from "./types";
import { decryptCredentials } from "./credentials";

interface SyncCounters {
  studentsAdded: number;
  studentsUpdated: number;
  studentsArchived: number;
  staffAdded: number;
  staffUpdated: number;
  totalRecords: number;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
}

async function upsertStudents(
  records: SisStudentRecord[],
  schoolId: number | null,
  connectionId: number,
  counters: SyncCounters,
): Promise<Set<string>> {
  const seenExternalIds = new Set<string>();

  for (const rec of records) {
    if (!rec.firstName && !rec.lastName) continue;
    seenExternalIds.add(rec.externalId);

    const existing = await db.select({ id: studentsTable.id, sisConnectionId: studentsTable.sisConnectionId })
      .from(studentsTable)
      .where(
        and(
          eq(studentsTable.externalId, rec.externalId),
          eq(studentsTable.sisConnectionId, connectionId),
          isNull(studentsTable.deletedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db.update(studentsTable)
        .set({
          firstName: rec.firstName,
          lastName: rec.lastName,
          grade: rec.grade ?? undefined,
          dateOfBirth: rec.dateOfBirth ?? undefined,
          status: rec.enrollmentStatus === "active" ? "active" : "inactive",
          disabilityCategory: rec.disabilityCategory ?? undefined,
          primaryLanguage: rec.primaryLanguage ?? undefined,
          parentGuardianName: rec.parentGuardianName ?? undefined,
          parentEmail: rec.parentEmail ?? undefined,
          parentPhone: rec.parentPhone ?? undefined,
        })
        .where(eq(studentsTable.id, existing[0].id));
      counters.studentsUpdated++;
    } else {
      await db.insert(studentsTable).values({
        externalId: rec.externalId,
        firstName: rec.firstName,
        lastName: rec.lastName,
        grade: rec.grade,
        dateOfBirth: rec.dateOfBirth,
        schoolId: schoolId,
        status: rec.enrollmentStatus === "active" ? "active" : "inactive",
        disabilityCategory: rec.disabilityCategory,
        primaryLanguage: rec.primaryLanguage,
        parentGuardianName: rec.parentGuardianName,
        parentEmail: rec.parentEmail,
        parentPhone: rec.parentPhone,
        sisConnectionId: connectionId,
        sisManaged: "true",
      });
      counters.studentsAdded++;
    }
  }
  counters.totalRecords += records.length;
  return seenExternalIds;
}

async function archiveMissingStudents(
  seenExternalIds: Set<string>,
  connectionId: number,
  counters: SyncCounters,
): Promise<void> {
  if (seenExternalIds.size === 0) return;

  const sisStudents = await db.select({ id: studentsTable.id, externalId: studentsTable.externalId })
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.sisConnectionId, connectionId),
        isNull(studentsTable.deletedAt),
        eq(studentsTable.status, "active"),
      ),
    );

  const toArchive = sisStudents.filter(
    (s) => s.externalId && !seenExternalIds.has(s.externalId),
  );

  for (const student of toArchive) {
    await db.update(studentsTable)
      .set({ status: "inactive" })
      .where(eq(studentsTable.id, student.id));
    counters.studentsArchived++;
  }
}

async function upsertStaff(
  records: SisStaffRecord[],
  schoolId: number | null,
  connectionId: number,
  counters: SyncCounters,
): Promise<void> {
  for (const rec of records) {
    if (!rec.firstName && !rec.lastName) continue;

    const existing = rec.externalId
      ? await db.select({ id: staffTable.id })
          .from(staffTable)
          .where(and(
            eq(staffTable.sisConnectionId, connectionId),
            isNull(staffTable.deletedAt),
          ))
          .limit(1)
      : rec.email
        ? await db.select({ id: staffTable.id })
            .from(staffTable)
            .where(and(
              eq(staffTable.email, rec.email),
              eq(staffTable.sisConnectionId, connectionId),
              isNull(staffTable.deletedAt),
            ))
            .limit(1)
        : [];

    if (existing.length > 0) {
      await db.update(staffTable)
        .set({
          firstName: rec.firstName,
          lastName: rec.lastName,
          title: rec.title ?? undefined,
          status: rec.status,
        })
        .where(eq(staffTable.id, existing[0].id));
      counters.staffUpdated++;
    } else {
      await db.insert(staffTable).values({
        firstName: rec.firstName,
        lastName: rec.lastName,
        email: rec.email,
        role: rec.role || "provider",
        title: rec.title,
        schoolId: schoolId,
        status: rec.status,
        sisConnectionId: connectionId,
        sisManaged: "true",
      });
      counters.staffAdded++;
    }
  }
  counters.totalRecords += records.length;
}

export async function runSync(
  connectionId: number,
  syncType: "full" | "students" | "staff" | "csv_students" | "csv_staff",
  triggeredBy: string,
  csvData?: { csvText: string },
): Promise<SyncCounters> {
  const [connection] = await db.select()
    .from(sisConnectionsTable)
    .where(eq(sisConnectionsTable.id, connectionId))
    .limit(1);

  if (!connection) throw new Error("SIS connection not found");

  const credentials = connection.credentialsEncrypted
    ? decryptCredentials(connection.credentialsEncrypted)
    : {};

  const [logEntry] = await db.insert(sisSyncLogsTable).values({
    connectionId,
    syncType,
    status: "running",
    triggeredBy,
  }).returning();

  const counters: SyncCounters = {
    studentsAdded: 0, studentsUpdated: 0, studentsArchived: 0,
    staffAdded: 0, staffUpdated: 0,
    totalRecords: 0, errors: [], warnings: [],
  };

  try {
    if (syncType === "csv_students" && csvData) {
      const csv = getCsvConnector();
      const result = csv.parseStudentCsv(csvData.csvText);
      counters.errors.push(...result.errors);
      counters.warnings.push(...result.warnings);
      await upsertStudents(result.records, connection.schoolId, connectionId, counters);
    } else if (syncType === "csv_staff" && csvData) {
      const csv = getCsvConnector();
      const result = csv.parseStaffCsv(csvData.csvText);
      counters.errors.push(...result.errors);
      counters.warnings.push(...result.warnings);
      await upsertStaff(result.records, connection.schoolId, connectionId, counters);
    } else {
      const connector = getConnector(connection.provider as SisProvider);

      if (syncType === "full" || syncType === "students") {
        const studentResult = await connector.fetchStudents(credentials);
        counters.errors.push(...studentResult.errors);
        const seenIds = await upsertStudents(studentResult.records, connection.schoolId, connectionId, counters);

        if (syncType === "full" && studentResult.records.length > 0) {
          await archiveMissingStudents(seenIds, connectionId, counters);
        }
      }

      if (syncType === "full" || syncType === "staff") {
        const staffResult = await connector.fetchStaff(credentials);
        counters.errors.push(...staffResult.errors);
        await upsertStaff(staffResult.records, connection.schoolId, connectionId, counters);
      }
    }

    const finalStatus = counters.errors.length > 0 ? "completed_with_errors" : "completed";

    await db.update(sisSyncLogsTable)
      .set({
        status: finalStatus,
        studentsAdded: counters.studentsAdded,
        studentsUpdated: counters.studentsUpdated,
        studentsArchived: counters.studentsArchived,
        staffAdded: counters.staffAdded,
        staffUpdated: counters.staffUpdated,
        totalRecords: counters.totalRecords,
        errors: counters.errors,
        warnings: counters.warnings,
        completedAt: new Date(),
      })
      .where(eq(sisSyncLogsTable.id, logEntry.id));

    await db.update(sisConnectionsTable)
      .set({
        status: finalStatus === "completed" ? "connected" : "error",
        lastSyncAt: new Date(),
      })
      .where(eq(sisConnectionsTable.id, connectionId));

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown sync error";
    counters.errors.push({ message: msg });

    await db.update(sisSyncLogsTable)
      .set({
        status: "failed",
        errors: counters.errors,
        completedAt: new Date(),
      })
      .where(eq(sisSyncLogsTable.id, logEntry.id));

    await db.update(sisConnectionsTable)
      .set({ status: "error" })
      .where(eq(sisConnectionsTable.id, connectionId));
  }

  return counters;
}
