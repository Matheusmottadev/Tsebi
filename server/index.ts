import type { Express } from "express";
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const Stripe = require("stripe");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { createSessionMiddleware } = require("./session");
const { attachUserCsrfToken, requireUserCsrfForMutations } = require("./middlewares/userCsrf");
const { authRouter, myRouter } = require("./auth");
const { studioAuthRouter } = require("./studio-auth");
const { vipRouter } = require("./vip");
const { adminRouter } = require("./admin");
const { readJson, writeJson } = require("./lib/json-store");
const { findUserById, upsertCheckoutGuestUser, setGuestTempPasswordIfMissing, normalizeEmail } = require("./user-repository");
const { sendGuestCheckoutAccountCreatedEmail } = require("./lib/email-service");
const {
  createOrder,
  updateOrder,
  findOrderById,
  listOrdersByUserId
} = require("./lib/order-repository");
const { notifyOrderConfirmed, notifyPaymentApproved } = require("./lib/order-notification-service");
const { listProducts, getProductByIdentifier } = require("./lib/product-repository");
const { checkAvailability, commitStock } = require("./lib/inventory-repository");
const { evaluateAccessCode } = require("./lib/access-code-repository");
const { withTransaction } = require("./lib/db");
const { shippingRouter } = require("../src/routes/shipping.routes");
const { adminShippingRouter } = require("../src/routes/admin.shipping.routes");
const { adminWhatsAppRouter } = require("../src/routes/admin.whatsapp.routes");
const { orderTrackingRouter } = require("../src/routes/order-tracking.routes");
const { whatsappRouter } = require("../src/routes/whatsapp.routes");
const { resolveQuoteForCheckout, selectShippingForOrder } = require("../src/shipping/shipping.service");
const { syncMelhorEnvioTrackingJob } = require("../src/shipping/order-tracking.service");
const { sendOrderConfirmedWhatsApp } = require("./lib/whatsapp-service");

dotenv.config();

const expressApp = express();
export function createApp(): Express {
  return expressApp as Express;
}
export const app = createApp();
const port = Number(process.env.PORT) || 4242;
const isVercelRuntime =
  String(process.env.VERCEL || "").trim() === "1" ||
  String(process.env.VERCEL || "").trim().toLowerCase() === "true";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const posthogPublicKey = process.env.POSTHOG_PUBLIC_KEY || "";
const posthogHost = process.env.POSTHOG_HOST || "";
/** @type {import("stripe").Stripe | null} */
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
let melhorEnvioSyncTimer: any = null;
const newsletterDataFile = path.resolve(__dirname, "..", "data", "newsletter-subscribers.json");
let newsletterWriteQueue = Promise.resolve<unknown>(null);

function normalizePosthogHost(value: any) {
  const fallback = "https://us.i.posthog.com";
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    return parsed.origin;
  } catch {
    return fallback;
  }
}

function parseAllowedCorsOrigins(): string[] {
  const fromEnv = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((entry: any) => String(entry || "").trim())
    .filter(Boolean);
  const appBaseUrl = String(process.env.APP_BASE_URL || "").trim();
  if (appBaseUrl) fromEnv.push(appBaseUrl);

  const normalized = new Set<string>();
  fromEnv.forEach((entry: any) => {
    try {
      normalized.add(new URL(entry).origin);
    } catch {}
  });

  if (normalized.size > 0) return Array.from(normalized);

  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:3000", "http://localhost:4242", "http://127.0.0.1:3000", "http://127.0.0.1:4242"];
  }

  return [];
}

app.set("trust proxy", 1);

const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

const paymentIntentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

const newsletterSubscribeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

const newsletterSubscribeSchema = z.object({
  email: z.string().trim().email(),
  phone: z.string().trim().max(32).optional().default(""),
  source: z.string().trim().max(80).optional().default(""),
  page: z.string().trim().max(200).optional().default(""),
  consent: z.coerce.boolean().optional().default(false)
});

const paymentIntentSchema = z.object({
  paymentMethod: z.string().trim().optional().default("automatic"),
  discountCode: z.string().trim().max(40).optional().default(""),
  installments: z.coerce.number().int().min(1).max(6).optional().default(1),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        qty: z.coerce.number().int().min(1).max(999),
        color: z.string().trim().max(80).optional().default(""),
        size: z.string().trim().max(80).optional().default(""),
        variantKey: z.string().trim().max(180).optional().default("")
      })
    )
    .min(1),
  shipping: z
    .object({
      firstName: z.string().trim().max(80).optional().default(""),
      lastName: z.string().trim().max(120).optional().default(""),
      fullName: z.string().trim().max(120).optional().default(""),
      email: z.string().trim().max(160).optional().default(""),
      phone: z.string().trim().max(40).optional().default(""),
      cpf: z.string().trim().max(20).optional().default(""),
      cep: z.string().trim().max(20).optional().default(""),
      street: z.string().trim().max(160).optional().default(""),
      number: z.string().trim().max(20).optional().default(""),
      complement: z.string().trim().max(120).optional().default(""),
      district: z.string().trim().max(120).optional().default(""),
      city: z.string().trim().max(120).optional().default(""),
      state: z.string().trim().max(2).optional().default(""),
      shippingMethod: z.string().trim().max(20).optional().default(""),
      shippingCost: z.coerce.number().optional().default(0),
      shippingEstimate: z.string().trim().max(60).optional().default(""),
      quoteId: z.string().trim().uuid().optional().nullable().default(null)
    })
    .nullable()
    .optional(),
  customer: z
    .object({
      firstName: z.string().trim().max(80).optional().default(""),
      lastName: z.string().trim().max(120).optional().default(""),
      email: z.string().trim().max(160).optional().default(""),
      phone: z.string().trim().max(40).optional().default(""),
      cpf: z.string().trim().max(20).optional().default("")
    })
    .optional(),
  shippingAddress: z
    .object({
      zip: z.string().trim().max(20).optional().default(""),
      street: z.string().trim().max(160).optional().default(""),
      number: z.string().trim().max(20).optional().default(""),
      complement: z.string().trim().max(120).optional().default(""),
      district: z.string().trim().max(120).optional().default(""),
      city: z.string().trim().max(120).optional().default(""),
      state: z.string().trim().max(2).optional().default(""),
      country: z.string().trim().max(2).optional().default("BR")
    })
    .optional()
});

