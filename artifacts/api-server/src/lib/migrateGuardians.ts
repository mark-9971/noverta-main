import { db } from "@workspace/db";
import { studentsTable, guardiansTable } from "@workspace/db";
import { isNull, and, eq, or, isNotNull } from "drizzle-orm";

interface MigrationResult {
  migrated: number;
  updated: number;
  skipped: number;
}

function normalizeName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

export async function migrateExistingGuardians(): Promise<MigrationResult> {
  let migrated = 0;
  let updated = 0;
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
        or(
          isNotNull(studentsTable.parentGuardianName),
          isNotNull(studentsTable.parentEmail),
          isNotNull(studentsTable.parentPhone),
        )
      )
    );

  for (const student of students) {
    const legacyName = student.parentGuardianName?.trim() || null;
    const legacyEmail = student.parentEmail?.trim() || null;
    const legacyPhone = student.parentPhone?.trim() || null;

    if (!legacyName && !legacyEmail && !legacyPhone) {
      skipped++;
      continue;
    }

    const existingGuardians = await db
      .select()
      .from(guardiansTable)
      .where(eq(guardiansTable.studentId, student.id));

    const normalizedLegacy = normalizeName(legacyName);

    const nameMatch = normalizedLegacy
      ? existingGuardians.find((g) => normalizeName(g.name) === normalizedLegacy)
      : null;

    const emailMatch = legacyEmail
      ? existingGuardians.find((g) => g.email?.toLowerCase() === legacyEmail.toLowerCase())
      : null;

    const matchedGuardian = nameMatch ?? emailMatch ?? null;

    if (matchedGuardian) {
      const needsEmailUpdate = legacyEmail && !matchedGuardian.email;
      const needsPhoneUpdate = legacyPhone && !matchedGuardian.phone;

      if (needsEmailUpdate || needsPhoneUpdate) {
        await db
          .update(guardiansTable)
          .set({
            ...(needsEmailUpdate ? { email: legacyEmail } : {}),
            ...(needsPhoneUpdate ? { phone: legacyPhone } : {}),
          })
          .where(eq(guardiansTable.id, matchedGuardian.id));
        updated++;
      } else {
        skipped++;
      }
      continue;
    }

    await db.insert(guardiansTable).values({
      studentId: student.id,
      name: legacyName ?? "Guardian",
      relationship: "Guardian",
      email: legacyEmail,
      phone: legacyPhone,
      preferredContactMethod: legacyEmail ? "email" : legacyPhone ? "phone" : "email",
      contactPriority: 1,
      interpreterNeeded: false,
    });

    migrated++;
  }

  return { migrated, updated, skipped };
}
