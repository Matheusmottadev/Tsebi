const { query } = require("./db");
const { normalizeEmail } = require("../user-repository");

const DEFAULT_THEME = "system";
const DEFAULT_ACCENT = "emerald";
const DEFAULT_ROLE = "owner";
let adminSchemaPromise = null;

async function ensureAdminSchema() {
  if (!adminSchemaPromise) {
    adminSchemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS admins (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          nickname TEXT,
          avatar_url TEXT,
          theme TEXT NOT NULL DEFAULT 'system',
          accent TEXT NOT NULL DEFAULT 'emerald',
          role TEXT NOT NULL DEFAULT 'owner',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (theme IN ('system', 'light', 'dark')),
          CHECK (length(role) >= 3)
        );
      `);

      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique_idx
          ON admins ((lower(email)));
      `);
    })().catch((error) => {
      adminSchemaPromise = null;
      throw error;
    });
  }

  return adminSchemaPromise;
}

function sanitizeTheme(value) {
  const theme = String(value || "").trim().toLowerCase();
  if (["light", "dark", "system"].includes(theme)) return theme;
  return DEFAULT_THEME;
}

function sanitizeAccent(value) {
  const accent = String(value || "").trim().toLowerCase();
  const allowed = ["emerald", "blue", "violet", "amber", "rose", "slate"];
  return allowed.includes(accent) ? accent : DEFAULT_ACCENT;
}

function sanitizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  const allowed = ["owner", "manager", "editor", "viewer"];
  return allowed.includes(role) ? role : DEFAULT_ROLE;
}

function mapAdminRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || null,
    email: normalizeEmail(row.email || ""),
    nickname: String(row.nickname || "").trim(),
    avatarUrl: String(row.avatar_url || "").trim(),
    theme: sanitizeTheme(row.theme),
    accent: sanitizeAccent(row.accent),
    role: sanitizeRole(row.role),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function findAdminProfileByUserId(userId) {
  await ensureAdminSchema();
  if (!userId) return null;
  const result = await query(
    `
    SELECT *
    FROM admins
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );
  return mapAdminRow(result.rows[0] || null);
}

async function findAdminProfileByEmail(email) {
  await ensureAdminSchema();
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const result = await query(
    `
    SELECT *
    FROM admins
    WHERE lower(email) = lower($1)
    LIMIT 1
    `,
    [normalized]
  );
  return mapAdminRow(result.rows[0] || null);
}

async function ensureAdminProfile({ userId, email, fallbackName = "" }) {
  await ensureAdminSchema();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const nickname = String(fallbackName || "").trim().split(/\s+/)[0] || "Admin";
  const result = await query(
    `
    INSERT INTO admins (user_id, email, nickname, theme, accent, role)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id) DO UPDATE
    SET
      email = EXCLUDED.email,
      nickname = COALESCE(NULLIF(admins.nickname, ''), EXCLUDED.nickname),
      updated_at = NOW()
    RETURNING *
    `,
    [userId || null, normalizedEmail, nickname, DEFAULT_THEME, DEFAULT_ACCENT, DEFAULT_ROLE]
  );

  return mapAdminRow(result.rows[0] || null);
}

async function updateAdminProfile(userId, patch = {}) {
  await ensureAdminSchema();
  const current = await findAdminProfileByUserId(userId);
  if (!current) return null;

  const nickname = patch.nickname == null ? current.nickname : String(patch.nickname || "").trim().slice(0, 80);
  const avatarUrl = patch.avatarUrl == null ? current.avatarUrl : String(patch.avatarUrl || "").trim().slice(0, 600);
  const theme = patch.theme == null ? current.theme : sanitizeTheme(patch.theme);
  const accent = patch.accent == null ? current.accent : sanitizeAccent(patch.accent);

  const result = await query(
    `
    UPDATE admins
    SET
      nickname = $2,
      avatar_url = NULLIF($3, ''),
      theme = $4,
      accent = $5,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING *
    `,
    [userId, nickname, avatarUrl, theme, accent]
  );

  return mapAdminRow(result.rows[0] || null);
}

module.exports = {
  sanitizeTheme,
  sanitizeAccent,
  sanitizeRole,
  mapAdminRow,
  findAdminProfileByUserId,
  findAdminProfileByEmail,
  ensureAdminProfile,
  updateAdminProfile
};
