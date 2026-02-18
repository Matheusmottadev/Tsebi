const { query, withTransaction } = require("../../../server/lib/db");

function normalizeOrderLookup(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function mapOrderItemRow(row) {
  return {
    id: row.product_sku || row.product_id || "",
    name: row.name || "",
    qty: Math.max(1, Number(row.qty || 1)),
    unitAmount: Math.max(0, Number(row.price_cents || 0)),
    currency: row.currency || "brl",
    image: row.image_url || ""
  };
}

function mapTrackingEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    rawStatus: row.raw_status || "",
    description: row.description || "",
    location: row.location || "",
    occurredAt: row.occurred_at || null,
    createdAt: row.created_at || null
  };
}

function mapTrackableOrderRow(row, items = []) {
  if (!row) return null;
  const mergedTrackingCode = row.merged_tracking_code || row.tracking_code || "";
  const mergedCarrier =
    row.merged_carrier || row.carrier || row.shipping_selected_carrier_name || "";
  return {
    id: row.id,
    orderNumber: row.order_number || "",
    email: row.user_email || "",
    userId: row.user_id || null,
    status: row.status || "",
    currentStatus: row.current_status || "ORDER_PLACED",
    trackingCode: mergedTrackingCode,
    carrier: mergedCarrier,
    shippedAt: row.shipped_at || null,
    deliveredAt: row.delivered_at || null,
    lastTrackingUpdate: row.last_tracking_update || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    items
  };
}

async function listOrderItems(orderId) {
  const result = await query(
    `
    SELECT
      oi.order_id,
      oi.product_sku,
      oi.product_id,
      oi.name,
      oi.qty,
      oi.price_cents,
      oi.currency,
      p.image_url
    FROM order_items oi
    LEFT JOIN products p
      ON p.id = oi.product_id
    WHERE oi.order_id = $1::uuid
    ORDER BY oi.name ASC, oi.id ASC
    `,
    [orderId]
  );
  return result.rows.map(mapOrderItemRow);
}

async function findTrackableOrderByOrderNumberAndEmail(orderNumber, email) {
  const normalizedOrder = normalizeOrderLookup(orderNumber);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedOrder || !normalizedEmail) return null;

  const result = await query(
    `
    SELECT
      o.*,
      COALESCE(o.tracking_code, s.tracking_code) AS merged_tracking_code,
      COALESCE(o.carrier, o.shipping_selected_carrier_name, s.provider) AS merged_carrier
    FROM orders o
    LEFT JOIN shipments s
      ON s.order_id = o.id
    WHERE lower(COALESCE(o.user_email, '')) = $2
      AND (
        upper(replace(COALESCE(o.order_number, ''), '-', '')) = $1
        OR upper(replace(COALESCE(o.id::text, ''), '-', '')) = $1
        OR upper(replace(COALESCE(o.order_number, ''), '-', '')) = CONCAT('PED', $1)
      )
    ORDER BY o.created_at DESC
    LIMIT 1
    `,
    [normalizedOrder, normalizedEmail]
  );

  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const items = await listOrderItems(row.id);
  return mapTrackableOrderRow(row, items);
}

async function listTrackableOrdersByUserId(userId, limit = 100) {
  if (!userId) return [];
  const safeLimit = Math.max(1, Math.min(300, Number(limit || 100)));
  const result = await query(
    `
    SELECT
      o.*,
      COALESCE(o.tracking_code, s.tracking_code) AS merged_tracking_code,
      COALESCE(o.carrier, o.shipping_selected_carrier_name, s.provider) AS merged_carrier
    FROM orders o
    LEFT JOIN shipments s
      ON s.order_id = o.id
    WHERE o.user_id = $1::uuid
    ORDER BY o.created_at DESC
    LIMIT $2
    `,
    [userId, safeLimit]
  );

  const orders = result.rows.map((row) => mapTrackableOrderRow(row, []));
  for (const order of orders) {
    order.items = await listOrderItems(order.id);
  }
  return orders;
}

