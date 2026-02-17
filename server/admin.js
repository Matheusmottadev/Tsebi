const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const {
  listUsers,
  createUser,
  adminUpdateUser,
  deleteUserById,
  normalizeEmail
} = require("./user-repository");
const { listOrders, updateOrder, findOrderById } = require("./lib/order-repository");
const {
  listAdminProducts,
  createProduct,
  updateProductByIdentifier,
  archiveProductByIdentifier
} = require("./lib/product-repository");
const {
  listVipSubscribers,
  upsertVipSubscriber,
  updateVipSubscriberById,
  deleteVipSubscriberById
} = require("./lib/vip-repository");
const { getVipDatabaseUrl } = require("./lib/vip-db");
const { requireAdmin, requireAdminCsrfForMutations } = require("./middlewares/requireAdmin");

const adminRouter = express.Router();

const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

adminRouter.use(adminRateLimit);
adminRouter.use(requireAdmin);
adminRouter.use(requireAdminCsrfForMutations);

const statusSchema = z.enum([
  "pending_payment",
  "processing",
  "paid",
  "failed",
  "canceled",
  "refunded"
]);

const userPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
  cpf: z
    .string()
    .transform((value) => String(value || "").replace(/\D/g, ""))
    .refine((value) => value.length === 0 || /^\d{11}$/.test(value))
    .optional(),
  cep: z
    .string()
    .transform((value) => String(value || "").replace(/\D/g, ""))
    .refine((value) => value.length === 0 || /^\d{8}$/.test(value))
    .optional()
});

const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value)),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional().default(""),
  cpf: z
    .string()
    .optional()
    .default("")
    .transform((value) => String(value || "").replace(/\D/g, ""))
    .refine((value) => value.length === 0 || /^\d{11}$/.test(value)),
  cep: z
    .string()
    .optional()
    .default("")
    .transform((value) => String(value || "").replace(/\D/g, ""))
    .refine((value) => value.length === 0 || /^\d{8}$/.test(value))
});

const orderPatchSchema = z.object({
  status: statusSchema.optional(),
  paymentMethod: z.string().trim().min(1).max(40).optional(),
  installments: z.coerce.number().int().min(1).max(12).optional(),
  failureReason: z.string().trim().max(240).optional(),
  cancellationReason: z.string().trim().max(240).optional()
});

const productCreateSchema = z.object({
  sku: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(160),
  priceCents: z.coerce.number().int().min(0).max(9_999_999),
  stockQty: z.coerce.number().int().min(0).max(999_999),
  currency: z.string().trim().min(3).max(3).optional().default("brl"),
  active: z.boolean().optional().default(true)
});

const productPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  priceCents: z.coerce.number().int().min(0).max(9_999_999).optional(),
  stockQty: z.coerce.number().int().min(0).max(999_999).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  active: z.boolean().optional()
});

const vipUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional().default(""),
  cpf: z
    .string()
    .optional()
    .default("")
    .transform((value) => String(value || "").replace(/\D/g, ""))
    .refine((value) => value.length === 0 || /^\d{11}$/.test(value)),
  cep: z
    .string()
    .optional()
    .default("")
    .transform((value) => String(value || "").replace(/\D/g, ""))
    .refine((value) => value.length === 0 || /^\d{8}$/.test(value)),
  accountCreated: z.boolean().optional().default(false)
});

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
    cep: user.cep || "",
    defaultAddressId: user.defaultAddressId || "",
    addresses: Array.isArray(user.addresses) ? user.addresses : [],
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null
  };
}

function paginateArray(items, limit, offset) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const total = Array.isArray(items) ? items.length : 0;
  const rows = Array.isArray(items) ? items.slice(safeOffset, safeOffset + safeLimit) : [];
  return { rows, total, limit: safeLimit, offset: safeOffset };
}

function assertVipDbConfigured() {
  const vipDbUrl = getVipDatabaseUrl();
  if (!vipDbUrl) {
    const error = new Error("VIP_DATABASE_NOT_CONFIGURED");
    error.code = "VIP_DATABASE_NOT_CONFIGURED";
    throw error;
  }
}

adminRouter.get("/me", (req, res) => {
  return res.json({ admin: req.adminUser });
});

adminRouter.get("/users", async (req, res) => {
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);
  const search = String(req.query.search || "").trim();

  try {
    const users = await listUsers({ limit, offset, search });
    return res.json({
      users: users.map(sanitizeUser),
      count: users.length,
      limit,
      offset
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_USERS_LIST_FAILED" });
  }
});

adminRouter.post("/users", async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  try {
    const payload = parsed.data;
    const created = await createUser({
      name: payload.name,
      email: normalizeEmail(payload.email),
      passwordHash: await bcrypt.hash(payload.password, 12),
      birthDate: payload.birthDate || "",
      cpf: payload.cpf || "",
      cep: payload.cep || ""
    });

    if (!created.ok) {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    }

    return res.status(201).json({ ok: true, user: sanitizeUser(created.user) });
  } catch {
    return res.status(500).json({ error: "ADMIN_USER_CREATE_FAILED" });
  }
});

