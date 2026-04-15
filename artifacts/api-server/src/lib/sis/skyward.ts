import type { SisConnector, SisStudentRecord, SisStaffRecord } from "./types";

export class SkywardConnector implements SisConnector {
  readonly provider = "skyward";

  async testConnection(credentials: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const { baseUrl, apiKey, apiSecret } = credentials as {
      baseUrl?: string;
      apiKey?: string;
      apiSecret?: string;
    };

    if (!baseUrl || !apiKey || !apiSecret) {
      return { ok: false, message: "Missing required fields: baseUrl, apiKey, apiSecret" };
    }

    try {
      const res = await fetch(`${baseUrl}/api/v1/status`, {
        headers: {
          "X-API-Key": apiKey,
          "X-API-Secret": apiSecret,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        return { ok: true, message: "Connected to Skyward successfully" };
      }
      const text = await res.text().catch(() => "");
      return { ok: false, message: `Skyward returned ${res.status}: ${text.slice(0, 200)}` };
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
      const { baseUrl, apiKey, apiSecret } = credentials as {
        baseUrl: string;
        apiKey: string;
        apiSecret: string;
      };

      const res = await fetch(`${baseUrl}/api/v1/students?enrollmentStatus=Active`, {
        headers: {
          "X-API-Key": apiKey,
          "X-API-Secret": apiSecret,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        errors.push({ message: `Skyward students API returned ${res.status}` });
        return { records: [], errors };
      }

      const data = await res.json() as Array<{
        studentID?: string;
        nameFirst?: string;
        nameLast?: string;
        gradeLevel?: string;
        birthDate?: string;
        schoolID?: string;
        enrollStatus?: string;
      }>;

      const records: SisStudentRecord[] = (data ?? []).map((s) => ({
        externalId: s.studentID ?? "",
        firstName: s.nameFirst ?? "",
        lastName: s.nameLast ?? "",
        grade: s.gradeLevel,
        dateOfBirth: s.birthDate,
        schoolExternalId: s.schoolID,
        enrollmentStatus: (s.enrollStatus?.toLowerCase() === "active" ? "active" : "inactive") as "active" | "inactive",
      }));

      return { records, errors };
    } catch (err: unknown) {
      errors.push({ message: `Skyward student fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }

  async fetchStaff(credentials: Record<string, unknown>): Promise<{
    records: SisStaffRecord[];
    errors: Array<{ field?: string; message: string }>;
  }> {
    const errors: Array<{ field?: string; message: string }> = [];
    try {
      const { baseUrl, apiKey, apiSecret } = credentials as {
        baseUrl: string;
        apiKey: string;
        apiSecret: string;
      };

      const res = await fetch(`${baseUrl}/api/v1/employees?status=Active`, {
        headers: {
          "X-API-Key": apiKey,
          "X-API-Secret": apiSecret,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        errors.push({ message: `Skyward staff API returned ${res.status}` });
        return { records: [], errors };
      }

      const data = await res.json() as Array<{
        employeeID?: string;
        nameFirst?: string;
        nameLast?: string;
        email?: string;
        jobTitle?: string;
        schoolID?: string;
      }>;

      const records: SisStaffRecord[] = (data ?? []).map((s) => ({
        externalId: s.employeeID ?? "",
        firstName: s.nameFirst ?? "",
        lastName: s.nameLast ?? "",
        email: s.email,
        title: s.jobTitle,
        schoolExternalId: s.schoolID,
        status: "active" as const,
      }));

      return { records, errors };
    } catch (err: unknown) {
      errors.push({ message: `Skyward staff fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }
}
