import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Sprout, CheckCircle, FileText, Loader2, AlertTriangle, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SignatureInfo {
  id: number;
  status: string;
  recipientName: string;
  document: {
    id: number;
    title: string;
    category: string;
    fileName: string;
    contentType: string;
    fileSize: number;
  } | null;
  signedAt: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdfContentType(contentType: string): boolean {
  return contentType === "application/pdf";
}

function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export default function SignDocumentPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const [info, setInfo] = useState<SignatureInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [showDocument, setShowDocument] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/signature-requests/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Signature request not found");
        const data = await res.json();
        setInfo(data);
        if (data.status === "signed") setSigned(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [loading, signed, showDocument]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasDrawn(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSubmit = async () => {
    if (!canvasRef.current || !token) return;
    setSubmitting(true);
    try {
      const signatureData = canvasRef.current.toDataURL("image/png");
      const res = await fetch(`/api/signature-requests/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit signature");
      }
      setSigned(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit signature");
    } finally {
      setSubmitting(false);
    }
  };

  const documentViewUrl = token ? `/api/signature-requests/${token}/document` : null;
  const canPreviewInline = info?.document?.contentType
    ? isPdfContentType(info.document.contentType) || isImageContentType(info.document.contentType)
    : false;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Sprout className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none">Trellis</h1>
          <p className="text-[12px] text-gray-400 leading-none mt-1">Service-minute compliance for SPED.</p>
        </div>
      </div>

      <Card className="w-full max-w-2xl">
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
              <p className="text-sm text-gray-500">Loading document...</p>
            </div>
          ) : error && !signed ? (
            <div className="flex flex-col items-center py-12">
              <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
              <p className="text-sm text-gray-700 font-medium">Unable to load</p>
              <p className="text-xs text-gray-500 mt-1">{error}</p>
            </div>
          ) : signed ? (
            <div className="flex flex-col items-center py-12">
              <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
              <h2 className="text-lg font-semibold text-gray-900">Document Signed</h2>
              <p className="text-sm text-gray-500 mt-1">Thank you. Your signature has been recorded.</p>
              {info?.document && (
                <div className="mt-4 text-xs text-gray-400 text-center">
                  <p>Document: {info.document.title}</p>
                  <p>Signed by: {info.recipientName}</p>
                </div>
              )}
            </div>
          ) : info ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">E-Signature Request</h2>
                <p className="text-sm text-gray-500 mt-1">Please review the document below, then provide your signature.</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-800">{info.document?.title || "Document"}</span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>File: {info.document?.fileName}{info.document?.fileSize ? ` (${formatFileSize(info.document.fileSize)})` : ""}</p>
                  <p>Category: {info.document?.category?.replace(/_/g, " ")}</p>
                  <p>Signing as: <span className="font-medium text-gray-700">{info.recipientName}</span></p>
                </div>

                {documentViewUrl && (
                  <div className="flex items-center gap-2 pt-1">
                    {canPreviewInline && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setShowDocument(!showDocument)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        {showDocument ? "Hide Document" : "View Document"}
                      </Button>
                    )}
                    <a
                      href={documentViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  </div>
                )}
              </div>

              {showDocument && documentViewUrl && canPreviewInline && (
                <div className="border rounded-lg overflow-hidden bg-white">
                  {info.document?.contentType && isImageContentType(info.document.contentType) ? (
                    <img
                      src={documentViewUrl}
                      alt={info.document?.title || "Document"}
                      className="w-full max-h-[500px] object-contain"
                    />
                  ) : (
                    <iframe
                      src={documentViewUrl}
                      className="w-full border-0"
                      style={{ height: 500 }}
                      title="Document preview"
                    />
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Your Signature</label>
                  <button onClick={clearSignature} className="text-xs text-gray-400 hover:text-gray-600">
                    Clear
                  </button>
                </div>
                <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    className="w-full cursor-crosshair touch-none"
                    style={{ height: 150 }}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Draw your signature above using your mouse or touch screen</p>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!hasDrawn || submitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...</> : "Sign Document"}
              </Button>

              <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                By signing, you acknowledge that you have reviewed this document and agree to its contents.
                Your signature, IP address, and timestamp will be recorded.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
