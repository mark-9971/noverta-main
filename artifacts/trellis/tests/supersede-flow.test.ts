import { describe, it, expect, vi } from "vitest";
import {
  ApiError,
  type RequiresSupersedeError,
  type UpdateServiceRequirementBody,
  supersedeServiceRequirement,
} from "@workspace/api-client-react";
import {
  attemptUpdateOrDetectSupersede,
  buildSupersedeBody,
  performSupersede,
} from "../src/pages/student-detail/supersede-flow";

function makeApiError(status: number, body: unknown, url = "/api/service-requirements/42"): ApiError {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
  return new ApiError(response, body, { method: "PATCH", url });
}

const baseEdits: UpdateServiceRequirementBody = {
  providerId: 7,
  deliveryType: "direct",
  requiredMinutes: 60,
  intervalType: "weekly",
  startDate: "2025-09-01",
  endDate: null,
  priority: "high",
  notes: "increase minutes",
};

describe("attemptUpdateOrDetectSupersede", () => {
  it("opens the supersede modal with attempted edits prefilled when API returns 409 REQUIRES_SUPERSEDE", async () => {
    const supersedeBody: RequiresSupersedeError = {
      error: "Conflict",
      code: "REQUIRES_SUPERSEDE",
      requires_supersede: true,
      credited_session_count: 3,
    };
    const updateFn = vi.fn().mockRejectedValue(makeApiError(409, supersedeBody));

    const result = await attemptUpdateOrDetectSupersede(updateFn, 42, baseEdits);

    expect(updateFn).toHaveBeenCalledWith(42, baseEdits);
    expect(result.kind).toBe("supersede");
    if (result.kind !== "supersede") throw new Error("expected supersede");
    // The modal will read these fields directly to prefill its UI.
    expect(result.trigger.creditedSessionCount).toBe(3);
    expect(result.trigger.pendingEdits).toEqual(baseEdits);
    expect(result.trigger.effectiveDate).toBe("2025-09-01");
  });

  it("falls back to today's date when the attempted edits have no startDate", async () => {
    const supersedeBody: RequiresSupersedeError = {
      error: "Conflict",
      code: "REQUIRES_SUPERSEDE",
      requires_supersede: true,
      credited_session_count: 0,
    };
    const updateFn = vi.fn().mockRejectedValue(makeApiError(409, supersedeBody));
    const editsWithoutStart = { ...baseEdits, startDate: null };

    const result = await attemptUpdateOrDetectSupersede(
      updateFn,
      42,
      editsWithoutStart,
      () => "2026-04-20",
    );

    expect(result.kind).toBe("supersede");
    if (result.kind !== "supersede") throw new Error("expected supersede");
    expect(result.trigger.effectiveDate).toBe("2026-04-20");
    expect(result.trigger.creditedSessionCount).toBe(0);
  });

  it("returns ok when the update succeeds (no modal)", async () => {
    const updateFn = vi.fn().mockResolvedValue(undefined);
    const result = await attemptUpdateOrDetectSupersede(updateFn, 42, baseEdits);
    expect(result.kind).toBe("ok");
  });

  it("returns error for non-supersede API errors so the caller can surface the generic toast", async () => {
    const updateFn = vi.fn().mockRejectedValue(makeApiError(500, { error: "boom" }));
    const result = await attemptUpdateOrDetectSupersede(updateFn, 42, baseEdits);
    expect(result.kind).toBe("error");
  });

  it("returns error for 409s that are not REQUIRES_SUPERSEDE", async () => {
    const updateFn = vi.fn().mockRejectedValue(
      makeApiError(409, { error: "Conflict", code: "OTHER" }),
    );
    const result = await attemptUpdateOrDetectSupersede(updateFn, 42, baseEdits);
    expect(result.kind).toBe("error");
  });
});

describe("performSupersede", () => {
  it("calls the supersede function with the chosen effective date and pending edits", async () => {
    const supersedeFn = vi.fn().mockResolvedValue(undefined);

    await performSupersede(supersedeFn, 42, baseEdits, "2025-10-15");

    expect(supersedeFn).toHaveBeenCalledTimes(1);
    expect(supersedeFn).toHaveBeenCalledWith(42, {
      supersedeDate: "2025-10-15",
      providerId: 7,
      deliveryType: "direct",
      requiredMinutes: 60,
      intervalType: "weekly",
      endDate: null,
      priority: "high",
      notes: "increase minutes",
    });
  });

  it("propagates errors from the supersede call so the caller can show a failure toast", async () => {
    const supersedeFn = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(performSupersede(supersedeFn, 42, baseEdits, "2025-10-15")).rejects.toThrow(
      "network down",
    );
  });
});

describe("buildSupersedeBody", () => {
  it("does not forward startDate (the supersede endpoint uses supersedeDate instead)", () => {
    const body = buildSupersedeBody(baseEdits, "2025-10-15");
    expect(body).not.toHaveProperty("startDate");
    expect(body.supersedeDate).toBe("2025-10-15");
  });
});

describe("supersedeServiceRequirement (api client integration)", () => {
  it("POSTs to /api/service-requirements/:id/supersede with the chosen effective date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await performSupersede(supersedeServiceRequirement, 42, baseEdits, "2025-10-15");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/service-requirements/42/supersede");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.supersedeDate).toBe("2025-10-15");
      expect(body.providerId).toBe(7);
      expect(body.requiredMinutes).toBe(60);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
