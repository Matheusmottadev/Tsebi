const express = require("express");
const rateLimit = require("express-rate-limit");
const Stripe = require("stripe");
const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const { z } = require("zod");
const {
  listUsers,
  findUserById,
  createUser,
  adminUpdateUser,
  searchUsersAdmin,
  adminDisableUserLogin,
  adminSetUserTempPassword,
  adminRestoreUserAuthSnapshot,
  invalidateUserSessions,
  deleteUserById,
  normalizeEmail,
  restoreUserFromSnapshot
} = require("./user-repository");
const { listOrders, updateOrder, findOrderById, deleteOrderById } = require("./lib/order-repository");
const {
  listAdminProducts,
  searchAdminProducts,
  getProductByIdentifier,
  createProduct,
  updateProductByIdentifier,
  archiveProductByIdentifier,
  deleteProductByIdentifier,
  restoreProductFromSnapshot
} = require("./lib/product-repository");
const {
  listVipSubscribers,
  searchVipSubscribers,
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
  searchAdminAuditLogs,
  findAdminAuditLogById,
  markAdminAuditLogReversed,
  isAuditLogReversible
} = require("./lib/admin-audit-repository");
const { ensureAdminProfile, updateAdminProfile } = require("./lib/admin-profile-repository");
const { listAdminLoginEvents } = require("./lib/admin-login-events-repository");
// Lazy load R2 upload module to avoid build-time errors
let uploadR2Buffer = null;
function getR2Upload() {
  if (!uploadR2Buffer) {
    uploadR2Buffer = require("./lib/cloudflare-r2-upload").uploadBuffer;
  }
  return uploadR2Buffer;
}
const { listShipmentsByOrderIds } = require("../src/db/queries/shipping.queries");
const { getVipDatabaseUrl } = require("./lib/vip-db");
const { requireAdmin, requireAdminCsrfForMutations } = require("./middlewares/requireAdmin");

let stripeClient = null;
function getStripeClient() {
  if (stripeClient) return stripeClient;
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) return null;
  stripeClient = new Stripe(key);
  return stripeClient;
}

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
adminRouter.use(async (req, _res, next) => {
  try {
    req.adminProfile = await ensureAdminProfile({
      userId: req.adminUser?.id || null,
      email: req.adminUser?.email || "",
      fallbackName: req.adminUser?.name || ""
    });
  } catch {
    req.adminProfile = null;
  }
  return next();
});

const sensitiveAdminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

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
  phone: z.string().trim().max(40).optional(),
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
  phone: z.string().trim().max(40).optional().default(""),
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
  orderStatus: statusSchema.optional(),
  paymentMethod: z.string().trim().min(1).max(40).optional(),
  installments: z.coerce.number().int().min(1).max(12).optional(),
  failureReason: z.string().trim().max(240).optional(),
  cancellationReason: z.string().trim().max(240).optional(),
  trackingId: z.string().trim().max(120).optional(),
  trackingStatus: z.string().trim().max(120).optional(),
  carrier: z.string().trim().max(120).optional(),
  shippingDeadline: z.string().trim().max(40).optional(),
  adminNotes: z.string().trim().max(10_000).optional()
});

const adminProfilePatchSchema = z.object({
  nickname: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().trim().max(600).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  accent: z.enum(["emerald", "blue", "violet", "amber", "rose", "slate"]).optional()
});

const productCreateSchema = z.object({
  sku: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(160),
  priceCents: z.coerce.number().int().min(0).max(9_999_999),
  stockQty: z.coerce.number().int().min(0).max(999_999),
  currency: z.string().trim().min(3).max(3).optional().default("brl"),
  imageUrl: z.string().trim().max(600).optional().default(""),
  active: z.boolean().optional().default(true)
});

const productPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  priceCents: z.coerce.number().int().min(0).max(9_999_999).optional(),
  stockQty: z.coerce.number().int().min(0).max(999_999).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  imageUrl: z.string().trim().max(600).optional(),
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

function maskCpfForList(cpf) {
  const digits = String(cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return "";
  return `***.***.***-${digits.slice(-2)}`;
}

function detectImageKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return "";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "gif";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }
  return "";
}

