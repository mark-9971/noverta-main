import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import {
  CheckCircle, Circle, ArrowRight, ArrowLeft, Database, Building2,
  Settings2, UserPlus, Loader2, Upload, ChevronDown, X, Plus, Trash2,
} from "lucide-react";

type SISProvider = "powerschool" | "infinite_campus" | "skyward" | "csv";

interface OnboardingStatus {
  sisConnected: boolean;
  districtConfirmed: boolean;
  schoolsConfigured: boolean;
  serviceTypesConfigured: boolean;
  staffInvited: boolean;
  isComplete: boolean;
  completedCount: number;
  totalSteps: number;
  counts: {
    districts: number;
    schools: number;
    serviceTypes: number;
    staff: number;
  };
}

const SIS_PROVIDERS = [
  { id: "powerschool" as SISProvider, name: "PowerSchool", description: "REST API with OAuth2 client credentials" },
  { id: "infinite_campus" as SISProvider, name: "Infinite Campus", description: "REST API integration" },
  { id: "skyward" as SISProvider, name: "Skyward", description: "REST/SOAP connector" },
  { id: "csv" as SISProvider, name: "CSV Upload", description: "Upload a roster file manually" },
];

const DEFAULT_SERVICE_TYPES = [
  { name: "Speech-Language Therapy", category: "speech", checked: true },
  { name: "Occupational Therapy", category: "ot", checked: true },
  { name: "Physical Therapy", category: "pt", checked: true },
  { name: "Applied Behavior Analysis", category: "aba", checked: true },
  { name: "Counseling", category: "counseling", checked: true },
  { name: "Social Skills Group", category: "counseling", checked: false },
  { name: "Reading Specialist", category: "other", checked: false },
  { name: "Paraprofessional Support", category: "para_support", checked: true },
  { name: "Adaptive PE", category: "other", checked: false },
  { name: "Vision Services", category: "other", checked: false },
  { name: "Hearing/Audiology", category: "other", checked: false },
  { name: "Assistive Technology", category: "other", checked: false },
];

const STAFF_ROLES = [
  { value: "sped_teacher", label: "SPED Teacher" },
  { value: "bcba", label: "BCBA" },
  { value: "provider", label: "Provider / Therapist" },
  { value: "para", label: "Paraprofessional" },
  { value: "case_manager", label: "Case Manager" },
  { value: "coordinator", label: "Coordinator" },
];

interface StaffInvite {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

const STEPS = [
  { id: "sis", label: "Connect SIS", icon: Database, description: "Connect your student information system" },
  { id: "district", label: "District & Schools", icon: Building2, description: "Confirm district and school details" },
  { id: "services", label: "Service Types", icon: Settings2, description: "Configure SPED service types" },
  { id: "staff", label: "Invite Staff", icon: UserPlus, description: "Invite your team members" },
];

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

  const [schoolYear, setSchoolYear] = useState("2025–2026");
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
        if (data.sisConnected) {
          if (!data.serviceTypesConfigured) setCurrentStep(2);
          else if (!data.staffInvited) setCurrentStep(3);
          else setCurrentStep(0);
        }
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

