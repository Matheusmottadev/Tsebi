export {};

type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type QueryFn = <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
type AuditLogRow = {
  id?: string;
  action?: string;
  performed_by?: string;
  target_type?: string | null;
  target_id?: string | null;
  before_state?: unknown;
  after_state?: unknown;
  metadata?: unknown;
  created_at?: string | null;
  performer_email?: string | null;
  performer_name?: string | null;
};

type AuditLogRecord = {
  id: string;
  action: string;
  performedBy: string;
  performerEmail: string | null;
  performerName: string | null;
  targetType: string | null;
  targetId: string | null;
  beforeState: unknown | null;
  afterState: unknown | null;
  metadata: JsonRecord;
  createdAt: string | null;
};

const { query } = require("./db") as { query: QueryFn };

let auditSchemaPromise: Promise<void> | null = null;

async function ensureOpsAuditSchema(): Promise<void> {
  if (!auditSchemaPromise) {
    auditSchemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          action VARCHAR(60) NOT NULL,
          performed_by UUID NOT NULL REFERENCES admins(id),
          target_type VARCHAR(30),
          target_id UUID,
          before_state JSONB,
          after_state JSONB,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS audit_logs_created_idx
          ON audit_logs (created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS audit_logs_action_idx
          ON audit_logs (action, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS audit_logs_performed_by_idx
          ON audit_logs (performed_by, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS audit_logs_target_idx
          ON audit_logs (target_type, target_id, created_at DESC);
      `);
    })().catch((error: unknown) => {
      auditSchemaPromise = null;
      throw error;
    });
  }

  return auditSchemaPromise;
}

function mapAuditLogRow(row: AuditLogRow | null | undefined): AuditLogRecord | null {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    action: String(row.action || ""),
    performedBy: String(row.performed_by || ""),
    performerEmail: row.performer_email || null,
    performerName: row.performer_name || null,
    targetType: row.target_type || null,
    targetId: row.target_id || null,
    beforeState: row.before_state || null,
    afterState: row.after_state || null,
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as JsonRecord) : {},
    createdAt: row.created_at || null,
  };
}

async function insertOpsAuditLog(payload: {
  action: string;
  performedBy: string;
  targetType?: string | null;
  targetId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: unknown;
}): Promise<AuditLogRecord | null> {
  await ensureOpsAuditSchema();
  const result = await query<AuditLogRow>(
    `
    INSERT INTO audit_logs (
      action,
      performed_by,
      target_type,
      target_id,
      before_state,
      after_state,
      metadata
    ) VALUES (
      $1,
      $2,
      NULLIF($3, ''),
      NULLIF($4, '')::uuid,
      $5::jsonb,
      $6::jsonb,
      COALESCE($7::jsonb, '{}'::jsonb)
    )
    RETURNING *
    `,
    [
      String(payload.action || "").trim(),
      String(payload.performedBy || "").trim(),
      String(payload.targetType || "").trim(),
      String(payload.targetId || "").trim(),
      payload.beforeState == null ? null : JSON.stringify(payload.beforeState),
      payload.afterState == null ? null : JSON.stringify(payload.afterState),
      payload.metadata == null ? null : JSON.stringify(payload.metadata),
    ]
  );
  return mapAuditLogRow(result.rows[0] || null);
}

async function listOpsAuditLogs({
  action = "",
  performedBy = "",
  targetType = "",
  dateFrom = "",
  dateTo = "",
  page = 1,
  limit = 50,
}: {
  action?: string;
  performedBy?: string;
  targetType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ rows: AuditLogRecord[]; total: number; page: number; limit: number }> {
  await ensureOpsAuditSchema();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const offset = (safePage - 1) * safeLimit;
  const where = [];
  const values: unknown[] = [];

  if (String(action || "").trim()) {
    values.push(String(action).trim());
    where.push(`l.action = $${values.length}`);
  }
  if (String(performedBy || "").trim()) {
    values.push(String(performedBy).trim());
    where.push(`l.performed_by = $${values.length}`);
  }
  if (String(targetType || "").trim()) {
    values.push(String(targetType).trim());
    where.push(`l.target_type = $${values.length}`);
  }
  if (String(dateFrom || "").trim()) {
    values.push(String(dateFrom).trim());
    where.push(`l.created_at >= $${values.length}::timestamptz`);
  }
  if (String(dateTo || "").trim()) {
    values.push(String(dateTo).trim());
    where.push(`l.created_at <= $${values.length}::timestamptz`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  values.push(safeLimit, offset);
  const listResult = await query<AuditLogRow>(
    `
    SELECT
      l.*,
      a.email AS performer_email,
      COALESCE(u.name, a.nickname, '') AS performer_name
    FROM audit_logs l
    JOIN admins a ON a.id = l.performed_by
    LEFT JOIN users u ON u.id = a.user_id
    ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  const countResult = await query<{ total?: number }>(
    `
    SELECT COUNT(*)::int AS total
    FROM audit_logs l
    ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );

  return {
    rows: listResult.rows.map(mapAuditLogRow).filter((row): row is AuditLogRecord => Boolean(row)),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    limit: safeLimit,
  };
}

module.exports = {
  ensureOpsAuditSchema,
  mapAuditLogRow,
  insertOpsAuditLog,
  listOpsAuditLogs,
};
