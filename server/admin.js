const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const {
  listUsers,
  findUserById,
  createUser,
  adminUpdateUser,
  deleteUserById,
  normalizeEmail,
  restoreUserFromSnapshot
} = require("./user-repository");
const { listOrders, updateOrder, findOrderById } = require("./lib/order-repository");
const {
  listAdminProducts,
  getProductByIdentifier,
  createProduct,
  updateProductByIdentifier,
  archiveProductByIdentifier,
  deleteProductByIdentifier,
  restoreProductFromSnapshot
} = require("./lib/product-repository");
const {
  listVipSubscribers,
  findVipSubscriberById,
  findVipSubscriberByEmail,
  upsertVipSubscriber,
  updateVipSubscriberById,
  deleteVipSubscriberById,
  restoreVipSubscriberFromSnapshot
} = require("./lib/vip-repository");
const {
  insertAdminAuditLog,
  listAdminAuditLogs,
  findAdminAuditLogById,
  markAdminAuditLogReversed,
  isAuditLogReversible
} = require("./lib/admin-audit-repository");
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
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt || null,
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

function createAdminError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function buildAuditActor(req) {
  return {
    actorUserId: req.adminUser?.id || null,
    actorEmail: normalizeEmail(req.adminUser?.email || ""),
    requestIp: req.ip || "",
    userAgent: String(req.headers["user-agent"] || "")
  };
}

function sanitizeUserForAudit(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
    cep: user.cep || "",
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null
  };
}

function buildUserSnapshotForRestore(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
    cep: user.cep || "",
    addresses: Array.isArray(user.addresses) ? user.addresses : [],
    defaultAddressId: user.defaultAddressId || "",
    passwordHash: user.passwordHash || "",
    adminMfaEnabled: Boolean(user.adminMfaEnabled),
    adminMfaSecretEnc: user.adminMfaSecretEnc || "",
    adminMfaRecoveryCodes: Array.isArray(user.adminMfaRecoveryCodes) ? user.adminMfaRecoveryCodes : [],
    adminMfaEnabledAt: user.adminMfaEnabledAt || null,
    adminMfaDisabledAt: user.adminMfaDisabledAt || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null
  };
}

function buildUserPatchFromSnapshot(user) {
  if (!user) return {};
  return {
    name: user.name || "",
    email: normalizeEmail(user.email || ""),
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
    cep: user.cep || ""
  };
}

function sanitizeOrderForAudit(order) {
  if (!order) return null;
  return {
    id: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod || "",
    installments: Number(order.installments || 1),
    failureReason: order.failureReason || "",
    cancellationReason: order.cancellationReason || "",
    amount: Number(order.amount || 0),
    currency: order.currency || "brl",
    userEmail: order.userEmail || "",
    userName: order.userName || "",
    createdAt: order.createdAt || null,
    updatedAt: order.updatedAt || null
  };
}

function buildOrderPatchFromSnapshot(order) {
  if (!order) return {};
  return {
    status: order.status,
    paymentMethod: order.paymentMethod || "",
    installments: Number(order.installments || 1),
    failureReason: order.failureReason || "",
    cancellationReason: order.cancellationReason || ""
  };
}

function sanitizeProductForAudit(product) {
  if (!product) return null;
  return {
    id: product.id,
    sku: product.sku || product.id,
    name: product.name || "",
    priceCents: Number(product.unitAmount || 0),
    stockQty: Number(product.stock || 0),
    currency: product.currency || "brl",
    active: Boolean(product.active),
    createdAt: product.createdAt || null,
    updatedAt: product.updatedAt || null
  };
}

function buildProductPatchFromSnapshot(product) {
  if (!product) return {};
  return {
    name: product.name || "",
    priceCents: Number(product.unitAmount || 0),
    stockQty: Number(product.stock || 0),
    currency: product.currency || "brl",
    active: Boolean(product.active)
  };
}

