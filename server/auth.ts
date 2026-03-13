const express = require("express");
const crypto = require("node:crypto");
const Stripe = require("stripe");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { hashPassword, verifyPassword } = require("./lib/password-hash");
const { applyCustomerSessionLifetime } = require("./lib/session-lifetime");
const { loginLimiter, forgotPasswordLimiter, registerLimiter } = require("./middlewares/rateLimiter");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require("@simplewebauthn/server");
const {
  publicUser,
  normalizeEmail,
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  markUserLoggedInNow,
  markUserEmailVerified
} = require("./user-repository");
const {
  listPasskeysByUserId,
  findPasskeyByCredentialId,
  createPasskey,
  updatePasskeyCounter
} = require("./lib/passkey-repository");
const { query } = require("./lib/db");
const { unprotectJsonFromStorage } = require("./lib/data-protection") as {
  unprotectJsonFromStorage: <T>(value: unknown, fallback: T) => T;
};
const { listOrdersByUserId, updateOrder } = require("./lib/order-repository");
const { commitStock } = require("./lib/inventory-repository");
const { requireAuth } = require("./middlewares/requireAuth");
const { userCsrfCookieName } = require("./middlewares/userCsrf");
const { issueAuthEmailCode, consumeAuthEmailCode } = require("./lib/auth-email-code-repository");
const {
  sendAccountVerificationEmail,
  sendLoginVerificationEmail,
  sendPasswordResetEmail
} = require("./lib/email-service");

const authRouter = express.Router();
const myRouter = express.Router();

const REFUND_WINDOW_MS = 10 * 60 * 1000;
let stripeClient: any = null;

function parseBooleanEnv(value: any, fallback: any = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function isLoginEmailVerificationRequired() {
  return parseBooleanEnv(process.env.AUTH_LOGIN_EMAIL_CODE_REQUIRED, false);
}

function getStripeClient() {
  if (stripeClient) return stripeClient;
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) return null;
  stripeClient = new Stripe(key);
  return stripeClient;
}

function maskEmailForLog(email: any) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 1) return normalized || "unknown";
  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const maskedLocal = `${local.slice(0, 2)}***`;
  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

function resolveConfiguredEmailProvider(): string {
  const explicit = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const hasResendKey = Boolean(String(process.env.RESEND_API_KEY || "").trim());
  if (explicit === "resend") return "resend";
  if (explicit === "console" && !hasResendKey) return "console";
  if (hasResendKey) return "resend";
  if (explicit) return explicit;
  return "console";
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
  .refine((value: any) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "INVALID_PASSWORD"
  });
const titleSchema = z.enum(["sr", "sra", "srta", "nao_informar"]);

const registerSchema = z.object({
  title: titleSchema.optional().default("nao_informar"),
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cpf: z.string().transform((value: any) => String(value || "").replace(/\D/g, "")).refine((value: any) => /^\d{11}$/.test(value)),
  cep: z.string().transform((value: any) => String(value || "").replace(/\D/g, "")).refine((value: any) => /^\d{8}$/.test(value))
});
const registerLiteSchema = z.object({
  title: titleSchema.optional().default("nao_informar"),
  name: z.string().trim().min(2).max(120),
  email: emailSchema
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128)
});
const googleLoginSchema = z.object({
  idToken: z.string().trim().min(20),
  nonce: z.string().trim().optional().default("")
});
const emailCodeStartSchema = z.object({
  email: emailSchema
});
const emailCodeVerifySchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/)
});

const checkEmailSchema = z.object({
  email: emailSchema
});

const forgotPasswordSchema = z.object({
  email: emailSchema
});

const verifyCodeSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/)
});

const loginVerifySchema = verifyCodeSchema;
const accountVerifySchema = verifyCodeSchema;
const activateAccountSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(8).max(128),
  orderNumber: z.string().trim().min(3).max(120).optional().default("")
});
const passkeyLoginOptionsSchema = z.object({
  email: emailSchema
});
const passkeyRegistrationVerifySchema = z.object({
  credential: z.any()
});
const passkeyLoginVerifySchema = z.object({
  email: emailSchema,
  credential: z.any()
});

const resetPasswordCodeSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/),
  password: passwordSchema
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(24),
  password: passwordSchema
});

const profileSchema = z.object({
  title: titleSchema.optional(),
  name: z.string().trim().min(2).max(120),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cpf: z
    .string()
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => /^\d{11}$/.test(value))
    .optional(),
  cep: z
    .string()
    .transform((value: any) => String(value || "").replace(/\D/g, ""))
    .refine((value: any) => /^\d{8}$/.test(value))
    .optional()
});

const addressSchema = z.object({
  label: z.string().trim().min(2).max(40),
  fullName: z.string().trim().min(3).max(120),
  cep: z.string().transform((value: any) => String(value || "").replace(/\D/g, "")).refine((value: any) => /^\d{8}$/.test(value)),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(120).optional().default(""),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z
    .string()
    .transform((value: any) => String(value || "").trim().toUpperCase())
    .refine((value: any) => /^[A-Z]{2}$/.test(value))
});

const favoritesSchema = z.object({
  favorites: z.array(z.string().trim().min(1).max(120)).max(500).optional().default([])
});

const marketingPreferencesSchema = z.object({
  email: z.coerce.boolean().optional().default(false),
  phone: z.coerce.boolean().optional().default(false),
  sms: z.coerce.boolean().optional().default(false),
  postal: z.coerce.boolean().optional().default(false)
});

const contactPreferencesSchema = z.object({
  email: z.coerce.boolean().optional().default(false),
  phone: z.coerce.boolean().optional().default(false),
  sms: z.coerce.boolean().optional().default(false)
});

const accountPreferencesSchema = z.object({
  marketing: marketingPreferencesSchema.optional(),
  contact: contactPreferencesSchema.optional()
});

const privateCareRequestSchema = z.object({
  channel: z.string().trim().min(2).max(40),
  date: z.string().trim().max(20).optional().default(""),
  time: z.string().trim().max(20).optional().default(""),
  subject: z.string().trim().min(2).max(80),
  message: z.string().trim().max(2000).optional().default("")
});

const privateCarePreferencesSchema = z.object({
  email: z.coerce.boolean().optional().default(false),
  phone: z.coerce.boolean().optional().default(false),
  sms: z.coerce.boolean().optional().default(false)
});

const repairRequestSchema = z.object({
  product: z.string().trim().min(2).max(180),
  reason: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional().default(""),
  photoName: z.string().trim().max(260).optional().default("")
});

let accountDataSchemaPromise: Promise<void> | null = null;

