import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";

export default function StudentMedicaidField({ student, onSave }: { student: any; onSave: () => void }) {
  const [mid, setMid] = useState(student?.medicaidId || "");
  const [saving, setSaving] = useState(false);
  const dirty = mid !== (student?.medicaidId || "");

  useEffect(() => {
    setMid(student?.medicaidId || "");
  }, [student?.medicaidId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await authFetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicaidId: mid || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSave();
      toast.success("Medicaid ID saved");
    } catch {
      toast.error("Failed to save Medicaid ID");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 flex items-center gap-3">
          <Label htmlFor="medicaidId" className="text-xs text-gray-500 whitespace-nowrap">Medicaid ID</Label>
          <Input id="medicaidId" placeholder="Student Medicaid ID" value={mid} onChange={e => setMid(e.target.value)} className="h-8 max-w-xs" />
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8">
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
