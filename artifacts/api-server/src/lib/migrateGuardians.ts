import { db } from "@workspace/db";
import { studentsTable, guardiansTable } from "@workspace/db";
import { isNull, isNotNull, and, eq } from "drizzle-orm";

export async function migrateExistingGuardians(): Promise<{ migrated: number; skipped: number }> {
  let migrated = 0;
  let skipped = 0;

  const students = await db
    .select({
      id: studentsTable.id,
      parentGuardianName: studentsTable.parentGuardianName,
      parentEmail: studentsTable.parentEmail,
      parentPhone: studentsTable.parentPhone,
    })
    .from(studentsTable)
    .where(
      and(
        isNull(studentsTable.deletedAt),
        isNotNull(studentsTable.parentGuardianName),
      )
    );

  for (const student of students) {
    if (!student.parentGuardianName?.trim()) {
      skipped++;
      continue;
    }

    const existing = await db
      .select({ id: guardiansTable.id })
      .from(guardiansTable)
      .where(eq(guardiansTable.studentId, student.id))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(guardiansTable).values({
      studentId: student.id,
      name: student.parentGuardianName.trim(),
      relationship: "Guardian",
      email: student.parentEmail?.trim() || null,
      phone: student.parentPhone?.trim() || null,
      preferredContactMethod: student.parentEmail ? "email" : student.parentPhone ? "phone" : "email",
      contactPriority: 1,
      interpreterNeeded: false,
    });

    migrated++;
  }

  return { migrated, skipped };
}
