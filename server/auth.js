const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const Stripe = require("stripe");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const {
  publicUser,
  normalizeEmail,
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  createPasswordResetToken,
  consumePasswordResetToken
} = require("./user-repository");
const { listOrdersByUserId, updateOrder } = require("./lib/order-repository");
const { commitStock } = require("./lib/inventory-repository");
const { requireAuth } = require("./middlewares/requireAuth");

const authRouter = express.Router();
const myRouter = express.Router();

const REFUND_WINDOW_MS = 10 * 60 * 1000;
let stripeClient = null;

function getStripeClient() {
  if (stripeClient) return stripeClient;
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) return null;
  stripeClient = new Stripe(key);
  return stripeClient;
}

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_ATTEMPTS" }
});

const resetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_ATTEMPTS" }
});

const emailSchema = z.string().trim().email();
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "INVALID_PASSWORD"
  });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cpf: z.string().transform((value) => String(value || "").replace(/\D/g, "")).refine((value) => /^\d{11}$/.test(value)),
  cep: z.string().transform((value) => String(value || "").replace(/\D/g, "")).refine((value) => /^\d{8}$/.test(value))
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128)
});

const checkEmailSchema = z.object({
  email: emailSchema
});

const forgotPasswordSchema = z.object({
  email: emailSchema
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(24),
  password: passwordSchema
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cpf: z.string().transform((value) => String(value || "").replace(/\D/g, "")).refine((value) => /^\d{11}$/.test(value)),
  cep: z.string().transform((value) => String(value || "").replace(/\D/g, "")).refine((value) => /^\d{8}$/.test(value))
});

const addressSchema = z.object({
  label: z.string().trim().min(2).max(40),
  fullName: z.string().trim().min(3).max(120),
  cep: z.string().transform((value) => String(value || "").replace(/\D/g, "")).refine((value) => /^\d{8}$/.test(value)),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(120).optional().default(""),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z
    .string()
    .transform((value) => String(value || "").trim().toUpperCase())
    .refine((value) => /^[A-Z]{2}$/.test(value))
});

function parseBirthDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  const minAllowed = new Date("1900-01-01T00:00:00.000Z");
  if (date < minAllowed) return false;
  if (date > new Date()) return false;
  return true;
}

function normalizeAddressList(addresses, defaultAddressId = "") {
  const safe = Array.isArray(addresses)
    ? addresses
        .map((address) => {
          if (!address || typeof address !== "object") return null;
          return {
            id: String(address.id || "").trim(),
            label: String(address.label || "").trim(),
            fullName: String(address.fullName || "").trim(),
            cep: String(address.cep || "").replace(/\D/g, "").slice(0, 8),
            street: String(address.street || "").trim(),
            number: String(address.number || "").trim(),
            complement: String(address.complement || "").trim(),
            district: String(address.district || "").trim(),
            city: String(address.city || "").trim(),
            state: String(address.state || "").trim().toUpperCase().slice(0, 2),
            isDefault: Boolean(address.isDefault),
            createdAt: address.createdAt || new Date().toISOString(),
            updatedAt: address.updatedAt || new Date().toISOString()
          };
        })
        .filter((address) => address && address.id)
    : [];

  let chosenDefaultId = String(defaultAddressId || "").trim();
  if (!chosenDefaultId || !safe.some((address) => address.id === chosenDefaultId)) {
    chosenDefaultId = safe.find((address) => address.isDefault)?.id || safe[0]?.id || "";
  }

  return {
    defaultAddressId: chosenDefaultId,
    addresses: safe.map((address) => ({
      ...address,
      isDefault: Boolean(chosenDefaultId && address.id === chosenDefaultId)
    }))
  };
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
  if (!order) return order;
  if (["failed", "canceled", "refunded"].includes(order.status)) return order;
  if (!order.stripePaymentIntentId) return order;

  const stripe = getStripeClient();
  if (!stripe) return order;

  const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
  const status = String(intent?.status || "").toLowerCase();

  if (status === "succeeded") return markOrderPaid(order);
  if (status === "canceled") return markOrderCanceled(order, intent?.cancellation_reason || "canceled");
  if (status === "requires_payment_method") {
    return markOrderFailed(order, intent?.last_payment_error?.message || status);
  }

  return order;
}

function isRefundWindowOpen(order) {
  const paidAt = String(order?.paidAt || "").trim();
  if (!paidAt) return false;
  const paidDate = new Date(paidAt);
  if (Number.isNaN(paidDate.getTime())) return false;
  return Date.now() - paidDate.getTime() <= REFUND_WINDOW_MS;
}

