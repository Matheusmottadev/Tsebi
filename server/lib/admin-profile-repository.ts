export {};

const DEFAULT_THEME = "system";
const DEFAULT_ACCENT = "emerald";
const DEFAULT_ROLE = "admin";
type Theme = "system" | "light" | "dark";
type Accent = "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";
type Role = "admin" | "director" | "superadmin";
type AdminRow = {
  id?: string;
  user_id?: string | null;
  email?: string;
  nickname?: string;
  avatar_url?: string;
  theme?: string;
  accent?: string;
  role?: string;
  created_at?: string | null;
  updated_at?: string | null;
};
type AdminProfile = {
  id: string;
  userId: string | null;
  email: string;
  nickname: string;
  avatarUrl: string;
  theme: Theme;
  accent: Accent;
  role: Role;
  createdAt: string | null;
  updatedAt: string | null;
};

type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type QueryFn = <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;

const { query } = require("./db") as { query: QueryFn };
const { normalizeEmail } = require("../user-repository") as {
  normalizeEmail: (value: string) => string;
};
const { ensureAdminAccessSchema, syncAdminIdentityForUser } = require("./admin-access-repository") as {
  ensureAdminAccessSchema: () => Promise<void>;
  syncAdminIdentityForUser: (payload: {
    userId?: string | null;
    email?: string;
    fallbackName?: string;
  }) => Promise<{ id?: string | null } | null>;
};
let adminSchemaPromise: Promise<void> | null = null;

async function ensureAdminSchema(): Promise<void> {
  if (!adminSchemaPromise) {
    adminSchemaPromise = ensureAdminAccessSchema().catch((error: unknown) => {
      adminSchemaPromise = null;
      throw error;
    });
  }

  return adminSchemaPromise;
}

function sanitizeTheme(value: unknown): Theme {
  const theme = String(value || "").trim().toLowerCase();
  if (["light", "dark", "system"].includes(theme)) return theme as Theme;
  return DEFAULT_THEME;
}

function sanitizeAccent(value: unknown): Accent {
  const accent = String(value || "").trim().toLowerCase();
  const allowed = ["emerald", "blue", "violet", "amber", "rose", "slate"];
  return allowed.includes(accent) ? (accent as Accent) : DEFAULT_ACCENT;
}

function sanitizeRole(value: unknown): Role {
  const role = String(value || "").trim().toLowerCase();
  const allowed = ["admin", "director", "superadmin"];
  return allowed.includes(role) ? (role as Role) : DEFAULT_ROLE;
}

function mapAdminRow(row: AdminRow | null | undefined): AdminProfile | null {
  if (!row) return null;
  return {
    id: String(row.id || ""),
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

async function findAdminProfileByUserId(userId: string): Promise<AdminProfile | null> {
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

async function findAdminProfileByEmail(email: string): Promise<AdminProfile | null> {
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

async function ensureAdminProfile({ userId, email, fallbackName = "" }: { userId?: string | null; email?: string; fallbackName?: string }): Promise<AdminProfile | null> {
  await ensureAdminSchema();
  const synced = await syncAdminIdentityForUser({ userId, email, fallbackName });
  if (!synced?.id) return null;
  const byUser = await findAdminProfileByUserId(String(userId || "").trim());
  if (byUser) return byUser;
  return findAdminProfileByEmail(email || "");
}

async function updateAdminProfile(userId: string, patch: { nickname?: string; avatarUrl?: string; theme?: string; accent?: string } = {}): Promise<AdminProfile | null> {
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
