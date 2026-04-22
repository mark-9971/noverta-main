import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Helpers shared by the cross-user / cross-district handling-state spec.
 *
 * Auth model:
 *   - Tests use Clerk ticket-based sign-in (no password) — same pattern as
 *     incident.ts. We mint a JWT inside the browser and attach it as a
 *     Bearer header on the request context so page.request.* calls
 *     authenticate as that user.
 *   - We do NOT use the dev-bypass headers here because this spec must
 *     prove district scoping via the real Clerk-derived districtId, not
 *     via an x-test-district-id override.
 */

/**
 * Suppress the SampleDataTour overlay so it cannot redirect us to
 * /compliance-risk-report mid-test. Mirrors the pattern in incident.ts.
 */
async function disableTours(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __TRELLIS_DISABLE_TOURS__?: boolean };
    w.__TRELLIS_DISABLE_TOURS__ = true;
    try {
      localStorage.setItem("trellis.disableTours", "1");
    } catch {
      // best-effort
    }
    const origGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === "string" && key.startsWith("trellis.sampleTour.v1")) return "seen";
      return origGet.call(this, key);
    };
  });
}

/**
 * Sign out any prior Clerk session, then sign in as `email` using a
 * one-time Clerk ticket. After this returns, page.request.* calls
 * authenticate as the new user via Bearer token, and any required legal
 * acceptances have been accepted.
 *
 * Idempotent across multiple invocations within the same test (used to
 * switch between Admin A → Admin B → Admin C inside one spec).
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  await disableTours(page);

  await setupClerkTestingToken({ page });
  // Clear any stale Authorization header from a previous user — Clerk's
  // browser SDK refuses to load when the page request carries both
  // Origin and Authorization (see incident-lifecycle gotcha in README).
  await page.context().setExtraHTTPHeaders({});
  // Drop any /api/** route handler from a previous signInAs call so we can
  // re-install one keyed to the new user's JWT below. Idempotent — no-op
  // on first invocation.
  await page.context().unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});

  await page.goto("/setup");
  await page.waitForFunction(
    () => {
      const w = window as unknown as { Clerk?: { loaded?: boolean } };
      return w.Clerk?.loaded === true;
    },
    null,
    { timeout: 30_000 },
  );

  // If a previous identity is signed in, sign out before swapping users.
  await page.evaluate(async () => {
    const w = window as unknown as {
      Clerk?: {
        user?: unknown;
        signOut?: () => Promise<void>;
      };
    };
    if (w.Clerk?.user && w.Clerk.signOut) {
      await w.Clerk.signOut();
    }
  });

  await clerk.signIn({ page, emailAddress: email });

  // Pull a JWT and attach it for page.request.* calls.
  const token = await page.waitForFunction(
    async () => {
      const w = window as unknown as {
        Clerk?: { session?: { getToken: () => Promise<string | null> } };
      };
      const t = await w.Clerk?.session?.getToken?.();
      return typeof t === "string" && t.length > 0 ? t : null;
    },
    null,
    { timeout: 30_000 },
  );
  const sessionJwt = (await token.jsonValue()) as string;

  // Inject the Bearer token ONLY on same-origin requests to /api/**. Doing
  // this via page.context().route — instead of setExtraHTTPHeaders — keeps
  // the Authorization header off cross-origin requests (notably Clerk's own
  // browser-side fetches to *.clerk.accounts.dev). When Authorization rides
  // along on those cross-origin fetches the browser also auto-sets Origin,
  // and Clerk responds 400 ("only one of the 'Origin' and 'Authorization'
  // headers should be provided"), which silently breaks Clerk session
  // restoration on the next page navigation — AppLayout then never finishes
  // rendering /action-center and tests hang on a blank page. Mirrors the
  // canonical pattern in incident.ts.
  await page.context().route(/\/api\//, async (route) => {
    const headers = {
      ...route.request().headers(),
      authorization: `Bearer ${sessionJwt}`,
    };
    await route.continue({ headers });
  });

  // Accept any required legal documents so /api/* requests aren't blocked
  // by requireLegalAcceptance.
  const statusRes = await page.request.get("/api/legal/acceptance-status");
  if (statusRes.ok()) {
    const statusBody = (await statusRes.json()) as {
      documents?: Array<{
        documentType: string;
        documentVersion: string;
        required: boolean;
      }>;
    };
    const missing = (statusBody.documents ?? [])
      .filter((d) => d.required)
      .map((d) => ({
        documentType: d.documentType,
        documentVersion: d.documentVersion,
      }));
    if (missing.length > 0) {
      await page.request.post("/api/legal/accept", {
        data: { acceptances: missing },
      });
    }
  }

  // Verify the API authenticates this user.
  await expect
    .poll(
      async () => (await page.request.get("/api/sample-data")).status(),
      {
        timeout: 30_000,
        message: `API did not authenticate after signing in as ${email}.`,
      },
    )
    .toBe(200);
}

/**
 * Idempotent sample-data seeding for the caller's district. Mirrors the
 * helper in incident.ts but inlined so this spec is self-contained.
 */