function normalizeAndAggregateItems(rawItems: any) {
  if (!Array.isArray(rawItems)) return [];
  const byId = new Map();

  rawItems.forEach((item: any) => {
    const id = item && typeof item.id === "string" ? item.id.trim() : "";
    const qtyRaw = item ? Number(item.qty) : 0;
    const qty = Number.isInteger(qtyRaw) ? qtyRaw : Math.floor(qtyRaw);
    const color = String(item?.color || "").trim();
    const size = String(item?.size || "").trim();
    const rawVariantKey = String(item?.variantKey || "").trim();
    const variantKey =
      rawVariantKey && rawVariantKey.includes("__")
        ? rawVariantKey
        : color && size
          ? `${color}__${size}`
          : "";
    if (!id || qty <= 0) return;

    const aggregateKey = `${id}::${variantKey || "base"}`;
    const existing = byId.get(aggregateKey);
    if (existing) {
      existing.qty += qty;
      return;
    }

    byId.set(aggregateKey, {
      id,
      qty,
      color: color || null,
      size: size || null,
      variantKey: variantKey || null
    });
  });

  return Array.from(byId.values());
}

function normalizeShipping(rawShipping: any) {
  if (!rawShipping || typeof rawShipping !== "object") return null;
  const value = (key: any) => String(rawShipping[key] || "").trim();
  return {
    fullName: value("fullName"),
    email: value("email"),
    phone: value("phone"),
    cpf: value("cpf"),
    cep: value("cep").replace(/\D/g, "").slice(0, 8),
    street: value("street"),
    number: value("number"),
    complement: value("complement"),
    district: value("district"),
    city: value("city"),
    state: value("state").toUpperCase().slice(0, 2),
    shippingMethod: value("shippingMethod"),
    shippingCost: Math.max(0, Number(rawShipping.shippingCost) || 0),
    shippingEstimate: value("shippingEstimate"),
    quoteId: String(rawShipping.quoteId || "").trim() || null
  };
}

function normalizeGuestCustomer(payload: any = {}) {
  const shipping = payload?.shipping || {};
  const customer = payload?.customer || {};
  const shippingAddress = payload?.shippingAddress || {};

  const firstName = String(customer.firstName || shipping.firstName || "").trim();
  const lastName = String(customer.lastName || shipping.lastName || "").trim();
  const fullName = String(shipping.fullName || [firstName, lastName].filter(Boolean).join(" ")).trim();

  return {
    firstName,
    lastName,
    fullName,
    email: normalizeEmail(customer.email || shipping.email || ""),
    phone: String(customer.phone || shipping.phone || "").trim(),
    cpf: String(customer.cpf || shipping.cpf || "").replace(/\D/g, "").slice(0, 11),
    shippingAddress: {
      cep: String(shipping.cep || shippingAddress.zip || "").replace(/\D/g, "").slice(0, 8),
      street: String(shipping.street || shippingAddress.street || "").trim(),
      number: String(shipping.number || shippingAddress.number || "").trim(),
      complement: String(shipping.complement || shippingAddress.complement || "").trim(),
      district: String(shipping.district || shippingAddress.district || "").trim(),
      city: String(shipping.city || shippingAddress.city || "").trim(),
      state: String(shipping.state || shippingAddress.state || "").trim().toUpperCase().slice(0, 2),
      country: String(shippingAddress.country || "BR").trim().toUpperCase().slice(0, 2) || "BR"
    }
  };
}

function generateCheckoutTempPassword() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = crypto.randomBytes(10).toString("base64url");
    if (candidate.length >= 8 && /[A-Za-z]/.test(candidate) && /\d/.test(candidate)) {
      return candidate;
    }
  }
  return `Tmp${Date.now().toString(36)}9A`;
}

function getShippingCostFromRules(shipping: any) {
  if (!shipping || !shipping.shippingMethod) return 0;
  if (shipping.shippingMethod === "company_emergency") return 5000;
  const cepDigits = String(shipping.cep || "").replace(/\D/g, "");
  const firstDigit = Number(cepDigits[0] || 0);
  let standard = 2900;
  let express = 4900;

  if (firstDigit <= 3) {
    standard = 2200;
    express = 3900;
  } else if (firstDigit >= 7) {
    standard = 3400;
    express = 5600;
  }

  if (shipping.shippingMethod === "standard") return standard;
  if (shipping.shippingMethod === "express") return express;
  return 0;
}

function isCompanyPaidShippingZip(value: any) {
  const zip = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (zip.length !== 8) return false;
  const prefix = Number(zip.slice(0, 5));
  if (!Number.isFinite(prefix)) return false;

  const isSaoPauloCapital = (prefix >= 1000 && prefix <= 5999) || (prefix >= 8000 && prefix <= 8499);
  const isOsasco = prefix >= 6000 && prefix <= 6299;
  return isSaoPauloCapital || isOsasco;
}

function normalizeItemsForComparison(items: any) {
  return (Array.isArray(items) ? items : [])
    .map((item: any) => ({
      id: String(item?.id || "").trim(),
      qty: Math.max(1, Number(item?.qty || 0)),
      unitAmount: Math.max(0, Number(item?.unitAmount || 0)),
      variantKey: String(item?.variantKey || "").trim()
    }))
    .filter((item: any) => item.id)
    .sort((a: any, b: any) => `${a.id}|${a.variantKey}`.localeCompare(`${b.id}|${b.variantKey}`));
}

function normalizeNewsletterPhone(value: any) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function sanitizeNewsletterSource(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-/.:]+/g, "-")
    .slice(0, 80);
}

function enqueueNewsletterWrite<T>(task: () => Promise<T>): Promise<T> {
  newsletterWriteQueue = newsletterWriteQueue.then(task, task);
  return newsletterWriteQueue as Promise<T>;
}

