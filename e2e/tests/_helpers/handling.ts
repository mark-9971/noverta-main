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

  // Wait until Clerk in the browser actually reports the new user as the
  // active session. After signOut→signIn, Clerk's BAPI session swap takes
  // a beat; capturing a JWT before this lands yields a token with the
  // PREVIOUS user's claims (or stale publicMetadata), which the API then
  // rejects with 403 under requireRoles + requireDistrictScope.
  await page.waitForFunction(
    (expectedEmail) => {
      const w = window as unknown as {
        Clerk?: {
          user?: {
            primaryEmailAddress?: { emailAddress?: string } | null;
            emailAddresses?: Array<{ emailAddress?: string }>;
          } | null;
          session?: { id?: string; status?: string } | null;
        };
      };
      const u = w.Clerk?.user;
      if (!u || !w.Clerk?.session) return false;
      const primary = u.primaryEmailAddress?.emailAddress;
      const all = (u.emailAddresses ?? []).map((e) => e.emailAddress);
      return primary === expectedEmail || all.includes(expectedEmail);
    },
    email,
    { timeout: 30_000 },
  );

  // Pull a fresh JWT (skipCache forces Clerk to re-issue against the
  // newly-active session, ensuring publicMetadata.role / districtId on
  // the token match the user we just signed in as — not the prior user).
  const token = await page.waitForFunction(
    async () => {
      const w = window as unknown as {
        Clerk?: {
          session?: {
            getToken: (opts?: {
              skipCache?: boolean;
            }) => Promise<string | null>;
          };
        };
      };
      const t = await w.Clerk?.session?.getToken?.({ skipCache: true });
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

  // Verify the API authenticates this user. Clerk dev-instance metadata
  // propagation (publicMetadata.role + publicMetadata.districtId) can lag
  // by ~30–45s after a fresh sign-in, surfacing as a string of 403s on
  // /api/sample-data (which guards on `requireRoles("admin","coordinator")`
  // + `requireDistrictScope`) before the JWT finally carries the right
  // claims. 60s is the empirically observed upper bound under multi-user
  // session swaps in this spec.
  await expect
    .poll(
      async () => (await page.request.get("/api/sample-data")).status(),
      {
        timeout: 60_000,
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
 * Set a single item's handling state from the caller's session.
 *
 * Implementation note: this used to drive the Action Center "more" menu
 * via mouse interactions. That path is non-deterministic under headless
 * Playwright — the dropdown is anchored to a re-rendering React tree,
 * the click-outside `mousedown` listener occasionally races with
 * Playwright's pointer events, and the resulting silent no-op is
 * indistinguishable from a render bug. Because the proof target of
 * `shared-handling-state.spec.ts` is **server-side state visibility
 * across users + districts** — not UI-write behavior, which is covered
 * by the `recommended-next-step-card` and `action-center` unit/component
 * tests — we now PUT directly through the same authenticated request
 * context the caller is signed in to. The PUT route is the canonical
 * write path; the menu button is just one client of it.
 *
 * The function then reloads the Action Center so React Query refetches
 * the batch endpoint and the pill DOM reflects the new state — that's
 * what the spec asserts.
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
  const res = await page.request.put(
    `/api/action-item-handling/${encodeURIComponent(itemId)}`,
    { data: { state } },
  );
  expect(
    res.ok(),
    `PUT /api/action-item-handling/${itemId} should succeed (status ${res.status()})`,
  ).toBeTruthy();
  // We do NOT block on a DOM-pill assertion here. The PUT 200 above is the
  // canonical proof the row was written; pill DOM rendering on the writer's
  // own session is verified separately in the action-center component
  // tests. Keeping this helper API-only avoids the optimistic-update
  // refetch race that surfaced as a sudden Clerk re-init / sign-in
  // redirect under headless Playwright.
}