export async function ensureSampleData(page: Page): Promise<void> {
  const status = await page.request
    .get("/api/sample-data")
    .then((r) => r.json() as Promise<{ hasSampleData: boolean; sampleStudents: number }>);
  if (status.hasSampleData && status.sampleStudents > 0) return;

  // Small, capacity-safe seed so freshly-provisioned districts (e.g. the
  // E2E secondary district used by Admin C) don't trip the seeder's
  // provider-capacity guard. Districts that already have sample data
  // short-circuit above; this body only applies on first-seed.
  const seedRes = await page.request.post("/api/sample-data", {
    data: {
      targetStudents: 20,
      providerCount: 4,
      caseManagerCount: 2,
      paraCount: 2,
      bcbaCount: 1,
      avgRequiredMinutesPerWeek: 60,
      backfillMonths: 1,
    },
  });
  expect(
    seedRes.ok(),
    `POST /api/sample-data should succeed (status ${seedRes.status()})`,
  ).toBeTruthy();

  await expect
    .poll(
      async () => {
        const r = await page.request.get("/api/sample-data");
        if (!r.ok()) return 0;
        const j = (await r.json()) as { sampleStudents: number };
        return j.sampleStudents;
      },
      { timeout: 120_000, message: "Sample data did not appear within 120s" },
    )
    .toBeGreaterThan(0);
}

/**
 * Reset handling state for a single item to `needs_action` (the implicit
 * default — the API deletes the row). Best-effort cleanup so re-runs are
 * deterministic. Errors are swallowed.
 */
export async function resetHandlingState(
  page: Page,
  itemId: string,
): Promise<void> {
  try {
    await page.request.put(
      `/api/action-item-handling/${encodeURIComponent(itemId)}`,
      { data: { state: "needs_action" } },
    );
  } catch {
    // best-effort cleanup
  }
}

/**
 * Pick the first N visible Action Center items, preferring ids whose
 * prefix matches `preferPrefix` (so we can deliberately grab `risk:` ids
 * for the cross-surface assertion against the compliance-risk-report).
 *
 * Returns the canonical item ids extracted from the rendered DOM
 * (`data-testid="button-more-<itemId>"`). Throws if fewer than N
 * matching items are found.
 */
export async function pickActionCenterItemIds(
  page: Page,
  count: number,
  opts: { preferPrefix?: string; requirePrefix?: boolean } = {},
): Promise<string[]> {
  await page.goto("/action-center");
  // The Action Center renders skeletons while data loads — wait for at
  // least one action row to materialise before scraping ids.
  await expect
    .poll(
      async () =>
        await page.locator('[data-testid^="button-more-"]').count(),
      {
        timeout: 60_000,
        message: "No Action Center items appeared within 60s",
      },
    )
    .toBeGreaterThan(0);

  const handles = await page.locator('[data-testid^="button-more-"]').all();
  const ids: string[] = [];
  for (const h of handles) {
    const t = await h.getAttribute("data-testid");
    if (!t) continue;
    const id = t.replace(/^button-more-/, "");
    if (id) ids.push(id);
  }

  const preferred = opts.preferPrefix
    ? ids.filter((id) => id.startsWith(opts.preferPrefix!))
    : [];
  const rest = opts.requirePrefix
    ? []
    : ids.filter((id) => !preferred.includes(id));
  const ordered = [...new Set([...preferred, ...rest])];

  if (ordered.length < count) {
    const mode = opts.requirePrefix ? "requirePrefix" : "preferPrefix";
    throw new Error(
      `pickActionCenterItemIds: needed ${count} ids, found ${ordered.length} (${mode}=${opts.preferPrefix ?? "none"})`,
    );
  }
  return ordered.slice(0, count);
}

/**
 * Click through the Action Center's "more" menu to set a single item's
 * handling state via the rendered UI. Returns once the handling pill
 * reflects the target state in the DOM.
 */
export async function setHandlingViaUI(
  page: Page,
  itemId: string,
  state:
    | "needs_action"
    | "awaiting_confirmation"
    | "recovery_scheduled"
    | "handed_off"
    | "under_review"
    | "resolved",
): Promise<void> {
  const more = page.getByTestId(`button-more-${itemId}`);
  await expect(more).toBeVisible({ timeout: 30_000 });
  await more.click();
  const choice = page.getByTestId(`button-handling-${itemId}-${state}`);
  await expect(choice).toBeVisible({ timeout: 10_000 });
  await choice.click();
  // Pill reflects the new state when state !== needs_action.
  if (state !== "needs_action") {
    await expect(page.getByTestId(`handling-state-${itemId}`)).toBeVisible({
      timeout: 15_000,
    });
  }
}
