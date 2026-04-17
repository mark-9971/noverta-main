import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { History, Phone, Stethoscope, Archive, ArchiveRestore, Share2, XCircle, Copy } from "lucide-react";
import { toast } from "sonner";
import type { EmergencyContactRecord, MedicalAlertRecord } from "./StudentContactsMedical";

interface AddEventForm {
  eventType: string;
  eventDate: string;
  reasonCode: string;
  reason: string;
  notes: string;
}

interface EcForm {
  firstName: string;
  lastName: string;
  relationship: string;
  priority: number;
  phone: string;
  phoneSecondary: string;
  email: string;
  isAuthorizedForPickup: boolean;
  notes: string;
}

interface MaForm {
  alertType: string;
  severity: string;
  description: string;
  treatmentNotes: string;
  epiPenOnFile: boolean;
  notifyAllStaff: boolean;
}

interface SvcForm {
  serviceTypeId: string;
  providerId: string;
  requiredMinutes: string;
  intervalType: string;
  deliveryType: string;
  startDate: string;
  endDate: string;
  priority: string;
}

interface AssignForm {
  staffId: string;
  assignmentType: string;
  startDate: string;
  endDate: string;
}

interface StudentDialogsProps {
  // Add Enrollment Event
  addEventDialogOpen: boolean;
  setAddEventDialogOpen: (v: boolean) => void;
  addEventForm: AddEventForm;
  setAddEventForm: (updater: (f: AddEventForm) => AddEventForm) => void;
  addEventSaving: boolean;
  handleAddEvent: () => void;
  // Emergency Contact
  ecDialogOpen: boolean;
  setEcDialogOpen: (v: boolean) => void;
  editingEc: EmergencyContactRecord | null;
  setEditingEc: (c: EmergencyContactRecord | null) => void;
  ecForm: EcForm;
  setEcForm: (updater: (f: EcForm) => EcForm) => void;
  ecSaving: boolean;
  handleSaveEc: () => void;
  deletingEc: EmergencyContactRecord | null;
  setDeletingEc: (c: EmergencyContactRecord | null) => void;
  handleDeleteEc: (c: EmergencyContactRecord) => void;
  // Medical Alert
  maDialogOpen: boolean;
  setMaDialogOpen: (v: boolean) => void;
  editingMa: MedicalAlertRecord | null;
  setEditingMa: (a: MedicalAlertRecord | null) => void;
  maForm: MaForm;
  setMaForm: (updater: (f: MaForm) => MaForm) => void;
  maSaving: boolean;
  handleSaveMa: () => void;
  deletingMa: MedicalAlertRecord | null;
  setDeletingMa: (a: MedicalAlertRecord | null) => void;
  handleDeleteMa: (a: MedicalAlertRecord) => void;
  // Archive
  archiveDialogOpen: boolean;
  setArchiveDialogOpen: (v: boolean) => void;
  archiveReason: string;
  setArchiveReason: (s: string) => void;
  archiveSaving: boolean;
  handleArchive: () => void;
  // Reactivate
  reactivateDialogOpen: boolean;
  setReactivateDialogOpen: (v: boolean) => void;
  reactivateSaving: boolean;
  handleReactivate: () => void;
  // Service Requirement
  svcDialogOpen: boolean;
  setSvcDialogOpen: (v: boolean) => void;
  editingSvc: any;
  svcForm: SvcForm;
  setSvcForm: (updater: (f: SvcForm) => SvcForm) => void;
  svcSaving: boolean;
  handleSaveSvc: () => void;
  serviceTypesList: any[];
  staffList: any[];
  deletingSvc: any;
  handleDeleteSvc: () => void;
  // Assign Staff
  assignDialogOpen: boolean;
  setAssignDialogOpen: (v: boolean) => void;
  assignForm: AssignForm;
  setAssignForm: (updater: (f: AssignForm) => AssignForm) => void;
  assignSaving: boolean;
  handleAddAssignment: () => void;
  // Share Progress
  showShareModal: boolean;
  setShowShareModal: (v: boolean) => void;
  shareDays: number;
  setShareDays: (n: number) => void;
  shareLoading: boolean;
  shareSummary: any;
  shareLink: string;
  handleShareProgress: () => void;
  handlePrintSummary: () => void;
  generateShareLink: () => void;
}

