export {};

type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type DbClient = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
};

const { query, withTransaction } = require("./db") as {
  query: DbClient["query"];
  withTransaction: <T>(work: (client: DbClient) => Promise<T>) => Promise<T>;
};
const { decryptSensitiveString } = require("./data-protection") as {
  decryptSensitiveString: (value: unknown) => string;
};
const { normalizeEmail } = require("../user-repository") as {
  normalizeEmail: (value: string) => string;
};

const BALANCE_REQUEST_TYPES = ["credit", "debit"] as const;
const BALANCE_REQUEST_REASONS = [
  "product_return",
  "billing_error",
  "courtesy",
  "manual_adjustment",
  "other",
] as const;
const BALANCE_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;

type BalanceRequestRow = {
  id?: string;
  requested_by?: string;
  customer_id?: string;
  type?: string;
  amount?: string | number;
  reason?: string;
  reason_detail?: string | null;
  related_order_id?: string | null;
  internal_note?: string | null;
  status?: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  requester_email?: string | null;
  requester_name?: string | null;
  reviewer_email?: string | null;
  reviewer_name?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  customer_wallet_cents?: number | string | null;
};

type BalanceRequestRecord = {
  id: string;
  requestedBy: string;
  requesterEmail: string | null;
  requesterName: string | null;
  customerId: string;
  customerEmail: string | null;
  customerName: string | null;
  customerWalletCents: number;
  type: (typeof BALANCE_REQUEST_TYPES)[number];
  amount: number;
  reason: (typeof BALANCE_REQUEST_REASONS)[number];
  reasonDetail: string | null;
  relatedOrderId: string | null;
  internalNote: string | null;
  status: (typeof BALANCE_REQUEST_STATUSES)[number];
  reviewedBy: string | null;
  reviewerEmail: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
};

type BalanceCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  walletCents: number;
  createdAt: string | null;
};

let balanceSchemaPromise: Promise<void> | null = null;

function normalizeRequestType(value: unknown): BalanceRequestRecord["type"] {
  return String(value || "").trim().toLowerCase() === "debit" ? "debit" : "credit";
}

function normalizeRequestReason(value: unknown): BalanceRequestRecord["reason"] {
  const normalized = String(value || "").trim().toLowerCase();
  return (BALANCE_REQUEST_REASONS as readonly string[]).includes(normalized)
    ? (normalized as BalanceRequestRecord["reason"])
    : "manual_adjustment";
}

function normalizeRequestStatus(value: unknown): BalanceRequestRecord["status"] {
  const normalized = String(value || "").trim().toLowerCase();
  return (BALANCE_REQUEST_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as BalanceRequestRecord["status"])
    : "pending";
}

function toDecimalAmount(value: unknown): number {
  const numeric = typeof value === "string" ? Number(String(value).replace(",", ".")) : Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function toCents(value: unknown): number {
  return Math.round(toDecimalAmount(value) * 100);
}

function mapBalanceRequestRow(row: BalanceRequestRow | null | undefined): BalanceRequestRecord | null {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    requestedBy: String(row.requested_by || ""),
    requesterEmail: row.requester_email || null,
    requesterName: row.requester_name || null,
    customerId: String(row.customer_id || ""),
    customerEmail: row.customer_email || null,
    customerName: row.customer_name || null,
    customerWalletCents: Number(row.customer_wallet_cents || 0),
    type: normalizeRequestType(row.type),
    amount: toDecimalAmount(row.amount),
    reason: normalizeRequestReason(row.reason),
    reasonDetail: row.reason_detail || null,
    relatedOrderId: row.related_order_id || null,
    internalNote: row.internal_note || null,
    status: normalizeRequestStatus(row.status),
    reviewedBy: row.reviewed_by || null,
    reviewerEmail: row.reviewer_email || null,
    reviewerName: row.reviewer_name || null,
    reviewedAt: row.reviewed_at || null,
    rejectionReason: row.rejection_reason || null,
    createdAt: row.created_at || null,
  };
}

function mapBalanceCustomerRow(row: any): BalanceCustomer | null {
  if (!row) return null;
  const rawPhone = String(row.phone || "").trim();
  const decryptedPhone = String(decryptSensitiveString(rawPhone) || "").trim();
  return {
    id: String(row.id || ""),
    name: String(row.name || "").trim(),
    email: normalizeEmail(row.email || ""),
    phone: decryptedPhone || rawPhone,
    walletCents: Number(row.wallet_cents || 0),
    createdAt: row.created_at || null,
  };
}

