import { expect, test } from "@playwright/test";
import {
  ensureSampleData,
  pickActionCenterItemIds,
  resetHandlingState,
  setHandlingViaUI,
  signInAs,
} from "./_helpers/handling";
import { loadFixtures } from "./_helpers/fixtures";

/**
 * E2E proof that the server-side `action_item_handling` state is shared
 * across users in the rendered UI, scoped per district, and visible
 * across surfaces (Action Center ↔ Compliance Risk Report).
 *
 * Three users:
 *   - Admin A (district 1, primary slot) — performs the writes.
 *   - Admin B (district 1, primary slot) — reads, including cross-surface.
 *   - Admin C (district 2, secondary slot) — reads, must NOT see A's state.
 *
 * The spec is deterministic and idempotent: leftover handling state is
 * reset at the start AND end of the test, and sample data is seeded in
 * both districts (each is district-scoped by /api/sample-data).
 */

const fixtures = loadFixtures();

test.describe("Shared handling state across users and districts", () => {
  test("Admin B sees Admin A's handling state on Action Center and Risk Report; Admin C in another district does not", async ({
    page,
  }) => {
    test.setTimeout(360_000);

    // ─── Setup: seed sample data in both districts ──────────────────────────
    // Admin A's district (primary).
    await signInAs(page, fixtures.adminA.email);
    await ensureSampleData(page);

    // Admin C's district (secondary). Must seed separately because
    // /api/sample-data is district-scoped.
    await signInAs(page, fixtures.adminC.email);
    await ensureSampleData(page);

    // ─── Step 1: Admin A writes two handling states via the UI ──────────────
    await signInAs(page, fixtures.adminA.email);

    // We REQUIRE `risk:` ids: the cross-surface assertion is against the
    // Compliance Risk Report, which only renders handling pills for items
    // produced by `riskRowItemId(...)` (`risk:<sid>:<reqId>`). The student
    // detail page does NOT render handling pills, so risk-report is the
    // only valid second surface for this proof.
    const itemIds = await pickActionCenterItemIds(page, 2, {
      preferPrefix: "risk:",
      requirePrefix: true,
    });
    const [item1, item2] = itemIds;

    let cleanedUp = false;
    const cleanup = async (): Promise<void> => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        await signInAs(page, fixtures.adminA.email);
        await resetHandlingState(page, item1);
        await resetHandlingState(page, item2);
      } catch {
        // best-effort cleanup
      }
    };

    try {
      // Defensive: clear any prior handling state for these items so the
      // assertions reflect THIS test's writes, not a leftover from a prior run.
      await resetHandlingState(page, item1);
      await resetHandlingState(page, item2);
      // After reset we must be back on the Action Center to drive the UI.
      await page.goto("/action-center");
      await expect(page.getByTestId(`button-more-${item1}`)).toBeVisible({
        timeout: 30_000,
      });

      await setHandlingViaUI(page, item1, "awaiting_confirmation");
      await setHandlingViaUI(page, item2, "handed_off");

      // Sanity: pills are visible to Admin A right now with the EXACT
      // labels we just wrote.
      await expect(page.getByTestId(`handling-state-${item1}`)).toContainText(
        /Awaiting/i,
      );
      await expect(page.getByTestId(`handling-state-${item2}`)).toContainText(
        /Handed off/i,
      );

      // ─── Step 2: Admin B (same district) sees the SAME pills on Action Center
      await signInAs(page, fixtures.adminB.email);
      expect(
        fixtures.adminB.districtId,
        "Admin B must be in the SAME district as Admin A",
      ).toBe(fixtures.adminA.districtId);

      await page.goto("/action-center");
      await expect
        .poll(
          async () =>
            await page.locator('[data-testid^="button-more-"]').count(),
          { timeout: 60_000 },
        )
        .toBeGreaterThan(0);

      // The same item ids must render with the same handling pills, with
      // EXACTLY the labels Admin A wrote.
      await expect(page.getByTestId(`handling-state-${item1}`)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId(`handling-state-${item1}`)).toContainText(
        /Awaiting/i,
      );
      await expect(page.getByTestId(`handling-state-${item2}`)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId(`handling-state-${item2}`)).toContainText(
        /Handed off/i,
      );

      // ─── Step 3: Cross-surface — Admin B sees the SAME pills on the
      // Compliance Risk Report. Same id format, same exact labels. ─────────
      await page.goto("/compliance-risk-report");
      const reportPill1 = page.getByTestId(`handling-state-${item1}`).first();
      const reportPill2 = page.getByTestId(`handling-state-${item2}`).first();
      await expect(
        reportPill1,
        `Risk Report must render the handling pill for ${item1}`,
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        reportPill1,
        `Risk Report pill for ${item1} must show Admin A's "Awaiting" label`,
      ).toContainText(/Awaiting/i);
      await expect(
        reportPill2,
        `Risk Report must render the handling pill for ${item2}`,
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        reportPill2,
        `Risk Report pill for ${item2} must show Admin A's "Handed off" label`,
      ).toContainText(/Handed off/i);

      // ─── Step 4: Admin C (different district) must NOT see Admin A's state
      await signInAs(page, fixtures.adminC.email);
      expect(
        fixtures.adminC.districtId,
        "Admin C must be provisioned into a district",
      ).toBeTruthy();
      expect(
        fixtures.adminC.districtId,
        "Admin C must be in a DIFFERENT district from Admin A",
      ).not.toBe(fixtures.adminA.districtId);

      await page.goto("/action-center");
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {
        /* networkidle is best-effort behind the dev proxy */
      });

      // API-level proof: district-scoped GET returns no rows for A's items.
      const cRes = await page.request.get(
        `/api/action-item-handling?ids=${encodeURIComponent(item1 + "," + item2)}`,
      );
      expect(
        cRes.ok(),
        `Admin C GET /api/action-item-handling should succeed (status ${cRes.status()})`,
      ).toBeTruthy();
      const cBody = (await cRes.json()) as {
        data: Array<{ itemId: string; state: string }>;
      };
      expect(
        cBody.data,
        "Admin C must see ZERO non-default handling rows for Admin A's items (district isolation)",
      ).toEqual([]);

      // DOM-level proof on Action Center: pills for A's items must not
      // render under Admin C (default needs_action hides the pill).
      await expect(page.getByTestId(`handling-state-${item1}`)).toHaveCount(0);
      await expect(page.getByTestId(`handling-state-${item2}`)).toHaveCount(0);

      // DOM-level proof on Risk Report: same surface, same isolation.
      await page.goto("/compliance-risk-report");
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {
        /* best-effort */
      });
      await expect(page.getByTestId(`handling-state-${item1}`)).toHaveCount(0);
      await expect(page.getByTestId(`handling-state-${item2}`)).toHaveCount(0);
    } finally {
      // ─── Cleanup: reset both items so re-runs are deterministic ─────────
      await cleanup();
    }
  });
});
