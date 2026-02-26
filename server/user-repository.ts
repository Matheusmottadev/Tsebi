export {};
const nodeCrypto = require("node:crypto");
const bcrypt = require("bcrypt") as { compare: (raw: string, hash: string) => Promise<boolean> };

type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type DbClient = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
};

const { query, withTransaction } = require("./lib/db") as {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
  withTransaction: <T>(work: (client: DbClient) => Promise<T>) => Promise<T>;
};

type UserRow = JsonRecord & {
  id?: string;
  title?: string;
  name?: string;
  email?: string;
  phone?: string;
  is_guest?: boolean;
  created_via?: string;
  login_disabled?: boolean;
  last_login_at?: string | null;
  email_verified?: boolean;
  email_verified_at?: string | null;
  birth_date?: string | null;
  cpf?: string;
  cep?: string;
  addresses?: unknown;
  default_address_id?: string;
  password_hash?: string | null;
  admin_mfa_enabled?: boolean;
  admin_mfa_secret_enc?: string | null;
  admin_mfa_recovery_codes?: unknown;
  admin_mfa_enabled_at?: string | null;
  admin_mfa_disabled_at?: string | null;
  password_reset_required?: boolean;
  created_at?: string;
  updated_at?: string;
};

type UserAddress = {
  id: string;
  label: string;
  fullName: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type User = {
  id: string;
  title: string;
  name: string;
  email: string;
  phone: string;
  isGuest: boolean;
  createdVia: string;
  loginDisabled: boolean;
  lastLoginAt: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  birthDate: string;
  cpf: string;
  cep: string;
  addresses: UserAddress[];
  defaultAddressId: string;
  passwordHash: string | null;
  adminMfaEnabled: boolean;
  adminMfaSecretEnc: string;
  adminMfaRecoveryCodes: string[];
  adminMfaEnabledAt: string | null;
  adminMfaDisabledAt: string | null;
  passwordResetRequired: boolean;
  createdAt: string;
  updatedAt: string;
};

type CreateUserPayload = {
  title?: string;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string | null;
  birthDate?: string;
  cpf?: string;
  cep?: string;
  emailVerified?: boolean;
};

type UpdateUserPatch = {
  title?: string;
  name?: string;
  birthDate?: string;
  cpf?: string;
  cep?: string;
  addresses?: UserAddress[];
  defaultAddressId?: string;
  passwordHash?: string | null;
  isGuest?: boolean;
  createdVia?: string;
  passwordResetRequired?: boolean;
};

let userSecuritySchemaPromise: Promise<void> | null = null;

/**
 * @typedef {{
 *   id: string;
 *   label: string;
 *   fullName: string;
 *   cep: string;
 *   street: string;
 *   number: string;
 *   complement: string;
 *   district: string;
 *   city: string;
 *   state: string;
 *   isDefault: boolean;
 *   createdAt: string;
 *   updatedAt: string;
 * }} UserAddress
 */

/**
 * @typedef {{
 *   title?: string;
 *   name: string;
 *   email: string;
 *   phone?: string;
 *   passwordHash: string | null;
 *   birthDate?: string;
 *   cpf?: string;
 *   cep?: string;
 *   emailVerified?: boolean;
 * }} CreateUserPayload
 */

/**
 * @typedef {{
 *   title?: string;
 *   name?: string;
 *   birthDate?: string;
 *   cpf?: string;
 *   cep?: string;
 *   addresses?: UserAddress[];
 *   defaultAddressId?: string;
 *   passwordHash?: string | null;
 *   isGuest?: boolean;
 *   createdVia?: string;
 *   passwordResetRequired?: boolean;
 * }} UpdateUserPatch
 */

async function ensureUserSecurityColumns(): Promise<void> {
  if (!userSecuritySchemaPromise) {
    userSecuritySchemaPromise = (async () => {
      await query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS title TEXT,
          ADD COLUMN IF NOT EXISTS phone TEXT,
          ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS created_via TEXT;
      `);
      // Keep identity fields as text to avoid numeric overflow/casting errors on legacy schemas.
      await query(`
        ALTER TABLE users
          ALTER COLUMN cpf TYPE TEXT USING CASE WHEN cpf IS NULL THEN NULL ELSE cpf::text END,
          ALTER COLUMN cep TYPE TEXT USING CASE WHEN cep IS NULL THEN NULL ELSE cep::text END;
      `);
    })().catch((error: unknown) => {
      userSecuritySchemaPromise = null;
      throw error;
    });
  }

  return userSecuritySchemaPromise;
}

function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function normalizeTitle(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(["sr", "sra", "srta", "nao_informar"]);
  if (!allowed.has(normalized)) return "";
  return normalized;
}

function formatBirthDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeAddress(address: Record<string, unknown> | null | undefined): UserAddress | null {
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
    createdAt: String(address.createdAt || new Date().toISOString()),
    updatedAt: String(address.updatedAt || new Date().toISOString())
  };
}

function toDbAddresses(addresses: unknown): UserAddress[] {
  return Array.isArray(addresses)
    ? addresses
        .map((entry) => normalizeAddress(entry as Record<string, unknown> | null | undefined))
        .filter((item): item is UserAddress => Boolean(item && item.id))
    : [];
}

function fromRow(row: UserRow | null | undefined): User | null {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    title: normalizeTitle(row.title),
    name: String(row.name || ""),
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
    passwordHash: (row.password_hash as string | null) ?? null,
    adminMfaEnabled: Boolean(row.admin_mfa_enabled),
    adminMfaSecretEnc: String(row.admin_mfa_secret_enc || "").trim(),
    adminMfaRecoveryCodes: Array.isArray(row.admin_mfa_recovery_codes) ? row.admin_mfa_recovery_codes : [],
    adminMfaEnabledAt: row.admin_mfa_enabled_at || null,
    adminMfaDisabledAt: row.admin_mfa_disabled_at || null,
    passwordResetRequired: Boolean(row.password_reset_required),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || "")
  };
}

function publicUser(user: User) {
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

/**
 * @param {string} email
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function findUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const result = await query(
    `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [normalizedEmail]
  );
  return fromRow(result.rows[0] || null);
}

/**
 * @param {string} id
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function findUserById(id: string): Promise<User | null> {
  if (!id) return null;
  const result = await query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
  return fromRow(result.rows[0] || null);
}

/**
 * @param {{limit?: number; offset?: number; search?: string}} [options]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function listUsers({ limit = 100, offset = 0, search = "" }: { limit?: number; offset?: number; search?: string } = {}): Promise<User[]> {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const normalizedSearch = String(search || "").trim().toLowerCase();

  const values: unknown[] = [safeLimit, safeOffset];
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

  return result.rows.map(fromRow).filter((item): item is User => Boolean(item));
}

function maskCpfForList(cpf: string): string {
  const digits = String(cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return "";
  return `***.***.***-${digits.slice(-2)}`;
}

function adminUserListItem(user: User | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    nickname: "",
    email: user.email,
    phone: user.phone || "",
    status: user.loginDisabled ? "disabled" : "active",
    passwordSetupPending: Boolean(user.passwordResetRequired),
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt || null,
    cpfMasked: maskCpfForList(user.cpf || ""),
    cpf: "",
    cep: user.cep || ""
  };
}

/**
 * @param {{query?: string; status?: string; page?: number; pageSize?: number}} [options]
 * @returns {Promise<{rows: Array<Record<string, unknown>>; total: number; page: number; pageSize: number}>}
 */
async function searchUsersAdmin({
  query: q = "",
  status = "",
  page = 1,
  pageSize = 50
}: {query?: string; status?: string; page?: number; pageSize?: number} = {}) {
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

/**
 * @param {CreateUserPayload} payload
 * @returns {Promise<{ok: true; user: Record<string, unknown> | null} | {ok: false; error: string}>}
 */
async function createUser({ title = "", name, email, phone = "", passwordHash, birthDate, cpf, cep, emailVerified = false }: CreateUserPayload) {
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
  } catch (error: unknown) {
    if (String((error as { code?: unknown }).code || "") === "23505") {
      return { ok: false, error: "EMAIL_ALREADY_EXISTS" };
    }
    throw error;
  }
}

/**
 * @param {string} id
 * @param {UpdateUserPatch} patch
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function updateUser(id: string, patch: UpdateUserPatch): Promise<User | null> {
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

/**
 * @param {string} id
 * @param {string} passwordHash
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function setGuestTempPasswordIfMissing(id: string, passwordHash: string): Promise<User | null> {
  await ensureUserSecurityColumns();
  const safeHash = String(passwordHash || "").trim();
  if (!id || !safeHash) return null;

  const result = await query(
    `
    UPDATE users
    SET
      login_disabled = FALSE,
      password_hash = $2,
      password_reset_required = TRUE,
      is_guest = TRUE,
      created_via = COALESCE(NULLIF(created_via, ''), 'checkout_guest'),
      updated_at = NOW()
    WHERE id = $1
      AND (password_hash IS NULL OR password_hash = '')
    RETURNING *
    `,
    [id, safeHash]
  );

  return fromRow(result.rows[0] || null);
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} [patch]
 * @returns {Promise<Record<string, unknown> | { error: string } | null>}
 */
async function adminUpdateUser(id: string, patch: Record<string, unknown> = {}) {
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
  } catch (error: unknown) {
    if (String((error as { code?: unknown }).code || "") === "23505") {
      return { error: "EMAIL_ALREADY_EXISTS" };
    }
    throw error;
  }
}

/**
 * @param {string} id
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function adminDisableUserLogin(id: string): Promise<User | null> {
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

/**
 * @param {string} id
 * @param {string} passwordHash
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function adminSetUserTempPassword(id: string, passwordHash: string): Promise<User | null> {
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

/**
 * @param {string} id
 * @param {Record<string, unknown>} [snapshot]
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function adminRestoreUserAuthSnapshot(id: string, snapshot: Record<string, unknown> = {}) {
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

/**
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function markUserLoggedInNow(userId: string): Promise<User | null> {
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

/**
 * @param {string} userId
 * @returns {Promise<{ok: boolean; error?: string}>}
 */
async function invalidateUserSessions(userId: string): Promise<{ok: boolean; error?: string}> {
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
  } catch (error: unknown) {
    return { ok: false, error: "SESSION_INVALIDATION_FAILED" };
  }
}

/**
 * @param {string} id
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function deleteUserById(id: string): Promise<User | null> {
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

function hashToken(token: string): string {
  return nodeCrypto.createHash("sha256").update(String(token || "")).digest("hex");
}

/**
 * @param {string} userId
 * @param {number} [ttlMinutes]
 * @returns {Promise<{token: string; expiresAt: string}>}
 */
async function createPasswordResetToken(userId: string, ttlMinutes = 30): Promise<{token: string; expiresAt: string}> {
  const rawToken = nodeCrypto.randomBytes(32).toString("hex");
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

/**
 * @param {string} token
 * @returns {Promise<{id: string; userId: string; expiresAt: string} | null>}
 */
async function consumePasswordResetToken(token: string): Promise<{id: string; userId: string; expiresAt: string} | null> {
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
      id: String(tokenRow.id || ""),
      userId: String(tokenRow.user_id || ""),
      expiresAt: String(tokenRow.expires_at || "")
    };
  });
}

