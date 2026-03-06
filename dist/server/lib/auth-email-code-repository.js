"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("node:crypto");
const { withTransaction } = require("./db");
const PURPOSES = new Set(["account_verify", "login_verify", "password_reset"]);
function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}
function normalizePurpose(purpose) {
    const safe = String(purpose || "").trim().toLowerCase();
    return PURPOSES.has(safe) ? safe : "";
}
function normalizeCode(code) {
    return String(code || "").replace(/\D/g, "").slice(0, 6);
}
function hashCode(code) {
    return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}
function generateCode() {
    const number = crypto.randomInt(0, 1_000_000);
    return String(number).padStart(6, "0");
}
function getCodeTtlMinutes(purpose) {
    if (purpose === "password_reset")
        return 15;
    if (purpose === "login_verify")
        return 20;
    return 20;
}
async function issueAuthEmailCode({ userId, email, purpose }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPurpose = normalizePurpose(purpose);
    if (!normalizedEmail || !normalizedPurpose) {
        return { ok: false, error: "INVALID_INPUT" };
    }
    const code = generateCode();
    const codeHash = hashCode(code);
    const ttlMinutes = getCodeTtlMinutes(normalizedPurpose);
    const created = await withTransaction(async (client) => {
        const result = await client.query(`
      INSERT INTO auth_email_codes (user_id, email, purpose, code_hash, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + ($5::int * INTERVAL '1 minute'))
      RETURNING id, expires_at
      `, [userId || null, normalizedEmail, normalizedPurpose, codeHash, ttlMinutes]);
        return (result.rows[0] || null);
    });
    return {
        ok: true,
        code,
        purpose: normalizedPurpose,
        expiresAt: created?.expires_at || null
    };
}
async function consumeAuthEmailCode({ email, purpose, code }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPurpose = normalizePurpose(purpose);
    const normalizedCode = normalizeCode(code);
    if (!normalizedEmail || !normalizedPurpose || normalizedCode.length !== 6) {
        return { ok: false, error: "INVALID_INPUT" };
    }
    return withTransaction(async (client) => {
        const result = await client.query(`
      SELECT *
      FROM auth_email_codes
      WHERE email = $1
        AND purpose = $2
        AND code_hash = $3
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `, [normalizedEmail, normalizedPurpose, hashCode(normalizedCode)]);
        if (result.rowCount === 0) {
            return { ok: false, error: "INVALID_OR_EXPIRED_CODE" };
        }
        const row = (result.rows[0] || {});
        await client.query(`
      UPDATE auth_email_codes
      SET consumed_at = NOW()
      WHERE id = $1
      `, [row.id]);
        return {
            ok: true,
            userId: row.user_id || null,
            email: normalizeEmail(row.email),
            purpose: row.purpose,
            expiresAt: row.expires_at
        };
    });
}
module.exports = {
    normalizeEmail,
    normalizePurpose,
    normalizeCode,
    issueAuthEmailCode,
    consumeAuthEmailCode
};
//# sourceMappingURL=auth-email-code-repository.js.map