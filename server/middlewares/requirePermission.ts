import type { NextFunction, Request, Response } from "express";

const ALLOWED_MODULES = new Set(["balance", "orders", "users", "products"]);
const PRIVILEGED_ROLES = new Set(["director", "superadmin"]);

function requirePermission(moduleName: string) {
  const normalizedModule = String(moduleName || "").trim().toLowerCase();

  return function permissionMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!ALLOWED_MODULES.has(normalizedModule)) {
      return res.status(403).json({ error: "ADMIN_PERMISSION_FORBIDDEN" });
    }

    const role = String(req.admin?.role || "").trim().toLowerCase();
    if (PRIVILEGED_ROLES.has(role)) {
      return next();
    }

    const permissions = Array.isArray(req.admin?.permissions) ? req.admin?.permissions : [];
    if (permissions.includes(normalizedModule as "balance" | "orders" | "users" | "products")) {
      return next();
    }

    return res.status(403).json({ error: "ADMIN_PERMISSION_FORBIDDEN" });
  };
}

module.exports = {
  requirePermission,
};