/**
 * @param {string} userId
 * @param {{secretEnc?: string; recoveryCodeHashes?: string[]}} params
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function setAdminMfaCredentials(userId: string, { secretEnc, recoveryCodeHashes }: { secretEnc?: string; recoveryCodeHashes?: string[] }) {
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

/**
 * @param {string} userId
 * @param {string[]} recoveryCodeHashes
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function replaceAdminRecoveryCodes(userId: string, recoveryCodeHashes: string[]) {
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

/**
 * @param {string} userId
 * @param {string} recoveryCode
 * @returns {Promise<{ok: boolean; user: Record<string, unknown> | null}>}
 */
async function consumeAdminRecoveryCode(userId: string, recoveryCode: string): Promise<{ok: boolean; user: User | null}> {
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

/**
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function disableAdminMfa(userId: string): Promise<User | null> {
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

/**
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function markUserEmailVerified(userId: string): Promise<User | null> {
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

/**
 * @param {Record<string, unknown>} [snapshot]
 * @returns {Promise<{ok: true; user: Record<string, unknown> | null} | {error: string}>}
 */
async function restoreUserFromSnapshot(snapshot: Record<string, unknown> = {}) {
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
  } catch (error: unknown) {
    if (String((error as { code?: unknown }).code || "") === "23505") {
      return { error: "EMAIL_ALREADY_EXISTS" };
    }
    throw error;
  }
}

