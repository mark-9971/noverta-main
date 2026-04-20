import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import type { EmergencyContactRecord } from "../StudentContactsMedical";

export type EcForm = {
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  phoneSecondary: string;
  email: string;
  isAuthorizedForPickup: boolean;
  priority: number;
  notes: string;
};

const EMPTY_EC_FORM: EcForm = {
  firstName: "",
  lastName: "",
  relationship: "",
  phone: "",
  phoneSecondary: "",
  email: "",
  isAuthorizedForPickup: false,
  priority: 1,
  notes: "",
};

export function useEmergencyContacts(studentId: number, enabled: boolean) {
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactRecord[]>([]);
  const [emergencyContactsLoading, setEmergencyContactsLoading] = useState(false);
  const [ecDialogOpen, setEcDialogOpen] = useState(false);
  const [editingEc, setEditingEc] = useState<EmergencyContactRecord | null>(null);
  const [ecSaving, setEcSaving] = useState(false);
  const [deletingEc, setDeletingEc] = useState<EmergencyContactRecord | null>(null);
  const [ecForm, setEcForm] = useState<EcForm>(EMPTY_EC_FORM);

  const reload = useCallback(async () => {
    const d = await authFetch(`/api/students/${studentId}/emergency-contacts`).then((r: Response) => r.json());
    setEmergencyContacts(Array.isArray(d) ? d : []);
  }, [studentId]);

  useEffect(() => {
    if (!enabled || !studentId) return;
    setEmergencyContactsLoading(true);
    authFetch(`/api/students/${studentId}/emergency-contacts`)
      .then((r: Response) => r.json())
      .then((d: EmergencyContactRecord[]) => setEmergencyContacts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setEmergencyContactsLoading(false));
  }, [enabled, studentId]);

  async function handleSaveEc() {
    if (!ecForm.firstName || !ecForm.lastName || !ecForm.relationship || !ecForm.phone) {
      toast.error("First name, last name, relationship, and phone are required");
      return;
    }
    setEcSaving(true);
    try {
      if (editingEc) {
        const r = await authFetch(`/api/emergency-contacts/${editingEc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ecForm),
        });
        if (!r.ok) throw new Error();
        toast.success("Contact updated");
      } else {
        const r = await authFetch(`/api/students/${studentId}/emergency-contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...ecForm, studentId }),
        });
        if (!r.ok) throw new Error();
        toast.success("Contact added");
      }
      setEcDialogOpen(false);
      setEditingEc(null);
      await reload();
    } catch {
      toast.error("Failed to save contact");
    }
    setEcSaving(false);
  }

  async function handleDeleteEc(contact: EmergencyContactRecord) {
    try {
      const r = await authFetch(`/api/emergency-contacts/${contact.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Contact removed");
      setDeletingEc(null);
      await reload();
    } catch {
      toast.error("Failed to remove contact");
    }
  }

  function openAddEc() {
    setEditingEc(null);
    setEcForm(EMPTY_EC_FORM);
    setEcDialogOpen(true);
  }

  function openEditEc(contact: EmergencyContactRecord) {
    setEditingEc(contact);
    setEcForm({
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      relationship: contact.relationship ?? "",
      phone: contact.phone ?? "",
      phoneSecondary: contact.phoneSecondary ?? "",
      email: contact.email ?? "",
      isAuthorizedForPickup: contact.isAuthorizedForPickup ?? false,
      priority: contact.priority ?? 1,
      notes: contact.notes ?? "",
    });
    setEcDialogOpen(true);
  }

  return {
    emergencyContacts,
    emergencyContactsLoading,
    ecDialogOpen,
    setEcDialogOpen,
    editingEc,
    setEditingEc,
    ecSaving,
    deletingEc,
    setDeletingEc,
    ecForm,
    setEcForm,
    handleSaveEc,
    handleDeleteEc,
    openAddEc,
    openEditEc,
  };
}
