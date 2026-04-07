const crypto = require("node:crypto");
const { query, withTransaction } = require("./db");

// Alphabet: uppercase alphanumeric excluding 0/O and 1/I to avoid confusion
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateGiftCardCode(): string {
  const bytes = crypto.randomBytes(12);
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3 || i === 7) result += "-";
  }
  return "GC-" + result; // e.g. GC-ABCD-EFGH-JKLM
}

function normalizeCode(code: string): string {
  return String(code || "").trim().toUpperCase();
}

// Row mapper from snake_case DB to camelCase
function mapRow(row: any) {
  return {
    id: row.id,
    code: row.code,
    initialBalanceCents: row.initial_balance_cents,
    balanceCents: row.balance_cents,
    currency: row.currency,
    active: row.active,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    note: row.note || "",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapTxnRow(row: any) {
  return {
    id: row.id,
    giftCardId: row.gift_card_id,
    orderId: row.order_id || null,
    userId: row.user_id || null,
    deltaCents: row.delta_cents,
    balanceAfterCents: row.balance_after_cents,
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function createGiftCard(input: {
  code?: string;
  initialBalanceCents: number;
  expiresAt?: string | null;
  note?: string;
  active?: boolean;
}) {
  const code = normalizeCode(input.code || generateGiftCardCode());
  const active = input.active !== false;
  const note = input.note || "";
  const expiresAt = input.expiresAt || null;

  const result = await query(
    `INSERT INTO gift_cards (code, initial_balance_cents, balance_cents, active, expires_at, note)
     VALUES ($1, $2, $2, $3, $4, $5)
     RETURNING *`,
    [code, input.initialBalanceCents, active, expiresAt, note]
  );
  if (!result.rows[0]) throw new Error("GIFT_CARD_CREATE_FAILED");
  return mapRow(result.rows[0]);
}

async function findGiftCardByCode(code: string) {
  const normalized = normalizeCode(code);
  const result = await query(
    `SELECT * FROM gift_cards WHERE upper(code) = upper($1) LIMIT 1`,
    [normalized]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function findGiftCardById(id: string) {
  const result = await query(
    `SELECT * FROM gift_cards WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function listGiftCards(params: {
  query?: string;
  status?: "all" | "active" | "inactive";
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(params.pageSize || 50)));
  const offset = (page - 1) * pageSize;
  const search = String(params.query || "").trim();
  const status = params.status || "all";

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(upper(code) LIKE upper($${idx}) OR note ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }
  if (status === "active") {
    conditions.push(`active = true AND (expires_at IS NULL OR expires_at > now())`);
  } else if (status === "inactive") {
    conditions.push(`(active = false OR (expires_at IS NOT NULL AND expires_at <= now()))`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await query(`SELECT COUNT(*) FROM gift_cards ${where}`, values);
  const total = Number(countResult.rows[0]?.count || 0);

  values.push(pageSize, offset);
  const rows = await query(
    `SELECT * FROM gift_cards ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    values
  );

  return { rows: rows.rows.map(mapRow), total, page, pageSize };
}

async function updateGiftCard(id: string, patch: {
  active?: boolean;
  expiresAt?: string | null;
  note?: string;
}) {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.active !== undefined) { sets.push(`active = $${idx++}`); values.push(patch.active); }
  if ("expiresAt" in patch) { sets.push(`expires_at = $${idx++}`); values.push(patch.expiresAt || null); }
  if (patch.note !== undefined) { sets.push(`note = $${idx++}`); values.push(patch.note); }

  if (!sets.length) return findGiftCardById(id);

  sets.push(`updated_at = now()`);
  values.push(id);

  const result = await query(
    `UPDATE gift_cards SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function validateGiftCard(code: string, requiredCents: number) {
  const card = await findGiftCardByCode(code);
  if (!card) return { ok: false as const, error: "GC_NOT_FOUND" };
  if (!card.active) return { ok: false as const, error: "GC_INACTIVE", balanceCents: card.balanceCents };
  if (card.expiresAt && new Date(card.expiresAt) <= new Date()) {
    return { ok: false as const, error: "GC_EXPIRED", balanceCents: card.balanceCents };
  }
  if (card.balanceCents < requiredCents) {
    return { ok: false as const, error: "INSUFFICIENT_BALANCE", balanceCents: card.balanceCents };
  }
  return { ok: true as const, giftCard: card };
}

async function debitGiftCard(params: {
  code: string;
  amountCents: number;
  orderId?: string | null;
  userId?: string | null;
  reason?: string;
}) {
  return withTransaction(async (client: any) => {
    const normalized = normalizeCode(params.code);
    const result = await client.query(
      `UPDATE gift_cards
       SET balance_cents = balance_cents - $1, updated_at = now()
       WHERE upper(code) = upper($2)
         AND balance_cents >= $1
         AND active = true
       RETURNING *`,
      [params.amountCents, normalized]
    );
    if (!result.rows[0]) return { ok: false as const, error: "INSUFFICIENT_BALANCE" };

    const card = mapRow(result.rows[0]);
    await client.query(
      `INSERT INTO gift_card_transactions (gift_card_id, order_id, user_id, delta_cents, balance_after_cents, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        card.id,
        params.orderId || null,
        params.userId || null,
        -params.amountCents,
        card.balanceCents,
        params.reason || "purchase",
      ]
    );
    return { ok: true as const, card };
  });
}

async function refundGiftCard(params: {
  giftCardId: string;
  amountCents: number;
  orderId?: string | null;
  userId?: string | null;
}) {
  return withTransaction(async (client: any) => {
    const result = await client.query(
      `UPDATE gift_cards
       SET balance_cents = LEAST(initial_balance_cents, balance_cents + $1), updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [params.amountCents, params.giftCardId]
    );
    if (!result.rows[0]) return { ok: false as const, error: "GC_NOT_FOUND" };

    const card = mapRow(result.rows[0]);
    await client.query(
      `INSERT INTO gift_card_transactions (gift_card_id, order_id, user_id, delta_cents, balance_after_cents, reason)
       VALUES ($1, $2, $3, $4, $5, 'refund')`,
      [card.id, params.orderId || null, params.userId || null, params.amountCents, card.balanceCents]
    );
    return { ok: true as const, card };
  });
}

async function getGiftCardTransactions(giftCardId: string) {
  const result = await query(
    `SELECT * FROM gift_card_transactions WHERE gift_card_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [giftCardId]
  );
  return result.rows.map(mapTxnRow);
}

async function linkGiftCardToUser(userId: string, code: string) {
  const card = await findGiftCardByCode(code);
  if (!card) return { ok: false as const, error: "GC_NOT_FOUND" };
  if (!card.active) return { ok: false as const, error: "GC_INACTIVE" };
  if (card.expiresAt && new Date(card.expiresAt) <= new Date()) {
    return { ok: false as const, error: "GC_EXPIRED" };
  }

  try {
    await query(
      `INSERT INTO user_gift_cards (user_id, gift_card_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, card.id]
    );
    // Check if actually linked to THIS user (might be already linked to another)
    const check = await query(
      `SELECT user_id FROM user_gift_cards WHERE gift_card_id = $1`,
      [card.id]
    );
    if (check.rows[0] && String(check.rows[0].user_id) !== String(userId)) {
      return { ok: false as const, error: "GC_ALREADY_LINKED" };
    }
    return { ok: true as const, giftCard: card };
  } catch {
    return { ok: false as const, error: "GC_LINK_FAILED" };
  }
}

async function listUserGiftCards(userId: string) {
  const result = await query(
    `SELECT gc.* FROM gift_cards gc
     INNER JOIN user_gift_cards ugc ON ugc.gift_card_id = gc.id
     WHERE ugc.user_id = $1
     ORDER BY ugc.linked_at DESC`,
    [userId]
  );
  return result.rows.map(mapRow);
}

module.exports = {
  generateGiftCardCode,
  normalizeGiftCardCode: normalizeCode,
  createGiftCard,
  findGiftCardByCode,
  findGiftCardById,
  listGiftCards,
  updateGiftCard,
  validateGiftCard,
  debitGiftCard,
  refundGiftCard,
  getGiftCardTransactions,
  linkGiftCardToUser,
  listUserGiftCards,
};
