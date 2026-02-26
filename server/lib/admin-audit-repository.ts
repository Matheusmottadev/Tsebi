export {};
const { query } = require("./db");

const DEFAULT_RETENTION_DAYS = 30;
type JsonRecord = Record<string, unknown>;
type AuditRow = {
  id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string | null;
  summary?: string;
  actor_admin_id?: string | null;
  actor_user_id?: string | null;
  actor_email?: string;
  request_ip?: string;
  user_agent?: string;
  changed_fields?: unknown;
  change_before?: unknown;
  change_after?: unknown;
  reverse_payload?: unknown;
  reverse_result?: unknown;
  meta?: unknown;
  reversible_until?: string | null;
  reversible?: boolean | null;
  reversed_at?: string | null;
  reversed_by_user_id?: string | null;
  reversed_by_email?: string;
  created_at?: string | null;
};
type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  actorAdminId: string | null;
  actorUserId: string | null;
  actorEmail: string;
  requestIp: string;
  userAgent: string;
  changedFields: string[];
  before: unknown | null;
  after: unknown | null;
  meta: JsonRecord;
  reversibleUntil: string | null;
  reversible: boolean;
  reversedAt: string | null;
  reversedByUserId: string | null;
  reversedByEmail: string;
  createdAt: string | null;
  reversePayload?: unknown | null;
  reverseResult?: unknown | null;
};
let auditSchemaPromise: Promise<void> | null = null;

async function ensureAdminAuditSchema(): Promise<void> {
  if (!auditSchemaPromise) {
    auditSchemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          summary TEXT NOT NULL,
          actor_admin_id UUID,
          actor_user_id UUID,
          actor_email TEXT,
          request_ip TEXT,
          user_agent TEXT,
          changed_fields TEXT[] NOT NULL DEFAULT '{}'::text[],
          change_before JSONB,
          change_after JSONB,
          reverse_payload JSONB,
          reverse_result JSONB,
          meta JSONB NOT NULL DEFAULT '{}'::jsonb,
          reversible_until TIMESTAMPTZ NOT NULL,
          reversible BOOLEAN NOT NULL DEFAULT TRUE,
          reversed_at TIMESTAMPTZ,
          reversed_by_user_id UUID,
          reversed_by_email TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`
        ALTER TABLE admin_audit_logs
          ADD COLUMN IF NOT EXISTS actor_admin_id UUID,
          ADD COLUMN IF NOT EXISTS changed_fields TEXT[] NOT NULL DEFAULT '{}'::text[],
          ADD COLUMN IF NOT EXISTS reversible BOOLEAN NOT NULL DEFAULT TRUE;
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
          ON admin_audit_logs (created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS admin_audit_logs_entity_idx
          ON admin_audit_logs (entity_type, entity_id, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx
          ON admin_audit_logs (actor_email, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_admin_idx
          ON admin_audit_logs (actor_admin_id, created_at DESC);
      `);
    })().catch((error: unknown) => {
      auditSchemaPromise = null;
      throw error;
    });
  }

  return auditSchemaPromise;
}

function getAdminAuditRetentionDays(): number {
  const raw = Number(process.env.ADMIN_AUDIT_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw)) return DEFAULT_RETENTION_DAYS;
  return Math.max(1, Math.min(180, Math.floor(raw)));
}

function toJson(value: unknown): string | null {
  if (value === undefined) return null;
  return value == null ? null : JSON.stringify(value);
}

