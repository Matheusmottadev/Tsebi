const express = require("express");
const path = require("node:path");
const rateLimit = require("express-rate-limit");
const Stripe = require("stripe");
const crypto = require("node:crypto");
const { z } = require("zod");
const { hashPassword } = require("./lib/password-hash");
const {
  listUsers,
  findUserById,
  createUser,
  adminUpdateUser,
  adminSetUserLoginDisabled,
  searchUsersAdmin,
  adminDisableUserLogin,
  adminSetUserTempPassword,
  adminRestoreUserAuthSnapshot,
  invalidateUserSessions,
  deleteUserById,
  normalizeEmail,
  createPasswordResetToken,
  restoreUserFromSnapshot
} = require("./user-repository");
const { listOrders, listOrdersByUserId, updateOrder, findOrderById, deleteOrderById } = require("./lib/order-repository");
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
const { readJson, writeJson } = require("./lib/json-store");
const { sendEmail, sendPasswordResetEmail } = require("./lib/email-service");
const { sendRepairAcceptedEmail, sendRepairRejectedEmail, sendRepairStageUpdateEmail } = require("./lib/repair-email-service");
const { issueAuthEmailCode } = require("./lib/auth-email-code-repository");
const {
  listAccessCodes,
  upsertAccessCode,
  deleteAccessCode,
  normalizeCode
} = require("./lib/access-code-repository");
const {
  listAdminAppointmentSlots,
  createAdminAppointmentSlot,
  updateAdminAppointmentSlot,
  deleteAdminAppointmentSlot,
  cancelAdminAppointment,
  rescheduleAdminAppointment,
} = require("./lib/appointments-repository");
const {
  ensureRepairTables,
  listAdminRepairRequests,
  updateRepairRequestStatus,
} = require("./lib/repairs-repository");
const { logServerEvent, buildRequestLogContext, toErrorMeta } = require("./lib/observability-log");
const { query, withTransaction } = require("./lib/db");
// Lazy load R2 upload module to avoid build-time errors
let uploadR2Buffer: any = null;
function getR2Upload() {
  if (!uploadR2Buffer) {
    uploadR2Buffer = require("./lib/cloudflare-r2-upload").uploadBuffer;
  }
  return uploadR2Buffer;
}
const {
  listShipmentsByOrderIds,
  upsertShipmentPending,
  updateShipmentTracking
} = require("../src/db/queries/shipping.queries");
const {
  INTERNAL_TRACKING_STATES,
  mapMelhorEnvioStatusToInternal
} = require("../src/shipping/melhorenvio-status");
const { getVipDatabaseUrl } = require("./lib/vip-db");
const { requireAdmin, requireAdminCsrfForMutations } = require("./middlewares/requireAdmin");
const newsletterDataFile = path.resolve(__dirname, "..", "data", "newsletter-subscribers.json");

let stripeClient: any = null;
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
adminRouter.use(async (req: any, _res: any, next: any) => {
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

const orderItemPatchSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(240).optional(),
  qty: z.coerce.number().int().min(1).max(999),
  unitAmount: z.coerce.number().int().min(0).max(9_999_999),
  currency: z.string().trim().min(3).max(3).optional(),
  variantColor: z.string().trim().max(80).optional(),
  variantSize: z.string().trim().max(40).optional(),
  variantKey: z.string().trim().max(160).optional()
});

const userPatchSchema = z.object({
  title: z.enum(["sr", "sra", "srta", "nao_informar"]).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(40).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
  cpf: z
    .string()
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => value.length === 0 || /^\d{11}$/.test(value))
    .optional(),
  cep: z
    .string()
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => value.length === 0 || /^\d{8}$/.test(value))
    .optional()
});

const userCreateSchema = z.object({
  title: z.enum(["sr", "sra", "srta", "nao_informar"]).optional().default("nao_informar"),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional().default(""),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((value: any) => /[A-Za-z]/.test(value) && /\d/.test(value)),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional().default(""),
  cpf: z
    .string()
    .optional()
    .default("")
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => value.length === 0 || /^\d{11}$/.test(value)),
  cep: z
    .string()
    .optional()
    .default("")
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => value.length === 0 || /^\d{8}$/.test(value))
});

const orderPatchSchema = z.object({
  status: statusSchema.optional(),
  orderStatus: statusSchema.optional(),
  paymentMethod: z.string().trim().min(1).max(40).optional(),
  installments: z.coerce.number().int().min(1).max(12).optional(),
  failureReason: z.string().trim().max(240).optional(),
  cancellationReason: z.string().trim().max(240).optional(),
  trackingId: z.string().trim().max(120).optional(),
  trackingCode: z.string().trim().max(120).optional(),
  trackingStatus: z.string().trim().max(120).optional(),
  carrier: z.string().trim().max(120).optional(),
  shippingDeadline: z.string().trim().max(40).optional(),
  adminNotes: z.string().trim().max(10_000).optional(),
  userName: z.string().trim().min(1).max(160).optional(),
  userEmail: z.string().trim().email().optional(),
  userPhone: z.string().trim().max(40).optional(),
  userCpf: z
    .string()
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => value.length === 0 || /^\d{11}$/.test(value))
    .optional(),
  shippingStreet: z.string().trim().max(160).optional(),
  shippingNumber: z.string().trim().max(30).optional(),
  shippingComplement: z.string().trim().max(120).optional(),
  shippingDistrict: z.string().trim().max(120).optional(),
  shippingCity: z.string().trim().max(120).optional(),
  shippingState: z.string().trim().max(4).optional(),
  shippingAmount: z.coerce.number().int().min(0).max(9_999_999).optional(),
  shippingPriceCents: z.coerce.number().int().min(0).max(9_999_999).optional(),
  shippingSelectedProvider: z.string().trim().max(120).optional(),
  shippingSelectedService: z.string().trim().max(120).optional(),
  shippingSelectedServiceCode: z.string().trim().max(120).optional(),
  shippingSelectedCarrierName: z.string().trim().max(120).optional(),
  shippingDestinationZip: z
    .string()
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => value.length === 0 || /^\d{8}$/.test(value))
    .optional(),
  shipping: z.record(z.string(), z.any()).optional(),
  amount: z.coerce.number().int().min(0).max(9_999_999).optional(),
  itemsAmount: z.coerce.number().int().min(0).max(9_999_999).optional(),
  items: z.array(orderItemPatchSchema).max(200).optional(),
  discountCents: z.coerce.number().int().min(0).max(9_999_999).optional(),
  couponCode: z.string().trim().max(80).optional()
});

const adminProfilePatchSchema = z.object({
  nickname: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().trim().max(600).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  accent: z.enum(["emerald", "blue", "violet", "amber", "rose", "slate"]).optional()
});

const productOptionListSchema = z.array(z.string().trim().min(1).max(40)).max(40);
const productVariantStockSchema = z.record(
  z.string().trim().min(3).max(120),
  z.coerce.number().int().min(0).max(999_999)
);
const productAvailabilityStatusSchema = z.enum(["disponivel", "esgotando", "esgotado"]);

const productCreateSchema = z.object({
  sku: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(160),
  priceCents: z.coerce.number().int().min(0).max(9_999_999),
  stockQty: z.coerce.number().int().min(0).max(999_999),
  currency: z.string().trim().min(3).max(3).optional().default("brl"),
  imageUrl: z.string().trim().max(600).optional().default(""),
  active: z.boolean().optional().default(true),
  sizes: productOptionListSchema.optional().default([]),
  colors: productOptionListSchema.optional().default([]),
  variantStock: productVariantStockSchema.optional().default({}),
  availabilityStatus: productAvailabilityStatusSchema.optional().default("disponivel"),
  collection: z.string().trim().max(120).optional().default(""),
  category: z.string().trim().max(120).optional().default(""),
  subcategory: z.string().trim().max(120).optional().default(""),
  material: z.string().trim().max(160).optional().default(""),
  gender: z.string().trim().max(40).optional().default(""),
  secondaryImage: z.string().trim().max(600).optional().default(""),
  galleryImages: z.array(z.string().trim().max(600)).max(5).optional().default([]),
  modelInfo: z.string().trim().max(200).optional().default(""),
  fitType: z.string().trim().max(120).optional().default(""),
  sizeRecommendation: z.string().trim().max(240).optional().default(""),
  detailedModeling: z.string().trim().max(2000).optional().default(""),
  materialMain: z.string().trim().max(160).optional().default(""),
  cleaningRecommendation: z.string().trim().max(2000).optional().default(""),
  careList: z.array(z.string().trim().min(1).max(240)).max(40).optional().default([])
});

const productPatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  priceCents: z.coerce.number().int().min(0).max(9_999_999).optional(),
  stockQty: z.coerce.number().int().min(0).max(999_999).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  imageUrl: z.string().trim().max(600).optional(),
  active: z.boolean().optional(),
  sizes: productOptionListSchema.optional(),
  colors: productOptionListSchema.optional(),
  variantStock: productVariantStockSchema.optional(),
  availabilityStatus: productAvailabilityStatusSchema.optional(),
  collection: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  subcategory: z.string().trim().max(120).optional(),
  material: z.string().trim().max(160).optional(),
  gender: z.string().trim().max(40).optional(),
  secondaryImage: z.string().trim().max(600).optional(),
  galleryImages: z.array(z.string().trim().max(600)).max(5).optional(),
  modelInfo: z.string().trim().max(200).optional(),
  fitType: z.string().trim().max(120).optional(),
  sizeRecommendation: z.string().trim().max(240).optional(),
  detailedModeling: z.string().trim().max(2000).optional(),
  materialMain: z.string().trim().max(160).optional(),
  cleaningRecommendation: z.string().trim().max(2000).optional(),
  careList: z.array(z.string().trim().min(1).max(240)).max(40).optional()
});

const vipUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional().default(""),
  cpf: z
    .string()
    .optional()
    .default("")
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => value.length === 0 || /^\d{11}$/.test(value)),
  cep: z
    .string()
    .optional()
    .default("")
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => value.length === 0 || /^\d{8}$/.test(value)),
  accountCreated: z.boolean().optional().default(false)
});

