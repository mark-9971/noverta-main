import { Bip, STATUS_LABELS, esc, formatDate } from "./types";

export function printBip(bip: Bip) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>BIP - ${esc(bip.targetBehavior)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;color:#1a1a1a;line-height:1.6}
  h1{font-size:20px;margin-bottom:4px;color:#111}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:0.5px;color:#666;margin-top:24px;margin-bottom:8px;border-bottom:1px solid #e5e5e5;padding-bottom:4px}
  .meta{font-size:12px;color:#888;margin-bottom:24px}
  .field{margin-bottom:16px}
  .field-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:2px}
  .field-value{font-size:14px;white-space:pre-wrap}
  @media print{body{padding:20px}h1{font-size:18px}}
</style></head><body>
<h1>Behavior Intervention Plan</h1>
<div class="meta">
  Version ${bip.version} &bull; Status: ${esc(STATUS_LABELS[bip.status] || bip.status)} &bull;
  ${bip.createdByName ? `Created by ${esc(bip.createdByName)} &bull; ` : ""}
  Created ${formatDate(bip.createdAt)}
  ${bip.effectiveDate ? ` &bull; Effective ${formatDate(bip.effectiveDate)}` : ""}
  ${bip.reviewDate ? ` &bull; Review by ${formatDate(bip.reviewDate)}` : ""}
</div>

<h2>Target Behavior</h2>
<div class="field"><div class="field-label">Behavior</div><div class="field-value">${esc(bip.targetBehavior)}</div></div>
<div class="field"><div class="field-label">Operational Definition</div><div class="field-value">${esc(bip.operationalDefinition)}</div></div>
<div class="field"><div class="field-label">Hypothesized Function</div><div class="field-value">${esc(bip.hypothesizedFunction)}</div></div>

<h2>Intervention Strategies</h2>
<div class="field"><div class="field-label">Replacement Behaviors</div><div class="field-value">${esc(bip.replacementBehaviors)}</div></div>
<div class="field"><div class="field-label">Prevention / Antecedent Strategies</div><div class="field-value">${esc(bip.preventionStrategies)}</div></div>
<div class="field"><div class="field-label">Teaching Strategies</div><div class="field-value">${esc(bip.teachingStrategies)}</div></div>
<div class="field"><div class="field-label">Consequence Strategies</div><div class="field-value">${esc(bip.consequenceStrategies)}</div></div>

<h2>Reinforcement & Crisis</h2>
<div class="field"><div class="field-label">Reinforcement Schedule</div><div class="field-value">${esc(bip.reinforcementSchedule)}</div></div>
<div class="field"><div class="field-label">Crisis Plan</div><div class="field-value">${esc(bip.crisisPlan)}</div></div>

<h2>Data Collection & Progress</h2>
<div class="field"><div class="field-label">Data Collection Method</div><div class="field-value">${esc(bip.dataCollectionMethod)}</div></div>
<div class="field"><div class="field-label">Progress Criteria</div><div class="field-value">${esc(bip.progressCriteria)}</div></div>

${bip.implementationNotes ? `<h2>Implementation Notes</h2><div class="field"><div class="field-value">${esc(bip.implementationNotes)}</div></div>` : ""}
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}
