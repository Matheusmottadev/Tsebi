const { query } = require("./db");

const DEFAULT_RETENTION_DAYS = 30;

function getAdminAuditRetentionDays() {
  const raw = Number(process.env.ADMIN_AUDIT_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw)) return DEFAULT_RETENTION_DAYS;
  return Math.max(1, Math.min(180, Math.floor(raw)));
}

function toJson(value) {
  if (value === undefined) return null;
  return value == null ? null : JSON.stringify(value);
}

function mapAuditRow(row, includeInternal = false) {
  if (!row) return null;

  const now = Date.now();
  const reversibleUntilTs = row.reversible_until ? new Date(row.reversible_until).getTime() : 0;
  const reversible = !row.reversed_at && Number.isFinite(reversibleUntilTs) && reversibleUntilTs > now;

  const mapped = {
    id: row.id,
    action: String(row.action || ""),
    entityType: String(row.entity_type || ""),
    entityId: row.entity_id || null,
    summary: String(row.summary || ""),
    actorUserId: row.actor_user_id || null,
    actorEmail: String(row.actor_email || ""),
    requestIp: String(row.request_ip || ""),
    userAgent: String(row.user_agent || ""),
    before: row.change_before || null,
    after: row.change_after || null,
    meta: row.meta || {},
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

async function pruneExpiredAdminAuditLogs() {
  const retentionDays = getAdminAuditRetentionDays();
  await query(
    `
    DELETE FROM admin_audit_logs
    WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [retentionDays]
  );
}

async function insertAdminAuditLog(payload = {}) {
  await pruneExpiredAdminAuditLogs();

  const retentionDays = getAdminAuditRetentionDays();
  const result = await query(
    `
    INSERT INTO admin_audit_logs (
      action,
      entity_type,
      entity_id,
      summary,
      actor_user_id,
      actor_email,
      request_ip,
      user_agent,
      change_before,
      change_after,
      reverse_payload,
      meta,
      reversible_until
    )
    VALUES (
      $1,
      $2,
      NULLIF($3, ''),
      $4,
      $5,
      NULLIF($6, ''),
      NULLIF($7, ''),
      NULLIF($8, ''),
      $9::jsonb,
      $10::jsonb,
      $11::jsonb,
      COALESCE($12::jsonb, '{}'::jsonb),
      NOW() + ($13::int * INTERVAL '1 day')
    )
    RETURNING *
    `,
    [
      String(payload.action || "update"),
      String(payload.entityType || "unknown"),
      String(payload.entityId || ""),
      String(payload.summary || "Mudanca administrativa"),
      payload.actorUserId || null,
      String(payload.actorEmail || ""),
      String(payload.requestIp || ""),
      String(payload.userAgent || ""),
      toJson(payload.before),
      toJson(payload.after),
      toJson(payload.reversePayload),
      toJson(payload.meta),
      retentionDays
    ]
  );

  return mapAuditRow(result.rows[0] || null, true);
}

async function listAdminAuditLogs({ limit = 100, offset = 0 } = {}) {
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

  return result.rows.map((row) => mapAuditRow(row));
}

async function findAdminAuditLogById(id, { includeInternal = false } = {}) {
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

async function markAdminAuditLogReversed(id, payload = {}) {
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

function isAuditLogReversible(log) {
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
  findAdminAuditLogById,
  markAdminAuditLogReversed,
  isAuditLogReversible
};
