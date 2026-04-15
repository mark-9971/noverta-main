import { useState } from "react";
import { useLocation } from "wouter";
import { Sprout, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UserRole } from "@/lib/role-context";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrator" },
  { value: "case_manager", label: "Case Manager" },
  { value: "sped_teacher", label: "SPED Teacher" },
  { value: "bcba", label: "BCBA" },
  { value: "coordinator", label: "Coordinator" },
  { value: "provider", label: "Provider" },
  { value: "para", label: "Paraprofessional" },
  { value: "sped_student", label: "Student (SPED Portal)" },
];

export default function SignInPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError("Please enter your name."); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error || "Sign-in failed. Try again.");
        return;
      }
      const { token, role: confirmedRole } = await res.json() as { token: string; role: UserRole; userId: string; name: string };
      localStorage.setItem("trellis_session", token);
      localStorage.setItem("trellis_role", confirmedRole);
      setLocation(confirmedRole === "sped_student" ? "/sped-portal" : "/");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Sprout className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none">Trellis</h1>
          <p className="text-[12px] text-gray-400 leading-none mt-1">Built to support.</p>
        </div>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h2>
        <p className="text-sm text-gray-500 mb-6">Choose your name and role to continue.</p>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              placeholder="e.g. Sarah Chen"
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={v => setRole(v as UserRole)} disabled={loading}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Sign in to Trellis
          </Button>
        </form>
      </div>
    </div>
  );
}
