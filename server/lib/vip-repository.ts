export {};
const { queryVip } = require("./vip-db");

type VipRow = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  birth_date?: string | Date | null;
  cpf?: unknown;
  cep?: unknown;
  source?: unknown;
  account_created?: unknown;
  account_created_at?: string | null;
  ip_address?: unknown;
  user_agent?: unknown;
  subscribed_at?: string | null;
  updated_at?: string | null;
};

type VipSubscriber = {
  id: number;
  name: string;
  email: string;
  birthDate: string;
  cpf: string;
  cep: string;
  source: string;
  accountCreated: boolean;
  accountCreatedAt: string | null;
  ipAddress: string;
  userAgent: string;
  subscribedAt: string | null;
  updatedAt: string | null;
};

type UpsertVipPayload = {
  name: string;
  email: string;
  birthDate?: string;
  cpf?: string;
  cep?: string;
  source?: string;
  accountCreated?: boolean;
  ipAddress?: string;
  userAgent?: string;
};

type SearchVipParams = {
  query?: string;
  page?: number;
  pageSize?: number;
};

type ListVipParams = {
  limit?: number;
  offset?: number;
};

type VipPatch = {
  name?: string;
  email?: string;
  birthDate?: string | null;
  cpf?: string;
  cep?: string;
  accountCreated?: boolean;
};

type VipSnapshot = {
  name?: string;
  email?: string;
  birthDate?: string;
  cpf?: string;
  cep?: string;
  source?: string;
  accountCreated?: boolean;
  accountCreatedAt?: string | null;
  ipAddress?: string;
  userAgent?: string;
  subscribedAt?: string | null;
  updatedAt?: string | null;
};

function normalizeEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

function normalizeCpf(cpf: string | null | undefined): string {
  return String(cpf || "").replace(/\D/g, "").slice(0, 11);
}

function normalizeCep(cep: string | null | undefined): string {
  return String(cep || "").replace(/\D/g, "").slice(0, 8);
}

function mapVipRow(row: VipRow | null): VipSubscriber | null {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    name: String(row.name || ""),
    email: normalizeEmail(String(row.email || "")),
    birthDate: row.birth_date ? new Date(row.birth_date).toISOString().slice(0, 10) : "",
    cpf: String(row.cpf || ""),
    cep: String(row.cep || ""),
    source: String(row.source || "launch_page"),
    accountCreated: Boolean(row.account_created),
    accountCreatedAt: row.account_created_at || null,
    ipAddress: String(row.ip_address || ""),
    userAgent: String(row.user_agent || ""),
    subscribedAt: row.subscribed_at || null,
    updatedAt: row.updated_at || null
  };
}

async function upsertVipSubscriber(payload: UpsertVipPayload): Promise<VipSubscriber | null> {
  const result = await queryVip(
    `
    INSERT INTO vip_subscribers (
      name, email, birth_date, cpf, cep, source, account_created, account_created_at, ip_address, user_agent, subscribed_at, updated_at
    ) VALUES (
      $1, $2, NULLIF($3, '')::date, $4, $5, $6, $7, CASE WHEN $7 THEN NOW() ELSE NULL END, $8, $9, NOW(), NOW()
    )
    ON CONFLICT (email) DO UPDATE
    SET
      name = EXCLUDED.name,
      birth_date = EXCLUDED.birth_date,
      cpf = EXCLUDED.cpf,
      cep = EXCLUDED.cep,
      source = EXCLUDED.source,
      account_created = (vip_subscribers.account_created OR EXCLUDED.account_created),
      account_created_at = CASE
        WHEN vip_subscribers.account_created_at IS NOT NULL THEN vip_subscribers.account_created_at
        WHEN EXCLUDED.account_created THEN NOW()
        ELSE NULL
      END,
      ip_address = EXCLUDED.ip_address,
      user_agent = EXCLUDED.user_agent,
      updated_at = NOW()
    RETURNING *
    `,
    [
      String(payload.name || "").trim(),
      normalizeEmail(payload.email),
      String(payload.birthDate || "").trim(),
      normalizeCpf(payload.cpf),
      normalizeCep(payload.cep),
      String(payload.source || "launch_page").trim() || "launch_page",
      Boolean(payload.accountCreated),
      String(payload.ipAddress || "").trim() || null,
      String(payload.userAgent || "").trim() || null
    ]
  );

  return mapVipRow(result.rows[0] || null);
}

async function setVipAccountCreated(email: string): Promise<VipSubscriber | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const result = await queryVip(
    `
    UPDATE vip_subscribers
    SET
      account_created = true,
      account_created_at = COALESCE(account_created_at, NOW()),
      updated_at = NOW()
    WHERE email = $1
    RETURNING *
    `,
    [normalized]
  );

  return mapVipRow(result.rows[0] || null);
}

async function listVipSubscribers({ limit = 100, offset = 0 }: ListVipParams = {}): Promise<VipSubscriber[]> {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const result = await queryVip(
    `
    SELECT *
    FROM vip_subscribers
    ORDER BY subscribed_at DESC, id DESC
    LIMIT $1 OFFSET $2
    `,
    [safeLimit, safeOffset]
  );

  return result.rows.map(mapVipRow).filter(Boolean);
}

