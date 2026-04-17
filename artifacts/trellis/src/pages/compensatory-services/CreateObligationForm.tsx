import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { toast } from "sonner";
import { createCompensatoryObligation } from "@workspace/api-client-react";

export function CreateObligationForm({ students, serviceRequirements, onClose, onCreated }: {
  students: any[];
  serviceRequirements: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [serviceRequirementId, setServiceRequirementId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [minutesOwed, setMinutesOwed] = useState("");
  const [agreedDate, setAgreedDate] = useState("");
  const [agreedWith, setAgreedWith] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId || !periodStart || !periodEnd || !minutesOwed) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      await createCompensatoryObligation({
          studentId: Number(studentId),
          serviceRequirementId: serviceRequirementId ? Number(serviceRequirementId) : null,
          periodStart,
          periodEnd,
          minutesOwed: Number(minutesOwed),
          agreedDate: agreedDate || null,
          agreedWith: agreedWith || null,
          notes: notes || null,
        } as any);
      toast.success("Compensatory obligation created");
      onCreated();
    } catch {
      toast.error("Failed to create obligation");
    }
    setSubmitting(false);
  }

  const filteredSRs = studentId
    ? serviceRequirements.filter((sr: any) => sr.studentId === Number(studentId))
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600">New Compensatory Obligation</CardTitle>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Student *</label>
            <select value={studentId} onChange={e => setStudentId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Select student...</option>
              {students.map((s: any) => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Service Requirement</label>
            <select value={serviceRequirementId} onChange={e => setServiceRequirementId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Optional...</option>
              {filteredSRs.map((sr: any) => (
                <option key={sr.id} value={sr.id}>{sr.serviceTypeName || `Req #${sr.id}`} ({sr.requiredMinutes} min/{sr.intervalType})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period Start *</label>
            <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Period End *</label>
            <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Minutes Owed *</label>
            <Input type="number" value={minutesOwed} onChange={e => setMinutesOwed(e.target.value)} className="text-sm" min={1} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Agreed Date</label>
            <Input type="date" value={agreedDate} onChange={e => setAgreedDate(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Agreed With</label>
            <Input type="text" value={agreedWith} onChange={e => setAgreedWith(e.target.value)} placeholder="Parent/guardian name" className="text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <Input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional context..." className="text-sm" />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting ? "Creating..." : "Create Obligation"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
