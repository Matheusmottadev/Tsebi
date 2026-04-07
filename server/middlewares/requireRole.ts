import type { NextFunction, Request, Response } from "express";

const ALLOWED_ROLES = new Set(["admin", "director", "superadmin"]);

function requireRole(roles: string[] = []) {
  const allowed = new Set(
    (Array.isArray(roles) ? roles : [])
      .map((role) => String(role || "").trim().toLowerCase())
      .filter((role) => ALLOWED_ROLES.has(role))
  );

  return function roleMiddleware(req: Request, res: Response, next: NextFunction) {
    const role = String(req.admin?.role || "").trim().toLowerCase();
    if (!role || !allowed.has(role)) {
      return res.status(403).json({ error: "ADMIN_ROLE_FORBIDDEN" });
    }
    return next();
  };
}

module.exports = {
  requireRole,
};