function generateTempPassword() {
  // Compatível com a policy atual: 8-128, precisa de letra e dígito.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = crypto.randomBytes(10).toString("base64url"); // ~14 chars
    if (candidate.length >= 8 && /[A-Za-z]/.test(candidate) && /\d/.test(candidate)) {
      return candidate;
    }
  }
  // Fallback determinístico se RNG cair em casos raros.
  return `Tmp${Date.now().toString(36)}9A`;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: String(user.phone || ""),
    loginDisabled: Boolean(user.loginDisabled),
    lastLoginAt: user.lastLoginAt || null,
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

function sanitizeUserList(user) {
  const full = sanitizeUser(user);
  if (!full) return null;
  return {
    id: full.id,
    name: full.name,
    email: full.email,
    phone: full.phone || "",
    status: full.loginDisabled ? "disabled" : "active",
    lastLoginAt: full.lastLoginAt || null,
    createdAt: full.createdAt || null,
    cpf: maskCpfForList(full.cpf || ""),
    cep: full.cep || ""
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
    actorAdminId: req.adminProfile?.id || null,
    actorUserId: req.adminUser?.id || null,
    actorEmail: normalizeEmail(req.adminUser?.email || ""),
    requestIp: req.ip || "",
    userAgent: String(req.headers["user-agent"] || "")
  };
}

function computeChangedFields(before, after) {
  if (!before || !after) return [];
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => String(key));
}

function sanitizeUserForAudit(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: String(user.phone || ""),
    loginDisabled: Boolean(user.loginDisabled),
    passwordResetRequired: Boolean(user.passwordResetRequired),
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
    passwordResetRequired: Boolean(user.passwordResetRequired),
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
    trackingId: String(order.trackingId || ""),
    trackingStatus: String(order.trackingStatus || ""),
    carrier: String(order.carrier || ""),
    shippingDeadline: order.shippingDeadline || null,
    adminNotes: String(order.adminNotes || ""),
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
    cancellationReason: order.cancellationReason || "",
    trackingId: String(order.trackingId || ""),
    trackingStatus: String(order.trackingStatus || ""),
    carrier: String(order.carrier || ""),
    shippingDeadline: order.shippingDeadline || null,
    adminNotes: String(order.adminNotes || "")
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
    imageUrl: String(product.image || ""),
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
    imageUrl: String(product.image || ""),
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
  const before = payload.before ?? null;
  const after = payload.after ?? null;
  const changedFields =
    Array.isArray(payload.changedFields) && payload.changedFields.length > 0
      ? payload.changedFields
      : computeChangedFields(before, after);
  return insertAdminAuditLog({
    ...payload,
    ...actor,
    changedFields,
    reversible: payload.reversible
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

  if (type === "user_auth_restore") {
    const targetId = String(payload.id || "").trim();
    const snapshot = payload.snapshot || {};
    if (!targetId) throw createAdminError("AUDIT_INVALID_PAYLOAD", 400);
    const before = await findUserById(targetId);
    if (!before) throw createAdminError("NOT_FOUND", 404);
    const restored = await adminRestoreUserAuthSnapshot(targetId, snapshot);
    const after = restored || (await findUserById(targetId));
    return {
      summary: `Reversao aplicada: credenciais do usuario ${targetId} restauradas.`,
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
  return res.json({ admin: req.adminUser, profile: req.adminProfile || null });
});

adminRouter.patch("/me", async (req, res) => {
  const parsed = adminProfilePatchSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const updated = await updateAdminProfile(req.adminUser?.id || null, parsed.data);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });

    await recordAuditLog(req, {
      action: "update",
      entityType: "admin_profile",
      entityId: String(updated.id || ""),
      summary: `Perfil admin atualizado: ${updated.email}`,
      before: req.adminProfile || null,
      after: updated,
      reversePayload: null,
      reversible: false
    });

    req.adminProfile = updated;
    return res.json({ ok: true, profile: updated });
  } catch {
    return res.status(500).json({ error: "ADMIN_PROFILE_UPDATE_FAILED" });
  }
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

adminRouter.get("/audit", async (req, res) => {
  const queryText = String(req.query.query || "").trim();
  const actor = String(req.query.actor || "").trim();
  const resourceType = String(req.query.resourceType || "").trim();
  const action = String(req.query.action || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 50);

  try {
    const result = await searchAdminAuditLogs({
      query: queryText,
      actor,
      entityType: resourceType,
      action,
      from,
      to,
      page,
      pageSize
    });
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "ADMIN_AUDIT_LIST_FAILED" });
  }
});

