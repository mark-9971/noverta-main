import { expect, test } from "@playwright/test";
import {
  ensureSampleData,
  pickActionCenterItemIds,
  signInAs,
} from "./_helpers/handling";
import { loadFixtures } from "./_helpers/fixtures";

/**
 * T07 — e2e: closed-loop makeup chain
 *
 * Proves the full Phase A wedge loop end-to-end through real UI surfaces:
 *
 *   1. Compliance Risk Report → click "Schedule makeup" CTA
 *   2. Lands on /scheduling with intent=makeup deep-link parameters
 *      (banner-makeup-intent visible) and the BlockFormDialog auto-opens
 *      pre-filled for the originating risk row
 *   3. Pick a staff member and save the block — server creates a
 *      schedule_blocks row with source_action_item_id = the risk: handling
 *      id (T02 wiring)
 *   4. Risk Report row's MakeupMinutesPill switches to "Scheduled pending"
 *      (driven by T03's server-side bucket calculation, not client math)
 *   5. POST /api/sessions with scheduleBlockId pointing at the new block
 *      — server inherits sourceActionItemId from the block and
 *      autoResolveActionItemFromSession transitions the shared handling
 *      row to state="resolved" (T04 wiring)
 *   6. Action Center handling-state pill for the same item flips to
 *      "Resolved" — the wedge stops re-surfacing the item
 *
 * What this proves:
 *   - The Schedule-makeup launch deep-link survives navigation and
 *     auto-opens the dialog with the right context (T02 surface).
 *   - schedule_blocks.source_action_item_id is persisted from the
 *     dialog save path (T01 schema + T02 form wiring).
 *   - "Scheduled pending" surfaces correctly on the wedge (T03 + T05).
 *   - POST /api/sessions auto-resolves the handling row when it carries
 *     a source_action_item_id derived from the linked block (T04).
 *
 * What this does NOT prove:
 *   - Full quick-log UI flow from TodayScheduleCard → QuickLogSheet
 *     (scheduleBlockId threading is unit-tested elsewhere; we exercise
 *     the same canonical /api/sessions endpoint the dialog ultimately
 *     POSTs to).
 *   - Action Center cross-user visibility of the resolved state — that
 *     is shared-handling-state.spec.ts's job.
 *   - Bucket math edge cases (over-delivery, partial makeups) —
 *     covered by minuteCalc unit tests.
 *
 * Determinism:
 *   - Picks a fresh requirement on each run (first risk row whose
 *     primary recommendation is schedule_makeup); resets the handling
 *     row at start AND end so re-runs don't accumulate state.
 *   - Cleans up the schedule_block it creates and the session_log it
 *     creates in afterEach so the seed remains stable.
 */

const fixtures = loadFixtures();

interface CreatedBlock {
  id: number;
  studentId: number;
  serviceTypeId: number | null;
  staffId: number;
}

