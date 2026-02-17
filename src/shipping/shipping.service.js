const { findOrderById } = require("../../server/lib/order-repository");
const { assertShippingProvider } = require("./provider.interface");
const melhorEnvioProvider = require("./providers/melhorenvio");
const dummyProvider = require("./providers/dummy");
const {
  normalizeZip,
  saveShippingQuotes,
  findShippingQuoteById,
  assignShippingQuoteToOrder,
  applyShippingSelectionToOrder,
  upsertShipmentPending,
  findShipmentByOrderId,
  markShipmentLabelPurchased,
  updateShipmentTracking
} = require("../db/queries/shipping.queries");

const SHIPPING_QUOTE_TTL_MS = 30 * 60 * 1000;

function createShippingError(code, status = 400, details = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  if (details != null) {
    error.details = details;
  }
  return error;
}

function getConfiguredProviderName() {
  const explicit = String(process.env.SHIPPING_PROVIDER || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (String(process.env.MELHOR_ENVIO_TOKEN || "").trim()) return "melhorenvio";
  return "dummy";
}

function getProvider(providerName = "") {
  const normalized = String(providerName || getConfiguredProviderName()).trim().toLowerCase();
  if (normalized === "melhorenvio") return assertShippingProvider(melhorEnvioProvider, "melhorenvio");
  if (normalized === "dummy") return assertShippingProvider(dummyProvider, "dummy");
  throw createShippingError("SHIPPING_PROVIDER_NOT_SUPPORTED", 500, normalized);
}

function getFromZip() {
  return normalizeZip(process.env.SHIP_FROM_ZIP || "");
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function buildDefaultPackages(itemsCount = 1) {
  const qty = Math.max(1, Number(itemsCount || 1));
  const weightKg = Math.max(0.1, numberEnv("DEFAULT_PACKAGE_WEIGHT_KG", 0.3) * qty);
  return [
    {
      quantity: 1,
      weightKg,
      lengthCm: Math.max(1, Math.round(numberEnv("DEFAULT_PACKAGE_LENGTH_CM", 20))),
      widthCm: Math.max(1, Math.round(numberEnv("DEFAULT_PACKAGE_WIDTH_CM", 15))),
      heightCm: Math.max(1, Math.round(numberEnv("DEFAULT_PACKAGE_HEIGHT_CM", 5)))
    }
  ];
}

function sanitizeQuoteList(quotes = []) {
  const list = Array.isArray(quotes) ? quotes : [];
  return list
    .map((quote) => ({
      provider: String(quote?.provider || "").trim().toLowerCase(),
      serviceCode: String(quote?.serviceCode || "").trim(),
      serviceName: String(quote?.serviceName || "").trim(),
      priceCents: Math.max(0, Number(quote?.priceCents || 0)),
      deadlineDays: quote?.deadlineDays == null ? null : Math.max(0, Number(quote.deadlineDays || 0)),
      carrierName: String(quote?.carrierName || "").trim(),
      rawPayload: quote?.rawPayload || {}
    }))
    .filter((quote) => quote.provider && quote.serviceCode && quote.serviceName && quote.priceCents >= 0)
    .sort((a, b) => a.priceCents - b.priceCents);
}

async function quoteShipping({ orderId = null, userId = null, destinationZip, itemsCount = 1 }) {
  const toZip = normalizeZip(destinationZip);
  if (!/^\d{8}$/.test(toZip)) {
    throw createShippingError("INVALID_DESTINATION_ZIP", 400);
  }

  const fromZip = getFromZip();
  if (!/^\d{8}$/.test(fromZip)) {
    throw createShippingError("SHIP_FROM_ZIP_NOT_CONFIGURED", 500);
  }

  const configuredProviderName = getConfiguredProviderName();
  const provider = getProvider(configuredProviderName);
  const quoteInput = {
    fromZip,
    toZip,
    packages: buildDefaultPackages(itemsCount)
  };

  let providerQuotes = [];
  try {
    providerQuotes = await provider.quote(quoteInput);
  } catch (error) {
    // Keep checkout operational if Melhor Envio auth/integration is temporarily broken.
    if (configuredProviderName === "melhorenvio") {
      // eslint-disable-next-line no-console
      console.error("[shipping] melhorenvio quote failed, using dummy fallback", {
        code: String(error?.code || error?.message || "unknown_error"),
        status: Number(error?.status || 0) || null
      });
      const fallbackProvider = getProvider("dummy");
      providerQuotes = await fallbackProvider.quote(quoteInput);
    } else {
      throw error;
    }
  }

  const normalizedQuotes = sanitizeQuoteList(providerQuotes);
  if (normalizedQuotes.length === 0) {
    throw createShippingError("NO_SHIPPING_QUOTES", 409);
  }

  const saved = await saveShippingQuotes({
    orderId,
    userId,
    destinationZip: toZip,
    quotes: normalizedQuotes
  });

  return saved;
}

function assertQuoteBelongsToUser(quote, userId) {
  const quoteUserId = String(quote?.userId || "").trim();
  if (!quoteUserId || quoteUserId !== String(userId || "").trim()) {
    throw createShippingError("SHIPPING_QUOTE_NOT_FOUND", 404);
  }
}

function assertQuoteZip(quote, destinationZip) {
  const quoteZip = normalizeZip(quote?.destinationZip || "");
  const expected = normalizeZip(destinationZip || "");
  if (expected && quoteZip !== expected) {
    throw createShippingError("SHIPPING_QUOTE_ZIP_MISMATCH", 409);
  }
}

function assertQuoteFresh(quote) {
  const createdAt = new Date(quote?.createdAt || 0).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > SHIPPING_QUOTE_TTL_MS) {
    throw createShippingError("SHIPPING_QUOTE_EXPIRED", 409);
  }
}

async function resolveQuoteForCheckout({ quoteId, userId, destinationZip }) {
  const id = String(quoteId || "").trim();
  if (!id) {
    throw createShippingError("SHIPPING_QUOTE_REQUIRED", 400);
  }

  const quote = await findShippingQuoteById(id);
  if (!quote) {
    throw createShippingError("SHIPPING_QUOTE_NOT_FOUND", 404);
  }

  assertQuoteBelongsToUser(quote, userId);
  assertQuoteZip(quote, destinationZip);
  assertQuoteFresh(quote);
  return quote;
}

async function selectShippingForOrder({ orderId, userId, quoteId, destinationZip }) {
  const order = await findOrderById(orderId);
  if (!order) throw createShippingError("ORDER_NOT_FOUND", 404);
  if (String(order.userId || "") !== String(userId || "")) {
    throw createShippingError("ORDER_NOT_FOUND", 404);
  }

  const quote = await resolveQuoteForCheckout({
    quoteId,
    userId,
    destinationZip: destinationZip || order.shippingDestinationZip || order.shipping?.cep || ""
  });

  await applyShippingSelectionToOrder({
    orderId: order.id,
    provider: quote.provider,
    serviceName: quote.serviceName,
    serviceCode: quote.serviceCode,
    carrierName: quote.carrierName,
    priceCents: quote.priceCents,
    deadlineDays: quote.deadlineDays,
    destinationZip: quote.destinationZip
  });

  await assignShippingQuoteToOrder(quote.id, order.id);

  const shipment = await upsertShipmentPending({
    orderId: order.id,
    provider: quote.provider,
    serviceCode: quote.serviceCode,
    priceCents: quote.priceCents,
    deadlineDays: quote.deadlineDays,
    rawPayload: {
      quoteId: quote.id,
      source: "checkout_select"
    }
  });

  const updatedOrder = await findOrderById(order.id);
  return {
    order: updatedOrder,
    shipment,
    quote
  };
}

async function ensureShipmentPendingFromOrder(order) {
  if (!order) throw createShippingError("ORDER_NOT_FOUND", 404);

  const provider = String(order.shippingSelectedProvider || "").trim().toLowerCase();
  const serviceCode = String(order.shippingSelectedServiceCode || "").trim();
  if (!provider || !serviceCode) {
    throw createShippingError("ORDER_SHIPPING_NOT_SELECTED", 409);
  }

  return upsertShipmentPending({
    orderId: order.id,
    provider,
    serviceCode,
    priceCents: Number(order.shippingPriceCents || order.shippingAmount || 0),
    deadlineDays: order.shippingDeadlineDays,
    rawPayload: {
      source: "ensure_pending"
    }
  });
}

async function buyLabelForOrder(order) {
  if (!order) throw createShippingError("ORDER_NOT_FOUND", 404);
  if (String(order.status || "").toLowerCase() !== "paid") {
    throw createShippingError("ORDER_NOT_PAID", 409);
  }

  const existingShipment = await findShipmentByOrderId(order.id);
  if (!existingShipment) {
    await ensureShipmentPendingFromOrder(order);
  }

  const providerName = String(order.shippingSelectedProvider || getConfiguredProviderName()).trim().toLowerCase();
  const provider = getProvider(providerName);
  const bought = await provider.buyLabel({ order });

  const updated = await markShipmentLabelPurchased({
    orderId: order.id,
    labelExternalId: bought?.labelExternalId,
    trackingCode: bought?.trackingCode || null,
    status: bought?.status || "ETIQUETA_COMPRADA",
    rawPayload: bought?.rawPayload || {}
  });

  return updated;
}

async function getLabelForOrder(order) {
  if (!order) throw createShippingError("ORDER_NOT_FOUND", 404);
  const shipment = await findShipmentByOrderId(order.id);
  if (!shipment) throw createShippingError("SHIPMENT_NOT_FOUND", 404);
  if (!shipment.labelExternalId) throw createShippingError("LABEL_NOT_PURCHASED", 409);

  const provider = getProvider(shipment.provider || order.shippingSelectedProvider || getConfiguredProviderName());
  const label = await provider.getLabel({
    labelExternalId: shipment.labelExternalId,
    shipment,
    order
  });
  return {
    shipment,
    label
  };
}

async function trackOrderShipment(order) {
  if (!order) throw createShippingError("ORDER_NOT_FOUND", 404);
  const shipment = await findShipmentByOrderId(order.id);
  if (!shipment) throw createShippingError("SHIPMENT_NOT_FOUND", 404);
  if (!shipment.trackingCode) throw createShippingError("TRACKING_NOT_AVAILABLE", 409);

  const provider = getProvider(shipment.provider || order.shippingSelectedProvider || getConfiguredProviderName());
  const tracking = await provider.track({
    trackingCode: shipment.trackingCode,
    shipment,
    order
  });

  const nextStatus = String(tracking?.status || "").trim().toUpperCase();
  const updatedShipment = await updateShipmentTracking({
    orderId: order.id,
    trackingCode: shipment.trackingCode,
    status: nextStatus || "",
    rawPayload: tracking?.rawPayload || tracking || {}
  });

  return {
    shipment: updatedShipment || shipment,
    tracking
  };
}

module.exports = {
  SHIPPING_QUOTE_TTL_MS,
  createShippingError,
  quoteShipping,
  resolveQuoteForCheckout,
  selectShippingForOrder,
  ensureShipmentPendingFromOrder,
  buyLabelForOrder,
  getLabelForOrder,
  trackOrderShipment
};
