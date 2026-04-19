import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Smoke check: walks the canonical showcase routes signed in as an admin
 * and fails if React emits any `validateDOMNesting` warning or hydration
 * mismatch error. These are normally only visible if a developer happens
 * to have the browser console open while clicking around — this spec
 * makes them blocking in CI so we catch things like a `<Skeleton>` (a
 * `<div>`) rendered inside a `<p>` before they ship.
 *
 * Routes mirror the showcase tour (artifacts/trellis/src/components/
 * ShowcaseTour.tsx) plus a couple of extras from SampleDataTour.
 */

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

const ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: "/", label: "dashboard" },
  { path: "/compliance-risk-report", label: "compliance risk report" },
  { path: "/iep-builder", label: "IEP builder" },
  { path: "/progress-reports", label: "progress reports" },
  { path: "/parent-communication", label: "parent communication" },
  { path: "/protective-measures", label: "protective measures" },
  { path: "/compensatory-services", label: "compensatory services" },
  { path: "/medicaid-billing", label: "medicaid billing" },
  { path: "/settings?tab=sis", label: "settings (SIS sync)" },
  { path: "/reports", label: "reports" },
];

/**
 * React's invalid-nesting / hydration warnings are emitted via
 * `console.error`. Match on the canonical message fragments so we don't
 * pick up unrelated errors (which other specs already exercise).
 */
const NESTING_WARNING_PATTERNS: RegExp[] = [
  /validateDOMNesting/i,
  /In HTML, <[^>]+> cannot be a (?:child|descendant) of <[^>]+>/i,
  /cannot (?:appear|contain) as a (?:child|descendant) of/i,
  /Hydration failed because/i,
  /There was an error while hydrating/i,
  /did not match\..*server/i,
];

function isNestingWarning(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error" && msg.type() !== "warning") return false;
  const text = msg.text();
  return NESTING_WARNING_PATTERNS.some((re) => re.test(text));
}

/**
 * Best-effort sample-data provisioning. Sample data makes more of the
 * dashboard render (and therefore exercises more components for nesting
 * warnings), but the smoke is still useful on empty states — the
 * original CostRiskPanel bug fired from the loading skeleton itself.
 * So we try to provision and warn on failure rather than hard-fail.
 */
async function tryEnsureSampleData(page: Page): Promise<void> {
  try {
    const statusRes = await page.request.get("/api/sample-data");
    if (!statusRes.ok()) {
      console.warn(
        `[nesting-smoke] GET /api/sample-data returned ${statusRes.status()} — proceeding without sample data.`,
      );
      return;
    }
    const status = (await statusRes.json()) as {
      hasSampleData: boolean;
      sampleStudents: number;
    };
    if (status.hasSampleData && status.sampleStudents > 0) return;
    const postRes = await page.request.post("/api/sample-data");
    if (!postRes.ok()) {
      console.warn(
        `[nesting-smoke] POST /api/sample-data returned ${postRes.status()} — proceeding without sample data.`,
      );
      return;
    }
    await expect
      .poll(
        async () => {
          const r = await page.request.get("/api/sample-data");
          if (!r.ok()) return false;
          const body = (await r.json()) as { hasSampleData: boolean };
          return body.hasSampleData;
        },
        { timeout: 120_000 },
      )
      .toBe(true);
  } catch (err) {
    console.warn(
      `[nesting-smoke] sample-data provisioning failed; proceeding without it: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

test.describe("HTML nesting / hydration warnings", () => {
  test("showcase routes load without validateDOMNesting or hydration warnings", async ({
    page,
  }) => {
    const violations: Array<{ route: string; text: string }> = [];

    page.on("console", (msg) => {
      if (isNestingWarning(msg)) {
        violations.push({
          route: page.url(),
          text: msg.text(),
        });
      }
    });
    page.on("pageerror", (err) => {
      const text = err.message ?? String(err);
      if (NESTING_WARNING_PATTERNS.some((re) => re.test(text))) {
        violations.push({ route: page.url(), text });
      }
    });

    await setupClerkTestingToken({ page });
    await page.goto("/setup");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });

    await page.goto("/");
    await expect(
      page
        .locator(
          '[data-testid="section-overall-compliance"], [data-tour-id="readiness-checklist"]',
        )
        .first(),
    ).toBeVisible({ timeout: 60_000 });

    await tryEnsureSampleData(page);

    for (const { path, label } of ROUTES) {
      await test.step(`${label} (${path})`, async () => {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        // Give async data + suspense fallbacks (which often render the
        // <Skeleton> placeholders that triggered the original bug) time
        // to mount and warn before we move on.
        await page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {
            /* networkidle isn't critical — we just want time for warnings */
          });
        await page.waitForTimeout(1_500);
      });
    }

    if (violations.length > 0) {
      const summary = violations
        .map((v, i) => `  ${i + 1}. [${v.route}] ${v.text}`)
        .join("\n");
      throw new Error(
        `Detected ${violations.length} HTML-nesting / hydration warning(s):\n${summary}`,
      );
    }
  });
});