function parseBooleanEnv(value: any, fallback: any = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toSafeErrorMessage(error: any, fallback: any = "unknown_error") {
  const message = String(error?.message || "").trim();
  return message ? message.slice(0, 300) : fallback;
}

function logStripeLifecycle(event: any, details: any = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...details
  };
  try {
    // eslint-disable-next-line no-console
    console.log("[stripe]", JSON.stringify(payload));
  } catch {
    // eslint-disable-next-line no-console
    console.log("[stripe]", event);
  }
}

/**
 * @param {import("stripe").Stripe.Event} event
 * @returns {boolean}
 */
function isPaymentIntentEvent(event: any) {
  return String(event?.type || "").startsWith("payment_intent.");
}

/**
 * @param {import("stripe").Stripe.Event} event
 * @param {unknown} stripeObject
 * @returns {string}
 */
function extractPaymentIntentIdFromWebhook(event: any, stripeObject: any) {
  if (!stripeObject || typeof stripeObject !== "object") return "";
  if (event.type === "charge.refunded") {
    return typeof stripeObject.payment_intent === "string" ? stripeObject.payment_intent.trim() : "";
  }
  if (isPaymentIntentEvent(event)) {
    return typeof stripeObject.id === "string" ? stripeObject.id.trim() : "";
  }
  return "";
}

function getMelhorEnvioSyncIntervalMs() {
  const rawMinutes = Number(process.env.MELHORENVIO_SYNC_INTERVAL_MINUTES || 45);
  const minutes = Number.isFinite(rawMinutes) ? rawMinutes : 45;
  const bounded = Math.max(30, Math.min(60, Math.round(minutes)));
  return bounded * 60 * 1000;
}

async function runScheduledMelhorEnvioSync() {
  try {
    const result = await syncMelhorEnvioTrackingJob({ limit: 150 });
    // eslint-disable-next-line no-console
    console.log("[melhorenvio-sync] completed", result);
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("[melhorenvio-sync] failed", String(error?.message || "unknown_error"));
  }
}

function startMelhorEnvioSyncScheduler() {
  if (isVercelRuntime) return;
  if (parseBooleanEnv(process.env.MELHORENVIO_SYNC_DISABLE_AUTO, false)) return;
  if (melhorEnvioSyncTimer) return;

  const intervalMs = getMelhorEnvioSyncIntervalMs();
  melhorEnvioSyncTimer = setInterval(() => {
    runScheduledMelhorEnvioSync();
  }, intervalMs);

  if (typeof melhorEnvioSyncTimer.unref === "function") {
    melhorEnvioSyncTimer.unref();
  }

  if (parseBooleanEnv(process.env.MELHORENVIO_SYNC_RUN_ON_BOOT, false)) {
    runScheduledMelhorEnvioSync();
  }
}

function areSameItemSet(a: any, b: any) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!right) return false;
    if (
      left.id !== right.id ||
      left.qty !== right.qty ||
      left.unitAmount !== right.unitAmount ||
      String(left.variantKey || "") !== String(right.variantKey || "")
    ) {
      return false;
    }
  }
  return true;
}

function isReusableOrderStatus(status: any) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "pending_payment" || normalized === "processing";
}

async function findReusableCheckoutOrder({
  userId,
  paymentMethod,
  installments,
  itemsAmount,
  shippingAmount,
  orderAmount,
  shipping,
  resolvedItems
}: any) {
  const orders = await listOrdersByUserId(userId);
  const now = Date.now();
  const requestedItems = normalizeItemsForComparison(resolvedItems);
  const expectedShippingZip = String(shipping?.cep || "").replace(/\D/g, "").slice(0, 8);
  const expectedShippingMethod = String(shipping?.shippingMethod || "").trim().toLowerCase();

  for (const order of orders) {
    if (!order || !isReusableOrderStatus(order.status)) continue;
    if (now - new Date(order.createdAt || 0).getTime() > 30 * 60 * 1000) continue;
    if (String(order.paymentMethod || "automatic") !== String(paymentMethod || "automatic")) continue;
    if (Math.max(1, Number(order.installments || 1)) !== Math.max(1, Number(installments || 1))) continue;
    if (Number(order.itemsAmount || 0) !== Number(itemsAmount || 0)) continue;
    if (Number(order.shippingAmount || 0) !== Number(shippingAmount || 0)) continue;
    if (Number(order.amount || 0) !== Number(orderAmount || 0)) continue;

    const orderShippingZip = String(order.shippingDestinationZip || order?.shipping?.cep || "")
      .replace(/\D/g, "")
      .slice(0, 8);
    const orderShippingMethod = String(order?.shipping?.shippingMethod || "").trim().toLowerCase();
    if (expectedShippingZip && orderShippingZip !== expectedShippingZip) continue;
    if (expectedShippingMethod && orderShippingMethod !== expectedShippingMethod) continue;

    const orderItems = normalizeItemsForComparison(order.items);
    if (!areSameItemSet(orderItems, requestedItems)) continue;
    return order;
  }

  return null;
}

async function getReusablePaymentIntentClientSecret(order: any, expectedAmount: any) {
  if (!stripe || !order?.stripePaymentIntentId) return null;
  const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
  const status = String(intent?.status || "").toLowerCase();
  const amount = Number(intent?.amount || 0);
  if (amount !== Math.max(0, Number(expectedAmount || 0))) return null;

  if (
    status === "requires_payment_method" ||
    status === "requires_confirmation" ||
    status === "requires_action" ||
    status === "processing"
  ) {
    const clientSecret = String(intent?.client_secret || "").trim() || null;
    if (!clientSecret) return null;
    return {
      clientSecret,
      paymentMethodTypes: Array.isArray(intent?.payment_method_types)
        ? intent.payment_method_types.map((entry: any) => String(entry || "").trim().toLowerCase()).filter(Boolean)
        : []
    };
  }

  return null;
}

