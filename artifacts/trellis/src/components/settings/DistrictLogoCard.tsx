import { useEffect, useState } from "react";
import { Image as ImageIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface DistrictResponse {
  id: number;
  name: string;
  logoUrl: string | null;
}

export default function DistrictLogoCard() {
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [districtName, setDistrictName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [initialLogoUrl, setInitialLogoUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await authFetch("/api/district-data/status");
        if (!statusRes.ok) throw new Error("Could not resolve current district");
        const status = await statusRes.json() as { districtId?: number };
        if (!status.districtId) throw new Error("No district context");
        const dRes = await authFetch(`/api/districts/${status.districtId}`);
        if (!dRes.ok) throw new Error("Could not load district");
        const d = await dRes.json() as DistrictResponse;
        if (cancelled) return;
        setDistrictId(d.id);
        setDistrictName(d.name);
        setLogoUrl(d.logoUrl ?? "");
        setInitialLogoUrl(d.logoUrl ?? "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load district");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const trimmed = logoUrl.trim();
  const dirty = trimmed !== initialLogoUrl;
  const valid = trimmed === ""
    || /^https?:\/\//i.test(trimmed)
    || /^data:image\/(png|jpeg|jpg|gif|svg\+xml|webp);base64,/i.test(trimmed);

  async function save() {
    if (districtId === null || !valid) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/districts/${districtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: trimmed === "" ? null : trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save logo");
      }
      setInitialLogoUrl(trimmed);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save logo");
    } finally {
      setSaving(false);
    }
  }

  function clear() {
    setLogoUrl("");
    setPreviewError(false);
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-xs text-gray-400">Loading district branding…</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
      data-testid="card-district-logo"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">District logo</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Shown in the header of the executive summary PDF{districtName ? ` for ${districtName}` : ""}.
            Leave blank to use a text-only header.
          </p>
        </div>
        <ImageIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Logo image URL
        </label>
        <input
          type="url"
          value={logoUrl}
          onChange={(e) => { setLogoUrl(e.target.value); setPreviewError(false); }}
          placeholder="https://example.org/logo.png"
          data-testid="input-district-logo-url"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
        />
        {!valid && trimmed.length > 0 && (
          <p className="text-xs text-red-600">
            Must be an http(s) URL or a data:image/* URI.
          </p>
        )}
        <p className="text-[11px] text-gray-400">
          Use a high-resolution PNG or SVG hosted on your district website. The image is rendered up
          to roughly 56 px tall in the PDF header.
        </p>
      </div>

      {trimmed && valid && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Preview</div>
          {previewError ? (
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <AlertCircle className="w-3.5 h-3.5" />
              Couldn't load the image. Check the URL and that it allows hotlinking.
            </div>
          ) : (
            <img
              src={trimmed}
              alt="District logo preview"
              onError={() => setPreviewError(true)}
              className="max-h-14 max-w-[180px] object-contain bg-white border border-gray-200 rounded p-1"
              data-testid="img-district-logo-preview"
            />
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || !valid || saving || districtId === null}
          data-testid="button-save-district-logo"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {trimmed && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            data-testid="button-clear-district-logo"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Remove
          </button>
        )}
        {savedAt !== null && !saving && !dirty && !error && (
          <span
            className="inline-flex items-center gap-1 text-xs text-emerald-700"
            data-testid="district-logo-saved"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
