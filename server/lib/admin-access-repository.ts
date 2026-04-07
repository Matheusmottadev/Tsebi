export {};

const ADMIN_ROLES = ["admin", "director", "superadmin"] as const;
const ADMIN_MODULES = ["balance", "orders", "users", "products"] as const;

type AdminRole = (typeof ADMIN_ROLES)[number];
type AdminModule = (typeof ADMIN_MODULES)[number];

type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type DbClient = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
};
type UserLookupRow = {
  id?: string | null;
  name?: string | null;
};

const { query, withTransaction } = require("./db") as {
  query: DbClient["query"];
  withTransaction: <T>(work: (client: DbClient) => Promise<T>) => Promise<T>;
};
const { normalizeEmail } = require("../user-repository") as {
  normalizeEmail: (value: string) => string;
};

type AdminRow = {
  id?: string;
  user_id?: string | null;
  email?: string;
  nickname?: string;
  avatar_url?: string | null;
  theme?: string;
  accent?: string;
  role?: string;
  is_active?: boolean;
  created_by?: string | null;
  created_by_email?: string | null;
  created_by_name?: string | null;
  user_name?: string | null;
  permissions?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

type AdminAccess = {
  id: string;
  userId: string | null;
  email: string;
  name: string;
  nickname: string;
  avatarUrl: string | null;
  theme: string;
  accent: string;
  role: AdminRole;
  isActive: boolean;
  createdBy: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  permissions: AdminModule[];
  createdAt: string | null;
  updatedAt: string | null;
};

let adminAccessSchemaPromise: Promise<void> | null = null;

function normalizeAdminRole(value: unknown, fallback: AdminRole = "admin"): AdminRole {
  const normalized = String(value || "").trim().toLowerCase();
  return (ADMIN_ROLES as readonly string[]).includes(normalized) ? (normalized as AdminRole) : fallback;
}

function normalizeAdminModule(value: unknown): AdminModule | null {
  const normalized = String(value || "").trim().toLowerCase();
  return (ADMIN_MODULES as readonly string[]).includes(normalized) ? (normalized as AdminModule) : null;
}

async function ensureAdminAccessSchema(): Promise<void> {
  if (!adminAccessSchemaPromise) {
    adminAccessSchemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS admins (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          nickname TEXT,
          avatar_url TEXT,
          theme TEXT NOT NULL DEFAULT 'system',
          accent TEXT NOT NULL DEFAULT 'emerald',
          role VARCHAR(20) NOT NULL DEFAULT 'admin',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_by UUID REFERENCES admins(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`
        ALTER TABLE admins
          ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          ADD COLUMN IF NOT EXISTS nickname TEXT,
          ADD COLUMN IF NOT EXISTS avatar_url TEXT,
          ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system',
          ADD COLUMN IF NOT EXISTS accent TEXT NOT NULL DEFAULT 'emerald',
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admins(id),
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      `);

      await query(`
        ALTER TABLE admins
          ALTER COLUMN email TYPE VARCHAR(255),
          ALTER COLUMN email SET NOT NULL,
          ALTER COLUMN role TYPE VARCHAR(20),
          ALTER COLUMN role SET DEFAULT 'admin';
      `);

      await query(`
        UPDATE admins
        SET role = CASE
          WHEN lower(COALESCE(role, '')) = 'superadmin' THEN 'superadmin'
          WHEN lower(COALESCE(role, '')) = 'director' THEN 'director'
          WHEN lower(COALESCE(role, '')) = 'admin' THEN 'admin'
          WHEN lower(COALESCE(role, '')) = 'owner' THEN 'superadmin'
          ELSE 'admin'
        END
      `);

      await query(`
        ALTER TABLE admins
          DROP CONSTRAINT IF EXISTS admins_role_check;
      `);

      await query(`
        ALTER TABLE admins
          ADD CONSTRAINT admins_role_check
          CHECK (role IN ('admin', 'director', 'superadmin'));
      `).catch(() => {});

      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique_idx
          ON admins ((lower(email)));
      `);
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS admins_user_id_unique_idx
          ON admins (user_id)
          WHERE user_id IS NOT NULL;
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS admins_role_active_idx
          ON admins (role, is_active, created_at DESC);
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS admin_permissions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
          module VARCHAR(50) NOT NULL,
          granted_by UUID NOT NULL REFERENCES admins(id),
          granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (module IN ('balance', 'orders', 'users', 'products')),
          UNIQUE(admin_id, module)
        );
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS admin_permissions_admin_idx
          ON admin_permissions (admin_id, granted_at DESC);
      `);
    })().catch((error: unknown) => {
      adminAccessSchemaPromise = null;
      throw error;
    });
  }

  return adminAccessSchemaPromise;
}

