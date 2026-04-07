export {};

type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type QueryFn = <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
type AdminNotificationRow = {
  id?: string;
  admin_id?: string;
  type?: string;
  title?: string;
  message?: string;
  reference_id?: string | null;
  read?: boolean;
  created_at?: string | null;
};

type AdminNotification = {
  id: string;
  adminId: string;
  type: string;
  title: string;
  message: string;
  referenceId: string | null;
  read: boolean;
  createdAt: string | null;
};

const { query } = require("./db") as { query: QueryFn };

let notificationSchemaPromise: Promise<void> | null = null;

async function ensureAdminNotificationsSchema(): Promise<void> {
  if (!notificationSchemaPromise) {
    notificationSchemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS admin_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          reference_id UUID,
          read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS admin_notifications_admin_idx
          ON admin_notifications (admin_id, read, created_at DESC);
      `);
    })().catch((error: unknown) => {
      notificationSchemaPromise = null;
      throw error;
    });
  }

  return notificationSchemaPromise;
}

function mapAdminNotificationRow(row: AdminNotificationRow | null | undefined): AdminNotification | null {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    adminId: String(row.admin_id || ""),
    type: String(row.type || ""),
    title: String(row.title || ""),
    message: String(row.message || ""),
    referenceId: row.reference_id || null,
    read: Boolean(row.read),
    createdAt: row.created_at || null,
  };
}

async function createAdminNotification(payload: {
  adminId: string;
  type: string;
  title: string;
  message: string;
  referenceId?: string | null;
}): Promise<AdminNotification | null> {
  await ensureAdminNotificationsSchema();
  const result = await query<AdminNotificationRow>(
    `
    INSERT INTO admin_notifications (
      admin_id,
      type,
      title,
      message,
      reference_id
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      NULLIF($5, '')::uuid
    )
    RETURNING *
    `,
    [
      String(payload.adminId || "").trim(),
      String(payload.type || "").trim(),
      String(payload.title || "").trim(),
      String(payload.message || "").trim(),
      String(payload.referenceId || "").trim(),
    ]
  );
  return mapAdminNotificationRow(result.rows[0] || null);
}

async function createAdminNotifications(adminIds: string[], payload: {
  type: string;
  title: string;
  message: string;
  referenceId?: string | null;
}): Promise<number> {
  await ensureAdminNotificationsSchema();
  const normalizedAdminIds = Array.from(new Set((adminIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (normalizedAdminIds.length === 0) return 0;
  let created = 0;
  for (const adminId of normalizedAdminIds) {
    await createAdminNotification({
      adminId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      referenceId: payload.referenceId || null,
    });
    created += 1;
  }
  return created;
}

async function listAdminNotifications(adminId: string, limit = 20): Promise<{ rows: AdminNotification[]; unreadCount: number }> {
  await ensureAdminNotificationsSchema();
  const normalizedAdminId = String(adminId || "").trim();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const result = await query<AdminNotificationRow>(
    `
    SELECT *
    FROM admin_notifications
    WHERE admin_id = $1
    ORDER BY read ASC, created_at DESC
    LIMIT $2
    `,
    [normalizedAdminId, safeLimit]
  );
  const countResult = await query<{ total?: number }>(
    `
    SELECT COUNT(*)::int AS total
    FROM admin_notifications
    WHERE admin_id = $1
      AND read = FALSE
    `,
    [normalizedAdminId]
  );
  return {
    rows: result.rows.map(mapAdminNotificationRow).filter((row): row is AdminNotification => Boolean(row)),
    unreadCount: Number(countResult.rows[0]?.total || 0),
  };
}

async function markAdminNotificationRead(adminId: string, notificationId: string): Promise<AdminNotification | null> {
  await ensureAdminNotificationsSchema();
  const result = await query<AdminNotificationRow>(
    `
    UPDATE admin_notifications
    SET read = TRUE
    WHERE id = $1
      AND admin_id = $2
    RETURNING *
    `,
    [String(notificationId || "").trim(), String(adminId || "").trim()]
  );
  return mapAdminNotificationRow(result.rows[0] || null);
}

async function markAllAdminNotificationsRead(adminId: string): Promise<number> {
  await ensureAdminNotificationsSchema();
  const result = await query(
    `
    UPDATE admin_notifications
    SET read = TRUE
    WHERE admin_id = $1
      AND read = FALSE
    `,
    [String(adminId || "").trim()]
  );
  return Number(result.rowCount || 0);
}

module.exports = {
  ensureAdminNotificationsSchema,
  mapAdminNotificationRow,
  createAdminNotification,
  createAdminNotifications,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
};