authRouter.post("/register", authRateLimit, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const payload = parsed.data;
  if (!parseBirthDate(payload.birthDate)) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const created = await createUser({
    name: payload.name,
    email: normalizeEmail(payload.email),
    passwordHash: await bcrypt.hash(payload.password, 12),
    birthDate: payload.birthDate,
    cpf: payload.cpf,
    cep: payload.cep
  });

  if (!created.ok) {
    return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
  }

  req.session.userId = created.user.id;
  return res.status(201).json({ user: publicUser(created.user) });
});

authRouter.post("/check-email", async (req, res) => {
  const parsed = checkEmailSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const user = await findUserByEmail(parsed.data.email);
  return res.json({ exists: Boolean(user) });
});

authRouter.post("/login", authRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const email = normalizeEmail(parsed.data.email);
  const password = parsed.data.password;
  const user = await findUserByEmail(email);

  if (!user) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  req.session.userId = user.id;
  return res.json({ user: publicUser(user) });
});

authRouter.post("/logout", (req, res) => {
  if (!req.session) return res.json({ ok: true });
  if (req.session.userId) {
    delete req.session.userId;
  }
  req.session.save(() => {
    res.json({ ok: true });
  });
});

authRouter.get("/me", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  const user = await findUserById(userId);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  return res.json({ user: publicUser(user) });
});

authRouter.post("/forgot-password", resetRateLimit, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);

  if (!user) {
    return res.json({ ok: true });
  }

  const reset = await createPasswordResetToken(user.id, 30);
  const response = { ok: true };

  if (process.env.NODE_ENV !== "production") {
    response.resetToken = reset.token;
    response.expiresAt = reset.expiresAt;
  }

  return res.json(response);
});

authRouter.post("/reset-password", resetRateLimit, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const consumed = await consumePasswordResetToken(parsed.data.token);
  if (!consumed?.userId) {
    return res.status(400).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
  }

  const updated = await updateUser(consumed.userId, {
    passwordHash: await bcrypt.hash(parsed.data.password, 12)
  });

  if (!updated) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  return res.json({ ok: true });
});

myRouter.get("/orders", requireAuth, async (req, res) => {
  const orders = await listOrdersByUserId(req.session.userId);
  const reconciledOrders = [];

  for (const order of orders) {
    try {
      const reconciled = await reconcileOrderWithStripe(order);
      reconciledOrders.push(reconciled || order);
    } catch {
      reconciledOrders.push(order);
    }
  }

  return res.json({ orders: reconciledOrders });
});

myRouter.get("/orders/:orderId", requireAuth, async (req, res) => {
  const orders = await listOrdersByUserId(req.session.userId);
  const order = orders.find((item) => item.id === req.params.orderId) || null;
  if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });

  try {
    const reconciled = await reconcileOrderWithStripe(order);
    return res.json({ order: reconciled || order });
  } catch {
    return res.json({ order });
  }
});

myRouter.post("/orders/:orderId/cancel", requireAuth, async (req, res) => {
  const orders = await listOrdersByUserId(req.session.userId);
  const order = orders.find((item) => item.id === req.params.orderId) || null;
  if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
  if (!order.stripePaymentIntentId) return res.status(409).json({ error: "ORDER_NOT_CANCELABLE" });

  const status = String(order.status || "").toLowerCase();
  if (status === "canceled") return res.json({ order });
  if (status === "refunded" || status === "failed") {
    return res.status(409).json({ error: "ORDER_NOT_CANCELABLE" });
  }
  if (status === "paid") {
    return res.status(409).json({ error: "ORDER_ALREADY_PAID_USE_REFUND" });
  }

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: "STRIPE_NOT_CONFIGURED" });

  try {
    await stripe.paymentIntents.cancel(order.stripePaymentIntentId, {
      cancellation_reason: "requested_by_customer"
    });
    const updated = await markOrderCanceled(order, "requested_by_customer");
    return res.json({ order: updated || order });
  } catch (error) {
    if (error && error.code === "payment_intent_unexpected_state") {
      return res.status(409).json({ error: "ORDER_NOT_CANCELABLE" });
    }
    return res.status(400).json({ error: "CANCEL_FAILED" });
  }
});

myRouter.post("/orders/:orderId/refund", requireAuth, async (req, res) => {
  const orders = await listOrdersByUserId(req.session.userId);
  const order = orders.find((item) => item.id === req.params.orderId) || null;
  if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
  if (!order.stripePaymentIntentId) return res.status(409).json({ error: "ORDER_NOT_REFUNDABLE" });

  const status = String(order.status || "").toLowerCase();
  if (status === "refunded") return res.json({ order });
  if (status !== "paid") return res.status(409).json({ error: "ORDER_NOT_REFUNDABLE" });
  if (!isRefundWindowOpen(order)) return res.status(409).json({ error: "REFUND_WINDOW_EXPIRED" });

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: "STRIPE_NOT_CONFIGURED" });

  try {
    const refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      reason: "requested_by_customer",
      metadata: {
        orderId: order.id
      }
    });

    const updated = await markOrderRefunded(order, refund?.id || null);
    return res.json({ order: updated || order, refundId: refund?.id || null });
  } catch {
    return res.status(400).json({ error: "REFUND_FAILED" });
  }
});

