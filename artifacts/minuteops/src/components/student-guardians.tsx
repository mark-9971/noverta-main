import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Phone, Mail, Globe, AlertCircle, Users, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";

interface Guardian {
  id: number;
  studentId: number;
  name: string;
  relationship: string;
  email: string | null;
  phone: string | null;
  preferredContactMethod: string | null;
  contactPriority: number;
  interpreterNeeded: boolean;
  language: string | null;
  notes: string | null;
}

interface EmergencyContact {
  id: number;
  studentId: number;
  name: string;
  relationship: string;
  phone: string;
  notes: string | null;
  priority: number;
}

const RELATIONSHIP_OPTIONS = [
  "Mother", "Father", "Stepmother", "Stepfather", "Guardian", "Grandmother",
  "Grandfather", "Aunt", "Uncle", "Foster Parent", "Other",
];

const CONTACT_METHOD_OPTIONS = ["email", "phone", "mail"];

const CONTACT_METHOD_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-3.5 h-3.5" />,
  phone: <Phone className="w-3.5 h-3.5" />,
  mail: <Globe className="w-3.5 h-3.5" />,
};

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

function apiUrl(path: string) {
  return `${BASE_URL}/api${path}`;
}

const EMPTY_GUARDIAN = {
  name: "", relationship: "", email: "", phone: "",
  preferredContactMethod: "email", contactPriority: 1,
  interpreterNeeded: false, language: "", notes: "",
};

const EMPTY_EC = {
  name: "", relationship: "", phone: "", notes: "", priority: 1,
};

interface GuardianFormState {
  name: string;
  relationship: string;
  email: string;
  phone: string;
  preferredContactMethod: string;
  contactPriority: number;
  interpreterNeeded: boolean;
  language: string;
  notes: string;
}

interface EcFormState {
  name: string;
  relationship: string;
  phone: string;
  notes: string;
  priority: number;
}