function buildCheckoutAddress(address: Record<string, unknown> | null | undefined, fallbackName = ""): UserAddress | null {
  const fullName = String(fallbackName || "").trim();
  const cep = String(address?.cep || "").replace(/\D/g, "").slice(0, 8);
  const street = String(address?.street || "").trim();
  const number = String(address?.number || "").trim();
  const district = String(address?.district || "").trim();
  const city = String(address?.city || "").trim();
  const state = String(address?.state || "").trim().toUpperCase().slice(0, 2);
  if (!cep || !street || !number || !district || !city || !state) return null;

  return {
    id: nodeCrypto.randomUUID(),
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

/**
 * @param {{
 *   name?: string;
 *   email?: string;
 *   phone?: string;
 *   cpf?: string;
 *   cep?: string;
 *   shippingAddress?: Record<string, unknown> | null;
 * }} [payload]
 * @returns {Promise<{ok: true; user: Record<string, unknown> | null} | {ok: false; error: string}>}
 */
async function upsertCheckoutGuestUser({
  name = "",
  email = "",
  phone = "",
  cpf = "",
  cep = "",
  shippingAddress = null
}: {
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  cep?: string;
  shippingAddress?: Record<string, unknown> | null;
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
  upsertCheckoutGuestUser,
  setGuestTempPasswordIfMissing
};

