export {};

const DAY_MS = 24 * 60 * 60 * 1000;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[name] || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const customerSessionDays = parsePositiveIntEnv("SESSION_CUSTOMER_MAX_AGE_DAYS", 30);
const adminSessionDays = parsePositiveIntEnv("SESSION_ADMIN_MAX_AGE_DAYS", 3);

const customerSessionMaxAgeMs = customerSessionDays * DAY_MS;
const adminSessionMaxAgeMs = adminSessionDays * DAY_MS;

function applySessionMaxAge(req: any, maxAgeMs: number): void {
  if (!req?.session?.cookie) return;
  req.session.cookie.maxAge = maxAgeMs;
}

function applyCustomerSessionLifetime(req: any): void {
  applySessionMaxAge(req, customerSessionMaxAgeMs);
}

function applyAdminSessionLifetime(req: any): void {
  applySessionMaxAge(req, adminSessionMaxAgeMs);
}

module.exports = {
  customerSessionMaxAgeMs,
  adminSessionMaxAgeMs,
  applyCustomerSessionLifetime,
  applyAdminSessionLifetime
};
