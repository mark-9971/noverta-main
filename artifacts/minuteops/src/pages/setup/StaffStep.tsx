import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Loader2, ChevronDown, Plus, Trash2, ArrowLeft, CheckCircle } from "lucide-react";
import { STAFF_ROLES, type StaffInvite } from "./constants";

export interface StaffStepProps {
  staffInvites: StaffInvite[];
  setStaffInvites: (s: StaffInvite[]) => void;
  saving: boolean;
  onBack: () => void;
  onSkip: () => void;
  onInvite: () => void;
}

export function StaffStep(p: StaffStepProps) {
  const update = (i: number, field: keyof StaffInvite, value: string) =>
    p.setStaffInvites(p.staffInvites.map((inv, x) => x === i ? { ...inv, [field]: value } : inv));
  const add = () => p.setStaffInvites([...p.staffInvites, { firstName: "", lastName: "", email: "", role: "sped_teacher" }]);
  const remove = (i: number) => p.setStaffInvites(p.staffInvites.filter((_, x) => x !== i));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-emerald-600" />
          Invite Staff Members
        </CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Add SPED teachers, therapists, and providers so they can start logging sessions.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {p.staffInvites.map((invite, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3 relative">
            {p.staffInvites.length > 1 && (
              <button
                onClick={() => remove(i)}
                className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">First Name</label>
                <input
                  type="text"
                  value={invite.firstName}
                  onChange={e => update(i, "firstName", e.target.value)}
                  placeholder="Jane"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Last Name</label>
                <input
                  type="text"
                  value={invite.lastName}
                  onChange={e => update(i, "lastName", e.target.value)}
                  placeholder="Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Email</label>
                <input
                  type="email"
                  value={invite.email}
                  onChange={e => update(i, "email", e.target.value)}
                  placeholder="jane.smith@district.edu"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Role</label>
                <div className="relative">
                  <select
                    value={invite.role}
                    onChange={e => update(i, "role", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none bg-white"
                  >
                    {STAFF_ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={add}
          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add another staff member
        </button>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-3">
            <button onClick={p.onBack} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button onClick={p.onSkip} className="text-sm text-gray-500 hover:text-gray-700">
              Skip for now
            </button>
          </div>
          <button
            onClick={p.onInvite}
            disabled={p.saving}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {p.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Invite & Finish Setup
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
