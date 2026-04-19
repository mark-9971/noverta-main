import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireRoles } from "../middlewares/auth";
import { assertStudentAccess, getStudentSchoolId, tenantUploadPrefix } from "../lib/tenantAccess";
import { db, uploadQuotasTable } from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import type { AuthedRequest } from "../middlewares/auth";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const DAILY_DISTRICT_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB per district per day

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Common aliases
  "image/jpg",
  "application/octet-stream", // generic fallback allowed for uploads validated by extension
]);

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES, {
    message: `File size must not exceed ${MAX_FILE_SIZE_BYTES} bytes (25 MB)`,
  }),
  contentType: z.string(),
  studentId: z.number().int().positive(),
});

const RequestUploadUrlResponse = z.object({
  uploadURL: z.string(),
  objectPath: z.string(),
  metadata: z.object({
    name: z.string(),
    size: z.number(),
    contentType: z.string(),
  }),
});

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const PRIVILEGED_ROLES = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider"] as const;

/**
 * Returns today's ISO date string (YYYY-MM-DD) in UTC.
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atomically adds `bytes` to the district's daily upload quota and returns
 * the new total. Uses INSERT ... ON CONFLICT DO UPDATE so it is safe under
 * concurrent requests.
 */
async function incrementUploadQuota(districtId: number, bytes: number): Promise<number> {
  const quotaDate = todayUtc();
  const [row] = await db
    .insert(uploadQuotasTable)
    .values({
      districtId,
      quotaDate,
      uploadedBytes: bytes,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: [uploadQuotasTable.districtId, uploadQuotasTable.quotaDate],
      set: {
        uploadedBytes: sql`upload_quotas.uploaded_bytes + ${bytes}`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row?.uploadedBytes ?? bytes;
}

/**
 * Reads the current daily upload total for a district without incrementing it.
 */
async function getCurrentUploadQuota(districtId: number): Promise<number> {
  const quotaDate = todayUtc();
  const [row] = await db
    .select({ uploadedBytes: uploadQuotasTable.uploadedBytes })
    .from(uploadQuotasTable)
    .where(
      and(
        eq(uploadQuotasTable.districtId, districtId),
        eq(uploadQuotasTable.quotaDate, quotaDate),
      ),
    )
    .limit(1);
  return row?.uploadedBytes ?? 0;
}

router.post("/storage/uploads/request-url", requireRoles(...PRIVILEGED_ROLES), async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields", details: parsed.error.flatten() });
    return;
  }

  const { name, size, contentType, studentId } = parsed.data;

  // Enforce content-type allowlist server-side — client cannot override this.
  if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
    res.status(400).json({
      error: `Content type '${contentType}' is not permitted. Allowed types: PDF, PNG, JPG, DOCX, CSV, XLSX.`,
    });
    return;
  }

  // Double-check size limit (also validated by zod, belt-and-suspenders).
  if (size > MAX_FILE_SIZE_BYTES) {
    res.status(400).json({
      error: `File size ${size} bytes exceeds the 25 MB limit.`,
    });
    return;
  }

  if (!await assertStudentAccess(req, studentId)) {
    res.status(403).json({ error: "You don't have access to this student's records" });
    return;
  }

  // Check and enforce per-district daily upload quota.
  const districtId = await resolveDistrictIdForCaller(req);
  if (districtId !== null) {
    const currentQuota = await getCurrentUploadQuota(districtId);
    if (currentQuota + size > DAILY_DISTRICT_QUOTA_BYTES) {
      const remainingMB = Math.max(0, (DAILY_DISTRICT_QUOTA_BYTES - currentQuota) / (1024 * 1024));
      logAudit(req, {
        action: "rate_limit_exceeded",
        targetTable: "upload_quotas",
        summary: `Daily upload quota exceeded for district ${districtId}`,
        metadata: {
          districtId,
          currentQuotaBytes: currentQuota,
          requestedBytes: size,
          dailyLimitBytes: DAILY_DISTRICT_QUOTA_BYTES,
        },
      });
      res.status(429).json({
        error: `Daily upload quota exceeded. Approximately ${remainingMB.toFixed(1)} MB remaining today.`,
        retryAfter: secondsUntilMidnightUtc(),
        limit: DAILY_DISTRICT_QUOTA_BYTES,
      });
      return;
    }
  }

  try {
    const schoolId = await getStudentSchoolId(studentId);
    const prefix = schoolId !== null ? tenantUploadPrefix(schoolId, studentId) : undefined;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(prefix);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    // Record the upload bytes against the district quota now that we've issued the URL.
    if (districtId !== null) {
      await incrementUploadQuota(districtId, size).catch((err) => {
        console.error("Failed to record upload quota:", err);
      });
    }

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * Returns today's upload quota usage and the daily limit for the caller's district.
 * Used by the district settings page to display a usage indicator. Admin-only —
 * a district admin should be able to see how close their district is to the limit.
 */
router.get("/admin/upload-quota", requireRoles("admin"), async (req: Request, res: Response) => {
  const districtId = await resolveDistrictIdForCaller(req);
  if (districtId === null) {
    res.status(400).json({ error: "Your account is not linked to a district." });
    return;
  }
  const usedBytes = await getCurrentUploadQuota(districtId);
  res.json({
    districtId,
    quotaDate: todayUtc(),
    usedBytes,
    limitBytes: DAILY_DISTRICT_QUOTA_BYTES,
    remainingBytes: Math.max(0, DAILY_DISTRICT_QUOTA_BYTES - usedBytes),
  });
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Error serving public object:", error);
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/** Returns seconds until the next UTC midnight. Used for Retry-After on daily quota exhaustion. */
function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

export default router;
