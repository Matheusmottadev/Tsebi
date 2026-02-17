const crypto = require("node:crypto");
const { query, withTransaction } = require("./lib/db");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function formatBirthDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeAddress(address) {
  if (!address || typeof address !== "object") return null;
  return {
    id: String(address.id || "").trim(),
    label: String(address.label || "").trim(),
    fullName: String(address.fullName || "").trim(),
    cep: String(address.cep || "").replace(/\D/g, "").slice(0, 8),
    street: String(address.street || "").trim(),
    number: String(address.number || "").trim(),
    complement: String(address.complement || "").trim(),
    district: String(address.district || "").trim(),
    city: String(address.city || "").trim(),
    state: String(address.state || "").trim().toUpperCase().slice(0, 2),
    isDefault: Boolean(address.isDefault),
    createdAt: address.createdAt || new Date().toISOString(),
    updatedAt: address.updatedAt || new Date().toISOString()
  };
}

function toDbAddresses(addresses) {
  return Array.isArray(addresses)
    ? addresses.map(normalizeAddress).filter((item) => item && item.id)
    : [];
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: normalizeEmail(row.email),
    birthDate: formatBirthDate(row.birth_date),
    cpf: String(row.cpf || "").trim(),
    cep: String(row.cep || "").trim(),
    addresses: toDbAddresses(row.addresses),
    defaultAddressId: String(row.default_address_id || "").trim(),
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
    cep: user.cep || "",
    defaultAddressId: user.defaultAddressId || "",
    addresses: user.addresses || []
  };
}

async function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const result = await query(
    `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [normalizedEmail]
  );
  return fromRow(result.rows[0] || null);
}

async function findUserById(id) {
  if (!id) return null;
  const result = await query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
  return fromRow(result.rows[0] || null);
}

async function listUsers({ limit = 100, offset = 0, search = "" } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const normalizedSearch = String(search || "").trim().toLowerCase();

  const values = [safeLimit, safeOffset];
  let whereSql = "";
  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    whereSql = `WHERE lower(name) LIKE $3 OR lower(email) LIKE $3`;
  }

  const result = await query(
    `
    SELECT *
    FROM users
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    values
  );

  return result.rows.map(fromRow).filter(Boolean);
}

async function createUser({ name, email, passwordHash, birthDate, cpf, cep }) {
  const normalizedEmail = normalizeEmail(email);
  try {
    const result = await query(
      `
      INSERT INTO users (
        name, email, password_hash, birth_date, cpf, cep, addresses, default_address_id
      ) VALUES (
        $1, $2, $3, NULLIF($4, '')::date, $5, $6, '[]'::jsonb, ''
      )
      RETURNING *
      `,
      [
        String(name || "").trim(),
        normalizedEmail,
        passwordHash,
        String(birthDate || ""),
        String(cpf || "").replace(/\D/g, "").slice(0, 11) || null,
        String(cep || "").replace(/\D/g, "").slice(0, 8) || null
      ]
    );

    return { ok: true, user: fromRow(result.rows[0]) };
  } catch (error) {
    if (String(error.code || "") === "23505") {
      return { ok: false, error: "EMAIL_ALREADY_EXISTS" };
    }
    throw error;
  }
}

async function updateUser(id, patch) {
  const current = await findUserById(id);
  if (!current) return null;

  const next = {
    name: patch.name ?? current.name,
    birthDate: patch.birthDate ?? current.birthDate,
    cpf: patch.cpf ?? current.cpf,
    cep: patch.cep ?? current.cep,
    addresses: patch.addresses ?? current.addresses,
    defaultAddressId: patch.defaultAddressId ?? current.defaultAddressId,
    passwordHash: patch.passwordHash ?? current.passwordHash
  };

  const result = await query(
    `
    UPDATE users
    SET
      name = $2,
      birth_date = NULLIF($3, '')::date,
      cpf = $4,
      cep = $5,
      addresses = $6::jsonb,
      default_address_id = $7,
      password_hash = $8,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      id,
      String(next.name || "").trim(),
      String(next.birthDate || ""),
      String(next.cpf || "").replace(/\D/g, "").slice(0, 11) || null,
      String(next.cep || "").replace(/\D/g, "").slice(0, 8) || null,
      JSON.stringify(toDbAddresses(next.addresses)),
      String(next.defaultAddressId || ""),
      next.passwordHash
    ]
  );

  return fromRow(result.rows[0] || null);
}

async function adminUpdateUser(id, patch = {}) {
  const current = await findUserById(id);
  if (!current) return null;

  const next = {
    name: patch.name ?? current.name,
    email: patch.email ?? current.email,
    birthDate: patch.birthDate ?? current.birthDate,
    cpf: patch.cpf ?? current.cpf,
    cep: patch.cep ?? current.cep
  };

  try {
    const result = await query(
      `
      UPDATE users
      SET
        name = $2,
        email = $3,
        birth_date = NULLIF($4, '')::date,
        cpf = $5,
        cep = $6,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        String(next.name || "").trim(),
        normalizeEmail(next.email),
        String(next.birthDate || ""),
        String(next.cpf || "").replace(/\D/g, "").slice(0, 11) || null,
        String(next.cep || "").replace(/\D/g, "").slice(0, 8) || null
      ]
    );

    return fromRow(result.rows[0] || null);
  } catch (error) {
    if (String(error.code || "") === "23505") {
      return { error: "EMAIL_ALREADY_EXISTS" };
    }
    throw error;
  }
}

async function deleteUserById(id) {
  if (!id) return null;
  return withTransaction(async (client) => {
    await client.query(
      `
      UPDATE orders
      SET user_id = NULL,
          updated_at = NOW()
      WHERE user_id = $1
      `,
      [id]
    );

    const result = await client.query(
      `
      DELETE FROM users
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    return fromRow(result.rows[0] || null);
  });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

async function createPasswordResetToken(userId, ttlMinutes = 30) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1 AND used_at IS NULL
      `,
      [userId]
    );

    await client.query(
      `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3::timestamptz)
      `,
      [userId, tokenHash, expiresAt]
    );
  });

  return {
    token: rawToken,
    expiresAt
  };
}

async function consumePasswordResetToken(token) {
  const tokenHash = hashToken(token);

  return withTransaction(async (client) => {
    const tokenResult = await client.query(
      `
      SELECT *
      FROM password_reset_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
      FOR UPDATE
      `,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) return null;

    const tokenRow = tokenResult.rows[0];

    await client.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = $1
      `,
      [tokenRow.id]
    );

    return {
      id: tokenRow.id,
      userId: tokenRow.user_id,
      expiresAt: tokenRow.expires_at
    };
  });
}

module.exports = {
  normalizeEmail,
  publicUser,
  findUserByEmail,
  findUserById,
  listUsers,
  createUser,
  updateUser,
  adminUpdateUser,
  deleteUserById,
  createPasswordResetToken,
  consumePasswordResetToken
};
