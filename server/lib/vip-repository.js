const { queryVip } = require("./vip-db");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "").slice(0, 11);
}

function normalizeCep(cep) {
  return String(cep || "").replace(/\D/g, "").slice(0, 8);
}

function mapVipRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    name: String(row.name || ""),
    email: normalizeEmail(row.email),
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

async function upsertVipSubscriber(payload) {
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

async function setVipAccountCreated(email) {
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

async function listVipSubscribers({ limit = 100, offset = 0 } = {}) {
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

module.exports = {
  upsertVipSubscriber,
  setVipAccountCreated,
  listVipSubscribers
};

