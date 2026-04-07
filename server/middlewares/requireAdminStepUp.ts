import type { NextFunction, Request, Response } from "express";

const { hasValidAdminStepUp } = require("../lib/admin-step-up");

type StepUpLevel = "password" | "mfa";

type StepUpResolver = (req: Request) => StepUpLevel | null | Promise<StepUpLevel | null>;

function requireAdminStepUp(levelOrResolver: StepUpLevel | StepUpResolver, action = "") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const method = String(req.method || "").toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();

    const requiredLevel =
      typeof levelOrResolver === "function"
        ? await levelOrResolver(req)
        : levelOrResolver;

    if (!requiredLevel) return next();
    if (hasValidAdminStepUp(req, requiredLevel)) return next();

    return res.status(403).json({
      error: "ADMIN_STEP_UP_REQUIRED",
      stepUpType: requiredLevel,
      action: String(action || req.originalUrl || req.url || ""),
      message:
        requiredLevel === "mfa"
          ? "Confirme esta ação com o código do autenticador."
          : "Confirme esta ação com sua senha de login.",
    });
  };
}

module.exports = {
  requireAdminStepUp,
};
