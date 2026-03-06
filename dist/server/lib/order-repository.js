"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("node:crypto");
const { query, withTransaction } = require("./db");
let orderSchemaPromise = null;
async function ensureOrderSchema() {
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
        })().catch((error) => {
            orderSchemaPromise = null;
            throw error;
        });
    }
    await orderSchemaPromise;
}
function mapOrderRow(row, items = []) {
    if (!row)
        return null;
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
        shipping: row.shipping_json || null,
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
function mapOrderItemRow(row) {
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
async function listItemsByOrderIds(orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0)
        return new Map();
    const result = await query(`
    SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key
    FROM order_items
    WHERE order_id = ANY($1::uuid[])
    ORDER BY id ASC
    `, [orderIds]);
    const byOrderId = new Map();
    result.rows.forEach((row) => {
        const orderId = String(row.order_id || "");
        const list = byOrderId.get(orderId) || [];
        list.push(mapOrderItemRow(row));
        byOrderId.set(orderId, list);
    });
    return byOrderId;
}
async function insertOrderItems(client, orderId, items) {
    for (const item of items) {
        const sku = String(item?.id || "").trim();
        if (!sku)
            continue;
        const productResult = await client.query(`SELECT id FROM products WHERE sku = $1 LIMIT 1`, [
            sku
        ]);
        const productId = productResult.rows[0]?.id || null;
        await client.query(`
      INSERT INTO order_items (
        order_id, product_id, product_sku, name, qty, price_cents, currency, variant_color, variant_size, variant_key
      ) VALUES (
        $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10
      )
      `, [
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
        ]);
    }
}
async function createOrder(payload) {
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
        const result = await client.query(sql, [
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
            JSON.stringify(payload.shipping || null),
            payload.userId || null,
            payload.userEmail || null,
            payload.userName || null,
            Boolean(payload.stockCommitted)
        ]);
        const orderRow = result.rows[0];
        if (!orderRow)
            return null;
        if (Array.isArray(payload.items) && payload.items.length > 0) {
            await insertOrderItems(client, orderRow.id, payload.items);
        }
        const itemResult = await client.query(`SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key FROM order_items WHERE order_id = $1`, [orderRow.id]);
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
};
async function updateOrder(orderId, patch) {
    await ensureOrderSchema();
    const keys = Object.keys(patch || {}).filter((key) => Object.prototype.hasOwnProperty.call(PATCH_TO_COLUMN, key));
    if (keys.length === 0) {
        return findOrderById(orderId);
    }
    const values = [];
    const assignments = [];
    keys.forEach((key, index) => {
        const column = PATCH_TO_COLUMN[key];
        let value = patch[key];
        if (key === "shipping" || key === "stockIssues") {
            value = value == null ? null : JSON.stringify(value);
            assignments.push(`${column} = $${index + 2}::jsonb`);
        }
        else {
            assignments.push(`${column} = $${index + 2}`);
        }
        values.push(value);
    });
    const result = await query(`
    UPDATE orders
    SET ${assignments.join(", ")}, updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `, [orderId, ...values]);
    const row = result.rows[0];
    if (!row)
        return null;
    const itemResult = await query(`SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key FROM order_items WHERE order_id = $1`, [row.id]);
    return mapOrderRow(row, itemResult.rows.map(mapOrderItemRow));
}
async function findOrderById(orderId) {
    await ensureOrderSchema();
    const result = await query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
    if (result.rowCount === 0)
        return null;
    const row = result.rows[0];
    if (!row)
        return null;
    const itemResult = await query(`SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key FROM order_items WHERE order_id = $1`, [row.id]);
    return mapOrderRow(row, itemResult.rows.map(mapOrderItemRow));
}
async function deleteOrderById(orderId) {
    const before = await findOrderById(orderId);
    if (!before)
        return null;
    await withTransaction(async (client) => {
        await client.query(`DELETE FROM shipping_quotes WHERE order_id = $1`, [orderId]);
        await client.query(`DELETE FROM shipments WHERE order_id = $1`, [orderId]);
        await client.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
        await client.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
    });
    return before;
}
async function findOrderByPaymentIntentId(paymentIntentId) {
    if (!paymentIntentId)
        return null;
    const result = await query(`SELECT * FROM orders WHERE stripe_payment_intent_id = $1 LIMIT 1`, [paymentIntentId]);
    if (result.rowCount === 0)
        return null;
    const row = result.rows[0];
    if (!row)
        return null;
    const itemResult = await query(`SELECT order_id, product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key FROM order_items WHERE order_id = $1`, [row.id]);
    return mapOrderRow(row, itemResult.rows.map(mapOrderItemRow));
}
async function listOrders() {
    const result = await query(`SELECT * FROM orders ORDER BY created_at DESC`);
    const rows = result.rows;
    const byOrder = await listItemsByOrderIds(rows.map((row) => row.id));
    return rows
        .map((row) => mapOrderRow(row, byOrder.get(row.id) || []))
        .filter((row) => Boolean(row));
}
async function listOrdersByUserId(userId) {
    if (!userId)
        return [];
    const result = await query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    const rows = result.rows;
    const byOrder = await listItemsByOrderIds(rows.map((row) => row.id));
    return rows
        .map((row) => mapOrderRow(row, byOrder.get(row.id) || []))
        .filter((row) => Boolean(row));
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
//# sourceMappingURL=order-repository.js.map