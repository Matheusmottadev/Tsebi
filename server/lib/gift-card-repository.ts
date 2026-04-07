const nodeCrypto = require("node:crypto");
const { query, withTransaction } = require("./db");

type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }>;
};

// Alphabet: uppercase alphanumeric excluding 0/O and 1/I to avoid confusion
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateGiftCardCode(): string {
  const bytes = nodeCrypto.randomBytes(12);
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
    maxUses: row.max_uses ?? 1,
    useCount: row.use_count ?? 0,
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
    userEmail: row.user_email || null,
    userName: row.user_name || null,
    deltaCents: row.delta_cents,
    balanceAfterCents: row.balance_after_cents,
    reason: row.reason,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapWalletTxnRow(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    deltaCents: row.delta_cents,
    balanceAfterCents: row.balance_after_cents,
    reason: row.reason,
    refId: row.ref_id || null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function createGiftCard(input: {
  code?: string;
  initialBalanceCents: number;
  expiresAt?: string | null;
  note?: string;
  active?: boolean;
  maxUses?: number;
}) {
  const code = normalizeCode(input.code || generateGiftCardCode());
  const active = input.active !== false;
  const note = input.note || "";
  const expiresAt = input.expiresAt || null;
  const maxUses = input.maxUses ?? 1;

  const result = await query(
    `INSERT INTO gift_cards (code, initial_balance_cents, balance_cents, active, expires_at, note, max_uses)
     VALUES ($1, $2, $2, $3, $4, $5, $6)
     RETURNING *`,
    [code, input.initialBalanceCents, active, expiresAt, note, maxUses]
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
  maxUses?: number;
}) {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.active !== undefined) { sets.push(`active = $${idx++}`); values.push(patch.active); }
  if ("expiresAt" in patch) { sets.push(`expires_at = $${idx++}`); values.push(patch.expiresAt || null); }
  if (patch.note !== undefined) { sets.push(`note = $${idx++}`); values.push(patch.note); }
  if (patch.maxUses !== undefined) { sets.push(`max_uses = $${idx++}`); values.push(patch.maxUses); }

  if (!sets.length) return findGiftCardById(id);

  sets.push(`updated_at = now()`);
  values.push(id);

  const result = await query(
    `UPDATE gift_cards SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function deleteGiftCardById(id: string) {
  return withTransaction(async (client: any) => {
    const existingResult = await client.query(
      `SELECT id, code, use_count FROM gift_cards WHERE id = $1 LIMIT 1`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) return { ok: false as const, error: "NOT_FOUND" };

    const transactionsResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM gift_card_transactions WHERE gift_card_id = $1`,
      [id]
    );
    const linkedResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM user_gift_cards WHERE gift_card_id = $1`,
      [id]
    );

    const transactionCount = Number(transactionsResult.rows[0]?.count || 0);
    const linkedCount = Number(linkedResult.rows[0]?.count || 0);
    const useCount = Number(existing.use_count || 0);

    if (transactionCount > 0 || linkedCount > 0 || useCount > 0) {
      return { ok: false as const, error: "GC_DELETE_FORBIDDEN_HAS_HISTORY" };
    }

    const deleted = await client.query(
      `DELETE FROM gift_cards WHERE id = $1 RETURNING id, code`,
      [id]
    );
    if (!deleted.rows[0]) return { ok: false as const, error: "NOT_FOUND" };
    return { ok: true as const, removed: { id: deleted.rows[0].id, code: deleted.rows[0].code } };
  });
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

async function debitGiftCardWithClient(client: DbClient, params: {
  code: string;
  amountCents: number;
  orderId?: string | null;
  userId?: string | null;
  reason?: string;
}) {
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
}

async function debitGiftCard(params: {
  code: string;
  amountCents: number;
  orderId?: string | null;
  userId?: string | null;
  reason?: string;
}) {
  return withTransaction(async (client: any) => debitGiftCardWithClient(client, params));
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
    `SELECT
       tx.*,
       u.email AS user_email,
       u.name AS user_name
     FROM gift_card_transactions tx
     LEFT JOIN users u ON u.id = tx.user_id
     WHERE tx.gift_card_id = $1
     ORDER BY tx.created_at DESC
     LIMIT 100`,
    [giftCardId]
  );
  return result.rows.map(mapTxnRow);
}

// ─── Wallet functions ────────────────────────────────────────────────────────

async function getWalletBalance(userId: string): Promise<number> {
  const result = await query(
    `SELECT wallet_cents FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return Number(result.rows[0]?.wallet_cents ?? 0);
}

async function debitWalletWithClient(client: DbClient, params: {
  userId: string;
  amountCents: number;
  orderId?: string | null;
  reason?: string;
}) {
  const result = await client.query(
    `UPDATE users
     SET wallet_cents = wallet_cents - $1
     WHERE id = $2 AND wallet_cents >= $1
     RETURNING wallet_cents`,
    [params.amountCents, params.userId]
  );
  if (!result.rows[0]) return { ok: false as const, error: "INSUFFICIENT_WALLET_BALANCE" };
  const balanceAfter = Number(result.rows[0].wallet_cents);
  await client.query(
    `INSERT INTO wallet_transactions (user_id, delta_cents, balance_after_cents, reason, ref_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.userId, -params.amountCents, balanceAfter, params.reason || "purchase", params.orderId || null]
  );
  return { ok: true as const, balanceAfterCents: balanceAfter };
}

async function debitWallet(params: {
  userId: string;
  amountCents: number;
  orderId?: string | null;
  reason?: string;
}) {
  return withTransaction(async (client: any) => debitWalletWithClient(client, params));
}

// Redeem a gift card: transfer its balance to the user's wallet
async function redeemGiftCardToWallet(userId: string, code: string) {
  const card = await findGiftCardByCode(code);
  if (!card) return { ok: false as const, error: "GC_NOT_FOUND" };
  if (!card.active) return { ok: false as const, error: "GC_INACTIVE" };
  if (card.expiresAt && new Date(card.expiresAt) <= new Date()) {
    return { ok: false as const, error: "GC_EXPIRED" };
  }
  if (card.balanceCents <= 0) return { ok: false as const, error: "GC_EMPTY" };

  return withTransaction(async (client: any) => {
    // Check if this user already redeemed this code
    const alreadyUsed = await client.query(
      `SELECT id FROM gift_card_transactions WHERE gift_card_id = $1 AND user_id = $2 AND reason = 'redemption' LIMIT 1`,
      [card.id, userId]
    );
    if (alreadyUsed.rows.length > 0) {
      return { ok: false as const, error: "GC_ALREADY_REDEEMED" };
    }

    // Check usage limit
    const gcRow = await client.query(
      `SELECT balance_cents, max_uses, use_count FROM gift_cards WHERE id = $1 FOR UPDATE`,
      [card.id]
    );
    const gc = gcRow.rows[0];
    if (!gc) return { ok: false as const, error: "GC_NOT_FOUND" };
    if (gc.use_count >= gc.max_uses) return { ok: false as const, error: "GC_MAX_USES_REACHED" };
    if (gc.balance_cents <= 0) return { ok: false as const, error: "GC_EMPTY" };

    const amount = gc.balance_cents;

    // Debit gift card
    await client.query(
      `UPDATE gift_cards SET balance_cents = 0, use_count = use_count + 1,
        active = CASE WHEN use_count + 1 >= max_uses THEN false ELSE active END,
        updated_at = now()
       WHERE id = $1`,
      [card.id]
    );
    await client.query(
      `INSERT INTO gift_card_transactions (gift_card_id, user_id, delta_cents, balance_after_cents, reason)
       VALUES ($1, $2, $3, 0, 'redemption')`,
      [card.id, userId, -amount]
    );

    // Credit user wallet
    const walletResult = await client.query(
      `UPDATE users SET wallet_cents = wallet_cents + $1 WHERE id = $2 RETURNING wallet_cents`,
      [amount, userId]
    );
    const balanceAfter = Number(walletResult.rows[0].wallet_cents);
    await client.query(
      `INSERT INTO wallet_transactions (user_id, delta_cents, balance_after_cents, reason, ref_id)
       VALUES ($1, $2, $3, 'gift_card_redemption', $4)`,
      [userId, amount, balanceAfter, card.id]
    );

    return {
      ok: true as const,
      giftCardId: card.id,
      giftCardCode: card.code,
      addedCents: amount,
      walletBalanceCents: balanceAfter
    };
  });
}

async function getWalletTransactions(userId: string) {
  const result = await query(
    `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows.map(mapWalletTxnRow);
}

module.exports = {
  generateGiftCardCode,
  normalizeGiftCardCode: normalizeCode,
  createGiftCard,
  findGiftCardByCode,
  findGiftCardById,
  listGiftCards,
  updateGiftCard,
  deleteGiftCardById,
  validateGiftCard,
  debitGiftCardWithClient,
  debitGiftCard,
  refundGiftCard,
  getGiftCardTransactions,
  // wallet
  getWalletBalance,
  debitWalletWithClient,
  debitWallet,
  redeemGiftCardToWallet,
  getWalletTransactions,
};
