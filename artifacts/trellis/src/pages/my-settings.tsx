import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Settings as SettingsIcon, UserCog } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { getStaff } from "@workspace/api-client-react";
import { NotificationPrefsCard } from "@/components/staff/NotificationPrefsCard";

export default function MySettingsPage() {
  const { teacherId, user } = useRole();
  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  function load() {
    if (!teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    getStaff(teacherId)
      .then((s) => setStaff(s))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [teacherId]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">My Settings</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {user.name ? `${user.name} · ` : ""}Manage your personal preferences
          </p>
        </div>
      </div>

      {!teacherId ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={UserCog}
              title="No staff profile linked"
              description="Your account isn't linked to a staff record yet, so personal preferences aren't available. Contact your administrator to set this up."
            />
          </CardContent>
        </Card>
      ) : loading ? (
        <Skeleton className="w-full h-32" />
      ) : loadError ? (
        <ErrorBanner message="Failed to load your settings. Please check your connection." onRetry={load} />
      ) : !staff ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={UserCog}
              title="Staff profile not found"
              description="We couldn't find your staff record. Contact your administrator for help."
            />
          </CardContent>
        </Card>
      ) : (
        <NotificationPrefsCard staff={staff} onSave={(updated) => setStaff(updated)} />
      )}
    </div>
  );
}