function mapAuditRow(row: AuditRow | null | undefined, includeInternal = false, includeChanges = true): AuditLog | null {
  if (!row) return null;

  const now = Date.now();
  const reversibleUntilTs = row.reversible_until ? new Date(row.reversible_until).getTime() : 0;
  const reversibleByTime = !row.reversed_at && Number.isFinite(reversibleUntilTs) && reversibleUntilTs > now;
  const reversibleFlag = row.reversible == null ? true : Boolean(row.reversible);
  const reversible = reversibleByTime && reversibleFlag;

  const mapped: AuditLog = {
    id: String(row.id || ""),
    action: String(row.action || ""),
    entityType: String(row.entity_type || ""),
    entityId: row.entity_id || null,
    summary: String(row.summary || ""),
    actorAdminId: row.actor_admin_id || null,
    actorUserId: row.actor_user_id || null,
    actorEmail: String(row.actor_email || ""),
    requestIp: String(row.request_ip || ""),
    userAgent: String(row.user_agent || ""),
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields.map((item) => String(item || "")).filter(Boolean) : [],
    before: includeChanges ? row.change_before || null : null,
    after: includeChanges ? row.change_after || null : null,
    meta: (row.meta && typeof row.meta === "object" ? (row.meta as JsonRecord) : {}),
    reversibleUntil: row.reversible_until || null,
    reversible,
    reversedAt: row.reversed_at || null,
    reversedByUserId: row.reversed_by_user_id || null,
    reversedByEmail: String(row.reversed_by_email || ""),
    createdAt: row.created_at || null
  };

  if (includeInternal) {
    mapped.reversePayload = row.reverse_payload || null;
    mapped.reverseResult = row.reverse_result || null;
  }

  return mapped;
}

async function pruneExpiredAdminAuditLogs(): Promise<void> {
  await ensureAdminAuditSchema();
  const retentionDays = getAdminAuditRetentionDays();
  await query(
    `
    DELETE FROM admin_audit_logs
    WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [retentionDays]
  );
}

async function insertAdminAuditLog(payload: {
  action?: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  actorAdminId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string;
  requestIp?: string;
  userAgent?: string;
  changedFields?: string[];
  before?: unknown;
  after?: unknown;
  reversePayload?: unknown;
  meta?: unknown;
  reversible?: boolean;
} = {}): Promise<AuditLog | null> {
  await ensureAdminAuditSchema();
  await pruneExpiredAdminAuditLogs();

  const retentionDays = getAdminAuditRetentionDays();
  const changedFields = Array.isArray(payload.changedFields)
    ? payload.changedFields.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 50)
    : [];
  const reversible = payload.reversible == null ? true : Boolean(payload.reversible);

  const result = await query(
    `
    INSERT INTO admin_audit_logs (
      action,
      entity_type,
      entity_id,
      summary,
      actor_admin_id,
      actor_user_id,
      actor_email,
      request_ip,
      user_agent,
      changed_fields,
      change_before,
      change_after,
      reverse_payload,
      meta,
      reversible_until,
      reversible
    )
    VALUES (
      $1,
      $2,
      NULLIF($3, ''),
      $4,
      $5,
      $6,
      NULLIF($7, ''),
      NULLIF($8, ''),
      NULLIF($9, ''),
      COALESCE($10::text[], '{}'::text[]),
      $11::jsonb,
      $12::jsonb,
      $13::jsonb,
      COALESCE($14::jsonb, '{}'::jsonb),
      NOW() + ($15::int * INTERVAL '1 day'),
      $16
    )
    RETURNING *
    `,
    [
      String(payload.action || "update"),
      String(payload.entityType || "unknown"),
      String(payload.entityId || ""),
      String(payload.summary || "Mudanca administrativa"),
      payload.actorAdminId || null,
      payload.actorUserId || null,
      String(payload.actorEmail || ""),
      String(payload.requestIp || ""),
      String(payload.userAgent || ""),
      changedFields.length ? changedFields : null,
      toJson(payload.before),
      toJson(payload.after),
      toJson(payload.reversePayload),
      toJson(payload.meta),
      retentionDays,
      reversible
    ]
  );

  return mapAuditRow(result.rows[0] || null, true);
}

async function listAdminAuditLogs({ limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<(AuditLog | null)[]> {
  await ensureAdminAuditSchema();
  await pruneExpiredAdminAuditLogs();

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const result = await query(
    `
    SELECT *
    FROM admin_audit_logs
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    [safeLimit, safeOffset]
  );

  return result.rows.map((row: AuditRow) => mapAuditRow(row, false, false));
}

