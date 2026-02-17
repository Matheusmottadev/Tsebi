const express = require("express");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const {
  normalizeEmail,
  publicUser,
  findUserByEmail,
  findUserById,
  setAdminMfaCredentials,
  replaceAdminRecoveryCodes,
  consumeAdminRecoveryCode,
  disableAdminMfa
} = require("./user-repository");
const {
  csrfCookieName,
  getAdminIdleTimeoutMs,
  parseCookieHeader,
  readAdminEmailSet,
  encryptMfaSecret,
  decryptMfaSecret,
  generateTotpSecret,
  buildTotpSetup,
  verifyTotpToken,
  normalizeRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCodes,
  generateCsrfToken,
  setAdminCsrfCookie,
  clearAdminCsrfCookie
} = require("./lib/admin-security");

const studioAuthRouter = express.Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_ATTEMPTS" }
});

const mfaRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_ATTEMPTS" }
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128)
});

const mfaVerifySchema = z.object({
  token: z.string().trim().optional().default(""),
  recoveryCode: z.string().trim().optional().default("")
});

const mfaSensitiveSchema = z.object({
  password: z.string().min(1).max(128),
  token: z.string().trim().min(6).max(12)
});

function clearAdminAuthSession(req, res) {
  if (req.session?.adminAuth) {
    delete req.session.adminAuth;
  }
  clearAdminCsrfCookie(res);
}

function readAdminAuth(req) {
  const auth = req.session?.adminAuth;
  if (!auth || typeof auth !== "object") return null;
  if (!auth.userId) return null;
  return auth;
}

async function getSessionAdminUser(req, res) {
  const auth = readAdminAuth(req);
  if (!auth) return { auth: null, user: null };

  const user = await findUserById(auth.userId);
  if (!user) {
    clearAdminAuthSession(req, res);
    return { auth: null, user: null };
  }

  const adminEmails = readAdminEmailSet();
  if (!adminEmails.size) {
    clearAdminAuthSession(req, res);
    return { auth: null, user: null, error: "ADMIN_NOT_CONFIGURED" };
  }

  if (!adminEmails.has(normalizeEmail(user.email))) {
    clearAdminAuthSession(req, res);
    return { auth: null, user: null, error: "FORBIDDEN" };
  }

  return { auth, user };
}

function isStudioCsrfValid(req) {
  const headerToken = String(req.get("x-csrf-token") || "").trim();
  const cookieToken = String(parseCookieHeader(req.headers.cookie || "")[csrfCookieName] || "").trim();
  const sessionToken = String(req.session?.adminAuth?.csrfToken || "").trim();
  if (!headerToken || !cookieToken || !sessionToken) return false;
  return headerToken === cookieToken && headerToken === sessionToken;
}

function grantVerifiedStudioSession(req, res, user, currentAuth) {
  const now = Date.now();
  const csrfToken = generateCsrfToken();
  req.session.adminAuth = {
    ...(currentAuth || {}),
    userId: user.id,
    email: normalizeEmail(user.email),
    mfaVerified: true,
    pendingMfaSecretEnc: null,
    lastActiveAt: now,
    csrfToken
  };
  setAdminCsrfCookie(res, csrfToken);
  return req.session.adminAuth;
}

studioAuthRouter.get("/me", async (req, res) => {
  const auth = readAdminAuth(req);
  if (!auth) {
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED", stage: "password_required" });
  }

  const state = await getSessionAdminUser(req, res);
  if (state.error) {
    return res.status(403).json({ error: state.error, stage: "password_required" });
  }
  if (!state.user || !state.auth) {
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED", stage: "password_required" });
  }

  const user = state.user;
  const adminAuth = state.auth;

  if (!user.adminMfaEnabled) {
    req.session.adminAuth = {
      ...adminAuth,
      userId: user.id,
      email: normalizeEmail(user.email),
      mfaVerified: false,
      csrfToken: null
    };
    clearAdminCsrfCookie(res);
    return res.json({
      authenticated: false,
      stage: "mfa_setup_required",
      admin: publicUser(user)
    });
  }

  if (!adminAuth.mfaVerified) {
    return res.json({
      authenticated: false,
      stage: "mfa_required",
      admin: publicUser(user)
    });
  }

  const timeoutMs = getAdminIdleTimeoutMs();
  const now = Date.now();
  const lastActiveAt = Number(adminAuth.lastActiveAt || 0);
  if (!Number.isFinite(lastActiveAt) || now - lastActiveAt > timeoutMs) {
    clearAdminAuthSession(req, res);
    return res.status(401).json({ error: "ADMIN_SESSION_EXPIRED", stage: "password_required" });
  }

  const csrfToken = String(adminAuth.csrfToken || "").trim() || generateCsrfToken();
  req.session.adminAuth = {
    ...adminAuth,
    userId: user.id,
    email: normalizeEmail(user.email),
    mfaVerified: true,
    lastActiveAt: now,
    csrfToken
  };
  setAdminCsrfCookie(res, csrfToken);

  return res.json({
    authenticated: true,
    stage: "authenticated",
    admin: publicUser(user),
    csrfToken,
    idleTimeoutMs: timeoutMs
  });
});

