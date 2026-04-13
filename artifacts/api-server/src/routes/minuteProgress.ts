import { Router, type IRouter } from "express";
import { ListMinuteProgressQueryParams } from "@workspace/api-zod";
import { computeAllActiveMinuteProgress } from "../lib/minuteCalc";

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
    if (params.data.districtId) filters.districtId = Number(params.data.districtId);
  }

  const progress = await computeAllActiveMinuteProgress(filters);
  res.json(progress);
});

export default router;
