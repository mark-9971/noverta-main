import { useCallback, useState } from "react";
import {
  ApiError,
  type RequiresSupersedeError,
  type UpdateServiceRequirementBody,
  type SupersedeServiceRequirementBody,
} from "@workspace/api-client-react";

export type SupersedeTrigger = {
  creditedSessionCount: number;
  pendingEdits: UpdateServiceRequirementBody;
  effectiveDate: string;
};

export type AttemptUpdateResult =
  | { kind: "ok" }
  | { kind: "supersede"; trigger: SupersedeTrigger }
  | { kind: "error"; error: unknown };

export type UpdateServiceRequirementFn = (
  id: number,
  body: UpdateServiceRequirementBody,
) => Promise<unknown>;

export type SupersedeServiceRequirementFn = (
  id: number,
  body: SupersedeServiceRequirementBody,
) => Promise<unknown>;

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export async function attemptUpdateOrDetectSupersede(
  updateFn: UpdateServiceRequirementFn,
  id: number,
  edits: UpdateServiceRequirementBody,
  today: () => string = todayIso,
): Promise<AttemptUpdateResult> {
  try {
    await updateFn(id, edits);
    return { kind: "ok" };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const data = err.data as RequiresSupersedeError | null;
      if (data?.code === "REQUIRES_SUPERSEDE") {
        return {
          kind: "supersede",
          trigger: {
            creditedSessionCount: data.credited_session_count ?? 0,
            pendingEdits: edits,
            effectiveDate: edits.startDate || today(),
          },
        };
      }
    }
    return { kind: "error", error: err };
  }
}

export function buildSupersedeBody(
  edits: UpdateServiceRequirementBody,
  supersedeDate: string,
): SupersedeServiceRequirementBody {
  const {
    providerId,
    deliveryType,
    requiredMinutes,
    intervalType,
    endDate,
    priority,
    notes,
  } = edits;
  return {
    supersedeDate,
    providerId,
    deliveryType,
    requiredMinutes,
    intervalType,
    endDate,
    priority,
    notes,
  };
}

export async function performSupersede(
  supersedeFn: SupersedeServiceRequirementFn,
  id: number,
  pendingEdits: UpdateServiceRequirementBody,
  supersedeDate: string,
): Promise<void> {
  const body = buildSupersedeBody(pendingEdits, supersedeDate);
  await supersedeFn(id, body);
}

export type SupersedeFlow = {
  isOpen: boolean;
  isSaving: boolean;
  creditedCount: number;
  pendingEdits: UpdateServiceRequirementBody | null;
  effectiveDate: string;
  setEffectiveDate: (date: string) => void;
  attempt: (
    updateFn: UpdateServiceRequirementFn,
    id: number,
    edits: UpdateServiceRequirementBody,
  ) => Promise<AttemptUpdateResult>;
  confirm: (id: number) => Promise<{ ok: boolean }>;
  close: () => void;
};

export function useSupersedeFlow(
  supersedeFn: SupersedeServiceRequirementFn,
  refresh: () => void,
): SupersedeFlow {
  const [isOpen, setOpen] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [creditedCount, setCreditedCount] = useState(0);
  const [pendingEdits, setPendingEdits] = useState<UpdateServiceRequirementBody | null>(null);
  const [effectiveDate, setEffectiveDate] = useState<string>("");

  const attempt = useCallback<SupersedeFlow["attempt"]>(
    async (updateFn, id, edits) => {
      const result = await attemptUpdateOrDetectSupersede(updateFn, id, edits);
      if (result.kind === "supersede") {
        setCreditedCount(result.trigger.creditedSessionCount);
        setPendingEdits(result.trigger.pendingEdits);
        setEffectiveDate(result.trigger.effectiveDate);
        setOpen(true);
      }
      return result;
    },
    [],
  );

  const confirm = useCallback<SupersedeFlow["confirm"]>(
    async (id) => {
      if (!pendingEdits || !effectiveDate) return { ok: false };
      setSaving(true);
      try {
        await performSupersede(supersedeFn, id, pendingEdits, effectiveDate);
        setOpen(false);
        setPendingEdits(null);
        refresh();
        return { ok: true };
      } catch {
        return { ok: false };
      } finally {
        setSaving(false);
      }
    },
    [supersedeFn, refresh, pendingEdits, effectiveDate],
  );

  const close = useCallback(() => {
    setOpen(false);
    setPendingEdits(null);
  }, []);

  return {
    isOpen,
    isSaving,
    creditedCount,
    pendingEdits,
    effectiveDate,
    setEffectiveDate,
    attempt,
    confirm,
    close,
  };
}
