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
const { vipRouter } = require("./vip");
const { findUserById } = require("./user-repository");
const { requireAuth } = require("./middlewares/requireAuth");
const {
  createOrder,
  updateOrder,
  findOrderById
} = require("./lib/order-repository");
const { listProducts, getProductByIdentifier } = require("./lib/product-repository");
const { checkAvailability, commitStock } = require("./lib/inventory-repository");
const { withTransaction } = require("./lib/db");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4242;
const isVercelRuntime =
  String(process.env.VERCEL || "").trim() === "1" ||
  String(process.env.VERCEL || "").trim().toLowerCase() === "true";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

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
      shippingEstimate: z.string().trim().max(60).optional().default("")
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
    shippingEstimate: value("shippingEstimate")
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
    return markOrderPaid(order);
  }

  if (status === "canceled") {
    return markOrderCanceled(order, intent?.cancellation_reason || "canceled");
  }

  if (status === "processing") {
    return updateOrder(order.id, { status: "processing" });
  }

  if (status === "requires_payment_method") {
    return markOrderFailed(order, intent?.last_payment_error?.message || status);
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
      return;
    }

    if (event.type === "payment_intent.processing") {
      await client.query(
        `UPDATE orders SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [order.id]
      );
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
app.use("/api/vip", vipRouter);

app.get("/api/products", async (req, res) => {
  try {
    const products = await listProducts();
    return res.json(products);
  } catch {
    return res.status(500).json({ error: "Failed to load products." });
  }
});

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

app.get("/api/config", (req, res) => {
  res.json({
    stripePublishableKey,
    currency: "brl",
    maxInstallments: 6
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
  const shippingAmount = getShippingCostFromRules(shipping);
  const orderAmount = itemsAmount + shippingAmount;
  const currency = "brl";

  const sessionUserId = req.session.userId;
  const sessionUser = await findUserById(sessionUserId);
  if (!sessionUser) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const order = await createOrder({
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
          shippingCost: shippingAmount / 100
        }
      : null,
    userId: sessionUserId,
    userEmail: sessionUser.email || null,
    userName: sessionUser.name || null
  });

  const paymentIntentParams = {
    amount: orderAmount,
    currency,
    metadata: {
      orderId: order.id
    },
    automatic_payment_methods: {
      enabled: true
    }
  };

  if (paymentMethod === "card" && installments > 1) {
    paymentIntentParams.payment_method_options = {
      card: {
        installments: {
          enabled: true,
          plan: {
            type: "fixed_count",
            interval: "month",
            count: installments
          }
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
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TSEBI server running on http://localhost:${port}`);
  });
}

module.exports = app;
