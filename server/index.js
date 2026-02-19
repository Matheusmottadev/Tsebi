const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const dotenv = require("dotenv");
const Stripe = require("stripe");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { createSessionMiddleware } = require("./session");
const { authRouter, myRouter } = require("./auth");
const { studioAuthRouter } = require("./studio-auth");
const { vipRouter } = require("./vip");
const { adminRouter } = require("./admin");
const { findUserById } = require("./user-repository");
const { requireAuth } = require("./middlewares/requireAuth");
const {
  createOrder,
  updateOrder,
  findOrderById,
  listOrdersByUserId
} = require("./lib/order-repository");
const { notifyOrderConfirmed, notifyPaymentApproved } = require("./lib/order-notification-service");
const { listProducts, getProductByIdentifier } = require("./lib/product-repository");
const { checkAvailability, commitStock } = require("./lib/inventory-repository");
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

const app = express();
const port = Number(process.env.PORT) || 4242;
const isVercelRuntime =
  String(process.env.VERCEL || "").trim() === "1" ||
  String(process.env.VERCEL || "").trim().toLowerCase() === "true";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const posthogPublicKey = process.env.POSTHOG_PUBLIC_KEY || "";
const posthogHost = process.env.POSTHOG_HOST || "";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
let melhorEnvioSyncTimer = null;

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

const paymentIntentSchema = z.object({
  paymentMethod: z.string().trim().optional().default("automatic"),
  installments: z.coerce.number().int().min(1).max(6).optional().default(1),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        qty: z.coerce.number().int().min(1).max(999)
      })
    )
    .min(1),
  shipping: z
    .object({
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
    .optional()
});

function normalizeAndAggregateItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const byId = new Map();

  rawItems.forEach((item) => {
    const id = item && typeof item.id === "string" ? item.id.trim() : "";
    const qtyRaw = item ? Number(item.qty) : 0;
    const qty = Number.isInteger(qtyRaw) ? qtyRaw : Math.floor(qtyRaw);
    if (!id || qty <= 0) return;
    byId.set(id, (byId.get(id) || 0) + qty);
  });

  return Array.from(byId.entries()).map(([id, qty]) => ({ id, qty }));
}

function normalizeShipping(rawShipping) {
  if (!rawShipping || typeof rawShipping !== "object") return null;
  const value = (key) => String(rawShipping[key] || "").trim();
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

function getShippingCostFromRules(shipping) {
  if (!shipping || !shipping.shippingMethod) return 0;
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

function normalizeItemsForComparison(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id || "").trim(),
      qty: Math.max(1, Number(item?.qty || 0)),
      unitAmount: Math.max(0, Number(item?.unitAmount || 0))
    }))
    .filter((item) => item.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function parseBooleanEnv(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
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
  } catch (error) {
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

function areSameItemSet(a, b) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!right) return false;
    if (left.id !== right.id || left.qty !== right.qty || left.unitAmount !== right.unitAmount) return false;
  }
  return true;
}

function isReusableOrderStatus(status) {
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
}) {
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

async function getReusablePaymentIntentClientSecret(order, expectedAmount) {
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
    return String(intent?.client_secret || "").trim() || null;
  }

  return null;
}

async function markOrderPaid(order) {
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

async function markOrderFailed(order, reason) {
  if (!order) return order;
  return updateOrder(order.id, {
    status: "failed",
    failureReason: reason || "payment_failed"
  });
}

async function markOrderCanceled(order, reason) {
  if (!order) return order;
  return updateOrder(order.id, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
    cancellationReason: reason || "canceled_by_customer"
  });
}

async function markOrderRefunded(order, stripeRefundId) {
  if (!order) return order;
  return updateOrder(order.id, {
    status: "refunded",
    refundedAt: new Date().toISOString(),
    stripeRefundId: stripeRefundId || order.stripeRefundId || null
  });
}

