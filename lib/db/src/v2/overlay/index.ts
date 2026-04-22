/**
 * Seed Overhaul V2 — Demo Readiness Overlay boundary (W1 placeholder).
 *
 * The Demo Readiness Overlay (W5) selects-and-labels showcase cases
 * from the simulator's primitive-fact output. The hard rule, repeated
 * from .local/plans/seed-overhaul-v2.md §6 NO-CHEATING RULES:
 *
 *   No fact mutators may live under v2/overlay/. Only selectors
 *   (read + tag) and identity seeders (Clerk demo accounts).
 *
 * To make that rule mechanically enforceable, V2 plans a CI gate that
 * hashes the L3 primitive-fact tables before and after overlay runs
 * and asserts equality. The hash helper signature is staked here so
 * W3/W4 callers can wire the snapshot points without waiting for W5
 * to land. The body is intentionally a stub — it returns a marker
 * string instead of computing a real digest in W1.
 */

export const OVERLAY_LAYER_VERSION = "w1-placeholder";

export interface PrimitiveFactSnapshot {
  /** The list of tables the snapshot covers (canonical order). */
  tables: ReadonlyArray<string>;
  /** Stable digest. W1 returns a placeholder; W5 swaps in real SHA-256. */
  digest: string;
  /** ISO-8601 capture time. */
  capturedAt: string;
}

/**
 * Stub snapshot helper. W5 will replace the body with a real per-table
 * SHA-256 digest computed under the same transaction the overlay runs
 * in. Callers in W3/W4 may use this signature today; the returned
 * digest is intentionally non-cryptographic until W5.
 */
export async function snapshotPrimitiveFacts(
  _districtId: number,
  tables: ReadonlyArray<string>,
): Promise<PrimitiveFactSnapshot> {
  return {
    tables,
    digest: "w1-placeholder-digest",
    capturedAt: new Date().toISOString(),
  };
}
