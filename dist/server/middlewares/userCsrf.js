"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const nodeCrypto = require("node:crypto");
const isProduction = process.env.NODE_ENV === "production";
function sanitizeCookieName(value, fallback = "tsebi.csrf") {
    const raw = String(value || "").trim();
    if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(raw))
        return raw;
    return fallback;
}
const userCsrfCookieName = sanitizeCookieName(process.env.USER_CSRF_COOKIE_NAME, "tsebi.csrf");
function normalizeOrigin(value) {
    const raw = String(value || "").trim();
    if (!raw)
        return "";
    try {
        return new URL(raw).origin;
    }
    catch {
        return "";
    }
}
function isLocalOrIpHost(hostname) {
    const value = String(hostname || "").trim().toLowerCase();
    if (!value)
        return true;
    if (value === "localhost")
        return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value))
        return true;
    return false;
}
function resolveCookieDomain() {
    const explicit = String(process.env.USER_CSRF_COOKIE_DOMAIN || process.env.SESSION_COOKIE_DOMAIN || "").trim().toLowerCase();
    if (explicit && !isLocalOrIpHost(explicit)) {
        const normalized = explicit.replace(/^\./, "").replace(/^www\./, "");
        return normalized ? `.${normalized}` : undefined;
    }
    return undefined;
}
const cookieDomain = resolveCookieDomain();
function readForwardedHost(req) {
    const raw = String(req.get("x-forwarded-host") || "").trim();
    if (!raw)
        return "";
    return raw.split(",")[0]?.trim() || "";
}
function readForwardedProto(req) {
    const raw = String(req.get("x-forwarded-proto") || "").trim().toLowerCase();
    if (!raw)
        return "";
    return raw.split(",")[0]?.trim() || "";
}
function buildOriginFromHost(host, protocol) {
    const safeHost = String(host || "").trim();
    const safeProtocol = String(protocol || "").trim().toLowerCase();
    if (!safeHost || !safeProtocol)
        return "";
    try {
        return new URL(`${safeProtocol}://${safeHost}`).origin;
    }
    catch {
        return "";
    }
}
function collectAllowedOrigins(req) {
    const allowedOrigins = new Set();
    [
        process.env.APP_BASE_URL,
        process.env.PUBLIC_APP_URL,
        process.env.SITE_URL,
        process.env.PUBLIC_SITE_URL,
        process.env.CORS_ORIGIN,
    ]
        .flatMap((value) => String(value || "").split(","))
        .map((value) => normalizeOrigin(value))
        .filter(Boolean)
        .forEach((origin) => allowedOrigins.add(origin));
    const requestHost = String(req.get("host") || "").trim();
    const forwardedHost = readForwardedHost(req);
    const forwardedProto = readForwardedProto(req) || (isProduction ? "https" : String(req.protocol || "http"));
    const requestProto = String(req.protocol || "").trim().toLowerCase() || (isProduction ? "https" : "http");
    [buildOriginFromHost(requestHost, requestProto), buildOriginFromHost(requestHost, forwardedProto)]
        .filter(Boolean)
        .forEach((origin) => allowedOrigins.add(origin));
    [buildOriginFromHost(forwardedHost, forwardedProto), buildOriginFromHost(forwardedHost, requestProto)]
        .filter(Boolean)
        .forEach((origin) => allowedOrigins.add(origin));
    if (cookieDomain) {
        const baseDomain = cookieDomain.replace(/^\./, "");
        const schemes = new Set([isProduction ? "https" : "http", "https"]);
        schemes.forEach((scheme) => {
            const direct = buildOriginFromHost(baseDomain, scheme);
            if (direct)
                allowedOrigins.add(direct);
            if (!baseDomain.startsWith("www.") && !isLocalOrIpHost(baseDomain)) {
                const withWww = buildOriginFromHost(`www.${baseDomain}`, scheme);
                if (withWww)
                    allowedOrigins.add(withWww);
            }
        });
    }
    return allowedOrigins;
}
function parseCookieHeader(cookieHeader) {
    const source = String(cookieHeader || "");
    const out = {};
    source.split(";").forEach((item) => {
        const [rawKey, ...rawValue] = item.split("=");
        const key = String(rawKey || "").trim();
        if (!key)
            return;
        const value = rawValue.join("=").trim();
        try {
            out[key] = decodeURIComponent(value);
        }
        catch {
            out[key] = value;
        }
    });
    return out;
}
function generateCsrfToken() {
    return nodeCrypto.randomBytes(24).toString("base64url");
}
// Comparação em tempo constante para evitar timing attacks na validação do token
function timingSafeEqual(a, b) {
    if (!a || !b || a.length !== b.length)
        return false;
    try {
        return nodeCrypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    }
    catch {
        return false;
    }
}
function setUserCsrfCookie(res, token) {
    res.cookie(userCsrfCookieName, String(token || ""), {
        httpOnly: false,
        sameSite: "strict",
        secure: isProduction,
        path: "/",
        ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
}
function clearUserCsrfCookie(res) {
    res.clearCookie(userCsrfCookieName, {
        httpOnly: false,
        sameSite: "strict",
        secure: isProduction,
        path: "/",
        ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
}
function ensureSessionCsrfToken(req) {
    if (!req.session)
        return "";
    const current = String(req.session.userCsrfToken || "").trim();
    if (current)
        return current;
    const next = generateCsrfToken();
    req.session.userCsrfToken = next;
    return next;
}
function isMutationMethod(method) {
    const normalized = String(method || "").toUpperCase();
    return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
}
function isAllowedSameOriginMutation(req) {
    const requestOrigin = String(req.get("origin") || "").trim();
    const referer = String(req.get("referer") || "").trim();
    if (!requestOrigin && !referer)
        return true;
    const allowedOrigins = collectAllowedOrigins(req);
    const validate = (value) => {
        if (!value)
            return true;
        try {
            const parsed = new URL(value);
            return allowedOrigins.has(parsed.origin);
        }
        catch {
            return false;
        }
    };
    return validate(requestOrigin) && validate(referer);
}
function isPublicAuthMutationPath(req) {
    const baseUrl = String(req.baseUrl || "").trim().toLowerCase();
    if (!baseUrl.endsWith("/api/auth"))
        return false;
    const path = String(req.path || "").trim().toLowerCase();
    if (!path)
        return false;
    const allowlist = new Set([
        "/logout",
        "/register",
        "/register-lite",
        "/login",
        "/check-email",
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
function attachUserCsrfToken(req, res, next) {
    const sessionUserId = String(req.session?.userId || "").trim();
    if (!sessionUserId) {
        clearUserCsrfCookie(res);
        return next();
    }
    const token = ensureSessionCsrfToken(req);
    if (token)
        setUserCsrfCookie(res, token);
    return next();
}
function requireUserCsrfForMutations(req, res, next) {
    if (!isMutationMethod(req.method))
        return next();
    if (isPublicAuthMutationPath(req))
        return next();
    const sessionUserId = String(req.session?.userId || "").trim();
    if (!sessionUserId)
        return next();
    if (!isAllowedSameOriginMutation(req)) {
        return res.status(403).json({ error: "CSRF_ORIGIN_INVALID" });
    }
    const headerToken = String(req.get("x-csrf-token") || "").trim();
    const cookieToken = String(parseCookieHeader(req.headers.cookie || "")[userCsrfCookieName] || "").trim();
    const sessionToken = String(req.session?.userCsrfToken || "").trim();
    if (!headerToken || !cookieToken || !sessionToken) {
        return res.status(403).json({ error: "CSRF_MISSING" });
    }
    if (!timingSafeEqual(headerToken, cookieToken) || !timingSafeEqual(headerToken, sessionToken)) {
        return res.status(403).json({ error: "CSRF_INVALID" });
    }
    return next();
}
module.exports = {
    userCsrfCookieName,
    attachUserCsrfToken,
    requireUserCsrfForMutations,
};
//# sourceMappingURL=userCsrf.js.map