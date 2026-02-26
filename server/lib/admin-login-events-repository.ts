export {};
const { query } = require("./db");
type LoginEventRow = {
  id?: string;
  admin_id?: string | null;
  admin_email?: string;
  admin_nickname?: string;
  user_id?: string | null;
  success?: boolean;
  ip?: string;
  user_agent?: string;
  created_at?: string | null;
};
type LoginEvent = {
  id: string;
  adminId: string | null;
  adminEmail: string;
  adminNickname: string;
  userId: string | null;
  success: boolean;
  ip: string;
  userAgent: string;
  createdAt: string | null;
};
let adminLoginEventsSchemaPromise: Promise<void> | null = null;

async function ensureAdminLoginEventsSchema(): Promise<void> {
  if (!adminLoginEventsSchemaPromise) {
    adminLoginEventsSchemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS admin_login_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          success BOOLEAN NOT NULL DEFAULT FALSE,
          ip TEXT,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS admin_login_events_created_idx
          ON admin_login_events (created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS admin_login_events_admin_idx
          ON admin_login_events (admin_id, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS admin_login_events_success_idx
          ON admin_login_events (success, created_at DESC);
      `);
    })().catch((error: unknown) => {
      adminLoginEventsSchemaPromise = null;
      throw error;
    });
  }

  return adminLoginEventsSchemaPromise;
}

function mapLoginEvent(row: LoginEventRow | null | undefined): LoginEvent | null {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    adminId: row.admin_id || null,
    adminEmail: String(row.admin_email || ""),
    adminNickname: String(row.admin_nickname || ""),
    userId: row.user_id || null,
    success: Boolean(row.success),
    ip: String(row.ip || ""),
    userAgent: String(row.user_agent || ""),
    createdAt: row.created_at || null
  };
}

async function insertAdminLoginEvent(payload: { adminId?: string | null; userId?: string | null; success?: boolean; ip?: string; userAgent?: string } = {}): Promise<LoginEvent | null> {
  await ensureAdminLoginEventsSchema();
  const result = await query(
    `
    INSERT INTO admin_login_events (
      admin_id,
      user_id,
      success,
      ip,
      user_agent
    ) VALUES (
      $1,
      $2,
      $3,
      NULLIF($4, ''),
      NULLIF($5, '')
    )
    RETURNING *
    `,
    [
      payload.adminId || null,
      payload.userId || null,
      Boolean(payload.success),
      String(payload.ip || ""),
      String(payload.userAgent || "")
    ]
  );

  return mapLoginEvent(result.rows[0] || null);
}

async function listAdminLoginEvents({
  from = "",
  to = "",
  adminId = "",
  page = 1,
  pageSize = 30
}: {
  from?: string;
  to?: string;
  adminId?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ rows: (LoginEvent | null)[]; total: number; page: number; pageSize: number }> {
  await ensureAdminLoginEventsSchema();
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 30));
  const offset = (safePage - 1) * safePageSize;

  const where = [];
  const values = [];

  if (String(adminId || "").trim()) {
    values.push(String(adminId).trim());
    where.push(`admin_id = $${values.length}`);
  }

  if (String(from || "").trim()) {
    values.push(String(from).trim());
    where.push(`created_at >= $${values.length}::timestamptz`);
  }

  if (String(to || "").trim()) {
    values.push(String(to).trim());
    where.push(`created_at <= $${values.length}::timestamptz`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  values.push(safePageSize, offset);

  const listResult = await query(
    `
    SELECT
      e.*,
      COALESCE(a.email, '') AS admin_email,
      COALESCE(a.nickname, '') AS admin_nickname
    FROM admin_login_events e
    LEFT JOIN admins a ON a.id = e.admin_id
    ${whereSql}
    ORDER BY e.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM admin_login_events
    ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );

  return {
    rows: listResult.rows.map(mapLoginEvent),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize
  };
}

module.exports = {
  mapLoginEvent,
  insertAdminLoginEvent,
  listAdminLoginEvents
};