  async function handleSISConnect() {
    if (!sisProvider || !districtName.trim()) return;
    setSaving(true);
    setError(null);
    setSyncProgress(0);

    const interval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev === null || prev >= 90) return prev;
        return prev + Math.random() * 25;
      });
    }, 400);

    try {
      const res = await authFetch("/api/onboarding/sis-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: sisProvider,
          districtName: districtName.trim(),
          schools: schoolNames.filter(s => s.trim()),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to connect SIS");
      }
      const data = await res.json();
      setSyncProgress(100);
      clearInterval(interval);

      setEditingSchools(data.schools.map((s: { id: number; name: string }) => ({ id: s.id, name: s.name })));

      await fetchStatus();
      setTimeout(() => {
        setSyncProgress(null);
        setCurrentStep(1);
      }, 600);
    } catch (e: unknown) {
      clearInterval(interval);
      setSyncProgress(null);
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDistrictConfirm() {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/onboarding/district-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          districtName: districtName.trim() || "My District",
          schoolYear,
          schools: editingSchools,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save district info");
      }
      await fetchStatus();
      setCurrentStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleServiceTypes() {
    const selected = serviceTypes.filter(st => st.checked);
    if (selected.length === 0) {
      setError("Select at least one service type");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/onboarding/service-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTypes: selected.map(st => ({ name: st.name, category: st.category })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save service types");
      }
      await fetchStatus();
      setCurrentStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStaffInvite() {
    const valid = staffInvites.filter(i => i.email.trim() && i.firstName.trim() && i.lastName.trim());
    if (valid.length === 0) {
      setError("Add at least one staff member with name and email");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/onboarding/invite-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invites: valid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to invite staff");
      }
      await fetchStatus();
      navigate("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setSaving(false);
    }
  }

  function addSchoolName() {
    setSchoolNames([...schoolNames, ""]);
  }

  function removeSchoolName(index: number) {
    setSchoolNames(schoolNames.filter((_, i) => i !== index));
  }

  function addStaffInvite() {
    setStaffInvites([...staffInvites, { firstName: "", lastName: "", email: "", role: "sped_teacher" }]);
  }

  function removeStaffInvite(index: number) {
    setStaffInvites(staffInvites.filter((_, i) => i !== index));
  }

  function updateStaffInvite(index: number, field: keyof StaffInvite, value: string) {
    setStaffInvites(staffInvites.map((inv, i) => i === index ? { ...inv, [field]: value } : inv));
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

      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((step, i) => {
          const done = i < currentStep || (status && [
            status.sisConnected,
            status.districtConfirmed && status.schoolsConfigured,
            status.serviceTypesConfigured,
            status.staffInvited,
          ][i]);
          const active = i === currentStep;
          return (
            <button
              key={step.id}
              onClick={() => setCurrentStep(i)}
              className="flex-1 group"
            >
              <div className={`h-1.5 rounded-full mb-2 transition-colors ${
                done ? "bg-emerald-500" : active ? "bg-emerald-300" : "bg-gray-200"
              }`} />
              <div className="flex items-center gap-1.5">
                {done ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Circle className={`w-4 h-4 flex-shrink-0 ${active ? "text-emerald-500" : "text-gray-300"}`} />
                )}
                <span className={`text-xs font-medium truncate ${
                  active ? "text-gray-900" : done ? "text-emerald-600" : "text-gray-400"
                }`}>
                  {step.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {currentStep === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              Connect Your Student Information System
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Trellis pulls student rosters and staff directories from your SIS so you don't have to enter data manually.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">District Name</label>
              <input
                type="text"
                value={districtName}
                onChange={e => setDistrictName(e.target.value)}
                placeholder="e.g. Jefferson Unified School District"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">SIS Provider</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SIS_PROVIDERS.map(provider => (
                  <button
                    key={provider.id}
                    onClick={() => setSisProvider(provider.id)}
                    className={`p-4 border rounded-lg text-left transition-all ${
                      sisProvider === provider.id
                        ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">{provider.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{provider.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {sisProvider && sisProvider !== "csv" && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">Connection Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">API URL / Base URL</label>
                    <input
                      type="text"
                      placeholder={`https://${sisProvider}.yourdistrict.com/api`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Client ID</label>
                    <input
                      type="text"
                      placeholder="Client ID"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-gray-500 block mb-1">Client Secret</label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {sisProvider === "csv" && (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Upload your roster CSV</p>
                <p className="text-xs text-gray-500 mt-1">
                  Include columns: student_id, first_name, last_name, grade, school
                </p>
                <button className="mt-3 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors">
                  Choose File
                </button>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Schools in this District</label>
              <div className="space-y-2">
                {schoolNames.map((name, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={e => {
                        const updated = [...schoolNames];
                        updated[i] = e.target.value;
                        setSchoolNames(updated);
                      }}
                      placeholder={`School ${i + 1}`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    {schoolNames.length > 1 && (
                      <button
                        onClick={() => removeSchoolName(i)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addSchoolName}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add another school
                </button>
              </div>
            </div>

            {syncProgress !== null && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Syncing roster data…</span>
                  <span>{Math.round(syncProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => navigate("/")}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Skip for now
              </button>
              <button
                onClick={handleSISConnect}
                disabled={!sisProvider || !districtName.trim() || saving}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Connect & Sync
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" />
              Confirm District & Schools
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Review the information pulled from your SIS. Make any corrections needed.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">District Name</label>
              <input
                type="text"
                value={districtName}
                onChange={e => setDistrictName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">School Year</label>
              <input
                type="text"
                value={schoolYear}
                onChange={e => setSchoolYear(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Schools</label>
              <div className="space-y-2">
                {editingSchools.map((school, i) => (
                  <div key={school.id || i} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <input
                      type="text"
                      value={school.name}
                      onChange={e => {
                        const updated = [...editingSchools];
                        updated[i] = { ...school, name: e.target.value };
                        setEditingSchools(updated);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentStep(0)}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={handleDistrictConfirm}
                disabled={saving}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Confirm & Continue
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-emerald-600" />
              Configure Service Types
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Select the SPED service types your district provides. You can add more later.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {serviceTypes.map((st, i) => (
                <label
                  key={st.name}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    st.checked
                      ? "border-emerald-500 bg-emerald-50/50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={st.checked}
                    onChange={e => {
                      const updated = [...serviceTypes];
                      updated[i] = { ...st, checked: e.target.checked };
                      setServiceTypes(updated);
                    }}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{st.name}</p>
                    <p className="text-[11px] text-gray-400 capitalize">{st.category.replace("_", " ")}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentStep(1)}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={handleServiceTypes}
                disabled={saving || serviceTypes.filter(s => s.checked).length === 0}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Save & Continue
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
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
            {staffInvites.map((invite, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3 relative">
                {staffInvites.length > 1 && (
                  <button
                    onClick={() => removeStaffInvite(i)}
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
                      onChange={e => updateStaffInvite(i, "firstName", e.target.value)}
                      placeholder="Jane"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Last Name</label>
                    <input
                      type="text"
                      value={invite.lastName}
                      onChange={e => updateStaffInvite(i, "lastName", e.target.value)}
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
                      onChange={e => updateStaffInvite(i, "email", e.target.value)}
                      placeholder="jane.smith@district.edu"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Role</label>
                    <div className="relative">
                      <select
                        value={invite.role}
                        onChange={e => updateStaffInvite(i, "role", e.target.value)}
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
              onClick={addStaffInvite}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add another staff member
            </button>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={() => navigate("/")}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Skip for now
                </button>
              </div>
              <button
                onClick={handleStaffInvite}
                disabled={saving}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Invite & Finish Setup
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
