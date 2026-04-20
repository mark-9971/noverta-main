import { useState } from "react";
import { toast } from "sonner";
import { getStudentProgressSummary, createProgressShareLink } from "@workspace/api-client-react";

export function useShareProgress(studentId: number) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSummary, setShareSummary] = useState<any>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareDays, setShareDays] = useState(30);

  async function handleShareProgress() {
    setShowShareModal(true);
    setShareLoading(true);
    setShareLink(null);
    setShareSummary(null);
    try {
      const data = await getStudentProgressSummary(studentId, { days: shareDays } as any);
      setShareSummary(data);
    } catch {}
    setShareLoading(false);
  }

  async function generateShareLink() {
    try {
      const data = await createProgressShareLink(studentId, { days: shareDays, expiresInHours: 72 } as any);
      const fullUrl = `${window.location.origin}${data.url}`;
      setShareLink(fullUrl);
      toast.success("Share link generated (expires in 72 hours)");
    } catch {
      toast.error("Failed to generate share link");
    }
  }

  function handlePrintSummary() {
    const w = window.open("", "_blank");
    if (!w || !shareSummary) return;
    const s = shareSummary;
    w.document.write(`<!DOCTYPE html><html><head><title>Progress Summary - ${s.student.name}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1f2937}
      h1{font-size:24px;border-bottom:2px solid #059669;padding-bottom:8px}
      h2{font-size:16px;color:#059669;margin-top:24px}
      table{width:100%;border-collapse:collapse;margin:8px 0}
      th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px}
      th{background:#f9fafb;font-weight:600}
      .meta{color:#6b7280;font-size:13px}
      .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600}
      .on_track{background:#ecfdf5;color:#059669}.at_risk{background:#fef3c7;color:#d97706}
      .out_of_compliance{background:#fef2f2;color:#dc2626}.completed{background:#ecfdf5;color:#059669}
      @media print{body{margin:0}}</style></head><body>
      <h1>Progress Summary</h1>
      <p class="meta">${s.student.name} | Grade ${s.student.grade} | ${s.student.school || ""}</p>
      <p class="meta">Report Period: ${s.reportPeriod.startDate} to ${s.reportPeriod.endDate} (${s.reportPeriod.days} days)</p>
      <h2>IEP Goals</h2>
      <table><tr><th>Area</th><th>#</th><th>Goal</th><th>Status</th></tr>
      ${s.goals.map((g: any) => `<tr><td>${g.goalArea}</td><td>${g.goalNumber}</td><td>${g.annualGoal}</td><td>${g.status}</td></tr>`).join("")}
      </table>
      <h2>Service Delivery</h2>
      <table><tr><th>Service</th><th>Required</th><th>Delivered</th><th>%</th><th>Status</th></tr>
      ${s.serviceDelivery.map((d: any) => `<tr><td>${d.serviceType}</td><td>${d.requiredMinutes} min</td><td>${d.deliveredMinutes} min</td><td>${d.percentComplete}%</td><td><span class="badge ${d.riskStatus}">${d.riskStatus.replace(/_/g, " ")}</span></td></tr>`).join("")}
      </table>
      ${s.behaviorData.length > 0 ? `<h2>Behavior Data Trends</h2>
      <table><tr><th>Target</th><th>Type</th><th>Baseline</th><th>Goal</th><th>Avg</th><th>Recent</th><th>Trend</th></tr>
      ${s.behaviorData.map((b: any) => `<tr><td>${b.targetName}</td><td>${b.measurementType}</td><td>${b.baselineValue}</td><td>${b.goalValue}</td><td>${b.average ?? "\u2014"}</td><td>${b.recentAverage ?? "\u2014"}</td><td>${b.trend}</td></tr>`).join("")}
      </table>` : ""}
      ${s.programData.length > 0 ? `<h2>Program/Academic Progress</h2>
      <table><tr><th>Target</th><th>Mastery</th><th>Avg %</th><th>Recent %</th><th>Trend</th></tr>
      ${s.programData.map((p: any) => `<tr><td>${p.targetName}</td><td>${p.masteryCriterion}%</td><td>${p.averagePercent ?? "\u2014"}</td><td>${p.recentAveragePercent ?? "\u2014"}</td><td>${p.trend}</td></tr>`).join("")}
      </table>` : ""}
      <p class="meta" style="margin-top:24px">Generated ${new Date().toLocaleDateString()}</p>
      </body></html>`);
    w.document.close();
    w.print();
  }

  return {
    showShareModal,
    setShowShareModal,
    shareSummary,
    shareLoading,
    shareLink,
    shareDays,
    setShareDays,
    handleShareProgress,
    generateShareLink,
    handlePrintSummary,
  };
}