function parseBirthDate(value: any) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  const minAllowed = new Date("1900-01-01T00:00:00.000Z");
  if (date < minAllowed) return false;
  if (date > new Date()) return false;
  return true;
}

function normalizeAddressList(addresses: any, defaultAddressId: any = "") {
  const safe = Array.isArray(addresses)
    ? addresses
        .map((address: any) => {
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
        .filter((address: any) => address && address.id)
    : [];

  let chosenDefaultId = String(defaultAddressId || "").trim();
  if (!chosenDefaultId || !safe.some((address: any) => address.id === chosenDefaultId)) {
    chosenDefaultId = safe.find((address: any) => address.isDefault)?.id || safe[0]?.id || "";
  }

  return {
    defaultAddressId: chosenDefaultId,
    addresses: safe.map((address: any) => ({
      ...address,
      isDefault: Boolean(chosenDefaultId && address.id === chosenDefaultId)
    }))
  };
}

async function ensureAccountDataColumns() {
  if (!accountDataSchemaPromise) {
    accountDataSchemaPromise = (async () => {
      await query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS account_favorites JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS account_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS account_private_care_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS account_private_care_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS account_repairs_history JSONB NOT NULL DEFAULT '[]'::jsonb;
      `);
    })().catch((error: any) => {
      accountDataSchemaPromise = null;
      throw error;
    });
  }

  return accountDataSchemaPromise;
}

async function getAccountDataRow(userId: any) {
  await ensureAccountDataColumns();
  const result = await query(
    `
    SELECT
      id,
      account_favorites,
      account_preferences,
      account_private_care_history,
      account_private_care_preferences,
      account_repairs_history
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

function normalizeFavoriteIds(value: any) {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  const safe: string[] = [];
  value.forEach((entry: any) => {
    const normalized = String(entry || "").trim();
    if (!normalized || unique.has(normalized)) return;
    unique.add(normalized);
    safe.push(normalized);
  });
  return safe.slice(0, 500);
}

function normalizeContactPreferences(value: any = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    email: Boolean(source.email),
    phone: Boolean(source.phone),
    sms: Boolean(source.sms)
  };
}

function normalizeMarketingPreferences(value: any = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    email: Boolean(source.email),
    phone: Boolean(source.phone),
    sms: Boolean(source.sms),
    postal: Boolean(source.postal)
  };
}

function normalizeAccountPreferences(value: any = {}) {
  const source = value && typeof value === "object" ? value : {};
  const marketingSource = source.marketing && typeof source.marketing === "object" ? source.marketing : source;
  const contactSource = source.contact && typeof source.contact === "object" ? source.contact : {};
  return {
    marketing: normalizeMarketingPreferences(marketingSource),
    contact: normalizeContactPreferences(contactSource)
  };
}

function normalizePrivateCarePreferences(value: any = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    email: Boolean(source.email),
    phone: Boolean(source.phone),
    sms: Boolean(source.sms)
  };
}

function normalizePrivateCareHistory(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry: any) => {
      if (!entry || typeof entry !== "object") return null;
      return {
        id: String(entry.id || "").trim(),
        channel: String(entry.channel || "").trim(),
        date: String(entry.date || "").trim(),
        time: String(entry.time || "").trim(),
        subject: String(entry.subject || "").trim(),
        message: String(entry.message || "").trim(),
        status: String(entry.status || "Pendente").trim() || "Pendente",
        createdAt: String(entry.createdAt || new Date().toISOString()),
        updatedAt: String(entry.updatedAt || entry.createdAt || new Date().toISOString())
      };
    })
    .filter((entry: any) => entry && entry.id)
    .slice(0, 100);
}

function normalizeRepairsHistory(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry: any) => {
      if (!entry || typeof entry !== "object") return null;
      return {
        id: String(entry.id || "").trim(),
        protocol: String(entry.protocol || "").trim(),
        product: String(entry.product || "").trim(),
        reason: String(entry.reason || "").trim(),
        description: String(entry.description || "").trim(),
        photoName: String(entry.photoName || "").trim(),
        status: String(entry.status || "Em análise").trim() || "Em análise",
        createdAt: String(entry.createdAt || new Date().toISOString()),
        updatedAt: String(entry.updatedAt || entry.createdAt || new Date().toISOString())
      };
    })
    .filter((entry: any) => entry && entry.id)
    .slice(0, 100);
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

function isRefundWindowOpen(order: any) {
  const paidAt = String(order?.paidAt || "").trim();
  if (!paidAt) return false;
  const paidDate = new Date(paidAt);
  if (Number.isNaN(paidDate.getTime())) return false;
  return Date.now() - paidDate.getTime() <= REFUND_WINDOW_MS;
}

function buildEmailCodeResponseBase(email: any, stage: any, issued: any) {
  const response: {
    ok: true;
    email: string;
    stage: unknown;
    expiresAt: unknown;
    devCode?: string | null;
  } = {
    ok: true,
    email: normalizeEmail(email),
    stage,
    expiresAt: issued?.expiresAt || null
  };

  if (process.env.NODE_ENV !== "production") {
    response.devCode = issued?.code || null;
  }

  return response;
}

function getGoogleClientIds() {
  return String(process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((value: any) => value.trim())
    .filter(Boolean);
}

function normalizeHostCandidate(value: any) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/^\[|\]$/g, "").replace(/:\d+$/, "");
}

function resolveRequestOrigin(req: any) {
  if (!req) return "";
  const originHeader = String(req.get?.("origin") || "").trim();
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {}
  }
  const host = String(req.get?.("host") || "").trim();
  if (!host) return "";
  const protocol = String(req.protocol || "https").trim() || "https";
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return "";
  }
}