async function ensureBalanceRequestSchema(): Promise<void> {
  if (!balanceSchemaPromise) {
    balanceSchemaPromise = (async () => {
      await query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS wallet_cents INTEGER NOT NULL DEFAULT 0;
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS wallet_transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          delta_cents INTEGER NOT NULL,
          balance_after_cents INTEGER NOT NULL,
          reason TEXT NOT NULL DEFAULT 'gift_card_redemption',
          ref_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS wallet_txn_user_idx
          ON wallet_transactions (user_id, created_at DESC);
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS balance_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          requested_by UUID NOT NULL REFERENCES admins(id),
          customer_id UUID NOT NULL REFERENCES users(id),
          type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
          amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
          reason VARCHAR(50) NOT NULL CHECK (reason IN (
            'product_return', 'billing_error', 'courtesy', 'manual_adjustment', 'other'
          )),
          reason_detail TEXT,
          related_order_id UUID REFERENCES orders(id),
          internal_note TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'approved', 'rejected')),
          reviewed_by UUID REFERENCES admins(id),
          reviewed_at TIMESTAMPTZ,
          rejection_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS balance_requests_status_idx
          ON balance_requests (status, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS balance_requests_requester_idx
          ON balance_requests (requested_by, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS balance_requests_customer_idx
          ON balance_requests (customer_id, created_at DESC);
      `);
    })().catch((error: unknown) => {
      balanceSchemaPromise = null;
      throw error;
    });
  }

  return balanceSchemaPromise;
}

async function getBalanceCustomerById(customerId: string): Promise<BalanceCustomer | null> {
  await ensureBalanceRequestSchema();
  const normalizedId = String(customerId || "").trim();
  if (!normalizedId) return null;
  const result = await query(
    `
    SELECT id, name, email, COALESCE(phone, '') AS phone, wallet_cents, created_at
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [normalizedId]
  );
  return mapBalanceCustomerRow(result.rows[0] || null);
}

async function searchBalanceCustomers(search = "", limit = 20): Promise<BalanceCustomer[]> {
  await ensureBalanceRequestSchema();
  const normalized = String(search || "").trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  if (!normalized) return [];

  const likeValue = `%${normalized}%`;
  const result = await query(
    `
    SELECT id, name, email, COALESCE(phone, '') AS phone, wallet_cents, created_at
    FROM users
    WHERE
      lower(name) LIKE $1
      OR lower(email) LIKE $1
      OR CAST(id AS text) ILIKE $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [likeValue, safeLimit]
  );
  return result.rows.map(mapBalanceCustomerRow).filter((row): row is BalanceCustomer => Boolean(row));
}

async function createBalanceRequest(payload: {
  requestedBy: string;
  customerId: string;
  type: string;
  amount: number;
  reason: string;
  reasonDetail?: string | null;
  relatedOrderId?: string | null;
  internalNote?: string | null;
}): Promise<BalanceRequestRecord | null> {
  await ensureBalanceRequestSchema();
  const result = await query<BalanceRequestRow>(
    `
    INSERT INTO balance_requests (
      requested_by,
      customer_id,
      type,
      amount,
      reason,
      reason_detail,
      related_order_id,
      internal_note,
      status
    ) VALUES (
      $1,
      $2,
      $3,
      $4::numeric(12,2),
      $5,
      NULLIF($6, ''),
      NULLIF($7, '')::uuid,
      NULLIF($8, ''),
      'pending'
    )
    RETURNING *
    `,
    [
      String(payload.requestedBy || "").trim(),
      String(payload.customerId || "").trim(),
      normalizeRequestType(payload.type),
      toDecimalAmount(payload.amount).toFixed(2),
      normalizeRequestReason(payload.reason),
      String(payload.reasonDetail || "").trim(),
      String(payload.relatedOrderId || "").trim(),
      String(payload.internalNote || "").trim(),
    ]
  );
  return findBalanceRequestById(String(result.rows[0]?.id || ""));
}

async function findBalanceRequestById(requestId: string): Promise<BalanceRequestRecord | null> {
  await ensureBalanceRequestSchema();
  const normalizedId = String(requestId || "").trim();
  if (!normalizedId) return null;
  return findBalanceRequestByIdWithExecutor({ query }, normalizedId);
}

async function findBalanceRequestByIdWithExecutor(
  executor: { query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>> },
  requestId: string
): Promise<BalanceRequestRecord | null> {
  const result = await executor.query<BalanceRequestRow>(
    `
    SELECT
      br.*,
      requester.email AS requester_email,
      COALESCE(requester_user.name, requester.nickname, '') AS requester_name,
      reviewer.email AS reviewer_email,
      COALESCE(reviewer_user.name, reviewer.nickname, '') AS reviewer_name,
      customer.email AS customer_email,
      customer.name AS customer_name,
      customer.wallet_cents AS customer_wallet_cents
    FROM balance_requests br
    JOIN admins requester ON requester.id = br.requested_by
    LEFT JOIN users requester_user ON requester_user.id = requester.user_id
    LEFT JOIN admins reviewer ON reviewer.id = br.reviewed_by
    LEFT JOIN users reviewer_user ON reviewer_user.id = reviewer.user_id
    JOIN users customer ON customer.id = br.customer_id
    WHERE br.id = $1
    LIMIT 1
    `,
    [requestId]
  );
  return mapBalanceRequestRow(result.rows[0] || null);
}

async function listBalanceRequests({
  requestedBy = "",
  status = "",
  dateFrom = "",
  dateTo = "",
  page = 1,
  limit = 50,
}: {
  requestedBy?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ rows: BalanceRequestRecord[]; total: number; page: number; limit: number }> {
  await ensureBalanceRequestSchema();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const offset = (safePage - 1) * safeLimit;
  const where = [];
  const values: unknown[] = [];

  if (String(requestedBy || "").trim()) {
    values.push(String(requestedBy).trim());
    where.push(`br.requested_by = $${values.length}`);
  }
  if (String(status || "").trim()) {
    values.push(normalizeRequestStatus(status));
    where.push(`br.status = $${values.length}`);
  }
  if (String(dateFrom || "").trim()) {
    values.push(String(dateFrom).trim());
    where.push(`br.created_at >= $${values.length}::timestamptz`);
  }
  if (String(dateTo || "").trim()) {
    values.push(String(dateTo).trim());
    where.push(`br.created_at <= $${values.length}::timestamptz`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  values.push(safeLimit, offset);
  const listResult = await query<BalanceRequestRow>(
    `
    SELECT
      br.*,
      requester.email AS requester_email,
      COALESCE(requester_user.name, requester.nickname, '') AS requester_name,
      reviewer.email AS reviewer_email,
      COALESCE(reviewer_user.name, reviewer.nickname, '') AS reviewer_name,
      customer.email AS customer_email,
      customer.name AS customer_name,
      customer.wallet_cents AS customer_wallet_cents
    FROM balance_requests br
    JOIN admins requester ON requester.id = br.requested_by
    LEFT JOIN users requester_user ON requester_user.id = requester.user_id
    LEFT JOIN admins reviewer ON reviewer.id = br.reviewed_by
    LEFT JOIN users reviewer_user ON reviewer_user.id = reviewer.user_id
    JOIN users customer ON customer.id = br.customer_id
    ${whereSql}
    ORDER BY br.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );
  const countResult = await query<{ total?: number }>(
    `
    SELECT COUNT(*)::int AS total
    FROM balance_requests br
    ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );
  return {
    rows: listResult.rows.map(mapBalanceRequestRow).filter((row): row is BalanceRequestRecord => Boolean(row)),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    limit: safeLimit,
  };
}

async function listBalanceRequestsByRequester(adminId: string): Promise<BalanceRequestRecord[]> {
  const result = await listBalanceRequests({ requestedBy: String(adminId || "").trim(), page: 1, limit: 100 });
  return result.rows;
}

async function approveBalanceRequest(requestId: string, reviewerAdminId: string) {
  await ensureBalanceRequestSchema();
  return withTransaction(async (client: DbClient) => {
    const requestResult = await client.query<BalanceRequestRow>(
      `
      SELECT *
      FROM balance_requests
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [String(requestId || "").trim()]
    );
    const currentRequest = requestResult.rows[0] || null;
    if (!currentRequest) return { ok: false as const, error: "NOT_FOUND" };
    if (normalizeRequestStatus(currentRequest.status) !== "pending") {
      return { ok: false as const, error: "REQUEST_ALREADY_REVIEWED" };
    }
    if (String(currentRequest.requested_by || "") === String(reviewerAdminId || "")) {
      return { ok: false as const, error: "SELF_APPROVAL_FORBIDDEN" };
    }

    const amountCents = toCents(currentRequest.amount);
    const customerResult = await client.query<{ wallet_cents?: number }>(
      `
      SELECT wallet_cents
      FROM users
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [String(currentRequest.customer_id || "").trim()]
    );
    const customerWallet = Number(customerResult.rows[0]?.wallet_cents || 0);
    if (!customerResult.rows[0]) return { ok: false as const, error: "CUSTOMER_NOT_FOUND" };
    if (normalizeRequestType(currentRequest.type) === "debit" && customerWallet < amountCents) {
      return { ok: false as const, error: "INSUFFICIENT_CUSTOMER_BALANCE" };
    }

    const delta = normalizeRequestType(currentRequest.type) === "credit" ? amountCents : -amountCents;
    const balanceAfter = customerWallet + delta;

    const walletUpdate = await client.query(
      `
      UPDATE users
      SET wallet_cents = $2
      WHERE id = $1
      RETURNING wallet_cents
      `,
      [String(currentRequest.customer_id || "").trim(), balanceAfter]
    );
    if (!walletUpdate.rows[0]) return { ok: false as const, error: "CUSTOMER_NOT_FOUND" };

    await client.query(
      `
      INSERT INTO wallet_transactions (user_id, delta_cents, balance_after_cents, reason, ref_id)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        String(currentRequest.customer_id || "").trim(),
        delta,
        balanceAfter,
        delta >= 0 ? "admin_balance_credit" : "admin_balance_debit",
        String(currentRequest.id || "").trim(),
      ]
    );

    await client.query(
      `
      UPDATE balance_requests
      SET
        status = 'approved',
        reviewed_by = $2,
        reviewed_at = NOW(),
        rejection_reason = NULL
      WHERE id = $1
      `,
      [String(currentRequest.id || "").trim(), String(reviewerAdminId || "").trim()]
    );

    const updated = await findBalanceRequestByIdWithExecutor(client, String(currentRequest.id || ""));
    return {
      ok: true as const,
      request: updated,
      beforeBalanceCents: customerWallet,
      afterBalanceCents: balanceAfter,
      deltaCents: delta,
    };
  });
}