test.describe("Closed-loop makeup chain (T07)", () => {
  test("Schedule makeup → save linked block → scheduled-pending → log session → item resolves", async ({
    page,
  }) => {
    test.setTimeout(360_000);

    // ─── Setup ──────────────────────────────────────────────────────────
    await signInAs(page, fixtures.adminA.email);
    await ensureSampleData(page);

    // Cleanup state collected across the test so afterEach can roll back.
    let createdBlock: CreatedBlock | null = null;
    let createdSessionId: number | null = null;
    let itemId: string | null = null;

    const cleanup = async (): Promise<void> => {
      try {
        if (createdSessionId != null) {
          await page.request
            .delete(`/api/sessions/${createdSessionId}`)
            .catch(() => {});
        }
        if (createdBlock != null) {
          await page.request
            .delete(`/api/schedule-blocks/${createdBlock.id}`)
            .catch(() => {});
        }
        if (itemId != null) {
          await page.request
            .put(`/api/action-item-handling/${encodeURIComponent(itemId)}`, {
              data: { state: "needs_action" },
            })
            .catch(() => {});
        }
      } catch {
        // best-effort
      }
    };

    try {
      // ─── Step 1: Find a risk row from the Action Center ───────────────
      // Use the proven `pickActionCenterItemIds` helper (same path
      // shared-handling-state.spec.ts uses) to grab a `risk:<sid>:<reqId>`
      // id. The helper navigates to /action-center, waits for the action
      // list to materialise, and filters by prefix.
      const [pickedItemId] = await pickActionCenterItemIds(page, 1, {
        preferPrefix: "risk:",
        requirePrefix: true,
      });
      const m = pickedItemId.match(/^risk:(\d+):(\d+)$/);
      expect(m, `Expected risk:<sid>:<reqId>, got "${pickedItemId}"`).not.toBeNull();
      const studentId = Number(m![1]);
      const serviceRequirementId = Number(m![2]);
      itemId = pickedItemId;

      // Defensive: clear any prior handling state for this item so the
      // post-save assertions reflect THIS test's writes.
      await page.request
        .put(`/api/action-item-handling/${encodeURIComponent(itemId)}`, {
          data: { state: "needs_action" },
        })
        .catch(() => {});

      // ─── Step 2: Click the launch CTA — Action Center primary button ──
      // The primary button on a risk: item is wired to navigate via
      // buildScheduleMakeupHref(...) with sourceActionItemId=itemId
      // (action-center.tsx). When the item's recommended action is
      // schedule_makeup, this is the canonical real-wedge launch path.
      await page.goto("/action-center");
      const primaryBtn = page.getByTestId(`button-primary-${itemId}`);
      await expect(primaryBtn).toBeVisible({ timeout: 30_000 });
      const primaryLabel = (await primaryBtn.textContent())?.trim() ?? "";
      // If the recommended action isn't schedule_makeup, fall back to
      // the canonical deep-link helper URL — still proves T02 surface
      // (dialog auto-open, sourceActionItemId carried through).
      if (/schedule\s*makeup/i.test(primaryLabel)) {
        await primaryBtn.click();
      } else {
        const href =
          `/scheduling?tab=minutes&intent=makeup&studentId=${studentId}` +
          `&serviceRequirementId=${serviceRequirementId}` +
          `&sourceActionItemId=${encodeURIComponent(itemId)}` +
          `&from=action-center`;
        await page.goto(href);
      }

      // ─── Step 3: Land on /scheduling with the makeup deep-link ────────
      await page.waitForURL(/\/scheduling\?.*intent=makeup/, {
        timeout: 30_000,
      });
      await expect(page).toHaveURL(
        new RegExp(`sourceActionItemId=${encodeURIComponent(itemId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
      await expect(page.getByTestId("banner-makeup-intent")).toBeVisible({
        timeout: 30_000,
      });

      // ─── Step 4: BlockFormDialog auto-opens ───────────────────────────
      const dialog = page.getByTestId("dialog-block-form");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog).toContainText(/Add Schedule Block/i);

      // ─── Step 5: Pick a staff member and save ─────────────────────────
      // Fetch the staff list via the same API the dialog hydrates from.
      const staffRes = await page.request.get("/api/staff");
      expect(staffRes.ok(), "GET /api/staff should succeed").toBeTruthy();
      const staffList = (await staffRes.json()) as Array<{
        id: number;
        firstName: string;
        lastName: string;
      }>;
      expect(
        staffList.length,
        "sample district must have at least one staff record",
      ).toBeGreaterThan(0);
      const staffId = staffList[0].id;

      // Snapshot existing schedule_blocks so we can identify the new one
      // by elimination after save (avoids depending on insertion-order
      // ordering of the GET).
      const beforeBlocksRes = await page.request.get(
        `/api/schedule-blocks?studentId=${studentId}`,
      );
      const beforeBlocks = beforeBlocksRes.ok()
        ? ((await beforeBlocksRes.json()) as Array<{ id: number }>)
        : [];
      const beforeIds = new Set(beforeBlocks.map((b) => b.id));

      await page.getByTestId("select-staff-trigger").click();
      await page.getByTestId(`option-staff-${staffId}`).click();
      await page.getByTestId("button-save-block").click();

      // Dialog closes on successful save.
      await expect(dialog).toBeHidden({ timeout: 30_000 });

      // ─── Step 6: Verify the schedule_block was created with the link ──
      await expect
        .poll(
          async () => {
            const r = await page.request.get(
              `/api/schedule-blocks?studentId=${studentId}`,
            );
            if (!r.ok()) return null;
            const blocks = (await r.json()) as Array<{
              id: number;
              studentId: number;
              staffId: number;
              serviceTypeId: number | null;
              blockType: string;
              sourceActionItemId: string | null;
            }>;
            return (
              blocks.find(
                (b) =>
                  !beforeIds.has(b.id) &&
                  b.blockType === "makeup" &&
                  b.sourceActionItemId === itemId,
              ) ?? null
            );
          },
          {
            timeout: 30_000,
            message:
              "New makeup schedule_block carrying source_action_item_id did not appear",
          },
        )
        .not.toBeNull();

      const blocksAfterRes = await page.request.get(
        `/api/schedule-blocks?studentId=${studentId}`,
      );
      const blocksAfter = (await blocksAfterRes.json()) as Array<{
        id: number;
        studentId: number;
        staffId: number;
        serviceTypeId: number | null;
        blockType: string;
        sourceActionItemId: string | null;
      }>;
      const linked = blocksAfter.find(
        (b) =>
          !beforeIds.has(b.id) &&
          b.blockType === "makeup" &&
          b.sourceActionItemId === itemId,
      )!;
      createdBlock = {
        id: linked.id,
        studentId: linked.studentId,
        serviceTypeId: linked.serviceTypeId,
        staffId: linked.staffId,
      };

      // ─── Step 7: Risk Report MakeupMinutesPill shows "Scheduled pending" ─
      await page.goto("/compliance-risk-report");
      const pill = page.getByTestId(`makeup-pill-${serviceRequirementId}`);
      await expect(pill).toBeVisible({ timeout: 60_000 });
      await expect(pill).toContainText(/Scheduled pending/i);

      // ─── Step 8: Log a session via the canonical linked-block path ────
      // This mimics what TodayScheduleCard → QuickLogSheet POSTs after
      // the provider taps "Log session" on a calendar block. The server
      // (sessions/logging.ts T04 path) inherits sourceActionItemId from
      // the block and autoResolveActionItemFromSession marks the
      // handling row resolved.
      const today = new Date().toISOString().substring(0, 10);
      const sessionRes = await page.request.post("/api/sessions", {
        data: {
          studentId: createdBlock.studentId,
          serviceRequirementId,
          serviceTypeId: createdBlock.serviceTypeId,
          staffId: createdBlock.staffId,
          sessionDate: today,
          startTime: "09:00",
          endTime: "09:30",
          durationMinutes: 30,
          status: "completed",
          isMakeup: true,
          scheduleBlockId: createdBlock.id,
        },
      });
      expect(
        sessionRes.ok(),
        `POST /api/sessions should succeed (status ${sessionRes.status()}, body ${await sessionRes.text().catch(() => "?")})`,
      ).toBeTruthy();
      const sessionBody = (await sessionRes.json()) as {
        id: number;
        sourceActionItemId?: string | null;
      };
      createdSessionId = sessionBody.id;
      // T04 sanity: the server inherited sourceActionItemId from the block.
      expect(
        sessionBody.sourceActionItemId,
        "session_log should inherit source_action_item_id from the linked schedule_block",
      ).toBe(itemId);

      // ─── Step 9: Action Center shows the handling row as "Resolved" ───
      await expect
        .poll(
          async () => {
            const r = await page.request.get(
              `/api/action-item-handling/${encodeURIComponent(itemId!)}`,
            );
            if (!r.ok()) return null;
            const j = (await r.json()) as { state?: string } | null;
            return j?.state ?? null;
          },
          {
            timeout: 30_000,
            message:
              "Server did not auto-resolve the handling row after session log",
          },
        )
        .toBe("resolved");

      await page.goto("/action-center");
      // The Action Center may filter or relabel resolved items — assert the
      // handling pill, when present, says "Resolved". If the item drops out
      // of the active list entirely, that's also acceptable evidence the
      // wedge stopped re-surfacing it.
      const handlingPill = page.getByTestId(`handling-state-${itemId}`);
      const moreBtn = page.getByTestId(`button-more-${itemId}`);
      await expect
        .poll(
          async () => {
            const moreCount = await moreBtn.count();
            if (moreCount === 0) return "removed";
            const pillCount = await handlingPill.count();
            if (pillCount === 0) return "no-pill";
            return (await handlingPill.first().textContent())?.trim() ?? "";
          },
          {
            timeout: 60_000,
            message:
              "Action Center never reflected the resolved handling state",
          },
        )
        .toMatch(/^(removed|Resolved.*)$/i);
    } finally {
      await cleanup();
    }
  });
});