function deriveRpIdFromOrigin(origin: string) {
  if (!origin) return "";
  try {
    const hostname = normalizeHostCandidate(new URL(origin).hostname);
    if (!hostname) return "";
    if (hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return hostname;
    if (hostname.startsWith("www.")) return hostname.slice(4);
    return hostname;
  } catch {
    return "";
  }
}

function resolveWebauthnRpId(req: any) {
  const explicit = normalizeHostCandidate(process.env.WEBAUTHN_RP_ID);
  if (explicit) return explicit;

  const appBaseOrigin = String(process.env.APP_BASE_URL || "").trim();
  const fromAppBase = deriveRpIdFromOrigin(appBaseOrigin);
  if (fromAppBase) return fromAppBase;

  return deriveRpIdFromOrigin(resolveRequestOrigin(req));
}

function parseWebauthnOrigins(req: any, rpId: string) {
  const fromEnv = String(process.env.WEBAUTHN_ORIGIN || "")
    .split(",")
    .map((item: any) => String(item || "").trim())
    .filter(Boolean);
  const appBase = String(process.env.APP_BASE_URL || "").trim();
  if (appBase) fromEnv.push(appBase);
  const requestOrigin = resolveRequestOrigin(req);
  if (requestOrigin) fromEnv.push(requestOrigin);
  if (rpId) {
    fromEnv.push(`https://${rpId}`);
    if (!rpId.startsWith("www.") && rpId !== "localhost" && !/^\d{1,3}(\.\d{1,3}){3}$/.test(rpId)) {
      fromEnv.push(`https://www.${rpId}`);
    }
  }
  const unique: any[] = [];
  const seen = new Set();
  for (const origin of fromEnv) {
    try {
      const normalized = new URL(origin).origin;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      unique.push(normalized);
    } catch {}
  }
  return unique;
}

function getWebauthnConfig(req: any = null) {
  const rpId = resolveWebauthnRpId(req);
  const rpName = String(process.env.WEBAUTHN_RP_NAME || process.env.APP_NAME || "Tsebi").trim() || "Tsebi";
  const origins = parseWebauthnOrigins(req, rpId);
  return {
    enabled: Boolean(rpId && origins.length > 0),
    rpId,
    rpName,
    origins
  };
}

function getWebauthnExpectedOrigin(req: any = null) {
  const config = getWebauthnConfig(req);
  if (config.origins.length <= 1) return config.origins[0] || "";
  return config.origins;
}

function encodeChallengeForSession(challenge: any) {
  return String(challenge || "");
}

function getAuthenticatorAttachment() {
  const value = String(process.env.WEBAUTHN_AUTHENTICATOR_ATTACHMENT || "").trim().toLowerCase();
  if (value === "platform" || value === "cross-platform") return value;
  return undefined;
}

async function verifyGoogleIdToken(idToken: any) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    return { ok: false, error: "GOOGLE_TOKEN_INVALID" };
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") {
    return { ok: false, error: "GOOGLE_TOKEN_INVALID" };
  }

  const clientIds = getGoogleClientIds();
  const aud = String(data.aud || "").trim();
  if (!aud || (clientIds.length && !clientIds.includes(aud))) {
    return { ok: false, error: "GOOGLE_AUDIENCE_MISMATCH" };
  }

  const email = normalizeEmail(data.email || "");
  if (!email || String(data.email_verified || "").toLowerCase() !== "true") {
    return { ok: false, error: "GOOGLE_EMAIL_NOT_VERIFIED" };
  }

  return {
    ok: true,
    payload: {
      email,
      nonce: String(data.nonce || "").trim(),
      name: String(data.name || "").trim(),
      givenName: String(data.given_name || "").trim(),
      familyName: String(data.family_name || "").trim()
    }
  };
}

authRouter.get("/google/config", (req: any, res: any) => {
  const clientIds = getGoogleClientIds();
  const clientId = clientIds[0] || "";
  return res.json({
    ok: true,
    enabled: Boolean(clientId),
    clientId
  });
});

authRouter.get("/passkey/config", (req: any, res: any) => {
  const config = getWebauthnConfig(req);
  return res.json({
    ok: true,
    enabled: config.enabled,
    rpId: config.rpId,
    rpName: config.rpName
  });
});

authRouter.post("/passkey/register/options", requireAuth, async (req: any, res: any) => {
  const config = getWebauthnConfig(req);
  if (!config.enabled) return res.status(503).json({ error: "PASSKEY_NOT_CONFIGURED" });

  const user = await findUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });

  const existing = await listPasskeysByUserId(user.id);

  const options = await generateRegistrationOptions({
    rpID: config.rpId,
    rpName: config.rpName,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name || user.email,
    timeout: 60000,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: getAuthenticatorAttachment()
    },
    excludeCredentials: existing.map((item: any) => ({
      id: item.credentialId,
      transports: Array.isArray(item.transports) ? item.transports : []
    }))
  });

  req.session.passkeyRegistration = {
    userId: user.id,
    challenge: encodeChallengeForSession(options.challenge),
    createdAt: Date.now()
  };

  return res.json({ ok: true, options });
});

authRouter.post("/passkey/register/verify", requireAuth, async (req: any, res: any) => {
  const config = getWebauthnConfig(req);
  if (!config.enabled) return res.status(503).json({ error: "PASSKEY_NOT_CONFIGURED" });

  const parsed = passkeyRegistrationVerifySchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const pending = req.session?.passkeyRegistration || null;
  if (!pending || pending.userId !== req.session.userId || !pending.challenge) {
    return res.status(400).json({ error: "PASSKEY_CHALLENGE_NOT_FOUND" });
  }

  let verification: any = null;
  try {
    verification = await verifyRegistrationResponse({
      response: parsed.data.credential,
      expectedChallenge: pending.challenge,
      expectedOrigin: getWebauthnExpectedOrigin(req),
      expectedRPID: config.rpId,
      requireUserVerification: true
    });
  } catch {
    return res.status(400).json({ error: "PASSKEY_REGISTRATION_FAILED" });
  }

  if (!verification?.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: "PASSKEY_REGISTRATION_FAILED" });
  }

  const registrationInfo = verification.registrationInfo;
  const created = await createPasskey({
    userId: req.session.userId,
    credentialId: String(registrationInfo.credentialID || "").trim(),
    publicKey: Buffer.from(registrationInfo.credentialPublicKey || new Uint8Array()).toString("base64url"),
    counter: Number(registrationInfo.counter || 0),
    transports: parsed.data?.credential?.response?.transports || [],
    deviceType: String(registrationInfo.credentialDeviceType || ""),
    backedUp: registrationInfo.credentialBackedUp == null ? null : Boolean(registrationInfo.credentialBackedUp)
  });

  if (!created.ok) {
    if (created.error === "PASSKEY_ALREADY_EXISTS") {
      return res.status(409).json({ error: created.error });
    }
    return res.status(500).json({ error: "PASSKEY_SAVE_FAILED" });
  }

  delete req.session.passkeyRegistration;
  return res.json({ ok: true });
});