adminRouter.patch("/users/:id", async (req, res) => {
  const parsed = userPatchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  try {
    const updated = await adminUpdateUser(req.params.id, {
      ...parsed.data,
      email: parsed.data.email ? normalizeEmail(parsed.data.email) : undefined
    });

    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    if (updated.error === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    }

    return res.json({ ok: true, user: sanitizeUser(updated) });
  } catch {
    return res.status(500).json({ error: "ADMIN_USER_UPDATE_FAILED" });
  }
});

adminRouter.delete("/users/:id", async (req, res) => {
  if (String(req.params.id || "") === String(req.adminUser?.id || "")) {
    return res.status(400).json({ error: "CANNOT_DELETE_SELF" });
  }

  try {
    const removed = await deleteUserById(req.params.id);
    if (!removed) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ ok: true, removed: sanitizeUser(removed) });
  } catch {
    return res.status(500).json({ error: "ADMIN_USER_DELETE_FAILED" });
  }
});

adminRouter.get("/orders", async (req, res) => {
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);
  const search = String(req.query.search || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();

  try {
    const orders = await listOrders();
    const filtered = orders.filter((order) => {
      const matchesStatus = status ? String(order.status || "").toLowerCase() === status : true;
      if (!matchesStatus) return false;
      if (!search) return true;
      const payload = `${order.id} ${order.userEmail || ""} ${order.userName || ""}`.toLowerCase();
      return payload.includes(search);
    });
    const paged = paginateArray(filtered, limit, offset);
    return res.json({
      orders: paged.rows,
      total: paged.total,
      limit: paged.limit,
      offset: paged.offset
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_ORDERS_LIST_FAILED" });
  }
});

adminRouter.patch("/orders/:id", async (req, res) => {
  const parsed = orderPatchSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const existing = await findOrderById(req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    const updated = await updateOrder(req.params.id, parsed.data);
    return res.json({ ok: true, order: updated || existing });
  } catch {
    return res.status(500).json({ error: "ADMIN_ORDER_UPDATE_FAILED" });
  }
});

adminRouter.get("/products", async (req, res) => {
  const limit = Number(req.query.limit || 200);
  const offset = Number(req.query.offset || 0);
  const search = String(req.query.search || "").trim();
  const includeInactive = String(req.query.includeInactive || "1") !== "0";

  try {
    const products = await listAdminProducts({ limit, offset, search, includeInactive });
    return res.json({ products, count: products.length, limit, offset });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRODUCTS_LIST_FAILED" });
  }
});

adminRouter.post("/products", async (req, res) => {
  const parsed = productCreateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const created = await createProduct(parsed.data);
    if (created?.error === "INVALID_SKU") return res.status(400).json({ error: "INVALID_SKU" });
    if (created?.error === "SKU_ALREADY_EXISTS") {
      return res.status(409).json({ error: "SKU_ALREADY_EXISTS" });
    }
    return res.status(201).json({ ok: true, product: created });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRODUCT_CREATE_FAILED" });
  }
});

adminRouter.patch("/products/:id", async (req, res) => {
  const parsed = productPatchSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const updated = await updateProductByIdentifier(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ ok: true, product: updated });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRODUCT_UPDATE_FAILED" });
  }
});

adminRouter.delete("/products/:id", async (req, res) => {
  try {
    const archived = await archiveProductByIdentifier(req.params.id);
    if (!archived) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ ok: true, product: archived });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRODUCT_DELETE_FAILED" });
  }
});

adminRouter.get("/vip/subscribers", async (req, res) => {
  const limit = Number(req.query.limit || 200);
  const offset = Number(req.query.offset || 0);

  try {
    assertVipDbConfigured();
    const subscribers = await listVipSubscribers({ limit, offset });
    return res.json({ subscribers, count: subscribers.length, limit, offset });
  } catch (error) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_LIST_FAILED" });
  }
});

adminRouter.post("/vip/subscribers", async (req, res) => {
  const parsed = vipUpsertSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    assertVipDbConfigured();
    const payload = parsed.data;
    const subscriber = await upsertVipSubscriber({
      name: payload.name,
      email: normalizeEmail(payload.email),
      birthDate: payload.birthDate || "",
      cpf: payload.cpf || "",
      cep: payload.cep || "",
      source: "admin_panel",
      accountCreated: Boolean(payload.accountCreated),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    return res.status(201).json({ ok: true, subscriber });
  } catch (error) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_SAVE_FAILED" });
  }
});

adminRouter.patch("/vip/subscribers/:id", async (req, res) => {
  const parsed = vipUpsertSchema.partial().safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    assertVipDbConfigured();
    const updated = await updateVipSubscriberById(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ ok: true, subscriber: updated });
  } catch (error) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_UPDATE_FAILED" });
  }
});

adminRouter.delete("/vip/subscribers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "INVALID_ID" });

  try {
    assertVipDbConfigured();
    const removed = await deleteVipSubscriberById(id);
    if (!removed) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ ok: true, removed });
  } catch (error) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_DELETE_FAILED" });
  }
});

module.exports = {
  adminRouter
};
