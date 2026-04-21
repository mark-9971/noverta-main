/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import type {
  EmergencyContactRecord,
  MedicalAlertRecord,
} from "../src/pages/student-detail/StudentContactsMedical";

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const authFetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
vi.mock("@/lib/auth-fetch", () => ({
  authFetch: (input: string, init?: RequestInit) => authFetchMock(input, init),
}));

const apiMocks = {
  createServiceRequirement: vi.fn(),
  updateServiceRequirement: vi.fn(),
  supersedeServiceRequirement: vi.fn(),
  deleteServiceRequirement: vi.fn(),
  createStaffAssignment: vi.fn(),
  deleteStaffAssignment: vi.fn(),
  getStudentProgressSummary: vi.fn(),
  createProgressShareLink: vi.fn(),
};
vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<typeof import("@workspace/api-client-react")>(
    "@workspace/api-client-react",
  );
  return {
    ...actual,
    createServiceRequirement: (...a: Parameters<typeof actual.createServiceRequirement>) =>
      apiMocks.createServiceRequirement(...a),
    updateServiceRequirement: (...a: Parameters<typeof actual.updateServiceRequirement>) =>
      apiMocks.updateServiceRequirement(...a),
    supersedeServiceRequirement: (
      ...a: Parameters<typeof actual.supersedeServiceRequirement>
    ) => apiMocks.supersedeServiceRequirement(...a),
    deleteServiceRequirement: (...a: Parameters<typeof actual.deleteServiceRequirement>) =>
      apiMocks.deleteServiceRequirement(...a),
    createStaffAssignment: (...a: Parameters<typeof actual.createStaffAssignment>) =>
      apiMocks.createStaffAssignment(...a),
    deleteStaffAssignment: (...a: Parameters<typeof actual.deleteStaffAssignment>) =>
      apiMocks.deleteStaffAssignment(...a),
    getStudentProgressSummary: (
      ...a: Parameters<typeof actual.getStudentProgressSummary>
    ) => apiMocks.getStudentProgressSummary(...a),
    createProgressShareLink: (...a: Parameters<typeof actual.createProgressShareLink>) =>
      apiMocks.createProgressShareLink(...a),
  };
});

import { toast } from "sonner";
import { useEmergencyContacts } from "../src/pages/student-detail/hooks/useEmergencyContacts";
import { useMedicalAlerts } from "../src/pages/student-detail/hooks/useMedicalAlerts";
import { useEnrollmentEvents } from "../src/pages/student-detail/hooks/useEnrollmentEvents";
import { useStudentArchive } from "../src/pages/student-detail/hooks/useStudentArchive";
import { useStaffAssignments } from "../src/pages/student-detail/hooks/useStaffAssignments";
import { useShareProgress } from "../src/pages/student-detail/hooks/useShareProgress";
import { useStudentMessageGuardians } from "../src/pages/student-detail/hooks/useStudentMessageGuardians";
import { useServiceRequirements } from "../src/pages/student-detail/hooks/useServiceRequirements";

