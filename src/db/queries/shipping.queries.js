const { query, withTransaction } = require("../../../server/lib/db");

function normalizeZip(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function mapShippingQuoteRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    userId: row.user_id || null,
    provider: row.provider,
    serviceCode: row.service_code,
    serviceName: row.service_name,
    priceCents: Number(row.price_cents || 0),
    deadlineDays: row.deadline_days == null ? null : Number(row.deadline_days),
    carrierName: row.carrier_name || "",
    destinationZip: row.destination_zip || "",
    rawPayload: row.raw_payload || {},
    createdAt: row.created_at || null
  };
}

function mapShipmentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    serviceCode: row.service_code || "",
    labelExternalId: row.label_external_id || "",
    trackingCode: row.tracking_code || "",
    status: row.status,
    priceCents: Number(row.price_cents || 0),
    deadlineDays: row.deadline_days == null ? null : Number(row.deadline_days),
    rawPayload: row.raw_payload || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function saveShippingQuotes({ orderId = null, userId = null, destinationZip, quotes = [] }) {
  const normalizedZip = normalizeZip(destinationZip);
  if (!normalizedZip || !Array.isArray(quotes) || quotes.length === 0) return [];

  return withTransaction(async (client) => {
    const inserted = [];
    for (const quote of quotes) {
      const result = await client.query(
        `
        INSERT INTO shipping_quotes (
          order_id,
          user_id,
          provider,
          service_code,
          service_name,
          price_cents,
          deadline_days,
          carrier_name,
          destination_zip,
          raw_payload
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::jsonb
        )
        RETURNING *
        `,
        [
          orderId || null,
          userId || null,
          String(quote.provider || "").trim().toLowerCase(),
          String(quote.serviceCode || "").trim(),
          String(quote.serviceName || "").trim(),
          Math.max(0, Number(quote.priceCents || 0)),
          quote.deadlineDays == null ? null : Math.max(0, Number(quote.deadlineDays || 0)),
          String(quote.carrierName || "").trim(),
          normalizedZip,
          JSON.stringify(quote.rawPayload || {})
        ]
      );
      inserted.push(mapShippingQuoteRow(result.rows[0]));
    }
    return inserted;
  });
}

async function findShippingQuoteById(quoteId) {
  const result = await query(
    `
    SELECT *
    FROM shipping_quotes
    WHERE id = $1
    LIMIT 1
    `,
    [quoteId]
  );
  return mapShippingQuoteRow(result.rows[0] || null);
}

async function assignShippingQuoteToOrder(quoteId, orderId) {
  const result = await query(
    `
    UPDATE shipping_quotes
    SET order_id = $2::uuid
    WHERE id = $1
    RETURNING *
    `,
    [quoteId, orderId]
  );
  return mapShippingQuoteRow(result.rows[0] || null);
}

async function applyShippingSelectionToOrder({
  orderId,
  provider,
  serviceName,
  serviceCode,
  carrierName,
  priceCents,
  deadlineDays,
  destinationZip
}) {
  const normalizedZip = normalizeZip(destinationZip);
  const shippingJsonPatch = {
    selectedProvider: String(provider || "").trim().toLowerCase(),
    selectedService: String(serviceName || "").trim(),
    selectedServiceCode: String(serviceCode || "").trim(),
    selectedCarrierName: String(carrierName || "").trim(),
    shippingCost: Math.max(0, Number(priceCents || 0)) / 100,
    shippingEstimate:
      deadlineDays == null || Number(deadlineDays) <= 0 ? "" : `${Math.max(0, Number(deadlineDays || 0))} dias`,
    cep: normalizedZip
  };

  const result = await query(
    `
    UPDATE orders
    SET
      shipping_selected_provider = $2,
      shipping_selected_service = $3,
      shipping_selected_service_code = $4,
      shipping_selected_carrier_name = $5,
      shipping_price_cents = $6,
      shipping_cents = $6,
      shipping_deadline_days = $7,
      shipping_destination_zip = $8,
      shipping_json = COALESCE(shipping_json, '{}'::jsonb) || $9::jsonb,
      total_cents = COALESCE(items_cents, 0) + $6,
      updated_at = NOW()
    WHERE id = $1
    RETURNING id
    `,
    [
      orderId,
      String(provider || "").trim().toLowerCase(),
      String(serviceName || "").trim(),
      String(serviceCode || "").trim(),
      String(carrierName || "").trim(),
      Math.max(0, Number(priceCents || 0)),
      deadlineDays == null ? null : Math.max(0, Number(deadlineDays || 0)),
      normalizedZip,
      JSON.stringify(shippingJsonPatch)
    ]
  );

  return Boolean(result.rowCount > 0);
}

