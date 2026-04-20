/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import {
  ApiError,
  type RequiresSupersedeError,
  type UpdateServiceRequirementBody,
} from "@workspace/api-client-react";
import { useSupersedeFlow } from "../src/pages/student-detail/supersede-flow";
import SupersedeDialog from "../src/pages/student-detail/SupersedeDialog";

function makeApiError(status: number, body: unknown): ApiError {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
  return new ApiError(response, body, {
    method: "PATCH",
    url: "/api/service-requirements/42",
  });
}

const baseEdits: UpdateServiceRequirementBody = {
  providerId: 7,
  deliveryType: "direct",
  requiredMinutes: 90,
  intervalType: "weekly",
  startDate: "2025-09-01",
  endDate: null,
  priority: "high",
  notes: "increase minutes",
};

type HarnessProps = {
  updateFn: (id: number, body: UpdateServiceRequirementBody) => Promise<unknown>;
  supersedeFn: (id: number, body: unknown) => Promise<unknown>;
  refresh: () => void;
  serviceRequirementId: number;
  edits?: UpdateServiceRequirementBody;
};

/**
 * A tiny page-style harness that mirrors how `student-detail.tsx` wires the
 * supersede flow: it owns the editing target, calls `flow.attempt` from a
 * "save" button, and renders <SupersedeDialog> with `flow.confirm` on confirm.
 * Asserting against this harness gives us page-level coverage of the modal
 * flow without having to mount the full 1600-line StudentDetail page.
 */
function Harness({
  updateFn,
  supersedeFn,
  refresh,
  serviceRequirementId,
  edits = baseEdits,
}: HarnessProps) {
  const flow = useSupersedeFlow(supersedeFn, refresh);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const result = await flow.attempt(updateFn, serviceRequirementId, edits);
    if (result.kind === "error") setError("save_failed");
  }

  async function handleConfirm() {
    const result = await flow.confirm(serviceRequirementId);
    if (!result.ok) setError("confirm_failed");
  }

  return (
    <div>
      <button onClick={handleSave}>Save edits</button>
      {error ? <div data-testid="harness-error">{error}</div> : null}
      <SupersedeDialog flow={flow} onConfirm={handleConfirm} />
    </div>
  );
}

describe("StudentDetail supersede modal flow (page-level)", () => {
  beforeEach(() => {
    cleanup();
  });

  it("opens the supersede modal with the attempted edits prefilled when the API returns 409 REQUIRES_SUPERSEDE", async () => {
    const supersedeBody: RequiresSupersedeError = {
      error: "Conflict",
      code: "REQUIRES_SUPERSEDE",
      requires_supersede: true,
      credited_session_count: 3,
    };
    const updateFn = vi.fn().mockRejectedValue(makeApiError(409, supersedeBody));
    const supersedeFn = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn();

    render(
      <Harness
        updateFn={updateFn}
        supersedeFn={supersedeFn}
        refresh={refresh}
        serviceRequirementId={42}
      />,
    );

    // Modal is initially closed.
    expect(screen.queryByText("This requirement has delivered minutes")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText("Save edits"));
    });

    // Modal opens with the credited-count message and the attempted edits prefilled.
    await waitFor(() => {
      expect(screen.getByText("This requirement has delivered minutes")).toBeTruthy();
    });
    expect(screen.getByText(/3 sessions have already been credited/i)).toBeTruthy();

    // Pending edits block reflects the values the user attempted to save.
    const pendingEditsBlock = screen.getByText("Pending changes").parentElement!;
    expect(pendingEditsBlock.textContent).toContain("Minutes:");
    expect(pendingEditsBlock.textContent).toContain("90");
    expect(pendingEditsBlock.textContent).toContain("weekly");
    expect(pendingEditsBlock.textContent).toContain("direct");
    expect(pendingEditsBlock.textContent).toContain("high");

    // Effective date input is prefilled from the attempted edits' startDate.
    const dateInput = screen.getByLabelText(
      "New requirement effective date",
    ) as HTMLInputElement;
    expect(dateInput.value).toBe("2025-09-01");

    // No supersede call yet; the user hasn't confirmed.
    expect(supersedeFn).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("confirming the modal POSTs to the supersede endpoint with the chosen effective date and refreshes the page", async () => {
    const supersedeBody: RequiresSupersedeError = {
      error: "Conflict",
      code: "REQUIRES_SUPERSEDE",
      requires_supersede: true,
      credited_session_count: 1,
    };
    const updateFn = vi.fn().mockRejectedValue(makeApiError(409, supersedeBody));

    // Stand in for the real `supersedeServiceRequirement` api-client function.
    // We assert on the args so we know the page would POST the right body to
    // /api/service-requirements/:id/supersede.
    const supersedeFn = vi.fn().mockResolvedValue({ ok: true });
    const refresh = vi.fn();

    render(
      <Harness
        updateFn={updateFn}
        supersedeFn={supersedeFn}
        refresh={refresh}
        serviceRequirementId={42}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Save edits"));
    });
    await waitFor(() =>
      expect(screen.getByText("This requirement has delivered minutes")).toBeTruthy(),
    );

    // User picks a different effective date than the original startDate.
    const dateInput = screen.getByLabelText(
      "New requirement effective date",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: "2025-10-15" } });
    });
    expect(dateInput.value).toBe("2025-10-15");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start new requirement" }));
    });

    // The supersede api-client function is called with the chosen effective
    // date and the pending edits — this is what becomes the
    // POST /api/service-requirements/:id/supersede body.
    await waitFor(() => expect(supersedeFn).toHaveBeenCalledTimes(1));
    expect(supersedeFn).toHaveBeenCalledWith(42, {
      supersedeDate: "2025-10-15",
      providerId: 7,
      deliveryType: "direct",
      requiredMinutes: 90,
      intervalType: "weekly",
      endDate: null,
      priority: "high",
      notes: "increase minutes",
    });

    // Page refresh callback (refetchStudent + refetchProgress in StudentDetail)
    // fires after a successful confirm.
    expect(refresh).toHaveBeenCalledTimes(1);

    // Modal closes after a successful confirm.
    await waitFor(() =>
      expect(screen.queryByText("This requirement has delivered minutes")).toBeNull(),
    );
  });

  it("does not refresh the page when the supersede call fails", async () => {
    const supersedeBody: RequiresSupersedeError = {
      error: "Conflict",
      code: "REQUIRES_SUPERSEDE",
      requires_supersede: true,
      credited_session_count: 2,
    };
    const updateFn = vi.fn().mockRejectedValue(makeApiError(409, supersedeBody));
    const supersedeFn = vi.fn().mockRejectedValue(new Error("network down"));
    const refresh = vi.fn();

    render(
      <Harness
        updateFn={updateFn}
        supersedeFn={supersedeFn}
        refresh={refresh}
        serviceRequirementId={42}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Save edits"));
    });
    await waitFor(() =>
      expect(screen.getByText("This requirement has delivered minutes")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start new requirement" }));
    });

    await waitFor(() => expect(supersedeFn).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
    expect(await screen.findByTestId("harness-error")).toBeTruthy();
    // Modal stays open so the user can retry or cancel.
    expect(screen.getByText("This requirement has delivered minutes")).toBeTruthy();
  });
});
