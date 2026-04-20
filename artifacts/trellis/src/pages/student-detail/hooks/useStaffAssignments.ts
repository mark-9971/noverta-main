import { useState } from "react";
import { toast } from "sonner";
import { createStaffAssignment, deleteStaffAssignment } from "@workspace/api-client-react";

export type AssignForm = {
  staffId: string;
  assignmentType: string;
  startDate: string;
  endDate: string;
  notes: string;
};

const EMPTY_FORM: AssignForm = {
  staffId: "",
  assignmentType: "service_provider",
  startDate: "",
  endDate: "",
  notes: "",
};

export function useStaffAssignments(studentId: number, refetchStudent: () => void) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignForm, setAssignForm] = useState<AssignForm>(EMPTY_FORM);

  async function handleAddAssignment() {
    if (!assignForm.staffId || !assignForm.assignmentType) {
      toast.error("Staff and assignment type required");
      return;
    }
    setAssignSaving(true);
    try {
      await createStaffAssignment({
        staffId: Number(assignForm.staffId),
        studentId,
        assignmentType: assignForm.assignmentType,
        startDate: assignForm.startDate || null,
        endDate: assignForm.endDate || null,
        notes: assignForm.notes || null,
      });
      toast.success("Staff assigned");
      setAssignDialogOpen(false);
      refetchStudent();
    } catch {
      toast.error("Failed to assign staff");
    }
    setAssignSaving(false);
  }

  async function handleRemoveAssignment(id: number) {
    try {
      await deleteStaffAssignment(id);
      toast.success("Assignment removed");
      refetchStudent();
    } catch {
      toast.error("Failed to remove assignment");
    }
  }

  function openAssignDialog() {
    setAssignForm(EMPTY_FORM);
    setAssignDialogOpen(true);
  }

  return {
    assignDialogOpen,
    setAssignDialogOpen,
    assignSaving,
    assignForm,
    setAssignForm,
    handleAddAssignment,
    handleRemoveAssignment,
    openAssignDialog,
  };
}
