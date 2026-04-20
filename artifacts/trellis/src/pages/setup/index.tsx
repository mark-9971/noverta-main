import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { Loader2, X, FlaskConical, Sparkles, LogIn, Save, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
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
  const { isLoaded: clerkLoaded, isSignedIn } = useUser();
  if (clerkLoaded && !isSignedIn) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-4">
            <LogIn className="w-5 h-5 text-emerald-700" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Sign in to continue setup</h1>
          <p className="text-sm text-gray-500 mt-2">
            District onboarding writes to your account. Sign in first so we can
            attach your district, schools, and staff to the right user.
          </p>
          <a
            href="/sign-in?redirect_url=/setup"
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }
  if (!clerkLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }
  return <SetupPageInner />;
}

function SetupPageInner() {
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
  const [schoolNames, setSchoolNames] = useState<string[]>([]);
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

      <SampleDataCta />

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

      <ComplianceThresholdCard />
    </div>
  );
}

interface DistrictSummary {
  id: number;
  name: string;
  complianceMinuteThreshold: number;
}

function ComplianceThresholdCard() {
  const queryClient = useQueryClient();

  const { data: districts, isLoading, isError } = useQuery<DistrictSummary[]>({
    queryKey: ["districts"],
    queryFn: async () => {
      const r = await authFetch("/api/districts");
      if (!r.ok) throw new Error("Failed to fetch district");
      return r.json();
    },
    staleTime: 30_000,
  });

  // Non-platform admins always receive exactly their own district from GET /districts,
  // so districts[0] is the correct district in the settings context.
  const district = districts?.[0];
  const [draft, setDraft] = useState<string>("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (district && !initialized) {
      setDraft(String(district.complianceMinuteThreshold));
      setInitialized(true);
    }
  }, [district, initialized]);

  const saveMutation = useMutation({
    mutationFn: async (threshold: number) => {
      const r = await authFetch(`/api/districts/${district!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complianceMinuteThreshold: threshold }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to save threshold");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["districts"] });
      toast.success("Compliance threshold updated");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to save threshold");
    },
  });

  function handleSave() {
    const parsed = Number(draft);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      toast.error("Threshold must be a whole number between 1 and 100");
      return;
    }
    saveMutation.mutate(parsed);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Compliance Minute Threshold
        </CardTitle>
        <p className="text-sm text-gray-500 mt-0.5">
          Set the minimum percentage of required service minutes a student must
          receive to be considered on track. The default is 85%.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : isError ? (
          <p className="text-sm text-red-600">Could not load district settings. Please refresh the page.</p>
        ) : !district ? (
          <p className="text-sm text-gray-500">No district found.</p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 max-w-[220px]">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Threshold (%)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <span className="text-sm text-gray-400 flex-shrink-0">%</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Currently saved: <strong>{district.complianceMinuteThreshold}%</strong>
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              {saveMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />}
              Save Threshold
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SampleStatus {
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
}

/**
 * Top-of-wizard CTA that lets a brand-new admin populate the workspace with
 * realistic sample data in one click. Hides itself once sample data already
 * exists (the global SampleDataBanner takes over from there).
 */
type Intensity = "low" | "medium" | "high";
type DemoEmphasis = "compliance" | "comp_ed" | "caseload" | "behavior" | "executive";
interface CustomSeedForm {
  districtName: string;
  schoolCount: number;
  targetStudents: number;
  caseManagerCount: number;
  providerCount: number;
  paraCount: number;
  bcbaCount: number;
  avgGoalsPerStudent: number;
  avgRequiredMinutesPerWeek: number;
  backfillMonths: number;
  complianceHealth: Intensity;
  staffingStrain: Intensity;
  documentationQuality: Intensity;
  compensatoryExposure: Intensity;
  behaviorIntensity: Intensity;
  demoEmphasis: DemoEmphasis;
}
const DEFAULT_CUSTOM_FORM: CustomSeedForm = {
  districtName: "",
  schoolCount: 5,
  targetStudents: 60,
  caseManagerCount: 4,
  providerCount: 8,
  paraCount: 6,
  bcbaCount: 2,
  avgGoalsPerStudent: 17,
  avgRequiredMinutesPerWeek: 90,
  backfillMonths: 8,
  complianceHealth: "medium",
  staffingStrain: "medium",
  documentationQuality: "medium",
  compensatoryExposure: "medium",
  behaviorIntensity: "medium",
  demoEmphasis: "compliance",
};

function SampleDataCta() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [form, setForm] = useState<CustomSeedForm>(DEFAULT_CUSTOM_FORM);

  const { data, isLoading } = useQuery<SampleStatus>({
    queryKey: ["sample-data/status"],
    queryFn: async () => {
      const r = await authFetch("/api/sample-data");
      if (!r.ok) throw new Error("sample-data status failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const seed = useMutation({
    mutationFn: async (custom?: CustomSeedForm) => {
      const init: RequestInit = { method: "POST" };
      if (custom) {
        init.headers = { "Content-Type": "application/json" };
        // Only send a districtName when the user actually filled one in —
        // otherwise let the seeder keep the existing district label.
        const body: Partial<CustomSeedForm> = { ...custom };
        if (!body.districtName?.trim()) delete body.districtName;
        init.body = JSON.stringify(body);
      }
      const r = await authFetch("/api/sample-data", init);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "Failed to load sample data");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      try {
        // Trigger the guided tour on the next page load. Cleared on dismiss
        // or completion. Read by SampleDataTour.
        window.localStorage.setItem("trellis.sampleTour.start", "1");
        window.localStorage.removeItem("trellis.sampleTour.v1");
      } catch {
        /* localStorage unavailable; tour will still fire via the
           "hasSampleData && !seen" fallback */
      }
      navigate("/compliance-risk-report");
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load sample data");
    },
  });

  if (isLoading) return null;
  if (data?.hasSampleData) return null;

  return (
    <div
      className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 md:p-5"
      data-testid="sample-data-cta"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-900">
            See Trellis with realistic data — in 10 seconds
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            We'll seed a realistic SPED roster (~50–100 students, full staff
            mix, several months of session history with deliberate compliance
            gaps) so your dashboards aren't empty while you set up your real
            district. Use Advanced below to tailor the demo. Remove anytime.
          </p>
          {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
        </div>
        <button
          onClick={() => { setError(null); seed.mutate(undefined); }}
          disabled={seed.isPending}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2 whitespace-nowrap"
          data-testid="button-seed-sample-data"
        >
          {seed.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Try with sample data
        </button>
      </div>
      <div className="mt-3 pt-3 border-t border-emerald-100">
        <button
          type="button"
          onClick={() => setAdvancedOpen(o => !o)}
          className="text-xs font-medium text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
          data-testid="button-toggle-advanced-seed"
        >
          {advancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Advanced — tailor this demo for a specific district
        </button>
        {advancedOpen && (
          <CustomSeedForm
            form={form}
            onChange={setForm}
            onSubmit={() => { setError(null); seed.mutate(form); }}
            submitting={seed.isPending}
          />
        )}
      </div>
    </div>
  );
}

const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const EMPHASIS_OPTIONS: { value: DemoEmphasis; label: string }[] = [
  { value: "compliance", label: "Compliance crisis" },
  { value: "comp_ed", label: "Comp-ed exposure ($$$)" },
  { value: "caseload", label: "Caseload / staffing strain" },
  { value: "behavior", label: "Behavior-heavy district" },
  { value: "executive", label: "Executive overview (balanced)" },
];

interface CustomSeedFormProps {
  form: CustomSeedForm;
  onChange: (next: CustomSeedForm) => void;
  onSubmit: () => void;
  submitting: boolean;
}

function CustomSeedForm({ form, onChange, onSubmit, submitting }: CustomSeedFormProps) {
  const set = <K extends keyof CustomSeedForm>(k: K, v: CustomSeedForm[K]) =>
    onChange({ ...form, [k]: v });
  const num = (k: keyof CustomSeedForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    if (Number.isFinite(n)) set(k, n as CustomSeedForm[typeof k]);
  };

  const NumField = ({
    label, k, min, max, step = 1, hint,
  }: { label: string; k: keyof CustomSeedForm; min: number; max: number; step?: number; hint?: string }) => (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-700">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={form[k] as number}
        onChange={num(k)}
        className="mt-0.5 block w-full rounded border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
        data-testid={`input-seed-${k}`}
      />
      {hint && <span className="text-[10px] text-gray-500">{hint}</span>}
    </label>
  );

  const IntensitySelect = ({ label, k }: { label: string; k: keyof CustomSeedForm }) => (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-700">{label}</span>
      <select
        value={form[k] as string}
        onChange={(e) => set(k, e.target.value as CustomSeedForm[typeof k])}
        className="mt-0.5 block w-full rounded border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
        data-testid={`select-seed-${k}`}
      >
        {INTENSITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  return (
    <form
      className="mt-3 space-y-4"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      data-testid="form-custom-seed"
    >
      <Section title="District basics">
        <label className="block sm:col-span-2">
          <span className="text-[11px] font-medium text-gray-700">District display name (optional)</span>
          <input
            type="text"
            value={form.districtName}
            onChange={(e) => set("districtName", e.target.value)}
            placeholder="e.g. MetroWest Collaborative"
            className="mt-0.5 block w-full rounded border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
            data-testid="input-seed-districtName"
          />
        </label>
        <NumField label="Schools" k="schoolCount" min={1} max={12} />
        <NumField label="SPED students" k="targetStudents" min={5} max={2000} />
        <NumField label="Avg goals / student" k="avgGoalsPerStudent" min={1} max={25} />
        <NumField label="Avg required min / week" k="avgRequiredMinutesPerWeek" min={30} max={300} />
        <NumField label="Backfill (months)" k="backfillMonths" min={1} max={12} />
      </Section>

      <Section title="Staffing">
        <NumField label="Case managers" k="caseManagerCount" min={0} max={200} />
        <NumField label="Related-service providers" k="providerCount" min={0} max={200} hint="Speech / OT / PT / Counselor — split evenly" />
        <NumField label="Paraprofessionals" k="paraCount" min={0} max={200} />
        <NumField label="BCBAs" k="bcbaCount" min={0} max={50} />
      </Section>

      <Section title="District health (drives compliance %, on-time logging, exposure)">
        <IntensitySelect label="Compliance health" k="complianceHealth" />
        <IntensitySelect label="Staffing strain" k="staffingStrain" />
        <IntensitySelect label="Documentation quality" k="documentationQuality" />
        <IntensitySelect label="Compensatory-ed exposure" k="compensatoryExposure" />
        <IntensitySelect label="Behavior intensity" k="behaviorIntensity" />
      </Section>

      <Section title="Demo story" cols={1}>
        <label className="block">
          <span className="text-[11px] font-medium text-gray-700">What story should this demo tell?</span>
          <select
            value={form.demoEmphasis}
            onChange={(e) => set("demoEmphasis", e.target.value as DemoEmphasis)}
            className="mt-0.5 block w-full rounded border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
            data-testid="select-seed-demoEmphasis"
          >
            {EMPHASIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="text-[10px] text-gray-500">Boosts the headline scenarios for the chosen narrative.</span>
        </label>
      </Section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
          data-testid="button-seed-custom"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Seed this district
        </button>
      </div>
    </form>
  );
}

function Section({ title, children, cols = 3 }: { title: string; children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  const grid = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3";
  return (
    <fieldset className="rounded-lg border border-gray-200 bg-white/60 p-3">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">{title}</legend>
      <div className={`grid ${grid} gap-3`}>{children}</div>
    </fieldset>
  );
}