function toPermissionsArray(value: unknown): AdminModule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeAdminModule(entry))
    .filter((entry): entry is AdminModule => Boolean(entry));
}

function mapAdminAccessRow(row: AdminRow | null | undefined): AdminAccess | null {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    userId: row.user_id || null,
    email: normalizeEmail(row.email || ""),
    name: String(row.user_name || row.nickname || "").trim(),
    nickname: String(row.nickname || "").trim(),
    avatarUrl: row.avatar_url || null,
    theme: String(row.theme || "system").trim() || "system",
    accent: String(row.accent || "emerald").trim() || "emerald",
    role: normalizeAdminRole(row.role, "admin"),
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    createdBy: row.created_by || null,
    createdByEmail: row.created_by_email || null,
    createdByName: row.created_by_name || null,
    permissions: toPermissionsArray(row.permissions),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function resolveUserIdByEmail(client: DbClient, email: string): Promise<{ id: string | null; name: string | null }> {
  const result = await client.query<UserLookupRow>(
    `
    SELECT id, name
    FROM users
    WHERE lower(email) = lower($1)
    LIMIT 1
    `,
    [normalizeEmail(email)]
  );
  return {
    id: result.rows[0]?.id || null,
    name: result.rows[0]?.name || null,
  };
}

async function fetchAdminAccessByWhereWithExecutor(
  executor: { query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>> },
  whereSql: string,
  values: unknown[]
): Promise<AdminAccess | null> {
  const result = await executor.query<AdminRow>(
    `
    SELECT
      a.*,
      u.name AS user_name,
      creator.email AS created_by_email,
      creator_user.name AS created_by_name,
      COALESCE(array_remove(array_agg(DISTINCT p.module), NULL), ARRAY[]::text[]) AS permissions
    FROM admins a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN admins creator ON creator.id = a.created_by
    LEFT JOIN users creator_user ON creator_user.id = creator.user_id
    LEFT JOIN admin_permissions p ON p.admin_id = a.id
    ${whereSql}
    GROUP BY a.id, u.name, creator.email, creator_user.name
    LIMIT 1
    `,
    values
  );
  return mapAdminAccessRow(result.rows[0] || null);
}

async function fetchAdminAccessByWhere(whereSql: string, values: unknown[]): Promise<AdminAccess | null> {
  await ensureAdminAccessSchema();
  return fetchAdminAccessByWhereWithExecutor({ query }, whereSql, values);
}

async function findAdminAccessByEmail(email: string): Promise<AdminAccess | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return fetchAdminAccessByWhere(`WHERE lower(a.email) = lower($1)`, [normalized]);
}

async function findAdminAccessById(id: string): Promise<AdminAccess | null> {
  if (!String(id || "").trim()) return null;
  return fetchAdminAccessByWhere(`WHERE a.id = $1`, [String(id).trim()]);
}

async function findAdminAccessByUserId(userId: string): Promise<AdminAccess | null> {
  if (!String(userId || "").trim()) return null;
  return fetchAdminAccessByWhere(`WHERE a.user_id = $1`, [String(userId).trim()]);
}