async function listTrackingEventsByOrderId(orderId, direction = "ASC") {
  const orderBy = String(direction || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
  const result = await query(
    `
    SELECT *
    FROM tracking_events
    WHERE order_id = $1::uuid
    ORDER BY occurred_at ${orderBy}, created_at ${orderBy}
    `,
    [orderId]
  );
  return result.rows.map(mapTrackingEventRow);
}

async function insertTrackingEvents(orderId, events = []) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return [];

  return withTransaction(async (client) => {
    const inserted = [];
    for (const event of list) {
      const result = await client.query(
        `
        INSERT INTO tracking_events (
          order_id, status, raw_status, description, location, occurred_at
        )
        SELECT
          $1::uuid, $2, $3, $4, $5, $6::timestamptz
        WHERE NOT EXISTS (
          SELECT 1
          FROM tracking_events te
          WHERE te.order_id = $1::uuid
            AND te.occurred_at = $6::timestamptz
            AND COALESCE(te.raw_status, '') = COALESCE($3, '')
            AND COALESCE(te.description, '') = COALESCE($4, '')
            AND COALESCE(te.location, '') = COALESCE($5, '')
        )
        RETURNING *
        `,
        [
          orderId,
          String(event?.status || "").trim().toUpperCase() || "IN_TRANSIT",
          String(event?.rawStatus || "").trim() || null,
          String(event?.description || "").trim() || "Atualização de rastreio",
          String(event?.location || "").trim() || null,
          event?.occurredAt || new Date().toISOString()
        ]
      );

      if (result.rowCount > 0) {
        inserted.push(mapTrackingEventRow(result.rows[0]));
      }
    }
    return inserted;
  });
}

async function updateOrderTrackingState(orderId, patch = {}) {
  const updates = [];
  const values = [orderId];

  const push = (column, value, cast = "") => {
    values.push(value);
    updates.push(`${column} = $${values.length}${cast}`);
  };

  if (Object.prototype.hasOwnProperty.call(patch, "currentStatus")) {
    push("current_status", String(patch.currentStatus || "").trim().toUpperCase() || "IN_TRANSIT");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "trackingCode")) {
    push("tracking_code", String(patch.trackingCode || "").trim() || null);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "carrier")) {
    push("carrier", String(patch.carrier || "").trim() || null);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "shippedAt")) {
    push("shipped_at", patch.shippedAt || null, "::timestamptz");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "deliveredAt")) {
    push("delivered_at", patch.deliveredAt || null, "::timestamptz");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "lastTrackingUpdate")) {
    push("last_tracking_update", patch.lastTrackingUpdate || null, "::timestamptz");
  }

  if (!updates.length) return null;
  updates.push("updated_at = NOW()");

  const result = await query(
    `
    UPDATE orders
    SET ${updates.join(", ")}
    WHERE id = $1::uuid
    RETURNING *
    `,
    values
  );

  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const items = await listOrderItems(row.id);
  return mapTrackableOrderRow(row, items);
}

async function listTrackableOrdersForSync(limit = 120) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 120)));
  const result = await query(
    `
    SELECT
      o.*,
      COALESCE(o.tracking_code, s.tracking_code) AS merged_tracking_code,
      COALESCE(o.carrier, o.shipping_selected_carrier_name, s.provider) AS merged_carrier
    FROM orders o
    LEFT JOIN shipments s
      ON s.order_id = o.id
    WHERE COALESCE(o.tracking_code, s.tracking_code, '') <> ''
      AND COALESCE(o.current_status, '') <> 'DELIVERED'
    ORDER BY COALESCE(o.last_tracking_update, o.created_at) ASC
    LIMIT $1
    `,
    [safeLimit]
  );
  return result.rows.map((row) => mapTrackableOrderRow(row, []));
}

module.exports = {
  normalizeOrderLookup,
  mapTrackingEventRow,
  mapTrackableOrderRow,
  findTrackableOrderByOrderNumberAndEmail,
  listTrackableOrdersByUserId,
  listTrackingEventsByOrderId,
  insertTrackingEvents,
  updateOrderTrackingState,
  listTrackableOrdersForSync
};
