/**
 * Seed Overhaul V2 — Platform / Transaction & bulk-insert helpers.
 *
 * Extracted from `seed-sample-data.ts` (W1 platform extraction).
 * The chunkedInsert default of 400 rows keeps every seeded table well
 * under PostgreSQL's 65,535 bind-param limit (400 × ~30 cols ≈ 12 000
 * params). The 1664-arg ROW-expression cap that bit the cleanupDistrict
 * helper is a different limit and is handled in tests/helpers.ts.
 *
 * W5 fold-in: callers may now pass an optional `db` handle (typically
 * a transaction handle from `db.transaction(...)`) so the inserts run
 * inside the caller's tx. Defaults to the global `db` export for
 * back-compat.
 */
import { db as globalDb } from "../../db";

export async function chunkedInsert<T extends Record<string, unknown>>(
  table: any,
  rows: T[],
  opts: { chunk?: number; returning?: boolean; db?: any } = {},
): Promise<any[]> {
  const handle = opts.db ?? globalDb;
  const chunk = opts.chunk ?? 400;
  const out: any[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    if (slice.length === 0) continue;
    if (opts.returning) {
      const r = await (handle.insert(table).values(slice) as any).returning();
      out.push(...r);
    } else {
      await handle.insert(table).values(slice);
    }
  }
  return out;
}
