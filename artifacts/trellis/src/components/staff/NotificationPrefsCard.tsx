import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

export function NotificationPrefsCard({
  staff,
  onSave,
}: {
  staff: any;
  onSave: (s: any) => void;
}) {
  const [receiveAlerts, setReceiveAlerts] = useState<boolean>(staff.receiveRiskAlerts !== false);
  const [saving, setSaving] = useState(false);

  async function handleToggle(value: boolean) {
    setReceiveAlerts(value);
    setSaving(true);
    try {
      const res = await authFetch(`/api/staff/${staff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiveRiskAlerts: value }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      onSave(updated);
      toast.success(value ? "Cost avoidance alert emails enabled" : "Cost avoidance alert emails disabled");
    } catch {
      setReceiveAlerts(!value);
      toast.error("Failed to update notification preference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Bell className="w-4 h-4 text-emerald-600" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-700">Cost avoidance risk email alerts</p>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Receive email notifications when critical cost avoidance risks are detected for assigned students.
            </p>
          </div>
          <Switch
            checked={receiveAlerts}
            onCheckedChange={handleToggle}
            disabled={saving}
            aria-label="Toggle cost avoidance risk email alerts"
          />
        </div>
      </CardContent>
    </Card>
  );
}