async function markOrderPaid(order: any) {
  if (!order) return order;
  if (order.status === "paid" && order.stockCommitted) return order;

  const stockResult = await commitStock(order.items || [], { orderId: order.id, reason: "order_paid" });
  if (!stockResult.ok) {
    return updateOrder(order.id, {
      status: "failed",
      failureReason: "stock_unavailable_after_payment",
      stockIssues: stockResult.issues,
      paidAt: new Date().toISOString()
    });
  }

  return updateOrder(order.id, {
    status: "paid",
    stockCommitted: true,
    paidAt: new Date().toISOString()
  });
}

async function markOrderFailed(order: any, reason: any) {
  if (!order) return order;
  return updateOrder(order.id, {
    status: "failed",
    failureReason: reason || "payment_failed"
  });
}

async function markOrderCanceled(order: any, reason: any) {
  if (!order) return order;
  return updateOrder(order.id, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
    cancellationReason: reason || "canceled_by_customer"
  });
}

async function markOrderRefunded(order: any, stripeRefundId: any) {
  if (!order) return order;
  return updateOrder(order.id, {
    status: "refunded",
    refundedAt: new Date().toISOString(),
    stripeRefundId: stripeRefundId || order.stripeRefundId || null
  });
}

async function reconcileOrderWithStripe(order: any) {
  if (!stripe || !order?.stripePaymentIntentId) return order;
  if (["failed", "canceled", "refunded"].includes(order.status)) return order;

  const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
  const status = String(intent?.status || "").toLowerCase();

  if (status === "succeeded") {
    const updated = await markOrderPaid(order);
    if (String(order.status || "").toLowerCase() !== "paid" && String(updated?.status || "").toLowerCase() === "paid") {
      notifyPaymentApproved(updated).catch(() => {});
    }
    return updated;
  }

  if (status === "canceled") {
    return markOrderCanceled(order, intent?.cancellation_reason || "canceled");
  }

  if (status === "processing") {
    return updateOrder(order.id, { status: "processing" });
  }

  if (status === "requires_payment_method" || status === "requires_confirmation" || status === "requires_action") {
    return updateOrder(order.id, { status: "pending_payment" });
  }

  return order;
}

async function tryRegisterWebhookEvent(client: any, event: any) {
  const result = await client.query(
    `
    INSERT INTO webhook_events (stripe_event_id, event_type)
    VALUES ($1, $2)
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING id
    `,
    [event.id, event.type]
  );

  return result.rowCount > 0;
}

async function findOrderForWebhook(client: any, metadataOrderId: any, paymentIntentId: any) {
  if (metadataOrderId) {
    const byId = await client.query(`SELECT id FROM orders WHERE id = $1 LIMIT 1`, [metadataOrderId]);
    if (byId.rowCount > 0) return byId.rows[0].id;
  }

  if (paymentIntentId) {
    const byIntent = await client.query(
      `SELECT id FROM orders WHERE stripe_payment_intent_id = $1 LIMIT 1`,
      [paymentIntentId]
    );
    if (byIntent.rowCount > 0) return byIntent.rows[0].id;
  }

  return null;
}

async function fetchOrderWithItemsInTx(client: any, orderId: any) {
  const orderResult = await client.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
  if (orderResult.rowCount === 0) return null;

  const order = orderResult.rows[0];
  const itemsResult = await client.query(
    `
    SELECT product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key
    FROM order_items
    WHERE order_id = $1
    `,
    [orderId]
  );

  return {
    id: order.id,
    status: order.status,
    stockCommitted: Boolean(order.stock_committed),
    items: itemsResult.rows.map((item: any) => ({
      id: item.product_sku || item.product_id,
      name: item.name,
      qty: Number(item.qty || 0),
      unitAmount: Number(item.price_cents || 0),
      currency: item.currency,
      variantColor: item.variant_color || null,
      variantSize: item.variant_size || null,
      variantKey: item.variant_key || null
    }))
  };
}

/**
 * @param {import("stripe").Stripe.Event} event
 * @returns {Promise<void>}
 */
