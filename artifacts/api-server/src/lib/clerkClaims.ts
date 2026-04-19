import { z } from "zod";
import { getAuth, clerkClient } from "@clerk/express";
import type { Request } from "express";

const clerkPublicMetaSchema = z.object({
  role: z.string().optional(),
  name: z.string().optional(),
  staffId: z.number().optional(),
  studentId: z.number().optional(),
  guardianId: z.number().optional(),
  districtId: z.number().optional(),
  platformAdmin: z.boolean().optional(),
}).catch({});

export interface ClerkPublicMeta {
  role?: string;
  name?: string;
  staffId?: number;
  studentId?: number;
  guardianId?: number;
  districtId?: number;
  platformAdmin?: boolean;
}

export function getPublicMeta(req: Request): ClerkPublicMeta {
  const auth = getAuth(req);
  const raw = (auth?.sessionClaims as Record<string, unknown> | undefined)?.publicMetadata;
  return clerkPublicMetaSchema.parse(raw ?? {});
}

export function getClerkUserId(req: Request): string | null {
  return getAuth(req)?.userId ?? null;
}

// Cache publicMetadata fetched from Clerk to avoid hammering the Backend API on
// every terminal-state transition. Default Clerk JWTs do not include
// publicMetadata in sessionClaims, so handlers that need staffId / studentId /
// guardianId must fall back to a one-off `users.getUser()` lookup.
const userMetaCache = new Map<string, { meta: ClerkPublicMeta; ts: number }>();
const META_CACHE_TTL_MS = 30_000;

export async function getPublicMetaAsync(req: Request): Promise<ClerkPublicMeta> {
  const sync = getPublicMeta(req);
  if (
    sync.staffId !== undefined ||
    sync.studentId !== undefined ||
    sync.guardianId !== undefined ||
    sync.platformAdmin === true
  ) {
    return sync;
  }
  const userId = getClerkUserId(req);
  if (!userId) return sync;

  const now = Date.now();
  const cached = userMetaCache.get(userId);
  if (cached && now - cached.ts < META_CACHE_TTL_MS) return cached.meta;

  try {
    const user = await clerkClient.users.getUser(userId);
    const fetched = clerkPublicMetaSchema.parse(user.publicMetadata ?? {});
    const merged: ClerkPublicMeta = { ...sync, ...fetched };
    userMetaCache.set(userId, { meta: merged, ts: now });
    return merged;
  } catch {
    return sync;
  }
}