function okResponse(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
function badResponse(status = 500): Response {
  return new Response("err", { status });
}

beforeEach(() => {
  vi.clearAllMocks();
  authFetchMock.mockReset();
  cleanup();
});

// ─── useEmergencyContacts ─────────────────────────────────────────────────

describe("useEmergencyContacts", () => {
  it("loads contacts on mount and saves a new one (happy path)", async () => {
    const initial: Partial<EmergencyContactRecord>[] = [
      { id: 1, firstName: "A", lastName: "B" },
    ];
    authFetchMock.mockResolvedValueOnce(okResponse(initial)); // initial load
    const { result } = renderHook(() => useEmergencyContacts(5, true));
    await waitFor(() => expect(result.current.emergencyContacts).toEqual(initial));

    // Open add and fill form
    act(() => result.current.openAddEc());
    expect(result.current.ecDialogOpen).toBe(true);
    act(() =>
      result.current.setEcForm({
        firstName: "Pat",
        lastName: "Doe",
        relationship: "parent",
        phone: "555",
        phoneSecondary: "",
        email: "",
        isAuthorizedForPickup: false,
        priority: 1,
        notes: "",
      }),
    );

    // Save: POST then reload
    authFetchMock.mockResolvedValueOnce(okResponse()); // POST
    authFetchMock.mockResolvedValueOnce(okResponse([{ id: 2 }])); // reload
    await act(async () => {
      await result.current.handleSaveEc();
    });
    expect(toast.success).toHaveBeenCalledWith("Contact added");
    expect(result.current.ecDialogOpen).toBe(false);
    expect(result.current.emergencyContacts).toEqual([{ id: 2 }]);
    const [url, init] = authFetchMock.mock.calls[1];
    expect(url).toBe("/api/students/5/emergency-contacts");
    expect(init.method).toBe("POST");
  });

  it("shows an error toast when required fields are missing (error path)", async () => {
    authFetchMock.mockResolvedValueOnce(okResponse([]));
    const { result } = renderHook(() => useEmergencyContacts(5, true));
    await waitFor(() => expect(result.current.emergencyContactsLoading).toBe(false));

    await act(async () => {
      await result.current.handleSaveEc();
    });
    expect(toast.error).toHaveBeenCalledWith(
      "First name, last name, relationship, and phone are required",
    );
    // No POST should have been issued (only the initial GET).
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─── useMedicalAlerts ─────────────────────────────────────────────────────

describe("useMedicalAlerts", () => {
  it("deletes an alert and reloads (happy path)", async () => {
    authFetchMock.mockResolvedValueOnce(okResponse([{ id: 11 }])); // initial load
    const { result } = renderHook(() => useMedicalAlerts(7, true));
    await waitFor(() => expect(result.current.medicalAlerts.length).toBe(1));

    authFetchMock.mockResolvedValueOnce(okResponse()); // DELETE
    authFetchMock.mockResolvedValueOnce(okResponse([])); // reload
    const alertStub = { id: 11 } as Pick<MedicalAlertRecord, "id"> as MedicalAlertRecord;
    await act(async () => {
      await result.current.handleDeleteMa(alertStub);
    });
    expect(toast.success).toHaveBeenCalledWith("Alert removed");
    expect(authFetchMock.mock.calls[1][0]).toBe("/api/medical-alerts/11");
    expect(authFetchMock.mock.calls[1][1].method).toBe("DELETE");
    expect(result.current.medicalAlerts).toEqual([]);
  });

  it("shows an error toast when the api delete fails (error path)", async () => {
    authFetchMock.mockResolvedValueOnce(okResponse([{ id: 12 }]));
    const { result } = renderHook(() => useMedicalAlerts(7, true));
    await waitFor(() => expect(result.current.medicalAlerts.length).toBe(1));

    authFetchMock.mockResolvedValueOnce(badResponse(500));
    const alertStub = { id: 12 } as Pick<MedicalAlertRecord, "id"> as MedicalAlertRecord;
    await act(async () => {
      await result.current.handleDeleteMa(alertStub);
    });
    expect(toast.error).toHaveBeenCalledWith("Failed to remove alert");
  });
});

// ─── useEnrollmentEvents ──────────────────────────────────────────────────

describe("useEnrollmentEvents", () => {
  it("logs a new enrollment event (happy path)", async () => {
    authFetchMock.mockResolvedValueOnce(okResponse([])); // load
    const { result } = renderHook(() => useEnrollmentEvents(3, true));
    await waitFor(() => expect(result.current.enrollmentLoading).toBe(false));

    act(() => result.current.openAddEvent());
    act(() =>
      result.current.setAddEventForm({
        eventType: "note",
        eventDate: "2025-09-01",
        reasonCode: "",
        reason: "",
        notes: "first day",
      }),
    );

    authFetchMock.mockResolvedValueOnce(okResponse()); // POST
    authFetchMock.mockResolvedValueOnce(okResponse([{ id: 99 }])); // reload
    await act(async () => {
      await result.current.handleAddEvent();
    });
    expect(toast.success).toHaveBeenCalledWith("Enrollment event logged");
    expect(result.current.addEventDialogOpen).toBe(false);
    const postCall = authFetchMock.mock.calls[1];
    expect(postCall[0]).toBe("/api/students/3/enrollment");
    expect(postCall[1].method).toBe("POST");
    expect(JSON.parse(postCall[1].body)).toMatchObject({
      eventType: "note",
      eventDate: "2025-09-01",
      notes: "first day",
    });
  });

  it("rejects when required fields are missing (error path)", async () => {
    authFetchMock.mockResolvedValueOnce(okResponse([]));
    const { result } = renderHook(() => useEnrollmentEvents(3, true));
    await waitFor(() => expect(result.current.enrollmentLoading).toBe(false));

    await act(async () => {
      await result.current.handleAddEvent();
    });
    expect(toast.error).toHaveBeenCalledWith("Event type and date are required");
    expect(authFetchMock).toHaveBeenCalledTimes(1); // only the initial load
  });
});

// ─── useStudentArchive ────────────────────────────────────────────────────

describe("useStudentArchive", () => {
  it("archives the student and reloads enrollment (happy path)", async () => {
    const refetchStudent = vi.fn();
    const reloadEnrollment = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useStudentArchive(8, refetchStudent, reloadEnrollment),
    );

    act(() => {
      result.current.setArchiveDialogOpen(true);
      result.current.setArchiveReason("moved");
    });

    authFetchMock.mockResolvedValueOnce(okResponse());
    await act(async () => {
      await result.current.handleArchive();
    });
    expect(toast.success).toHaveBeenCalledWith("Student archived");
    expect(refetchStudent).toHaveBeenCalledTimes(1);
    expect(reloadEnrollment).toHaveBeenCalledTimes(1);
    expect(result.current.archiveDialogOpen).toBe(false);
    expect(result.current.archiveReason).toBe("");
    const [url, init] = authFetchMock.mock.calls[0];
    expect(url).toBe("/api/students/8/archive");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason: "moved" });
  });

  it("shows an error toast when reactivate fails (error path)", async () => {
    const refetchStudent = vi.fn();
    const reloadEnrollment = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useStudentArchive(8, refetchStudent, reloadEnrollment),
    );

    authFetchMock.mockResolvedValueOnce(badResponse(500));
    await act(async () => {
      await result.current.handleReactivate();
    });
    expect(toast.error).toHaveBeenCalledWith("Failed to reactivate student");
    expect(refetchStudent).not.toHaveBeenCalled();
  });
});

// ─── useStaffAssignments ──────────────────────────────────────────────────

describe("useStaffAssignments", () => {
  it("creates a staff assignment with normalized fields (happy path)", async () => {
    const refetchStudent = vi.fn();
    const { result } = renderHook(() => useStaffAssignments(50, refetchStudent));

    act(() => result.current.openAssignDialog());
    act(() =>
      result.current.setAssignForm({
        staffId: "21",
        assignmentType: "service_provider",
        startDate: "2025-09-01",
        endDate: "",
        notes: "",
      }),
    );

    apiMocks.createStaffAssignment.mockResolvedValueOnce({ id: 1 });
    await act(async () => {
      await result.current.handleAddAssignment();
    });
    expect(toast.success).toHaveBeenCalledWith("Staff assigned");
    expect(apiMocks.createStaffAssignment).toHaveBeenCalledWith({
      staffId: 21,
      studentId: 50,
      assignmentType: "service_provider",
      startDate: "2025-09-01",
      endDate: null,
      notes: null,
    });
    expect(result.current.assignDialogOpen).toBe(false);
    expect(refetchStudent).toHaveBeenCalledTimes(1);
  });

  it("shows an error toast when remove fails (error path)", async () => {
    const refetchStudent = vi.fn();
    const { result } = renderHook(() => useStaffAssignments(50, refetchStudent));

    apiMocks.deleteStaffAssignment.mockRejectedValueOnce(new Error("nope"));
    await act(async () => {
      await result.current.handleRemoveAssignment(99);
    });
    expect(toast.error).toHaveBeenCalledWith("Failed to remove assignment");
    expect(refetchStudent).not.toHaveBeenCalled();
  });
});

// ─── useShareProgress ────────────────────────────────────────────────────

describe("useShareProgress", () => {
  it("generates an absolute share link on success (happy path)", async () => {
    const { result } = renderHook(() => useShareProgress(42));
    apiMocks.createProgressShareLink.mockResolvedValueOnce({ url: "/share/abc" });
    await act(async () => {
      await result.current.generateShareLink();
    });
    expect(result.current.shareLink).toBe(`${window.location.origin}/share/abc`);
    expect(toast.success).toHaveBeenCalledWith(
      "Share link generated (expires in 72 hours)",
    );
  });

  it("loads the progress summary and clears the loading flag (error path)", async () => {
    const { result } = renderHook(() => useShareProgress(42));
    apiMocks.getStudentProgressSummary.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.handleShareProgress();
    });
    // Modal opens but summary stays null when the api fails.
    expect(result.current.showShareModal).toBe(true);
    expect(result.current.shareSummary).toBeNull();
    expect(result.current.shareLoading).toBe(false);
  });
});

