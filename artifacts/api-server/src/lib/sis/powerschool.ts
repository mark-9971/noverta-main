import type { SisConnector, SisStudentRecord, SisStaffRecord } from "./types";

export class PowerSchoolConnector implements SisConnector {
  readonly provider = "powerschool";

  async testConnection(credentials: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const { baseUrl, clientId, clientSecret } = credentials as {
      baseUrl?: string;
      clientId?: string;
      clientSecret?: string;
    };

    if (!baseUrl || !clientId || !clientSecret) {
      return { ok: false, message: "Missing required fields: baseUrl, clientId, clientSecret" };
    }

    try {
      const tokenUrl = `${baseUrl}/oauth/access_token`;
      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${authHeader}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        return { ok: true, message: "Connected to PowerSchool successfully" };
      }
      const text = await res.text().catch(() => "");
      return { ok: false, message: `PowerSchool returned ${res.status}: ${text.slice(0, 200)}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: `Connection failed: ${msg}` };
    }
  }

  private async getAccessToken(credentials: Record<string, unknown>): Promise<string> {
    const { baseUrl, clientId, clientSecret } = credentials as {
      baseUrl: string;
      clientId: string;
      clientSecret: string;
    };

    const tokenUrl = `${baseUrl}/oauth/access_token`;
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`PowerSchool auth failed: ${res.status}`);
    const data = await res.json() as { access_token: string };
    return data.access_token;
  }

  async fetchStudents(credentials: Record<string, unknown>): Promise<{
    records: SisStudentRecord[];
    errors: Array<{ field?: string; message: string }>;
  }> {
    const errors: Array<{ field?: string; message: string }> = [];
    try {
      const token = await this.getAccessToken(credentials);
      const baseUrl = credentials.baseUrl as string;

      const res = await fetch(
        `${baseUrl}/ws/v1/district/student?expansions=demographics,addresses,ethnicity_race&q=school_enrollment.enroll_status==A`,
        {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!res.ok) {
        errors.push({ message: `PowerSchool students API returned ${res.status}` });
        return { records: [], errors };
      }

      const data = await res.json() as {
        students: { student: Array<{
          id: number;
          local_id?: number;
          name?: { first_name?: string; last_name?: string };
          demographics?: { birth_date?: string; gender?: string };
          school_enrollment?: { grade_level?: number; school_id?: number; enroll_status?: string };
        }> };
      };

      const students = data.students?.student ?? [];
      const records: SisStudentRecord[] = students.map((s) => ({
        externalId: String(s.local_id ?? s.id),
        firstName: s.name?.first_name ?? "",
        lastName: s.name?.last_name ?? "",
        grade: s.school_enrollment?.grade_level != null ? String(s.school_enrollment.grade_level) : undefined,
        dateOfBirth: s.demographics?.birth_date,
        schoolExternalId: s.school_enrollment?.school_id ? String(s.school_enrollment.school_id) : undefined,
        enrollmentStatus: "active" as const,
      }));

      return { records, errors };
    } catch (err: unknown) {
      errors.push({ message: `PowerSchool student fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }

  async fetchStaff(credentials: Record<string, unknown>): Promise<{
    records: SisStaffRecord[];
    errors: Array<{ field?: string; message: string }>;
  }> {
    const errors: Array<{ field?: string; message: string }> = [];
    try {
      const token = await this.getAccessToken(credentials);
      const baseUrl = credentials.baseUrl as string;

      const res = await fetch(
        `${baseUrl}/ws/v1/district/staff?q=staff_status==1`,
        {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!res.ok) {
        errors.push({ message: `PowerSchool staff API returned ${res.status}` });
        return { records: [], errors };
      }

      const data = await res.json() as {
        staffs: { staff: Array<{
          id: number;
          name?: { first_name?: string; last_name?: string };
          emails?: { work_email?: string };
          school_affiliations?: { school_id?: number };
          title?: string;
        }> };
      };

      const staffList = data.staffs?.staff ?? [];
      const records: SisStaffRecord[] = staffList.map((s) => ({
        externalId: String(s.id),
        firstName: s.name?.first_name ?? "",
        lastName: s.name?.last_name ?? "",
        email: s.emails?.work_email,
        title: s.title,
        schoolExternalId: s.school_affiliations?.school_id ? String(s.school_affiliations.school_id) : undefined,
        status: "active" as const,
      }));

      return { records, errors };
    } catch (err: unknown) {
      errors.push({ message: `PowerSchool staff fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }
}