async function listAdminAccess(): Promise<AdminAccess[]> {
  await ensureAdminAccessSchema();
  const result = await query<AdminRow>(
    `
    SELECT
      a.*,
      u.name AS user_name,
      creator.email AS created_by_email,
      creator_user.name AS created_by_name,
      COALESCE(array_remove(array_agg(DISTINCT p.module), NULL), ARRAY[]::text[]) AS permissions
    FROM admins a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN admins creator ON creator.id = a.created_by
    LEFT JOIN users creator_user ON creator_user.id = creator.user_id
    LEFT JOIN admin_permissions p ON p.admin_id = a.id
    GROUP BY a.id, u.name, creator.email, creator_user.name
    ORDER BY
      CASE a.role
        WHEN 'superadmin' THEN 0
        WHEN 'director' THEN 1
        ELSE 2
      END,
      a.created_at DESC
    `
  );
  return result.rows.map(mapAdminAccessRow).filter((row): row is AdminAccess => Boolean(row));
}

async function listPrivilegedAdmins(): Promise<AdminAccess[]> {
  await ensureAdminAccessSchema();
  const result = await query<AdminRow>(
    `
    SELECT
      a.*,
      u.name AS user_name,
      creator.email AS created_by_email,
      creator_user.name AS created_by_name,
      COALESCE(array_remove(array_agg(DISTINCT p.module), NULL), ARRAY[]::text[]) AS permissions
    FROM admins a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN admins creator ON creator.id = a.created_by
    LEFT JOIN users creator_user ON creator_user.id = creator.user_id
    LEFT JOIN admin_permissions p ON p.admin_id = a.id
    WHERE a.is_active = TRUE
      AND a.role IN ('director', 'superadmin')
    GROUP BY a.id, u.name, creator.email, creator_user.name
    ORDER BY a.created_at DESC
    `
  );
  return result.rows.map(mapAdminAccessRow).filter((row): row is AdminAccess => Boolean(row));
}

async function createAdminAccess(payload: {
  email: string;
  role?: AdminRole;
  createdBy?: string | null;
}): Promise<AdminAccess | null> {
  await ensureAdminAccessSchema();
  const normalizedEmail = normalizeEmail(payload.email);
  if (!normalizedEmail) return null;

  return withTransaction(async (client: DbClient) => {
    const user = await resolveUserIdByEmail(client, normalizedEmail);
    const existingByEmail = await client.query<AdminRow>(
      `
      SELECT *
      FROM admins
      WHERE lower(email) = lower($1)
      LIMIT 1
      FOR UPDATE
      `,
      [normalizedEmail]
    );

    let adminId = existingByEmail.rows[0]?.id || null;
    const nextRole = normalizeAdminRole(payload.role, "admin");

    if (adminId) {
      await client.query(
        `
        UPDATE admins
        SET
          email = $2,
          role = $3,
          is_active = TRUE,
          user_id = COALESCE(admins.user_id, $4),
          created_by = COALESCE(admins.created_by, $5),
          updated_at = NOW()
        WHERE id = $1
        `,
        [adminId, normalizedEmail, nextRole, user.id, payload.createdBy || null]
      );
    } else {
      const insertResult = await client.query<AdminRow>(
        `
        INSERT INTO admins (email, role, is_active, user_id, created_by)
        VALUES ($1, $2, TRUE, $3, $4)
        RETURNING id
        `,
        [normalizedEmail, nextRole, user.id, payload.createdBy || null]
      );
      adminId = insertResult.rows[0]?.id || null;
    }

    if (!adminId) return null;
    return fetchAdminAccessByWhereWithExecutor(client, `WHERE a.id = $1`, [adminId]);
  });
}