adminRouter.get("/audit/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });
  try {
    const log = await findAdminAuditLogById(id);
    if (!log) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ log });
  } catch {
    return res.status(500).json({ error: "ADMIN_AUDIT_FETCH_FAILED" });
  }
});

adminRouter.get("/admin-logins", async (req, res) => {
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const adminId = String(req.query.adminId || "").trim();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 30);

  try {
    const result = await listAdminLoginEvents({ from, to, adminId, page, pageSize });
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "ADMIN_LOGINS_LIST_FAILED" });
  }
});

adminRouter.post("/audit/:id/revert", sensitiveAdminRateLimit, async (req, res) => {
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
      action: "revert",
      entityType: reverseResult.entityType || log.entityType,
      entityId: reverseResult.entityId || log.entityId,
      summary: reverseResult.summary || `Reversao da alteracao ${log.id}`,
      before: reverseResult.before || null,
      after: reverseResult.after || null,
      reversePayload: null,
      meta: {
        reverseOfAuditId: log.id
      },
      reversible: false
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
      reverted: marked || log,
      revertLog: reverseLog || null
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ error: String(error.code || "AUDIT_REVERT_FAILED") });
    }
    return res.status(500).json({ error: "AUDIT_REVERT_FAILED" });
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
  const queryText = String(req.query.query || req.query.search || "").trim();
  const status = String(req.query.status || "").trim();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || req.query.limit || 100);
  const offset = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, pageSize));

  try {
    if (String(req.query.page || "").trim() || String(req.query.pageSize || "").trim() || status) {
      const result = await searchUsersAdmin({ query: queryText, status, page, pageSize });
      return res.json({
        users: result.rows,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        count: result.rows.length,
        limit: result.pageSize,
        offset
      });
    }

    const users = await listUsers({ limit: pageSize, offset, search: queryText });
    return res.json({
      users: users.map(sanitizeUserList),
      count: users.length,
      limit: pageSize,
      offset
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_USERS_LIST_FAILED" });
  }
});

adminRouter.get("/users/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ user: sanitizeUser(user) });
  } catch {
    return res.status(500).json({ error: "ADMIN_USER_FETCH_FAILED" });
  }
});

adminRouter.post("/users/:id/temp-password", sensitiveAdminRateLimit, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const before = await findUserById(id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 12);
    const updated = await adminSetUserTempPassword(id, hash);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });

    await invalidateUserSessions(id);

    await recordAuditLog(req, {
      action: "temp_password",
      entityType: "user",
      entityId: before.id,
      summary: `Senha temporaria gerada: ${before.email}`,
      before: sanitizeUserForAudit(before),
      after: sanitizeUserForAudit(updated),
      reversePayload: {
        type: "user_auth_restore",
        payload: {
          id: before.id,
          snapshot: {
            passwordHash: before.passwordHash || "",
            loginDisabled: Boolean(before.loginDisabled),
            passwordResetRequired: Boolean(before.passwordResetRequired)
          }
        }
      }
    });

    return res.json({ ok: true, tempPassword });
  } catch {
    return res.status(500).json({ error: "ADMIN_TEMP_PASSWORD_FAILED" });
  }
});

adminRouter.post("/users/:id/logout", sensitiveAdminRateLimit, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const before = await findUserById(id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });
    const result = await invalidateUserSessions(id);
    if (!result.ok) return res.status(500).json({ error: "ADMIN_USER_LOGOUT_FAILED" });

    await recordAuditLog(req, {
      action: "logout_sessions",
      entityType: "user",
      entityId: before.id,
      summary: `Sessoes invalidadas: ${before.email}`,
      before: sanitizeUserForAudit(before),
      after: sanitizeUserForAudit(before),
      reversePayload: null,
      reversible: false
    });

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "ADMIN_USER_LOGOUT_FAILED" });
  }
});

