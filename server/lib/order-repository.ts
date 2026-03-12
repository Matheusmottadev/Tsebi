export {};
const crypto = require("node:crypto");

type JsonRecord = Record<string, unknown>;

type QueryResult<TRow extends JsonRecord> = {
  rows: TRow[];
  rowCount: number;
};

type DbClient = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
};

const { query, withTransaction } = require("./db") as {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
  withTransaction: <T>(work: (client: DbClient) => Promise<T>) => Promise<T>;
};
const { protectJsonForStorage, unprotectJsonFromStorage } = require("./data-protection") as {
  protectJsonForStorage: (value: unknown) => unknown;
  unprotectJsonFromStorage: <T>(value: unknown, fallback: T) => T;
};

let orderSchemaPromise: Promise<void> | null = null;

export type OrderItemInput = {
  id: string;
  name?: string;
  qty: number;
  unitAmount: number;
  currency?: string;
  variantColor?: string | null;
  variantSize?: string | null;
  variantKey?: string | null;
};

export type CreateOrderPayload = {
  status?: string;
  paymentMethod?: string;
  installments?: number;
  currency?: string;
  amount?: number;
  itemsAmount?: number;
  shippingAmount?: number;
  shippingPriceCents?: number;
  shippingSelectedProvider?: string;
  shippingSelectedService?: string;
  shippingSelectedServiceCode?: string;
  shippingSelectedCarrierName?: string;
  shippingDeadlineDays?: number | null;
  shippingDestinationZip?: string;
  shipping?: JsonRecord | null;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  stockCommitted?: boolean;
  items?: OrderItemInput[];
};

export type OrderItem = {
  id: string;
  name: string;
  qty: number;
  unitAmount: number;
  currency: string;
  variantColor: string | null;
  variantSize: string | null;
  variantKey: string | null;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  currentStatus: string;
  stockCommitted: boolean;
  createdAt: string;
  updatedAt: string;
  paymentMethod: string;
  installments: number;
  currency: string;
  amount: number;
  itemsAmount: number;
  shippingAmount: number;
  shippingPriceCents: number;
  shippingSelectedProvider: string;
  shippingSelectedService: string;
  shippingSelectedServiceCode: string;
  shippingSelectedCarrierName: string;
  shippingDeadlineDays: number | null;
  shippingDestinationZip: string;
  shippingDeadline: string | null;
  adminNotes: string;
  trackingCode: string;
  trackingId: string;
  trackingStatus: string;
  carrier: string;
  lastTrackingUpdate: string | null;
  items: OrderItem[];
  shipping: JsonRecord | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  refundedAt: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
  stockIssues: unknown;
};

type OrderRow = JsonRecord & {
  id: string;
  order_number?: string;
  status?: string;
  current_status?: string;
  stock_committed?: boolean;
  created_at?: string;
  updated_at?: string;
  payment_method?: string;
  installments?: number;
  currency?: string;
  total_cents?: number;
  items_cents?: number;
  shipping_cents?: number;
  shipping_price_cents?: number;
  shipping_selected_provider?: string;
  shipping_selected_service?: string;
  shipping_selected_service_code?: string;
  shipping_selected_carrier_name?: string;
  shipping_deadline_days?: number | null;
  shipping_destination_zip?: string;
  shipping_deadline?: string | null;
  admin_notes?: string;
  tracking_code?: string;
  tracking_id?: string;
  tracking_status?: string;
  carrier?: string;
  last_tracking_update?: string | null;
  shipping_json?: JsonRecord | null;
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_refund_id?: string | null;
  paid_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  canceled_at?: string | null;
  refunded_at?: string | null;
  failure_reason?: string | null;
  cancellation_reason?: string | null;
  stock_issues?: unknown;
};

type OrderItemRow = JsonRecord & {
  order_id?: string;
  product_sku?: string;
  product_id?: string;
  name?: string;
  qty?: number;
  price_cents?: number;
  currency?: string;
  variant_color?: string | null;
  variant_size?: string | null;
  variant_key?: string | null;
};

type OrderPatch = {
  status?: string;
  stockCommitted?: boolean;
  stripePaymentIntentId?: string | null;
  stripeRefundId?: string | null;
  failureReason?: string | null;
  cancellationReason?: string | null;
  stockIssues?: unknown;
  paidAt?: string | null;
  canceledAt?: string | null;
  refundedAt?: string | null;
  paymentMethod?: string;
  installments?: number;
  userEmail?: string | null;
  userName?: string | null;
  amount?: number;
  itemsAmount?: number;
  shippingAmount?: number;
  shippingPriceCents?: number;
  shippingSelectedProvider?: string | null;
  shippingSelectedService?: string | null;
  shippingSelectedServiceCode?: string | null;
  shippingSelectedCarrierName?: string | null;
  shippingDeadlineDays?: number | null;
  shippingDestinationZip?: string | null;
  shipping?: JsonRecord | null;
  currentStatus?: string;
  trackingCode?: string;
  trackingId?: string;
  trackingStatus?: string;
  shippingDeadline?: string | null;
  adminNotes?: string;
  carrier?: string;
  lastTrackingUpdate?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
};

