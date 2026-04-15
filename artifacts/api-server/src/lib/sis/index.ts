import type { SisConnector, SisProvider } from "./types";
import { PowerSchoolConnector } from "./powerschool";
import { InfiniteCampusConnector } from "./infiniteCampus";
import { SkywardConnector } from "./skyward";
import { CsvConnector } from "./csvConnector";

export type { SisConnector, SisProvider, SisStudentRecord, SisStaffRecord, SisAttendanceRecord, SisSyncResult } from "./types";

const connectors: Record<SisProvider, SisConnector> = {
  powerschool: new PowerSchoolConnector(),
  infinite_campus: new InfiniteCampusConnector(),
  skyward: new SkywardConnector(),
  csv: new CsvConnector(),
};

export function getConnector(provider: SisProvider): SisConnector {
  const connector = connectors[provider];
  if (!connector) throw new Error(`Unknown SIS provider: ${provider}`);
  return connector;
}

export function getCsvConnector(): CsvConnector {
  return connectors.csv as CsvConnector;
}

export const SUPPORTED_PROVIDERS: { key: SisProvider; label: string; description: string }[] = [
  { key: "powerschool", label: "PowerSchool", description: "Connect via PowerSchool REST API (OAuth2 client credentials)" },
  { key: "infinite_campus", label: "Infinite Campus", description: "Connect via Infinite Campus REST API" },
  { key: "skyward", label: "Skyward", description: "Connect via Skyward REST API" },
  { key: "csv", label: "CSV Upload", description: "Import student and staff rosters from CSV files" },
];
