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

function mapAuditRow(row, includeInternal = false, includeChanges = true) {
  if (!row) return null;

  const now = Date.now();
  const reversibleUntilTs = row.reversible_until ? new Date(row.reversible_until).getTime() : 0;
  const reversibleByTime = !row.reversed_at && Number.isFinite(reversibleUntilTs) && reversibleUntilTs > now;
  const reversibleFlag = row.reversible == null ? true : Boolean(row.reversible);
  const reversible = reversibleByTime && reversibleFlag;

  const mapped = {
    id: row.id,
    action: String(row.action || ""),
    entityType: String(row.entity_type || ""),
    entityId: row.entity_id || null,
    summary: String(row.summary || ""),
    actorAdminId: row.actor_admin_id || null,
    actorUserId: row.actor_user_id || null,
    actorEmail: String(row.actor_email || ""),
    requestIp: String(row.request_ip || ""),
    userAgent: String(row.user_agent || ""),
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields : [],
    before: includeChanges ? row.change_before || null : null,
    after: includeChanges ? row.change_after || null : null,
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

  return result.rows.map((row) => mapAuditRow(row, false, false));
}

function buildAuditSearchWhere({ query: q, actor, entityType, action, from, to } = {}) {
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
} = {}) {
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
    rows: listResult.rows.map((row) => mapAuditRow(row, false, false)),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize
  };
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
  searchAdminAuditLogs,
  findAdminAuditLogById,
  markAdminAuditLogReversed,
  isAuditLogReversible
};
