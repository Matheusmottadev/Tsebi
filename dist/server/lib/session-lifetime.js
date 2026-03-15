"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DAY_MS = 24 * 60 * 60 * 1000;
function parsePositiveIntEnv(name, fallback) {
    const parsed = Number.parseInt(String(process.env[name] || "").trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return parsed;
}
const customerSessionDays = parsePositiveIntEnv("SESSION_CUSTOMER_MAX_AGE_DAYS", 30);
const adminSessionDays = parsePositiveIntEnv("SESSION_ADMIN_MAX_AGE_DAYS", 3);
const customerSessionMaxAgeMs = customerSessionDays * DAY_MS;
const adminSessionMaxAgeMs = adminSessionDays * DAY_MS;
function applySessionMaxAge(req, maxAgeMs) {
    if (!req?.session?.cookie)
        return;
    req.session.cookie.maxAge = maxAgeMs;
}
function applyCustomerSessionLifetime(req) {
    applySessionMaxAge(req, customerSessionMaxAgeMs);
}
function applyAdminSessionLifetime(req) {
    applySessionMaxAge(req, adminSessionMaxAgeMs);
}
module.exports = {
    customerSessionMaxAgeMs,
    adminSessionMaxAgeMs,
    applyCustomerSessionLifetime,
    applyAdminSessionLifetime
};
//# sourceMappingURL=session-lifetime.js.map