async function processWebhookEvent(event: any) {
  const stripeObject = event.data?.object || null;
  if (!stripeObject) {
    logStripeLifecycle("webhook_ignored", {
      webhookEventId: event?.id || null,
      eventType: event?.type || null,
      reason: "missing_data_object"
    });
    return;
  }

  const metadataOrderId = stripeObject.metadata?.orderId || null;
  const paymentIntentId = extractPaymentIntentIdFromWebhook(event, stripeObject);
  const webhookContext: {
    webhookEventId: string;
    eventType: string;
    paymentIntentId: string | null;
    orderId: string | null;
    outcome: "ignored" | "duplicate" | "order_updated" | "noop";
    reason: string | null;
    statusFrom: string | null;
    statusTo: string | null;
  } = {
    webhookEventId: event.id,
    eventType: event.type,
    paymentIntentId: paymentIntentId || null,
    orderId: null,
    outcome: "ignored",
    reason: null,
    statusFrom: null,
    statusTo: null
  };
  logStripeLifecycle("webhook_received", {
    webhookEventId: webhookContext.webhookEventId,
    eventType: webhookContext.eventType,
    paymentIntentId: webhookContext.paymentIntentId
  });
  const pendingNotifications: any[] = [];

  await withTransaction(async (client: any) => {
    const isNewEvent = await tryRegisterWebhookEvent(client, event);
    if (!isNewEvent) {
      webhookContext.outcome = "duplicate";
      webhookContext.reason = "event_already_processed";
      return;
    }

    const orderId = await findOrderForWebhook(client, metadataOrderId, paymentIntentId);
    if (!orderId) {
      webhookContext.outcome = "ignored";
      webhookContext.reason = "order_not_found";
      return;
    }
    webhookContext.orderId = orderId;

    const order = await fetchOrderWithItemsInTx(client, orderId);
    if (!order) {
      webhookContext.outcome = "ignored";
      webhookContext.reason = "order_row_missing";
      return;
    }

    const previousStatus = String(order.status || "").toLowerCase();

    if (event.type === "payment_intent.succeeded") {
      if (order.status === "paid" && order.stockCommitted) {
        webhookContext.outcome = "noop";
        webhookContext.reason = "already_paid";
        webhookContext.statusFrom = previousStatus;
        webhookContext.statusTo = "paid";
        return;
      }

      if (!order.stockCommitted) {
        const stockResult = await commitStock(order.items || [], {
          client,
          orderId: order.id,
          reason: "order_paid"
        });

        if (!stockResult.ok) {
          await client.query(
            `
            UPDATE orders
            SET status = 'failed',
                failure_reason = $2,
                stock_issues = $3::jsonb,
                stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $4),
                updated_at = NOW()
            WHERE id = $1
            `,
            [order.id, "stock_unavailable_after_payment", JSON.stringify(stockResult.issues || []), paymentIntentId || null]
          );
          webhookContext.outcome = "order_updated";
          webhookContext.reason = "stock_commit_failed";
          webhookContext.statusFrom = previousStatus;
          webhookContext.statusTo = "failed";
          return;
        }
      }

      await client.query(
        `
        UPDATE orders
        SET status = 'paid',
            stock_committed = true,
            paid_at = COALESCE(paid_at, NOW()),
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2),
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, paymentIntentId || null]
      );
      webhookContext.outcome = "order_updated";
      webhookContext.statusFrom = previousStatus;
      webhookContext.statusTo = "paid";
      if (previousStatus !== "processing" && previousStatus !== "paid") {
        pendingNotifications.push({ type: "payment_confirmed", orderId: order.id });
      }
      pendingNotifications.push({ type: "payment_approved", orderId: order.id });
      return;
    }

    if (event.type === "payment_intent.processing") {
      await client.query(
        `UPDATE orders SET status = 'processing', stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2), updated_at = NOW() WHERE id = $1`,
        [order.id, paymentIntentId || null]
      );
      webhookContext.outcome = "order_updated";
      webhookContext.statusFrom = previousStatus;
      webhookContext.statusTo = "processing";
      if (previousStatus !== "processing" && previousStatus !== "paid") {
        pendingNotifications.push({ type: "payment_confirmed", orderId: order.id });
      }
      return;
    }

    if (event.type === "payment_intent.payment_failed") {
      await client.query(
        `
        UPDATE orders
        SET status = 'failed',
            failure_reason = $2,
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, stripeObject.last_payment_error?.message || event.type, paymentIntentId || null]
      );
      webhookContext.outcome = "order_updated";
      webhookContext.statusFrom = previousStatus;
      webhookContext.statusTo = "failed";
      return;
    }

    if (event.type === "payment_intent.canceled") {
      await client.query(
        `
        UPDATE orders
        SET status = 'canceled',
            canceled_at = NOW(),
            cancellation_reason = $2,
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, stripeObject.cancellation_reason || "canceled", paymentIntentId || null]
      );
      webhookContext.outcome = "order_updated";
      webhookContext.statusFrom = previousStatus;
      webhookContext.statusTo = "canceled";
      return;
    }

    if (event.type === "charge.refunded") {
      const refundId = stripeObject.refunds?.data?.[0]?.id || null;
      await client.query(
        `
        UPDATE orders
        SET status = 'refunded',
            refunded_at = NOW(),
            stripe_refund_id = COALESCE($2, stripe_refund_id),
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, refundId, paymentIntentId || null]
      );
      webhookContext.outcome = "order_updated";
      webhookContext.statusFrom = previousStatus;
      webhookContext.statusTo = "refunded";
      return;
    }

    webhookContext.outcome = "ignored";
    webhookContext.reason = "unsupported_event_type";
  });

  if (
    webhookContext.outcome === "order_updated" &&
    webhookContext.statusFrom &&
    webhookContext.statusTo &&
    webhookContext.statusFrom !== webhookContext.statusTo
  ) {
    logStripeLifecycle("order_status_changed", {
      orderId: webhookContext.orderId,
      from: webhookContext.statusFrom,
      to: webhookContext.statusTo,
      source: "stripe_webhook",
      webhookEventId: webhookContext.webhookEventId,
      paymentIntentId: webhookContext.paymentIntentId
    });
  }
  logStripeLifecycle("webhook_processed", webhookContext);

  for (const notification of pendingNotifications) {
    if (notification.type !== "payment_approved" && notification.type !== "payment_confirmed") continue;
    try {
      const order = await findOrderById(notification.orderId);
      if (!order) continue;
      const currentStatus = String(order.status || "").toLowerCase();
      if (notification.type === "payment_confirmed" && (currentStatus === "processing" || currentStatus === "paid")) {
        await notifyOrderConfirmed(order);
        sendOrderConfirmedWhatsApp(order).catch(() => {});
        continue;
      }
      if (notification.type === "payment_approved" && currentStatus === "paid") {
        await notifyPaymentApproved(order);
      }
    } catch (error: any) {
      logStripeLifecycle("webhook_notification_failed", {
        webhookEventId: webhookContext.webhookEventId,
        orderId: notification.orderId,
        notificationType: notification.type,
        error: toSafeErrorMessage(error)
      });
    }
  }
}

app.use(
  cors({
    origin: (requestOrigin: any, callback: any) => {
      const allowedOrigins = parseAllowedCorsOrigins();
      if (!requestOrigin) return callback(null, true);
      if (allowedOrigins.includes(String(requestOrigin))) return callback(null, true);
      return callback(null, false);
    },
    credentials: true
  })
);
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(compression());
app.use(createSessionMiddleware());

app.post(
  "/api/stripe/webhook",
  webhookRateLimit,
  express.raw({ type: "application/json" }),
  /**
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   */
  async (req: any, res: any) => {
    if (!stripe || !stripeWebhookSecret) {
      return res.status(500).json({ error: "Stripe webhook not configured." });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature header." });
    }

    /** @type {import("stripe").Stripe.Event} */
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
    } catch (error: any) {
      logStripeLifecycle("webhook_signature_verification_failed", {
        error: toSafeErrorMessage(error)
      });
      return res.status(400).json({ error: `Invalid webhook signature: ${error.message}` });
    }

    try {
      await processWebhookEvent(event);
      return res.json({ received: true });
    } catch (error: any) {
      logStripeLifecycle("webhook_processing_failed", {
        webhookEventId: event?.id || null,
        eventType: event?.type || null,
        error: toSafeErrorMessage(error)
      });
      return res.status(500).json({ error: "Failed to process webhook." });
    }
  }
);

