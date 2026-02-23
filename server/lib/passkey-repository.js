const { query } = require("./db");

function normalizeCredentialId(value) {
  return String(value || "").trim();
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    credentialId: normalizeCredentialId(row.credential_id),
    publicKey: String(row.public_key || ""),
    counter: Number(row.counter || 0),
    transports: Array.isArray(row.transports) ? row.transports : [],
    deviceType: String(row.device_type || ""),
    backedUp: row.backed_up == null ? null : Boolean(row.backed_up),
    createdAt: row.created_at || null,
    lastUsedAt: row.last_used_at || null,
    updatedAt: row.updated_at || null
  };
}

async function listPasskeysByUserId(userId) {
  if (!userId) return [];
  const result = await query(
    `
    SELECT *
    FROM user_passkeys
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );
  return result.rows.map(fromRow).filter(Boolean);
}

async function findPasskeyByCredentialId(credentialId) {
  const normalized = normalizeCredentialId(credentialId);
  if (!normalized) return null;
  const result = await query(
    `
    SELECT *
    FROM user_passkeys
    WHERE credential_id = $1
    LIMIT 1
    `,
    [normalized]
  );
  return fromRow(result.rows[0] || null);
}

async function createPasskey({
  userId,
  credentialId,
  publicKey,
  counter = 0,
  transports = [],
  deviceType = "",
  backedUp = null
}) {
  const normalizedCredentialId = normalizeCredentialId(credentialId);
  if (!userId || !normalizedCredentialId || !publicKey) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  try {
    const result = await query(
      `
      INSERT INTO user_passkeys (
        user_id,
        credential_id,
        public_key,
        counter,
        transports,
        device_type,
        backed_up
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, NULLIF($6, ''), $7
      )
      RETURNING *
      `,
      [
        userId,
        normalizedCredentialId,
        String(publicKey),
        Math.max(0, Number(counter) || 0),
        JSON.stringify(Array.isArray(transports) ? transports : []),
        String(deviceType || "").trim(),
        backedUp == null ? null : Boolean(backedUp)
      ]
    );
    return { ok: true, passkey: fromRow(result.rows[0] || null) };
  } catch (error) {
    if (String(error?.code || "") === "23505") {
      return { ok: false, error: "PASSKEY_ALREADY_EXISTS" };
    }
    throw error;
  }
}

async function updatePasskeyCounter(credentialId, counter) {
  const normalized = normalizeCredentialId(credentialId);
  if (!normalized) return null;
  const result = await query(
    `
    UPDATE user_passkeys
    SET
      counter = $2,
      last_used_at = NOW(),
      updated_at = NOW()
    WHERE credential_id = $1
    RETURNING *
    `,
    [normalized, Math.max(0, Number(counter) || 0)]
  );
  return fromRow(result.rows[0] || null);
}

module.exports = {
  listPasskeysByUserId,
  findPasskeyByCredentialId,
  createPasskey,
  updatePasskeyCounter
};