async function searchVipSubscribers({
  query = "",
  page = 1,
  pageSize = 50
}: SearchVipParams = {}): Promise<{
  rows: VipSubscriber[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  const normalizedQuery = String(query || "").trim().toLowerCase();
  const values = [];
  const where = [];

  if (normalizedQuery) {
    values.push(`%${normalizedQuery}%`);
    const idx = values.length;
    where.push(`(lower(name) LIKE $${idx} OR lower(email) LIKE $${idx})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  values.push(safePageSize, offset);
  const limitIdx = values.length - 1;
  const offsetIdx = values.length;

  const listResult = await queryVip(
    `
    SELECT *
    FROM vip_subscribers
    ${whereSql}
    ORDER BY subscribed_at DESC, id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const countResult = await queryVip(
    `
    SELECT COUNT(*)::int AS total
    FROM vip_subscribers
    ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );

  return {
    rows: listResult.rows.map(mapVipRow).filter(Boolean),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize
  };
}

async function findVipSubscriberById(id: number): Promise<VipSubscriber | null> {
  const normalizedId = Number(id);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;

  const result = await queryVip(
    `
    SELECT *
    FROM vip_subscribers
    WHERE id = $1
    LIMIT 1
    `,
    [normalizedId]
  );

  return mapVipRow(result.rows[0] || null);
}

async function findVipSubscriberByEmail(email: string): Promise<VipSubscriber | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const result = await queryVip(
    `
    SELECT *
    FROM vip_subscribers
    WHERE lower(email) = lower($1)
    LIMIT 1
    `,
    [normalized]
  );

  return mapVipRow(result.rows[0] || null);
}

async function deleteVipSubscriberById(id: number): Promise<VipSubscriber | null> {
  const normalizedId = Number(id);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;

  const result = await queryVip(
    `
    DELETE FROM vip_subscribers
    WHERE id = $1
    RETURNING *
    `,
    [normalizedId]
  );

  return mapVipRow(result.rows[0] || null);
}

async function updateVipSubscriberById(id: number, patch: VipPatch = {}): Promise<VipSubscriber | null> {
  const normalizedId = Number(id);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;

  const result = await queryVip(
    `
    UPDATE vip_subscribers
    SET
      name = COALESCE(NULLIF($2, ''), name),
      email = COALESCE(NULLIF($3, ''), email),
      birth_date = CASE
        WHEN $4 = '__KEEP__' THEN birth_date
        WHEN $4 = '' THEN NULL
        ELSE NULLIF($4, '')::date
      END,
      cpf = COALESCE(NULLIF($5, ''), cpf),
      cep = COALESCE(NULLIF($6, ''), cep),
      account_created = COALESCE($7, account_created),
      account_created_at = CASE
        WHEN COALESCE($7, account_created) THEN COALESCE(account_created_at, NOW())
        ELSE NULL
      END,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      normalizedId,
      String(patch.name ?? "").trim(),
      normalizeEmail(patch.email ?? ""),
      patch.birthDate == null ? "__KEEP__" : String(patch.birthDate || "").trim(),
      normalizeCpf(patch.cpf ?? ""),
      normalizeCep(patch.cep ?? ""),
      typeof patch.accountCreated === "boolean" ? patch.accountCreated : null
    ]
  );

  return mapVipRow(result.rows[0] || null);
}

async function restoreVipSubscriberFromSnapshot(snapshot: VipSnapshot = {}): Promise<{
  ok?: true;
  error?: string;
  subscriber?: VipSubscriber | null;
}> {
  const email = normalizeEmail(snapshot.email);
  const name = String(snapshot.name || "").trim();
  if (!email || !name) return { error: "INVALID_SNAPSHOT" };

  const result = await queryVip(
    `
    INSERT INTO vip_subscribers (
      name,
      email,
      birth_date,
      cpf,
      cep,
      source,
      account_created,
      account_created_at,
      ip_address,
      user_agent,
      subscribed_at,
      updated_at
    )
    VALUES (
      $1,
      $2,
      NULLIF($3, '')::date,
      $4,
      $5,
      $6,
      $7,
      $8::timestamptz,
      $9,
      $10,
      COALESCE($11::timestamptz, NOW()),
      COALESCE($12::timestamptz, NOW())
    )
    ON CONFLICT (email) DO UPDATE
    SET
      name = EXCLUDED.name,
      birth_date = EXCLUDED.birth_date,
      cpf = EXCLUDED.cpf,
      cep = EXCLUDED.cep,
      source = EXCLUDED.source,
      account_created = EXCLUDED.account_created,
      account_created_at = EXCLUDED.account_created_at,
      ip_address = EXCLUDED.ip_address,
      user_agent = EXCLUDED.user_agent,
      subscribed_at = EXCLUDED.subscribed_at,
      updated_at = COALESCE(EXCLUDED.updated_at, NOW())
    RETURNING *
    `,
    [
      name,
      email,
      String(snapshot.birthDate || "").trim(),
      normalizeCpf(snapshot.cpf),
      normalizeCep(snapshot.cep),
      String(snapshot.source || "admin_panel").trim() || "admin_panel",
      Boolean(snapshot.accountCreated),
      snapshot.accountCreated ? snapshot.accountCreatedAt || snapshot.updatedAt || null : null,
      String(snapshot.ipAddress || "").trim() || null,
      String(snapshot.userAgent || "").trim() || null,
      snapshot.subscribedAt || null,
      snapshot.updatedAt || null
    ]
  );

  return { ok: true, subscriber: mapVipRow(result.rows[0] || null) };
}

module.exports = {
  upsertVipSubscriber,
  setVipAccountCreated,
  listVipSubscribers,
  searchVipSubscribers,
  findVipSubscriberById,
  findVipSubscriberByEmail,
  deleteVipSubscriberById,
  updateVipSubscriberById,
  restoreVipSubscriberFromSnapshot
};
