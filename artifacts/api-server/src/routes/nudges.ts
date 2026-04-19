/**
 * Provider activation nudges (Task #420) — HTTP surface.
 *
 * Two endpoints:
 *  - GET  /nudges/snooze/:token   PUBLIC — token IS the capability. Sets a
 *                                  one-week snooze on the matching staff row.
 *  - GET  /pilot-status/nudge-stats AUTH — returns the "providers nudged this
 *                                          week" count for the caller's
 *                                          district. Used by PilotAdminHome.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { applySnoozeForToken, countProvidersNudgedThisWeek } from "../lib/providerActivationNudges";

// --------------------------------------------------------------------------
// Public router — no Clerk auth required (token is the capability).
// --------------------------------------------------------------------------
const publicRouter: IRouter = Router();

publicRouter.get("/nudges/snooze/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "");
  if (!token || token.length < 16 || token.length > 128) {
    res.status(400).type("text/html").send(snoozePage({
      ok: false,
      title: "Invalid snooze link",
      body: "This snooze link doesn't look right. Please open the email again and click the link directly.",
    }));
    return;
  }
  const result = await applySnoozeForToken(token);
  if (!result) {
    res.status(404).type("text/html").send(snoozePage({
      ok: false,
      title: "Snooze link not recognized",
      body: "We couldn't match this snooze link to a provider. It may have been regenerated. You can ignore the next nudge to effectively snooze.",
    }));
    return;
  }
  const until = result.snoozedUntil.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  res.type("text/html").send(snoozePage({
    ok: true,
    title: "Nudges snoozed",
    body: `You won't receive activation nudges until <strong>${until}</strong>. Thanks for letting us know!`,
  }));
});

function snoozePage(opts: { ok: boolean; title: string; body: string }): string {
  const accent = opts.ok ? "#0f766e" : "#b45309";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${opts.title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:Arial,sans-serif;background:#f9fafb;color:#111;margin:0;padding:48px 16px}
.card{max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
.header{background:${accent};color:#fff;padding:20px 24px}
.header h1{margin:0;font-size:18px}
.body{padding:24px;font-size:14px;line-height:1.55;color:#374151}
.footer{padding:14px 24px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af}</style></head>
<body><div class="card">
<div class="header"><h1>${opts.title}</h1></div>
<div class="body">${opts.body}</div>
<div class="footer">Trellis SPED Compliance Platform</div>
</div></body></html>`;
}

// --------------------------------------------------------------------------
// Authenticated router — mounted under /api with district scope.
// --------------------------------------------------------------------------
const authedRouter: IRouter = Router();

authedRouter.get("/pilot-status/nudge-stats", async (req: Request, res: Response) => {
  const districtId = (req as any).tenantDistrictId as number | undefined | null;
  if (!districtId) {
    res.status(400).json({ error: "district scope required" });
    return;
  }
  try {
    const providersNudgedThisWeek = await countProvidersNudgedThisWeek(districtId);
    res.json({ providersNudgedThisWeek });
  } catch (err) {
    console.error("[nudges] stats error:", err);
    res.status(500).json({ error: "failed to compute nudge stats" });
  }
});

export { publicRouter as nudgesPublicRouter, authedRouter as nudgesAuthedRouter };
