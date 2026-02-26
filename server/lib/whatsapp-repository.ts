export {};
const { query } = require("./db");

type JsonRecord = Record<string, unknown>;
type ContactRow = JsonRecord & {
  id?: number;
  phone_e164?: string;
  last_inbound_at?: string | null;
  last_inbound_text?: string;
  last_inbound_name?: string;
  window_expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
type VipRow = JsonRecord & {
  id?: number;
  phone_e164?: string;
  name?: string;
  source?: string;
  opted_in_at?: string | null;
  updated_at?: string | null;
};
type LogRow = JsonRecord & {
  id?: number;
  type?: string;
  template_name?: string;
  quantity?: number;
  cost_estimate_cents?: number;
  payload?: unknown;
  created_at?: string | null;
};
type WhatsAppContact = {
  id: number;
  phone: string;
  lastInboundAt: string | null;
  lastInboundText: string;
  lastInboundName: string;
  windowExpiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};
type WhatsAppVipContact = {
  id: number;
  phone: string;
  name: string;
  source: string;
  optedInAt: string | null;
  updatedAt: string | null;
};
type WhatsAppSendLog = {
  id: number;
  type: string;
  templateName: string;
  quantity: number;
  costEstimateCents: number;
  payload: JsonRecord;
  createdAt: string | null;
};

function normalizePhone(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits;
}

function mapContactRow(row: ContactRow | null | undefined): WhatsAppContact | null {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    phone: String(row.phone_e164 || ""),
    lastInboundAt: row.last_inbound_at || null,
    lastInboundText: String(row.last_inbound_text || ""),
    lastInboundName: String(row.last_inbound_name || ""),
    windowExpiresAt: row.window_expires_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapVipRow(row: VipRow | null | undefined): WhatsAppVipContact | null {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    phone: String(row.phone_e164 || ""),
    name: String(row.name || ""),
    source: String(row.source || "manual"),
    optedInAt: row.opted_in_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapLogRow(row: LogRow | null | undefined): WhatsAppSendLog | null {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    type: String(row.type || ""),
    templateName: String(row.template_name || ""),
    quantity: Number(row.quantity || 0),
    costEstimateCents: Number(row.cost_estimate_cents || 0),
    payload: (row.payload && typeof row.payload === "object" ? (row.payload as JsonRecord) : {}),
    createdAt: row.created_at || null
  };
}

async function upsertInboundContact({
  phone,
  name = "",
  text = "",
  timestamp = null
}: {
  phone?: string;
  name?: string;
  text?: string;
  timestamp?: string | null;
} = {}): Promise<WhatsAppContact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const inboundAt = timestamp ? new Date(timestamp) : new Date();
  const windowExpiresAt = new Date(inboundAt.getTime() + 24 * 60 * 60 * 1000);

  const result = await query(
    `
    INSERT INTO whatsapp_contacts (
      phone_e164, last_inbound_at, last_inbound_text, last_inbound_name, window_expires_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, NOW()
    )
    ON CONFLICT (phone_e164) DO UPDATE
    SET
      last_inbound_at = EXCLUDED.last_inbound_at,
      last_inbound_text = EXCLUDED.last_inbound_text,
      last_inbound_name = EXCLUDED.last_inbound_name,
      window_expires_at = EXCLUDED.window_expires_at,
      updated_at = NOW()
    RETURNING *
    `,
    [
      normalized,
      inboundAt.toISOString(),
      String(text || "").slice(0, 1000),
      String(name || "").slice(0, 160),
      windowExpiresAt.toISOString()
    ]
  );

  return mapContactRow(result.rows[0] || null);
}

async function findContactByPhone(phone: string): Promise<WhatsAppContact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const result = await query(
    `
    SELECT *
    FROM whatsapp_contacts
    WHERE phone_e164 = $1
    LIMIT 1
    `,
    [normalized]
  );
  return mapContactRow(result.rows[0] || null);
}

