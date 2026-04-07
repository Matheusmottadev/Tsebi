export {};

import type { Request } from "express";

const { listPrivilegedAdmins, findAdminAccessByEmail } = require("./admin-access-repository");
const { createAdminNotifications } = require("./admin-notifications-repository");
const { insertOpsAuditLog } = require("./ops-audit-repository");
const { normalizeEmail } = require("../user-repository");

const PASSWORD_STEP_UP_TTL_MS = 10 * 60 * 1000;
const MFA_STEP_UP_TTL_MS = 15 * 60 * 1000;

type StepUpLevel = "password" | "mfa";

type StepUpSession = {
  level: StepUpLevel;
  verifiedAt: number;
  adminId: string | null;
  userId: string | null;
};

function normalizeStepUpLevel(value: unknown): StepUpLevel | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "password" || normalized === "mfa") return normalized as StepUpLevel;
  return null;
}

function getStepUpTtlMs(level: StepUpLevel): number {
  return level === "mfa" ? MFA_STEP_UP_TTL_MS : PASSWORD_STEP_UP_TTL_MS;
}

function buildSecurityMeta(req: any, extra: Record<string, unknown> = {}) {
  return {
    ip: String(req.ip || ""),
    userAgent: String(req.headers?.["user-agent"] || ""),
    route: String(req.originalUrl || req.url || ""),
    ...extra,
  };
}

function readAdminStepUp(req: Request & { session?: any }): StepUpSession | null {
  const raw = req.session?.adminAuth?.stepUp;
  if (!raw || typeof raw !== "object") return null;
  const level = normalizeStepUpLevel(raw.level);
  const verifiedAt = Number(raw.verifiedAt || 0);
  if (!level || !Number.isFinite(verifiedAt) || verifiedAt <= 0) return null;
  return {
    level,
    verifiedAt,
    adminId: raw.adminId ? String(raw.adminId) : null,
    userId: raw.userId ? String(raw.userId) : null,
  };
}

function clearAdminStepUp(req: Request & { session?: any }): void {
  if (!req.session?.adminAuth || typeof req.session.adminAuth !== "object") return;
  delete req.session.adminAuth.stepUp;
}

function grantAdminStepUp(req: any, level: StepUpLevel): StepUpSession | null {
  if (!req.session?.adminAuth || typeof req.session.adminAuth !== "object") return null;
  const nextValue: StepUpSession = {
    level,
    verifiedAt: Date.now(),
    adminId: req.admin?.id ? String(req.admin.id) : null,
    userId: req.adminUser?.id ? String(req.adminUser.id) : req.session.adminAuth.userId ? String(req.session.adminAuth.userId) : null,
  };
  req.session.adminAuth = {
    ...req.session.adminAuth,
    stepUp: nextValue,
  };
  return nextValue;
}

async function persistAdminStepUpSession(req: any): Promise<boolean> {
  if (!req?.session || typeof req.session.save !== "function") return false;
  return new Promise((resolve) => {
    req.session.save((error: any) => resolve(!error));
  });
}

function hasValidAdminStepUp(req: any, requiredLevel: StepUpLevel): boolean {
  const stepUp = readAdminStepUp(req);
  if (!stepUp) return false;

  const currentAdminId = req.admin?.id ? String(req.admin.id) : null;
  const currentUserId = req.adminUser?.id ? String(req.adminUser.id) : req.session?.adminAuth?.userId ? String(req.session.adminAuth.userId) : null;

  if (currentAdminId && stepUp.adminId && currentAdminId !== stepUp.adminId) return false;
  if (currentUserId && stepUp.userId && currentUserId !== stepUp.userId) return false;
  if (Date.now() - stepUp.verifiedAt > getStepUpTtlMs(stepUp.level)) return false;

  if (requiredLevel === "password") {
    return stepUp.level === "password" || stepUp.level === "mfa";
  }
  return stepUp.level === "mfa";
}

async function notifyPrivilegedAdmins(payload: {
  title: string;
  message: string;
  referenceId?: string | null;
  excludeAdminIds?: string[];
}) {
  const privileged = await listPrivilegedAdmins();
  const excluded = new Set((payload.excludeAdminIds || []).map((value) => String(value || "").trim()).filter(Boolean));
  const targetIds = privileged
    .map((entry: any) => String(entry.id || "").trim())
    .filter((value: string) => value && !excluded.has(value));
  if (!targetIds.length) return 0;
  return createAdminNotifications(targetIds, {
    type: "security_alert",
    title: payload.title,
    message: payload.message,
    referenceId: payload.referenceId || null,
  });
}

async function recordAdminSecurityAlert(input: {
  req?: any;
  performedBy?: string | null;
  email?: string;
  title: string;
  message: string;
  action?: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  notify?: boolean;
  excludeAdminIds?: string[];
}) {
  const normalizedEmail = normalizeEmail(String(input.email || ""));
  let performedBy = String(input.performedBy || "").trim() || "";

  if (!performedBy && normalizedEmail) {
    try {
      const adminAccess = await findAdminAccessByEmail(normalizedEmail);
      if (adminAccess?.id) performedBy = String(adminAccess.id || "").trim();
    } catch {}
  }

  if (performedBy) {
    await insertOpsAuditLog({
      action: String(input.action || "ADMIN_SECURITY_ALERT"),
      performedBy,
      targetType: input.targetType || "admin_security",
      targetId: input.targetId || null,
      beforeState: null,
      afterState: {
        title: input.title,
        message: input.message,
      },
      metadata: buildSecurityMeta(input.req || {}, {
        email: normalizedEmail || null,
        ...input.metadata,
      }),
    }).catch(() => {});
  }

  if (input.notify !== false) {
    await notifyPrivilegedAdmins({
      title: input.title,
      message: input.message,
      excludeAdminIds: input.excludeAdminIds,
    }).catch(() => {});
  }
}

module.exports = {
  PASSWORD_STEP_UP_TTL_MS,
  MFA_STEP_UP_TTL_MS,
  readAdminStepUp,
  clearAdminStepUp,
  grantAdminStepUp,
  persistAdminStepUpSession,
  hasValidAdminStepUp,
  recordAdminSecurityAlert,
};
