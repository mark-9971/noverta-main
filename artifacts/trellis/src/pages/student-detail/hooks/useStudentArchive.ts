import { useState } from "react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";

export function useStudentArchive(
  studentId: number,
  refetchStudent: () => void,
  reloadEnrollment: () => Promise<void>,
) {
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [reactivateSaving, setReactivateSaving] = useState(false);

  async function handleArchive() {
    setArchiveSaving(true);
    try {
      const r = await authFetch(`/api/students/${studentId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: archiveReason || null }),
      });
      if (!r.ok) throw new Error();
      toast.success("Student archived");
      setArchiveDialogOpen(false);
      setArchiveReason("");
      refetchStudent();
      await reloadEnrollment();
    } catch {
      toast.error("Failed to archive student");
    }
    setArchiveSaving(false);
  }

  async function handleReactivate() {
    setReactivateSaving(true);
    try {
      const r = await authFetch(`/api/students/${studentId}/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error();
      toast.success("Student reactivated");
      setReactivateDialogOpen(false);
      refetchStudent();
      await reloadEnrollment();
    } catch {
      toast.error("Failed to reactivate student");
    }
    setReactivateSaving(false);
  }

  return {
    archiveDialogOpen,
    setArchiveDialogOpen,
    archiveReason,
    setArchiveReason,
    archiveSaving,
    handleArchive,
    reactivateDialogOpen,
    setReactivateDialogOpen,
    reactivateSaving,
    handleReactivate,
  };
}
