const session = require("express-session");

const oneDayMs = 24 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";
const sessionName = process.env.SESSION_COOKIE_NAME || "tsebi.sid";
const sessionSecret = process.env.SESSION_SECRET || "dev-change-this-session-secret";

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
      maxAge: oneDayMs
    }
  });
}

module.exports = {
  createSessionMiddleware
};