async function rejectBalanceRequest(requestId: string, reviewerAdminId: string, rejectionReason: string) {
  await ensureBalanceRequestSchema();
  return withTransaction(async (client: DbClient) => {
    const requestResult = await client.query<BalanceRequestRow>(
      `
      SELECT *
      FROM balance_requests
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [String(requestId || "").trim()]
    );
    const currentRequest = requestResult.rows[0] || null;
    if (!currentRequest) return { ok: false as const, error: "NOT_FOUND" };
    if (normalizeRequestStatus(currentRequest.status) !== "pending") {
      return { ok: false as const, error: "REQUEST_ALREADY_REVIEWED" };
    }

    await client.query(
      `
      UPDATE balance_requests
      SET
        status = 'rejected',
        reviewed_by = $2,
        reviewed_at = NOW(),
        rejection_reason = $3
      WHERE id = $1
      `,
      [
        String(currentRequest.id || "").trim(),
        String(reviewerAdminId || "").trim(),
        String(rejectionReason || "").trim(),
      ]
    );

    const updated = await findBalanceRequestByIdWithExecutor(client, String(currentRequest.id || ""));
    return { ok: true as const, request: updated };
  });
}

module.exports = {
  BALANCE_REQUEST_TYPES,
  BALANCE_REQUEST_REASONS,
  BALANCE_REQUEST_STATUSES,
  ensureBalanceRequestSchema,
  mapBalanceRequestRow,
  mapBalanceCustomerRow,
  getBalanceCustomerById,
  searchBalanceCustomers,
  createBalanceRequest,
  findBalanceRequestById,
  listBalanceRequests,
  listBalanceRequestsByRequester,
  approveBalanceRequest,
  rejectBalanceRequest,
  findBalanceRequestByIdWithExecutor,
  toDecimalAmount,
  toCents,
};
