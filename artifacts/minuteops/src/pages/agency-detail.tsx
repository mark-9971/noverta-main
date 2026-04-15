import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Building2,
  ArrowLeft,
  Plus,
  FileText,
  Users,
  Pencil,
  Trash2,
  Clock,
  DollarSign,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { useLocation } from "wouter";

interface Contract {
  id: number;
  serviceTypeId: number;
  serviceTypeName: string | null;
  serviceTypeCategory: string | null;
  contractedHours: string;
  hourlyRate: string | null;
  startDate: string;
  endDate: string;
  alertThresholdPct: number;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface StaffMember {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  role: string;
}

interface ServiceType {
  id: number;
  name: string;
  category: string;
}

interface AgencyDetail {
  id: number;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  contracts: Contract[];
  staff: StaffMember[];
}

const emptyContract = {
  serviceTypeId: "",
  contractedHours: "",
  hourlyRate: "",
  startDate: "",
  endDate: "",
  alertThresholdPct: "80",
  notes: "",
};

export default function AgencyDetailPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const agencyId = Number(id);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContractId, setEditingContractId] = useState<number | null>(null);
  const [contractForm, setContractForm] = useState(emptyContract);
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState("");

  const { data: agency, isLoading } = useQuery<AgencyDetail>({
    queryKey: ["agency", agencyId],
    queryFn: () => customFetch(`/api/agencies/${agencyId}`),
    enabled: !isNaN(agencyId),
  });

  const { data: serviceTypes = [] } = useQuery<ServiceType[]>({
    queryKey: ["serviceTypes"],
    queryFn: () => customFetch("/api/service-types"),
  });

  const { data: allStaff = [] } = useQuery<StaffMember[]>({
    queryKey: ["allStaff"],
    queryFn: () => customFetch("/api/staff"),
    enabled: staffDialogOpen,
  });

  const saveContractMutation = useMutation({
    mutationFn: async (data: typeof contractForm) => {
      const payload = {
        serviceTypeId: Number(data.serviceTypeId),
        contractedHours: Number(data.contractedHours),
        hourlyRate: data.hourlyRate ? Number(data.hourlyRate) : null,
        startDate: data.startDate,
        endDate: data.endDate,
        alertThresholdPct: Number(data.alertThresholdPct),
        notes: data.notes || null,
      };
      if (editingContractId) {
        return customFetch(`/api/agencies/${agencyId}/contracts/${editingContractId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
        });
      }
      return customFetch(`/api/agencies/${agencyId}/contracts`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency", agencyId] });
      queryClient.invalidateQueries({ queryKey: ["contractUtilization"] });
      setContractDialogOpen(false);
      setEditingContractId(null);
      setContractForm(emptyContract);
      toast.success(editingContractId ? "Contract updated" : "Contract created");
    },
    onError: () => toast.error("Failed to save contract"),
  });

  const deleteContractMutation = useMutation({
    mutationFn: (contractId: number) =>
      customFetch(`/api/agencies/${agencyId}/contracts/${contractId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency", agencyId] });
      toast.success("Contract removed");
    },
    onError: () => toast.error("Failed to remove contract"),
  });

  const addStaffMutation = useMutation({
    mutationFn: (staffId: number) =>
      customFetch(`/api/agencies/${agencyId}/staff`, {
        method: "POST",
        body: JSON.stringify({ staffId }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency", agencyId] });
      setStaffDialogOpen(false);
      setSelectedStaffId("");
      toast.success("Staff member linked to agency");
    },
    onError: () => toast.error("Failed to link staff"),
  });

  const removeStaffMutation = useMutation({
    mutationFn: (staffId: number) =>
      customFetch(`/api/agencies/${agencyId}/staff/${staffId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency", agencyId] });
      toast.success("Staff member unlinked");
    },
    onError: () => toast.error("Failed to unlink staff"),
  });

  function openContractEdit(c: Contract) {
    setEditingContractId(c.id);
    setContractForm({
      serviceTypeId: String(c.serviceTypeId),
      contractedHours: c.contractedHours,
      hourlyRate: c.hourlyRate || "",
      startDate: c.startDate,
      endDate: c.endDate,
      alertThresholdPct: String(c.alertThresholdPct),
      notes: c.notes || "",
    });
    setContractDialogOpen(true);
  }

  function openContractCreate() {
    setEditingContractId(null);
    setContractForm(emptyContract);
    setContractDialogOpen(true);
  }

  if (isLoading) return <div className="p-6 text-center text-gray-500">Loading...</div>;
  if (!agency) return <div className="p-6 text-center text-gray-500">Agency not found</div>;

  const existingStaffIds = new Set(agency.staff.map((s) => s.id));
  const availableStaff = allStaff.filter((s: any) => !existingStaffIds.has(s.id));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/agencies")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-emerald-600" />
            {agency.name}
          </h1>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
            {agency.contactName && <span>{agency.contactName}</span>}
            {agency.contactEmail && <span>{agency.contactEmail}</span>}
            {agency.contactPhone && <span>{agency.contactPhone}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{agency.contracts.length}</p>
                <p className="text-sm text-gray-500">Active Contracts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{agency.staff.length}</p>
                <p className="text-sm text-gray-500">Linked Providers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {agency.contracts.reduce((sum, c) => sum + Number(c.contractedHours), 0).toLocaleString()}
                </p>
                <p className="text-sm text-gray-500">Total Contracted Hours</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-600" />
            Contracts
          </CardTitle>
          <Button size="sm" onClick={openContractCreate} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-1" /> Add Contract
          </Button>
        </CardHeader>
        <CardContent>
          {agency.contracts.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No contracts yet. Add one to start tracking hours.</p>
          ) : (
            <div className="space-y-3">
              {agency.contracts.map((c) => {
                const today = new Date().toISOString().split("T")[0];
                const daysLeft = Math.ceil((new Date(c.endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
                const isExpiring = daysLeft <= 30 && daysLeft > 0;
                const isExpired = daysLeft <= 0;

                return (
                  <div key={c.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.serviceTypeName || "Unknown"}</span>
                          {c.serviceTypeCategory && (
                            <Badge variant="outline" className="text-xs">{c.serviceTypeCategory}</Badge>
                          )}
                          <Badge
                            variant={c.status === "active" ? "default" : "secondary"}
                            className={c.status === "active" ? "bg-emerald-100 text-emerald-800" : ""}
                          >
                            {c.status}
                          </Badge>
                          {isExpiring && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Expires in {daysLeft}d
                            </Badge>
                          )}
                          {isExpired && (
                            <Badge variant="destructive">Expired</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {Number(c.contractedHours)} hours
                          </span>
                          {c.hourlyRate && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" /> ${Number(c.hourlyRate)}/hr
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {c.startDate} — {c.endDate}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">
                          Alert at {c.alertThresholdPct}% utilization
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openContractEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Remove this contract?")) deleteContractMutation.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-600" />
            Linked Providers
          </CardTitle>
          <Button size="sm" onClick={() => setStaffDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-1" /> Link Provider
          </Button>
        </CardHeader>
        <CardContent>
          {agency.staff.length === 0 ? (
            <p className="text-center py-8 text-gray-500">No providers linked. Link staff members who work for this agency.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {agency.staff.map((s) => (
                <div key={s.id} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.firstName} {s.lastName}</p>
                    <p className="text-sm text-gray-500">{s.role} {s.email ? `• ${s.email}` : ""}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Unlink ${s.firstName} ${s.lastName}?`)) removeStaffMutation.mutate(s.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContractId ? "Edit Contract" : "Add Contract"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveContractMutation.mutate(contractForm);
            }}
            className="space-y-4"
          >
            <div>
              <Label>Service Type *</Label>
              <Select value={contractForm.serviceTypeId} onValueChange={(v) => setContractForm({ ...contractForm, serviceTypeId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((st) => (
                    <SelectItem key={st.id} value={String(st.id)}>{st.name} ({st.category})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contractedHours">Contracted Hours *</Label>
                <Input
                  id="contractedHours"
                  type="number"
                  min="1"
                  step="0.5"
                  value={contractForm.contractedHours}
                  onChange={(e) => setContractForm({ ...contractForm, contractedHours: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={contractForm.hourlyRate}
                  onChange={(e) => setContractForm({ ...contractForm, hourlyRate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={contractForm.startDate}
                  onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={contractForm.endDate}
                  onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="alertThresholdPct">Alert Threshold (% of hours consumed)</Label>
              <Input
                id="alertThresholdPct"
                type="number"
                min="1"
                max="100"
                value={contractForm.alertThresholdPct}
                onChange={(e) => setContractForm({ ...contractForm, alertThresholdPct: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="contractNotes">Notes</Label>
              <Textarea
                id="contractNotes"
                value={contractForm.notes}
                onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContractDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saveContractMutation.isPending}>
                {saveContractMutation.isPending ? "Saving..." : editingContractId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Provider to {agency.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Staff Member</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a staff member..." />
                </SelectTrigger>
                <SelectContent>
                  {availableStaff.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.firstName} {s.lastName} ({s.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStaffDialogOpen(false)}>Cancel</Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!selectedStaffId || addStaffMutation.isPending}
                onClick={() => addStaffMutation.mutate(Number(selectedStaffId))}
              >
                {addStaffMutation.isPending ? "Linking..." : "Link Provider"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