async function upsertShipmentPending({
  orderId,
  provider,
  serviceCode,
  priceCents,
  deadlineDays,
  rawPayload
}) {
  const result = await query(
    `
    INSERT INTO shipments (
      order_id,
      provider,
      service_code,
      status,
      price_cents,
      deadline_days,
      raw_payload
    ) VALUES (
      $1::uuid,
      $2,
      $3,
      'ETIQUETA_PENDENTE',
      $4,
      $5,
      $6::jsonb
    )
    ON CONFLICT (order_id) DO UPDATE
    SET
      provider = EXCLUDED.provider,
      service_code = EXCLUDED.service_code,
      status = 'ETIQUETA_PENDENTE',
      price_cents = EXCLUDED.price_cents,
      deadline_days = EXCLUDED.deadline_days,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW()
    RETURNING *
    `,
    [
      orderId,
      String(provider || "").trim().toLowerCase(),
      String(serviceCode || "").trim(),
      Math.max(0, Number(priceCents || 0)),
      deadlineDays == null ? null : Math.max(0, Number(deadlineDays || 0)),
      JSON.stringify(rawPayload || {})
    ]
  );
  return mapShipmentRow(result.rows[0] || null);
}

async function findShipmentByOrderId(orderId) {
  const result = await query(
    `
    SELECT *
    FROM shipments
    WHERE order_id = $1::uuid
    LIMIT 1
    `,
    [orderId]
  );
  return mapShipmentRow(result.rows[0] || null);
}

async function listShipmentsByOrderIds(orderIds = []) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return new Map();

  const result = await query(
    `
    SELECT *
    FROM shipments
    WHERE order_id = ANY($1::uuid[])
    `,
    [orderIds]
  );

  const byOrderId = new Map();
  result.rows.forEach((row) => {
    const shipment = mapShipmentRow(row);
    if (!shipment) return;
    byOrderId.set(String(shipment.orderId), shipment);
  });
  return byOrderId;
}

async function markShipmentLabelPurchased({
  orderId,
  labelExternalId,
  trackingCode,
  status = "ETIQUETA_COMPRADA",
  rawPayload = {}
}) {
  const result = await query(
    `
    UPDATE shipments
    SET
      label_external_id = $2,
      tracking_code = COALESCE($3, tracking_code),
      status = $4,
      raw_payload = COALESCE(raw_payload, '{}'::jsonb) || $5::jsonb,
      updated_at = NOW()
    WHERE order_id = $1::uuid
    RETURNING *
    `,
    [
      orderId,
      String(labelExternalId || "").trim(),
      String(trackingCode || "").trim() || null,
      String(status || "ETIQUETA_COMPRADA").trim().toUpperCase(),
      JSON.stringify(rawPayload || {})
    ]
  );
  return mapShipmentRow(result.rows[0] || null);
}

async function updateShipmentTracking({
  orderId,
  trackingCode,
  status = "",
  rawPayload = {}
}) {
  const updates = [];
  const values = [orderId];

  if (trackingCode != null) {
    values.push(String(trackingCode || "").trim() || null);
    updates.push(`tracking_code = COALESCE($${values.length}, tracking_code)`);
  }

  if (status) {
    values.push(String(status || "").trim().toUpperCase());
    updates.push(`status = $${values.length}`);
  }

  values.push(JSON.stringify(rawPayload || {}));
  updates.push(`raw_payload = COALESCE(raw_payload, '{}'::jsonb) || $${values.length}::jsonb`);
  updates.push("updated_at = NOW()");

  const result = await query(
    `
    UPDATE shipments
    SET ${updates.join(", ")}
    WHERE order_id = $1::uuid
    RETURNING *
    `,
    values
  );
  return mapShipmentRow(result.rows[0] || null);
}

module.exports = {
  normalizeZip,
  mapShippingQuoteRow,
  mapShipmentRow,
  saveShippingQuotes,
  findShippingQuoteById,
  assignShippingQuoteToOrder,
  applyShippingSelectionToOrder,
  upsertShipmentPending,
  findShipmentByOrderId,
  listShipmentsByOrderIds,
  markShipmentLabelPurchased,
  updateShipmentTracking
};
