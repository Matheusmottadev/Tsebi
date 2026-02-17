const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const OTPAuth = require("otpauth");
const QRCode = require("qrcode");
const { normalizeEmail } = require("../user-repository");

const isProduction = process.env.NODE_ENV === "production";
function sanitizeCookieName(value, fallback = "tsebi.admin.csrf") {
  const raw = String(value || "").trim();
  // RFC6265 token (no spaces, quotes, separators).
  if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(raw)) return raw;
  return fallback;
}

const csrfCookieName = sanitizeCookieName(process.env.ADMIN_CSRF_COOKIE_NAME, "tsebi.admin.csrf");
const mfaIssuer = String(process.env.ADMIN_MFA_ISSUER || "Tsebi Studio").trim() || "Tsebi Studio";

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getAdminIdleTimeoutMs() {
  const minutes = parseInteger(process.env.ADMIN_IDLE_TIMEOUT_MINUTES, 20);
  return minutes * 60 * 1000;
}

function readAdminEmailSet() {
  const raw = `${process.env.ADMIN_EMAILS || ""},${process.env.ADMIN_EMAIL || ""}`;
  return new Set(
    raw
      .split(",")
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean)
  );
}

function isAdminEmail(email) {
  const adminEmails = readAdminEmailSet();
  if (!adminEmails.size) return false;
  return adminEmails.has(normalizeEmail(email));
}

function ensureMfaEncryptionKey() {
  const raw = String(process.env.ADMIN_MFA_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    const error = new Error("ADMIN_SECURITY_NOT_CONFIGURED");
    error.code = "ADMIN_SECURITY_NOT_CONFIGURED";
    throw error;
  }

  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const b64Like = /^[A-Za-z0-9+/=]+$/.test(raw) && raw.length % 4 === 0;
  if (b64Like) {
    try {
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length === 32) return decoded;
    } catch {}
  }

  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

function encryptMfaSecret(plainSecret) {
  const key = ensureMfaEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainSecret || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptMfaSecret(payload) {
  const raw = String(payload || "").trim();
  if (!raw) return "";

  const [version, ivB64, tagB64, encryptedB64] = raw.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("INVALID_ADMIN_MFA_SECRET_FORMAT");
  }

  const key = ensureMfaEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function createTotp(secretBase32, email) {
  return new OTPAuth.TOTP({
    issuer: mfaIssuer,
    label: normalizeEmail(email) || "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(String(secretBase32 || ""))
  });
}

function generateTotpSecret() {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

async function buildTotpSetup(secretBase32, email) {
  const totp = createTotp(secretBase32, email);
  const otpauthUrl = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240
  });
  return {
    otpauthUrl,
    qrDataUrl
  };
}

function normalizeTotpCode(code) {
  return String(code || "").replace(/\s+/g, "").trim();
}

function normalizeRecoveryCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function verifyTotpToken(secretBase32, email, token) {
  const normalized = normalizeTotpCode(token);
  if (!/^\d{6}$/.test(normalized)) return false;
  const totp = createTotp(secretBase32, email);
  return totp.validate({ token: normalized, window: 1 }) !== null;
}

function makeRecoveryCode() {
  const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${raw.slice(0, 6)}-${raw.slice(6, 12)}`;
}

function generateRecoveryCodes(count = 8) {
  const size = Math.max(6, Math.min(12, Number(count) || 8));
  return Array.from({ length: size }, () => makeRecoveryCode());
}

async function hashRecoveryCodes(codes) {
  const normalized = Array.isArray(codes) ? codes.map((entry) => normalizeRecoveryCode(entry)).filter(Boolean) : [];
  return Promise.all(normalized.map((entry) => bcrypt.hash(entry, 12)));
}

function generateCsrfToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function parseCookieHeader(cookieHeader) {
  const source = String(cookieHeader || "");
  const out = {};
  source.split(";").forEach((item) => {
    const [rawKey, ...rawValue] = item.split("=");
    const key = String(rawKey || "").trim();
    if (!key) return;
    out[key] = decodeURIComponent(rawValue.join("=").trim());
  });
  return out;
}

function setAdminCsrfCookie(res, token) {
  try {
    res.cookie(csrfCookieName, String(token || ""), {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      path: "/"
    });
  } catch {}
}

function clearAdminCsrfCookie(res) {
  try {
    res.clearCookie(csrfCookieName, {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      path: "/"
    });
  } catch {}
}

module.exports = {
  csrfCookieName,
  getAdminIdleTimeoutMs,
  readAdminEmailSet,
  isAdminEmail,
  encryptMfaSecret,
  decryptMfaSecret,
  generateTotpSecret,
  buildTotpSetup,
  verifyTotpToken,
  normalizeTotpCode,
  normalizeRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCodes,
  generateCsrfToken,
  parseCookieHeader,
  setAdminCsrfCookie,
  clearAdminCsrfCookie
};