authRouter.post("/passkey/login/options", authRateLimit, async (req: any, res: any) => {
  const config = getWebauthnConfig(req);
  if (!config.enabled) return res.status(503).json({ error: "PASSKEY_NOT_CONFIGURED" });

  const parsed = passkeyLoginOptionsSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const genericInvalidResponse = () => res.status(401).json({ error: "INVALID_CREDENTIALS" });
  const user = await findUserByEmail(parsed.data.email);
  if (!user) return genericInvalidResponse();
  if (user.passwordResetRequired) return res.status(403).json({ error: "PASSWORD_RESET_REQUIRED" });

  const credentials = await listPasskeysByUserId(user.id);
  if (!credentials.length) {
    return genericInvalidResponse();
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    timeout: 60000,
    userVerification: "preferred",
    allowCredentials: credentials.map((item: any) => ({
      id: item.credentialId,
      transports: Array.isArray(item.transports) ? item.transports : []
    }))
  });

  req.session.passkeyAuthentication = {
    userId: user.id,
    email: user.email,
    challenge: encodeChallengeForSession(options.challenge),
    createdAt: Date.now()
  };

  return res.json({ ok: true, options });
});

authRouter.post("/passkey/login/verify", authRateLimit, async (req: any, res: any) => {
  const config = getWebauthnConfig(req);
  if (!config.enabled) return res.status(503).json({ error: "PASSKEY_NOT_CONFIGURED" });

  const parsed = passkeyLoginVerifySchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const pending = req.session?.passkeyAuthentication || null;
  if (!pending || !pending.challenge || !pending.userId) {
    return res.status(400).json({ error: "PASSKEY_CHALLENGE_NOT_FOUND" });
  }

  const email = normalizeEmail(parsed.data.email);
  if (!email || email !== normalizeEmail(pending.email || "")) {
    return res.status(400).json({ error: "INVALID_CREDENTIALS" });
  }

  const user = await findUserById(pending.userId);
  if (!user || normalizeEmail(user.email) !== email) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }
  if (user.passwordResetRequired) return res.status(403).json({ error: "PASSWORD_RESET_REQUIRED" });

  const rawCredentialId = String(parsed.data?.credential?.id || "").trim();
  if (!rawCredentialId) return res.status(400).json({ error: "INVALID_INPUT" });
  const storedPasskey = await findPasskeyByCredentialId(rawCredentialId);
  if (!storedPasskey || storedPasskey.userId !== user.id) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  let verification: any = null;
  try {
    verification = await verifyAuthenticationResponse({
      response: parsed.data.credential,
      expectedChallenge: pending.challenge,
      expectedOrigin: getWebauthnExpectedOrigin(req),
      expectedRPID: config.rpId,
      requireUserVerification: true,
      authenticator: {
        credentialID: storedPasskey.credentialId,
        credentialPublicKey: Buffer.from(storedPasskey.publicKey, "base64url"),
        counter: Number(storedPasskey.counter || 0),
        transports: Array.isArray(storedPasskey.transports) ? storedPasskey.transports : []
      }
    });
  } catch {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  if (!verification?.verified) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  await updatePasskeyCounter(storedPasskey.credentialId, Number(verification.authenticationInfo?.newCounter || 0));
  delete req.session.passkeyAuthentication;
  req.session.userId = user.id;
  applyCustomerSessionLifetime(req);
  markUserLoggedInNow(user.id).catch(() => {});
  return res.json({ ok: true, user: publicUser(user), stage: "authenticated" });
});

async function issueAndSendAccountVerifyCode(user: any) {
  const issued = await issueAuthEmailCode({
    userId: user.id,
    email: user.email,
    purpose: "account_verify"
  });
  if (!issued.ok) return issued;

  await sendAccountVerificationEmail({
    to: user.email,
    code: issued.code,
    minutes: 20
  });

  return { ok: true, issued };
}

async function issueAndSendLoginVerifyCode(user: any) {
  const issued = await issueAuthEmailCode({
    userId: user.id,
    email: user.email,
    purpose: "login_verify"
  });
  if (!issued.ok) return issued;

  await sendLoginVerificationEmail({
    to: user.email,
    code: issued.code,
    minutes: 20
  });

  return { ok: true, issued };
}

async function issueAndSendPasswordResetCode(user: any) {
  const issued = await issueAuthEmailCode({
    userId: user.id,
    email: user.email,
    purpose: "password_reset"
  });
  if (!issued.ok) return issued;

  await sendPasswordResetEmail({
    to: user.email,
    code: issued.code,
    minutes: 15
  });

  return { ok: true, issued };
}

authRouter.post("/register", registerLimiter, async (req: any, res: any) => {
  const parsed = registerSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const payload = parsed.data;
  if (!parseBirthDate(payload.birthDate)) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const normalizedEmail = normalizeEmail(payload.email);
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    if (existing.emailVerified) {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    }

    try {
      const resend = await issueAndSendAccountVerifyCode(existing);
      if (!resend.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
      return res.json(buildEmailCodeResponseBase(existing.email, "account_verification_required", resend.issued));
    } catch {
      return res.status(500).json({ error: "EMAIL_DELIVERY_FAILED" });
    }
  }

  const created = await createUser({
    title: payload.title,
    name: payload.name,
    email: normalizedEmail,
    passwordHash: await hashPassword(payload.password),
    birthDate: payload.birthDate,
    cpf: payload.cpf,
    cep: payload.cep,
    emailVerified: false
  });

  if (!created.ok) {
    return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
  }

  try {
    const sent = await issueAndSendAccountVerifyCode(created.user);
    if (!sent.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
    return res.status(201).json(buildEmailCodeResponseBase(created.user.email, "account_verification_required", sent.issued));
  } catch {
    return res.status(500).json({ error: "EMAIL_DELIVERY_FAILED" });
  }
});

authRouter.post("/register-lite", registerLimiter, async (req: any, res: any) => {
  const parsed = registerLiteSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const payload = parsed.data;
  const normalizedEmail = normalizeEmail(payload.email);
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    if (existing.emailVerified) {
      return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
    }

    try {
      const resend = await issueAndSendAccountVerifyCode(existing);
      if (!resend.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
      return res.json(buildEmailCodeResponseBase(existing.email, "account_verification_required", resend.issued));
    } catch {
      return res.status(500).json({ error: "EMAIL_DELIVERY_FAILED" });
    }
  }

  const autoPassword = `Tsebi${crypto.randomBytes(12).toString("hex")}1`;
  const created = await createUser({
    title: payload.title,
    name: payload.name,
    email: normalizedEmail,
    passwordHash: await hashPassword(autoPassword),
    birthDate: "",
    cpf: "",
    cep: "",
    emailVerified: false
  });

  if (!created.ok) {
    return res.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
  }

  try {
    const sent = await issueAndSendAccountVerifyCode(created.user);
    if (!sent.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
    return res.status(201).json(buildEmailCodeResponseBase(created.user.email, "account_verification_required", sent.issued));
  } catch {
    return res.status(500).json({ error: "EMAIL_DELIVERY_FAILED" });
  }
});

authRouter.post("/check-email", authRateLimit, async (req: any, res: any) => {
  const parsed = checkEmailSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);
  return res.json({ ok: true, exists: Boolean(user) });
});

authRouter.post("/email/verify-account", authRateLimit, async (req: any, res: any) => {
  const parsed = accountVerifySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);
  if (!user) return res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });

  const consumed = await consumeAuthEmailCode({
    email,
    purpose: "account_verify",
    code: parsed.data.code
  });
  if (!consumed.ok || consumed.userId !== user.id) {
    return res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
  }

  const verified = await markUserEmailVerified(user.id);
  if (!verified) return res.status(404).json({ error: "USER_NOT_FOUND" });
  req.session.userId = verified.id;
  applyCustomerSessionLifetime(req);
  return res.json({ ok: true, user: publicUser(verified) });
});