function sanitizeVipForAudit(subscriber) {
  if (!subscriber) return null;
  return {
    id: Number(subscriber.id || 0),
    name: subscriber.name || "",
    email: subscriber.email || "",
    birthDate: subscriber.birthDate || "",
    cpf: subscriber.cpf || "",
    cep: subscriber.cep || "",
    source: subscriber.source || "admin_panel",
    accountCreated: Boolean(subscriber.accountCreated),
    accountCreatedAt: subscriber.accountCreatedAt || null,
    subscribedAt: subscriber.subscribedAt || null,
    updatedAt: subscriber.updatedAt || null
  };
}

function buildVipPatchFromSnapshot(subscriber) {
  if (!subscriber) return {};
  return {
    name: subscriber.name || "",
    email: subscriber.email || "",
    birthDate: subscriber.birthDate || "",
    cpf: subscriber.cpf || "",
    cep: subscriber.cep || "",
    accountCreated: Boolean(subscriber.accountCreated)
  };
}

async function recordAuditLog(req, payload) {
  const actor = buildAuditActor(req);
  return insertAdminAuditLog({
    ...payload,
    ...actor
  });
}

async function applyAuditReverseOperation(log) {
  const reverse = log?.reversePayload;
  const type = String(reverse?.type || "");
  const payload = reverse?.payload || {};

  if (!type) throw createAdminError("AUDIT_LOG_NOT_REVERSIBLE", 409);

  if (type === "user_delete") {
    const targetId = String(payload.id || "").trim();
    if (!targetId) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await findUserById(targetId);
    if (before) {
      await deleteUserById(targetId);
    }
    const after = await findUserById(targetId);
    return {
      summary: `Reversao aplicada: usuario ${targetId} removido.`,
      entityType: "user",
      entityId: targetId,
      before: sanitizeUserForAudit(before),
      after: sanitizeUserForAudit(after)
    };
  }

  if (type === "user_restore") {
    const snapshot = payload.snapshot || null;
    const targetId = String(snapshot?.id || "").trim();
    if (!snapshot || !targetId) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await findUserById(targetId);
    const restored = await restoreUserFromSnapshot(snapshot);
    if (restored?.error === "INVALID_SNAPSHOT") throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    if (restored?.error === "EMAIL_ALREADY_EXISTS") throw createAdminError("AUDIT_RESTORE_EMAIL_CONFLICT", 409);
    const after = restored?.user || (await findUserById(targetId));
    return {
      summary: `Reversao aplicada: usuario ${targetId} restaurado.`,
      entityType: "user",
      entityId: targetId,
      before: sanitizeUserForAudit(before),
      after: sanitizeUserForAudit(after)
    };
  }

  if (type === "user_update") {
    const targetId = String(payload.id || "").trim();
    const patch = payload.patch || {};
    if (!targetId) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await findUserById(targetId);
    if (!before) throw createAdminError("NOT_FOUND", 404);
    const updated = await adminUpdateUser(targetId, patch);
    if (updated?.error === "EMAIL_ALREADY_EXISTS") throw createAdminError("EMAIL_ALREADY_EXISTS", 409);
    const after = updated || (await findUserById(targetId));
    return {
      summary: `Reversao aplicada: usuario ${targetId} atualizado.`,
      entityType: "user",
      entityId: targetId,
      before: sanitizeUserForAudit(before),
      after: sanitizeUserForAudit(after)
    };
  }

  if (type === "order_update") {
    const targetId = String(payload.id || "").trim();
    const patch = payload.patch || {};
    if (!targetId) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await findOrderById(targetId);
    if (!before) throw createAdminError("NOT_FOUND", 404);
    const after = await updateOrder(targetId, patch);
    return {
      summary: `Reversao aplicada: pedido ${targetId} atualizado.`,
      entityType: "order",
      entityId: targetId,
      before: sanitizeOrderForAudit(before),
      after: sanitizeOrderForAudit(after || (await findOrderById(targetId)))
    };
  }

  if (type === "product_delete") {
    const targetId = String(payload.id || "").trim();
    if (!targetId) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await getProductByIdentifier(targetId);
    if (before) {
      const removed = await deleteProductByIdentifier(targetId);
      if (removed?.error === "PRODUCT_IN_USE") throw createAdminError("PRODUCT_IN_USE", 409);
    }
    const after = await getProductByIdentifier(targetId);
    return {
      summary: `Reversao aplicada: produto ${targetId} removido.`,
      entityType: "product",
      entityId: targetId,
      before: sanitizeProductForAudit(before),
      after: sanitizeProductForAudit(after)
    };
  }

  if (type === "product_restore") {
    const snapshot = payload.snapshot || null;
    const identifier = String(snapshot?.sku || snapshot?.id || "").trim();
    if (!snapshot || !identifier) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await getProductByIdentifier(identifier);
    const restored = await restoreProductFromSnapshot(snapshot);
    if (restored?.error === "INVALID_SNAPSHOT") throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    if (restored?.error === "SKU_ALREADY_EXISTS") throw createAdminError("SKU_ALREADY_EXISTS", 409);
    const after = restored?.product || (await getProductByIdentifier(identifier));
    return {
      summary: `Reversao aplicada: produto ${identifier} restaurado.`,
      entityType: "product",
      entityId: identifier,
      before: sanitizeProductForAudit(before),
      after: sanitizeProductForAudit(after)
    };
  }

  if (type === "product_update") {
    const targetId = String(payload.id || "").trim();
    const patch = payload.patch || {};
    if (!targetId) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await getProductByIdentifier(targetId);
    if (!before) throw createAdminError("NOT_FOUND", 404);
    const after = await updateProductByIdentifier(targetId, patch);
    return {
      summary: `Reversao aplicada: produto ${targetId} atualizado.`,
      entityType: "product",
      entityId: targetId,
      before: sanitizeProductForAudit(before),
      after: sanitizeProductForAudit(after)
    };
  }

  if (type === "vip_delete") {
    const targetId = Number(payload.id);
    if (!Number.isInteger(targetId) || targetId <= 0) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await findVipSubscriberById(targetId);
    if (before) {
      await deleteVipSubscriberById(targetId);
    }
    const after = await findVipSubscriberById(targetId);
    return {
      summary: `Reversao aplicada: inscrito VIP ${targetId} removido.`,
      entityType: "vip_subscriber",
      entityId: String(targetId),
      before: sanitizeVipForAudit(before),
      after: sanitizeVipForAudit(after)
    };
  }

  if (type === "vip_restore") {
    const snapshot = payload.snapshot || null;
    if (!snapshot || !snapshot.email) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await findVipSubscriberByEmail(snapshot.email);
    const restored = await restoreVipSubscriberFromSnapshot(snapshot);
    if (restored?.error === "INVALID_SNAPSHOT") throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const after = restored?.subscriber || (await findVipSubscriberByEmail(snapshot.email));
    return {
      summary: `Reversao aplicada: inscrito VIP ${snapshot.email} restaurado.`,
      entityType: "vip_subscriber",
      entityId: String(after?.id || before?.id || ""),
      before: sanitizeVipForAudit(before),
      after: sanitizeVipForAudit(after)
    };
  }

  if (type === "vip_update") {
    const targetId = Number(payload.id);
    const patch = payload.patch || {};
    if (!Number.isInteger(targetId) || targetId <= 0) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await findVipSubscriberById(targetId);
    if (!before) throw createAdminError("NOT_FOUND", 404);
    const after = await updateVipSubscriberById(targetId, patch);
    return {
      summary: `Reversao aplicada: inscrito VIP ${targetId} atualizado.`,
      entityType: "vip_subscriber",
      entityId: String(targetId),
      before: sanitizeVipForAudit(before),
      after: sanitizeVipForAudit(after || (await findVipSubscriberById(targetId)))
    };
  }

  throw createAdminError("AUDIT_LOG_NOT_REVERSIBLE", 409);
}

