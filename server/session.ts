import type { SessionOptions, Store } from "express-session";

const session = require("express-session") as typeof import("express-session");
const pgSessionFactory = require("connect-pg-simple");
const { getPool } = require("./lib/db");

const defaultSessionSecret = "dev-change-this-session-secret";

function parseIntegerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getSessionMaxAgeMs(): number {
  const days = parseIntegerEnv(process.env.SESSION_MAX_AGE_DAYS, 180);
  return days * 24 * 60 * 60 * 1000;
}

function createSessionStore(): Store {
  const PgSession = pgSessionFactory(session);
  const store = new PgSession({
    pool: getPool(),
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60
  });
  store.on("error", (error: unknown) => {
    // Keep API alive even if session store has transient DB issues.
    // eslint-disable-next-line no-console
    const message = error instanceof Error ? error.message : String(error);
    console.error("[session] postgres store error", message);
  });
  return store as Store;
}

function createSessionMiddleware() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const isProduction = nodeEnv === "production";
  const isLocalDevelopment = nodeEnv === "development" || nodeEnv === "";
  const sessionName = process.env.SESSION_COOKIE_NAME || "tsebi.sid";
  const sessionSecret = String(process.env.SESSION_SECRET || "").trim();

  const hasStrongSessionSecret =
    Boolean(sessionSecret) && sessionSecret !== defaultSessionSecret && sessionSecret.length >= 32;

  if (!hasStrongSessionSecret && !isLocalDevelopment) {
    throw new Error("SESSION_SECRET_WEAK_OR_MISSING");
  }

  if (!hasStrongSessionSecret && isLocalDevelopment) {
    // eslint-disable-next-line no-console
    console.warn("[session] using local development fallback secret");
  }

  const effectiveSessionSecret = hasStrongSessionSecret ? sessionSecret : defaultSessionSecret;

  const config: SessionOptions = {
    name: sessionName,
    secret: effectiveSessionSecret,
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
  } catch (error: unknown) {
    if (isProduction) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    // eslint-disable-next-line no-console
    const message = error instanceof Error ? error.message : String(error);
    console.error("[session] falling back to memory store", message);
  }

  return session(config);
}

module.exports = {
  createSessionMiddleware
};
