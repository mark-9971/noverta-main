import { Router, type IRouter } from "express";
import { createHmac } from "crypto";
import { isRole, type TrellisRole } from "../lib/permissions";

const router: IRouter = Router();

const DEV_SECRET = process.env.SESSION_SECRET || "trellis-dev-secret-change-in-prod";

export function signToken(payload: object): string {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", DEV_SECRET).update(json).digest("base64url");
  return `${json}.${sig}`;
}

export function verifyToken(token: string): { userId: string; name: string; role: TrellisRole } | null {
  if (!token) return null;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return null;
  const b64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expected = createHmac("sha256", DEV_SECRET).update(b64).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));
    if (!payload.userId || !isRole(payload.role)) return null;
    return { userId: payload.userId, name: payload.name || "User", role: payload.role as TrellisRole };
  } catch {
    return null;
  }
}

router.post("/login", (req, res): void => {
  const { name, role } = req.body as { name?: string; role?: string };

  const trimmedName = (name || "").trim();
  if (!trimmedName) {
    res.status(400).json({ error: "Name is required." });
    return;
  }
  if (!isRole(role)) {
    res.status(400).json({ error: "Invalid role." });
    return;
  }

  const payload = {
    userId: `dev-${Date.now()}`,
    name: trimmedName,
    role,
    iat: Math.floor(Date.now() / 1000),
  };

  const token = signToken(payload);
  res.json({ token, userId: payload.userId, name: trimmedName, role });
});

export default router;