adminRouter.delete("/users/:id/login", sensitiveAdminRateLimit, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const before = await findUserById(id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });
    const disabled = await adminDisableUserLogin(id);
    if (!disabled) return res.status(404).json({ error: "NOT_FOUND" });
    await invalidateUserSessions(id);

    await recordAuditLog(req, {
      action: "disable_login",
      entityType: "user",
      entityId: before.id,
      summary: `Login desativado: ${before.email}`,
      before: sanitizeUserForAudit(before),
      after: sanitizeUserForAudit(disabled),
      reversePayload: {
        type: "user_auth_restore",
        payload: {
          id: before.id,
          snapshot: {
            passwordHash: before.passwordHash || "",
            loginDisabled: Boolean(before.loginDisabled),
            passwordResetRequired: Boolean(before.passwordResetRequired)
          }
        }
      }
    });

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "ADMIN_USER_DISABLE_LOGIN_FAILED" });
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
      phone: String(payload.phone || "").trim().slice(0, 40),
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
      email: parsed.data.email ? normalizeEmail(parsed.data.email) : undefined,
      phone: parsed.data.phone == null ? undefined : String(parsed.data.phone || "").trim().slice(0, 40)
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
  const status = String(req.query.status || "").trim().toLowerCase();
  const queryText = String(req.query.query || req.query.search || "").trim().toLowerCase();

  const page = String(req.query.page || "").trim() ? Math.max(1, Number(req.query.page) || 1) : null;
  const pageSize = String(req.query.pageSize || "").trim() ? Math.max(1, Math.min(200, Number(req.query.pageSize) || 50)) : null;
  const limit = pageSize != null ? pageSize : Number(req.query.limit || 100);
  const offset = page != null ? (page - 1) * limit : Number(req.query.offset || 0);

  try {
    const orders = await listOrders();
    const filtered = orders.filter((order) => {
      const matchesStatus = status ? String(order.status || "").toLowerCase() === status : true;
      if (!matchesStatus) return false;
      if (!queryText) return true;
      const payload = `${order.id} ${order.userEmail || ""} ${order.userName || ""}`.toLowerCase();
      return payload.includes(queryText);
    });
    const paged = paginateArray(filtered, limit, offset);
    const shipmentsByOrderId = await listShipmentsByOrderIds(
      paged.rows.map((order) => String(order.id)).filter(Boolean)
    );
    const ordersWithShipping = paged.rows.map((order) => {
      const shipment = shipmentsByOrderId.get(String(order.id)) || null;
      const safeShipment = shipment
        ? {
            id: shipment.id,
            provider: shipment.provider,
            trackingCode: shipment.trackingCode || "",
            status: shipment.status || "",
            updatedAt: shipment.updatedAt || null
          }
        : null;

      return {
        id: order.id,
        createdAt: order.createdAt || null,
        updatedAt: order.updatedAt || null,
        status: order.status,
        currency: order.currency || "brl",
        amount: Number(order.amount || 0),
        itemsAmount: Number(order.itemsAmount || 0),
        shippingAmount: Number(order.shippingAmount || 0),
        shippingPriceCents: Number(order.shippingPriceCents || order.shippingAmount || 0),
        shippingSelectedProvider: String(order.shippingSelectedProvider || ""),
        shippingSelectedService: String(order.shippingSelectedService || ""),
        shippingSelectedServiceCode: String(order.shippingSelectedServiceCode || ""),
        shippingSelectedCarrierName: String(order.shippingSelectedCarrierName || ""),
        shippingDeadlineDays: order.shippingDeadlineDays == null ? null : Number(order.shippingDeadlineDays),
        shippingDestinationZip: String(order.shippingDestinationZip || ""),
        userEmail: order.userEmail || "",
        userName: order.userName || "",
        trackingId: String(order.trackingId || ""),
        trackingStatus: String(order.trackingStatus || ""),
        carrier: String(order.carrier || ""),
        shippingDeadline: order.shippingDeadline || null,
        shipment: safeShipment
      };
    });
    return res.json({
      orders: ordersWithShipping,
      total: paged.total,
      limit: paged.limit,
      offset: paged.offset,
      page: page != null ? page : Math.floor(paged.offset / paged.limit) + 1,
      pageSize: paged.limit
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
    const nextPatch = {
      ...parsed.data,
      status: parsed.data.orderStatus ?? parsed.data.status
    };
    delete nextPatch.orderStatus;
    if (nextPatch.status == null || String(nextPatch.status || "").trim() === "") {
      delete nextPatch.status;
    }
    if (nextPatch.shippingDeadline) {
      const deadline = new Date(String(nextPatch.shippingDeadline || ""));
      nextPatch.shippingDeadline = Number.isNaN(deadline.getTime()) ? null : deadline.toISOString();
    }

    const beforeStatus = String(before.status || "").trim().toLowerCase();
    const requestedStatus = String(nextPatch.status || "").trim().toLowerCase();
    if (beforeStatus === "refunded" && requestedStatus && requestedStatus !== "refunded") {
      return res.status(409).json({ error: "ORDER_REFUNDED_LOCKED" });
    }

    if (requestedStatus === "canceled") {
      if (!before.stripePaymentIntentId) {
        return res.status(409).json({ error: "ORDER_NOT_REFUNDABLE" });
      }
      const stripe = getStripeClient();
      if (!stripe) return res.status(500).json({ error: "STRIPE_NOT_CONFIGURED" });

      const refund = await stripe.refunds.create({
        payment_intent: before.stripePaymentIntentId
      });

      nextPatch.status = "refunded";
      nextPatch.refundedAt = new Date().toISOString();
      nextPatch.stripeRefundId = refund?.id || before.stripeRefundId || null;
      nextPatch.cancellationReason = nextPatch.cancellationReason || "refunded_by_admin";
    }

    const updated = await updateOrder(req.params.id, nextPatch);
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

adminRouter.delete("/orders/:id", sensitiveAdminRateLimit, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const removed = await deleteOrderById(id);
    if (!removed) return res.status(404).json({ error: "NOT_FOUND" });

    await recordAuditLog(req, {
      action: "delete",
      entityType: "order",
      entityId: String(removed.id),
      summary: `Pedido removido: ${removed.id}`,
      before: sanitizeOrderForAudit(removed),
      after: null,
      reversePayload: null,
      reversible: false
    });

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "ADMIN_ORDER_DELETE_FAILED" });
  }
});