async function setAdminAccessStatus(adminId: string, isActive: boolean): Promise<AdminAccess | null> {
  await ensureAdminAccessSchema();
  const normalizedId = String(adminId || "").trim();
  if (!normalizedId) return null;
  await query(
    `
    UPDATE admins
    SET
      is_active = $2,
      updated_at = NOW()
    WHERE id = $1
    `,
    [normalizedId, Boolean(isActive)]
  );
  return findAdminAccessById(normalizedId);
}

async function replaceAdminPermissions(adminId: string, modules: unknown[], grantedBy: string): Promise<AdminModule[]> {
  await ensureAdminAccessSchema();
  const normalizedAdminId = String(adminId || "").trim();
  const normalizedGrantedBy = String(grantedBy || "").trim();
  if (!normalizedAdminId || !normalizedGrantedBy) return [];

  const nextModules = Array.from(
    new Set(
      (Array.isArray(modules) ? modules : [])
        .map((entry) => normalizeAdminModule(entry))
        .filter((entry): entry is AdminModule => Boolean(entry))
    )
  );

  return withTransaction(async (client: DbClient) => {
    if (nextModules.length > 0) {
      await client.query(
        `
        DELETE FROM admin_permissions
        WHERE admin_id = $1
          AND module <> ALL($2::text[])
        `,
        [normalizedAdminId, nextModules]
      );
    } else {
      await client.query(`DELETE FROM admin_permissions WHERE admin_id = $1`, [normalizedAdminId]);
    }

    for (const moduleName of nextModules) {
      await client.query(
        `
        INSERT INTO admin_permissions (admin_id, module, granted_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (admin_id, module) DO UPDATE
        SET
          granted_by = EXCLUDED.granted_by,
          granted_at = NOW()
        `,
        [normalizedAdminId, moduleName, normalizedGrantedBy]
      );
    }

    const updated = await fetchAdminAccessByWhereWithExecutor(client, `WHERE a.id = $1`, [normalizedAdminId]);
    return updated?.permissions || [];
  });
}

async function syncAdminIdentityForUser({
  userId,
  email,
  fallbackName = "",
}: {
  userId?: string | null;
  email?: string;
  fallbackName?: string;
}): Promise<AdminAccess | null> {
  await ensureAdminAccessSchema();
  const normalizedEmail = normalizeEmail(String(email || ""));
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedEmail) return null;

  return withTransaction(async (client: DbClient) => {
    let existing: AdminRow | null = null;
    if (normalizedUserId) {
      const byUser = await client.query<AdminRow>(
        `SELECT * FROM admins WHERE user_id = $1 LIMIT 1 FOR UPDATE`,
        [normalizedUserId]
      );
      existing = byUser.rows[0] || null;
    }

    if (!existing) {
      const byEmail = await client.query<AdminRow>(
        `SELECT * FROM admins WHERE lower(email) = lower($1) LIMIT 1 FOR UPDATE`,
        [normalizedEmail]
      );
      existing = byEmail.rows[0] || null;
    }

    if (!existing?.id) return null;

    await client.query(
      `
      UPDATE admins
      SET
        user_id = COALESCE($2, admins.user_id),
        email = $3,
        nickname = COALESCE(NULLIF(admins.nickname, ''), NULLIF($4, ''), admins.nickname),
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        existing.id,
        normalizedUserId || null,
        normalizedEmail,
        String(fallbackName || "").trim().split(/\s+/)[0] || "Admin",
      ]
    );

    return fetchAdminAccessByWhereWithExecutor(client, `WHERE a.id = $1`, [String(existing.id)]);
  });
}

module.exports = {
  ADMIN_ROLES,
  ADMIN_MODULES,
  normalizeAdminRole,
  normalizeAdminModule,
  ensureAdminAccessSchema,
  mapAdminAccessRow,
  findAdminAccessByEmail,
  findAdminAccessById,
  findAdminAccessByUserId,
  listAdminAccess,
  listPrivilegedAdmins,
  createAdminAccess,
  setAdminAccessStatus,
  replaceAdminPermissions,
  syncAdminIdentityForUser,
};