authRouter.post("/email/resend-account-code", resetRateLimit, async (req: any, res: any) => {
  const parsed = forgotPasswordSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);
  if (!user || user.emailVerified) return res.json({ ok: true });

  try {
    const sent = await issueAndSendAccountVerifyCode(user);
    if (!sent.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
    return res.json(buildEmailCodeResponseBase(user.email, "account_verification_required", sent.issued));
  } catch {
    return res.status(500).json({ error: "EMAIL_DELIVERY_FAILED" });
  }
});

authRouter.post("/email/start", authRateLimit, async (req: any, res: any) => {
  const parsed = emailCodeStartSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);
  if (!user) return res.status(200).json(buildEmailCodeResponseBase(email, "login_code_required", null));

  try {
    if (!user.emailVerified) {
      const accountCode = await issueAndSendAccountVerifyCode(user);
      if (!accountCode.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
      return res.json(buildEmailCodeResponseBase(user.email, "account_verification_required", accountCode.issued));
    }

    if (user.passwordResetRequired) {
      const resetCode = await issueAndSendPasswordResetCode(user);
      if (!resetCode.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
      return res.status(200).json(buildEmailCodeResponseBase(user.email, "password_reset_required", resetCode.issued));
    }

    const loginCode = await issueAndSendLoginVerifyCode(user);
    if (!loginCode.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
    return res.json(buildEmailCodeResponseBase(user.email, "login_code_required", loginCode.issued));
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("[auth/email-start] email delivery failed", {
      email: maskEmailForLog(email),
      provider: resolveConfiguredEmailProvider(),
      message: String(error?.message || "unknown_error")
    });
    return res.status(500).json({ error: "EMAIL_DELIVERY_FAILED" });
  }
});

authRouter.post("/email/verify", authRateLimit, async (req: any, res: any) => {
  const parsed = emailCodeVerifySchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const email = normalizeEmail(parsed.data.email);
  let user = await findUserByEmail(email);
  if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  if (user.passwordResetRequired) return res.status(403).json({ error: "PASSWORD_RESET_REQUIRED" });

  let consumed = await consumeAuthEmailCode({
    email,
    purpose: "login_verify",
    code: parsed.data.code
  });

  if ((!consumed.ok || consumed.userId !== user.id) && !user.emailVerified) {
    consumed = await consumeAuthEmailCode({
      email,
      purpose: "account_verify",
      code: parsed.data.code
    });
    if (consumed.ok && consumed.userId === user.id) {
      const verified = await markUserEmailVerified(user.id);
      if (verified) user = verified;
    }
  }

  if (!consumed.ok || consumed.userId !== user.id) {
    return res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
  }

  req.session.userId = user.id;
  applyCustomerSessionLifetime(req);
  markUserLoggedInNow(user.id).catch(() => {});
  return res.json({ ok: true, user: publicUser(user), stage: "authenticated" });
});

authRouter.post(
  "/login",
  loginLimiter,
  /**
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   */
  async (req: any, res: any) => {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const email = normalizeEmail(parsed.data.email);
  const password = parsed.data.password;
  let user = await findUserByEmail(email);

  if (!user) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const storedHash = String(user.passwordHash || "").trim();
  if (!storedHash) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const passwordCheck = await verifyPassword(password, storedHash);
  if (!passwordCheck.ok) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  if (passwordCheck.needsRehash) {
    try {
      const refreshedHash = await hashPassword(password);
      const refreshedUser = await updateUser(user.id, { passwordHash: refreshedHash });
      if (refreshedUser) user = refreshedUser;
    } catch {}
  }

  try {
    if (!user.emailVerified) {
      const accountCode = await issueAndSendAccountVerifyCode(user);
      if (!accountCode.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
      return res.status(200).json(
        buildEmailCodeResponseBase(user.email, "account_verification_required", accountCode.issued)
      );
    }

    if (user.passwordResetRequired) {
      const resetCode = await issueAndSendPasswordResetCode(user);
      if (!resetCode.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
      return res.status(200).json(
        buildEmailCodeResponseBase(user.email, "password_reset_required", resetCode.issued)
      );
    }

    if (!isLoginEmailVerificationRequired()) {
      req.session.userId = user.id;
      applyCustomerSessionLifetime(req);
      markUserLoggedInNow(user.id).catch(() => {});
      return res.json({ ok: true, user: publicUser(user), stage: "authenticated" });
    }

    const loginCode = await issueAndSendLoginVerifyCode(user);
    if (!loginCode.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
    return res.json(buildEmailCodeResponseBase(user.email, "login_code_required", loginCode.issued));
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("[auth/login] email delivery failed", {
      email: maskEmailForLog(email),
      provider: resolveConfiguredEmailProvider(),
      message: String(error?.message || "unknown_error")
    });
    return res.status(500).json({ error: "EMAIL_DELIVERY_FAILED" });
  }
  }
);

authRouter.post("/google", authRateLimit, async (req: any, res: any) => {
  const parsed = googleLoginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const verify = await verifyGoogleIdToken(parsed.data.idToken);
  if (!verify.ok) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const payload: any = verify.payload!;
  if (parsed.data.nonce && payload.nonce && parsed.data.nonce !== payload.nonce) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  let user = await findUserByEmail(payload.email);
  if (!user) {
    const fallbackName =
      payload.name ||
      [payload.givenName, payload.familyName].filter(Boolean).join(" ").trim() ||
      "Cliente Tsebi";
    const randomPasswordHash = await hashPassword(crypto.randomBytes(24).toString("hex"));
    const created = await createUser({
      title: "nao_informar",
      name: fallbackName,
      email: payload.email,
      passwordHash: randomPasswordHash,
      birthDate: "",
      cpf: "",
      cep: "",
      emailVerified: true
    });
    if (!created.ok || !created.user) {
      return res.status(500).json({ error: "REQUEST_FAILED" });
    }
    user = created.user;
  } else if (!user.emailVerified) {
    user = await markUserEmailVerified(user.id);
  }

  if (!user || user.loginDisabled) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  req.session.userId = user.id;
  applyCustomerSessionLifetime(req);
  markUserLoggedInNow(user.id).catch(() => {});
  return res.json({ ok: true, user: publicUser(user), stage: "authenticated" });
});

authRouter.post("/login/verify-code", authRateLimit, async (req: any, res: any) => {
  const parsed = loginVerifySchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);
  if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  if (user.passwordResetRequired) return res.status(403).json({ error: "PASSWORD_RESET_REQUIRED" });
  if (!user.emailVerified) return res.status(403).json({ error: "EMAIL_NOT_VERIFIED" });

  const consumed = await consumeAuthEmailCode({
    email,
    purpose: "login_verify",
    code: parsed.data.code
  });
  if (!consumed.ok || consumed.userId !== user.id) {
    return res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
  }

  req.session.userId = user.id;
  applyCustomerSessionLifetime(req);
  markUserLoggedInNow(user.id).catch(() => {});
  return res.json({ ok: true, user: publicUser(user) });
});

authRouter.post("/activate", authRateLimit, async (req: any, res: any) => {
  const parsed = activateAccountSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const payload = parsed.data;
  if (String(payload.password) !== String(payload.confirmPassword)) {
    return res.status(400).json({ error: "PASSWORD_MISMATCH" });
  }

  const email = normalizeEmail(payload.email);
  const user = await findUserByEmail(email);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  if (String(user.passwordHash || "").trim()) {
    return res.status(409).json({ error: "ACCOUNT_ALREADY_HAS_PASSWORD" });
  }

  const normalizedOrderLookup = String(payload.orderNumber || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();

  if (normalizedOrderLookup) {
    const orderResult = await query(
      `
      SELECT id
      FROM orders
      WHERE lower(COALESCE(user_email, '')) = $1
        AND (
          upper(replace(COALESCE(order_number, ''), '-', '')) = $2
          OR upper(replace(COALESCE(order_number, ''), '-', '')) = CONCAT('PED', $2)
        )
      LIMIT 1
      `,
      [email, normalizedOrderLookup]
    );
    if (orderResult.rowCount === 0) {
      return res.status(400).json({ error: "ORDER_NOT_FOUND_FOR_EMAIL" });
    }
  }

  const passwordHash = await hashPassword(payload.password);
  const updated = await updateUser(user.id, {
    passwordHash,
    passwordResetRequired: false,
    isGuest: false,
    createdVia: user.createdVia || "checkout_guest"
  });
  if (!updated) return res.status(404).json({ error: "USER_NOT_FOUND" });

  req.session.userId = updated.id;
  applyCustomerSessionLifetime(req);
  markUserLoggedInNow(updated.id).catch(() => {});
  return res.json({ ok: true, user: publicUser(updated), stage: "authenticated" });
});

authRouter.post("/logout", (req: any, res: any) => {
  const sessionCookieName = String(process.env.SESSION_COOKIE_NAME || "tsebi.sid");
  const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const csrfCookieName = String(userCsrfCookieName || process.env.USER_CSRF_COOKIE_NAME || "tsebi.csrf").trim() || "tsebi.csrf";
  const cookieDomain = (() => {
    const explicit = String(process.env.SESSION_COOKIE_DOMAIN || "").trim().toLowerCase();
    const isLocalOrIp = (value: string) =>
      !value || value === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || "").trim().toLowerCase());

    if (explicit && !isLocalOrIp(explicit)) {
      const normalized = explicit.replace(/^\./, "").replace(/^www\./, "");
      return normalized ? `.${normalized}` : "";
    }

    const appBase = String(process.env.APP_BASE_URL || "").trim();
    if (!appBase) return "";
    try {
      const hostname = String(new URL(appBase).hostname || "").trim().toLowerCase();
      if (isLocalOrIp(hostname)) return "";
      const normalized = hostname.replace(/^www\./, "");
      return normalized ? `.${normalized}` : "";
    } catch {
      return "";
    }
  })();

  const clearSessionCookies = () => {
    res.clearCookie(sessionCookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {})
    });
    res.clearCookie(csrfCookieName, {
      httpOnly: false,
      sameSite: "strict",
      secure: isProduction,
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {})
    });
  };

  res.setHeader("Cache-Control", "no-store");

  if (!req.session) {
    clearSessionCookies();
    return res.json({ ok: true });
  }

  delete req.session.userId;
  delete req.session.userCsrfToken;
  delete req.session.passkeyAuthentication;
  delete req.session.passkeyRegistration;
  delete req.session.adminAuth;

  return req.session.destroy(() => {
    clearSessionCookies();
    return res.json({ ok: true });
  });
});

