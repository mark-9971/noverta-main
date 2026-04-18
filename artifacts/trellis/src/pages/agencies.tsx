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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Search,
  Mail,
  Phone,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { DemoEmptyState } from "@/components/DemoEmptyState";

interface Agency {
  id: number;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

const emptyForm = {
  name: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  notes: "",
};

export default function AgenciesPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: agencies = [], isLoading } = useQuery<Agency[]>({
    queryKey: ["agencies"],
    queryFn: () => customFetch("/api/agencies"),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (editingId) {
        return customFetch(`/api/agencies/${editingId}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
      }
      return customFetch("/api/agencies", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? "Agency updated" : "Agency created");
    },
    onError: () => toast.error("Failed to save agency"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/agencies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      toast.success("Agency removed");
    },
    onError: () => toast.error("Failed to remove agency"),
  });

  const filtered = agencies.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.contactName?.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(agency: Agency) {
    setEditingId(agency.id);
    setForm({
      name: agency.name,
      contactName: agency.contactName || "",
      contactEmail: agency.contactEmail || "",
      contactPhone: agency.contactPhone || "",
      address: agency.address || "",
      notes: agency.notes || "",
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-emerald-600" />
            Agency Management
          </h1>
          <p className="text-gray-500 mt-1">Manage contracted service agencies and their providers</p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1" /> Add Agency
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search agencies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading agencies...</div>
      ) : filtered.length === 0 ? (
        search ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No agencies match your search</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-2">
              <DemoEmptyState setupHint="Real tenants add their contracted service agencies and provider rosters during onboarding so contract utilization can be tracked.">
                <div className="py-12 text-center">
                  <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No agencies yet. Add one to get started.</p>
                </div>
              </DemoEmptyState>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((agency) => (
                <TableRow
                  key={agency.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/agencies/${agency.id}`)}
                >
                  <TableCell className="font-medium">{agency.name}</TableCell>
                  <TableCell className="text-gray-600">{agency.contactName || "—"}</TableCell>
                  <TableCell>
                    {agency.contactEmail ? (
                      <span className="flex items-center gap-1 text-gray-600">
                        <Mail className="h-3 w-3" /> {agency.contactEmail}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {agency.contactPhone ? (
                      <span className="flex items-center gap-1 text-gray-600">
                        <Phone className="h-3 w-3" /> {agency.contactPhone}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={agency.status === "active" ? "default" : "secondary"} className={agency.status === "active" ? "bg-emerald-100 text-emerald-800" : ""}>
                      {agency.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(agency)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remove "${agency.name}"?`)) deleteMutation.mutate(agency.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/agencies/${agency.id}`)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Agency" : "Add Agency"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">Agency Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contactName">Contact Name</Label>
                <Input id="contactName" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input id="contactEmail" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contactPhone">Phone</Label>
                <Input id="contactPhone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
