import type { SisConnector, SisProvider } from "./types";
import { PowerSchoolConnector } from "./powerschool";
import { InfiniteCampusConnector } from "./infiniteCampus";
import { SkywardConnector } from "./skyward";
import { CsvConnector } from "./csvConnector";
import { SftpConnector } from "./sftpConnector";

export type { SisConnector, SisProvider, SisStudentRecord, SisStaffRecord, SisAttendanceRecord, SisSyncResult } from "./types";

const connectors: Record<SisProvider, SisConnector> = {
  powerschool: new PowerSchoolConnector(),
  infinite_campus: new InfiniteCampusConnector(),
  skyward: new SkywardConnector(),
  csv: new CsvConnector(),
  sftp: new SftpConnector(),
};

export function getConnector(provider: SisProvider): SisConnector {
  const connector = connectors[provider];
  if (!connector) throw new Error(`Unknown SIS provider: ${provider}`);
  return connector;
}

export function getCsvConnector(): CsvConnector {
  return connectors.csv as CsvConnector;
}

// `tier` reflects the actual readiness of each connector, mirroring
// `STATUS.md` in this same directory. The frontend uses it to render an honest
// "GA" / "Early pilot" badge instead of treating every provider as production-ready.
//   - "ga"           : verified and supported for self-serve setup today.
//   - "early_pilot"  : code path exists and a sync can be attempted, but the
//                      connector has NOT been validated against a real tenant
//                      of that vendor's SIS. Setup requires Trellis engineering
//                      to be on the call to verify field mappings.
export const SUPPORTED_PROVIDERS: {
  key: SisProvider;
  label: string;
  description: string;
  tier: "ga" | "early_pilot";
}[] = [
  { key: "csv", label: "CSV Upload", description: "Upload student and staff rosters as CSV files. Fully supported and the recommended path today.", tier: "ga" },
  { key: "powerschool", label: "PowerSchool", description: "Direct PowerSchool REST API (OAuth2). Early pilot — connector built but not yet validated against a live PowerSchool tenant.", tier: "early_pilot" },
  { key: "infinite_campus", label: "Infinite Campus", description: "Direct Infinite Campus REST API. Early pilot — connector built but not yet validated against a live Infinite Campus tenant.", tier: "early_pilot" },
  { key: "skyward", label: "Skyward", description: "Direct Skyward REST API. Early pilot — connector built but not yet validated against a live Skyward tenant.", tier: "early_pilot" },
  { key: "sftp", label: "SFTP File Drop", description: "Auto-import CSV files dropped on an SFTP path. Early pilot — works, but treat it like CSV under the hood.", tier: "early_pilot" },
];