authRouter.get(
  "/me",
  /**
   * @param {import("express").Request} req
   * @param {import("express").Response} res
   */
  async (req: any, res: any) => {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const userId = req.session?.userId;
  if (!userId) return res.json({ authenticated: false, user: null });
  const user = await findUserById(userId);
  if (!user) return res.json({ authenticated: false, user: null });
  return res.json({ authenticated: true, user: publicUser(user) });
  }
);

authRouter.post("/forgot-password", forgotPasswordLimiter, async (req: any, res: any) => {
  const parsed = forgotPasswordSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);

  if (!user) {
    return res.json({ ok: true });
  }

  try {
    const sent = await issueAndSendPasswordResetCode(user);
    if (!sent.ok) return res.status(500).json({ error: "AUTH_CODE_ISSUE_FAILED" });
    const response: { ok: true; expiresAt: unknown; devCode?: string | null } = {
      ok: true,
      expiresAt: sent.issued?.expiresAt || null
    };
    if (process.env.NODE_ENV !== "production") {
      response.devCode = sent.issued?.code || null;
    }
    return res.json(response);
  } catch (error: any) {
    const configuredProvider = String(
      process.env.EMAIL_PROVIDER || (String(process.env.RESEND_API_KEY || "").trim() ? "resend" : "console")
    )
      .trim()
      .toLowerCase();
    // Logs only on server side (Railway), keeping response generic for security.
    // eslint-disable-next-line no-console
    console.error("[auth/forgot-password] email delivery failed", {
      email: maskEmailForLog(email),
      provider: configuredProvider || "unknown",
      message: String(error?.message || "unknown_error"),
      stack: String(error?.stack || "")
    });
    if (process.env.NODE_ENV === "production") {
      // Em producao, evita vazar comportamento de email.
      return res.json({ ok: true });
    }
    return res.status(500).json({ error: "EMAIL_DELIVERY_FAILED" });
  }
});