const newsletterSendSchema = z.object({
  subject: z.string().trim().min(3).max(180),
  html: z.string().trim().min(10).max(100_000),
  text: z.string().trim().max(100_000).optional().default(""),
  source: z.string().trim().max(80).optional().default(""),
  testEmail: z.string().trim().email().optional().default("")
});

const privateCarePatchSchema = z.object({
  status: z.enum(["pending", "accepted", "declined", "scheduled", "completed", "canceled"]).optional(),
  decision: z.enum(["accept", "decline"]).optional(),
  adminNote: z.string().trim().max(2000).optional(),
  availableSlots: z.array(z.string().trim().min(1).max(120)).max(12).optional()
});

const repairPatchSchema = z.object({
  decision: z.enum(["accept", "reject"]).optional(),
  status: z.enum(["awaiting_shipment", "item_received", "in_repair", "completed", "returned"]).optional(),
  rejectionReason: z.string().trim().max(2000).optional().default(""),
  adminNote: z.string().trim().max(2000).optional().default(""),
  trackingCode: z.string().trim().max(160).optional().default(""),
  pieceReceivedAt: z.string().trim().max(80).nullable().optional(),
  returnPostedAt: z.string().trim().max(80).nullable().optional(),
  returnedDeliveredAt: z.string().trim().max(80).nullable().optional(),
}).refine((value: any) => Boolean(value.decision || value.status), {
  message: "INVALID_INPUT",
}).refine((value: any) => !(value.decision && value.status), {
  message: "INVALID_INPUT",
});

const appointmentSlotCreateSchema = z.object({
  startsAt: z.string().trim().max(80),
  endsAt: z.string().trim().max(80),
  label: z.string().trim().max(160).optional().default(""),
  modality: z.string().trim().max(120).optional().default(""),
  location: z.string().trim().max(160).optional().default(""),
  adminNote: z.string().trim().max(2000).optional().default(""),
  capacity: z.coerce.number().int().min(1).max(20).optional().default(1),
  isAvailable: z.coerce.boolean().optional().default(true),
  isBlocked: z.coerce.boolean().optional().default(false)
});

const appointmentSlotPatchSchema = z.object({
  startsAt: z.string().trim().max(80).optional(),
  endsAt: z.string().trim().max(80).optional(),
  label: z.string().trim().max(160).optional(),
  modality: z.string().trim().max(120).optional(),
  location: z.string().trim().max(160).optional(),
  adminNote: z.string().trim().max(2000).optional(),
  capacity: z.coerce.number().int().min(1).max(20).optional(),
  isAvailable: z.coerce.boolean().optional(),
  isBlocked: z.coerce.boolean().optional()
});

const accessCodeUpsertSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .transform((value: any) => normalizeCode(value)),
  type: z.enum(["percent", "fixed", "free_shipping"]).default("percent"),
  percentOff: z.coerce.number().int().min(0).max(100).optional().default(0),
  amountOffCents: z.coerce.number().int().min(0).max(9_999_999).optional().default(0),
  minSubtotalCents: z.coerce.number().int().min(0).max(9_999_999).optional().default(0),
  maxDiscountCents: z.coerce.number().int().min(0).max(9_999_999).optional().default(0),
  maxUses: z.coerce.number().int().min(0).optional().default(0),
  firstPurchaseOnly: z.coerce.boolean().optional().default(false),
  active: z.coerce.boolean().optional().default(true),
  startsAt: z.string().trim().max(40).optional().default(""),
  expiresAt: z.string().trim().max(40).optional().default(""),
  description: z.string().trim().max(180).optional().default("")
});