adminRouter.get("/orders/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const order = await findOrderById(id);
    if (!order) return res.status(404).json({ error: "NOT_FOUND" });
    const shipmentsByOrderId = await listShipmentsByOrderIds([String(order.id)]);
    const shipment = shipmentsByOrderId.get(String(order.id)) || null;
    return res.json({ order: { ...order, shipment } });
  } catch {
    return res.status(500).json({ error: "ADMIN_ORDER_FETCH_FAILED" });
  }
});

adminRouter.get("/products", async (req, res) => {
  try {
    const queryText = String(req.query.query || req.query.search || "").trim();
    const status = String(req.query.status || "").trim();
    const stock = String(req.query.stock || "").trim();

    if (String(req.query.page || "").trim() || String(req.query.pageSize || "").trim()) {
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 50);
      const result = await searchAdminProducts({ query: queryText, status, stock, page, pageSize });
      return res.json({
        rows: result.rows,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        products: result.rows,
        count: result.rows.length,
        limit: result.pageSize,
        offset: (Math.max(1, result.page) - 1) * Math.max(1, result.pageSize)
      });
    }

    const limit = Number(req.query.limit || 200);
    const offset = Number(req.query.offset || 0);
    const includeInactive = String(req.query.includeInactive || "1") !== "0";
    const products = await listAdminProducts({ limit, offset, search: queryText, includeInactive });
    return res.json({ products, count: products.length, limit, offset });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRODUCTS_LIST_FAILED" });
  }
});

adminRouter.get("/products/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });
  try {
    const product = await getProductByIdentifier(id);
    if (!product) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ product });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRODUCT_FETCH_FAILED" });
  }
});