adminRouter.get("/me", (req, res) => {
  return res.json({ admin: req.adminUser });
});

adminRouter.get("/audit-logs", async (req, res) => {
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);

  try {
    const logs = await listAdminAuditLogs({ limit, offset });
    return res.json({
      logs,
      count: logs.length,
      limit: Math.max(1, Math.min(200, Number(limit) || 100)),
      offset: Math.max(0, Number(offset) || 0)
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_AUDIT_LIST_FAILED" });
  }
});

adminRouter.post("/audit-logs/:id/reverse", async (req, res) => {
  const logId = String(req.params.id || "").trim();
  if (!logId) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const log = await findAdminAuditLogById(logId, { includeInternal: true });
    if (!log) return res.status(404).json({ error: "NOT_FOUND" });
    if (!isAuditLogReversible(log)) {
      return res.status(409).json({ error: "AUDIT_LOG_NOT_REVERSIBLE" });
    }

    const reverseResult = await applyAuditReverseOperation(log);
    const reverseLog = await recordAuditLog(req, {
      action: "reverse",
      entityType: reverseResult.entityType || log.entityType,
      entityId: reverseResult.entityId || log.entityId,
      summary: reverseResult.summary || `Reversao da alteracao ${log.id}`,
      before: reverseResult.before || null,
      after: reverseResult.after || null,
      reversePayload: null,
      meta: {
        reverseOfAuditId: log.id
      }
    });

    const marked = await markAdminAuditLogReversed(log.id, {
      reversedByUserId: req.adminUser?.id || null,
      reversedByEmail: normalizeEmail(req.adminUser?.email || ""),
      reverseResult: {
        reverseLogId: reverseLog?.id || null
      }
    });

    return res.json({
      ok: true,
      reversed: marked || log,
      reverseLog: reverseLog || null
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ error: String(error.code || "AUDIT_REVERSE_FAILED") });
    }
    return res.status(500).json({ error: "AUDIT_REVERSE_FAILED" });
  }
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

    await recordAuditLog(req, {
      action: "create",
      entityType: "user",
      entityId: created.user.id,
      summary: `Usuario criado: ${created.user.email}`,
      before: null,
      after: sanitizeUserForAudit(created.user),
      reversePayload: {
        type: "user_delete",
        payload: { id: created.user.id }
      }
    });

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
    const before = await findUserById(req.params.id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const updated = await adminUpdateUser(req.params.id, {
      ...parsed.data,
      email: parsed.data.email ? normalizeEmail(parsed.data.email) : undefined
    });

    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    if (updated.error === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    }

    await recordAuditLog(req, {
      action: "update",
      entityType: "user",
      entityId: before.id,
      summary: `Usuario atualizado: ${before.email}`,
      before: sanitizeUserForAudit(before),
      after: sanitizeUserForAudit(updated),
      reversePayload: {
        type: "user_update",
        payload: {
          id: before.id,
          patch: buildUserPatchFromSnapshot(before)
        }
      }
    });

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
    const before = await findUserById(req.params.id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const removed = await deleteUserById(req.params.id);
    if (!removed) return res.status(404).json({ error: "NOT_FOUND" });

    await recordAuditLog(req, {
      action: "delete",
      entityType: "user",
      entityId: before.id,
      summary: `Usuario removido: ${before.email}`,
      before: sanitizeUserForAudit(before),
      after: null,
      reversePayload: {
        type: "user_restore",
        payload: {
          snapshot: buildUserSnapshotForRestore(before)
        }
      }
    });

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
    const before = await findOrderById(req.params.id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });
    const updated = await updateOrder(req.params.id, parsed.data);
    const afterState = updated || before;
    const statusChanged = String(before.status || "") !== String(afterState.status || "");

    await recordAuditLog(req, {
      action: statusChanged ? "status_change" : "save",
      entityType: "order",
      entityId: before.id,
      summary: statusChanged
        ? `Pedido ${before.id}: status ${before.status} -> ${afterState.status}`
        : `Pedido salvo: ${before.id}`,
      before: sanitizeOrderForAudit(before),
      after: sanitizeOrderForAudit(afterState),
      reversePayload: {
        type: "order_update",
        payload: {
          id: before.id,
          patch: buildOrderPatchFromSnapshot(before)
        }
      }
    });

    return res.json({ ok: true, order: updated || before });
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

    await recordAuditLog(req, {
      action: "create",
      entityType: "product",
      entityId: created.id || created.sku,
      summary: `Produto criado: ${created.sku || created.id}`,
      before: null,
      after: sanitizeProductForAudit(created),
      reversePayload: {
        type: "product_delete",
        payload: {
          id: created.sku || created.id
        }
      }
    });

    return res.status(201).json({ ok: true, product: created });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRODUCT_CREATE_FAILED" });
  }
});

