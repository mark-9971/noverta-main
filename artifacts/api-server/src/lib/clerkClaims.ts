import { z } from "zod";
import { getAuth } from "@clerk/express";
import type { Request } from "express";

const clerkPublicMetaSchema = z.object({
  role: z.string().optional(),
  name: z.string().optional(),
  staffId: z.number().optional(),
  studentId: z.number().optional(),
  districtId: z.number().optional(),
  platformAdmin: z.boolean().optional(),
}).catch({});

export interface ClerkPublicMeta {
  role?: string;
  name?: string;
  staffId?: number;
  studentId?: number;
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
