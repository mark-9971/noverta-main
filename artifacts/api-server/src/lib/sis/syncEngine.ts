import { db } from "@workspace/db";
import {
  studentsTable, staffTable, sisConnectionsTable, sisSyncLogsTable, enrollmentEventsTable,
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

export interface RunSyncOptions {
  csvData?: { csvText: string };
  /**
   * Optional progress reporter. The durable job worker passes this in so
   * UI polling against `sis_sync_jobs.progress` shows live phases. Errors
   * from the reporter are swallowed — progress is best-effort and must
   * never abort a sync.
   */
  onProgress?: (phase: string, info?: { recordsProcessed?: number; totalRecords?: number; message?: string }) => Promise<void> | void;
}

/**
 * Result of a sync attempt. We expose the syncLogId so the durable job
 * worker can link the job → log row for historical drill-down.
 */
export interface SyncResult extends SyncCounters {
  syncLogId: number;
}

async function emit(opts: RunSyncOptions | undefined, phase: string, info?: { recordsProcessed?: number; totalRecords?: number; message?: string }): Promise<void> {
  if (!opts?.onProgress) return;
  try {
    await opts.onProgress(phase, info);
  } catch (err) {
    console.warn("[SIS Sync] progress reporter threw, ignoring:", err);
  }
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

  const syncDate = new Date().toISOString().slice(0, 10);

  for (const student of toArchive) {
    await db.transaction(async (tx) => {
      await tx.update(studentsTable)
        .set({ status: "inactive" })
        .where(eq(studentsTable.id, student.id));

      // Guard against duplicate withdrawal events: if a previous sync today
      // already wrote a withdrawn/sis_sync event for this student, skip the
      // insert so retries/requeues don't pile up identical rows.
      const existing = await tx.select({ id: enrollmentEventsTable.id })
        .from(enrollmentEventsTable)
        .where(and(
          eq(enrollmentEventsTable.studentId, student.id),
          eq(enrollmentEventsTable.eventType, "withdrawn"),
          eq(enrollmentEventsTable.source, "sis_sync"),
          eq(enrollmentEventsTable.eventDate, syncDate),
        ))
        .limit(1);

      if (existing.length === 0) {
        await tx.insert(enrollmentEventsTable).values({
          studentId: student.id,
          eventType: "withdrawn",
          eventDate: syncDate,
          source: "sis_sync",
          reason: "Not found in SIS feed",
        });
      }
    });

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
            eq(staffTable.externalId, rec.externalId),
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
        externalId: rec.externalId,
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
  csvDataOrOptions?: { csvText: string } | RunSyncOptions,
): Promise<SyncResult> {
  // Backwards-compat: callers used to pass `{ csvText }` directly. New
  // callers (the worker) pass an options object with `csvData` and an
  // optional `onProgress`. Detect which we got.
  const opts: RunSyncOptions = csvDataOrOptions
    ? "csvText" in csvDataOrOptions
      ? { csvData: csvDataOrOptions }
      : csvDataOrOptions
    : {};
  const csvData = opts.csvData;
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
    await emit(opts, "starting", { message: `Sync ${syncType} started` });
    if (syncType === "csv_students" && csvData) {
      await emit(opts, "parsing_csv");
      const csv = getCsvConnector();
      const result = csv.parseStudentCsv(csvData.csvText);
      counters.errors.push(...result.errors);
      counters.warnings.push(...result.warnings);
      await emit(opts, "upserting_students", { totalRecords: result.records.length });
      await upsertStudents(result.records, connection.schoolId, connectionId, counters);
    } else if (syncType === "csv_staff" && csvData) {
      await emit(opts, "parsing_csv");
      const csv = getCsvConnector();
      const result = csv.parseStaffCsv(csvData.csvText);
      counters.errors.push(...result.errors);
      counters.warnings.push(...result.warnings);
      await emit(opts, "upserting_staff", { totalRecords: result.records.length });
      await upsertStaff(result.records, connection.schoolId, connectionId, counters);
    } else {
      const connector = getConnector(connection.provider as SisProvider);

      if (syncType === "full" || syncType === "students") {
        await emit(opts, "fetching_students");
        const studentResult = await connector.fetchStudents(credentials);
        counters.errors.push(...studentResult.errors);
        await emit(opts, "upserting_students", { totalRecords: studentResult.records.length });
        const seenIds = await upsertStudents(studentResult.records, connection.schoolId, connectionId, counters);

        if (syncType === "full") {
          if (studentResult.records.length === 0 && studentResult.errors.length === 0) {
            counters.warnings.push({ message: "SIS returned 0 students — skipping archival as safety guard. If enrollment is truly empty, archive manually." });
          } else if (studentResult.errors.length === 0) {
            await emit(opts, "archiving_missing_students");
            await archiveMissingStudents(seenIds, connectionId, counters);
          }
        }
      }

      if (syncType === "full" || syncType === "staff") {
        await emit(opts, "fetching_staff");
        const staffResult = await connector.fetchStaff(credentials);
        counters.errors.push(...staffResult.errors);
        await emit(opts, "upserting_staff", { totalRecords: staffResult.records.length });
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

    // Re-throw so the durable job worker sees a failure and routes
    // through retry/backoff. The HTTP path used to swallow this error
    // (it returned partial counters); now that the request path enqueues
    // and returns immediately, the only caller of runSync is the worker,
    // and surfacing the throw is what makes retries possible.
    throw err;
  }

  return { ...counters, syncLogId: logEntry.id };
}
