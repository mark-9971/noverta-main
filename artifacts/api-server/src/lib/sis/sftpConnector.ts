import type { SisConnector, SisStudentRecord, SisStaffRecord, SisAttendanceRecord, SisFetchResult } from "./types";
import { CsvConnector } from "./csvConnector";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const csvParser = new CsvConnector();

export class SftpConnector implements SisConnector {
  readonly provider = "sftp";

  async testConnection(credentials: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const { dropPath } = credentials as { dropPath?: string };

    if (!dropPath) {
      return { ok: false, message: "Missing required field: dropPath (local directory for SFTP file drops)" };
    }

    if (!existsSync(dropPath)) {
      return { ok: false, message: `Drop directory does not exist: ${dropPath}` };
    }

    return { ok: true, message: `SFTP drop directory found: ${dropPath}` };
  }

  async fetchStudents(credentials: Record<string, unknown>): Promise<SisFetchResult<SisStudentRecord>> {
    const errors: Array<{ field?: string; message: string }> = [];
    try {
      const { dropPath } = credentials as { dropPath: string };
      const csvText = this.readLatestCsv(dropPath, "students");

      if (!csvText) {
        errors.push({ message: "No student CSV found in SFTP drop directory" });
        return { records: [], errors };
      }

      const result = csvParser.parseStudentCsv(csvText);
      return { records: result.records, errors: [...errors, ...result.errors] };
    } catch (err: unknown) {
      errors.push({ message: `SFTP student fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }

  async fetchStaff(credentials: Record<string, unknown>): Promise<SisFetchResult<SisStaffRecord>> {
    const errors: Array<{ field?: string; message: string }> = [];
    try {
      const { dropPath } = credentials as { dropPath: string };
      const csvText = this.readLatestCsv(dropPath, "staff");

      if (!csvText) {
        errors.push({ message: "No staff CSV found in SFTP drop directory" });
        return { records: [], errors };
      }

      const result = csvParser.parseStaffCsv(csvText);
      return { records: result.records, errors: [...errors, ...result.errors] };
    } catch (err: unknown) {
      errors.push({ message: `SFTP staff fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` });
      return { records: [], errors };
    }
  }

  async fetchAttendance(_credentials: Record<string, unknown>, _dateFrom: string, _dateTo: string): Promise<SisFetchResult<SisAttendanceRecord>> {
    return { records: [], errors: [{ message: "Attendance import via SFTP is not yet supported" }] };
  }

  private readLatestCsv(dropPath: string, prefix: string): string | null {
    if (!existsSync(dropPath)) return null;

    const files = readdirSync(dropPath)
      .filter((f) => f.toLowerCase().startsWith(prefix) && f.toLowerCase().endsWith(".csv"))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    return readFileSync(join(dropPath, files[0]), "utf-8");
  }
}