myRouter.put("/profile", requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  if (!parseBirthDate(parsed.data.birthDate)) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const updated = await updateUser(req.session.userId, {
    name: parsed.data.name,
    birthDate: parsed.data.birthDate,
    cpf: parsed.data.cpf,
    cep: parsed.data.cep
  });
  if (!updated) return res.status(404).json({ error: "USER_NOT_FOUND" });
  return res.json({ user: publicUser(updated) });
});

myRouter.get("/addresses", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
  const normalized = normalizeAddressList(user.addresses, user.defaultAddressId);
  return res.json({
    defaultAddressId: normalized.defaultAddressId,
    addresses: normalized.addresses
  });
});

myRouter.post("/addresses", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const parsed = addressSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const current = normalizeAddressList(user.addresses, user.defaultAddressId);
  const address = {
    id: crypto.randomUUID(),
    ...parsed.data,
    isDefault: current.addresses.length === 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const nextList = normalizeAddressList(
    [...current.addresses, address],
    address.isDefault ? address.id : current.defaultAddressId
  );
  const defaultAddress = nextList.addresses.find((item) => item.isDefault) || null;

  const updated = await updateUser(req.session.userId, {
    addresses: nextList.addresses,
    defaultAddressId: nextList.defaultAddressId,
    cep: defaultAddress ? defaultAddress.cep : user.cep
  });

  return res.status(201).json({
    defaultAddressId: updated.defaultAddressId || "",
    addresses: updated.addresses || []
  });
});

myRouter.put("/addresses/:addressId", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const addressId = String(req.params.addressId || "").trim();
  const parsed = addressSchema.safeParse(req.body || {});
  if (!addressId || !parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const current = normalizeAddressList(user.addresses, user.defaultAddressId);
  if (!current.addresses.some((address) => address.id === addressId)) {
    return res.status(404).json({ error: "ADDRESS_NOT_FOUND" });
  }

  const addresses = current.addresses.map((address) =>
    address.id === addressId
      ? {
          ...address,
          ...parsed.data,
          updatedAt: new Date().toISOString()
        }
      : address
  );

  const nextList = normalizeAddressList(addresses, current.defaultAddressId);
  const defaultAddress = nextList.addresses.find((item) => item.isDefault) || null;

  const updated = await updateUser(req.session.userId, {
    addresses: nextList.addresses,
    defaultAddressId: nextList.defaultAddressId,
    cep: defaultAddress ? defaultAddress.cep : user.cep
  });

  return res.json({
    defaultAddressId: updated.defaultAddressId || "",
    addresses: updated.addresses || []
  });
});

myRouter.post("/addresses/:addressId/default", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const addressId = String(req.params.addressId || "").trim();
  const current = normalizeAddressList(user.addresses, user.defaultAddressId);
  if (!current.addresses.some((address) => address.id === addressId)) {
    return res.status(404).json({ error: "ADDRESS_NOT_FOUND" });
  }

  const nextList = normalizeAddressList(current.addresses, addressId);
  const defaultAddress = nextList.addresses.find((item) => item.isDefault) || null;
  const updated = await updateUser(req.session.userId, {
    addresses: nextList.addresses,
    defaultAddressId: nextList.defaultAddressId,
    cep: defaultAddress ? defaultAddress.cep : user.cep
  });

  return res.json({
    defaultAddressId: updated.defaultAddressId || "",
    addresses: updated.addresses || []
  });
});

myRouter.delete("/addresses/:addressId", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const addressId = String(req.params.addressId || "").trim();
  const current = normalizeAddressList(user.addresses, user.defaultAddressId);
  if (!current.addresses.some((address) => address.id === addressId)) {
    return res.status(404).json({ error: "ADDRESS_NOT_FOUND" });
  }

  const remaining = current.addresses.filter((address) => address.id !== addressId);
  const nextDefault = current.defaultAddressId === addressId ? remaining[0]?.id || "" : current.defaultAddressId;
  const nextList = normalizeAddressList(remaining, nextDefault);
  const defaultAddress = nextList.addresses.find((item) => item.isDefault) || null;

  const updated = await updateUser(req.session.userId, {
    addresses: nextList.addresses,
    defaultAddressId: nextList.defaultAddressId,
    cep: defaultAddress ? defaultAddress.cep : ""
  });

  return res.json({
    defaultAddressId: updated.defaultAddressId || "",
    addresses: updated.addresses || []
  });
});

module.exports = {
  authRouter,
  myRouter
};