function buildAuditSearchWhere({
  query: q,
  actor,
  entityType,
  action,
  from,
  to
}: {
  query?: string;
  actor?: string;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
} = {}): { whereSql: string; values: unknown[] } {
  const where = [];
  const values = [];

  const textQuery = String(q || "").trim().toLowerCase();
  if (textQuery) {
    values.push(`%${textQuery}%`);
    const idx = values.length;
    where.push(
      `(lower(summary) LIKE $${idx} OR lower(entity_type) LIKE $${idx} OR lower(COALESCE(entity_id, '')) LIKE $${idx} OR lower(COALESCE(actor_email, '')) LIKE $${idx})`
    );
  }

  const actorEmail = String(actor || "").trim();
  if (actorEmail) {
    values.push(actorEmail);
    where.push(`lower(actor_email) = lower($${values.length})`);
  }

  const safeEntityType = String(entityType || "").trim();
  if (safeEntityType) {
    values.push(safeEntityType);
    where.push(`entity_type = $${values.length}`);
  }

  const safeAction = String(action || "").trim();
  if (safeAction) {
    values.push(safeAction);
    where.push(`action = $${values.length}`);
  }

  const fromTs = String(from || "").trim();
  if (fromTs) {
    values.push(fromTs);
    where.push(`created_at >= $${values.length}::timestamptz`);
  }

  const toTs = String(to || "").trim();
  if (toTs) {
    values.push(toTs);
    where.push(`created_at <= $${values.length}::timestamptz`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    values
  };
}

async function searchAdminAuditLogs({
  query: q = "",
  actor = "",
  entityType = "",
  action = "",
  from = "",
  to = "",
  page = 1,
  pageSize = 50
}: {
  query?: string;
  actor?: string;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ rows: (AuditLog | null)[]; total: number; page: number; pageSize: number }> {
  await ensureAdminAuditSchema();
  await pruneExpiredAdminAuditLogs();

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  const built = buildAuditSearchWhere({ query: q, actor, entityType, action, from, to });
  const values = [...built.values, safePageSize, offset];
  const limitIdx = values.length - 1;
  const offsetIdx = values.length;

  const listResult = await query(
    `
    SELECT *
    FROM admin_audit_logs
    ${built.whereSql}
    ORDER BY created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM admin_audit_logs
    ${built.whereSql}
    `,
    built.values
  );

  return {
    rows: listResult.rows.map((row: AuditRow) => mapAuditRow(row, false, false)),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize
  };
}

async function findAdminAuditLogById(id: string, { includeInternal = false }: { includeInternal?: boolean } = {}): Promise<AuditLog | null> {
  await ensureAdminAuditSchema();
  if (!id) return null;
  const result = await query(
    `
    SELECT *
    FROM admin_audit_logs
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );

  return mapAuditRow(result.rows[0] || null, includeInternal);
}

async function markAdminAuditLogReversed(
  id: string,
  payload: { reversedByUserId?: string | null; reversedByEmail?: string; reverseResult?: unknown } = {}
): Promise<AuditLog | null> {
  await ensureAdminAuditSchema();
  if (!id) return null;

  const result = await query(
    `
    UPDATE admin_audit_logs
    SET
      reversed_at = NOW(),
      reversed_by_user_id = $2,
      reversed_by_email = NULLIF($3, ''),
      reverse_result = $4::jsonb
    WHERE id = $1
      AND reversed_at IS NULL
    RETURNING *
    `,
    [
      id,
      payload.reversedByUserId || null,
      String(payload.reversedByEmail || ""),
      toJson(payload.reverseResult)
    ]
  );

  return mapAuditRow(result.rows[0] || null, true);
}

function isAuditLogReversible(log: AuditLog | null | undefined): boolean {
  if (!log) return false;
  if (log.reversedAt) return false;
  if (!log.reversePayload) return false;

  const reversibleUntilTs = log.reversibleUntil ? new Date(log.reversibleUntil).getTime() : 0;
  return Number.isFinite(reversibleUntilTs) && reversibleUntilTs > Date.now();
}

module.exports = {
  getAdminAuditRetentionDays,
  insertAdminAuditLog,
  listAdminAuditLogs,
  searchAdminAuditLogs,
  findAdminAuditLogById,
  markAdminAuditLogReversed,
  isAuditLogReversible
};

