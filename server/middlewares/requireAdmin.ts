import type { NextFunction, Request, Response } from "express";
const { findUserById, normalizeEmail, publicUser } = require("../user-repository");
const {
  csrfCookieName,
  getAdminIdleTimeoutMs,
  parseCookieHeader,
  readAdminEmailSet,
  generateCsrfToken,
  setAdminCsrfCookie,
  clearAdminCsrfCookie
} = require("../lib/admin-security");

function clearAdminSession(req: Request, res: Response): void {
  if (req.session && req.session.adminAuth) {
    delete req.session.adminAuth;
  }
  clearAdminCsrfCookie(res);
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const currentSession = req.session;
  const adminAuth = currentSession?.adminAuth;
  if (!adminAuth?.userId) {
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
  }

  const adminEmails = readAdminEmailSet();
  if (!adminEmails.size) {
    clearAdminSession(req, res);
    return res.status(403).json({ error: "ADMIN_NOT_CONFIGURED" });
  }

  const user = await findUserById(adminAuth.userId);
  if (!user) {
    clearAdminSession(req, res);
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
  }

  if (!adminEmails.has(normalizeEmail(user.email))) {
    clearAdminSession(req, res);
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  if (!user.adminMfaEnabled) {
    currentSession.adminAuth = {
      ...adminAuth,
      userId: user.id,
      email: normalizeEmail(user.email),
      mfaVerified: false,
      csrfToken: null
    };
    clearAdminCsrfCookie(res);
    return res.status(403).json({ error: "ADMIN_MFA_SETUP_REQUIRED" });
  }

  if (!adminAuth.mfaVerified) {
    return res.status(403).json({ error: "ADMIN_MFA_REQUIRED" });
  }

  const now = Date.now();
  const timeoutMs = getAdminIdleTimeoutMs();
  const lastActiveAt = Number(adminAuth.lastActiveAt || 0);
  if (!Number.isFinite(lastActiveAt) || now - lastActiveAt > timeoutMs) {
    clearAdminSession(req, res);
    return res.status(401).json({ error: "ADMIN_SESSION_EXPIRED" });
  }

  const csrfToken = String(adminAuth.csrfToken || "").trim() || generateCsrfToken();
  currentSession.adminAuth = {
    ...adminAuth,
    userId: user.id,
    email: normalizeEmail(user.email),
    mfaVerified: true,
    lastActiveAt: now,
    csrfToken
  };
  setAdminCsrfCookie(res, csrfToken);

  req.adminUser = publicUser(user);
  req.adminSession = currentSession.adminAuth;
  return next();
}

function requireAdminCsrfForMutations(req: Request, res: Response, next: NextFunction) {
  const method = String(req.method || "").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();

  const headerToken = String(req.get("x-csrf-token") || "").trim();
  const cookieToken = String(parseCookieHeader(req.headers.cookie || "")[csrfCookieName] || "").trim();
  const sessionToken = String(req.session?.adminAuth?.csrfToken || "").trim();

  if (!headerToken || !cookieToken || !sessionToken) {
    return res.status(403).json({ error: "CSRF_MISSING" });
  }

  if (headerToken !== cookieToken || headerToken !== sessionToken) {
    return res.status(403).json({ error: "CSRF_INVALID" });
  }

  return next();
}

module.exports = {
  requireAdmin,
  requireAdminCsrfForMutations
};
