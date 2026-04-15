import { type Request, type Response, type NextFunction } from "express";
import { type TrellisRole, isRole } from "../lib/permissions";

export interface AuthedRequest extends Request {
  userId: string;
  trellisRole: TrellisRole;
}

interface DevSessionPayload {
  userId: string;
  role: string;
  name?: string;
}

function parseDevToken(req: Request): { userId: string; role: TrellisRole } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const raw = Buffer.from(token, "base64").toString("utf-8");
    const payload: DevSessionPayload = JSON.parse(raw);
    if (!payload.userId || !isRole(payload.role)) return null;
    return { userId: payload.userId, role: payload.role as TrellisRole };
  } catch {
    return null;
  }
}

function extractAuth(req: Request): { userId: string; role: TrellisRole } | null {
  const dev = parseDevToken(req);
  if (dev) return dev;

  // Header-only fallback for dev convenience (no token set yet)
  if (process.env.NODE_ENV !== "production") {
    const demoRole = req.headers["x-demo-role"];
    const role = isRole(demoRole) ? (demoRole as TrellisRole) : "admin";
    return { userId: "dev-user", role };
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = extractAuth(req);
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as AuthedRequest).userId = auth.userId;
  (req as AuthedRequest).trellisRole = auth.role;
  next();
}

export function requireRoles(...allowedRoles: TrellisRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const authed = req as AuthedRequest;
      if (!allowedRoles.includes(authed.trellisRole)) {
        res.status(403).json({ error: "You don't have permission to access this resource" });
        return;
      }
      next();
    });
  };
}

export function requireMinRole(minRole: TrellisRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { ROLE_HIERARCHY } = require("../lib/permissions");
    requireAuth(req, res, () => {
      const authed = req as AuthedRequest;
      if (ROLE_HIERARCHY[authed.trellisRole] < ROLE_HIERARCHY[minRole]) {
        res.status(403).json({ error: "You don't have permission to access this resource" });
        return;
      }
      next();
    });
  };
}
