export function isScreenshotMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.search.includes("screenshot=1")) return true;
    if (window.sessionStorage.getItem("trellis.screenshotMode") === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

if (typeof window !== "undefined") {
  try {
    if (window.location.search.includes("screenshot=1")) {
      window.sessionStorage.setItem("trellis.screenshotMode", "1");
      window.localStorage.setItem("trellis.disableTours", "1");
    }
  } catch {
    // ignore
  }
}