adminRouter.post(
  "/products/:id/image",
  sensitiveAdminRateLimit,
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    limit: "6mb"
  }),
  async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "INVALID_ID" });

    const contentType = String(req.headers["content-type"] || "").trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)) {
      return res.status(415).json({ error: "UNSUPPORTED_IMAGE_TYPE" });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "IMAGE_REQUIRED" });
    }

    const kind = detectImageKind(req.body);
    if (!kind) {
      return res.status(415).json({ error: "UNSUPPORTED_IMAGE_TYPE" });
    }

    try {
      const before = await getProductByIdentifier(id);
      if (!before) return res.status(404).json({ error: "NOT_FOUND" });

      const folder = String(process.env.R2_FOLDER || "tsebi/products").trim() || "tsebi/products";
      const publicId = `product_${String(before.sku || before.id || id).trim()}`;
      const uploaded = await getR2Upload()(req.body, { folder, publicId });
      const url = String(uploaded?.secure_url || uploaded?.url || "").trim();
      if (!url) return res.status(500).json({ error: "IMAGE_UPLOAD_FAILED" });

      const updated = await updateProductByIdentifier(id, { imageUrl: url });
      if (!updated) return res.status(404).json({ error: "NOT_FOUND" });

      await recordAuditLog(req, {
        action: "save",
        entityType: "product",
        entityId: updated.sku || updated.id,
        summary: `Imagem atualizada: ${updated.sku || updated.id}`,
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

      return res.json({
        ok: true,
        product: updated,
        image: {
          url,
          bytes: Number(uploaded?.bytes || 0) || null,
          format: String(uploaded?.format || "") || null,
          width: Number(uploaded?.width || 0) || null,
          height: Number(uploaded?.height || 0) || null
        }
      });
    } catch (error) {
      if (String(error?.code || "") === "R2_NOT_CONFIGURED") {
        return res.status(500).json({ error: "R2_NOT_CONFIGURED" });
      }
      if (String(error?.code || "") === "R2_UPLOAD_FAILED") {
        console.error("R2 upload error:", error);
        return res.status(500).json({ error: "IMAGE_UPLOAD_FAILED" });
      }
      return res.status(500).json({ error: "IMAGE_UPLOAD_FAILED" });
    }
  }
);

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
    const masked = subscribers.map((s) => ({
      id: s.id,
      name: s.name || "",
      email: s.email || "",
      birthDate: s.birthDate || "",
      cpf: maskCpfForList(s.cpf || ""),
      cep: s.cep || "",
      source: s.source || "",
      accountCreated: Boolean(s.accountCreated),
      subscribedAt: s.subscribedAt || null,
      updatedAt: s.updatedAt || null
    }));
    return res.json({ subscribers: masked, count: masked.length, limit, offset });
  } catch (error) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_LIST_FAILED" });
  }
});

adminRouter.get("/vip", async (req, res) => {
  try {
    assertVipDbConfigured();
    const queryText = String(req.query.query || "").trim();
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 50);
    const result = await searchVipSubscribers({ query: queryText, page, pageSize });
    return res.json({
      rows: result.rows.map((s) => ({
        id: s.id,
        name: s.name || "",
        email: s.email || "",
        phone: "",
        cpf: maskCpfForList(s.cpf || ""),
        cep: s.cep || "",
        source: s.source || "",
        subscribedAt: s.subscribedAt || null,
        accountCreated: Boolean(s.accountCreated)
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize
    });
  } catch (error) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_LIST_FAILED" });
  }
});

adminRouter.get("/vip/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "INVALID_ID" });

  try {
    assertVipDbConfigured();
    const subscriber = await findVipSubscriberById(id);
    if (!subscriber) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ subscriber });
  } catch (error) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_FETCH_FAILED" });
  }
});

adminRouter.post("/vip", async (req, res) => {
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

adminRouter.patch("/vip/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "INVALID_ID" });

  const parsed = vipUpsertSchema.partial().safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    assertVipDbConfigured();
    const before = await findVipSubscriberById(id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const updated = await updateVipSubscriberById(id, parsed.data);
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

adminRouter.delete("/vip/:id", async (req, res) => {
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
