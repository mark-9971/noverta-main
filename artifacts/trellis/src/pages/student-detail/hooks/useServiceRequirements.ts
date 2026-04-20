import { useState } from "react";
import { toast } from "sonner";
import {
  createServiceRequirement,
  updateServiceRequirement,
  supersedeServiceRequirement,
  deleteServiceRequirement,
  type UpdateServiceRequirementBody,
} from "@workspace/api-client-react";
import { useSupersedeFlow } from "../supersede-flow";

export type SvcForm = {
  serviceTypeId: string;
  providerId: string;
  deliveryType: string;
  requiredMinutes: string;
  intervalType: string;
  startDate: string;
  endDate: string;
  priority: string;
  notes: string;
};

const EMPTY_FORM: SvcForm = {
  serviceTypeId: "",
  providerId: "",
  deliveryType: "direct",
  requiredMinutes: "",
  intervalType: "weekly",
  startDate: "",
  endDate: "",
  priority: "medium",
  notes: "",
};

export function useServiceRequirements(
  studentId: number,
  refetchStudent: () => void,
  refetchProgress: () => void,
) {
  const [svcDialogOpen, setSvcDialogOpen] = useState(false);
  const [editingSvc, setEditingSvc] = useState<any>(null);
  const [deletingSvc, setDeletingSvc] = useState<any>(null);
  const [svcSaving, setSvcSaving] = useState(false);
  const [svcForm, setSvcForm] = useState<SvcForm>(EMPTY_FORM);

  const supersedeFlow = useSupersedeFlow(supersedeServiceRequirement, () => {
    refetchStudent();
    refetchProgress();
  });

  function buildEdits(): UpdateServiceRequirementBody {
    return {
      providerId: svcForm.providerId && svcForm.providerId !== "__none" ? Number(svcForm.providerId) : null,
      deliveryType: svcForm.deliveryType,
      requiredMinutes: Number(svcForm.requiredMinutes),
      intervalType: svcForm.intervalType,
      startDate: svcForm.startDate || null,
      endDate: svcForm.endDate || null,
      priority: svcForm.priority,
      notes: svcForm.notes || null,
    };
  }

  function openAddSvc() {
    setEditingSvc(null);
    setSvcForm({ ...EMPTY_FORM, startDate: new Date().toISOString().split("T")[0] });
    setSvcDialogOpen(true);
  }

  function openEditSvc(req: any) {
    setEditingSvc(req);
    setSvcForm({
      serviceTypeId: String(req.serviceTypeId),
      providerId: req.providerId ? String(req.providerId) : "",
      deliveryType: req.deliveryType || "direct",
      requiredMinutes: String(req.requiredMinutes),
      intervalType: req.intervalType || "weekly",
      startDate: req.startDate || "",
      endDate: req.endDate || "",
      priority: req.priority || "medium",
      notes: req.notes || "",
    });
    setSvcDialogOpen(true);
  }

  async function handleSaveSvc() {
    if (!svcForm.serviceTypeId || !svcForm.requiredMinutes) {
      toast.error("Service type and minutes are required");
      return;
    }
    setSvcSaving(true);
    try {
      if (editingSvc) {
        const edits = buildEdits();
        const result = await supersedeFlow.attempt(updateServiceRequirement, editingSvc.id, edits);
        if (result.kind === "supersede") {
          // Dialog opens; close the edit dialog and let the user confirm.
          setSvcDialogOpen(false);
          setSvcSaving(false);
          return;
        }
        if (result.kind === "error") {
          throw result.error;
        }
        toast.success("Service requirement updated");
      } else {
        await createServiceRequirement({
          studentId,
          serviceTypeId: Number(svcForm.serviceTypeId),
          providerId: svcForm.providerId && svcForm.providerId !== "__none" ? Number(svcForm.providerId) : null,
          deliveryType: svcForm.deliveryType,
          requiredMinutes: Number(svcForm.requiredMinutes),
          intervalType: svcForm.intervalType,
          startDate: svcForm.startDate,
          endDate: svcForm.endDate || null,
          priority: svcForm.priority,
          notes: svcForm.notes || null,
          active: true,
        });
        toast.success("Service requirement added");
      }
      setSvcDialogOpen(false);
      refetchStudent();
      refetchProgress();
    } catch {
      toast.error("Failed to save service requirement");
    }
    setSvcSaving(false);
  }

  async function handleConfirmSupersede() {
    if (!editingSvc) return;
    if (!supersedeFlow.effectiveDate) {
      toast.error("Effective date is required");
      return;
    }
    const result = await supersedeFlow.confirm(editingSvc.id);
    if (result.ok) {
      toast.success("New service requirement started");
      setEditingSvc(null);
    } else {
      toast.error("Failed to supersede service requirement");
    }
  }

  async function handleDeleteSvc() {
    if (!deletingSvc) return;
    setSvcSaving(true);
    try {
      await deleteServiceRequirement(deletingSvc.id);
      toast.success("Service requirement deleted");
      setDeletingSvc(null);
      refetchStudent();
      refetchProgress();
    } catch {
      toast.error("Failed to delete");
    }
    setSvcSaving(false);
  }

  return {
    svcDialogOpen,
    setSvcDialogOpen,
    editingSvc,
    setEditingSvc,
    deletingSvc,
    setDeletingSvc,
    svcSaving,
    svcForm,
    setSvcForm,
    openAddSvc,
    openEditSvc,
    handleSaveSvc,
    handleDeleteSvc,
    handleConfirmSupersede,
    supersedeFlow,
  };
}