// ─── useStudentMessageGuardians ───────────────────────────────────────────

describe("useStudentMessageGuardians", () => {
  it("loads guardians from the api when enabled (happy path)", async () => {
    const guardians = [{ id: 1, name: "G", relationship: "parent", email: null }];
    authFetchMock.mockResolvedValueOnce(okResponse(guardians));
    const { result } = renderHook(() => useStudentMessageGuardians(7, true));
    await waitFor(() => expect(result.current).toEqual(guardians));
    expect(authFetchMock.mock.calls[0][0]).toBe("/api/students/7/guardians");
  });

  it("returns an empty array when the api responds with non-2xx (error path)", async () => {
    authFetchMock.mockResolvedValueOnce(badResponse(500));
    const { result } = renderHook(() => useStudentMessageGuardians(7, true));
    // Give the effect a tick to run; there is nothing to await on directly.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual([]);
  });

  it("does not fetch when disabled", () => {
    renderHook(() => useStudentMessageGuardians(7, false));
    expect(authFetchMock).not.toHaveBeenCalled();
  });
});

// ─── useServiceRequirements ───────────────────────────────────────────────

describe("useServiceRequirements", () => {
  function setForm(result: { current: ReturnType<typeof useServiceRequirements> }) {
    act(() =>
      result.current.setSvcForm({
        serviceTypeId: "3",
        providerId: "7",
        deliveryType: "direct",
        requiredMinutes: "60",
        intervalType: "weekly",
        startDate: "2025-09-01",
        endDate: "",
        priority: "high",
        notes: "",
      }),
    );
  }

  it("creates a new service requirement and refetches dashboards (happy path)", async () => {
    const refetchStudent = vi.fn();
    const refetchProgress = vi.fn();
    const { result } = renderHook(() =>
      useServiceRequirements(42, refetchStudent, refetchProgress),
    );
    setForm(result);

    apiMocks.createServiceRequirement.mockResolvedValueOnce({ id: 1 });
    await act(async () => {
      await result.current.handleSaveSvc();
    });
    expect(toast.success).toHaveBeenCalledWith("Service requirement added");
    expect(apiMocks.createServiceRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 42,
        serviceTypeId: 3,
        providerId: 7,
        requiredMinutes: 60,
        intervalType: "weekly",
        startDate: "2025-09-01",
        priority: "high",
        active: true,
      }),
    );
    expect(refetchStudent).toHaveBeenCalledTimes(1);
    expect(refetchProgress).toHaveBeenCalledTimes(1);
    expect(result.current.svcDialogOpen).toBe(false);
  });

  it("rejects without service type or required minutes (error path)", async () => {
    const { result } = renderHook(() =>
      useServiceRequirements(42, vi.fn(), vi.fn()),
    );
    await act(async () => {
      await result.current.handleSaveSvc();
    });
    expect(toast.error).toHaveBeenCalledWith("Service type and minutes are required");
    expect(apiMocks.createServiceRequirement).not.toHaveBeenCalled();
  });

  it("deletes a service requirement and refetches (happy path)", async () => {
    const refetchStudent = vi.fn();
    const refetchProgress = vi.fn();
    const { result } = renderHook(() =>
      useServiceRequirements(42, refetchStudent, refetchProgress),
    );
    act(() => result.current.setDeletingSvc({ id: 33 }));

    apiMocks.deleteServiceRequirement.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.handleDeleteSvc();
    });
    expect(apiMocks.deleteServiceRequirement).toHaveBeenCalledWith(33);
    expect(toast.success).toHaveBeenCalledWith("Service requirement deleted");
    expect(refetchStudent).toHaveBeenCalledTimes(1);
    expect(refetchProgress).toHaveBeenCalledTimes(1);
    expect(result.current.deletingSvc).toBeNull();
  });
});
