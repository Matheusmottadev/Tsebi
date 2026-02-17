const session = require("express-session");
const pgSessionFactory = require("connect-pg-simple");
const { getPool } = require("./lib/db");

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

function createSessionStore() {
  const PgSession = pgSessionFactory(session);
  const store = new PgSession({
    pool: getPool(),
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60
  });
  store.on("error", (error) => {
    // Keep API alive even if session store has transient DB issues.
    // eslint-disable-next-line no-console
    console.error("[session] postgres store error", String(error?.message || error));
  });
  return store;
}

function createSessionMiddleware() {
  const config = {
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
  };

  try {
    config.store = createSessionStore();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[session] falling back to memory store", String(error?.message || error));
  }

  return session(config);
}

module.exports = {
  createSessionMiddleware
};