async function ensureOrderSchema(): Promise<void> {
  if (!orderSchemaPromise) {
    orderSchemaPromise = (async () => {
      await query(`
        ALTER TABLE orders
          ADD COLUMN IF NOT EXISTS shipping_selected_provider TEXT,
          ADD COLUMN IF NOT EXISTS shipping_selected_service TEXT,
          ADD COLUMN IF NOT EXISTS shipping_selected_service_code TEXT,
          ADD COLUMN IF NOT EXISTS shipping_selected_carrier_name TEXT,
          ADD COLUMN IF NOT EXISTS shipping_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_price_cents >= 0),
          ADD COLUMN IF NOT EXISTS shipping_deadline_days INTEGER,
          ADD COLUMN IF NOT EXISTS shipping_destination_zip VARCHAR(8),
          ADD COLUMN IF NOT EXISTS tracking_id TEXT,
          ADD COLUMN IF NOT EXISTS tracking_status TEXT,
          ADD COLUMN IF NOT EXISTS shipping_deadline TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS admin_notes TEXT,
          ADD COLUMN IF NOT EXISTS carrier TEXT,
          ADD COLUMN IF NOT EXISTS last_tracking_update TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
      `);
      await query(`
        ALTER TABLE order_items
          ADD COLUMN IF NOT EXISTS variant_color TEXT,
          ADD COLUMN IF NOT EXISTS variant_size TEXT,
          ADD COLUMN IF NOT EXISTS variant_key TEXT;
      `);
    })().catch((error: unknown) => {
      orderSchemaPromise = null;
      throw error;
    });
  }

  await orderSchemaPromise;
}

function mapOrderRow(row: OrderRow | null | undefined, items: OrderItem[] = []): Order | null {
  if (!row) return null;
  const shippingRaw = unprotectJsonFromStorage<unknown>(row.shipping_json, row.shipping_json ?? null);
  const shipping =
    shippingRaw && typeof shippingRaw === "object" && !Array.isArray(shippingRaw)
      ? (shippingRaw as JsonRecord)
      : null;
  return {
    id: row.id,
    orderNumber: row.order_number || "",
    status: String(row.status || ""),
    currentStatus: row.current_status || "ORDER_PLACED",
    stockCommitted: Boolean(row.stock_committed),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    paymentMethod: String(row.payment_method || ""),
    installments: Number(row.installments || 1),
    currency: String(row.currency || "brl"),
    amount: Number(row.total_cents || 0),
    itemsAmount: Number(row.items_cents || 0),
    shippingAmount: Number(row.shipping_cents || 0),
    shippingPriceCents: Number(row.shipping_price_cents || row.shipping_cents || 0),
    shippingSelectedProvider: row.shipping_selected_provider || "",
    shippingSelectedService: row.shipping_selected_service || "",
    shippingSelectedServiceCode: row.shipping_selected_service_code || "",
    shippingSelectedCarrierName: row.shipping_selected_carrier_name || "",
    shippingDeadlineDays: row.shipping_deadline_days == null ? null : Number(row.shipping_deadline_days),
    shippingDestinationZip: row.shipping_destination_zip || "",
    shippingDeadline: row.shipping_deadline || null,
    adminNotes: String(row.admin_notes || ""),
    trackingCode: row.tracking_code || "",
    trackingId: String(row.tracking_id || ""),
    trackingStatus: String(row.tracking_status || ""),
    carrier: row.carrier || "",
    lastTrackingUpdate: row.last_tracking_update || null,
    items,
    shipping,
    userId: row.user_id || null,
    userEmail: row.user_email || null,
    userName: row.user_name || null,
    stripePaymentIntentId: row.stripe_payment_intent_id || null,
    stripeRefundId: row.stripe_refund_id || null,
    paidAt: row.paid_at || null,
    shippedAt: row.shipped_at || null,
    deliveredAt: row.delivered_at || null,
    canceledAt: row.canceled_at || null,
    refundedAt: row.refunded_at || null,
    failureReason: row.failure_reason || null,
    cancellationReason: row.cancellation_reason || null,
    stockIssues: row.stock_issues || null
  };
}

function mapOrderItemRow(row: OrderItemRow): OrderItem {
  return {
    id: row.product_sku || row.product_id || "",
    name: String(row.name || row.product_sku || row.product_id || ""),
    qty: Number(row.qty || 0),
    unitAmount: Number(row.price_cents || 0),
    currency: String(row.currency || "brl"),
    variantColor: row.variant_color || null,
    variantSize: row.variant_size || null,
    variantKey: row.variant_key || null
  };
}