function GuardianCard({ guardian, isEditable, onEdit, onDelete }: {
  guardian: Guardian;
  isEditable: boolean;
  onEdit: (g: Guardian) => void;
  onDelete: (g: Guardian) => void;
}) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-b-0 gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
          <span className="text-xs font-semibold text-emerald-700">
            {guardian.contactPriority}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900">{guardian.name}</span>
            <Badge variant="outline" className="text-xs py-0 px-1.5">{guardian.relationship}</Badge>
            {guardian.interpreterNeeded && (
              <Badge variant="outline" className="text-xs py-0 px-1.5 border-amber-300 text-amber-700 bg-amber-50">
                <Globe className="w-3 h-3 mr-1" />
                Interpreter
                {guardian.language ? ` (${guardian.language})` : ""}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {guardian.email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {guardian.email}
              </span>
            )}
            {guardian.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {guardian.phone}
              </span>
            )}
            {guardian.preferredContactMethod && (
              <span className="flex items-center gap-1 text-emerald-600">
                {CONTACT_METHOD_ICONS[guardian.preferredContactMethod]}
                Prefers {guardian.preferredContactMethod}
              </span>
            )}
          </div>
          {guardian.notes && (
            <p className="text-xs text-gray-400 mt-1 truncate">{guardian.notes}</p>
          )}
        </div>
      </div>
      {isEditable && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(guardian)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(guardian)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function EmergencyContactCard({ contact, isEditable, onEdit, onDelete }: {
  contact: EmergencyContact;
  isEditable: boolean;
  onEdit: (c: EmergencyContact) => void;
  onDelete: (c: EmergencyContact) => void;
}) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-b-0 gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
          <span className="text-xs font-semibold text-orange-700">{contact.priority}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900">{contact.name}</span>
            <Badge variant="outline" className="text-xs py-0 px-1.5">{contact.relationship}</Badge>
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <PhoneCall className="w-3 h-3" />
            {contact.phone}
          </div>
          {contact.notes && (
            <p className="text-xs text-gray-400 mt-1 truncate">{contact.notes}</p>
          )}
        </div>
      </div>
      {isEditable && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(contact)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(contact)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function StudentGuardians({ studentId, isEditable }: { studentId: number; isEditable: boolean }) {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);

  const [guardianDialog, setGuardianDialog] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [guardianForm, setGuardianForm] = useState<GuardianFormState>(EMPTY_GUARDIAN);
  const [guardianSaving, setGuardianSaving] = useState(false);
  const [deletingGuardian, setDeletingGuardian] = useState<Guardian | null>(null);

  const [ecDialog, setEcDialog] = useState(false);
  const [editingEc, setEditingEc] = useState<EmergencyContact | null>(null);
  const [ecForm, setEcForm] = useState<EcFormState>(EMPTY_EC);
  const [ecSaving, setEcSaving] = useState(false);
  const [deletingEc, setDeletingEc] = useState<EmergencyContact | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, ec] = await Promise.all([
        authFetch(apiUrl(`/students/${studentId}/guardians`)).then((r) => r.json()),
        authFetch(apiUrl(`/students/${studentId}/emergency-contacts`)).then((r) => r.json()),
      ]);
      setGuardians(Array.isArray(g) ? g : []);
      setEmergencyContacts(Array.isArray(ec) ? ec : []);
    } catch {
      toast.error("Failed to load guardians and contacts");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  function openAddGuardian() {
    setEditingGuardian(null);
    setGuardianForm({ ...EMPTY_GUARDIAN, contactPriority: guardians.length + 1 });
    setGuardianDialog(true);
  }

  function openEditGuardian(g: Guardian) {
    setEditingGuardian(g);
    setGuardianForm({
      name: g.name,
      relationship: g.relationship,
      email: g.email ?? "",
      phone: g.phone ?? "",
      preferredContactMethod: g.preferredContactMethod ?? "email",
      contactPriority: g.contactPriority,
      interpreterNeeded: g.interpreterNeeded,
      language: g.language ?? "",
      notes: g.notes ?? "",
    });
    setGuardianDialog(true);
  }

  async function saveGuardian() {
    setGuardianSaving(true);
    try {
      const payload = {
        ...guardianForm,
        contactPriority: Number(guardianForm.contactPriority),
        email: guardianForm.email || null,
        phone: guardianForm.phone || null,
        language: guardianForm.language || null,
        notes: guardianForm.notes || null,
      };

      if (editingGuardian) {
        await authFetch(apiUrl(`/students/${studentId}/guardians/${editingGuardian.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Guardian updated");
      } else {
        await authFetch(apiUrl(`/students/${studentId}/guardians`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Guardian added");
      }
      setGuardianDialog(false);
      load();
    } catch {
      toast.error("Failed to save guardian");
    } finally {
      setGuardianSaving(false);
    }
  }

  async function confirmDeleteGuardian() {
    if (!deletingGuardian) return;
    try {
      await authFetch(apiUrl(`/students/${studentId}/guardians/${deletingGuardian.id}`), { method: "DELETE" });
      toast.success("Guardian removed");
      setDeletingGuardian(null);
      load();
    } catch {
      toast.error("Failed to remove guardian");
    }
  }

  function openAddEc() {
    setEditingEc(null);
    setEcForm({ ...EMPTY_EC, priority: emergencyContacts.length + 1 });
    setEcDialog(true);
  }

  function openEditEc(c: EmergencyContact) {
    setEditingEc(c);
    setEcForm({
      name: c.name,
      relationship: c.relationship,
      phone: c.phone,
      notes: c.notes ?? "",
      priority: c.priority,
    });
    setEcDialog(true);
  }

  async function saveEc() {
    setEcSaving(true);
    try {
      const payload = {
        ...ecForm,
        priority: Number(ecForm.priority),
        notes: ecForm.notes || null,
      };

      if (editingEc) {
        await authFetch(apiUrl(`/students/${studentId}/emergency-contacts/${editingEc.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Emergency contact updated");
      } else {
        await authFetch(apiUrl(`/students/${studentId}/emergency-contacts`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Emergency contact added");
      }
      setEcDialog(false);
      load();
    } catch {
      toast.error("Failed to save emergency contact");
    } finally {
      setEcSaving(false);
    }
  }

  async function confirmDeleteEc() {
    if (!deletingEc) return;
    try {
      await authFetch(apiUrl(`/students/${studentId}/emergency-contacts/${deletingEc.id}`), { method: "DELETE" });
      toast.success("Emergency contact removed");
      setDeletingEc(null);
      load();
    } catch {
      toast.error("Failed to remove emergency contact");
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Guardians & Parents
              </CardTitle>
              {isEditable && (
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={openAddGuardian}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
            ) : guardians.length === 0 ? (
              <div className="text-center py-6">
                <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No guardians on record</p>
                {isEditable && (
                  <Button variant="ghost" size="sm" className="mt-2 text-xs text-emerald-600" onClick={openAddGuardian}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add guardian
                  </Button>
                )}
              </div>
            ) : (
              <div>
                {guardians.map((g) => (
                  <GuardianCard
                    key={g.id}
                    guardian={g}
                    isEditable={isEditable}
                    onEdit={openEditGuardian}
                    onDelete={setDeletingGuardian}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Emergency Contacts
              </CardTitle>
              {isEditable && (
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={openAddEc}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
            ) : emergencyContacts.length === 0 ? (
              <div className="text-center py-6">
                <PhoneCall className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No emergency contacts on record</p>
                {isEditable && (
                  <Button variant="ghost" size="sm" className="mt-2 text-xs text-emerald-600" onClick={openAddEc}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add contact
                  </Button>
                )}
              </div>
            ) : (
              <div>
                {emergencyContacts.map((c) => (
                  <EmergencyContactCard
                    key={c.id}
                    contact={c}
                    isEditable={isEditable}
                    onEdit={openEditEc}
                    onDelete={setDeletingEc}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={guardianDialog} onOpenChange={setGuardianDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGuardian ? "Edit Guardian" : "Add Guardian"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Full name *</Label>
                <Input
                  value={guardianForm.name}
                  onChange={(e) => setGuardianForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Relationship *</Label>
                <Select
                  value={guardianForm.relationship}
                  onValueChange={(v) => setGuardianForm((p) => ({ ...p, relationship: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={guardianForm.email}
                  onChange={(e) => setGuardianForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  type="tel"
                  value={guardianForm.phone}
                  onChange={(e) => setGuardianForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="(555) 000-0000"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Preferred contact</Label>
                <Select
                  value={guardianForm.preferredContactMethod}
                  onValueChange={(v) => setGuardianForm((p) => ({ ...p, preferredContactMethod: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_METHOD_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contact priority</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={guardianForm.contactPriority}
                  onChange={(e) => setGuardianForm((p) => ({ ...p, contactPriority: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="interpreter"
                checked={guardianForm.interpreterNeeded}
                onChange={(e) => setGuardianForm((p) => ({ ...p, interpreterNeeded: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <Label htmlFor="interpreter" className="text-xs cursor-pointer">Interpreter needed</Label>
            </div>
            {guardianForm.interpreterNeeded && (
              <div className="space-y-1">
                <Label className="text-xs">Language</Label>
                <Input
                  value={guardianForm.language}
                  onChange={(e) => setGuardianForm((p) => ({ ...p, language: e.target.value }))}
                  placeholder="e.g. Spanish, Portuguese"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={guardianForm.notes}
                onChange={(e) => setGuardianForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuardianDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={saveGuardian}
              disabled={guardianSaving || !guardianForm.name.trim() || !guardianForm.relationship}
            >
              {guardianSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingGuardian} onOpenChange={(o) => { if (!o) setDeletingGuardian(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove guardian?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to remove <strong>{deletingGuardian?.name}</strong> from this student's guardians?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingGuardian(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteGuardian}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ecDialog} onOpenChange={setEcDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEc ? "Edit Emergency Contact" : "Add Emergency Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Full name *</Label>
                <Input
                  value={ecForm.name}
                  onChange={(e) => setEcForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Relationship *</Label>
                <Select
                  value={ecForm.relationship}
                  onValueChange={(v) => setEcForm((p) => ({ ...p, relationship: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Phone *</Label>
                <Input
                  type="tel"
                  value={ecForm.phone}
                  onChange={(e) => setEcForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="(555) 000-0000"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={ecForm.priority}
                  onChange={(e) => setEcForm((p) => ({ ...p, priority: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={ecForm.notes}
                onChange={(e) => setEcForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEcDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={saveEc}
              disabled={ecSaving || !ecForm.name.trim() || !ecForm.relationship || !ecForm.phone.trim()}
            >
              {ecSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingEc} onOpenChange={(o) => { if (!o) setDeletingEc(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove emergency contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to remove <strong>{deletingEc?.name}</strong> from this student's emergency contacts?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingEc(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteEc}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