async function searchContacts({ query: q = "", limit = 50 }: { query?: string; limit?: number } = {}): Promise<WhatsAppContact[]> {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const normalized = String(q || "").replace(/\D/g, "");
  const values = [];
  const where = [];

  if (normalized) {
    values.push(`%${normalized}%`);
    where.push(`phone_e164 LIKE $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  values.push(safeLimit);
  const result = await query(
    `
    SELECT *
    FROM whatsapp_contacts
    ${whereSql}
    ORDER BY COALESCE(last_inbound_at, created_at) DESC
    LIMIT $${values.length}
    `,
    values
  );
  return result.rows.map(mapContactRow).filter(Boolean);
}

async function listVipContacts({ limit = 100, offset = 0, query: q = "" }: { limit?: number; offset?: number; query?: string } = {}): Promise<{
  rows: WhatsAppVipContact[];
  total: number;
}> {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const normalized = String(q || "").trim().toLowerCase();
  const values = [];
  const where = [];

  if (normalized) {
    values.push(`%${normalized}%`);
    const idx = values.length;
    where.push(`(lower(name) LIKE $${idx} OR phone_e164 LIKE $${idx})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  values.push(safeLimit, safeOffset);
  const limitIdx = values.length - 1;
  const offsetIdx = values.length;

  const listResult = await query(
    `
    SELECT *
    FROM whatsapp_vip_contacts
    ${whereSql}
    ORDER BY opted_in_at DESC, id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM whatsapp_vip_contacts
    ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );

  return {
    rows: listResult.rows.map(mapVipRow).filter(Boolean),
    total: Number(countResult.rows[0]?.total || 0)
  };
}

async function upsertVipContact({
  phone,
  name = "",
  source = "manual"
}: {
  phone?: string;
  name?: string;
  source?: string;
} = {}): Promise<WhatsAppVipContact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const result = await query(
    `
    INSERT INTO whatsapp_vip_contacts (phone_e164, name, source, opted_in_at, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
    ON CONFLICT (phone_e164) DO UPDATE
    SET
      name = COALESCE(NULLIF(EXCLUDED.name, ''), whatsapp_vip_contacts.name),
      source = COALESCE(NULLIF(EXCLUDED.source, ''), whatsapp_vip_contacts.source),
      updated_at = NOW()
    RETURNING *
    `,
    [normalized, String(name || "").trim(), String(source || "manual").trim() || "manual"]
  );

  return mapVipRow(result.rows[0] || null);
}

async function deleteVipContact(id: number): Promise<WhatsAppVipContact | null> {
  const normalizedId = Number(id);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;
  const result = await query(
    `
    DELETE FROM whatsapp_vip_contacts
    WHERE id = $1
    RETURNING *
    `,
    [normalizedId]
  );
  return mapVipRow(result.rows[0] || null);
}

async function listVipContactsRaw({ limit = 2000 }: { limit?: number } = {}): Promise<WhatsAppVipContact[]> {
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 2000));
  const result = await query(
    `
    SELECT *
    FROM whatsapp_vip_contacts
    ORDER BY opted_in_at DESC, id DESC
    LIMIT $1
    `,
    [safeLimit]
  );
  return result.rows.map(mapVipRow).filter(Boolean);
}

async function insertSendLog({
  type,
  templateName = "",
  quantity = 0,
  costEstimateCents = 0,
  payload = {}
}: {
  type?: string;
  templateName?: string;
  quantity?: number;
  costEstimateCents?: number;
  payload?: JsonRecord;
} = {}): Promise<WhatsAppSendLog | null> {
  const result = await query(
    `
    INSERT INTO whatsapp_send_logs (type, template_name, quantity, cost_estimate_cents, payload)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING *
    `,
    [
      String(type || "").trim() || "unknown",
      String(templateName || "").trim() || null,
      Math.max(0, Number(quantity || 0)),
      Math.max(0, Number(costEstimateCents || 0)),
      JSON.stringify(payload || {})
    ]
  );
  return mapLogRow(result.rows[0] || null);
}

async function listSendLogs({ limit = 100, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<WhatsAppSendLog[]> {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const result = await query(
    `
    SELECT *
    FROM whatsapp_send_logs
    ORDER BY created_at DESC, id DESC
    LIMIT $1 OFFSET $2
    `,
    [safeLimit, safeOffset]
  );
  return result.rows.map(mapLogRow).filter(Boolean);
}

module.exports = {
  normalizePhone,
  upsertInboundContact,
  findContactByPhone,
  searchContacts,
  listVipContacts,
  listVipContactsRaw,
  upsertVipContact,
  deleteVipContact,
  insertSendLog,
  listSendLogs
};