app.use(express.json());
app.use(
  "/images",
  express.static(path.resolve(process.cwd(), "images"), {
    fallthrough: false
  })
);

app.use("/api/auth", attachUserCsrfToken, requireUserCsrfForMutations, authRouter);
app.use("/api/my", attachUserCsrfToken, requireUserCsrfForMutations, myRouter);
app.use("/api/studio-auth", studioAuthRouter);
app.use("/api/vip", vipRouter);
app.use("/api", shippingRouter);
app.use("/api", orderTrackingRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin", adminShippingRouter);
app.use("/api/admin", adminWhatsAppRouter);

app.get("/api/products", async (req: any, res: any) => {
  try {
    const products = await listProducts();
    return res.json(products);
  } catch {
    return res.status(500).json({ error: "Failed to load products." });
  }
});

app.get("/api/products/recent", async (req: any, res: any) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((id: any) => String(id || "").trim())
      .filter(Boolean);
    if (!ids.length) return res.json({ products: [] });

    const products = await listProducts();
    const byId = new Map(products.map((item: any) => [String(item.id), item]));
    const unique: any[] = [];
    const seen = new Set();
    ids.forEach((id: any) => {
      if (seen.has(id)) return;
      const item = byId.get(id);
      if (!item) return;
      seen.add(id);
      unique.push(item);
    });
    return res.json({ products: unique });
  } catch {
    return res.status(500).json({ error: "Failed to load recent products." });
  }
});

function buildSimilarProducts(target: any, products: any, limit: any = 4) {
  const safeLimit = Math.max(1, Math.min(12, Number(limit || 4)));
  const pool = (products || []).filter((item: any) => item && item.id !== target.id);
  const sameCollection = pool.filter((item: any) => item.collection === target.collection);
  const sameCategory = pool.filter((item: any) => item.category === target.category);
  const merged = [
    ...sameCollection,
    ...sameCategory,
    ...pool
  ];
  const unique: any[] = [];
  const seen = new Set();
  for (const item of merged) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= safeLimit) break;
  }
  return unique;
}

app.get("/api/products/:id", async (req: any, res: any) => {
  try {
    const product = await getProductByIdentifier(req.params.id);
    if (!product || product.active === false) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }
    return res.json(product);
  } catch {
    return res.status(500).json({ error: "Failed to load product." });
  }
});

app.get("/api/products/:id/recommendations", async (req: any, res: any) => {
  try {
    const product = await getProductByIdentifier(req.params.id);
    if (!product || product.active === false) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }
    const products = await listProducts();
    const limit = Number(req.query.limit || 4);
    const similar = buildSimilarProducts(product, products, limit);
    return res.json({ base: product, recommendations: similar });
  } catch {
    return res.status(500).json({ error: "Failed to load recommendations." });
  }
});

app.get("/api/config", (req: any, res: any) => {
  res.json({
    stripePublishableKey,
    currency: "brl",
    maxInstallments: 6,
    posthog: posthogPublicKey
      ? {
          key: posthogPublicKey,
          host: normalizePosthogHost(posthogHost)
        }
      : null
  });
});

app.post("/api/discount-codes/apply", async (req: any, res: any) => {
  const code = String(req.body?.code || "").trim();
  const subtotalCents = Math.max(0, Math.floor(Number(req.body?.subtotalCents || 0)));
  const shippingCents = Math.max(0, Math.floor(Number(req.body?.shippingCents || 0)));

  if (!code) return res.status(400).json({ ok: false, error: "INVALID_CODE" });

  try {
    const result = await evaluateAccessCode({
      code,
      subtotalCents,
      shippingCents
    });

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error || "CODE_NOT_APPLICABLE" });
    }

    return res.json({
      ok: true,
      code: result.entry.code,
      discountCents: result.discountCents,
      subtotalCents: result.subtotalCents,
      shippingCents: result.shippingCents,
      totalCents: result.totalCents,
      type: result.entry.type,
      percentOff: result.entry.percentOff,
      amountOffCents: result.entry.amountOffCents
    });
  } catch {
    return res.status(500).json({ ok: false, error: "ACCESS_CODE_EVALUATION_FAILED" });
  }
});

app.post("/api/newsletter/subscribe", newsletterSubscribeRateLimit, async (req: any, res: any) => {
  const parsed = newsletterSubscribeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  if (!parsed.data.consent) {
    return res.status(400).json({ ok: false, error: "CONSENT_REQUIRED" });
  }

  const now = new Date().toISOString();
  const email = normalizeEmail(parsed.data.email);
  const source = sanitizeNewsletterSource(parsed.data.source || "footer");
  const page = String(parsed.data.page || "").trim().slice(0, 200);
  const phone = normalizeNewsletterPhone(parsed.data.phone || "");
  const ipAddress = String(req.headers["x-forwarded-for"] || req.ip || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);
  const userAgent = String(req.headers["user-agent"] || "").trim().slice(0, 300);

  try {
    const result = await enqueueNewsletterWrite(async () => {
      const list = await readJson(newsletterDataFile, []);
      const safeList = Array.isArray(list) ? list : [];
      const existingIndex = safeList.findIndex((entry: any) => normalizeEmail(entry?.email || "") === email);
      const previous = existingIndex >= 0 ? safeList[existingIndex] : null;

      const record = {
        email,
        phone: phone || String(previous?.phone || ""),
        source: source || String(previous?.source || "footer"),
        page: page || String(previous?.page || ""),
        consent: true,
        subscribedAt: String(previous?.subscribedAt || now),
        updatedAt: now,
        status: "active",
        lastIp: ipAddress || String(previous?.lastIp || ""),
        lastUserAgent: userAgent || String(previous?.lastUserAgent || "")
      };

      if (existingIndex >= 0) {
        safeList[existingIndex] = record;
      } else {
        safeList.unshift(record);
      }

      await writeJson(newsletterDataFile, safeList);
      return { created: existingIndex < 0 };
    });

    return res.status(result.created ? 201 : 200).json({
      ok: true,
      created: result.created,
      message: result.created ? "SUBSCRIBED" : "ALREADY_SUBSCRIBED"
    });
  } catch {
    return res.status(500).json({ ok: false, error: "NEWSLETTER_SUBSCRIBE_FAILED" });
  }
});