function maskCpfForList(cpf: any) {
  const digits = String(cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return "";
  return `***.***.***-${digits.slice(-2)}`;
}

function detectImageKind(buffer: any) {
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

function normalizeBaseUrl(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

function resolvePublicBaseUrl() {
  const explicit = String(
    process.env.APP_BASE_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.SITE_URL ||
      process.env.PUBLIC_SITE_URL ||
      ""
  ).trim();
  if (explicit) return normalizeBaseUrl(explicit);
  const corsOrigin = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((item: any) => String(item || "").trim())
    .find(Boolean);
  if (corsOrigin) return normalizeBaseUrl(corsOrigin);
  const inferred = process.env.VERCEL_URL || process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "";
  return normalizeBaseUrl(inferred);
}

function buildAdminResetPasswordLink(email: any, token: any) {
  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl) return "";
  const params = new URLSearchParams();
  params.set("email", normalizeEmail(email || ""));
  params.set("token", String(token || ""));
  params.set("source", "admin");
  return `${baseUrl}/recuperar-senha-codigo?${params.toString()}`;
}

function sanitizeUser(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    title: String(user.title || ""),
    name: user.name,
    email: user.email,
    phone: String(user.phone || ""),
    loginDisabled: Boolean(user.loginDisabled),
    passwordResetRequired: Boolean(user.passwordResetRequired),
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

function sanitizeUserList(user: any) {
  const full = sanitizeUser(user);
  if (!full) return null;
  return {
    id: full.id,
    title: full.title || "",
    name: full.name,
    email: full.email,
    phone: full.phone || "",
    status: full.loginDisabled ? "disabled" : "active",
    passwordSetupPending: Boolean(full.passwordResetRequired),
    lastLoginAt: full.lastLoginAt || null,
    createdAt: full.createdAt || null,
    cpf: maskCpfForList(full.cpf || ""),
    cep: full.cep || ""
  };
}

function paginateArray(items: any, limit: any, offset: any) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const total = Array.isArray(items) ? items.length : 0;
  const rows = Array.isArray(items) ? items.slice(safeOffset, safeOffset + safeLimit) : [];
  return { rows, total, limit: safeLimit, offset: safeOffset };
}

function assertVipDbConfigured() {
  const vipDbUrl = getVipDatabaseUrl();
  if (!vipDbUrl) {
    const error = new Error("VIP_DATABASE_NOT_CONFIGURED") as Error & {
      code?: string;
    };
    error.code = "VIP_DATABASE_NOT_CONFIGURED";
    throw error;
  }
}

function createAdminError(code: any, status: any = 400) {
  const error = new Error(code) as Error & {
    code?: string;
    status?: number;
  };
  error.code = code;
  error.status = status;
  return error;
}

let privateCareColumnsPromise: Promise<void> | null = null;
async function ensurePrivateCareColumns() {
  if (!privateCareColumnsPromise) {
    privateCareColumnsPromise = (async () => {
      await query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS account_private_care_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS account_private_care_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
      `);
    })().catch((error: any) => {
      privateCareColumnsPromise = null;
      throw error;
    });
  }
  return privateCareColumnsPromise;
}

function normalizePrivateCareStatus(value: any) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || ["pending", "pendente", "novo", "new"].includes(raw)) return "pending";
  if (["accepted", "aceito", "aprovado"].includes(raw)) return "accepted";
  if (["declined", "recusado", "rejected"].includes(raw)) return "declined";
  if (["scheduled", "agendado"].includes(raw)) return "scheduled";
  if (["completed", "concluido", "concluído", "finalizado", "done"].includes(raw)) return "completed";
  if (["canceled", "cancelado", "cancelled"].includes(raw)) return "canceled";
  return raw;
}

function normalizePrivateCareSlots(value: any) {
  const fromDelimitedString = (text: any) =>
    String(text || "")
      .split(/\r?\n|[,;]+/g)
      .map((entry: any) => String(entry || "").trim())
      .filter(Boolean)
      .slice(0, 12);

  if (typeof value === "string") return fromDelimitedString(value);
  if (!Array.isArray(value)) return [];

  return value
    .map((entry: any) => {
      if (typeof entry === "string") {
        const normalized = entry.trim();
        return normalized || null;
      }
      if (!entry || typeof entry !== "object") return null;
      const slot = {
        label: String(entry.label || "").trim(),
        date: String(entry.date || "").trim(),
        time: String(entry.time || "").trim(),
        startsAt: String(entry.startsAt || "").trim(),
        endsAt: String(entry.endsAt || "").trim()
      };
      if (!slot.label && !slot.date && !slot.time && !slot.startsAt) return null;
      return slot;
    })
    .filter(Boolean)
    .slice(0, 12);
}

function normalizePrivateCareEntry(entry: any) {
  if (!entry || typeof entry !== "object") return null;
  const now = new Date().toISOString();
  const id = String(entry.id || "").trim();
  if (!id) return null;

  return {
    id,
    channel: String(entry.channel || "").trim(),
    date: String(entry.date || "").trim(),
    time: String(entry.time || "").trim(),
    subject: String(entry.subject || "").trim(),
    message: String(entry.message || "").trim(),
    status: normalizePrivateCareStatus(entry.status),
    adminNote: String(entry.adminNote || "").trim(),
    availableSlots: normalizePrivateCareSlots(entry.availableSlots),
    createdAt: String(entry.createdAt || now),
    updatedAt: String(entry.updatedAt || entry.createdAt || now)
  };
}

function toAdminPrivateCareRow(user: any, entry: any) {
  const normalized = normalizePrivateCareEntry(entry);
  if (!normalized) return null;

  return {
    id: normalized.id,
    createdAt: normalized.createdAt || null,
    updatedAt: normalized.updatedAt || null,
    userId: String(user?.id || "").trim() || null,
    userEmail: normalizeEmail(user?.email || ""),
    userName: String(user?.name || "").trim(),
    channel: normalized.channel,
    date: normalized.date,
    time: normalized.time,
    subject: normalized.subject,
    message: normalized.message,
    status: normalized.status,
    adminNote: normalized.adminNote,
    availableSlots: normalized.availableSlots
  };
}

function buildAuditActor(req: any) {
  return {
    actorAdminId: req.adminProfile?.id || null,
    actorUserId: req.adminUser?.id || null,
    actorEmail: normalizeEmail(req.adminUser?.email || ""),
    requestIp: req.ip || "",
    userAgent: String(req.headers["user-agent"] || "")
  };
}

function computeChangedFields(before: any, after: any) {
  if (!before || !after) return [];
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys
    .filter((key: any) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key: any) => String(key));
}

function sanitizeUserForAudit(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    title: String(user.title || ""),
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

function buildUserSnapshotForRestore(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    title: String(user.title || ""),
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

function stripHtmlToText(value: any) {
  return String(value || "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildUserPatchFromSnapshot(user: any) {
  if (!user) return {};
  return {
    title: String(user.title || ""),
    name: user.name || "",
    email: normalizeEmail(user.email || ""),
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
    cep: user.cep || ""
  };
}

function sanitizeOrderForAudit(order: any) {
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

function buildOrderPatchFromSnapshot(order: any) {
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

function sanitizeProductForAudit(product: any) {
  if (!product) return null;
  return {
    id: product.id,
    sku: product.sku || product.id,
    name: product.name || "",
    priceCents: Number(product.unitAmount || 0),
    stockQty: Number(product.stock || 0),
    sizes: Array.isArray(product.sizes) ? product.sizes.map((v: any) => String(v)) : [],
    colors: Array.isArray(product.colors) ? product.colors.map((v: any) => String(v)) : [],
    variantStock:
      product.variantStock && typeof product.variantStock === "object" && !Array.isArray(product.variantStock)
        ? product.variantStock
        : {},
    availabilityStatus: String(product.availabilityStatus || "").trim().toLowerCase() || "disponivel",
    currency: product.currency || "brl",
    imageUrl: String(product.image || ""),
    active: Boolean(product.active),
    createdAt: product.createdAt || null,
    updatedAt: product.updatedAt || null
  };
}

function buildProductPatchFromSnapshot(product: any) {
  if (!product) return {};
  return {
    name: product.name || "",
    priceCents: Number(product.unitAmount || 0),
    stockQty: Number(product.stock || 0),
    sizes: Array.isArray(product.sizes) ? product.sizes.map((v: any) => String(v)) : [],
    colors: Array.isArray(product.colors) ? product.colors.map((v: any) => String(v)) : [],
    variantStock:
      product.variantStock && typeof product.variantStock === "object" && !Array.isArray(product.variantStock)
        ? product.variantStock
        : {},
    availabilityStatus: String(product.availabilityStatus || "").trim().toLowerCase() || "disponivel",
    currency: product.currency || "brl",
    imageUrl: String(product.image || ""),
    active: Boolean(product.active)
  };
}

function sanitizeVipForAudit(subscriber: any) {
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

function buildVipPatchFromSnapshot(subscriber: any) {
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

function normalizeTrackingStatusForOrder(value: any) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (Object.prototype.hasOwnProperty.call(INTERNAL_TRACKING_STATES, raw)) {
    return INTERNAL_TRACKING_STATES[raw];
  }
  return mapMelhorEnvioStatusToInternal(raw).status || "";
}

function normalizeTextForCompare(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeOrderStatusInput(value: any) {
  const normalized = normalizeTextForCompare(value);
  if (!normalized) return "";

  if (
    [
      "pending",
      "pending_payment",
      "pendente",
      "aguardando_pagamento",
      "aguardando pagamento",
      "em analise",
      "em_analise"
    ].includes(normalized)
  ) {
    return "pending_payment";
  }

  if (
    [
      "processing",
      "processando",
      "enviado",
      "shipped",
      "em transito",
      "em_transito",
      "in transit",
      "in_transit"
    ].includes(normalized)
  ) {
    return "processing";
  }

  if (["paid", "pago", "approved", "aprovado", "delivered", "entregue"].includes(normalized)) {
    return "paid";
  }

  if (["failed", "falhou", "recusado", "negado", "declined"].includes(normalized)) {
    return "failed";
  }

  if (["canceled", "cancelled", "cancelado"].includes(normalized)) {
    return "canceled";
  }

  if (["refunded", "reembolsado", "estornado"].includes(normalized)) {
    return "refunded";
  }

  return normalized;
}

function inferTrackingStatusFromOrderStatusInput(value: any) {
  const normalized = normalizeTextForCompare(value);
  if (!normalized) return "";
  if (["delivered", "entregue"].includes(normalized)) return INTERNAL_TRACKING_STATES.DELIVERED || "DELIVERED";
  if (
    ["processing", "processando", "enviado", "shipped", "em transito", "em_transito", "in transit", "in_transit"].includes(
      normalized
    )
  ) {
    return INTERNAL_TRACKING_STATES.IN_TRANSIT || "IN_TRANSIT";
  }
  if (["pending", "pending_payment", "pendente", "aguardando_pagamento", "aguardando pagamento"].includes(normalized)) {
    return INTERNAL_TRACKING_STATES.ORDER_PLACED || "ORDER_PLACED";
  }
  if (["failed", "falhou", "recusado", "negado", "declined", "canceled", "cancelled", "cancelado"].includes(normalized)) {
    return INTERNAL_TRACKING_STATES.EXCEPTION || "EXCEPTION";
  }
  return "";
}

async function recordAuditLog(req: any, payload: any) {
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

async function applyAuditReverseOperation(log: any) {
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

adminRouter.get("/me", (req: any, res: any) => {
  return res.json({ admin: req.adminUser, profile: req.adminProfile || null });
});

adminRouter.patch("/me", async (req: any, res: any) => {
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

adminRouter.get("/audit-logs", async (req: any, res: any) => {
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

adminRouter.get("/audit", async (req: any, res: any) => {
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

adminRouter.get("/audit/:id", async (req: any, res: any) => {
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

adminRouter.get("/admin-logins", async (req: any, res: any) => {
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

adminRouter.post("/audit/:id/revert", sensitiveAdminRateLimit, async (req: any, res: any) => {
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
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json({ error: String(error.code || "AUDIT_REVERT_FAILED") });
    }
    return res.status(500).json({ error: "AUDIT_REVERT_FAILED" });
  }
});

adminRouter.post("/audit-logs/:id/reverse", async (req: any, res: any) => {
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
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json({ error: String(error.code || "AUDIT_REVERSE_FAILED") });
    }
    return res.status(500).json({ error: "AUDIT_REVERSE_FAILED" });
  }
});

adminRouter.get("/users", async (req: any, res: any) => {
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

adminRouter.get("/users/:id", async (req: any, res: any) => {
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

adminRouter.get("/users/:id/orders", async (req: any, res: any) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const user = await findUserById(id);
    if (!user) return res.status(404).json({ error: "NOT_FOUND" });
    const orders = await listOrdersByUserId(id);
    return res.json({
      orders: orders.map((order: any) => ({
        id: String(order.id || ""),
        orderNumber: String(order.orderNumber || ""),
        createdAt: order.createdAt || null,
        status: String(order.status || ""),
        currency: String(order.currency || "brl"),
        amount: Number(order.amount || 0),
        userId: String(order.userId || ""),
        productName: String(order.items?.[0]?.name || order.shippingSelectedService || "Pedido sem item").trim()
      })),
      count: orders.length
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_USER_ORDERS_FETCH_FAILED" });
  }
});

adminRouter.post("/users/:id/reset-password", sensitiveAdminRateLimit, async (req: any, res: any) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const before = await findUserById(id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const tempPassword = generateTempPassword();
    const hash = await hashPassword(tempPassword);
    const updated = await adminSetUserTempPassword(id, hash);
    if (!updated) return res.status(404).json({ error: "NOT_FOUND" });
    await invalidateUserSessions(id);

    const resetToken = await createPasswordResetToken(before.id, 30);
    const issued = await issueAuthEmailCode({
      userId: before.id,
      email: before.email,
      purpose: "password_reset"
    });
    if (!issued.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });

    await sendPasswordResetEmail({
      to: before.email,
      code: issued.code,
      minutes: 15,
      resetUrl: buildAdminResetPasswordLink(before.email, resetToken.token)
    });

    await recordAuditLog(req, {
      action: "reset_password_email",
      entityType: "user",
      entityId: before.id,
      summary: `Fluxo de redefinicao enviado: ${before.email}`,
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

    const response: any = {
      ok: true,
      expiresAt: issued.expiresAt || null,
      resetTokenExpiresAt: resetToken.expiresAt || null
    };
    if (process.env.NODE_ENV !== "production") {
      response.devCode = issued.code;
    }
    return res.json(response);
  } catch {
    return res.status(500).json({ error: "ADMIN_RESET_PASSWORD_FAILED" });
  }
});

adminRouter.post("/users/:id/temp-password", sensitiveAdminRateLimit, async (req: any, res: any) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const before = await findUserById(id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const tempPassword = generateTempPassword();
    const hash = await hashPassword(tempPassword);
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

adminRouter.post("/users/:id/logout", sensitiveAdminRateLimit, async (req: any, res: any) => {
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

adminRouter.delete("/users/:id/login", sensitiveAdminRateLimit, async (req: any, res: any) => {
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

adminRouter.post("/users", async (req: any, res: any) => {
  const parsed = userCreateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  try {
    const payload = parsed.data;
    const created = await createUser({
      title: payload.title,
      name: payload.name,
      email: normalizeEmail(payload.email),
      phone: String(payload.phone || "").trim().slice(0, 40),
      passwordHash: await hashPassword(payload.password),
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

adminRouter.patch("/users/:id", async (req: any, res: any) => {
  const parsed = userPatchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  try {
    const before = await findUserById(req.params.id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    let updated: any = before;
    const statusValue = String(parsed.data.status || "").trim().toLowerCase();
    if (statusValue) {
      const suspended = statusValue === "suspended";
      const statusUpdated = await adminSetUserLoginDisabled(req.params.id, suspended);
      if (!statusUpdated) return res.status(404).json({ error: "NOT_FOUND" });
      updated = statusUpdated;
      if (suspended) {
        await invalidateUserSessions(req.params.id);
      }
    }

    const profilePatch = {
      title: parsed.data.title,
      name: parsed.data.name,
      email: parsed.data.email ? normalizeEmail(parsed.data.email) : undefined,
      phone: parsed.data.phone == null ? undefined : String(parsed.data.phone || "").trim().slice(0, 40),
      birthDate: parsed.data.birthDate,
      cpf: parsed.data.cpf,
      cep: parsed.data.cep
    };
    const hasProfilePatch = Object.values(profilePatch).some((value) => value !== undefined);
    if (hasProfilePatch) {
      const profileUpdated = await adminUpdateUser(req.params.id, profilePatch);
      if (!profileUpdated) return res.status(404).json({ error: "NOT_FOUND" });
      if (profileUpdated.error === "EMAIL_ALREADY_EXISTS") {
        return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
      }
      updated = profileUpdated;
    }

    if (updated.error === "EMAIL_ALREADY_EXISTS") {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    }

    const wasStatusChange = Boolean(statusValue);
    const statusLabel = statusValue === "suspended" ? "Conta suspensa" : statusValue === "active" ? "Conta reativada" : "";
    const summary = statusLabel ? `${statusLabel}: ${before.email}` : `Usuario atualizado: ${before.email}`;

    await recordAuditLog(req, {
      action: "update",
      entityType: "user",
      entityId: before.id,
      summary,
      before: sanitizeUserForAudit(before),
      after: sanitizeUserForAudit(updated),
      reversePayload: wasStatusChange
        ? {
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
        : {
            type: "user_update",
            payload: {
              id: before.id,
              patch: buildUserPatchFromSnapshot(before)
            }
          }
    });

    return res.json({ ok: true, user: sanitizeUser(updated) });
  } catch (error: any) {
    console.error("[admin/users/:id] update failed", {
      code: String(error?.code || ""),
      detail: String(error?.detail || ""),
      message: String(error?.message || "")
    });
    return res.status(500).json({ error: "ADMIN_USER_UPDATE_FAILED" });
  }
});

adminRouter.delete("/users/:id", async (req: any, res: any) => {
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

adminRouter.get("/orders", async (req: any, res: any) => {
  const status = String(req.query.status || "").trim().toLowerCase();
  const queryText = String(req.query.query || req.query.search || "").trim().toLowerCase();

  const page = String(req.query.page || "").trim() ? Math.max(1, Number(req.query.page) || 1) : null;
  const pageSize = String(req.query.pageSize || "").trim() ? Math.max(1, Math.min(200, Number(req.query.pageSize) || 50)) : null;
  const limit = pageSize != null ? pageSize : Number(req.query.limit || 100);
  const offset = page != null ? (page - 1) * limit : Number(req.query.offset || 0);

  try {
    const orders = await listOrders();
    const filtered = orders.filter((order: any) => {
      const matchesStatus = status ? String(order.status || "").toLowerCase() === status : true;
      if (!matchesStatus) return false;
      if (!queryText) return true;
      const payload = `${order.orderNumber || ""} ${order.id} ${order.userEmail || ""} ${order.userName || ""}`.toLowerCase();
      return payload.includes(queryText);
    });
    const paged = paginateArray(filtered, limit, offset);
    const userIds = Array.from(
      new Set(
        paged.rows
          .map((order: any) => String(order.userId || "").trim())
          .filter(Boolean)
      )
    );
    const userGuestById = new Map();
    if (userIds.length) {
      await Promise.all(
        userIds.map(async (userId: any) => {
          try {
            const user = await findUserById(userId);
            userGuestById.set(String(userId), Boolean(user?.isGuest));
          } catch {
            userGuestById.set(String(userId), false);
          }
        })
      );
    }
    const shipmentsByOrderId = await listShipmentsByOrderIds(
      paged.rows.map((order: any) => String(order.id)).filter(Boolean)
    );
    const ordersWithShipping = paged.rows.map((order: any) => {
      const shipment = shipmentsByOrderId.get(String(order.id)) || null;
      const fallbackTracking = String(order.trackingCode || order.trackingId || "").trim();
      const safeShipment = shipment
        ? {
            id: shipment.id,
            provider: shipment.provider,
            trackingCode: shipment.trackingCode || fallbackTracking || "",
            status: shipment.status || order.trackingStatus || order.currentStatus || "",
            updatedAt: shipment.updatedAt || null
          }
        : fallbackTracking
          ? {
              id: null,
              provider: order.shippingSelectedProvider || "",
              trackingCode: fallbackTracking || "",
              status: order.trackingStatus || order.currentStatus || "",
              updatedAt: order.updatedAt || null
            }
          : null;

      return {
        id: order.id,
        orderNumber: String(order.orderNumber || ""),
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
        isGuest: Boolean(userGuestById.get(String(order.userId || ""))),
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

adminRouter.patch("/orders/:id", async (req: any, res: any) => {
  const rawBody = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? { ...req.body } : {};
  const hasStatusKey = Object.prototype.hasOwnProperty.call(rawBody, "status");
  const hasOrderStatusKey = Object.prototype.hasOwnProperty.call(rawBody, "orderStatus");
  const rawStatusValue = hasOrderStatusKey ? rawBody.orderStatus : rawBody.status;
  const normalizedStatus = normalizeOrderStatusInput(rawStatusValue);

  if (hasStatusKey && normalizedStatus) {
    rawBody.status = normalizedStatus;
  }
  if (hasOrderStatusKey && normalizedStatus) {
    rawBody.orderStatus = normalizedStatus;
  }
  if (!Object.prototype.hasOwnProperty.call(rawBody, "trackingStatus")) {
    const inferredTracking = inferTrackingStatusFromOrderStatusInput(rawStatusValue);
    if (inferredTracking) rawBody.trackingStatus = inferredTracking;
  }

  const parsed = orderPatchSchema.safeParse(rawBody);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const before = await findOrderById(req.params.id);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });
    const hasItemsPatch = Array.isArray(parsed.data.items);
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

    const shippingSnapshot =
      before.shipping && typeof before.shipping === "object" && !Array.isArray(before.shipping)
        ? { ...before.shipping }
        : {};

    if (Object.prototype.hasOwnProperty.call(parsed.data, "userPhone")) {
      shippingSnapshot.phone = String(parsed.data.userPhone || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "userCpf")) {
      shippingSnapshot.cpf = String(parsed.data.userCpf || "").replace(/\D/g, "");
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingDestinationZip")) {
      shippingSnapshot.cep = String(parsed.data.shippingDestinationZip || "").replace(/\D/g, "").slice(0, 8);
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingStreet")) {
      shippingSnapshot.street = String(parsed.data.shippingStreet || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingNumber")) {
      shippingSnapshot.number = String(parsed.data.shippingNumber || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingComplement")) {
      shippingSnapshot.complement = String(parsed.data.shippingComplement || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingDistrict")) {
      shippingSnapshot.district = String(parsed.data.shippingDistrict || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingCity")) {
      shippingSnapshot.city = String(parsed.data.shippingCity || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingState")) {
      shippingSnapshot.state = String(parsed.data.shippingState || "").trim().toUpperCase();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "couponCode")) {
      shippingSnapshot.discountCode = String(parsed.data.couponCode || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "discountCents")) {
      shippingSnapshot.discountCents = Math.max(0, Number(parsed.data.discountCents || 0));
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingSelectedService")) {
      const service = String(parsed.data.shippingSelectedService || "").trim();
      shippingSnapshot.shippingMethod = service;
      shippingSnapshot.selectedService = service;
    }

    const hasShippingPatch =
      Object.prototype.hasOwnProperty.call(parsed.data, "shipping") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "userPhone") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "userCpf") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "shippingDestinationZip") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "shippingStreet") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "shippingNumber") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "shippingComplement") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "shippingDistrict") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "shippingCity") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "shippingState") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "couponCode") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "discountCents") ||
      Object.prototype.hasOwnProperty.call(parsed.data, "shippingSelectedService");

    if (Object.prototype.hasOwnProperty.call(parsed.data, "shipping")) {
      nextPatch.shipping =
        parsed.data.shipping && typeof parsed.data.shipping === "object" && !Array.isArray(parsed.data.shipping)
          ? { ...shippingSnapshot, ...parsed.data.shipping }
          : shippingSnapshot;
    } else if (hasShippingPatch) {
      nextPatch.shipping = shippingSnapshot;
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingDestinationZip")) {
      nextPatch.shippingDestinationZip = String(parsed.data.shippingDestinationZip || "").replace(/\D/g, "").slice(0, 8);
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, "shippingSelectedService")) {
      const service = String(parsed.data.shippingSelectedService || "").trim();
      const lowerService = service.toLowerCase();
      const provider = lowerService.includes("loggi")
        ? "loggi"
        : lowerService.includes("transportadora")
          ? "transportadora"
          : "correios";
      const serviceCode = lowerService.includes("sedex")
        ? "SEDEX"
        : lowerService.includes("pac")
          ? "PAC"
          : lowerService.includes("express")
            ? "EXPRESS"
            : "MANUAL";
      nextPatch.shippingSelectedProvider = provider;
      nextPatch.shippingSelectedCarrierName = service;
      nextPatch.shippingSelectedServiceCode = serviceCode;
    }

    if (hasItemsPatch) {
      const normalizedItems = parsed.data.items.map((item: any) => ({
        id: String(item.id || "").trim(),
        name: String(item.name || item.id || "").trim(),
        qty: Math.max(1, Number(item.qty || 1)),
        unitAmount: Math.max(0, Number(item.unitAmount || 0)),
        currency: String(item.currency || before.currency || "brl").trim().toLowerCase(),
        variantColor: String(item.variantColor || "").trim() || null,
        variantSize: String(item.variantSize || "").trim() || null,
        variantKey: String(item.variantKey || "").trim() || null
      }));

      const itemsAmountCalculated = normalizedItems.reduce(
        (sum: number, item: any) => sum + Math.max(0, Number(item.unitAmount || 0)) * Math.max(1, Number(item.qty || 1)),
        0
      );
      nextPatch.itemsAmount = itemsAmountCalculated;

      if (!Object.prototype.hasOwnProperty.call(parsed.data, "amount")) {
        const shippingAmount =
          Object.prototype.hasOwnProperty.call(parsed.data, "shippingPriceCents") && parsed.data.shippingPriceCents != null
            ? Math.max(0, Number(parsed.data.shippingPriceCents || 0))
            : Object.prototype.hasOwnProperty.call(parsed.data, "shippingAmount") && parsed.data.shippingAmount != null
              ? Math.max(0, Number(parsed.data.shippingAmount || 0))
              : Math.max(0, Number(before.shippingPriceCents || before.shippingAmount || 0));
        const discountCents = Math.max(
          0,
          Number(
            Object.prototype.hasOwnProperty.call(parsed.data, "discountCents")
              ? parsed.data.discountCents || 0
              : before.shipping?.discountCents || 0
          )
        );
        nextPatch.amount = Math.max(0, itemsAmountCalculated + shippingAmount - discountCents);
      }
    }

    const hasTrackingStatus = Object.prototype.hasOwnProperty.call(parsed.data, "trackingStatus");
    if (hasTrackingStatus) {
      const normalizedTracking = normalizeTrackingStatusForOrder(nextPatch.trackingStatus);
      if (normalizedTracking) {
        nextPatch.currentStatus = normalizedTracking;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(parsed.data, "trackingCode") &&
      nextPatch.trackingCode &&
      !nextPatch.currentStatus &&
      String(before.currentStatus || "").trim().toUpperCase() !== "DELIVERED"
    ) {
      nextPatch.currentStatus = INTERNAL_TRACKING_STATES.SHIPPED;
      nextPatch.lastTrackingUpdate = new Date().toISOString();
    }

    const beforeStatus = String(before.status || "").trim().toLowerCase();
    const requestedStatus = String(nextPatch.status || "").trim().toLowerCase();
    if (beforeStatus === "refunded" && requestedStatus && requestedStatus !== "refunded") {
      return res.status(409).json({ error: "ORDER_REFUNDED_LOCKED" });
    }

    if ((requestedStatus === "refunded" || (requestedStatus === "canceled" && before.stripePaymentIntentId)) && beforeStatus !== "refunded") {
      if (!before.stripePaymentIntentId) {
        return res.status(409).json({ error: "ORDER_NOT_REFUNDABLE" });
      }
      const stripe = getStripeClient();
      if (!stripe) return res.status(500).json({ error: "STRIPE_NOT_CONFIGURED" });

      const refund = await stripe.refunds.create({
        payment_intent: before.stripePaymentIntentId
      });

      nextPatch.stripeRefundId = refund?.id || before.stripeRefundId || null;
      if (requestedStatus === "refunded") {
        nextPatch.status = "refunded";
        nextPatch.refundedAt = new Date().toISOString();
        nextPatch.cancellationReason = nextPatch.cancellationReason || "refunded_by_admin";
      } else {
        nextPatch.status = "canceled";
        nextPatch.canceledAt = nextPatch.canceledAt || before.canceledAt || new Date().toISOString();
        nextPatch.cancellationReason = nextPatch.cancellationReason || "refund_requested_by_admin";
      }
    }

    let updated = await updateOrder(req.params.id, nextPatch);

    if (hasItemsPatch) {
      const itemsToPersist = parsed.data.items || [];
      await withTransaction(async (client: any) => {
        await client.query(`DELETE FROM order_items WHERE order_id = $1`, [String(before.id)]);
        for (const item of itemsToPersist) {
          const sku = String(item.id || "").trim();
          if (!sku) continue;
          const productResult = await client.query(
            `SELECT id FROM products WHERE lower(sku) = lower($1) LIMIT 1`,
            [sku]
          );
          const productId = productResult.rows[0]?.id || null;
          await client.query(
            `
            INSERT INTO order_items (
              order_id, product_id, product_sku, name, qty, price_cents, currency, variant_color, variant_size, variant_key
            ) VALUES (
              $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10
            )
            `,
            [
              String(before.id),
              productId,
              sku,
              String(item.name || sku),
              Math.max(1, Number(item.qty || 1)),
              Math.max(0, Number(item.unitAmount || 0)),
              String(item.currency || before.currency || "brl").trim().toLowerCase(),
              String(item.variantColor || "").trim() || null,
              String(item.variantSize || "").trim() || null,
              String(item.variantKey || "").trim() || null
            ]
          );
        }
      });
      updated = (await findOrderById(req.params.id)) || updated;
    }

    const afterState = updated || before;
    const statusChanged = String(before.status || "") !== String(afterState.status || "");

    if (["canceled", "refunded", "failed"].includes(String(afterState.status || "").trim().toLowerCase())) {
      const cancelStatus = INTERNAL_TRACKING_STATES.CANCELED || INTERNAL_TRACKING_STATES.EXCEPTION || "EXCEPTION";
      await updateOrder(req.params.id, {
        currentStatus: cancelStatus,
        trackingStatus: cancelStatus,
        lastTrackingUpdate: new Date().toISOString()
      }).catch(() => {});
      afterState.currentStatus = cancelStatus;
      afterState.trackingStatus = cancelStatus;
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, "trackingCode")) {
      const trackingCode = String(nextPatch.trackingCode || "").trim();
      if (trackingCode) {
        const provider =
          String(afterState.shippingSelectedProvider || afterState.shipping?.shippingProvider || "manual")
            .trim()
            .toLowerCase() || "manual";
        const serviceCode =
          String(afterState.shippingSelectedServiceCode || afterState.shipping?.shippingServiceCode || "manual")
            .trim() || "manual";
        await upsertShipmentPending({
          orderId: afterState.id,
          provider,
          serviceCode,
          priceCents: Number(afterState.shippingPriceCents || afterState.shippingAmount || 0),
          deadlineDays: afterState.shippingDeadlineDays,
          rawPayload: {
            source: "admin_manual_tracking"
          }
        }).catch(() => {});
        await updateShipmentTracking({
          orderId: afterState.id,
          trackingCode,
          status: "",
          rawPayload: {
            source: "admin_manual_tracking"
          }
        }).catch(() => {});
      }
    }

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

adminRouter.delete("/orders/:id", sensitiveAdminRateLimit, async (req: any, res: any) => {
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

adminRouter.get("/orders/:id", async (req: any, res: any) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const order = await findOrderById(id);
    if (!order) return res.status(404).json({ error: "NOT_FOUND" });
    const shipmentsByOrderId = await listShipmentsByOrderIds([String(order.id)]);
    const shipment = shipmentsByOrderId.get(String(order.id)) || null;
    const fallbackTracking = String(order.trackingCode || order.trackingId || "").trim();
    const mergedShipment = shipment
      ? {
          ...shipment,
          trackingCode: shipment.trackingCode || fallbackTracking || "",
          status: shipment.status || order.trackingStatus || order.currentStatus || ""
        }
      : fallbackTracking
        ? {
            id: null,
            provider: order.shippingSelectedProvider || "",
            serviceCode: order.shippingSelectedServiceCode || "",
            labelExternalId: "",
            trackingCode: fallbackTracking || "",
            status: order.trackingStatus || order.currentStatus || "",
            priceCents: Number(order.shippingPriceCents || order.shippingAmount || 0),
            deadlineDays: order.shippingDeadlineDays == null ? null : Number(order.shippingDeadlineDays),
            rawPayload: {},
            createdAt: order.createdAt || null,
            updatedAt: order.updatedAt || null
          }
        : null;
    return res.json({ order: { ...order, shipment: mergedShipment } });
  } catch {
    return res.status(500).json({ error: "ADMIN_ORDER_FETCH_FAILED" });
  }
});

adminRouter.get("/products", async (req: any, res: any) => {
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

adminRouter.get("/products/:id", async (req: any, res: any) => {
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
  async (req: any, res: any) => {
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
      const slotRaw = Number(req.query.slot || 1);
      const slot = Number.isInteger(slotRaw) && slotRaw >= 1 && slotRaw <= 5 ? slotRaw : 1;

      const folder = String(process.env.R2_FOLDER || "tsebi/products").trim() || "tsebi/products";
      const publicIdBase = `product_${String(before.sku || before.id || id).trim()}`;
      const publicId = slot > 1 ? `${publicIdBase}_slot${slot}` : publicIdBase;
      const uploaded = await getR2Upload()(req.body, { folder, publicId });
      const url = String(uploaded?.secure_url || uploaded?.url || "").trim();
      if (!url) return res.status(500).json({ error: "IMAGE_UPLOAD_FAILED" });

      const gallery = Array.isArray(before.galleryImages) ? [...before.galleryImages] : [];
      const imagePatch: any = {};
      if (slot === 1) {
        imagePatch.imageUrl = url;
      } else {
        const index = slot - 2;
        while (gallery.length <= index) gallery.push("");
        gallery[index] = url;
        imagePatch.galleryImages = gallery.filter((value: any) => String(value || "").trim());
        if (slot === 2) imagePatch.secondaryImage = url;
      }

      const updated = await updateProductByIdentifier(id, imagePatch);
      if (!updated) return res.status(404).json({ error: "NOT_FOUND" });

      await recordAuditLog(req, {
        action: "save",
        entityType: "product",
        entityId: updated.sku || updated.id,
        summary: `Imagem atualizada (slot ${slot}): ${updated.sku || updated.id}`,
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
          slot,
          bytes: Number(uploaded?.bytes || 0) || null,
          format: String(uploaded?.format || "") || null,
          width: Number(uploaded?.width || 0) || null,
          height: Number(uploaded?.height || 0) || null
        }
      });
    } catch (error: any) {
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

adminRouter.post("/products", async (req: any, res: any) => {
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

adminRouter.patch("/products/:id", async (req: any, res: any) => {
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

adminRouter.delete("/products/:id", async (req: any, res: any) => {
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

adminRouter.get("/appointment-slots", async (req: any, res: any) => {
  try {
    const rows = await listAdminAppointmentSlots({
      date: String(req.query.date || "").trim(),
      status: String(req.query.status || "").trim(),
      includePast: String(req.query.includePast || "").trim(),
    });
    return res.json({ rows, total: rows.length });
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "ADMIN_APPOINTMENT_SLOTS_LIST_FAILED" });
  }
});

adminRouter.post("/appointment-slots", async (req: any, res: any) => {
  const parsed = appointmentSlotCreateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const slot = await createAdminAppointmentSlot({
      ...parsed.data,
      createdByAdminId: String(req.adminProfile?.id || "").trim() || null,
    });

    await recordAuditLog(req, {
      action: "create",
      entityType: "appointment_slot",
      entityId: slot.id,
      summary: `Horario criado: ${slot.date} ${slot.time}`,
      before: null,
      after: slot,
    });

    return res.status(201).json({ ok: true, slot });
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "ADMIN_APPOINTMENT_SLOT_CREATE_FAILED" });
  }
});

adminRouter.patch("/appointment-slots/:id", async (req: any, res: any) => {
  const slotId = String(req.params.id || "").trim();
  if (!slotId) return res.status(400).json({ error: "INVALID_ID" });

  const parsed = appointmentSlotPatchSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const before = (await listAdminAppointmentSlots({ includePast: true })).find((row: any) => String(row.id || "") === slotId) || null;
    const slot = await updateAdminAppointmentSlot(slotId, parsed.data);

    await recordAuditLog(req, {
      action: "save",
      entityType: "appointment_slot",
      entityId: slot.id,
      summary: `Horario atualizado: ${slot.date} ${slot.time}`,
      before,
      after: slot,
      reversible: false,
    });

    return res.json({ ok: true, slot });
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "ADMIN_APPOINTMENT_SLOT_UPDATE_FAILED" });
  }
});

adminRouter.delete("/appointment-slots/:id", sensitiveAdminRateLimit, async (req: any, res: any) => {
  const slotId = String(req.params.id || "").trim();
  if (!slotId) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const before = (await listAdminAppointmentSlots({ includePast: true })).find((row: any) => String(row.id || "") === slotId) || null;
    const removed = await deleteAdminAppointmentSlot(slotId);

    await recordAuditLog(req, {
      action: "delete",
      entityType: "appointment_slot",
      entityId: slotId,
      summary: `Horario removido: ${removed.date} ${removed.time}`,
      before,
      after: null,
      reversible: false,
    });

    return res.json({ ok: true, removed });
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "ADMIN_APPOINTMENT_SLOT_DELETE_FAILED" });
  }
});

adminRouter.post("/appointments/:id/cancel", async (req: any, res: any) => {
  const appointmentId = String(req.params.id || "").trim();
  if (!appointmentId) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const appointment = await cancelAdminAppointment(appointmentId);

    await recordAuditLog(req, {
      action: "cancel",
      entityType: "appointment",
      entityId: appointmentId,
      summary: `Agendamento cancelado: ${appointment.userEmail} em ${appointment.date} ${appointment.time}`,
      before: null,
      after: appointment,
      reversible: false,
    });

    const appName = String(process.env.APP_NAME || "Tsebi").trim() || "Tsebi";
    if (appointment.userEmail) {
      sendEmail({
        to: appointment.userEmail,
        subject: `${appName} — Agendamento cancelado`,
        html: `
          <div style="font-family:'Cormorant Garamond','Georgia',serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
            <p style="font-size:11px;letter-spacing:.15em;color:#aaa;font-family:sans-serif;font-weight:600;margin-bottom:24px;">TSEBI</p>
            <h2 style="font-size:22px;font-weight:400;margin-bottom:16px;">Agendamento cancelado</h2>
            <p style="font-size:15px;line-height:1.6;color:#444;margin-bottom:20px;">
              Olá, ${appointment.userName || "cliente"}. Seu agendamento marcado para
              <strong>${appointment.date} às ${appointment.time}</strong> foi cancelado pela nossa equipe.
            </p>
            <p style="font-size:14px;color:#888;line-height:1.6;">
              Entre em contato conosco para remarcar ou esclarecer dúvidas.
            </p>
            <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eee;">
              <p style="font-size:11px;color:#bbb;font-family:sans-serif;">${appName} · Atendimento Privado</p>
            </div>
          </div>
        `,
        text: `Seu agendamento para ${appointment.date} às ${appointment.time} foi cancelado. Entre em contato para remarcar.`,
      }).catch(() => {});
    }

    return res.json({ ok: true, appointment });
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "ADMIN_APPOINTMENT_CANCEL_FAILED" });
  }
});

adminRouter.post("/appointments/:id/reschedule", async (req: any, res: any) => {
  const appointmentId = String(req.params.id || "").trim();
  if (!appointmentId) return res.status(400).json({ error: "INVALID_ID" });
  const newSlotId = String(req.body?.newSlotId || "").trim();
  if (!newSlotId) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const { appointment, oldSlot } = await rescheduleAdminAppointment(appointmentId, newSlotId);

    await recordAuditLog(req, {
      action: "reschedule",
      entityType: "appointment",
      entityId: appointmentId,
      summary: `Agendamento remarcado: ${appointment.userEmail} de ${oldSlot.startsAt} para ${appointment.startsAt}`,
      before: { slotStartsAt: oldSlot.startsAt },
      after: appointment,
      reversible: false,
    });

    const appName = String(process.env.APP_NAME || "Tsebi").trim() || "Tsebi";
    if (appointment.userEmail) {
      const oldDateStr = oldSlot.startsAt
        ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(oldSlot.startsAt))
        : "horário anterior";
      const newDateStr = appointment.startsAt
        ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(appointment.startsAt))
        : `${appointment.date} às ${appointment.time}`;

      sendEmail({
        to: appointment.userEmail,
        subject: `${appName} — Agendamento remarcado`,
        html: `
          <div style="font-family:'Cormorant Garamond','Georgia',serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
            <p style="font-size:11px;letter-spacing:.15em;color:#aaa;font-family:sans-serif;font-weight:600;margin-bottom:24px;">TSEBI</p>
            <h2 style="font-size:22px;font-weight:400;margin-bottom:16px;">Agendamento remarcado</h2>
            <p style="font-size:15px;line-height:1.6;color:#444;margin-bottom:20px;">
              Olá, ${appointment.userName || "cliente"}. Seu agendamento foi remarcado pela nossa equipe.
            </p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr>
                <td style="padding:12px 16px;background:#f8f8f8;border:1px solid #eee;font-size:11px;letter-spacing:.1em;color:#aaa;font-family:sans-serif;font-weight:600;vertical-align:top;">DE</td>
                <td style="padding:12px 16px;background:#f8f8f8;border:1px solid #eee;font-size:15px;color:#888;text-decoration:line-through;">${oldDateStr}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;background:#fff;border:1px solid #eee;font-size:11px;letter-spacing:.1em;color:#aaa;font-family:sans-serif;font-weight:600;vertical-align:top;">PARA</td>
                <td style="padding:12px 16px;background:#fff;border:1px solid #eee;font-size:15px;color:#1a1a1a;font-weight:500;">${newDateStr}</td>
              </tr>
            </table>
            <p style="font-size:14px;color:#888;line-height:1.6;">
              Em caso de dúvidas, entre em contato com nossa equipe.
            </p>
            <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eee;">
              <p style="font-size:11px;color:#bbb;font-family:sans-serif;">${appName} · Atendimento Privado</p>
            </div>
          </div>
        `,
        text: `Seu agendamento foi remarcado de ${oldDateStr} para ${newDateStr}.`,
      }).catch(() => {});
    }

    return res.json({ ok: true, appointment });
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "ADMIN_APPOINTMENT_RESCHEDULE_FAILED" });
  }
});

adminRouter.get("/private-care", async (req: any, res: any) => {
  const queryText = String(req.query.query || "").trim().toLowerCase();
  const statusRaw = String(req.query.status || "").trim();
  const statusFilter = normalizePrivateCareStatus(statusRaw);
  const hasStatusFilter = Boolean(statusRaw);
  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize || 50) || 50));

  try {
    await ensurePrivateCareColumns();
    const usersResult = await query(
      `
      SELECT id, name, email, account_private_care_history
      FROM users
      WHERE account_private_care_history IS NOT NULL
      `
    );

    const rows = (Array.isArray(usersResult.rows) ? usersResult.rows : []).flatMap((user: any) => {
      const history = Array.isArray(user?.account_private_care_history) ? user.account_private_care_history : [];
      return history
        .map((entry: any) => toAdminPrivateCareRow(user, entry))
        .filter(Boolean);
    });

    const filtered = rows
      .filter((row: any) => {
        if (hasStatusFilter && normalizePrivateCareStatus(row.status) !== statusFilter) return false;
        if (!queryText) return true;
        const haystack = [
          row.id,
          row.userName,
          row.userEmail,
          row.subject,
          row.message,
          row.channel,
          row.date,
          row.time,
          row.adminNote
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(queryText);
      })
      .sort((a: any, b: any) =>
        String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""))
      );

    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const pagedRows = filtered.slice(offset, offset + pageSize);

    return res.json({
      rows: pagedRows,
      total,
      page,
      pageSize
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRIVATE_CARE_LIST_FAILED" });
  }
});

adminRouter.patch("/private-care/:id", async (req: any, res: any) => {
  const requestId = String(req.params.id || "").trim();
  if (!requestId) return res.status(400).json({ error: "INVALID_ID" });

  const parsed = privateCarePatchSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const hasAnyPatch =
    Object.prototype.hasOwnProperty.call(parsed.data, "status") ||
    Object.prototype.hasOwnProperty.call(parsed.data, "decision") ||
    Object.prototype.hasOwnProperty.call(parsed.data, "adminNote") ||
    Object.prototype.hasOwnProperty.call(parsed.data, "availableSlots");
  if (!hasAnyPatch) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    await ensurePrivateCareColumns();
    const ownerResult = await query(
      `
      SELECT id, name, email, account_private_care_history
      FROM users
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(account_private_care_history) = 'array' THEN account_private_care_history
            ELSE '[]'::jsonb
          END
        ) AS entry
        WHERE entry->>'id' = $1
      )
      LIMIT 1
      `,
      [requestId]
    );

    const owner = ownerResult.rows[0] || null;
    if (!owner) return res.status(404).json({ error: "NOT_FOUND" });

    const history = Array.isArray(owner.account_private_care_history) ? [...owner.account_private_care_history] : [];
    const rowIndex = history.findIndex((entry: any) => String(entry?.id || "").trim() === requestId);
    if (rowIndex < 0) return res.status(404).json({ error: "NOT_FOUND" });

    const before = normalizePrivateCareEntry(history[rowIndex]);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    const next = {
      ...before
    };

    let nextStatus = normalizePrivateCareStatus(before.status);
    if (Object.prototype.hasOwnProperty.call(parsed.data, "status")) {
      nextStatus = normalizePrivateCareStatus(parsed.data.status);
    }
    if (parsed.data.decision === "accept") nextStatus = "accepted";
    if (parsed.data.decision === "decline") nextStatus = "declined";

    if (Object.prototype.hasOwnProperty.call(parsed.data, "adminNote")) {
      next.adminNote = String(parsed.data.adminNote || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "availableSlots")) {
      next.availableSlots = normalizePrivateCareSlots(parsed.data.availableSlots);
    }
    next.status = nextStatus;
    next.updatedAt = new Date().toISOString();

    history[rowIndex] = next;
    await query(
      `
      UPDATE users
      SET account_private_care_history = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      `,
      [String(owner.id || ""), JSON.stringify(history)]
    );

    const beforeRow = toAdminPrivateCareRow(owner, before);
    const afterRow = toAdminPrivateCareRow(owner, next);
    await recordAuditLog(req, {
      action: "save",
      entityType: "private_care",
      entityId: requestId,
      summary: `Atendimento atualizado: ${requestId}`,
      before: beforeRow,
      after: afterRow,
      reversePayload: null,
      reversible: false
    });

    return res.json({
      ok: true,
      request: afterRow
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRIVATE_CARE_UPDATE_FAILED" });
  }
});

adminRouter.delete("/private-care/:id", sensitiveAdminRateLimit, async (req: any, res: any) => {
  const requestId = String(req.params.id || "").trim();
  if (!requestId) return res.status(400).json({ error: "INVALID_ID" });

  try {
    await ensurePrivateCareColumns();
    const ownerResult = await query(
      `
      SELECT id, name, email, account_private_care_history
      FROM users
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(account_private_care_history) = 'array' THEN account_private_care_history
            ELSE '[]'::jsonb
          END
        ) AS entry
        WHERE entry->>'id' = $1
      )
      LIMIT 1
      `,
      [requestId]
    );

    const owner = ownerResult.rows[0] || null;
    if (!owner) return res.status(404).json({ error: "NOT_FOUND" });

    const history = Array.isArray(owner.account_private_care_history) ? [...owner.account_private_care_history] : [];
    const rowIndex = history.findIndex((entry: any) => String(entry?.id || "").trim() === requestId);
    if (rowIndex < 0) return res.status(404).json({ error: "NOT_FOUND" });

    const before = normalizePrivateCareEntry(history[rowIndex]);
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });

    history.splice(rowIndex, 1);
    await query(
      `
      UPDATE users
      SET account_private_care_history = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      `,
      [String(owner.id || ""), JSON.stringify(history)]
    );

    const beforeRow = toAdminPrivateCareRow(owner, before);
    await recordAuditLog(req, {
      action: "delete",
      entityType: "private_care",
      entityId: requestId,
      summary: `Atendimento removido: ${requestId}`,
      before: beforeRow,
      after: null,
      reversePayload: null,
      reversible: false
    });

    return res.json({
      ok: true,
      removed: beforeRow
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_PRIVATE_CARE_DELETE_FAILED" });
  }
});

adminRouter.get("/repairs", async (req: any, res: any) => {
  const queryText = String(req.query.query || "").trim();
  const status = String(req.query.status || "").trim();
  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize || 50) || 50));

  try {
    await ensureRepairTables();
    const response = await listAdminRepairRequests({
      query: queryText,
      status,
      page,
      pageSize,
    });
    return res.json(response);
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "ADMIN_REPAIRS_LIST_FAILED" });
  }
});

adminRouter.patch("/repairs/:id", async (req: any, res: any) => {
  const repairId = String(req.params.id || "").trim();
  if (!repairId) return res.status(400).json({ error: "INVALID_ID" });
  const requestContext = buildRequestLogContext(req, {
    repairId,
    adminId: String(req.adminProfile?.id || "").trim() || null,
    adminEmail: normalizeEmail(req.adminUser?.email || ""),
  });

  const parsed = repairPatchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    logServerEvent("warn", {
      event: "repair_admin_update_rejected",
      message: "Repair admin update rejected by input validation.",
      ...requestContext,
      errorCode: "INVALID_INPUT",
      details: parsed.error.issues.map((issue: any) => ({
        path: Array.isArray(issue.path) ? issue.path.join(".") : "",
        message: String(issue.message || "INVALID_INPUT"),
      })),
    });
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  try {
    await ensureRepairTables();
    const nextStatus =
      parsed.data.decision === "reject"
        ? "rejected"
        : parsed.data.decision === "accept"
        ? "awaiting_shipment"
          : parsed.data.status;

    logServerEvent("info", {
      event: "repair_admin_update_started",
      message: "Repair admin update started.",
      ...requestContext,
      actionType: parsed.data.decision ? "decision" : "progress",
      decision: parsed.data.decision || null,
      nextStatus,
    });

    const result = await updateRepairRequestStatus(repairId, {
      action: parsed.data.decision ? "decision" : "progress",
      status: nextStatus,
      rejectionReason: parsed.data.rejectionReason,
      adminNote: parsed.data.adminNote,
      reviewedByAdminId: String(req.adminProfile?.id || "").trim() || null,
      actorAdminName: String(req.adminUser?.name || req.adminProfile?.name || "").trim(),
      actorAdminEmail: normalizeEmail(req.adminUser?.email || ""),
      trackingCode: parsed.data.trackingCode,
      pieceReceivedAt: parsed.data.pieceReceivedAt,
      returnPostedAt: parsed.data.returnPostedAt,
      returnedDeliveredAt: parsed.data.returnedDeliveredAt,
    });

    logServerEvent("info", {
      event: "repair_admin_update_succeeded",
      message: "Repair admin update persisted successfully.",
      ...requestContext,
      orderRef: result.repair.orderRef,
      beforeStatus: result.before.status,
      afterStatus: result.repair.status,
    });

    await recordAuditLog(req, {
      action: "save",
      entityType: "repair_request",
      entityId: repairId,
      summary: `Reparo atualizado para ${result.repair.status}: ${result.repair.orderRef}`,
      before: result.before,
      after: result.repair,
      reversePayload: null,
      reversible: false,
    });

    if (result.repair.userEmail) {
      if (result.before.status === "pending" && result.repair.status === "awaiting_shipment") {
        try {
          await sendRepairAcceptedEmail({
            clientName: result.repair.userName,
            clientEmail: result.repair.userEmail,
            pieceName: result.repair.pieceName,
            orderRef: result.repair.orderRef,
            repairDescription: result.repair.description,
          });
        } catch (emailError) {
          logServerEvent("error", {
            event: "repair_admin_accept_email_failed",
            message: "Repair accepted email failed after the status update.",
            ...requestContext,
            orderRef: result.repair.orderRef,
            repairStatus: result.repair.status,
            ...toErrorMeta(emailError),
          });
          throw emailError;
        }
      } else if (
        result.before.status !== result.repair.status &&
        ["item_received", "in_repair", "completed", "returned"].includes(result.repair.status)
      ) {
        try {
          await sendRepairStageUpdateEmail({
            clientName: result.repair.userName,
            clientEmail: result.repair.userEmail,
            pieceName: result.repair.pieceName,
            orderRef: result.repair.orderRef,
            repairDescription: result.repair.description,
            status: result.repair.status as "item_received" | "in_repair" | "completed" | "returned",
          });
        } catch (emailError) {
          logServerEvent("error", {
            event: "repair_admin_stage_email_failed",
            message: "Repair stage update email failed after the status update.",
            ...requestContext,
            orderRef: result.repair.orderRef,
            repairStatus: result.repair.status,
            ...toErrorMeta(emailError),
          });
          throw emailError;
        }
      } else if (result.repair.status === "rejected") {
        try {
          await sendRepairRejectedEmail({
            clientName: result.repair.userName,
            clientEmail: result.repair.userEmail,
            pieceName: result.repair.pieceName,
            orderRef: result.repair.orderRef,
            repairDescription: result.repair.description,
            rejectionReason: result.repair.rejectionReason,
          });
        } catch (emailError) {
          logServerEvent("error", {
            event: "repair_admin_reject_email_failed",
            message: "Repair rejected email failed after the status update.",
            ...requestContext,
            orderRef: result.repair.orderRef,
            repairStatus: result.repair.status,
            ...toErrorMeta(emailError),
          });
          throw emailError;
        }
      }
    }

    return res.json({ ok: true, repair: result.repair });
  } catch (error: any) {
    logServerEvent("error", {
      event: "repair_admin_update_failed",
      message: "Repair admin update failed.",
      ...requestContext,
      ...toErrorMeta(error),
    });
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "ADMIN_REPAIR_UPDATE_FAILED" });
  }
});

adminRouter.get("/newsletter", async (req: any, res: any) => {
  const queryText = String(req.query.query || "").trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize || 50) || 50));

  try {
    const raw = await readJson(newsletterDataFile, []);
    const rows = (Array.isArray(raw) ? raw : []).map((entry: any, index: any) => ({
      id: String(entry?.email || `newsletter_${index + 1}`),
      email: String(entry?.email || ""),
      phone: String(entry?.phone || ""),
      source: String(entry?.source || ""),
      page: String(entry?.page || ""),
      status: String(entry?.status || "active"),
      consent: Boolean(entry?.consent),
      subscribedAt: entry?.subscribedAt || null,
      updatedAt: entry?.updatedAt || null
    }));

    const filtered = queryText
      ? rows.filter((row: any) => {
          const haystack = [
            row.email,
            row.phone,
            row.source,
            row.page,
            row.status
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(queryText);
        })
      : rows;

    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    const paged = filtered.slice(offset, offset + pageSize);

    return res.json({
      rows: paged,
      total,
      page,
      pageSize
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_NEWSLETTER_LIST_FAILED" });
  }
});

adminRouter.delete("/newsletter/:id", sensitiveAdminRateLimit, async (req: any, res: any) => {
  const rawId = String(req.params.id || "").trim();
  if (!rawId) return res.status(400).json({ error: "INVALID_ID" });

  try {
    const list = await readJson(newsletterDataFile, []);
    const rows = Array.isArray(list) ? [...list] : [];
    const normalizedId = normalizeEmail(rawId);

    let removed: any = null;
    const nextRows = rows.filter((entry: any, index: number) => {
      const email = normalizeEmail(entry?.email || "");
      const fallbackId = `newsletter_${index + 1}`;
      const rowId = email || fallbackId;
      const matches =
        rowId === rawId ||
        fallbackId === rawId ||
        (normalizedId && email && normalizedId === email);
      if (!removed && matches) {
        removed = entry;
        return false;
      }
      return true;
    });

    if (!removed) return res.status(404).json({ error: "NOT_FOUND" });
    await writeJson(newsletterDataFile, nextRows);

    const removedEmail = normalizeEmail(removed?.email || "");
    const removedRow = {
      id: removedEmail || rawId,
      email: String(removed?.email || ""),
      phone: String(removed?.phone || ""),
      source: String(removed?.source || ""),
      page: String(removed?.page || ""),
      status: String(removed?.status || "active"),
      consent: Boolean(removed?.consent),
      subscribedAt: removed?.subscribedAt || null,
      updatedAt: removed?.updatedAt || null
    };

    await recordAuditLog(req, {
      action: "delete",
      entityType: "newsletter_subscriber",
      entityId: removedRow.id,
      summary: `Inscrito newsletter removido: ${removedRow.email || removedRow.id}`,
      before: removedRow,
      after: null,
      reversePayload: null,
      reversible: false
    });

    return res.json({ ok: true, removed: removedRow });
  } catch {
    return res.status(500).json({ error: "ADMIN_NEWSLETTER_DELETE_FAILED" });
  }
});

adminRouter.post("/newsletter/send", sensitiveAdminRateLimit, async (req: any, res: any) => {
  const parsed = newsletterSendSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const payload = parsed.data;
  const subject = String(payload.subject || "").trim();
  const html = String(payload.html || "").trim();
  const textFallback = String(payload.text || "").trim() || stripHtmlToText(html);
  const sourceFilter = String(payload.source || "").trim().toLowerCase();
  const testEmail = normalizeEmail(payload.testEmail || "");

  try {
    if (testEmail) {
      await sendEmail({
        to: testEmail,
        subject: `[TESTE] ${subject}`,
        html,
        text: textFallback
      });

      return res.json({
        ok: true,
        mode: "test",
        sent: 1,
        failed: 0,
        totalTargets: 1,
        targets: [testEmail]
      });
    }

    const raw = await readJson(newsletterDataFile, []);
    const list = Array.isArray(raw) ? raw : [];
    const uniqueEmails = new Set();
    const recipients: any[] = [];

    list.forEach((entry: any) => {
      const email = normalizeEmail(entry?.email || "");
      const source = String(entry?.source || "").trim().toLowerCase();
      const consent = Boolean(entry?.consent);
      const status = String(entry?.status || "active").trim().toLowerCase();
      if (!email || uniqueEmails.has(email)) return;
      if (!consent) return;
      if (status && status !== "active") return;
      if (sourceFilter && source !== sourceFilter) return;
      uniqueEmails.add(email);
      recipients.push(email);
    });

    if (!recipients.length) {
      return res.status(400).json({ error: "NEWSLETTER_NO_RECIPIENTS" });
    }

    let sent = 0;
    let failed = 0;
    const errors: any[] = [];

    for (const recipient of recipients) {
      try {
        await sendEmail({
          to: recipient,
          subject,
          html,
          text: textFallback
        });
        sent += 1;
      } catch (error: any) {
        failed += 1;
        if (errors.length < 20) {
          errors.push({
            email: recipient,
            error: String(error?.message || "EMAIL_DELIVERY_FAILED")
          });
        }
      }
    }

    return res.json({
      ok: true,
      mode: "campaign",
      totalTargets: recipients.length,
      sent,
      failed,
      errors
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_NEWSLETTER_SEND_FAILED" });
  }
});

adminRouter.get("/coupons", async (req: any, res: any) => {
  try {
    const query = String(req.query.query || "").trim();
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 50);
    const result = await listAccessCodes({ query, page, pageSize });
    return res.json({
      rows: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_COUPONS_LIST_FAILED" });
  }
});

adminRouter.post("/coupons", async (req: any, res: any) => {
  const parsed = accessCodeUpsertSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const result = await upsertAccessCode(parsed.data);
    if (!result?.ok) return res.status(400).json({ error: result?.error || "INVALID_INPUT" });
    return res.status(result.created ? 201 : 200).json({
      ok: true,
      created: Boolean(result.created),
      coupon: result.code
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_COUPON_SAVE_FAILED" });
  }
});

adminRouter.patch("/coupons/:code", async (req: any, res: any) => {
  const currentCode = normalizeCode(String(req.params.code || ""));
  if (!currentCode) return res.status(400).json({ error: "INVALID_CODE" });

  const parsed = accessCodeUpsertSchema.partial().safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const listed = await listAccessCodes({ query: currentCode, page: 1, pageSize: 200 });
    const current =
      (Array.isArray(listed.rows) ? listed.rows : []).find((entry: any) => String(entry?.code || "") === currentCode) || null;
    if (!current) return res.status(404).json({ error: "NOT_FOUND" });

    const requestedCode = normalizeCode(String(parsed.data.code || currentCode));
    if (!requestedCode) return res.status(400).json({ error: "INVALID_CODE" });

    const merged = { ...current, ...parsed.data, code: requestedCode };
    const result = await upsertAccessCode(merged);
    if (!result?.ok) return res.status(400).json({ error: result?.error || "INVALID_INPUT" });
    if (requestedCode !== currentCode) {
      await deleteAccessCode(currentCode).catch(() => null);
    }
    return res.json({ ok: true, coupon: result.code });
  } catch {
    return res.status(500).json({ error: "ADMIN_COUPON_UPDATE_FAILED" });
  }
});

adminRouter.delete("/coupons/:code", async (req: any, res: any) => {
  const code = normalizeCode(String(req.params.code || ""));
  if (!code) return res.status(400).json({ error: "INVALID_CODE" });

  try {
    const result = await deleteAccessCode(code);
    if (!result?.ok && result?.error === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
    if (!result?.ok) return res.status(400).json({ error: result?.error || "REQUEST_FAILED" });
    return res.json({ ok: true, removed: result.removed });
  } catch {
    return res.status(500).json({ error: "ADMIN_COUPON_DELETE_FAILED" });
  }
});

adminRouter.get("/vip/subscribers", async (req: any, res: any) => {
  const limit = Number(req.query.limit || 200);
  const offset = Number(req.query.offset || 0);

  try {
    assertVipDbConfigured();
    const subscribers = await listVipSubscribers({ limit, offset });
    const masked = subscribers.map((s: any) => ({
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
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_LIST_FAILED" });
  }
});

adminRouter.get("/vip", async (req: any, res: any) => {
  try {
    assertVipDbConfigured();
    const queryText = String(req.query.query || "").trim();
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 50);
    const result = await searchVipSubscribers({ query: queryText, page, pageSize });
    return res.json({
      rows: result.rows.map((s: any) => ({
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
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_LIST_FAILED" });
  }
});

adminRouter.get("/vip/:id", async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "INVALID_ID" });

  try {
    assertVipDbConfigured();
    const subscriber = await findVipSubscriberById(id);
    if (!subscriber) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ subscriber });
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_FETCH_FAILED" });
  }
});

adminRouter.post("/vip", async (req: any, res: any) => {
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
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_SAVE_FAILED" });
  }
});

adminRouter.patch("/vip/:id", async (req: any, res: any) => {
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
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_UPDATE_FAILED" });
  }
});

adminRouter.delete("/vip/:id", async (req: any, res: any) => {
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
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_DELETE_FAILED" });
  }
});

adminRouter.post("/vip/subscribers", async (req: any, res: any) => {
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
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_SAVE_FAILED" });
  }
});

adminRouter.patch("/vip/subscribers/:id", async (req: any, res: any) => {
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
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_UPDATE_FAILED" });
  }
});

adminRouter.delete("/vip/subscribers/:id", async (req: any, res: any) => {
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
  } catch (error: any) {
    if (String(error?.code || "") === "VIP_DATABASE_NOT_CONFIGURED") {
      return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    return res.status(500).json({ error: "ADMIN_VIP_DELETE_FAILED" });
  }
});

// POST /admin/notifications/send
adminRouter.post("/notifications/send", async (req: any, res: any) => {
  const { title, body, target } = req.body || {};
  if (!String(title || "").trim() || !String(body || "").trim()) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const db = req.app.locals.db;

    let tokenRows: { fcm_token: string }[] = [];
    if (target === "all" || !target) {
      tokenRows = await db.any("SELECT fcm_token FROM device_tokens");
    } else if (target === "orders") {
      tokenRows = await db.any(
        "SELECT DISTINCT dt.fcm_token FROM device_tokens dt INNER JOIN orders o ON o.user_id = dt.user_id"
      );
    } else if (target === "wishlist") {
      tokenRows = await db.any(
        "SELECT DISTINCT dt.fcm_token FROM device_tokens dt INNER JOIN wishlist_items wi ON wi.user_id = dt.user_id"
      );
    }

    const tokens: string[] = tokenRows.map((r: any) => r.fcm_token).filter(Boolean);

    // Firebase Admin send (requires FIREBASE_SERVICE_ACCOUNT env var)
    let sent = 0;
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountRaw && tokens.length > 0) {
      try {
        const admin = require("firebase-admin");
        if (!admin.apps.length) {
          admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountRaw)) });
        }
        const messaging = admin.messaging();
        const batchSize = 500;
        for (let i = 0; i < tokens.length; i += batchSize) {
          const batch = tokens.slice(i, i + batchSize);
          const response = await messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title: String(title).trim(), body: String(body).trim() },
          });
          sent += response.successCount;
        }
      } catch (firebaseError: any) {
        console.error("[notifications] Firebase send error:", firebaseError?.message);
      }
    }

    await db.none(
      "INSERT INTO notification_logs (title, body, target, sent_count) VALUES ($1, $2, $3, $4)",
      [String(title).trim(), String(body).trim(), target || "all", sent]
    );

    return res.json({ ok: true, sent, total: tokens.length });
  } catch (error: any) {
    console.error("[notifications] send error:", error);
    return res.status(500).json({ error: "NOTIFICATION_SEND_FAILED" });
  }
});

module.exports = {
  adminRouter
};

export {};
