export {};
const nodeCrypto = require("node:crypto");
const bcrypt = require("bcrypt");
const OTPAuth = require("otpauth");
const QRCode = require("qrcode");
const { normalizeEmail } = require("../user-repository");
const { findAdminAccessByEmail } = require("./admin-access-repository");

const isProduction = process.env.NODE_ENV === "production";
function sanitizeCookieName(value: unknown, fallback = "tsebi.admin.csrf"): string {
  const raw = String(value || "").trim();
  // RFC6265 token (no spaces, quotes, separators).
  if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(raw)) return raw;
  return fallback;
}

const csrfCookieName = sanitizeCookieName(process.env.ADMIN_CSRF_COOKIE_NAME, "tsebi.admin.csrf");
const mfaIssuer = String(process.env.ADMIN_MFA_ISSUER || "Tsebi Studio").trim() || "Tsebi Studio";

function parseInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getAdminIdleTimeoutMs(): number {
  const minutes = parseInteger(process.env.ADMIN_IDLE_TIMEOUT_MINUTES, 60 * 24 * 3);
  return minutes * 60 * 1000;
}

function readAdminEmailSet(): Set<string> {
  const raw = `${process.env.ADMIN_EMAILS || ""},${process.env.ADMIN_EMAIL || ""}`;
  return new Set(
    raw
      .split(",")
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean)
  );
}

function isAdminEmail(email: string): boolean {
  const adminEmails = readAdminEmailSet();
  if (!adminEmails.size) return false;
  return adminEmails.has(normalizeEmail(email));
}

async function findAdminAccessEntry(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return findAdminAccessByEmail(normalized);
}

async function isActiveAdminEmail(email: string): Promise<boolean> {
  const admin = await findAdminAccessEntry(email);
  return Boolean(admin?.id && admin.isActive);
}

function ensureMfaEncryptionKey(): Buffer {
  const raw = String(process.env.ADMIN_MFA_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    const error = new Error("ADMIN_SECURITY_NOT_CONFIGURED") as Error & { code?: string };
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

  return nodeCrypto.createHash("sha256").update(raw, "utf8").digest();
}

function encryptMfaSecret(plainSecret: string): string {
  const key = ensureMfaEncryptionKey();
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainSecret || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptMfaSecret(payload: string): string {
  const raw = String(payload || "").trim();
  if (!raw) return "";

  const [version, ivB64, tagB64, encryptedB64] = raw.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("INVALID_ADMIN_MFA_SECRET_FORMAT");
  }

  const key = ensureMfaEncryptionKey();
  const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function createTotp(secretBase32: string, email: string): InstanceType<typeof OTPAuth.TOTP> {
  return new OTPAuth.TOTP({
    issuer: mfaIssuer,
    label: normalizeEmail(email) || "admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(String(secretBase32 || ""))
  });
}

function generateTotpSecret(): string {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

async function buildTotpSetup(secretBase32: string, email: string): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
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

function normalizeTotpCode(code: string): string {
  return String(code || "").replace(/\s+/g, "").trim();
}

function normalizeRecoveryCode(code: string): string {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function verifyTotpToken(secretBase32: string, email: string, token: string): boolean {
  const normalized = normalizeTotpCode(token);
  if (!/^\d{6}$/.test(normalized)) return false;
  const totp = createTotp(secretBase32, email);
  return totp.validate({ token: normalized, window: 1 }) !== null;
}

function makeRecoveryCode(): string {
  const raw = nodeCrypto.randomBytes(6).toString("hex").toUpperCase();
  return `${raw.slice(0, 6)}-${raw.slice(6, 12)}`;
}

function generateRecoveryCodes(count = 8): string[] {
  const size = Math.max(6, Math.min(12, Number(count) || 8));
  return Array.from({ length: size }, () => makeRecoveryCode());
}

async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  const normalized = Array.isArray(codes) ? codes.map((entry) => normalizeRecoveryCode(entry)).filter(Boolean) : [];
  return Promise.all(normalized.map((entry) => bcrypt.hash(entry, 12)));
}

function generateCsrfToken(): string {
  return nodeCrypto.randomBytes(24).toString("base64url");
}

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

function setAdminCsrfCookie(res: { cookie: (...args: unknown[]) => void }, token: string): void {
  try {
    res.cookie(csrfCookieName, String(token || ""), {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      path: "/"
    });
  } catch {}
}

function clearAdminCsrfCookie(res: { clearCookie: (...args: unknown[]) => void }): void {
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
  findAdminAccessEntry,
  isActiveAdminEmail,
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
