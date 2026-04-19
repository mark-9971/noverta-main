import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, CheckCircle2, AlertCircle, Upload, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface DistrictResponse {
  id: number;
  name: string;
  logoUrl: string | null;
}

const ALLOWED_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export default function DistrictLogoCard() {
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [districtName, setDistrictName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [initialLogoUrl, setInitialLogoUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    || /^data:image\/(png|jpeg|jpg|gif|svg\+xml|webp);base64,/i.test(trimmed)
    || /^\/api\/storage\/public-objects\/district-logos\//i.test(trimmed);

  async function persistLogo(value: string | null) {
    if (districtId === null) return;
    const res = await authFetch(`/api/districts/${districtId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to save logo");
    }
  }

  async function save() {
    if (districtId === null || !valid) return;
    setSaving(true);
    setError(null);
    try {
      await persistLogo(trimmed === "" ? null : trimmed);
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

  async function handleFile(file: File) {
    if (districtId === null) return;
    setError(null);
    setPreviewError(false);

    if (!ALLOWED_UPLOAD_TYPES.includes(file.type.toLowerCase())) {
      setError("Unsupported file type. Use PNG, JPG, SVG, or WEBP.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.`);
      return;
    }

    setUploading(true);
    try {
      const urlRes = await authFetch("/api/storage/uploads/district-logo-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      if (!urlRes.ok) {
        const data = await urlRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to start upload");
      }
      const { uploadURL, publicUrl } = await urlRes.json() as { uploadURL: string; publicUrl: string };

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (HTTP ${putRes.status})`);
      }

      // Persist the new logo URL on the district immediately so the change
      // sticks even if the user navigates away without hitting Save.
      await persistLogo(publicUrl);
      setLogoUrl(publicUrl);
      setInitialLogoUrl(publicUrl);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
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

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        data-testid="dropzone-district-logo"
        className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragActive
            ? "border-emerald-400 bg-emerald-50"
            : "border-gray-200 bg-gray-50 hover:bg-gray-100"
        }`}
      >
        {uploading ? (
          <>
            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
            <p className="text-xs text-gray-600">Uploading logo…</p>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-gray-400" />
            <p className="text-xs text-gray-700">
              Drag and drop a logo file here, or
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={districtId === null}
                data-testid="button-choose-district-logo"
                className="ml-1 font-medium text-emerald-700 hover:underline disabled:opacity-50"
              >
                choose a file
              </button>
            </p>
            <p className="text-[11px] text-gray-400">
              PNG, JPG, SVG, or WEBP up to 2 MB.
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_UPLOAD_TYPES.join(",")}
          className="hidden"
          data-testid="input-district-logo-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Or paste a logo image URL
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
            Must be an http(s) URL, a data:image/* URI, or an uploaded asset path.
          </p>
        )}
        <p className="text-[11px] text-gray-400">
          The image is rendered up to roughly 56 px tall in the PDF header.
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
          disabled={!dirty || !valid || saving || uploading || districtId === null}
          data-testid="button-save-district-logo"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {trimmed && (
          <button
            type="button"
            onClick={clear}
            disabled={saving || uploading}
            data-testid="button-clear-district-logo"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Remove
          </button>
        )}
        {savedAt !== null && !saving && !uploading && !dirty && !error && (
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