studioAuthRouter.post("/login", loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const adminEmails = readAdminEmailSet();
  if (!adminEmails.size) {
    clearAdminAuthSession(req, res);
    return res.status(403).json({ error: "ADMIN_NOT_CONFIGURED" });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const matches = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  if (!adminEmails.has(email)) {
    clearAdminAuthSession(req, res);
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  req.session.adminAuth = {
    userId: user.id,
    email,
    mfaVerified: false,
    pendingMfaSecretEnc: null,
    lastActiveAt: 0,
    csrfToken: null
  };
  clearAdminCsrfCookie(res);

  return res.json({
    ok: true,
    stage: user.adminMfaEnabled ? "mfa_required" : "mfa_setup_required",
    mfaEnabled: Boolean(user.adminMfaEnabled),
    admin: publicUser(user)
  });
});

studioAuthRouter.post("/mfa/setup/init", mfaRateLimit, async (req, res) => {
  const state = await getSessionAdminUser(req, res);
  if (state.error) return res.status(403).json({ error: state.error });
  if (!state.user || !state.auth) {
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
  }
  if (state.auth.mfaVerified) {
    return res.status(400).json({ error: "ALREADY_AUTHENTICATED" });
  }
  if (state.user.adminMfaEnabled) {
    return res.status(409).json({ error: "ADMIN_MFA_ALREADY_ENABLED" });
  }

  try {
    const secretBase32 = generateTotpSecret();
    const setup = await buildTotpSetup(secretBase32, state.user.email);
    req.session.adminAuth = {
      ...state.auth,
      userId: state.user.id,
      email: normalizeEmail(state.user.email),
      pendingMfaSecretEnc: encryptMfaSecret(secretBase32),
      mfaVerified: false,
      csrfToken: null
    };
    clearAdminCsrfCookie(res);

    return res.json({
      stage: "mfa_setup_required",
      secret: secretBase32,
      otpauthUrl: setup.otpauthUrl,
      qrDataUrl: setup.qrDataUrl
    });
  } catch (error) {
    return res.status(500).json({ error: String(error?.code || "ADMIN_SECURITY_ERROR") });
  }
});

studioAuthRouter.post("/mfa/verify", mfaRateLimit, async (req, res) => {
  const parsed = mfaVerifySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const state = await getSessionAdminUser(req, res);
  if (state.error) return res.status(403).json({ error: state.error });
  if (!state.user || !state.auth) {
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
  }
  if (state.auth.mfaVerified) {
    return res.json({ ok: true, stage: "authenticated", admin: publicUser(state.user) });
  }

  const token = String(parsed.data.token || "").trim();
  const recoveryCode = normalizeRecoveryCode(parsed.data.recoveryCode || "");

  try {
    if (!state.user.adminMfaEnabled) {
      const pendingSecretEnc = String(state.auth.pendingMfaSecretEnc || "").trim();
      if (!pendingSecretEnc) {
        return res.status(409).json({ error: "MFA_SETUP_NOT_INITIALIZED" });
      }

      const pendingSecret = decryptMfaSecret(pendingSecretEnc);
      const tokenValid = verifyTotpToken(pendingSecret, state.user.email, token);
      if (!tokenValid) {
        return res.status(401).json({ error: "INVALID_MFA_CODE" });
      }

      const recoveryCodes = generateRecoveryCodes(8);
      const recoveryHashes = await hashRecoveryCodes(recoveryCodes);
      const persisted = await setAdminMfaCredentials(state.user.id, {
        secretEnc: encryptMfaSecret(pendingSecret),
        recoveryCodeHashes: recoveryHashes
      });

      grantVerifiedStudioSession(req, res, persisted || state.user, state.auth);
      return res.json({
        ok: true,
        stage: "authenticated",
        admin: publicUser(persisted || state.user),
        recoveryCodes
      });
    }

    let verified = false;
    let recoveryUsed = false;
    if (recoveryCode) {
      const consumeResult = await consumeAdminRecoveryCode(state.user.id, recoveryCode);
      verified = consumeResult.ok;
      recoveryUsed = consumeResult.ok;
    } else {
      const secretEnc = String(state.user.adminMfaSecretEnc || "").trim();
      if (!secretEnc) return res.status(500).json({ error: "ADMIN_MFA_STATE_INVALID" });
      const secret = decryptMfaSecret(secretEnc);
      verified = verifyTotpToken(secret, state.user.email, token);
    }

    if (!verified) {
      return res.status(401).json({ error: "INVALID_MFA_CODE" });
    }

    grantVerifiedStudioSession(req, res, state.user, state.auth);
    return res.json({
      ok: true,
      stage: "authenticated",
      recoveryUsed,
      admin: publicUser(state.user)
    });
  } catch (error) {
    return res.status(500).json({ error: String(error?.code || "ADMIN_SECURITY_ERROR") });
  }
});

studioAuthRouter.post("/mfa/recovery/regenerate", mfaRateLimit, async (req, res) => {
  const parsed = mfaSensitiveSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  if (!isStudioCsrfValid(req)) return res.status(403).json({ error: "CSRF_INVALID" });

  const state = await getSessionAdminUser(req, res);
  if (state.error) return res.status(403).json({ error: state.error });
  if (!state.user || !state.auth || !state.auth.mfaVerified) {
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
  }

  const passOk = await bcrypt.compare(parsed.data.password, state.user.passwordHash);
  if (!passOk) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

  try {
    const secretEnc = String(state.user.adminMfaSecretEnc || "").trim();
    if (!secretEnc) return res.status(500).json({ error: "ADMIN_MFA_STATE_INVALID" });
    const secret = decryptMfaSecret(secretEnc);
    const tokenOk = verifyTotpToken(secret, state.user.email, parsed.data.token);
    if (!tokenOk) return res.status(401).json({ error: "INVALID_MFA_CODE" });

    const recoveryCodes = generateRecoveryCodes(8);
    const recoveryHashes = await hashRecoveryCodes(recoveryCodes);
    await replaceAdminRecoveryCodes(state.user.id, recoveryHashes);
    return res.json({ ok: true, recoveryCodes });
  } catch (error) {
    return res.status(500).json({ error: String(error?.code || "ADMIN_SECURITY_ERROR") });
  }
});

studioAuthRouter.post("/mfa/disable", mfaRateLimit, async (req, res) => {
  const parsed = mfaSensitiveSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  if (!isStudioCsrfValid(req)) return res.status(403).json({ error: "CSRF_INVALID" });

  const state = await getSessionAdminUser(req, res);
  if (state.error) return res.status(403).json({ error: state.error });
  if (!state.user || !state.auth || !state.auth.mfaVerified) {
    return res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
  }

  const passOk = await bcrypt.compare(parsed.data.password, state.user.passwordHash);
  if (!passOk) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

  try {
    const secretEnc = String(state.user.adminMfaSecretEnc || "").trim();
    if (!secretEnc) return res.status(500).json({ error: "ADMIN_MFA_STATE_INVALID" });
    const secret = decryptMfaSecret(secretEnc);
    const tokenOk = verifyTotpToken(secret, state.user.email, parsed.data.token);
    if (!tokenOk) return res.status(401).json({ error: "INVALID_MFA_CODE" });

    await disableAdminMfa(state.user.id);
    req.session.adminAuth = {
      ...state.auth,
      userId: state.user.id,
      email: normalizeEmail(state.user.email),
      mfaVerified: false,
      pendingMfaSecretEnc: null,
      lastActiveAt: 0,
      csrfToken: null
    };
    clearAdminCsrfCookie(res);

    return res.json({ ok: true, stage: "mfa_setup_required" });
  } catch (error) {
    return res.status(500).json({ error: String(error?.code || "ADMIN_SECURITY_ERROR") });
  }
});

studioAuthRouter.post("/logout", (req, res) => {
  clearAdminAuthSession(req, res);
  return res.json({ ok: true });
});

module.exports = {
  studioAuthRouter
};
