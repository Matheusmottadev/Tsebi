import type { NextFunction, Request, Response } from "express";
const nodeCrypto = require("node:crypto");

const isProduction = process.env.NODE_ENV === "production";

function sanitizeCookieName(value: unknown, fallback = "tsebi.csrf"): string {
  const raw = String(value || "").trim();
  if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(raw)) return raw;
  return fallback;
}

const userCsrfCookieName = sanitizeCookieName(process.env.USER_CSRF_COOKIE_NAME, "tsebi.csrf");

function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const source = String(cookieHeader || "");
  const out: Record<string, string> = {};
  source.split(";").forEach((item) => {
    const [rawKey, ...rawValue] = item.split("=");
    const key = String(rawKey || "").trim();
    if (!key) return;
    out[key] = decodeURIComponent(rawValue.join("=").trim());
  });
  return out;
}

function generateCsrfToken(): string {
  return nodeCrypto.randomBytes(24).toString("base64url");
}

function setUserCsrfCookie(res: Response, token: string): void {
  res.cookie(userCsrfCookieName, String(token || ""), {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
}

function clearUserCsrfCookie(res: Response): void {
  res.clearCookie(userCsrfCookieName, {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
}

function ensureSessionCsrfToken(req: Request): string {
  if (!req.session) return "";
  const current = String((req.session as any).userCsrfToken || "").trim();
  if (current) return current;
  const next = generateCsrfToken();
  (req.session as any).userCsrfToken = next;
  return next;
}

function isMutationMethod(method: string): boolean {
  const normalized = String(method || "").toUpperCase();
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
}

function isPublicAuthMutationPath(req: Request): boolean {
  const baseUrl = String((req as any).baseUrl || "").trim().toLowerCase();
  if (!baseUrl.endsWith("/api/auth")) return false;

  const path = String((req as any).path || "").trim().toLowerCase();
  if (!path) return false;

  const allowlist = new Set([
    "/register",
    "/login",
    "/google",
    "/activate",
    "/email/start",
    "/email/verify",
    "/email/verify-account",
    "/email/resend-account-code",
    "/login/verify-code",
    "/forgot-password",
    "/forgot-password/verify-code",
    "/passkey/register/options",
    "/passkey/register/verify",
    "/passkey/login/options",
    "/passkey/login/verify"
  ]);

  return allowlist.has(path);
}

function attachUserCsrfToken(req: Request, res: Response, next: NextFunction) {
  const sessionUserId = String(req.session?.userId || "").trim();
  if (!sessionUserId) {
    clearUserCsrfCookie(res);
    return next();
  }
  const token = ensureSessionCsrfToken(req);
  if (token) setUserCsrfCookie(res, token);
  return next();
}

function requireUserCsrfForMutations(req: Request, res: Response, next: NextFunction) {
  if (!isMutationMethod(req.method)) return next();
  if (isPublicAuthMutationPath(req)) return next();

  const sessionUserId = String(req.session?.userId || "").trim();
  if (!sessionUserId) return next();

  const headerToken = String(req.get("x-csrf-token") || "").trim();
  const cookieToken = String(parseCookieHeader(req.headers.cookie || "")[userCsrfCookieName] || "").trim();
  const sessionToken = String((req.session as any)?.userCsrfToken || "").trim();

  if (!headerToken || !cookieToken || !sessionToken) {
    return res.status(403).json({ error: "CSRF_MISSING" });
  }
  if (headerToken !== cookieToken || headerToken !== sessionToken) {
    return res.status(403).json({ error: "CSRF_INVALID" });
  }

  return next();
}

module.exports = {
  userCsrfCookieName,
  attachUserCsrfToken,
  requireUserCsrfForMutations,
};
