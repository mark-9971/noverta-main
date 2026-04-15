import type { SisConnector, SisStudentRecord, SisStaffRecord, SisAttendanceRecord, SisFetchResult } from "./types";

export class InfiniteCampusConnector implements SisConnector {
  readonly provider = "infinite_campus";

  async testConnection(credentials: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const { baseUrl, apiToken } = credentials as { baseUrl?: string; apiToken?: string };

    if (!baseUrl || !apiToken) {
      return { ok: false, message: "Missing required fields: baseUrl, apiToken" };
    }

    try {
      const res = await fetch(`${baseUrl}/api/v1/schools`, {
        headers: { "Authorization": `Bearer ${apiToken}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        return { ok: true, message: "Connected to Infinite Campus successfully" };
      }
      const text = await res.text().catch(() => "");
      return { ok: false, message: `Infinite Campus returned ${res.status}: ${text.slice(0, 200)}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: `Connection failed: ${msg}` };
    }
  }

  async fetchStudents(credentials: Record<string, unknown>): Promise<{
    records: SisStudentRecord[];
    errors: Array<{ field?: string; message: string }>;
  }> {
    const errors: Array<{ field?: string; message: string }> = [];
    try {
      const { baseUrl, apiToken } = credentials as { baseUrl: string; apiToken: string };

      const res = await fetch(`${baseUrl}/api/v1/students?status=active`, {
        headers: { "Authorization": `Bearer ${apiToken}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        errors.push({ message: `Infinite Campus students API returned ${res.status}` });
        return { records: [], errors };
      }

      const data = await res.json() as Array<{
        studentNumber?: string;
        firstName?: string;
        lastName?: string;
        grade?: string;
        birthDate?: string;
        schoolID?: string;
        enrollmentStatus?: string;
        disability?: string;
        primaryLanguage?: string;
      }>;

      const records: SisStudentRecord[] = (data ?? []).map((s) => ({
        externalId: s.studentNumber ?? "",
        firstName: s.firstName ?? "",
        lastName: s.lastName ?? "",
        grade: s.grade,
        dateOfBirth: s.birthDate,
        schoolExternalId: s.schoolID,
        enrollmentStatus: (s.enrollmentStatus === "active" ? "active" : "inactive") as "active" | "inactive",
        disabilityCategory: s.disability,
        primaryLanguage: s.primaryLanguage,
      }));

      return { records, errors };
    } catch (err: unknown) {
      errors.push({ message: `Infinite Campus student fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }

  async fetchStaff(credentials: Record<string, unknown>): Promise<{
    records: SisStaffRecord[];
    errors: Array<{ field?: string; message: string }>;
  }> {
    const errors: Array<{ field?: string; message: string }> = [];
    try {
      const { baseUrl, apiToken } = credentials as { baseUrl: string; apiToken: string };

      const res = await fetch(`${baseUrl}/api/v1/staff?status=active`, {
        headers: { "Authorization": `Bearer ${apiToken}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        errors.push({ message: `Infinite Campus staff API returned ${res.status}` });
        return { records: [], errors };
      }

      const data = await res.json() as Array<{
        staffNumber?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        title?: string;
        schoolID?: string;
      }>;

      const records: SisStaffRecord[] = (data ?? []).map((s) => ({
        externalId: s.staffNumber ?? "",
        firstName: s.firstName ?? "",
        lastName: s.lastName ?? "",
        email: s.email,
        title: s.title,
        schoolExternalId: s.schoolID,
        status: "active" as const,
      }));

      return { records, errors };
    } catch (err: unknown) {
      errors.push({ message: `Infinite Campus staff fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }

  async fetchAttendance(credentials: Record<string, unknown>, dateFrom: string, dateTo: string): Promise<SisFetchResult<SisAttendanceRecord>> {
    const errors: Array<{ field?: string; message: string }> = [];
    try {
      const { baseUrl, apiToken } = credentials as { baseUrl: string; apiToken: string };

      const res = await fetch(`${baseUrl}/api/v1/attendance?startDate=${dateFrom}&endDate=${dateTo}`, {
        headers: { "Authorization": `Bearer ${apiToken}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        errors.push({ message: `Infinite Campus attendance API returned ${res.status}` });
        return { records: [], errors };
      }

      const data = await res.json() as Array<{
        studentNumber?: string;
        date?: string;
        status?: string;
      }>;

      const statusMap: Record<string, "present" | "absent" | "tardy" | "excused"> = {
        present: "present", absent: "absent", tardy: "tardy", excused: "excused",
      };

      const records: SisAttendanceRecord[] = (data ?? []).map((a) => ({
        studentExternalId: a.studentNumber ?? "",
        date: a.date ?? "",
        status: statusMap[a.status?.toLowerCase() ?? ""] ?? "present",
      }));

      return { records, errors };
    } catch (err: unknown) {
      errors.push({ message: `Infinite Campus attendance fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }
}
