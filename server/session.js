const session = require("express-session");

const isProduction = process.env.NODE_ENV === "production";
const sessionName = process.env.SESSION_COOKIE_NAME || "tsebi.sid";
const sessionSecret = process.env.SESSION_SECRET || "dev-change-this-session-secret";

function parseIntegerEnv(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getSessionMaxAgeMs() {
  const days = parseIntegerEnv(process.env.SESSION_MAX_AGE_DAYS, 30);
  return days * 24 * 60 * 60 * 1000;
}

function createSessionMiddleware() {
  // Default MemoryStore is acceptable for local dev only; swap to Redis in production.
  return session({
    name: sessionName,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: getSessionMaxAgeMs()
    }
  });
}

module.exports = {
  createSessionMiddleware
};
