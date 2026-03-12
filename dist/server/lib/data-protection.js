"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const nodeCrypto = require("node:crypto");
const ENCRYPTION_PREFIX = "enc:v1";
const JSON_ENVELOPE_KEY = "__enc";
let warnedMissingKey = false;
function isProductionRuntime() {
    return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}
function readDataEncryptionKeyRaw() {
    return String(process.env.DATA_ENCRYPTION_KEY || "").trim();
}
function ensureDataEncryptionKey() {
    const raw = readDataEncryptionKeyRaw();
    if (!raw) {
        if (isProductionRuntime()) {
            const error = new Error("DATA_ENCRYPTION_KEY_MISSING");
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
            if (decoded.length === 32)
                return decoded;
        }
        catch { }
    }
    return nodeCrypto.createHash("sha256").update(raw, "utf8").digest();
}
function isEncryptedString(value) {
    return String(value || "").startsWith(`${ENCRYPTION_PREFIX}:`);
}
function encryptSensitiveString(value) {
    const raw = String(value || "");
    if (!raw)
        return "";
    if (isEncryptedString(raw))
        return raw;
    const key = ensureDataEncryptionKey();
    if (!key)
        return raw;
    const iv = nodeCrypto.randomBytes(12);
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTION_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}
function decryptSensitiveString(value) {
    const raw = String(value || "");
    if (!raw)
        return "";
    if (!isEncryptedString(raw))
        return raw;
    const key = ensureDataEncryptionKey();
    if (!key)
        return "";
    const parts = raw.split(":");
    if (parts.length !== 5)
        return "";
    const [, version, ivB64, tagB64, encryptedB64] = parts;
    if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64)
        return "";
    try {
        const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
        decipher.setAuthTag(Buffer.from(tagB64, "base64"));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedB64, "base64")),
            decipher.final()
        ]);
        return decrypted.toString("utf8");
    }
    catch {
        return "";
    }
}
function isEncryptedJsonEnvelope(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const payload = value;
    return typeof payload[JSON_ENVELOPE_KEY] === "string" && isEncryptedString(payload[JSON_ENVELOPE_KEY]);
}
function protectJsonForStorage(value) {
    if (value == null)
        return null;
    if (isEncryptedJsonEnvelope(value))
        return value;
    const key = ensureDataEncryptionKey();
    if (!key)
        return value;
    try {
        const serialized = JSON.stringify(value);
        if (!serialized)
            return null;
        return {
            [JSON_ENVELOPE_KEY]: encryptSensitiveString(serialized)
        };
    }
    catch {
        return null;
    }
}
function unprotectJsonFromStorage(value, fallback) {
    if (!isEncryptedJsonEnvelope(value)) {
        if (value == null)
            return fallback;
        return value;
    }
    const payload = String(value[JSON_ENVELOPE_KEY] || "");
    const decrypted = decryptSensitiveString(payload);
    if (!decrypted)
        return fallback;
    try {
        return JSON.parse(decrypted);
    }
    catch {
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
//# sourceMappingURL=data-protection.js.map