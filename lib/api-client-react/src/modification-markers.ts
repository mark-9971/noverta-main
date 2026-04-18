import { customFetch } from "./custom-fetch";

export interface ProtocolModificationMarker {
  id: number;
  behaviorTargetId: number | null;
  programTargetId: number | null;
  markerDate: string;
  markerType: string;
  label: string;
  notes: string | null;
  createdAt: string;
}

export interface CreateModificationMarkerBody {
  markerDate: string;
  markerType: string;
  label: string;
  notes?: string;
}

export const listBehaviorTargetModificationMarkers = (
  targetId: number,
): Promise<ProtocolModificationMarker[]> =>
  customFetch<ProtocolModificationMarker[]>(
    `/api/behavior-targets/${targetId}/modification-markers`,
    { method: "GET" },
  );

export const createBehaviorTargetModificationMarker = (
  targetId: number,
  body: CreateModificationMarkerBody,
): Promise<ProtocolModificationMarker> =>
  customFetch<ProtocolModificationMarker>(
    `/api/behavior-targets/${targetId}/modification-markers`,
    { method: "POST", body: JSON.stringify(body) },
  );

export const listProgramTargetModificationMarkers = (
  targetId: number,
): Promise<ProtocolModificationMarker[]> =>
  customFetch<ProtocolModificationMarker[]>(
    `/api/program-targets/${targetId}/modification-markers`,
    { method: "GET" },
  );

export const createProgramTargetModificationMarker = (
  targetId: number,
  body: CreateModificationMarkerBody,
): Promise<ProtocolModificationMarker> =>
  customFetch<ProtocolModificationMarker>(
    `/api/program-targets/${targetId}/modification-markers`,
    { method: "POST", body: JSON.stringify(body) },
  );

export const deleteModificationMarker = (id: number): Promise<{ ok: boolean }> =>
  customFetch<{ ok: boolean }>(`/api/modification-markers/${id}`, { method: "DELETE" });
