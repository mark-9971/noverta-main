import { db, districtsTable } from "@workspace/db";
import { and, lt, isNotNull } from "drizzle-orm";
import { runHardPurgeForDistrict } from "../routes/districtData";
import { getDistrictAdminEmails } from "./billingEmail";

/**
 * Find every district whose 30-day soft-delete window has elapsed
 * (`delete_scheduled_at < NOW()`) and run the hard purge automatically.
 *
 * The deletion certificate PDF is emailed to the district's billing/admin
 * contacts. All audit log entries (initiated, per-table, complete) are
 * written by `runHardPurgeForDistrict`.
 *
 * Designed to be called from the central reminder scheduler.
 */
export async function runScheduledHardPurges(): Promise<void> {
  const now = new Date();
  let due: Array<{ id: number; name: string }> = [];

  try {
    due = await db
      .select({ id: districtsTable.id, name: districtsTable.name })
      .from(districtsTable)
      .where(
        and(
          isNotNull(districtsTable.deleteScheduledAt),
          isNotNull(districtsTable.deleteInitiatedAt),
          lt(districtsTable.deleteScheduledAt, now),
        ),
      );
  } catch (err) {
    console.error("[ScheduledHardPurge] Failed to query due districts:", err);
    return;
  }

  if (due.length === 0) {
    return;
  }

  console.log(`[ScheduledHardPurge] ${due.length} district(s) due for automatic purge`);

  for (const d of due) {
    try {
      // Recipients = district admin staff (billing contact equivalent).
      // Look these up BEFORE the purge wipes the staff/schools tables.
      let recipients: string[] = [];
      try {
        recipients = await getDistrictAdminEmails(d.id);
      } catch (err) {
        console.error(`[ScheduledHardPurge] Recipient lookup failed for district ${d.id}:`, err);
      }

      const result = await runHardPurgeForDistrict({
        districtId: d.id,
        actor: {
          userId: "system:scheduled-hard-purge",
          role: "system",
          name: "Noverta Scheduler",
        },
        notifyEmails: recipients,
      });

      console.log(
        `[ScheduledHardPurge] District ${d.id} (${result.districtName}) purged: ` +
        `${result.totalRowsDeleted} rows across ${result.tables.length} tables`,
      );
    } catch (err) {
      console.error(`[ScheduledHardPurge] Purge failed for district ${d.id}:`, err);
    }
  }
}
