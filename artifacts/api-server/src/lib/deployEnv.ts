/**
 * Deployment environment detection.
 *
 * Provides a defense-in-depth layer on top of `NODE_ENV === "production"` so
 * the api-server cannot accidentally serve dev-only auth bypass paths in a
 * managed cloud deployment when an operator forgets to set `NODE_ENV`.
 *
 * Background: every dev/test header bypass in `middlewares/auth.ts`,
 * `routes/iepBuilder/shared.ts`, etc. is gated on
 * `NODE_ENV !== "production"`. Railway / Render / Fly do **not** set
 * `NODE_ENV=production` automatically. If an operator misses that env var,
 * the entire `x-test-*` / `x-demo-*` spoofing surface (including the
 * `dev_bypass_admin` district-pinning headers shipped by the web bundle)
 * becomes unauthenticated remote code paths.
 *
 * `isManagedDeploy()` returns true when any of the well-known managed-cloud
 * markers are present, even if `NODE_ENV` is unset/empty/dev/test. Callers
 * use it to refuse bypass even when `NODE_ENV` would otherwise admit it.
 *
 * Detection markers (any one is sufficient):
 *   - Railway:           RAILWAY_ENVIRONMENT, RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID
 *   - Render:            RENDER, RENDER_SERVICE_ID
 *   - Fly.io:            FLY_APP_NAME, FLY_REGION
 *   - Generic / explicit: TRELLIS_DEPLOY_ENV (set by the operator/runbook)
 *
 * Local dev, vitest, and CI workflows set none of these, so `isManagedDeploy()`
 * is false there and all existing test bypasses keep working.
 */

const MANAGED_DEPLOY_VARS = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RENDER",
  "RENDER_SERVICE_ID",
  "FLY_APP_NAME",
  "FLY_REGION",
  "TRELLIS_DEPLOY_ENV",
] as const;

export function isManagedDeploy(): boolean {
  for (const name of MANAGED_DEPLOY_VARS) {
    const v = process.env[name];
    if (typeof v === "string" && v.trim() !== "") return true;
  }
  return false;
}

/**
 * Returns the marker that triggered managed-deploy detection, or null.
 * Used in startup log lines to make the chosen posture observable.
 */
export function managedDeployMarker(): string | null {
  for (const name of MANAGED_DEPLOY_VARS) {
    const v = process.env[name];
    if (typeof v === "string" && v.trim() !== "") return name;
  }
  return null;
}

/**
 * True when the process is running in a posture where dev/test auth bypass
 * MUST be refused. This is the OR of:
 *   - `NODE_ENV === "production"` (canonical signal), OR
 *   - any managed-deploy marker is present (defense-in-depth: even if the
 *     operator forgot `NODE_ENV=production`, we still refuse bypass).
 *
 * Use this in place of `process.env.NODE_ENV === "production"` for any guard
 * whose only job is "do not honor dev-only auth headers in real deployments".
 */
export function isProductionLikeDeploy(): boolean {
  return process.env.NODE_ENV === "production" || isManagedDeploy();
}

/**
 * True when dev/test auth bypass headers (`x-test-*`, `x-demo-*`) and the
 * `DEV_AUTH_BYPASS` flag are permitted to take effect. Strict by design:
 *
 *   - Permitted only when both `NODE_ENV !== "production"` AND no managed
 *     deploy marker is present.
 *   - Permitted in `NODE_ENV === "test"` (vitest, CI permission-matrix).
 *   - Permitted in local dev when `DEV_AUTH_BYPASS=1`.
 *
 * The `kind` argument selects which non-prod env flag is consulted:
 *   - "test"   — only `NODE_ENV === "test"` (used by tests/CI)
 *   - "dev"    — `NODE_ENV !== "production"` AND `DEV_AUTH_BYPASS === "1"`
 *   - "either" — either of the above
 */
export function isAuthBypassAllowed(
  kind: "test" | "dev" | "either" = "either",
): boolean {
  if (isProductionLikeDeploy()) return false;
  const isTest = process.env.NODE_ENV === "test";
  const isDev =
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (kind === "test") return isTest;
  if (kind === "dev") return isDev;
  return isTest || isDev;
}

/**
 * Boot-time fail-fast guards for managed-cloud deploys. Called from the
 * very first import of `src/index.ts` so it runs BEFORE any module-level
 * import chain (Express, routes, integrations) can throw or open sockets.
 *
 * Refuses to start when a managed-cloud marker is present AND either:
 *   - `NODE_ENV !== "production"` (every other guard in the codebase keys
 *     on this; an unset NODE_ENV silently disables them all), or
 *   - `DEV_AUTH_BYPASS === "1"` (this flag enables x-test-* / x-demo-*
 *     identity spoofing on every request).
 *
 * Uses console.* (not pino) because pino's transport pulls in workers we
 * don't want loaded before this check runs. The error message is the only
 * thing the operator will see, so it must be self-contained.
 */
export function assertManagedDeployPosture(): void {
  if (!isManagedDeploy()) return;
  const marker = managedDeployMarker();

  if (process.env.NODE_ENV !== "production") {
    console.error(
      `[boot] FATAL: managed-cloud deploy detected (${marker}) but ` +
        `NODE_ENV !== "production" (got ${JSON.stringify(process.env.NODE_ENV ?? null)}). ` +
        `Set NODE_ENV=production on this service. Refusing to start — running with the ` +
        `current value would silently disable Clerk hard-fail guards, the prod CORS ` +
        `allowlist, the rate-limit applicability, and the x-test-* / x-demo-* header ` +
        `rejection in middlewares/auth.ts. See docs/runbooks/railway-clerk-auth.md.`,
    );
    process.exit(1);
  }

  if (process.env.DEV_AUTH_BYPASS === "1") {
    console.error(
      `[boot] FATAL: DEV_AUTH_BYPASS=1 set in a managed-cloud deploy (${marker}). ` +
        `This flag enables x-test-* / x-demo-* identity spoofing on every request. ` +
        `Unset DEV_AUTH_BYPASS (and VITE_DEV_AUTH_BYPASS in the web build) before ` +
        `redeploying. See docs/runbooks/railway-clerk-auth.md.`,
    );
    process.exit(1);
  }

  console.log(
    `[boot] managed-cloud deploy detected (${marker}) — bypass surfaces hardened`,
  );
}