adminRouter.patch("/products/:id", async (req, res) => {
  const parsed = productPatchSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const before = await getProductByIdentifier(req.params.id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const updated = await updateProductByIdentifier(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    const activeChanged = Boolean(before.active) !== Boolean(updated.active);
    const becameActive = activeChanged && Boolean(updated.active);

    await recordAuditLog(req, {
      action: activeChanged ? (becameActive ? "activate" : "deactivate") : "save",
      entityType: "product",
      entityId: updated.sku || updated.id,
      summary: activeChanged
        ? `Produto ${updated.sku || updated.id}: ${becameActive ? "ativado" : "desativado"}`
        : `Produto salvo: ${updated.sku || updated.id}`,
      before: sanitizeProductForAudit(before),
      after: sanitizeProductForAudit(updated),
      reversePayload: {
        type: "product_update",
        payload: {
          id: updated.sku || updated.id,
          patch: buildProductPatchFromSnapshot(before)
        }
      }
    });

    return res.json({ ok: true, product: updated });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRODUCT_UPDATE_FAILED" });
  }
});

adminRouter.delete("/products/:id", async (req, res) => {
  try {
    const before = await getProductByIdentifier(req.params.id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const archived = await archiveProductByIdentifier(req.params.id);
    if (!archived) return res.status(404).json({ error: "NOT_FOUND" });

    await recordAuditLog(req, {
      action: "deactivate",
      entityType: "product",
      entityId: archived.sku || archived.id,
      summary: `Produto desativado: ${archived.sku || archived.id}`,
      before: sanitizeProductForAudit(before),
      after: sanitizeProductForAudit(archived),
      reversePayload: {
        type: "product_update",
        payload: {
          id: archived.sku || archived.id,
          patch: buildProductPatchFromSnapshot(before)
        }
      }
    });

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
    const before = await findVipSubscriberByEmail(payload.email);
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

    const created = !before || Number(before.id || 0) !== Number(subscriber?.id || 0);
    await recordAuditLog(req, {
      action: created ? "create" : "update",
      entityType: "vip_subscriber",
      entityId: String(subscriber?.id || ""),
      summary: created
        ? `Inscrito VIP criado: ${subscriber?.email || payload.email}`
        : `Inscrito VIP atualizado via upsert: ${subscriber?.email || payload.email}`,
      before: sanitizeVipForAudit(before),
      after: sanitizeVipForAudit(subscriber),
      reversePayload: created
        ? {
            type: "vip_delete",
            payload: {
              id: Number(subscriber?.id || 0)
            }
          }
        : {
            type: "vip_update",
            payload: {
              id: Number(subscriber?.id || 0),
              patch: buildVipPatchFromSnapshot(before)
            }
          }
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
    const before = await findVipSubscriberById(Number(req.params.id));
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const updated = await updateVipSubscriberById(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });

    await recordAuditLog(req, {
      action: "update",
      entityType: "vip_subscriber",
      entityId: String(updated.id),
      summary: `Inscrito VIP atualizado: ${updated.email}`,
      before: sanitizeVipForAudit(before),
      after: sanitizeVipForAudit(updated),
      reversePayload: {
        type: "vip_update",
        payload: {
          id: Number(updated.id),
          patch: buildVipPatchFromSnapshot(before)
        }
      }
    });

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
    const before = await findVipSubscriberById(id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const removed = await deleteVipSubscriberById(id);
    if (!removed) return res.status(404).json({ error: "NOT_FOUND" });

    await recordAuditLog(req, {
      action: "delete",
      entityType: "vip_subscriber",
      entityId: String(before.id),
      summary: `Inscrito VIP removido: ${before.email}`,
      before: sanitizeVipForAudit(before),
      after: null,
      reversePayload: {
        type: "vip_restore",
        payload: {
          snapshot: before
        }
      }
    });

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
