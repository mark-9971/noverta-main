/**
 * Trellis → Noverta persisted-key migration helpers.
 *
 * Pattern (read-fallback + copy-forward):
 *   1. Read the new `noverta.*` / `noverta_*` key first.
 *   2. If the new key is absent and an old `trellis.*` / `trellis_*` key
 *      exists, copy the old value into the new key.
 *   3. Only remove the old key AFTER the new key has been written
 *      successfully.
 *
 * No call here ever drops a value without first preserving it under the
 * new key. Safe to use for in-flight session timer state and the offline
 * ABA queue.
 *
 * Helpers throw nothing — every storage access is wrapped in try/catch
 * so callers can use them anywhere the existing code touched
 * localStorage/sessionStorage.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeGet(store: StorageLike, k: string): string | null {
  try { return store.getItem(k); } catch { return null; }
}
function safeSet(store: StorageLike, k: string, v: string): boolean {
  try { store.setItem(k, v); return true; } catch { return false; }
}
function safeDel(store: StorageLike, k: string): void {
  try { store.removeItem(k); } catch { /* ignore */ }
}

/**
 * Read the new key; if it is missing and the legacy key exists, copy the
 * legacy value into the new key and (only on a successful copy) delete
 * the legacy key. Returns whatever value ends up under the new key, or
 * `null` if neither key exists.
 */
function migrateGet(
  store: StorageLike,
  newKey: string,
  oldKey: string,
): string | null {
  const newVal = safeGet(store, newKey);
  if (newVal !== null) {
    // Old key is dead weight at this point; clear it best-effort.
    if (safeGet(store, oldKey) !== null) safeDel(store, oldKey);
    return newVal;
  }
  const oldVal = safeGet(store, oldKey);
  if (oldVal === null) return null;
  if (safeSet(store, newKey, oldVal)) {
    safeDel(store, oldKey);
  }
  return oldVal;
}

/** localStorage variant of {@link migrateGet}. */
export function migrateLocalGet(newKey: string, oldKey: string): string | null {
  if (typeof window === "undefined") return null;
  return migrateGet(window.localStorage, newKey, oldKey);
}

/** sessionStorage variant of {@link migrateGet}. */
export function migrateSessionGet(newKey: string, oldKey: string): string | null {
  if (typeof window === "undefined") return null;
  return migrateGet(window.sessionStorage, newKey, oldKey);
}