authRouter.post("/forgot-password/verify-code", forgotPasswordLimiter, async (req: any, res: any) => {
  const parsed = resetPasswordCodeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const email = normalizeEmail(parsed.data.email);
  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
  }

  const consumed = await consumeAuthEmailCode({
    email,
    purpose: "password_reset",
    code: parsed.data.code
  });
  if (!consumed.ok || consumed.userId !== user.id) {
    return res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
  }

  const updated = await updateUser(user.id, {
    passwordHash: await hashPassword(parsed.data.password),
    passwordResetRequired: false,
    isGuest: false
  });

  if (!updated) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  return res.json({ ok: true });
});

// Compat legado (token antigo): mantido para nao quebrar clientes antigos.
authRouter.post("/reset-password", forgotPasswordLimiter, async (req: any, res: any) => {
  const parsed = resetPasswordSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  return res.status(410).json({ error: "RESET_TOKEN_FLOW_DEPRECATED_USE_EMAIL_CODE" });
});

myRouter.get("/orders", requireAuth, async (req: any, res: any) => {
  const orders = await listOrdersByUserId(req.session.userId);
  const reconciledOrders: any[] = [];

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

myRouter.get("/orders/:orderId", requireAuth, async (req: any, res: any) => {
  const orders = await listOrdersByUserId(req.session.userId);
  const order = orders.find((item: any) => item.id === req.params.orderId) || null;
  if (!order) return res.status(404).json({ error: "ORDER_NOT_FOUND" });

  try {
    const reconciled = await reconcileOrderWithStripe(order);
    return res.json({ order: reconciled || order });
  } catch {
    return res.json({ order });
  }
});

myRouter.post("/orders/:orderId/cancel", requireAuth, async (req: any, res: any) => {
  const orders = await listOrdersByUserId(req.session.userId);
  const order = orders.find((item: any) => item.id === req.params.orderId) || null;
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
  } catch (error: any) {
    if (error && error.code === "payment_intent_unexpected_state") {
      return res.status(409).json({ error: "ORDER_NOT_CANCELABLE" });
    }
    return res.status(400).json({ error: "CANCEL_FAILED" });
  }
});

myRouter.post("/orders/:orderId/refund", requireAuth, async (req: any, res: any) => {
  const orders = await listOrdersByUserId(req.session.userId);
  const order = orders.find((item: any) => item.id === req.params.orderId) || null;
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

myRouter.put("/profile", requireAuth, async (req: any, res: any) => {
  const parsed = profileSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const currentUser = await findUserById(req.session.userId);
  if (!currentUser) return res.status(404).json({ error: "USER_NOT_FOUND" });

  if (parsed.data.birthDate && !parseBirthDate(parsed.data.birthDate)) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const updated = await updateUser(req.session.userId, {
    title: parsed.data.title,
    name: parsed.data.name,
    birthDate: parsed.data.birthDate || currentUser.birthDate,
    cpf: parsed.data.cpf || currentUser.cpf,
    cep: parsed.data.cep || currentUser.cep
  });
  if (!updated) return res.status(404).json({ error: "USER_NOT_FOUND" });
  return res.json({ user: publicUser(updated) });
});

myRouter.get("/checkout-prefill", requireAuth, async (req: any, res: any) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const normalizeDigits = (value: any) => String(value || "").replace(/\D/g, "");
  const normalizePhone = (value: any) => normalizeDigits(value).slice(0, 11);
  const normalizeCpf = (value: any) => normalizeDigits(value).slice(0, 11);
  const normalizeName = (value: any) => String(value || "").trim();

  let historyPhone = "";
  let historyCpf = "";
  let historyName = "";

  try {
    const orderResult = await query(
      `
      SELECT shipping_json
      FROM orders
      WHERE lower(COALESCE(user_email, '')) = lower($1)
      ORDER BY COALESCE(paid_at, created_at) DESC
      LIMIT 20
      `,
      [normalizeEmail(user.email || "")]
    );

    for (const row of orderResult.rows || []) {
      const shippingRaw = unprotectJsonFromStorage<unknown>(row?.shipping_json, row?.shipping_json ?? {});
      const shipping: Record<string, unknown> =
        shippingRaw && typeof shippingRaw === "object" && !Array.isArray(shippingRaw)
          ? (shippingRaw as Record<string, unknown>)
          : {};
      if (!historyPhone) historyPhone = normalizePhone(shipping.phone || "");
      if (!historyCpf) historyCpf = normalizeCpf(shipping.cpf || "");
      if (!historyName) historyName = normalizeName(shipping.fullName || "");
      if (historyPhone && historyCpf && historyName) break;
    }
  } catch {
    // Se histórico falhar, retorna o que houver no perfil.
  }

  const phone = normalizePhone(user.phone || historyPhone || "");
  const cpf = normalizeCpf(user.cpf || historyCpf || "");
  const fullName = normalizeName(user.name || historyName || "");

  return res.json({
    phone,
    cpf,
    fullName,
    sources: {
      phone: normalizePhone(user.phone || "") ? "account" : historyPhone ? "orders" : "",
      cpf: normalizeCpf(user.cpf || "") ? "account" : historyCpf ? "orders" : "",
      fullName: normalizeName(user.name || "") ? "account" : historyName ? "orders" : ""
    }
  });
});

myRouter.get("/addresses", requireAuth, async (req: any, res: any) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
  const normalized = normalizeAddressList(user.addresses, user.defaultAddressId);
  return res.json({
    defaultAddressId: normalized.defaultAddressId,
    addresses: normalized.addresses
  });
});

myRouter.post("/addresses", requireAuth, async (req: any, res: any) => {
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
  const defaultAddress = nextList.addresses.find((item: any) => item.isDefault) || null;

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

myRouter.put("/addresses/:addressId", requireAuth, async (req: any, res: any) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const addressId = String(req.params.addressId || "").trim();
  const parsed = addressSchema.safeParse(req.body || {});
  if (!addressId || !parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const current = normalizeAddressList(user.addresses, user.defaultAddressId);
  if (!current.addresses.some((address: any) => address.id === addressId)) {
    return res.status(404).json({ error: "ADDRESS_NOT_FOUND" });
  }

  const addresses = current.addresses.map((address: any) =>
    address.id === addressId
      ? {
          ...address,
          ...parsed.data,
          updatedAt: new Date().toISOString()
        }
      : address
  );

  const nextList = normalizeAddressList(addresses, current.defaultAddressId);
  const defaultAddress = nextList.addresses.find((item: any) => item.isDefault) || null;

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

myRouter.post("/addresses/:addressId/default", requireAuth, async (req: any, res: any) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const addressId = String(req.params.addressId || "").trim();
  const current = normalizeAddressList(user.addresses, user.defaultAddressId);
  if (!current.addresses.some((address: any) => address.id === addressId)) {
    return res.status(404).json({ error: "ADDRESS_NOT_FOUND" });
  }

  const nextList = normalizeAddressList(current.addresses, addressId);
  const defaultAddress = nextList.addresses.find((item: any) => item.isDefault) || null;
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

myRouter.delete("/addresses/:addressId", requireAuth, async (req: any, res: any) => {
  const user = await findUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const addressId = String(req.params.addressId || "").trim();
  const current = normalizeAddressList(user.addresses, user.defaultAddressId);
  if (!current.addresses.some((address: any) => address.id === addressId)) {
    return res.status(404).json({ error: "ADDRESS_NOT_FOUND" });
  }

  const remaining = current.addresses.filter((address: any) => address.id !== addressId);
  const nextDefault = current.defaultAddressId === addressId ? remaining[0]?.id || "" : current.defaultAddressId;
  const nextList = normalizeAddressList(remaining, nextDefault);
  const defaultAddress = nextList.addresses.find((item: any) => item.isDefault) || null;

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

myRouter.get("/favorites", requireAuth, async (req: any, res: any) => {
  const row = await getAccountDataRow(req.session.userId);
  if (!row) return res.status(404).json({ error: "USER_NOT_FOUND" });
  const csrfToken = String(req.session?.userCsrfToken || "").trim();
  return res.json({
    favorites: normalizeFavoriteIds(row.account_favorites),
    csrfToken: csrfToken || undefined
  });
});

myRouter.put("/favorites", requireAuth, async (req: any, res: any) => {
  const parsed = favoritesSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  await ensureAccountDataColumns();
  const favorites = normalizeFavoriteIds(parsed.data.favorites);
  const updated = await query(
    `
    UPDATE users
    SET account_favorites = $2::jsonb,
        updated_at = NOW()
    WHERE id = $1
    RETURNING id
    `,
    [req.session.userId, JSON.stringify(favorites)]
  );

  if (!updated.rowCount) return res.status(404).json({ error: "USER_NOT_FOUND" });
  const csrfToken = String(req.session?.userCsrfToken || "").trim();
  return res.json({
    favorites,
    csrfToken: csrfToken || undefined
  });
});

myRouter.get("/preferences", requireAuth, async (req: any, res: any) => {
  const row = await getAccountDataRow(req.session.userId);
  if (!row) return res.status(404).json({ error: "USER_NOT_FOUND" });
  return res.json({
    preferences: normalizeAccountPreferences(row.account_preferences)
  });
});

myRouter.put("/preferences", requireAuth, async (req: any, res: any) => {
  const parsed = accountPreferencesSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const row = await getAccountDataRow(req.session.userId);
  if (!row) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const current = normalizeAccountPreferences(row.account_preferences);
  const next = {
    marketing: parsed.data.marketing ? normalizeMarketingPreferences(parsed.data.marketing) : current.marketing,
    contact: parsed.data.contact ? normalizeContactPreferences(parsed.data.contact) : current.contact
  };

  await query(
    `
    UPDATE users
    SET account_preferences = $2::jsonb,
        updated_at = NOW()
    WHERE id = $1
    `,
    [req.session.userId, JSON.stringify(next)]
  );

  return res.json({ preferences: next });
});

myRouter.get("/private-care", requireAuth, async (req: any, res: any) => {
  const row = await getAccountDataRow(req.session.userId);
  if (!row) return res.status(404).json({ error: "USER_NOT_FOUND" });
  return res.json({
    history: normalizePrivateCareHistory(row.account_private_care_history),
    preferences: normalizePrivateCarePreferences(row.account_private_care_preferences)
  });
});

myRouter.put("/private-care/preferences", requireAuth, async (req: any, res: any) => {
  const parsed = privateCarePreferencesSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  await ensureAccountDataColumns();
  const preferences = normalizePrivateCarePreferences(parsed.data);
  const updated = await query(
    `
    UPDATE users
    SET account_private_care_preferences = $2::jsonb,
        updated_at = NOW()
    WHERE id = $1
    RETURNING id
    `,
    [req.session.userId, JSON.stringify(preferences)]
  );
  if (!updated.rowCount) return res.status(404).json({ error: "USER_NOT_FOUND" });
  return res.json({ preferences });
});

myRouter.post("/private-care", requireAuth, async (req: any, res: any) => {
  const parsed = privateCareRequestSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const row = await getAccountDataRow(req.session.userId);
  if (!row) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const now = new Date().toISOString();
  const entry = {
    id: `pc-${crypto.randomUUID()}`,
    channel: parsed.data.channel,
    date: parsed.data.date,
    time: parsed.data.time,
    subject: parsed.data.subject,
    message: parsed.data.message,
    status: "Pendente",
    createdAt: now,
    updatedAt: now
  };
  const history = [entry, ...normalizePrivateCareHistory(row.account_private_care_history)].slice(0, 100);

  await query(
    `
    UPDATE users
    SET account_private_care_history = $2::jsonb,
        updated_at = NOW()
    WHERE id = $1
    `,
    [req.session.userId, JSON.stringify(history)]
  );

  return res.status(201).json({ request: entry, history });
});

myRouter.get("/repairs", requireAuth, async (req: any, res: any) => {
  const row = await getAccountDataRow(req.session.userId);
  if (!row) return res.status(404).json({ error: "USER_NOT_FOUND" });
  return res.json({
    history: normalizeRepairsHistory(row.account_repairs_history)
  });
});

myRouter.post("/repairs", requireAuth, async (req: any, res: any) => {
  const parsed = repairRequestSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const row = await getAccountDataRow(req.session.userId);
  if (!row) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const now = new Date().toISOString();
  const entry = {
    id: `rp-${crypto.randomUUID()}`,
    protocol: `RP-${String(Date.now()).slice(-6)}`,
    product: parsed.data.product,
    reason: parsed.data.reason,
    description: parsed.data.description,
    photoName: parsed.data.photoName,
    status: "Em análise",
    createdAt: now,
    updatedAt: now
  };
  const history = [entry, ...normalizeRepairsHistory(row.account_repairs_history)].slice(0, 100);

  await query(
    `
    UPDATE users
    SET account_repairs_history = $2::jsonb,
        updated_at = NOW()
    WHERE id = $1
    `,
    [req.session.userId, JSON.stringify(history)]
  );

  return res.status(201).json({ repair: entry, history });
});

module.exports = {
  authRouter,
  myRouter
};

export {};
