import { migrateSessionGet, migrateLocalGet } from "./storage-migration";

const SCREENSHOT_KEY = "noverta.screenshotMode";
const LEGACY_SCREENSHOT_KEY = "trellis.screenshotMode";
const DISABLE_TOURS_KEY = "noverta.disableTours";
const LEGACY_DISABLE_TOURS_KEY = "trellis.disableTours";

export function isScreenshotMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.search.includes("screenshot=1")) return true;
    // migrateSessionGet copies the old value onto the new key.
    if (migrateSessionGet(SCREENSHOT_KEY, LEGACY_SCREENSHOT_KEY) === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

if (typeof window !== "undefined") {
  try {
    if (window.location.search.includes("screenshot=1")) {
      window.sessionStorage.setItem(SCREENSHOT_KEY, "1");
      window.localStorage.setItem(DISABLE_TOURS_KEY, "1");
    } else {
      // One-time migration on app load for tabs that already have the
      // legacy keys set. Read-fallback + copy-forward; no destructive
      // delete unless the new key was successfully written.
      migrateSessionGet(SCREENSHOT_KEY, LEGACY_SCREENSHOT_KEY);
      migrateLocalGet(DISABLE_TOURS_KEY, LEGACY_DISABLE_TOURS_KEY);
    }
  } catch {
    // ignore
  }
}
