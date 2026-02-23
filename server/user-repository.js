const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const { query, withTransaction } = require("./lib/db");

let userSecuritySchemaPromise = null;

async function ensureUserSecurityColumns() {
  if (!userSecuritySchemaPromise) {
    userSecuritySchemaPromise = (async () => {
      await query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS title TEXT,
          ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS created_via TEXT;
      `);
    })().catch((error) => {
      userSecuritySchemaPromise = null;
      throw error;
    });
  }

  return userSecuritySchemaPromise;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeTitle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(["sr", "sra", "srta", "nao_informar"]);
  if (!allowed.has(normalized)) return "";
  return normalized;
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
    title: normalizeTitle(row.title),
    name: row.name,
    email: normalizeEmail(row.email),
    phone: String(row.phone || "").trim(),
    isGuest: Boolean(row.is_guest),
    createdVia: String(row.created_via || "").trim(),
    loginDisabled: Boolean(row.login_disabled),
    lastLoginAt: row.last_login_at || null,
    emailVerified: Boolean(row.email_verified),
    emailVerifiedAt: row.email_verified_at || null,
    birthDate: formatBirthDate(row.birth_date),
    cpf: String(row.cpf || "").trim(),
    cep: String(row.cep || "").trim(),
    addresses: toDbAddresses(row.addresses),
    defaultAddressId: String(row.default_address_id || "").trim(),
    passwordHash: row.password_hash,
    adminMfaEnabled: Boolean(row.admin_mfa_enabled),
    adminMfaSecretEnc: String(row.admin_mfa_secret_enc || "").trim(),
    adminMfaRecoveryCodes: Array.isArray(row.admin_mfa_recovery_codes) ? row.admin_mfa_recovery_codes : [],
    adminMfaEnabledAt: row.admin_mfa_enabled_at || null,
    adminMfaDisabledAt: row.admin_mfa_disabled_at || null,
    passwordResetRequired: Boolean(row.password_reset_required),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicUser(user) {
  return {
    id: user.id,
    title: user.title || "",
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt || null,
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

function maskCpfForList(cpf) {
  const digits = String(cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return "";
  return `***.***.***-${digits.slice(-2)}`;
}

function adminUserListItem(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    nickname: "",
    email: user.email,
    phone: user.phone || "",
    status: user.loginDisabled ? "disabled" : "active",
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt || null,
    cpfMasked: maskCpfForList(user.cpf || ""),
    cpf: "",
    cep: user.cep || ""
  };
}

async function searchUsersAdmin({
  query: q = "",
  status = "",
  page = 1,
  pageSize = 50
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  const where = [];
  const values = [];

  const normalizedQuery = String(q || "").trim().toLowerCase();
  if (normalizedQuery) {
    values.push(`%${normalizedQuery}%`);
    const idx = values.length;
    where.push(`(lower(name) LIKE $${idx} OR lower(email) LIKE $${idx})`);
  }

  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (normalizedStatus === "active") {
    where.push(`login_disabled = false`);
  } else if (normalizedStatus === "disabled") {
    where.push(`login_disabled = true`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  values.push(safePageSize, offset);
  const limitIdx = values.length - 1;
  const offsetIdx = values.length;

  const listResult = await query(
    `
    SELECT *
    FROM users
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM users
    ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );

  const rows = listResult.rows.map(fromRow).filter(Boolean);
  return {
    rows: rows.map(adminUserListItem).filter(Boolean),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize
  };
}

async function createUser({ title = "", name, email, phone = "", passwordHash, birthDate, cpf, cep, emailVerified = false }) {
  await ensureUserSecurityColumns();
  const normalizedEmail = normalizeEmail(email);
  try {
    const result = await query(
      `
        INSERT INTO users (
          title, name, email, phone, password_hash, birth_date, cpf, cep, addresses, default_address_id, email_verified, email_verified_at
        ) VALUES (
          NULLIF($1, ''), $2, $3, NULLIF($4, ''), $5, NULLIF($6, '')::date, $7, $8, '[]'::jsonb, '', $9, CASE WHEN $9 THEN NOW() ELSE NULL END
        )
        RETURNING *
        `,
        [
          normalizeTitle(title),
          String(name || "").trim(),
          normalizedEmail,
          String(phone || "").trim().slice(0, 40),
          passwordHash,
          String(birthDate || ""),
          String(cpf || "").replace(/\D/g, "").slice(0, 11) || null,
          String(cep || "").replace(/\D/g, "").slice(0, 8) || null,
          Boolean(emailVerified)
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
  await ensureUserSecurityColumns();
  const current = await findUserById(id);
  if (!current) return null;

  const next = {
    title: patch.title ?? current.title,
    name: patch.name ?? current.name,
    birthDate: patch.birthDate ?? current.birthDate,
    cpf: patch.cpf ?? current.cpf,
    cep: patch.cep ?? current.cep,
    addresses: patch.addresses ?? current.addresses,
    defaultAddressId: patch.defaultAddressId ?? current.defaultAddressId,
    passwordHash: patch.passwordHash ?? current.passwordHash,
    isGuest: patch.isGuest == null ? Boolean(current.isGuest) : Boolean(patch.isGuest),
    createdVia: patch.createdVia ?? current.createdVia,
    passwordResetRequired:
      patch.passwordResetRequired == null
        ? patch.passwordHash
          ? false
          : Boolean(current.passwordResetRequired)
        : Boolean(patch.passwordResetRequired)
  };

  const result = await query(
    `
    UPDATE users
    SET
      name = $2,
      title = NULLIF($3, ''),
      birth_date = NULLIF($4, '')::date,
      cpf = $5,
      cep = $6,
      addresses = $7::jsonb,
      default_address_id = $8,
      password_hash = $9,
      password_reset_required = $10,
      is_guest = $11,
      created_via = NULLIF($12, ''),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      id,
      String(next.name || "").trim(),
      normalizeTitle(next.title),
      String(next.birthDate || ""),
      String(next.cpf || "").replace(/\D/g, "").slice(0, 11) || null,
      String(next.cep || "").replace(/\D/g, "").slice(0, 8) || null,
      JSON.stringify(toDbAddresses(next.addresses)),
      String(next.defaultAddressId || ""),
      next.passwordHash,
      Boolean(next.passwordResetRequired),
      Boolean(next.isGuest),
      String(next.createdVia || "").trim()
    ]
  );

  return fromRow(result.rows[0] || null);
}

async function adminUpdateUser(id, patch = {}) {
  await ensureUserSecurityColumns();
  const current = await findUserById(id);
  if (!current) return null;

  const next = {
    title: patch.title ?? current.title,
    name: patch.name ?? current.name,
    email: patch.email ?? current.email,
    phone: patch.phone ?? current.phone,
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
        title = NULLIF($3, ''),
        email = $4,
        phone = NULLIF($5, ''),
        birth_date = NULLIF($6, '')::date,
        cpf = $7,
        cep = $8,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        String(next.name || "").trim(),
        normalizeTitle(next.title),
        normalizeEmail(next.email),
        String(next.phone || "").trim().slice(0, 40),
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

async function adminDisableUserLogin(id) {
  await ensureUserSecurityColumns();
  const current = await findUserById(id);
  if (!current) return null;

  const result = await query(
    `
    UPDATE users
    SET
      login_disabled = TRUE,
      password_hash = NULL,
      password_reset_required = FALSE,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return fromRow(result.rows[0] || null);
}

async function adminSetUserTempPassword(id, passwordHash) {
  await ensureUserSecurityColumns();
  const current = await findUserById(id);
  if (!current) return null;

  const safeHash = String(passwordHash || "").trim();
  if (!safeHash) return null;

  const result = await query(
    `
    UPDATE users
    SET
      login_disabled = FALSE,
      password_hash = $2,
      password_reset_required = TRUE,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [id, safeHash]
  );

  return fromRow(result.rows[0] || null);
}

async function adminRestoreUserAuthSnapshot(id, snapshot = {}) {
  await ensureUserSecurityColumns();
  const current = await findUserById(id);
  if (!current) return null;

  const passwordHash = snapshot.passwordHash == null ? current.passwordHash : String(snapshot.passwordHash || "").trim();
  const loginDisabled =
    snapshot.loginDisabled == null ? Boolean(current.loginDisabled) : Boolean(snapshot.loginDisabled);
  const passwordResetRequired =
    snapshot.passwordResetRequired == null
      ? Boolean(current.passwordResetRequired)
      : Boolean(snapshot.passwordResetRequired);

  const result = await query(
    `
    UPDATE users
    SET
      login_disabled = $2,
      password_hash = $3,
      password_reset_required = $4,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [id, loginDisabled, passwordHash || null, passwordResetRequired]
  );

  return fromRow(result.rows[0] || null);
}

async function markUserLoggedInNow(userId) {
  if (!userId) return null;
  const result = await query(
    `
    UPDATE users
    SET last_login_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [userId]
  );
  return fromRow(result.rows[0] || null);
}

async function invalidateUserSessions(userId) {
  if (!userId) return { ok: false, error: "INVALID_ID" };

  try {
    await query(
      `
      DELETE FROM user_sessions
      WHERE (sess::jsonb ->> 'userId') = $1
      `,
      [String(userId)]
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: "SESSION_INVALIDATION_FAILED" };
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

async function setAdminMfaCredentials(userId, { secretEnc, recoveryCodeHashes }) {
  const safeSecret = String(secretEnc || "").trim();
  const safeHashes = Array.isArray(recoveryCodeHashes)
    ? recoveryCodeHashes.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  const result = await query(
    `
    UPDATE users
    SET
      admin_mfa_enabled = TRUE,
      admin_mfa_secret_enc = $2,
      admin_mfa_recovery_codes = $3::jsonb,
      admin_mfa_enabled_at = NOW(),
      admin_mfa_disabled_at = NULL,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [userId, safeSecret, JSON.stringify(safeHashes)]
  );

  return fromRow(result.rows[0] || null);
}

async function replaceAdminRecoveryCodes(userId, recoveryCodeHashes) {
  const safeHashes = Array.isArray(recoveryCodeHashes)
    ? recoveryCodeHashes.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

  const result = await query(
    `
    UPDATE users
    SET
      admin_mfa_recovery_codes = $2::jsonb,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [userId, JSON.stringify(safeHashes)]
  );

  return fromRow(result.rows[0] || null);
}

async function consumeAdminRecoveryCode(userId, recoveryCode) {
  const normalizedCode = String(recoveryCode || "").trim();
  if (!normalizedCode) return { ok: false, user: null };

  const user = await findUserById(userId);
  if (!user || !Array.isArray(user.adminMfaRecoveryCodes) || user.adminMfaRecoveryCodes.length === 0) {
    return { ok: false, user };
  }

  let matchedIndex = -1;
  for (let index = 0; index < user.adminMfaRecoveryCodes.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const isMatch = await bcrypt.compare(normalizedCode, String(user.adminMfaRecoveryCodes[index] || ""));
    if (isMatch) {
      matchedIndex = index;
      break;
    }
  }

  if (matchedIndex < 0) {
    return { ok: false, user };
  }

  const nextHashes = user.adminMfaRecoveryCodes.filter((_, index) => index !== matchedIndex);
  const updated = await replaceAdminRecoveryCodes(userId, nextHashes);
  return { ok: true, user: updated };
}

async function disableAdminMfa(userId) {
  const result = await query(
    `
    UPDATE users
    SET
      admin_mfa_enabled = FALSE,
      admin_mfa_secret_enc = NULL,
      admin_mfa_recovery_codes = '[]'::jsonb,
      admin_mfa_disabled_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [userId]
  );

  return fromRow(result.rows[0] || null);
}

async function markUserEmailVerified(userId) {
  const result = await query(
    `
    UPDATE users
    SET
      email_verified = TRUE,
      email_verified_at = COALESCE(email_verified_at, NOW()),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [userId]
  );
  return fromRow(result.rows[0] || null);
}

async function restoreUserFromSnapshot(snapshot = {}) {
  await ensureUserSecurityColumns();
  const id = String(snapshot.id || "").trim();
  const email = normalizeEmail(snapshot.email);
  const passwordHash = String(snapshot.passwordHash || "").trim();
  if (!id || !email || !passwordHash) {
    return { error: "INVALID_SNAPSHOT" };
  }

  try {
    const result = await query(
      `
      INSERT INTO users (
        id,
        title,
        name,
        email,
        password_hash,
        birth_date,
        cpf,
        cep,
        addresses,
        default_address_id,
        email_verified,
        email_verified_at,
        admin_mfa_enabled,
        admin_mfa_secret_enc,
        admin_mfa_recovery_codes,
        admin_mfa_enabled_at,
        admin_mfa_disabled_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        NULLIF($2, ''),
        $3,
        $4,
        $5,
        NULLIF($6, '')::date,
        $7,
        $8,
        $9::jsonb,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15::jsonb,
        $16::timestamptz,
        $17::timestamptz,
        COALESCE($18::timestamptz, NOW()),
        COALESCE($19::timestamptz, NOW())
      )
      ON CONFLICT (id) DO UPDATE
      SET
        title = EXCLUDED.title,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        birth_date = EXCLUDED.birth_date,
        cpf = EXCLUDED.cpf,
        cep = EXCLUDED.cep,
        addresses = EXCLUDED.addresses,
        default_address_id = EXCLUDED.default_address_id,
        email_verified = EXCLUDED.email_verified,
        email_verified_at = EXCLUDED.email_verified_at,
        admin_mfa_enabled = EXCLUDED.admin_mfa_enabled,
        admin_mfa_secret_enc = EXCLUDED.admin_mfa_secret_enc,
        admin_mfa_recovery_codes = EXCLUDED.admin_mfa_recovery_codes,
        admin_mfa_enabled_at = EXCLUDED.admin_mfa_enabled_at,
        admin_mfa_disabled_at = EXCLUDED.admin_mfa_disabled_at,
        created_at = EXCLUDED.created_at,
        updated_at = COALESCE(EXCLUDED.updated_at, NOW())
      RETURNING *
      `,
      [
        id,
        normalizeTitle(snapshot.title),
        String(snapshot.name || "").trim(),
        email,
        passwordHash,
        String(snapshot.birthDate || "").trim(),
        String(snapshot.cpf || "").replace(/\D/g, "").slice(0, 11) || null,
        String(snapshot.cep || "").replace(/\D/g, "").slice(0, 8) || null,
        JSON.stringify(toDbAddresses(snapshot.addresses)),
        String(snapshot.defaultAddressId || "").trim(),
        Boolean(snapshot.emailVerified),
        snapshot.emailVerifiedAt || null,
        Boolean(snapshot.adminMfaEnabled),
        String(snapshot.adminMfaSecretEnc || "").trim() || null,
        JSON.stringify(
          Array.isArray(snapshot.adminMfaRecoveryCodes)
            ? snapshot.adminMfaRecoveryCodes.map((item) => String(item || "").trim()).filter(Boolean)
            : []
        ),
        snapshot.adminMfaEnabledAt || null,
        snapshot.adminMfaDisabledAt || null,
        snapshot.createdAt || null,
        snapshot.updatedAt || null
      ]
    );

    return { ok: true, user: fromRow(result.rows[0] || null) };
  } catch (error) {
    if (String(error.code || "") === "23505") {
      return { error: "EMAIL_ALREADY_EXISTS" };
    }
    throw error;
  }
}

function buildCheckoutAddress(address, fallbackName = "") {
  const fullName = String(fallbackName || "").trim();
  const cep = String(address?.cep || "").replace(/\D/g, "").slice(0, 8);
  const street = String(address?.street || "").trim();
  const number = String(address?.number || "").trim();
  const district = String(address?.district || "").trim();
  const city = String(address?.city || "").trim();
  const state = String(address?.state || "").trim().toUpperCase().slice(0, 2);
  if (!cep || !street || !number || !district || !city || !state) return null;

  return {
    id: crypto.randomUUID(),
    label: "Principal",
    fullName: fullName || "Cliente",
    cep,
    street,
    number,
    complement: String(address?.complement || "").trim(),
    district,
    city,
    state,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function upsertCheckoutGuestUser({
  name = "",
  email = "",
  phone = "",
  cpf = "",
  cep = "",
  shippingAddress = null
} = {}) {
  await ensureUserSecurityColumns();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, error: "EMAIL_REQUIRED" };
  }

  const safeName = String(name || "").trim() || normalizedEmail.split("@")[0] || "Cliente Tsebi";
  const safePhone = String(phone || "").trim().slice(0, 40);
  const safeCpf = String(cpf || "").replace(/\D/g, "").slice(0, 11) || null;
  const safeCep = String(cep || "").replace(/\D/g, "").slice(0, 8) || null;
  const candidateAddress = buildCheckoutAddress(shippingAddress, safeName);

  const existing = await findUserByEmail(normalizedEmail);
  if (!existing) {
    const created = await createUser({
      title: "nao_informar",
      name: safeName,
      email: normalizedEmail,
      phone: safePhone,
      passwordHash: null,
      birthDate: "",
      cpf: safeCpf || "",
      cep: safeCep || "",
      emailVerified: true
    });

    if (!created.ok || !created.user) return created;

    const initialAddresses = candidateAddress ? [candidateAddress] : [];
    const updated = await query(
      `
      UPDATE users
      SET
        is_guest = TRUE,
        created_via = 'checkout_guest',
        phone = NULLIF($2, ''),
        addresses = $3::jsonb,
        default_address_id = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        created.user.id,
        safePhone,
        JSON.stringify(toDbAddresses(initialAddresses)),
        initialAddresses[0]?.id || ""
      ]
    );
    return { ok: true, user: fromRow(updated.rows[0] || created.user) };
  }

  const existingAddresses = Array.isArray(existing.addresses) ? existing.addresses : [];
  const hasDefault = Boolean(existing.defaultAddressId) && existingAddresses.some((address) => address.id === existing.defaultAddressId);
  const nextAddresses = existingAddresses.length ? [...existingAddresses] : [];
  let defaultAddressId = String(existing.defaultAddressId || "").trim();

  if (candidateAddress && nextAddresses.length === 0) {
    nextAddresses.push(candidateAddress);
    defaultAddressId = candidateAddress.id;
  } else if (!hasDefault && nextAddresses.length > 0) {
    defaultAddressId = nextAddresses[0].id;
  }

  const updated = await query(
    `
    UPDATE users
    SET
      name = COALESCE(NULLIF($2, ''), name),
      phone = COALESCE(NULLIF($3, ''), phone),
      cpf = COALESCE($4, cpf),
      cep = COALESCE($5, cep),
      addresses = $6::jsonb,
      default_address_id = $7,
      is_guest = CASE WHEN password_hash IS NULL THEN TRUE ELSE FALSE END,
      created_via = COALESCE(NULLIF(created_via, ''), 'checkout_guest'),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      existing.id,
      safeName,
      safePhone,
      safeCpf,
      safeCep,
      JSON.stringify(toDbAddresses(nextAddresses)),
      defaultAddressId
    ]
  );

  return { ok: true, user: fromRow(updated.rows[0] || existing) };
}

module.exports = {
  normalizeEmail,
  publicUser,
  findUserByEmail,
  findUserById,
  listUsers,
  searchUsersAdmin,
  createUser,
  updateUser,
  adminUpdateUser,
  adminDisableUserLogin,
  adminSetUserTempPassword,
  adminRestoreUserAuthSnapshot,
  markUserLoggedInNow,
  invalidateUserSessions,
  deleteUserById,
  createPasswordResetToken,
  consumePasswordResetToken,
  setAdminMfaCredentials,
  replaceAdminRecoveryCodes,
  consumeAdminRecoveryCode,
  disableAdminMfa,
  markUserEmailVerified,
  restoreUserFromSnapshot,
  upsertCheckoutGuestUser
};
