import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { Loader2, X } from "lucide-react";
import {
  type SISProvider, type OnboardingStatus, type StaffInvite,
  DEFAULT_SERVICE_TYPES,
} from "./constants";
import { StepIndicator } from "./StepIndicator";
import { SisStep } from "./SisStep";
import { DistrictStep } from "./DistrictStep";
import { ServiceTypesStep } from "./ServiceTypesStep";
import { StaffStep } from "./StaffStep";
import { sisConnect, districtConfirm, saveServiceTypes, inviteStaff } from "./api";

export default function SetupPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";

  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sisProvider, setSisProvider] = useState<SISProvider | null>(null);
  const [districtName, setDistrictName] = useState("");
  const [schoolNames, setSchoolNames] = useState<string[]>(["Main Campus"]);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [sisApiUrl, setSisApiUrl] = useState("");
  const [sisClientId, setSisClientId] = useState("");
  const [sisClientSecret, setSisClientSecret] = useState("");
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);

  const [schoolYear, setSchoolYear] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}–${y + 1}`;
  });
  const [editingSchools, setEditingSchools] = useState<{ id?: number; name: string }[]>([]);

  const [serviceTypes, setServiceTypes] = useState(DEFAULT_SERVICE_TYPES.map(st => ({ ...st })));

  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([
    { firstName: "", lastName: "", email: "", role: "sped_teacher" },
  ]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const stepParam = params.get("step");
    if (stepParam !== null) {
      const parsed = parseInt(stepParam, 10);
      if (parsed >= 0 && parsed <= 3) setCurrentStep(parsed);
    }
  }, [searchString]);

  useEffect(() => {
    if (isAdmin) fetchStatus();
    else setLoading(false);
  }, [isAdmin]);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await authFetch("/api/onboarding/status");
      if (!res.ok) throw new Error("Failed to fetch onboarding status");
      const data = await res.json();
      setStatus(data);

      if (data.district?.name) setDistrictName(data.district.name);
      if (Array.isArray(data.schools) && data.schools.length > 0) {
        setEditingSchools(data.schools.map((s: { id: number; name: string }) => ({ id: s.id, name: s.name })));
      }

      const params = new URLSearchParams(searchString);
      if (params.get("step") === null) {
        if (!data.sisConnected) setCurrentStep(0);
        else if (!data.districtConfirmed || !data.schoolsConfigured) setCurrentStep(1);
        else if (!data.serviceTypesConfigured) setCurrentStep(2);
        else if (!data.staffInvited) setCurrentStep(3);
        else setCurrentStep(0);
      }
    } catch {
      setError("Could not load setup status");
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[900px] mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Only administrators can access the setup wizard.
        </div>
      </div>
    );
  }

  async function runStep(fn: () => Promise<unknown>, onSuccess?: (data: any) => void, errMsg = "Save failed") {
    setSaving(true);
    setError(null);
    try {
      const data = await fn();
      onSuccess?.(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : errMsg);
    } finally {
      setSaving(false);
    }
  }

  async function handleSISConnect() {
    if (!sisProvider || !districtName.trim()) return;
    setSyncProgress(0);
    const interval = setInterval(() => {
      setSyncProgress(prev => prev === null || prev >= 90 ? prev : prev + Math.random() * 25);
    }, 400);
    await runStep(
      () => sisConnect({ sisProvider, districtName, schoolNames, csvRows, sisApiUrl, sisClientId, sisClientSecret }),
      async (data) => {
        setSyncProgress(100);
        clearInterval(interval);
        setEditingSchools(data.schools.map((s: { id: number; name: string }) => ({ id: s.id, name: s.name })));
        await fetchStatus();
        setTimeout(() => { setSyncProgress(null); setCurrentStep(1); }, 600);
      },
      "Connection failed",
    );
    clearInterval(interval);
    if (saving) setSyncProgress(null);
  }

  const handleDistrictConfirm = () => runStep(
    () => districtConfirm(districtName, schoolYear, editingSchools),
    async () => { await fetchStatus(); setCurrentStep(2); },
  );

  async function handleServiceTypes() {
    const selected = serviceTypes.filter(st => st.checked);
    if (selected.length === 0) { setError("Select at least one service type"); return; }
    await runStep(() => saveServiceTypes(selected), async () => { await fetchStatus(); setCurrentStep(3); });
  }

  async function handleStaffInvite() {
    const valid = staffInvites.filter(i => i.email.trim() && i.firstName.trim() && i.lastName.trim());
    if (valid.length === 0) { setError("Add at least one staff member with name and email"); return; }
    await runStep(() => inviteStaff(valid), async () => { await fetchStatus(); navigate("/"); }, "Invite failed");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Set Up Trellis</h1>
        <p className="text-sm text-gray-500 mt-1">Get your district up and running in a few steps.</p>
      </div>

      <StepIndicator currentStep={currentStep} status={status} onStepClick={setCurrentStep} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {currentStep === 0 && (
        <SisStep
          districtName={districtName} setDistrictName={setDistrictName}
          sisProvider={sisProvider} setSisProvider={setSisProvider}
          sisApiUrl={sisApiUrl} setSisApiUrl={setSisApiUrl}
          sisClientId={sisClientId} setSisClientId={setSisClientId}
          sisClientSecret={sisClientSecret} setSisClientSecret={setSisClientSecret}
          csvRows={csvRows} setCsvRows={setCsvRows}
          schoolNames={schoolNames} setSchoolNames={setSchoolNames}
          syncProgress={syncProgress} saving={saving}
          onConnect={handleSISConnect} onSkip={() => navigate("/")}
        />
      )}

      {currentStep === 1 && (
        <DistrictStep
          districtName={districtName} setDistrictName={setDistrictName}
          schoolYear={schoolYear} setSchoolYear={setSchoolYear}
          editingSchools={editingSchools} setEditingSchools={setEditingSchools}
          saving={saving} onBack={() => setCurrentStep(0)} onConfirm={handleDistrictConfirm}
        />
      )}

      {currentStep === 2 && (
        <ServiceTypesStep
          serviceTypes={serviceTypes} setServiceTypes={setServiceTypes}
          saving={saving} onBack={() => setCurrentStep(1)} onSave={handleServiceTypes}
        />
      )}

      {currentStep === 3 && (
        <StaffStep
          staffInvites={staffInvites} setStaffInvites={setStaffInvites}
          saving={saving} onBack={() => setCurrentStep(2)}
          onSkip={() => navigate("/")} onInvite={handleStaffInvite}
        />
      )}
    </div>
  );
}
