import { type Request, type Response, type NextFunction } from "express";
import { type TrellisRole, isRole } from "../lib/permissions";
import { verifyToken } from "../routes/auth";

export interface AuthedRequest extends Request {
  userId: string;
  trellisRole: TrellisRole;
}

function extractAuth(req: Request): { userId: string; role: TrellisRole } | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const parsed = verifyToken(authHeader.slice(7));
    if (parsed) return { userId: parsed.userId, role: parsed.role };
  }

  // In non-production, accept an explicit x-demo-role header (must be valid).
  // There is NO default fallback — an invalid or missing role results in 401.
  if (process.env.NODE_ENV !== "production") {
    const demoRole = req.headers["x-demo-role"];
    if (isRole(demoRole)) {
      return { userId: "dev-user", role: demoRole as TrellisRole };
    }
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
