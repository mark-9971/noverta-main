import { useQuery } from "@tanstack/react-query";
import { authFetch } from "./auth-fetch";

export type SisConnectionRow = {
  id: number;
  provider: string;
  label: string;
  status: string;
  enabled: boolean;
};

export type SisConnectionState = {
  connected: boolean;
  vendor: string | null;
  loading: boolean;
};

/**
 * Single source of truth for "is an SIS wired up for this district".
 * Surfaces gated on this hook should hide manual entry / banners that
 * the SIS owns (medical alerts, demographics, guardians, etc.) once a
 * connection is live, so Noverta never contradicts the SIS of record.
 *
 * A district is considered SIS-connected iff at least one connection
 * row exists with status="connected" AND enabled !== false. Disabled
 * or never-tested connections do not count.
 */
export function useSisConnection(): SisConnectionState {
  const { data, isLoading } = useQuery<SisConnectionRow[]>({
    queryKey: ["sis-connection-state"],
    queryFn: async () => {
      const res = await authFetch("/api/sis/connections");
      if (!res.ok) return [];
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    },
    staleTime: 5 * 60_000,
  });

  const live = (data ?? []).find(
    (c) => c.enabled !== false && c.status === "connected",
  );

  return {
    connected: Boolean(live),
    vendor: live?.provider ?? null,
    loading: isLoading,
  };
}
