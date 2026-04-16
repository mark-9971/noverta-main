import { authFetch } from "@/lib/auth-fetch";
import type { SISProvider, ServiceTypeRow, StaffInvite } from "./constants";

async function postJson(url: string, body: unknown) {
  const res = await authFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || "Request failed");
  }
  return res.json();
}

export interface SisConnectArgs {
  sisProvider: SISProvider;
  districtName: string;
  schoolNames: string[];
  csvRows: Record<string, string>[];
  sisApiUrl: string;
  sisClientId: string;
  sisClientSecret: string;
}

export function sisConnect(a: SisConnectArgs) {
  const endpoint = a.sisProvider === "csv" ? "/api/onboarding/sis-upload-csv" : "/api/onboarding/sis-connect";
  const payload = a.sisProvider === "csv"
    ? { districtName: a.districtName.trim(), rows: a.csvRows }
    : {
        provider: a.sisProvider,
        districtName: a.districtName.trim(),
        schools: a.schoolNames.filter(s => s.trim()),
        credentials: {
          apiUrl: a.sisApiUrl.trim() || undefined,
          clientId: a.sisClientId.trim() || undefined,
          clientSecret: a.sisClientSecret.trim() || undefined,
        },
      };
  return postJson(endpoint, payload);
}

export function districtConfirm(districtName: string, schoolYear: string, schools: { id?: number; name: string }[]) {
  return postJson("/api/onboarding/district-confirm", {
    districtName: districtName.trim() || "My District",
    schoolYear,
    schools,
  });
}

export function saveServiceTypes(serviceTypes: ServiceTypeRow[]) {
  return postJson("/api/onboarding/service-types", {
    serviceTypes: serviceTypes.map(st => ({
      name: st.name,
      category: st.category,
      cptCode: st.cptCode || null,
      billingRate: st.billingRate || null,
    })),
  });
}

export function inviteStaff(invites: StaffInvite[]) {
  return postJson("/api/onboarding/invite-staff", { invites });
}
