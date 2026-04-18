import { Router, type IRouter } from "express";
import { ListMinuteProgressQueryParams } from "@workspace/api-zod";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";
import { getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { db } from "@workspace/db";
import { schoolYearsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/minute-progress", async (req, res): Promise<void> => {
  const params = ListMinuteProgressQueryParams.safeParse(req.query);
  const filters: Parameters<typeof computeAllActiveMinuteProgress>[0] = {};
  if (params.success) {
    if (params.data.studentId) filters.studentId = Number(params.data.studentId);
    if (params.data.staffId) filters.staffId = Number(params.data.staffId);
    if (params.data.serviceTypeId) filters.serviceTypeId = Number(params.data.serviceTypeId);
    if (params.data.riskStatus) filters.riskStatus = params.data.riskStatus;
    if (params.data.schoolId) filters.schoolId = Number(params.data.schoolId);
    // Token-derived district takes precedence over query param
    const enforcedDid = getEnforcedDistrictId(req as unknown as AuthedRequest);
    if (enforcedDid !== null) {
      filters.districtId = enforcedDid;
    } else if (params.data.districtId) {
      filters.districtId = Number(params.data.districtId);
    }
  }

  // Resolve school year → constrain session date window (read directly from query)
  const rawSchoolYearId = req.query.schoolYearId ? Number(req.query.schoolYearId) : undefined;
  if (rawSchoolYearId && Number.isFinite(rawSchoolYearId)) {
    const [year] = await db
      .select({ startDate: schoolYearsTable.startDate, endDate: schoolYearsTable.endDate })
      .from(schoolYearsTable)
      .where(eq(schoolYearsTable.id, rawSchoolYearId))
      .limit(1);
    if (year) {
      filters.startDate = year.startDate;
      filters.endDate = year.endDate;
    }
  }

  const progress = await computeAllActiveMinuteProgress(filters);
  res.json(progress);
});

export default router;
