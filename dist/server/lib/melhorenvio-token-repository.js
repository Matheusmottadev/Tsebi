"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { query } = require("./db");
function mapTokenRow(row) {
    if (!row)
        return null;
    return {
        accessToken: String(row.access_token || ""),
        refreshToken: String(row.refresh_token || ""),
        expiresAt: row.expires_at || null,
        scope: row.scope || "",
        updatedAt: row.updated_at || null
    };
}
async function getMelhorEnvioTokens() {
    const result = await query(`
    SELECT access_token, refresh_token, expires_at, scope, updated_at
    FROM melhorenvio_tokens
    WHERE id = 1
    LIMIT 1
    `);
    return mapTokenRow(result.rows[0] || null);
}
async function saveMelhorEnvioTokens({ accessToken, refreshToken, expiresAt, scope = "" }) {
    const result = await query(`
    INSERT INTO melhorenvio_tokens (
      id, access_token, refresh_token, expires_at, scope, updated_at
    ) VALUES (
      1, $1, $2, $3::timestamptz, $4, NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      updated_at = NOW()
    RETURNING access_token, refresh_token, expires_at, scope, updated_at
    `, [
        String(accessToken || "").trim(),
        String(refreshToken || "").trim(),
        expiresAt,
        String(scope || "").trim() || null
    ]);
    return mapTokenRow(result.rows[0] || null);
}
module.exports = {
    getMelhorEnvioTokens,
    saveMelhorEnvioTokens
};
//# sourceMappingURL=melhorenvio-token-repository.js.map