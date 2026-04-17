import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Loader2, Upload, X, Plus, ArrowRight } from "lucide-react";
import { SIS_PROVIDERS, type SISProvider } from "./constants";

export interface SisStepProps {
  districtName: string;
  setDistrictName: (v: string) => void;
  sisProvider: SISProvider | null;
  setSisProvider: (v: SISProvider) => void;
  sisApiUrl: string;
  setSisApiUrl: (v: string) => void;
  sisClientId: string;
  setSisClientId: (v: string) => void;
  sisClientSecret: string;
  setSisClientSecret: (v: string) => void;
  csvRows: Record<string, string>[];
  setCsvRows: (rows: Record<string, string>[]) => void;
  schoolNames: string[];
  setSchoolNames: (n: string[]) => void;
  syncProgress: number | null;
  saving: boolean;
  onConnect: () => void;
  onSkip: () => void;
}

export function SisStep(p: SisStepProps) {
  const addSchoolName = () => p.setSchoolNames([...p.schoolNames, ""]);
  const removeSchoolName = (i: number) => p.setSchoolNames(p.schoolNames.filter((_, x) => x !== i));

  return (
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
            value={p.districtName}
            onChange={e => p.setDistrictName(e.target.value)}
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
                onClick={() => p.setSisProvider(provider.id)}
                className={`p-4 border rounded-lg text-left transition-all ${
                  p.sisProvider === provider.id
                    ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{provider.name}</p>
                  {provider.inPilot && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">Pilot</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{provider.description}</p>
              </button>
            ))}
          </div>
        </div>

        {p.sisProvider && p.sisProvider !== "csv" && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Connection Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">API URL / Base URL</label>
                <input
                  type="text"
                  value={p.sisApiUrl}
                  onChange={e => p.setSisApiUrl(e.target.value)}
                  placeholder={`https://${p.sisProvider}.yourdistrict.com/api`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Client ID</label>
                <input
                  type="text"
                  value={p.sisClientId}
                  onChange={e => p.setSisClientId(e.target.value)}
                  placeholder="Client ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Client Secret</label>
                <input
                  type="password"
                  value={p.sisClientSecret}
                  onChange={e => p.setSisClientSecret(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Credentials are stored securely and used only to sync roster data from your SIS.
            </p>
          </div>
        )}

        {p.sisProvider === "csv" && (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">Upload your roster CSV</p>
            <p className="text-xs text-gray-500 mt-1">
              Include columns: student_id, first_name, last_name, grade, school
            </p>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              id="csv-upload"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const text = ev.target?.result as string;
                  if (!text) return;
                  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
                  if (lines.length < 2) return;
                  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
                  const parsed = lines.slice(1).map(line => {
                    const cols = line.split(",");
                    const row: Record<string, string> = {};
                    headers.forEach((h, i) => { row[h] = cols[i]?.trim() || ""; });
                    return row;
                  });
                  p.setCsvRows(parsed);
                  const csvSchools = [...new Set(parsed.map(r => r.school || "Main Campus").filter(Boolean))];
                  p.setSchoolNames(csvSchools.length > 0 ? csvSchools : ["Main Campus"]);
                };
                reader.readAsText(file);
              }}
            />
            <label
              htmlFor="csv-upload"
              className="mt-3 inline-block px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Choose File
            </label>
            {p.csvRows.length > 0 && (
              <p className="mt-2 text-xs text-emerald-600 font-medium">
                {p.csvRows.length} rows loaded from CSV
              </p>
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Schools in this District</label>
          <div className="space-y-2">
            {p.schoolNames.map((name, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={e => {
                    const updated = [...p.schoolNames];
                    updated[i] = e.target.value;
                    p.setSchoolNames(updated);
                  }}
                  placeholder={`School ${i + 1}`}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                {p.schoolNames.length > 1 && (
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

        {p.syncProgress !== null && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Syncing roster data…</span>
              <span>{Math.round(p.syncProgress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${p.syncProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button onClick={p.onSkip} className="text-sm text-gray-500 hover:text-gray-700">
            Skip for now
          </button>
          <button
            onClick={p.onConnect}
            disabled={!p.sisProvider || !p.districtName.trim() || p.saving}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {p.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Connect & Sync
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