async function listItemsByOrderIds(orderIds: string[]): Promise<Map<string, OrderItem[]>> {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return new Map();

  const result = await query<OrderItemRow>(
    `
    SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key
    FROM order_items
    WHERE order_id = ANY($1::uuid[])
    ORDER BY id ASC
    `,
    [orderIds]
  );

  const byOrderId = new Map<string, OrderItem[]>();
  result.rows.forEach((row) => {
    const orderId = String(row.order_id || "");
    const list = byOrderId.get(orderId) || [];
    list.push(mapOrderItemRow(row));
    byOrderId.set(orderId, list);
  });
  return byOrderId;
}

async function insertOrderItems(client: DbClient, orderId: string, items: OrderItemInput[]): Promise<void> {
  for (const item of items) {
    const sku = String(item?.id || "").trim();
    if (!sku) continue;

    const productResult = await client.query<{ id?: string } & JsonRecord>(`SELECT id FROM products WHERE sku = $1 LIMIT 1`, [
      sku
    ]);

    const productId = productResult.rows[0]?.id || null;

    await client.query(
      `
      INSERT INTO order_items (
        order_id, product_id, product_sku, name, qty, price_cents, currency, variant_color, variant_size, variant_key
      ) VALUES (
        $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10
      )
      `,
      [
        orderId,
        productId,
        sku,
        String(item.name || sku),
        Math.max(1, Number(item.qty || 1)),
        Math.max(0, Number(item.unitAmount || 0)),
        String(item.currency || "brl").toLowerCase(),
        item.variantColor ? String(item.variantColor).trim() : null,
        item.variantSize ? String(item.variantSize).trim() : null,
        item.variantKey ? String(item.variantKey).trim() : null
      ]
    );
  }
}