export default function StudentDialogs(props: StudentDialogsProps) {
  const {
    addEventDialogOpen, setAddEventDialogOpen, addEventForm, setAddEventForm, addEventSaving, handleAddEvent,
    ecDialogOpen, setEcDialogOpen, editingEc, setEditingEc, ecForm, setEcForm, ecSaving, handleSaveEc,
    deletingEc, setDeletingEc, handleDeleteEc,
    maDialogOpen, setMaDialogOpen, editingMa, setEditingMa, maForm, setMaForm, maSaving, handleSaveMa,
    deletingMa, setDeletingMa, handleDeleteMa,
    archiveDialogOpen, setArchiveDialogOpen, archiveReason, setArchiveReason, archiveSaving, handleArchive,
    reactivateDialogOpen, setReactivateDialogOpen, reactivateSaving, handleReactivate,
    svcDialogOpen, setSvcDialogOpen, editingSvc, svcForm, setSvcForm, svcSaving, handleSaveSvc,
    serviceTypesList, staffList, deletingSvc, handleDeleteSvc,
    assignDialogOpen, setAssignDialogOpen, assignForm, setAssignForm, assignSaving, handleAddAssignment,
    showShareModal, setShowShareModal, shareDays, setShareDays, shareLoading, shareSummary, shareLink,
    handleShareProgress, handlePrintSummary, generateShareLink,
  } = props;

  return (
    <>
      <Dialog open={addEventDialogOpen} onOpenChange={v => { if (!v) setAddEventDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-600" /> Log Enrollment Event
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Event Type</Label>
                <Select value={addEventForm.eventType} onValueChange={v => setAddEventForm(f => ({ ...f, eventType: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      { value: "enrolled", label: "Enrolled" },
                      { value: "reactivated", label: "Reactivated" },
                      { value: "withdrawn", label: "Withdrawn" },
                      { value: "transferred_in", label: "Transferred In" },
                      { value: "transferred_out", label: "Transferred Out" },
                      { value: "program_change", label: "Program Change" },
                      { value: "graduated", label: "Graduated" },
                      { value: "suspended", label: "Suspended" },
                      { value: "leave_of_absence", label: "Leave of Absence" },
                      { value: "note", label: "Note" },
                    ].map(o => <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Event Date</Label>
                <Input type="date" value={addEventForm.eventDate} onChange={e => setAddEventForm(f => ({ ...f, eventDate: e.target.value }))} className="h-9 text-[13px]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Reason Code <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Select value={addEventForm.reasonCode} onValueChange={v => setAddEventForm(f => ({ ...f, reasonCode: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select reason…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-[13px] text-gray-400">None</SelectItem>
                  <SelectItem value="graduation" className="text-[13px]">Graduation</SelectItem>
                  <SelectItem value="transfer" className="text-[13px]">Transfer</SelectItem>
                  <SelectItem value="family_move" className="text-[13px]">Family Move</SelectItem>
                  <SelectItem value="program_completion" className="text-[13px]">Program Completion</SelectItem>
                  <SelectItem value="other" className="text-[13px]">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Reason <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={addEventForm.reason} onChange={e => setAddEventForm(f => ({ ...f, reason: e.target.value }))} className="h-9 text-[13px]" placeholder="Brief description of reason" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input value={addEventForm.notes} onChange={e => setAddEventForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-[13px]" placeholder="Any additional context" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddEventDialogOpen(false)} disabled={addEventSaving}>Cancel</Button>
            <Button size="sm" onClick={handleAddEvent} disabled={addEventSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {addEventSaving ? "Saving…" : "Log Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ecDialogOpen} onOpenChange={v => { if (!v) { setEcDialogOpen(false); setEditingEc(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              {editingEc ? "Edit Emergency Contact" : "Add Emergency Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">First Name *</Label>
                <Input value={ecForm.firstName} onChange={e => setEcForm(f => ({ ...f, firstName: e.target.value }))} className="h-9 text-[13px]" placeholder="First name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Last Name *</Label>
                <Input value={ecForm.lastName} onChange={e => setEcForm(f => ({ ...f, lastName: e.target.value }))} className="h-9 text-[13px]" placeholder="Last name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Relationship *</Label>
                <Input value={ecForm.relationship} onChange={e => setEcForm(f => ({ ...f, relationship: e.target.value }))} className="h-9 text-[13px]" placeholder="e.g. Parent, Guardian" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Priority</Label>
                <Input type="number" min={1} value={ecForm.priority} onChange={e => setEcForm(f => ({ ...f, priority: Number(e.target.value) }))} className="h-9 text-[13px]" placeholder="1 = Primary" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Primary Phone *</Label>
                <Input value={ecForm.phone} onChange={e => setEcForm(f => ({ ...f, phone: e.target.value }))} className="h-9 text-[13px]" placeholder="(555) 000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Secondary Phone</Label>
                <Input value={ecForm.phoneSecondary} onChange={e => setEcForm(f => ({ ...f, phoneSecondary: e.target.value }))} className="h-9 text-[13px]" placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Email</Label>
              <Input type="email" value={ecForm.email} onChange={e => setEcForm(f => ({ ...f, email: e.target.value }))} className="h-9 text-[13px]" placeholder="Optional" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ecPickup" checked={ecForm.isAuthorizedForPickup} onChange={e => setEcForm(f => ({ ...f, isAuthorizedForPickup: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <Label htmlFor="ecPickup" className="text-[13px] font-medium text-gray-700 cursor-pointer">Authorized for student pickup</Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Notes</Label>
              <Input value={ecForm.notes} onChange={e => setEcForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-[13px]" placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setEcDialogOpen(false); setEditingEc(null); }} disabled={ecSaving}>Cancel</Button>
            <Button size="sm" onClick={handleSaveEc} disabled={ecSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {ecSaving ? "Saving…" : editingEc ? "Save Changes" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingEc} onOpenChange={v => { if (!v) setDeletingEc(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Remove Emergency Contact?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-500 py-1">
            Remove <strong>{deletingEc?.firstName} {deletingEc?.lastName}</strong> from this student's emergency contacts?
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeletingEc(null)}>Cancel</Button>
            <Button size="sm" onClick={() => deletingEc && handleDeleteEc(deletingEc)} className="bg-red-600 hover:bg-red-700 text-white">Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={maDialogOpen} onOpenChange={v => { if (!v) { setMaDialogOpen(false); setEditingMa(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-red-500" />
              {editingMa ? "Edit Medical Alert" : "Add Medical Alert"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Alert Type *</Label>
                <Select value={maForm.alertType} onValueChange={v => setMaForm(f => ({ ...f, alertType: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[{ value: "allergy", label: "Allergy" }, { value: "medication", label: "Medication" }, { value: "condition", label: "Condition" }, { value: "seizure", label: "Seizure" }, { value: "other", label: "Other" }].map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Severity *</Label>
                <Select value={maForm.severity} onValueChange={v => setMaForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[{ value: "mild", label: "Mild" }, { value: "moderate", label: "Moderate" }, { value: "severe", label: "Severe" }, { value: "life_threatening", label: "Life-Threatening" }].map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Description *</Label>
              <Input value={maForm.description} onChange={e => setMaForm(f => ({ ...f, description: e.target.value }))} className="h-9 text-[13px]" placeholder="e.g. Severe peanut allergy" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Treatment Notes</Label>
              <Input value={maForm.treatmentNotes} onChange={e => setMaForm(f => ({ ...f, treatmentNotes: e.target.value }))} className="h-9 text-[13px]" placeholder="What to do in an emergency" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="maEpiPen" checked={maForm.epiPenOnFile} onChange={e => setMaForm(f => ({ ...f, epiPenOnFile: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <Label htmlFor="maEpiPen" className="text-[13px] font-medium text-gray-700 cursor-pointer">EpiPen on file</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="maNotify" checked={maForm.notifyAllStaff} onChange={e => setMaForm(f => ({ ...f, notifyAllStaff: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                <Label htmlFor="maNotify" className="text-[13px] font-medium text-gray-700 cursor-pointer">Notify all staff</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setMaDialogOpen(false); setEditingMa(null); }} disabled={maSaving}>Cancel</Button>
            <Button size="sm" onClick={handleSaveMa} disabled={maSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {maSaving ? "Saving…" : editingMa ? "Save Changes" : "Add Alert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingMa} onOpenChange={v => { if (!v) setDeletingMa(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Remove Medical Alert?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-500 py-1">
            Remove the alert for <strong>{deletingMa?.description}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeletingMa(null)}>Cancel</Button>
            <Button size="sm" onClick={() => deletingMa && handleDeleteMa(deletingMa)} className="bg-red-600 hover:bg-red-700 text-white">Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveDialogOpen} onOpenChange={v => { if (!v) { setArchiveDialogOpen(false); setArchiveReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-600" /> Archive Student
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-[13px] text-gray-500">
              Archiving marks this student as inactive. They will no longer appear in the default student list, but their records are preserved.
            </p>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Reason (optional)</Label>
              <Input
                value={archiveReason}
                onChange={e => setArchiveReason(e.target.value)}
                placeholder="e.g. Moved districts, graduated early…"
                className="h-9 text-[13px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setArchiveDialogOpen(false); setArchiveReason(""); }} disabled={archiveSaving}>Cancel</Button>
            <Button size="sm" onClick={handleArchive} disabled={archiveSaving} className="bg-amber-600 hover:bg-amber-700 text-white">
              {archiveSaving ? "Archiving…" : "Archive Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reactivateDialogOpen} onOpenChange={v => { if (!v) setReactivateDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
              <ArchiveRestore className="w-4 h-4 text-emerald-600" /> Reactivate Student
            </DialogTitle>
          </DialogHeader>
          <div className="py-1">
            <p className="text-[13px] text-gray-500">
              This will mark the student as active and log a re-enrollment event. Their previous records and service history will be restored to the active view.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReactivateDialogOpen(false)} disabled={reactivateSaving}>Cancel</Button>
            <Button size="sm" onClick={handleReactivate} disabled={reactivateSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {reactivateSaving ? "Reactivating…" : "Reactivate Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={svcDialogOpen} onOpenChange={v => { if (!v) setSvcDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">
              {editingSvc ? "Edit Service Requirement" : "Add Service Requirement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Service Type</Label>
                <Select value={svcForm.serviceTypeId} onValueChange={v => setSvcForm(f => ({ ...f, serviceTypeId: v }))} disabled={!!editingSvc}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {serviceTypesList.map((st: any) => (
                      <SelectItem key={st.id} value={String(st.id)} className="text-[13px]">{st.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Provider</Label>
                <Select value={svcForm.providerId} onValueChange={v => setSvcForm(f => ({ ...f, providerId: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none" className="text-[13px]">Unassigned</SelectItem>
                    {staffList.map((st: any) => (
                      <SelectItem key={st.id} value={String(st.id)} className="text-[13px]">{st.firstName} {st.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Required Minutes</Label>
                <Input type="number" value={svcForm.requiredMinutes} onChange={e => setSvcForm(f => ({ ...f, requiredMinutes: e.target.value }))} className="h-9 text-[13px]" placeholder="e.g. 120" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Interval</Label>
                <Select value={svcForm.intervalType} onValueChange={v => setSvcForm(f => ({ ...f, intervalType: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly" className="text-[13px]">Weekly</SelectItem>
                    <SelectItem value="monthly" className="text-[13px]">Monthly</SelectItem>
                    <SelectItem value="daily" className="text-[13px]">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Delivery Type</Label>
                <Select value={svcForm.deliveryType} onValueChange={v => setSvcForm(f => ({ ...f, deliveryType: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct" className="text-[13px]">Direct</SelectItem>
                    <SelectItem value="consult" className="text-[13px]">Consult</SelectItem>
                    <SelectItem value="indirect" className="text-[13px]">Indirect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Start Date</Label>
                <input type="date" value={svcForm.startDate} onChange={e => setSvcForm(f => ({ ...f, startDate: e.target.value }))} className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">End Date</Label>
                <input type="date" value={svcForm.endDate} onChange={e => setSvcForm(f => ({ ...f, endDate: e.target.value }))} className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Priority</Label>
                <Select value={svcForm.priority} onValueChange={v => setSvcForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="text-[13px]">Low</SelectItem>
                    <SelectItem value="medium" className="text-[13px]">Medium</SelectItem>
                    <SelectItem value="high" className="text-[13px]">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSvcDialogOpen(false)} disabled={svcSaving}>Cancel</Button>
            <Button size="sm" onClick={handleSaveSvc} disabled={svcSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {svcSaving ? "Saving…" : editingSvc ? "Update" : "Add Requirement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingSvc} onOpenChange={v => { if (!v) props.deletingSvc && (props as any).setDeletingSvc?.(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Delete Service Requirement</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-600 py-2">
            Are you sure you want to delete the service requirement for <strong>{deletingSvc?.serviceTypeName || "this service"}</strong>? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => (props as any).setDeletingSvc?.(null)} disabled={svcSaving}>Cancel</Button>
            <Button size="sm" onClick={handleDeleteSvc} disabled={svcSaving} className="bg-red-600 hover:bg-red-700 text-white">
              {svcSaving ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={v => { if (!v) setAssignDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Assign Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Staff Member</Label>
              <Select value={assignForm.staffId} onValueChange={v => setAssignForm(f => ({ ...f, staffId: v }))}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue placeholder="Select staff..." /></SelectTrigger>
                <SelectContent>
                  {staffList.map((st: any) => (
                    <SelectItem key={st.id} value={String(st.id)} className="text-[13px]">{st.firstName} {st.lastName} ({st.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Assignment Type</Label>
              <Select value={assignForm.assignmentType} onValueChange={v => setAssignForm(f => ({ ...f, assignmentType: v }))}>
                <SelectTrigger className="h-9 text-[13px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="service_provider" className="text-[13px]">Service Provider</SelectItem>
                  <SelectItem value="case_manager" className="text-[13px]">Case Manager</SelectItem>
                  <SelectItem value="supervisor" className="text-[13px]">Supervisor</SelectItem>
                  <SelectItem value="consultant" className="text-[13px]">Consultant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Start Date</Label>
                <input type="date" value={assignForm.startDate} onChange={e => setAssignForm(f => ({ ...f, startDate: e.target.value }))} className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">End Date</Label>
                <input type="date" value={assignForm.endDate} onChange={e => setAssignForm(f => ({ ...f, endDate: e.target.value }))} className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(false)} disabled={assignSaving}>Cancel</Button>
            <Button size="sm" onClick={handleAddAssignment} disabled={assignSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {assignSaving ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showShareModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-600" /> Share Progress Summary
              </h2>
              <button onClick={() => setShowShareModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <XCircle className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600">Report Period:</label>
                <select
                  value={shareDays}
                  onChange={e => { setShareDays(Number(e.target.value)); }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value={30}>Last 30 days</option>
                  <option value={60}>Last 60 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
                <button
                  onClick={handleShareProgress}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Refresh
                </button>
              </div>

              {shareLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="w-full h-16" />
                  <Skeleton className="w-full h-32" />
                  <Skeleton className="w-full h-24" />
                </div>
              ) : shareSummary ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">IEP Goals ({shareSummary.goals.length})</h3>
                    {shareSummary.goals.length > 0 ? (
                      <div className="space-y-1.5">
                        {shareSummary.goals.map((g: any) => (
                          <div key={g.id} className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg">
                            <span className="font-medium text-gray-700">{g.goalArea} #{g.goalNumber}</span>
                            <span className="text-gray-400 flex-1 truncate">{g.annualGoal}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{g.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-400">No active goals</p>}
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Service Delivery</h3>
                    {shareSummary.serviceDelivery.length > 0 ? (
                      <div className="space-y-1.5">
                        {shareSummary.serviceDelivery.map((d: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg">
                            <span className="font-medium text-gray-700 min-w-[120px]">{d.serviceType}</span>
                            <span className="text-gray-500">{d.deliveredMinutes}/{d.requiredMinutes} min</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, d.percentComplete)}%` }} />
                            </div>
                            <span className="font-bold text-gray-700 w-10 text-right">{d.percentComplete}%</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-400">No service requirements</p>}
                  </div>

                  {shareSummary.behaviorData.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Behavior Data Trends</h3>
                      <div className="space-y-1.5">
                        {shareSummary.behaviorData.map((b: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg">
                            <span className="font-medium text-gray-700">{b.targetName}</span>
                            <span className="text-gray-400">Avg: {b.average ?? "\u2014"}</span>
                            <span className="text-gray-400">Recent: {b.recentAverage ?? "\u2014"}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              b.trend === "increasing" ? "bg-emerald-50 text-emerald-600" :
                              b.trend === "decreasing" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                            }`}>{b.trend.replace(/_/g, " ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {shareSummary.programData.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Program Progress</h3>
                      <div className="space-y-1.5">
                        {shareSummary.programData.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-white p-2 rounded-lg">
                            <span className="font-medium text-gray-700">{p.targetName}</span>
                            <span className="text-gray-400">Avg: {p.averagePercent ?? "\u2014"}%</span>
                            <span className="text-gray-400">Recent: {p.recentAveragePercent ?? "\u2014"}%</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              p.trend === "increasing" ? "bg-emerald-50 text-emerald-600" :
                              p.trend === "decreasing" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                            }`}>{p.trend.replace(/_/g, " ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">Failed to load summary</p>
              )}

              {shareSummary && (
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={handlePrintSummary}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                  >
                    Print / Save as PDF
                  </button>
                  <button
                    onClick={generateShareLink}
                    className="px-4 py-2 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-50"
                  >
                    Generate Share Link
                  </button>
                  {shareLink && (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        readOnly
                        value={shareLink}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-gray-50 text-gray-600"
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(shareLink); toast.success("Link copied"); }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg"
                        title="Copy link"
                      >
                        <Copy className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
