const { query } = require("./db");

function mapLoginEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
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

async function insertAdminLoginEvent(payload = {}) {
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
} = {}) {
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