async function reconcileOrderWithStripe(order) {
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

async function tryRegisterWebhookEvent(client, event) {
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

async function findOrderForWebhook(client, metadataOrderId, paymentIntentId) {
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

async function fetchOrderWithItemsInTx(client, orderId) {
  const orderResult = await client.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
  if (orderResult.rowCount === 0) return null;

  const order = orderResult.rows[0];
  const itemsResult = await client.query(
    `
    SELECT product_sku, product_id, name, qty, price_cents, currency
    FROM order_items
    WHERE order_id = $1
    `,
    [orderId]
  );

  return {
    id: order.id,
    status: order.status,
    stockCommitted: Boolean(order.stock_committed),
    items: itemsResult.rows.map((item) => ({
      id: item.product_sku || item.product_id,
      name: item.name,
      qty: Number(item.qty || 0),
      unitAmount: Number(item.price_cents || 0),
      currency: item.currency
    }))
  };
}

async function processWebhookEvent(event) {
  const stripeObject = event.data?.object || null;
  if (!stripeObject) return;

  const metadataOrderId = stripeObject.metadata?.orderId || null;
  const paymentIntentId =
    event.type === "charge.refunded"
      ? String(stripeObject.payment_intent || "").trim()
      : String(stripeObject.id || "").trim();
  const pendingNotifications = [];

  await withTransaction(async (client) => {
    const isNewEvent = await tryRegisterWebhookEvent(client, event);
    if (!isNewEvent) return;

    const orderId = await findOrderForWebhook(client, metadataOrderId, paymentIntentId);
    if (!orderId) return;

    const order = await fetchOrderWithItemsInTx(client, orderId);
    if (!order) return;

    if (event.type === "payment_intent.succeeded") {
      if (order.status === "paid" && order.stockCommitted) return;

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
                updated_at = NOW()
            WHERE id = $1
            `,
            [order.id, "stock_unavailable_after_payment", JSON.stringify(stockResult.issues || [])]
          );
          return;
        }
      }

      await client.query(
        `
        UPDATE orders
        SET status = 'paid',
            stock_committed = true,
            paid_at = COALESCE(paid_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id]
      );
      const previousStatus = String(order.status || "").toLowerCase();
      if (previousStatus !== "processing" && previousStatus !== "paid") {
        pendingNotifications.push({ type: "payment_confirmed", orderId: order.id });
      }
      pendingNotifications.push({ type: "payment_approved", orderId: order.id });
      return;
    }

    if (event.type === "payment_intent.processing") {
      await client.query(
        `UPDATE orders SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [order.id]
      );
      const previousStatus = String(order.status || "").toLowerCase();
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
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, stripeObject.last_payment_error?.message || event.type]
      );
      return;
    }

    if (event.type === "payment_intent.canceled") {
      await client.query(
        `
        UPDATE orders
        SET status = 'canceled',
            canceled_at = NOW(),
            cancellation_reason = $2,
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, stripeObject.cancellation_reason || "canceled"]
      );
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
            updated_at = NOW()
        WHERE id = $1
        `,
        [order.id, refundId]
      );
    }
  });

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
    } catch {}
  }
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((item) => item.trim()) : true,
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
  async (req, res) => {
    if (!stripe || !stripeWebhookSecret) {
      return res.status(500).json({ error: "Stripe webhook not configured." });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature header." });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
    } catch (error) {
      return res.status(400).json({ error: `Invalid webhook signature: ${error.message}` });
    }

    try {
      await processWebhookEvent(event);
      return res.json({ received: true });
    } catch {
      return res.status(500).json({ error: "Failed to process webhook." });
    }
  }
);

app.use(express.json());

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

if (!isVercelRuntime) {
  const pagesDir = path.resolve(__dirname, "..", "pages");

  app.get("/", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(pagesDir, "index.html"));
  });

  app.get("/studio-portal", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(pagesDir, "studio-portal.html"));
  });

  app.get("/studio", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(pagesDir, "loading-studio.html"));
  });

  app.get("/studio-login", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(pagesDir, "studio-login.html"));
  });

  app.get("/:page.html", (req, res, next) => {
    const pageName = `${req.params.page}.html`;
    const filePath = path.join(pagesDir, pageName);
    if (!fs.existsSync(filePath)) return next();
    res.setHeader("Cache-Control", "no-cache");
    return res.sendFile(filePath);
  });

  app.use(
    express.static(path.resolve(__dirname, ".."), {
      etag: true,
      lastModified: true,
      maxAge: "7d",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      }
    })
  );
}
app.use("/api/auth", authRouter);
app.use("/api/my", myRouter);
app.use("/api/studio-auth", studioAuthRouter);
app.use("/api/vip", vipRouter);
app.use("/api", shippingRouter);
app.use("/api", orderTrackingRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin", adminShippingRouter);
app.use("/api/admin", adminWhatsAppRouter);

app.get("/api/products", async (req, res) => {
  try {
    const products = await listProducts();
    return res.json(products);
  } catch {
    return res.status(500).json({ error: "Failed to load products." });
  }
});

function buildSimilarProducts(target, products, limit = 4) {
  const safeLimit = Math.max(1, Math.min(12, Number(limit || 4)));
  const pool = (products || []).filter((item) => item && item.id !== target.id);
  const sameCollection = pool.filter((item) => item.collection === target.collection);
  const sameCategory = pool.filter((item) => item.category === target.category);
  const merged = [
    ...sameCollection,
    ...sameCategory,
    ...pool
  ];
  const unique = [];
  const seen = new Set();
  for (const item of merged) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= safeLimit) break;
  }
  return unique;
}

app.get("/api/products/:id", async (req, res) => {
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

app.get("/api/products/:id/recommendations", async (req, res) => {
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

app.get("/api/products/recent", async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (!ids.length) return res.json({ products: [] });

    const products = await listProducts();
    const byId = new Map(products.map((item) => [String(item.id), item]));
    const unique = [];
    const seen = new Set();
    ids.forEach((id) => {
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

app.get("/api/config", (req, res) => {
  res.json({
    stripePublishableKey,
    currency: "brl",
    maxInstallments: 6,
    posthog: posthogPublicKey
      ? {
          key: posthogPublicKey,
          host: String(posthogHost || "https://us.i.posthog.com").trim() || "https://us.i.posthog.com"
        }
      : null
  });
});

app.post("/api/orders/payment-intent", requireAuth, paymentIntentRateLimit, async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." });
  }

  const parsed = paymentIntentSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const paymentMethod = parsed.data.paymentMethod;
  const installments = parsed.data.installments;
  const normalizedItems = normalizeAndAggregateItems(parsed.data.items);
  const shipping = normalizeShipping(parsed.data.shipping || null);
  const sessionUserId = req.session.userId;
  const sessionUser = await findUserById(sessionUserId);
  if (!sessionUser) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

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

  const itemsAmount = availability.resolvedItems.reduce((sum, item) => sum + item.unitAmount * item.qty, 0);
  let shippingAmount = getShippingCostFromRules(shipping);
  let selectedShippingQuote = null;
  if (shipping?.quoteId) {
    try {
      selectedShippingQuote = await resolveQuoteForCheckout({
        quoteId: shipping.quoteId,
        userId: sessionUserId,
        destinationZip: shipping.cep
      });
      shippingAmount = Math.max(0, Number(selectedShippingQuote.priceCents || 0));
    } catch (error) {
      const status = Number(error?.status || 0) || 409;
      return res.status(Math.max(400, Math.min(500, status))).json({
        error: String(error?.code || "SHIPPING_QUOTE_INVALID")
      });
    }
  }

  const orderAmount = itemsAmount + shippingAmount;
  const currency = "brl";

  try {
    const reusableOrder = await findReusableCheckoutOrder({
      userId: sessionUserId,
      paymentMethod,
      installments,
      itemsAmount,
      shippingAmount,
      orderAmount,
      shipping,
      resolvedItems: availability.resolvedItems
    });

    if (reusableOrder) {
      const reusableClientSecret = await getReusablePaymentIntentClientSecret(reusableOrder, orderAmount);
      if (reusableClientSecret) {
        return res.status(200).json({ orderId: reusableOrder.id, clientSecret: reusableClientSecret });
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
          shippingCost: shippingAmount / 100,
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
    userId: sessionUserId,
    userEmail: sessionUser.email || null,
    userName: sessionUser.name || null
  });

  if (selectedShippingQuote?.id) {
    try {
      const selected = await selectShippingForOrder({
        orderId: order.id,
        userId: sessionUserId,
        quoteId: selectedShippingQuote.id,
        destinationZip: shipping?.cep || ""
      });
      if (selected?.order) {
        order = selected.order;
      }
    } catch (error) {
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

  const paymentIntentParams = {
    amount: Math.max(0, Number(order?.amount || orderAmount)),
    currency,
    metadata: {
      orderId: order.id
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

    return res.status(201).json({ orderId: updatedOrder.id, clientSecret: paymentIntent.client_secret });
  } catch (error) {
    await updateOrder(order.id, {
      status: "failed",
      failureReason: error.message || "Failed to create PaymentIntent"
    });
    return res.status(400).json({ error: error.message || "Failed to create PaymentIntent." });
  }
});

app.get("/api/orders/:orderId", requireAuth, async (req, res) => {
  const order = await findOrderById(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.userId !== req.session.userId) {
    return res.status(404).json({ error: "Order not found." });
  }

  try {
    const reconciled = await reconcileOrderWithStripe(order);
    return res.json(reconciled || order);
  } catch {
    return res.json(order);
  }
});

if (!isVercelRuntime) {
  startMelhorEnvioSyncScheduler();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TSEBI server running on http://localhost:${port}`);
  });
}

module.exports = app;