async function createOrder(payload: CreateOrderPayload): Promise<Order | null> {
  await ensureOrderSchema();
  return withTransaction(async (client) => {
    const generatedOrderId = crypto.randomUUID();
    const generatedOrderNumber = `PED-${String(generatedOrderId).replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const sql = `
      INSERT INTO orders (
        id, order_number,
        status, payment_method, installments, currency,
        total_cents, items_cents, shipping_cents,
        shipping_price_cents, shipping_selected_provider,
        shipping_selected_service, shipping_selected_service_code,
        shipping_selected_carrier_name, shipping_deadline_days,
        shipping_destination_zip, shipping_json, user_id, user_email, user_name,
        stock_committed
      ) VALUES (
        $1::uuid, $2,
        $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17::jsonb, $18::uuid, $19, $20,
        $21
      )
      RETURNING *
    `;

    const result = await client.query<OrderRow>(sql, [
      generatedOrderId,
      generatedOrderNumber,
      String(payload.status || "pending_payment"),
      String(payload.paymentMethod || "automatic"),
      Math.max(1, Number(payload.installments || 1)),
      String(payload.currency || "brl").toLowerCase(),
      Math.max(0, Number(payload.amount || 0)),
      Math.max(0, Number(payload.itemsAmount || 0)),
      Math.max(0, Number(payload.shippingAmount || 0)),
      Math.max(0, Number(payload.shippingPriceCents || payload.shippingAmount || 0)),
      String(payload.shippingSelectedProvider || "").trim().toLowerCase() || null,
      String(payload.shippingSelectedService || "").trim() || null,
      String(payload.shippingSelectedServiceCode || "").trim() || null,
      String(payload.shippingSelectedCarrierName || "").trim() || null,
      payload.shippingDeadlineDays == null ? null : Math.max(0, Number(payload.shippingDeadlineDays || 0)),
      String(payload.shippingDestinationZip || "").replace(/\D/g, "").slice(0, 8) || null,
      JSON.stringify(protectJsonForStorage(payload.shipping || null)),
      payload.userId || null,
      payload.userEmail || null,
      payload.userName || null,
      Boolean(payload.stockCommitted)
    ]);

    const orderRow = result.rows[0];
    if (!orderRow) return null;

    if (Array.isArray(payload.items) && payload.items.length > 0) {
      await insertOrderItems(client, orderRow.id, payload.items);
    }

    const itemResult = await client.query<OrderItemRow>(
      `SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key FROM order_items WHERE order_id = $1`,
      [orderRow.id]
    );

    return mapOrderRow(orderRow, itemResult.rows.map(mapOrderItemRow));
  });
}

const PATCH_TO_COLUMN = {
  status: "status",
  stockCommitted: "stock_committed",
  stripePaymentIntentId: "stripe_payment_intent_id",
  stripeRefundId: "stripe_refund_id",
  failureReason: "failure_reason",
  cancellationReason: "cancellation_reason",
  stockIssues: "stock_issues",
  paidAt: "paid_at",
  canceledAt: "canceled_at",
  refundedAt: "refunded_at",
  paymentMethod: "payment_method",
  installments: "installments",
  userEmail: "user_email",
  userName: "user_name",
  amount: "total_cents",
  itemsAmount: "items_cents",
  shippingAmount: "shipping_cents",
  shippingPriceCents: "shipping_price_cents",
  shippingSelectedProvider: "shipping_selected_provider",
  shippingSelectedService: "shipping_selected_service",
  shippingSelectedServiceCode: "shipping_selected_service_code",
  shippingSelectedCarrierName: "shipping_selected_carrier_name",
  shippingDeadlineDays: "shipping_deadline_days",
  shippingDestinationZip: "shipping_destination_zip",
  shipping: "shipping_json",
  currentStatus: "current_status",
  trackingCode: "tracking_code",
  trackingId: "tracking_id",
  trackingStatus: "tracking_status",
  shippingDeadline: "shipping_deadline",
  adminNotes: "admin_notes",
  carrier: "carrier",
  lastTrackingUpdate: "last_tracking_update",
  shippedAt: "shipped_at",
  deliveredAt: "delivered_at"
} as const;

type PatchKey = keyof typeof PATCH_TO_COLUMN;

async function updateOrder(orderId: string, patch: Partial<OrderPatch>): Promise<Order | null> {
  await ensureOrderSchema();
  const keys = (Object.keys(patch || {}) as PatchKey[]).filter((key) =>
    Object.prototype.hasOwnProperty.call(PATCH_TO_COLUMN, key)
  );

  if (keys.length === 0) {
    return findOrderById(orderId);
  }

  const values: unknown[] = [];
  const assignments: string[] = [];

  keys.forEach((key, index) => {
    const column = PATCH_TO_COLUMN[key];
    let value: unknown = patch[key];

    if (key === "shipping") {
      value = value == null ? null : protectJsonForStorage(value);
      value = value == null ? null : JSON.stringify(value);
      assignments.push(`${column} = $${index + 2}::jsonb`);
    } else if (key === "stockIssues") {
      value = value == null ? null : JSON.stringify(value);
      assignments.push(`${column} = $${index + 2}::jsonb`);
    } else {
      assignments.push(`${column} = $${index + 2}`);
    }

    values.push(value);
  });

  const result = await query<OrderRow>(
    `
    UPDATE orders
    SET ${assignments.join(", ")}, updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [orderId, ...values]
  );

  const row = result.rows[0];
  if (!row) return null;

  const itemResult = await query<OrderItemRow>(
    `SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key FROM order_items WHERE order_id = $1`,
    [row.id]
  );

  return mapOrderRow(row, itemResult.rows.map(mapOrderItemRow));
}

async function findOrderById(orderId: string): Promise<Order | null> {
  await ensureOrderSchema();
  const result = await query<OrderRow>(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  if (!row) return null;

  const itemResult = await query<OrderItemRow>(
    `SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key FROM order_items WHERE order_id = $1`,
    [row.id]
  );

  return mapOrderRow(row, itemResult.rows.map(mapOrderItemRow));
}

async function deleteOrderById(orderId: string): Promise<Order | null> {
  const before = await findOrderById(orderId);
  if (!before) return null;

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM shipping_quotes WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM shipments WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
  });

  return before;
}

async function findOrderByPaymentIntentId(paymentIntentId: string): Promise<Order | null> {
  if (!paymentIntentId) return null;

  const result = await query<OrderRow>(`SELECT * FROM orders WHERE stripe_payment_intent_id = $1 LIMIT 1`, [paymentIntentId]);
  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  if (!row) return null;

  const itemResult = await query<OrderItemRow>(
    `SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key FROM order_items WHERE order_id = $1`,
    [row.id]
  );

  return mapOrderRow(row, itemResult.rows.map(mapOrderItemRow));
}

async function listOrders(): Promise<Order[]> {
  const result = await query<OrderRow>(`SELECT * FROM orders ORDER BY created_at DESC`);
  const rows = result.rows;
  const byOrder = await listItemsByOrderIds(rows.map((row) => row.id));
  return rows
    .map((row) => mapOrderRow(row, byOrder.get(row.id) || []))
    .filter((row): row is Order => Boolean(row));
}

async function listOrdersByUserId(userId: string): Promise<Order[]> {
  if (!userId) return [];
  const result = await query<OrderRow>(`SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);

  const rows = result.rows;
  const byOrder = await listItemsByOrderIds(rows.map((row) => row.id));
  return rows
    .map((row) => mapOrderRow(row, byOrder.get(row.id) || []))
    .filter((row): row is Order => Boolean(row));
}

module.exports = {
  createOrder,
  updateOrder,
  findOrderById,
  deleteOrderById,
  findOrderByPaymentIntentId,
  listOrders,
  listOrdersByUserId
};