app.post(
  "/api/orders/payment-intent",
  paymentIntentRateLimit,
  /**
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   */
  async (req: any, res: any) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." });
  }

  try {
  const parsed = paymentIntentSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const paymentMethod = parsed.data.paymentMethod;
  const requestedDiscountCode = String(parsed.data.discountCode || "").trim();
  const installments = parsed.data.installments;
  const normalizedItems = normalizeAndAggregateItems(parsed.data.items);
  const shipping = normalizeShipping(parsed.data.shipping || null);
  const sessionUserId = req.session?.userId ? String(req.session.userId) : "";
  let checkoutUser = sessionUserId ? await findUserById(sessionUserId) : null;
  const guest = normalizeGuestCustomer(parsed.data);

  if (!checkoutUser) {
    const hasRequiredGuestData =
      guest.email &&
      guest.fullName &&
      guest.phone &&
      guest.shippingAddress.cep &&
      guest.shippingAddress.street &&
      guest.shippingAddress.number &&
      guest.shippingAddress.district &&
      guest.shippingAddress.city &&
      guest.shippingAddress.state;

    if (!hasRequiredGuestData) {
      return res.status(400).json({ error: "GUEST_CHECKOUT_CUSTOMER_REQUIRED" });
    }

    const upsertedGuest = await upsertCheckoutGuestUser({
      name: guest.fullName,
      email: guest.email,
      phone: guest.phone,
      cpf: guest.cpf,
      cep: guest.shippingAddress.cep,
      shippingAddress: guest.shippingAddress
    });

    if (!upsertedGuest.ok || !upsertedGuest.user) {
      return res.status(409).json({ error: upsertedGuest.error || "GUEST_CHECKOUT_USER_FAILED" });
    }
    checkoutUser = upsertedGuest.user;
    if (!checkoutUser.passwordHash) {
      try {
        const tempPassword = generateCheckoutTempPassword();
        const tempPasswordHash = await bcrypt.hash(tempPassword, 12);
        const updatedGuest = await setGuestTempPasswordIfMissing(checkoutUser.id, tempPasswordHash);
        if (updatedGuest) {
          checkoutUser = updatedGuest;
          sendGuestCheckoutAccountCreatedEmail({
            to: checkoutUser.email || guest.email || "",
            fullName: checkoutUser.name || guest.fullName || "",
            tempPassword
          }).catch(() => {});
        }
      } catch {}
    }
  }
  const checkoutMode = sessionUserId && checkoutUser?.id && String(checkoutUser.id) === sessionUserId ? "account" : "guest";

  if (normalizedItems.length === 0) {
    return res.status(400).json({ error: "Cart is empty." });
  }

  const availability = await checkAvailability(normalizedItems);
  if (!availability.ok) {
    return res.status(409).json({
      error: "Invalid cart. Price or stock changed.",
      issues: availability.issues
    });
  }

  const itemsAmount = availability.resolvedItems.reduce((sum: any, item: any) => sum + item.unitAmount * item.qty, 0);
  let shippingAmount = getShippingCostFromRules(shipping);
  let selectedShippingQuote: any = null;
  let quotedShippingCents = Math.max(0, Number(shippingAmount || 0));
  let companyPaidByStore = false;
  let companyPaidShippingCents = 0;
  if (shipping?.quoteId) {
    try {
      selectedShippingQuote = await resolveQuoteForCheckout({
        quoteId: shipping.quoteId,
        userId: checkoutUser.id,
        destinationZip: shipping.cep
      });
      quotedShippingCents = Math.max(0, Number(selectedShippingQuote.priceCents || 0));
      shippingAmount = quotedShippingCents;
    } catch (error: any) {
      const status = Number(error?.status || 0) || 409;
      return res.status(Math.max(400, Math.min(500, status))).json({
        error: String(error?.code || "SHIPPING_QUOTE_INVALID")
      });
    }
  }

  const shippingDestinationZip = shipping?.cep || selectedShippingQuote?.destinationZip || "";
  if (selectedShippingQuote && isCompanyPaidShippingZip(shippingDestinationZip)) {
    companyPaidByStore = true;
    companyPaidShippingCents = quotedShippingCents;
    shippingAmount = 0;
  }
  if (!selectedShippingQuote && shipping?.shippingMethod === "company_today" && isCompanyPaidShippingZip(shippingDestinationZip)) {
    companyPaidByStore = true;
    companyPaidShippingCents = 0;
    shippingAmount = 0;
  }

  let discountAmount = 0;
  if (requestedDiscountCode) {
    const discountResult = await evaluateAccessCode({
      code: requestedDiscountCode,
      subtotalCents: itemsAmount,
      shippingCents: shippingAmount
    });
    if (!discountResult.ok) {
      return res.status(400).json({ error: discountResult.error || "CODE_NOT_APPLICABLE" });
    }
    discountAmount = Math.max(0, Number(discountResult.discountCents || 0));
  }

  const orderAmount = Math.max(0, itemsAmount + shippingAmount - discountAmount);
  const currency = "brl";

  try {
    const reusableOrder = await findReusableCheckoutOrder({
      userId: checkoutUser.id,
      paymentMethod,
      installments,
      itemsAmount,
      shippingAmount,
      orderAmount,
      shipping,
      resolvedItems: availability.resolvedItems
    });

    if (reusableOrder) {
      const reusablePayment = await getReusablePaymentIntentClientSecret(reusableOrder, orderAmount);
      if (reusablePayment?.clientSecret) {
        logStripeLifecycle("payment_intent_reused", {
          orderId: reusableOrder.id,
          paymentIntentId: reusableOrder.stripePaymentIntentId || null,
          amountCents: orderAmount,
          currency
        });
        return res.status(200).json({
          orderId: reusableOrder.id,
          orderNumber: reusableOrder.orderNumber || "",
          customerEmail: reusableOrder.userEmail || checkoutUser.email || guest.email || "",
          clientSecret: reusablePayment.clientSecret,
          paymentIntentClientSecret: reusablePayment.clientSecret,
          paymentMethodTypes: reusablePayment.paymentMethodTypes || []
        });
      }
    }
  } catch {}

  let order = await createOrder({
    status: "pending_payment",
    paymentMethod,
    installments,
    currency,
    amount: orderAmount,
    itemsAmount,
    shippingAmount,
    items: availability.resolvedItems,
    shipping: shipping
      ? {
          ...shipping,
          discountCode: requestedDiscountCode || "",
          discountCents: discountAmount,
          shippingCost: shippingAmount / 100,
          quotedShippingCents,
          companyPaidByStore,
          companyPaidShippingCents,
          selectedProvider: selectedShippingQuote?.provider || "",
          selectedService: selectedShippingQuote?.serviceName || "",
          selectedServiceCode: selectedShippingQuote?.serviceCode || "",
          selectedCarrierName: selectedShippingQuote?.carrierName || "",
          shippingDeadlineDays: selectedShippingQuote?.deadlineDays == null ? null : selectedShippingQuote?.deadlineDays
        }
      : null,
    shippingPriceCents: shippingAmount,
    shippingSelectedProvider: selectedShippingQuote?.provider || "",
    shippingSelectedService: selectedShippingQuote?.serviceName || "",
    shippingSelectedServiceCode: selectedShippingQuote?.serviceCode || "",
    shippingSelectedCarrierName: selectedShippingQuote?.carrierName || "",
    shippingDeadlineDays: selectedShippingQuote?.deadlineDays == null ? null : selectedShippingQuote?.deadlineDays,
    shippingDestinationZip: shipping?.cep || selectedShippingQuote?.destinationZip || "",
    userId: checkoutUser.id,
    userEmail: checkoutUser.email || guest.email || null,
    userName: checkoutUser.name || guest.fullName || null
  });

  if (selectedShippingQuote?.id && !companyPaidByStore) {
    try {
      const selected = await selectShippingForOrder({
        orderId: order.id,
        userId: checkoutUser.id,
        quoteId: selectedShippingQuote.id,
        destinationZip: shipping?.cep || ""
      });
      if (selected?.order) {
        order = selected.order;
      }
    } catch (error: any) {
      await updateOrder(order.id, {
        status: "failed",
        failureReason: String(error?.code || "SHIPPING_SELECT_FAILED")
      });
      const status = Number(error?.status || 0) || 409;
      return res.status(Math.max(400, Math.min(500, status))).json({
        error: String(error?.code || "SHIPPING_SELECT_FAILED")
      });
    }
  }

  /** @type {import("stripe").Stripe.PaymentIntentCreateParams} */
  const paymentIntentParams: any = {
    amount: Math.max(0, Number(order?.amount || orderAmount)),
    currency,
    metadata: {
      orderId: String(order.id || ""),
      orderNumber: String(order.orderNumber || ""),
      userId: String(checkoutUser?.id || ""),
      checkoutMode
    },
    automatic_payment_methods: {
      enabled: true
    }
  };

  if (paymentMethod === "card") {
    paymentIntentParams.payment_method_options = {
      card: {
        installments: {
          enabled: true
        }
      }
    };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    const updatedOrder = await updateOrder(order.id, {
      stripePaymentIntentId: paymentIntent.id
    });
    logStripeLifecycle("payment_intent_created", {
      orderId: updatedOrder.id,
      amountCents: Math.max(0, Number(updatedOrder.amount || orderAmount)),
      currency,
      paymentIntentId: paymentIntent.id,
      checkoutMode
    });

    return res.status(201).json({
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber || "",
      customerEmail: updatedOrder.userEmail || checkoutUser.email || guest.email || "",
      clientSecret: paymentIntent.client_secret,
      paymentIntentClientSecret: paymentIntent.client_secret,
      paymentMethodTypes: Array.isArray(paymentIntent.payment_method_types)
        ? paymentIntent.payment_method_types.map((entry: any) => String(entry || "").trim().toLowerCase()).filter(Boolean)
        : []
    });
  } catch (error: any) {
    await updateOrder(order.id, {
      status: "failed",
      failureReason: error.message || "Failed to create PaymentIntent"
    });
    logStripeLifecycle("payment_intent_create_failed", {
      orderId: order.id,
      amountCents: Math.max(0, Number(order?.amount || orderAmount)),
      currency,
      error: toSafeErrorMessage(error)
    });
    return res.status(400).json({ error: error.message || "Failed to create PaymentIntent." });
  }
  } catch (error: any) {
    const safeMessage = toSafeErrorMessage(error) || "Unexpected payment intent failure.";
    logStripeLifecycle("payment_intent_unhandled_error", {
      error: safeMessage
    });
    return res.status(500).json({
      error: "PAYMENT_INTENT_INTERNAL_ERROR",
      message: safeMessage
    });
  }
  }
);

app.get("/api/orders/:orderId", async (req: any, res: any) => {
  const order = await findOrderById(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const sessionUserId = req.session?.userId ? String(req.session.userId) : "";
  const requestedEmail = normalizeEmail(req.query?.email || "");
  const orderEmail = normalizeEmail(order.userEmail || "");
  const hasSessionAccess = Boolean(sessionUserId && String(order.userId || "") === sessionUserId);
  const hasEmailAccess = Boolean(requestedEmail && orderEmail && requestedEmail === orderEmail);
  if (!hasSessionAccess && !hasEmailAccess) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  try {
    const reconciled = await reconcileOrderWithStripe(order);
    return res.json(reconciled || order);
  } catch {
    return res.json(order);
  }
});

const isMainModule = typeof require !== "undefined" && require.main === module;
if (isMainModule && !isVercelRuntime) {
  startMelhorEnvioSyncScheduler();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TSEBI server running on http://localhost:${port}`);
  });
}
