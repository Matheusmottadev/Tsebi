export {};
const nodeCrypto = require("node:crypto");

type JsonRecord = Record<string, unknown>;

const ENCRYPTION_PREFIX = "enc:v1";
const JSON_ENVELOPE_KEY = "__enc";

let warnedMissingKey = false;

function isProductionRuntime(): boolean {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function readDataEncryptionKeyRaw(): string {
  return String(process.env.DATA_ENCRYPTION_KEY || "").trim();
}

function ensureDataEncryptionKey(): Buffer | null {
  const raw = readDataEncryptionKeyRaw();
  if (!raw) {
    if (isProductionRuntime()) {
      const error = new Error("DATA_ENCRYPTION_KEY_MISSING") as Error & { code?: string };
      error.code = "DATA_ENCRYPTION_KEY_MISSING";
      throw error;
    }
    if (!warnedMissingKey) {
      // eslint-disable-next-line no-console
      console.warn("[data-protection] DATA_ENCRYPTION_KEY not set; sensitive fields are stored in plain text.");
      warnedMissingKey = true;
    }
    return null;
  }

  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const isBase64Like = /^[A-Za-z0-9+/=]+$/.test(raw) && raw.length % 4 === 0;
  if (isBase64Like) {
    try {
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length === 32) return decoded;
    } catch {}
  }

  return nodeCrypto.createHash("sha256").update(raw, "utf8").digest();
}

function isEncryptedString(value: unknown): boolean {
  return String(value || "").startsWith(`${ENCRYPTION_PREFIX}:`);
}

function encryptSensitiveString(value: unknown): string {
  const raw = String(value || "");
  if (!raw) return "";
  if (isEncryptedString(raw)) return raw;

  const key = ensureDataEncryptionKey();
  if (!key) return raw;

  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSensitiveString(value: unknown): string {
  const raw = String(value || "");
  if (!raw) return "";
  if (!isEncryptedString(raw)) return raw;

  const key = ensureDataEncryptionKey();
  if (!key) return "";

  const parts = raw.split(":");
  if (parts.length !== 5) return "";
  const [, version, ivB64, tagB64, encryptedB64] = parts;
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) return "";

  try {
    const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, "base64")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

function isEncryptedJsonEnvelope(value: unknown): value is JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as JsonRecord;
  return typeof payload[JSON_ENVELOPE_KEY] === "string" && isEncryptedString(payload[JSON_ENVELOPE_KEY]);
}

function protectJsonForStorage(value: unknown): unknown {
  if (value == null) return null;
  if (isEncryptedJsonEnvelope(value)) return value;

  const key = ensureDataEncryptionKey();
  if (!key) return value;

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return null;
    return {
      [JSON_ENVELOPE_KEY]: encryptSensitiveString(serialized)
    };
  } catch {
    return null;
  }
}

function unprotectJsonFromStorage<T>(value: unknown, fallback: T): T {
  if (!isEncryptedJsonEnvelope(value)) {
    if (value == null) return fallback;
    return value as T;
  }

  const payload = String((value as JsonRecord)[JSON_ENVELOPE_KEY] || "");
  const decrypted = decryptSensitiveString(payload);
  if (!decrypted) return fallback;

  try {
    return JSON.parse(decrypted) as T;
  } catch {
    return fallback;
  }
}

module.exports = {
  isEncryptedString,
  encryptSensitiveString,
  decryptSensitiveString,
  protectJsonForStorage,
  unprotectJsonFromStorage
};

