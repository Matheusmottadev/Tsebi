const path = require("node:path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Stripe = require("stripe");
const {
  createOrder,
  updateOrder,
  findOrderById,
  findOrderByPaymentIntentId
} = require("./lib/order-repository");
const { checkAvailability, commitStock } = require("./lib/inventory-repository");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4242;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

app.use(cors());

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
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

  const paymentIntent = event.data && event.data.object ? event.data.object : null;
  if (!paymentIntent || !paymentIntent.id) {
    return res.json({ received: true });
  }

  const metadataOrderId = paymentIntent.metadata ? paymentIntent.metadata.orderId : null;
  const order =
    (metadataOrderId ? await findOrderById(metadataOrderId) : null) ||
    (await findOrderByPaymentIntentId(paymentIntent.id));

  if (!order) {
    return res.json({ received: true });
  }

  if (event.type === "payment_intent.succeeded") {
    if (order.status === "paid" && order.stockCommitted) {
      return res.json({ received: true });
    }

    const stockResult = await commitStock(order.items || []);
    if (!stockResult.ok) {
      await updateOrder(order.id, {
        status: "failed",
        failureReason: "stock_unavailable_after_payment",
        stockIssues: stockResult.issues,
        paidAt: new Date().toISOString()
      });
      return res.json({ received: true });
    }

    await updateOrder(order.id, {
      status: "paid",
      stockCommitted: true,
      paidAt: new Date().toISOString()
    });
    return res.json({ received: true });
  }

  if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
    await updateOrder(order.id, {
      status: "failed",
      failureReason:
        paymentIntent.last_payment_error && paymentIntent.last_payment_error.message
          ? paymentIntent.last_payment_error.message
          : event.type
    });
    return res.json({ received: true });
  }

  return res.json({ received: true });
});

app.use(express.json());

app.use(express.static(path.resolve(__dirname, "..")));

app.get("/api/config", (req, res) => {
  res.json({
    stripePublishableKey,
    currency: "brl",
    maxInstallments: 6
  });
});

function normalizeAndAggregateItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const byId = new Map();

  rawItems.forEach((item) => {
    const id = item && typeof item.id === "string" ? item.id.trim() : "";
    const qtyRaw = item ? Number(item.qty) : 0;
    const qty = Number.isInteger(qtyRaw) ? qtyRaw : Math.floor(qtyRaw);
    if (!id || qty <= 0) return;
    const current = byId.get(id) || 0;
    byId.set(id, current + qty);
  });

  return Array.from(byId.entries()).map(([id, qty]) => ({ id, qty }));
}

function parseInstallments(rawInstallments) {
  const installments = Number(rawInstallments || 1);
  if (!Number.isInteger(installments)) return 1;
  return Math.max(1, Math.min(6, installments));
}

function normalizeShipping(rawShipping) {
  if (!rawShipping || typeof rawShipping !== "object") return null;
  const value = (key) => String(rawShipping[key] || "").trim();
  const shipping = {
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
  return shipping;
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

app.post("/api/orders/payment-intent", async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe is not configured. Set STRIPE_SECRET_KEY." });
  }

  const paymentMethod = req.body && req.body.paymentMethod === "pix" ? "pix" : "card";
  const installments = parseInstallments(req.body ? req.body.installments : 1);
  const normalizedItems = normalizeAndAggregateItems(req.body ? req.body.items : []);
  const shipping = normalizeShipping(req.body ? req.body.shipping : null);

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

  const order = await createOrder({
    status: "pending_payment",
    paymentMethod,
    installments: paymentMethod === "card" ? installments : 1,
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
      : null
  });

  const paymentIntentParams = {
    amount: orderAmount,
    currency,
    metadata: {
      orderId: order.id
    },
    payment_method_types: [paymentMethod]
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

  if (paymentMethod === "pix") {
    paymentIntentParams.payment_method_options = {
      pix: {
        expires_after_seconds: 3600
      }
    };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    const updatedOrder = await updateOrder(order.id, {
      stripePaymentIntentId: paymentIntent.id
    });

    return res.status(201).json({
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      amount: updatedOrder.amount,
      currency: updatedOrder.currency,
      paymentMethod: updatedOrder.paymentMethod,
      installments: updatedOrder.installments,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    await updateOrder(order.id, {
      status: "failed",
      failureReason: error.message || "Failed to create PaymentIntent"
    });
    return res.status(400).json({ error: error.message || "Failed to create PaymentIntent." });
  }
});

app.get("/api/orders/:orderId", async (req, res) => {
  const order = await findOrderById(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found." });
  return res.json(order);
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`TSEBI server running on http://localhost:${port}`);
});
