import type { Express } from "express";
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const dotenv = require("dotenv");
const Stripe = require("stripe");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { createSessionMiddleware } = require("./session");
const { attachUserCsrfToken, requireUserCsrfForMutations } = require("./middlewares/userCsrf");
const { hashPassword } = require("./lib/password-hash");
const { authRouter, myRouter } = require("./auth");
const { studioAuthRouter } = require("./studio-auth");
const { vipRouter } = require("./vip");
const { adminRouter } = require("./admin");
const { readJson, writeJson } = require("./lib/json-store");
const { findUserById, upsertCheckoutGuestUser, setGuestTempPasswordIfMissing, normalizeEmail, updateUser } = require("./user-repository");
const { sendGuestCheckoutAccountCreatedEmail, sendEmail } = require("./lib/email-service");
const {
  createOrder,
  updateOrder,
  findOrderById,
  listOrdersByUserId
} = require("./lib/order-repository");
const { notifyOrderConfirmed, notifyPaymentApproved } = require("./lib/order-notification-service");
const { saveSubscription, deleteSubscription } = require("./lib/push-notification-service");
const {
  listProducts,
  getProductByIdentifier,
  searchStorefrontProducts,
  searchStorefrontSuggestions
} = require("./lib/product-repository");
const { checkAvailability, commitStock } = require("./lib/inventory-repository");
const { evaluateAccessCode, incrementAccessCodeUsage } = require("./lib/access-code-repository");
const { withTransaction, query } = require("./lib/db");
const { logProductSearchEvent } = require("./lib/search-telemetry-repository");
const {
  logBehaviorEvent,
  mergeAnonymousIdentity,
  getRecommendationsForActor,
  priceBucketFromCents
} = require("./lib/behavior-analytics-repository");
const { listAppointmentSlotsForDate, createAppointment } = require("./lib/appointments-repository");
const { shippingRouter } = require("../src/routes/shipping.routes");
const { adminShippingRouter } = require("../src/routes/admin.shipping.routes");
const { adminWhatsAppRouter } = require("../src/routes/admin.whatsapp.routes");
const { orderTrackingRouter } = require("../src/routes/order-tracking.routes");
const { whatsappRouter } = require("../src/routes/whatsapp.routes");
const { resolveQuoteForCheckout, selectShippingForOrder } = require("../src/shipping/shipping.service");
const { syncMelhorEnvioTrackingJob } = require("../src/shipping/order-tracking.service");
const { sendOrderConfirmedWhatsApp } = require("./lib/whatsapp-service");
const { startNotificationScheduler } = require("./lib/notification-scheduler");

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
const stripeCheckoutPaymentMethodTypes = ["card", "boleto"];
const posthogPublicKey = process.env.POSTHOG_PUBLIC_KEY || "";
const posthogHost = process.env.POSTHOG_HOST || "";
const defaultMetaApiVersion = "v25.0";
let hasLoggedMetaEnvWarning = false;
const cspReportOnly = (() => {
  const raw = String(process.env.CSP_REPORT_ONLY || "").trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return process.env.NODE_ENV !== "production";
})();
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

const isProductionRuntime = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";

if (isProductionRuntime) {
  // Production traffic reaches Railway through a reverse proxy chain
  // (including Vercel rewrites), so we must trust the proxy hop for
  // secure session cookies and req.secure to work during admin MFA.
  app.set("trust proxy", 1);
} else {
  // In local/dev, trust only private-network proxies to avoid accepting
  // spoofed forwarding headers from direct public requests.
  app.set("trust proxy", (ip: string) => {
    if (ip === "127.0.0.1" || ip === "::1") return true;     // loopback
    if (/^10\./.test(ip)) return true;                        // RFC 1918 10.0.0.0/8
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;  // RFC 1918 172.16.0.0/12
    if (/^192\.168\./.test(ip)) return true;                  // RFC 1918 192.168.0.0/16
    if (/^fc[0-9a-f]{2}:/i.test(ip)) return true;            // IPv6 ULA fc00::/7
    if (/^fd[0-9a-f]{2}:/i.test(ip)) return true;            // IPv6 ULA fd00::/8
    return false;
  });
}
app.disable("x-powered-by");
app.use((req: any, res: any, next: any) => {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  const requestId = incoming || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

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

const productSearchEventsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

const productSearchSuggestionsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

const behaviorEventsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

const identifyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

// Bots de redes sociais (meta-externalagent, facebookexternalhit, Twitterbot, etc.)
// Limite global por user-agent: 60 req / 15min — suficiente para link previews
const SOCIAL_BOT_PATTERN = /meta-externalagent|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|WhatsApp|TelegramBot|Discordbot|Pinterest/i;

// Qualquer outro bot não identificado como social media
const GENERIC_BOT_PATTERN = /bot|crawler|spider|scraper|curl|wget|python-requests|axios\/|java\/|Go-http-client/i;

// Bots que já estão bloqueados no Vercel — só como fallback no servidor
const BLOCKED_BOT_PATTERN = /GPTBot|ChatGPT-User|OAI-SearchBot|CCBot|anthropic-ai|Claude-Web|PerplexityBot|YouBot|Bytespider/i;

const socialBotRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" },
  skip: (req: any) => {
    const ua = String(req.headers["user-agent"] || "");
    return !SOCIAL_BOT_PATTERN.test(ua);
  },
  keyGenerator: (req: any) => {
    const ua = String(req.headers["user-agent"] || "").slice(0, 80);
    return `social_bot:${ua}`;
  }
});

const genericBotRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" },
  skip: (req: any) => {
    const ua = String(req.headers["user-agent"] || "");
    // Só aplica a bots genéricos — não aplica a social bots (têm limite próprio)
    return SOCIAL_BOT_PATTERN.test(ua) || !GENERIC_BOT_PATTERN.test(ua);
  },
  keyGenerator: (req: any) => {
    const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
    return `generic_bot:${ip}`;
  }
});

const blockedBotGuard = (req: any, res: any, next: any) => {
  const ua = String(req.headers["user-agent"] || "");
  if (BLOCKED_BOT_PATTERN.test(ua)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  next();
};

const newsletterSubscribeSchema = z.object({
  email: z.string().trim().email(),
  phone: z.string().trim().max(32).optional().default(""),
  source: z.string().trim().max(80).optional().default(""),
  page: z.string().trim().max(200).optional().default(""),
  consent: z.coerce.boolean().optional().default(false)
});

const productSearchEventSchema = z.object({
  type: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value: string) => ["search_view", "suggestion_click", "result_click", "did_you_mean_click", "zero_result"].includes(value)),
  query: z.string().trim().max(160).optional().default(""),
  suggestion: z.string().trim().max(160).optional().default(""),
  productSku: z.string().trim().max(80).optional().default(""),
  position: z.coerce.number().int().min(0).max(500).optional(),
  resultsCount: z.coerce.number().int().min(0).max(5000).optional(),
  pagePath: z.string().trim().max(240).optional().default(""),
  source: z.string().trim().max(80).optional().default("storefront_search")
});

const paymentIntentSchema = z.object({
  paymentMethod: z.string().trim().optional().default("automatic"),
  discountCode: z.string().trim().max(40).optional().default(""),
  installments: z.coerce.number().int().min(1).max(10).optional().default(1),
  metaEventId: z.string().trim().max(120).optional().default(""),
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
    .optional(),
  // Cartões salvos
  saveCard:      z.boolean().optional().default(false),
  selectedPmId:  z.string().trim().max(30).optional().nullable().default(null)
});

const behaviorEventSchema = z.object({
  eventName: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value: string) =>
      [
        "view_item",
        "view_item_list",
        "search",
        "add_to_cart",
        "remove_from_cart",
        "begin_checkout",
        "purchase",
        "favorite_toggle",
        "view_recommendations",
        "click_recommendation"
      ].includes(value)
    ),
  eventId: z.string().trim().max(120).optional().default(""),
  anonId: z.string().trim().max(160).optional().default(""),
  userId: z.string().trim().max(120).optional().default(""),
  productId: z.string().trim().max(120).optional().default(""),
  category: z.string().trim().max(120).optional().default(""),
  price: z.coerce.number().min(0).optional().default(0),
  currency: z.string().trim().max(12).optional().default("brl"),
  source: z.string().trim().max(80).optional().default("storefront"),
  query: z.string().trim().max(180).optional().default(""),
  attributes: z.record(z.any()).optional().default({}),
  meta: z.record(z.any()).optional().default({}),
  occurredAt: z.string().trim().max(64).optional().default(""),
  fbp: z.string().trim().max(220).optional().default(""),
  fbc: z.string().trim().max(220).optional().default("")
});

const identifySchema = z.object({
  anon_id: z.string().trim().min(6).max(160),
  user_id: z.string().trim().min(6).max(120)
});

const appointmentCreateSchema = z.object({
  slotId: z.string().trim().uuid(),
  serviceType: z.string().trim().min(2).max(120),
  modality: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(2000).optional().default("")
});

const metaCapiEventSchema = z.object({
  event_name: z.string().trim().min(1).max(80),
  event_id: z.string().trim().min(6).max(160),
  event_time: z.coerce.number().int().positive().optional(),
  action_source: z.string().trim().max(40).optional().default("website"),
  email: z.string().trim().email().optional().or(z.literal("")).default(""),
  currency: z.string().trim().max(12).optional().default("BRL"),
  value: z.coerce.number().min(0).optional().default(0)
});

function sha256Lower(value: any) {
  return crypto
    .createHash("sha256")
    .update(String(value || "").trim().toLowerCase())
    .digest("hex");
}

function parseTriStateBooleanEnv(value: any): boolean | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return null;
}

function parseCookieValue(rawCookie: any, key: string): string {
  const source = String(rawCookie || "");
  if (!source || !key) return "";
  const entries = source.split(";");
  for (const entry of entries) {
    const [name, ...valueParts] = entry.split("=");
    if (String(name || "").trim() !== key) continue;
    try {
      return decodeURIComponent(valueParts.join("=").trim());
    } catch {
      return valueParts.join("=").trim();
    }
  }
  return "";
}

function resolveMetaConfig() {
  const pixelId = String(process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();
  const accessToken = String(process.env.META_CAPI_ACCESS_TOKEN || process.env.META_CAPI_TOKEN || "").trim();
  const apiVersion = String(process.env.META_API_VERSION || defaultMetaApiVersion).trim() || defaultMetaApiVersion;
  const testEventCode = String(process.env.META_TEST_EVENT_CODE || "").trim();
  const hasCredentials = Boolean(pixelId && accessToken);
  const explicitEnabled = parseTriStateBooleanEnv(process.env.META_CAPI_ENABLED);
  const enabled = explicitEnabled === null ? hasCredentials : explicitEnabled;

  if (enabled && !hasCredentials && !hasLoggedMetaEnvWarning) {
    hasLoggedMetaEnvWarning = true;
    console.warn("[meta] META_PIXEL_ID or META_CAPI_ACCESS_TOKEN missing. CAPI send skipped.");
  }

  return {
    pixelId,
    accessToken,
    apiVersion,
    testEventCode,
    enabled: enabled && hasCredentials,
    tokenPresent: Boolean(accessToken)
  };
}

async function sendMetaCapiEvent(payload: {
  eventName: string;
  eventId: string;
  eventTime?: number;
  actionSource?: string;
  eventSourceUrl?: string;
  email?: string;
  currency?: string;
  value?: number;
  ipAddress?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  externalId?: string;
  contentIds?: string[];
  contents?: Array<{
    id: string;
    quantity: number;
    item_price: number;
  }>;
  orderId?: string;
}) {
  const metaConfig = resolveMetaConfig();
  const appBaseUrl = String(process.env.APP_BASE_URL || "https://www.tsebi.com.br").trim().replace(/\/+$/, "");
  if (!metaConfig.enabled) return { ok: false, skipped: true, reason: "META_NOT_CONFIGURED" };

  const eventTime = Number(payload.eventTime || Math.floor(Date.now() / 1000));
  const email = normalizeEmail(payload.email || "");
  const externalId = String(payload.externalId || "").trim();
  const normalizedCurrency = String(payload.currency || "BRL").trim().toUpperCase() || "BRL";
  const normalizedValue = Number(Math.max(0, Number(payload.value || 0)).toFixed(2));
  const body: any = {
    data: [
      {
        event_name: String(payload.eventName || "").trim(),
        event_time: Number.isFinite(eventTime) && eventTime > 0 ? eventTime : Math.floor(Date.now() / 1000),
        event_id: String(payload.eventId || "").trim(),
        action_source: String(payload.actionSource || "website").trim() || "website",
        event_source_url: String(payload.eventSourceUrl || "").trim() || appBaseUrl,
        user_data: {
          em: email ? [sha256Lower(email)] : undefined,
          client_ip_address: String(payload.ipAddress || "").trim() || undefined,
          client_user_agent: String(payload.userAgent || "").trim() || undefined,
          fbp: String(payload.fbp || "").trim() || undefined,
          fbc: String(payload.fbc || "").trim() || undefined,
          external_id: externalId ? sha256Lower(externalId) : undefined
        },
        custom_data: {
          currency: normalizedCurrency,
          value: normalizedValue,
          order_id: String(payload.orderId || "").trim() || undefined,
          content_type: "product",
          content_ids: Array.isArray(payload.contentIds) ? payload.contentIds.filter(Boolean) : undefined,
          contents: Array.isArray(payload.contents) ? payload.contents : undefined
        }
      }
    ]
  };
  if (metaConfig.testEventCode) {
    body.test_event_code = metaConfig.testEventCode;
    console.log("[meta] using_test_event_code", true);
  }

  const endpoint = `https://graph.facebook.com/${encodeURIComponent(metaConfig.apiVersion)}/${encodeURIComponent(
    metaConfig.pixelId
  )}/events`;
  console.log("meta_capi_request", {
    event_id: String(payload.eventId || "").trim(),
    event_name: String(payload.eventName || "").trim(),
    value: normalizedValue,
    currency: normalizedCurrency,
    using_test_event_code: Boolean(metaConfig.testEventCode),
    content_ids_count: Array.isArray(payload.contentIds) ? payload.contentIds.filter(Boolean).length : 0,
    contents_count: Array.isArray(payload.contents) ? payload.contents.length : 0,
    endpoint
  });

  const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(metaConfig.accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const responseBody = await response.text().catch(() => "");
  console.log("meta_capi_response", {
    event_id: String(payload.eventId || "").trim(),
    status: Number(response.status || 0),
    body: responseBody
  });
  if (!response.ok) {
    return {
      ok: false,
      status: Number(response.status || 0),
      responseBody,
      reason: responseBody || "META_CAPI_FAILED"
    };
  }
  return { ok: true, status: Number(response.status || 0), responseBody };
}

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

function sanitizeLogDetails(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item: any) => sanitizeLogDetails(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const sensitiveKeys = new Set([
    "email",
    "phone",
    "cpf",
    "token",
    "secret",
    "authorization",
    "cookie",
    "set-cookie"
  ]);
  const sanitized: Record<string, unknown> = {};
  for (const [rawKey, rawVal] of Object.entries(value)) {
    const normalizedKey = String(rawKey || "").toLowerCase();
    if (sensitiveKeys.has(normalizedKey)) {
      sanitized[rawKey] = "[REDACTED]";
      continue;
    }
    sanitized[rawKey] = sanitizeLogDetails(rawVal);
  }
  return sanitized;
}

function logStripeLifecycle(event: any, details: any = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...sanitizeLogDetails(details)
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

function resolveCheckoutMaxInstallments(orderAmountCents: any): number {
  const amount = Math.max(0, Math.floor(Number(orderAmountCents || 0)));
  if (amount >= 50000 && amount <= 79999) return 3;
  if (amount >= 80000 && amount <= 109999) return 4;
  if (amount >= 110000 && amount <= 149999) return 5;
  if (amount >= 150000 && amount <= 199999) return 6;
  if (amount >= 200000 && amount <= 279999) return 7;
  if (amount >= 280000 && amount <= 379999) return 8;
  if (amount >= 380000 && amount <= 499999) return 9;
  if (amount >= 500000) return 10;
  return 1;
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
  const paymentMethodTypes = Array.isArray(intent?.payment_method_types)
    ? intent.payment_method_types.map((entry: any) => String(entry || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const hasDisallowedType = paymentMethodTypes.some((type: string) => !stripeCheckoutPaymentMethodTypes.includes(type));
  if (hasDisallowedType) return null;

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
      paymentMethodTypes
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
    userId: order.user_id || null,
    userEmail: order.user_email || null,
    totalCents: Math.max(0, Number(order.total_cents || 0)),
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
async function processWebhookEvent(
  event: any,
  requestContext: {
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    fbp?: string;
    fbc?: string;
  } = {}
) {
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
    requestId: string | null;
    outcome: "ignored" | "duplicate" | "order_updated" | "noop";
    reason: string | null;
    statusFrom: string | null;
    statusTo: string | null;
  } = {
    webhookEventId: event.id,
    eventType: event.type,
    paymentIntentId: paymentIntentId || null,
    orderId: null,
    requestId: requestContext.requestId || null,
    outcome: "ignored",
    reason: null,
    statusFrom: null,
    statusTo: null
  };
  logStripeLifecycle("webhook_received", {
    requestId: webhookContext.requestId,
    webhookEventId: webhookContext.webhookEventId,
    eventType: webhookContext.eventType,
    paymentIntentId: webhookContext.paymentIntentId
  });
  const pendingNotifications: any[] = [];
  const pendingBehaviorEvents: any[] = [];
  const pendingMetaCapiEvents: Array<{
    eventName: string;
    eventId: string;
    email: string;
    currency: string;
    value: number;
    externalId: string;
    orderId: string;
    amountCents: number;
    contentIds: string[];
    contents: Array<{
      id: string;
      quantity: number;
      item_price: number;
    }>;
  }> = [];

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

      const orderShipping = (order as any)?.shipping;
      const discountCodeUsed = orderShipping?.discountCode
        ? String(orderShipping.discountCode).trim()
        : "";
      if (discountCodeUsed) {
        await incrementAccessCodeUsage(discountCodeUsed).catch(() => null);
      }
      const paymentIntent = stripeObject || {};
      const webhookMetaEventId = paymentIntentId
        ? `pi_${String(paymentIntentId)}_purchase`
        : `order_${String(order.id || "")}_purchase`;
      const amountCentsFromStripe = Math.max(
        0,
        Number(paymentIntent?.amount_received || paymentIntent?.amount || 0)
      );
      const amountCents = Math.max(0, amountCentsFromStripe || Number((order as any)?.totalCents || 0));
      const orderForMeta = order as any;
      const orderItems = Array.isArray(order.items) ? order.items : [];
      const contentIds = orderItems
        .map((item: any) => String(item?.id || "").trim())
        .filter(Boolean);
      const contents = orderItems
        .map((item: any) => {
          const id = String(item?.id || "").trim();
          const quantity = Math.max(1, Number(item?.qty || 1));
          const itemPrice = Math.max(0, Number(item?.unitAmount || 0)) / 100;
          if (!id) return null;
          return {
            id,
            quantity,
            item_price: Number(itemPrice.toFixed(2))
          };
        })
        .filter(Boolean) as Array<{ id: string; quantity: number; item_price: number }>;
      pendingMetaCapiEvents.push({
        eventName: "Purchase",
        eventId: webhookMetaEventId,
        email: String(orderForMeta?.userEmail || "").trim().toLowerCase(),
        currency: String(Array.isArray(order.items) && order.items[0]?.currency ? order.items[0].currency : "BRL")
          .trim()
          .toUpperCase(),
        value: Number((amountCents / 100).toFixed(2)),
        externalId: String(order.userId || "").trim(),
        orderId: String(order.id || ""),
        amountCents,
        contentIds,
        contents
      });
      pendingBehaviorEvents.push({
        eventName: "purchase",
        eventId: webhookMetaEventId,
        userId: String(order.userId || ""),
        productId: Array.isArray(order.items)
          ? order.items
              .map((item: any) => String(item.id || "").trim())
              .filter(Boolean)
              .slice(0, 3)
              .join(",")
          : "",
        category: "",
        price: Array.isArray(order.items)
          ? order.items.reduce((sum: number, item: any) => sum + Math.max(0, Number(item.unitAmount || 0) * Math.max(1, Number(item.qty || 1))), 0)
          : 0,
        currency: Array.isArray(order.items) && order.items[0]?.currency ? String(order.items[0].currency) : "brl",
        source: "stripe_webhook",
        skipMetaCapi: true,
        attributes: {
          order_id: String(order.id || ""),
          item_count: Array.isArray(order.items) ? order.items.length : 0
        }
      });
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
      requestId: webhookContext.requestId,
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
        requestId: webhookContext.requestId,
        webhookEventId: webhookContext.webhookEventId,
        orderId: notification.orderId,
        notificationType: notification.type,
        error: toSafeErrorMessage(error)
      });
    }
  }

  // Block (2): recommendation / behavior analytics must never stop webhook completion.
  for (const trackedEvent of pendingBehaviorEvents) {
    try {
      await logBehaviorEvent({
        ...trackedEvent,
        userAgent: requestContext.userAgent || "stripe-webhook",
        ipAddress: requestContext.ipAddress || "127.0.0.1"
      });
    } catch (error: any) {
      logStripeLifecycle("webhook_behavior_event_failed", {
        requestId: webhookContext.requestId,
        webhookEventId: webhookContext.webhookEventId,
        orderId: webhookContext.orderId,
        reason: toSafeErrorMessage(error)
      });
    }
  }

  // Block (3): Meta CAPI must run independently from analytics/recommendations.
  for (const capiEvent of pendingMetaCapiEvents) {
    try {
      const metaConfig = resolveMetaConfig();
      console.log("[meta]", {
        requestId: webhookContext.requestId || "",
        token_present: metaConfig.tokenPresent,
        pixel_id: metaConfig.pixelId
      });
      console.log("[meta] sending Purchase", {
        requestId: webhookContext.requestId || "",
        orderId: capiEvent.orderId,
        amountCents: capiEvent.amountCents
      });

      const result = await sendMetaCapiEvent({
        eventName: capiEvent.eventName,
        eventId: capiEvent.eventId,
        email: capiEvent.email,
        currency: capiEvent.currency,
        value: capiEvent.value,
        ipAddress: requestContext.ipAddress || "127.0.0.1",
        userAgent: requestContext.userAgent || "stripe-webhook",
        fbp: requestContext.fbp || "",
        fbc: requestContext.fbc || "",
        eventSourceUrl: "https://www.tsebi.com.br/checkout/success",
        externalId: capiEvent.externalId,
        contentIds: capiEvent.contentIds,
        contents: capiEvent.contents,
        orderId: capiEvent.orderId
      });
      console.log("[meta] response_status", {
        requestId: webhookContext.requestId || "",
        status: Number((result as any)?.status || 0)
      });
      console.log("[meta] response_body", {
        requestId: webhookContext.requestId || "",
        body: String((result as any)?.responseBody || "")
      });
      if (!result?.ok) {
        logStripeLifecycle("webhook_meta_capi_failed", {
          requestId: webhookContext.requestId,
          webhookEventId: webhookContext.webhookEventId,
          orderId: webhookContext.orderId,
          reason: result?.reason || "META_CAPI_FAILED",
          stack: ""
        });
      }
    } catch (error: any) {
      logStripeLifecycle("webhook_meta_capi_failed", {
        requestId: webhookContext.requestId,
        webhookEventId: webhookContext.webhookEventId,
        orderId: webhookContext.orderId,
        reason: toSafeErrorMessage(error),
        stack: String(error?.stack || "")
      });
    }
  }
}

app.use(
  cors({
    origin: (requestOrigin: any, callback: any) => {
      const allowedOrigins = parseAllowedCorsOrigins();
      if (!requestOrigin) return callback(null, false);
      if (allowedOrigins.includes(String(requestOrigin))) return callback(null, true);
      return callback(null, false);
    },
    credentials: true
  })
);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      reportOnly: cspReportOnly,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://js.stripe.com",
          "https://m.stripe.network",
          "https://checkout.stripe.com",
          "https://*.stripe.com",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://ssl.google-analytics.com",
          "https://connect.facebook.net",
          "https://www.facebook.com",
          "https://accounts.google.com",
          "https://www.google.com/recaptcha/"
        ],
        styleSrc: ["'self'", "https:", "https://fonts.googleapis.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https:",
          "https://www.google-analytics.com",
          "https://stats.g.doubleclick.net",
          "https://www.facebook.com",
          "https://*.facebook.com",
          "https://*.fbcdn.net",
          "https://*.googleusercontent.com",
          "https://*.gstatic.com"
        ],
        fontSrc: ["'self'", "data:", "https:", "https://fonts.gstatic.com"],
        connectSrc: [
          "'self'",
          "https://api.stripe.com",
          "https://r.stripe.com",
          "https://m.stripe.network",
          "https://q.stripe.com",
          "https://checkout.stripe.com",
          "https://*.stripe.com",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://region1.google-analytics.com",
          "https://stats.g.doubleclick.net",
          "https://graph.facebook.com",
          "https://www.facebook.com",
          "https://connect.facebook.net",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://oauth2.googleapis.com",
          "https://accounts.google.com",
          "https://viacep.com.br",
          "https://us.i.posthog.com",
          "https://*.i.posthog.com",
          "https://*.posthog.com"
        ],
        frameSrc: [
          "'self'",
          "https://js.stripe.com",
          "https://hooks.stripe.com",
          "https://checkout.stripe.com",
          "https://*.stripe.com",
          "https://accounts.google.com",
          "https://www.google.com"
        ],
        workerSrc: ["'self'", "blob:", "https://js.stripe.com", "https://*.stripe.com"],
        mediaSrc: ["'self'", "data:", "blob:", "https:", "https://media.tsebi.com.br"],
        formAction: ["'self'"],
        upgradeInsecureRequests: []
      }
    }
  })
);
app.use(compression());
app.use(createSessionMiddleware());

// Proteção global contra bots na API
app.use("/api", blockedBotGuard);
app.use("/api", socialBotRateLimit);
app.use("/api", genericBotRateLimit);

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
      logStripeLifecycle("webhook_ignored", {
        requestId: String(req.requestId || ""),
        reason: "stripe_not_configured"
      });
      return res.status(200).json({ received: true, ignored: "stripe_not_configured" });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      logStripeLifecycle("webhook_ignored", {
        requestId: String(req.requestId || ""),
        reason: "missing_signature_header"
      });
      return res.status(400).json({ received: false, error: "missing_signature_header" });
    }

    /** @type {import("stripe").Stripe.Event} */
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
    } catch (error: any) {
      logStripeLifecycle("webhook_signature_verification_failed", {
        requestId: String(req.requestId || ""),
        error: toSafeErrorMessage(error)
      });
      return res.status(400).json({ received: false, error: "invalid_signature" });
    }

    try {
      const requestIpRaw = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0] || "";
      const requestIp = String(requestIpRaw || "").trim() || "127.0.0.1";
      const requestUserAgent = String(req.headers["user-agent"] || "").trim() || "stripe-webhook";
      const requestCookies = String(req.headers.cookie || "");
      await processWebhookEvent(event, {
        requestId: String(req.requestId || ""),
        ipAddress: requestIp,
        userAgent: requestUserAgent,
        fbp: parseCookieValue(requestCookies, "_fbp"),
        fbc: parseCookieValue(requestCookies, "_fbc")
      });
      return res.json({ received: true });
    } catch (error: any) {
      logStripeLifecycle("webhook_processing_failed", {
        requestId: String(req.requestId || ""),
        webhookEventId: event?.id || null,
        eventType: event?.type || null,
        error: toSafeErrorMessage(error)
      });
      return res.status(200).json({ received: true, warning: "processing_failed" });
    }
  }
);

app.use(
  express.json({
    limit: "20mb",
    verify: (req: any, _res: any, buf: Buffer) => {
      try {
        if (String(req.originalUrl || "").startsWith("/api/whatsapp/webhook")) {
          req.rawBody = Buffer.from(buf);
        }
      } catch {}
    }
  })
);
app.use(
  "/images",
  express.static(path.resolve(process.cwd(), "images"), {
    fallthrough: false,
    maxAge: "30d",
    immutable: true
  })
);
app.use(express.static(path.resolve(process.cwd(), "pages")));
app.use("/css", express.static(path.resolve(process.cwd(), "css")));
app.use("/JS", express.static(path.resolve(process.cwd(), "JS")));
app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

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

app.get("/api/products/search", async (req: any, res: any) => {
  try {
    const queryText = String(req.query.q || req.query.query || "").trim();
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const limit = Math.max(1, Math.min(24, Number(req.query.limit || 8) || 8));
    const category = String(req.query.category || "").trim();
    const collection = String(req.query.collection || "").trim();
    const gender = String(req.query.gender || "").trim();
    const sortRaw = String(req.query.sort || "relevance").trim().toLowerCase();
    const sort =
      sortRaw === "newest" || sortRaw === "price_asc" || sortRaw === "price_desc" ? sortRaw : "relevance";
    const inStockRaw = String(req.query.inStock || req.query.in_stock || "").trim().toLowerCase();
    const inStock = inStockRaw === "1" || inStockRaw === "true" || inStockRaw === "yes";

    const hasFilter =
      Boolean(category) || Boolean(collection) || Boolean(gender) || inStock || sort !== "relevance";

    if (!queryText && !hasFilter) {
      return res.json({ query: "", page, limit, source: "none", found: 0, products: [] });
    }

    const [result, assist] = await Promise.all([
      searchStorefrontProducts({
        query: queryText,
        page,
        limit,
        category,
        collection,
        gender,
        inStock,
        sort
      }),
      searchStorefrontSuggestions({ query: queryText, limit: 8 })
    ]);

    return res.json({
      query: queryText,
      page,
      limit,
      source: "postgres",
      found: result.total,
      products: result.rows,
      suggestions: assist.terms,
      suggestedQuery: assist.didYouMean,
      curatedProducts: assist.products
    });
  } catch {
    return res.status(500).json({ error: "SEARCH_FAILED" });
  }
});

app.get("/api/products/search/suggestions", productSearchSuggestionsRateLimit, async (req: any, res: any) => {
  try {
    const queryText = String(req.query.q || req.query.query || "").trim();
    const limit = Math.max(1, Math.min(12, Number(req.query.limit || 8) || 8));
    if (queryText.length < 2) {
      return res.json({ query: queryText, suggestions: [], curatedProducts: [], suggestedQuery: null });
    }
    const assist = await searchStorefrontSuggestions({ query: queryText, limit });
    return res.json({
      query: queryText,
      suggestions: assist.terms,
      curatedProducts: assist.products,
      suggestedQuery: assist.didYouMean
    });
  } catch {
    return res.status(500).json({ error: "SEARCH_SUGGESTIONS_FAILED" });
  }
});

app.post("/api/products/search/events", productSearchEventsRateLimit, async (req: any, res: any) => {
  const parsed = productSearchEventSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  try {
    await logProductSearchEvent({
      ...parsed.data,
      userAgent: String(req.headers["user-agent"] || ""),
      ipAddress: String(req.ip || "")
    });
    return res.status(201).json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "SEARCH_EVENT_FAILED" });
  }
});

app.post("/api/events", behaviorEventsRateLimit, async (req: any, res: any) => {
  const parsed = behaviorEventSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  try {
    const payload = parsed.data;
    const result = await logBehaviorEvent({
      eventName: payload.eventName,
      eventId: payload.eventId,
      anonId: payload.anonId || String(req.headers["x-anon-id"] || req.query.anon_id || "").trim(),
      userId: String(req.session?.userId || "").trim(),
      productId: payload.productId,
      category: payload.category,
      price: payload.price,
      currency: payload.currency,
      source: payload.source,
      query: payload.query,
      attributes: payload.attributes,
      meta: payload.meta,
      fbp: payload.fbp || String(req.headers["x-fbp"] || "").trim(),
      fbc: payload.fbc || String(req.headers["x-fbc"] || "").trim(),
      userAgent: String(req.headers["user-agent"] || "").trim(),
      ipAddress: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim(),
      occurredAt: payload.occurredAt || undefined
    });
    return res.status(201).json({ ok: true, actorKey: result.actorKey, eventId: result.eventId });
  } catch {
    return res.status(500).json({ ok: false, error: "EVENT_TRACKING_FAILED" });
  }
});

app.post("/api/meta/capi", behaviorEventsRateLimit, async (req: any, res: any) => {
  const expectedInternalApiKey = String(process.env.META_CAPI_INTERNAL_KEY || "").trim();
  const providedInternalApiKey = String(req.headers["x-internal-api-key"] || "").trim();
  if (!expectedInternalApiKey || providedInternalApiKey !== expectedInternalApiKey) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  const parsed = metaCapiEventSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  try {
    const payload = parsed.data;
    const ipAddress = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    const userAgent = String(req.headers["user-agent"] || "").trim();
    const result = await sendMetaCapiEvent({
      eventName: payload.event_name,
      eventId: payload.event_id,
      eventTime: payload.event_time || undefined,
      actionSource: payload.action_source,
      email: payload.email || "",
      currency: payload.currency || "BRL",
      value: payload.value || 0,
      ipAddress,
      userAgent,
      fbp: String(req.headers["x-fbp"] || "").trim(),
      fbc: String(req.headers["x-fbc"] || "").trim(),
      externalId: String(req.session?.userId || req.body?.user_id || "").trim()
    });
    if (!result.ok) {
      return res.status(502).json({ ok: false, error: "META_CAPI_FAILED", reason: result.reason || "" });
    }
    return res.status(201).json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "META_CAPI_FAILED" });
  }
});

app.post("/api/identify", identifyRateLimit, async (req: any, res: any) => {
  const parsed = identifySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  try {
    const result = await mergeAnonymousIdentity({
      anonId: parsed.data.anon_id,
      userId: parsed.data.user_id
    });
    return res.json({ ok: true, actorKey: result.actorKey });
  } catch {
    return res.status(500).json({ ok: false, error: "IDENTIFY_FAILED" });
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
    const byId = new Map();
    products.forEach((item: any) => {
      const productId = String(item?.id || "").trim();
      const productSku = String(item?.sku || "").trim();
      if (productId) byId.set(productId, item);
      if (productSku) byId.set(productSku, item);
    });
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

function foldRecommendationText(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function splitRecommendationTokens(value: any) {
  return String(value || "")
    .split(",")
    .map((item: any) => String(item || "").trim())
    .filter(Boolean);
}

function parseRecommendationSignals(rawSignals: any) {
  if (!rawSignals) {
    return {
      topCategory: "",
      topClickedSku: "",
      topPriceBand: "",
      searches: [] as string[],
      recentViewed: [] as string[],
      cartSkus: [] as string[]
    };
  }

  try {
    const parsed = typeof rawSignals === "string" ? JSON.parse(rawSignals) : rawSignals;
    return {
      topCategory: String(parsed?.topCategory || "").trim(),
      topClickedSku: String(parsed?.topClickedSku || "").trim(),
      topPriceBand: String(parsed?.topPriceBand || "").trim().toLowerCase(),
      searches: Array.isArray(parsed?.searches) ? parsed.searches.map((item: any) => String(item || "").trim()).filter(Boolean).slice(0, 12) : [],
      recentViewed: Array.isArray(parsed?.recentViewed)
        ? parsed.recentViewed.map((item: any) => String(item || "").trim()).filter(Boolean).slice(0, 16)
        : [],
      cartSkus: Array.isArray(parsed?.cartSkus) ? parsed.cartSkus.map((item: any) => String(item || "").trim()).filter(Boolean).slice(0, 16) : []
    };
  } catch {
    return {
      topCategory: "",
      topClickedSku: "",
      topPriceBand: "",
      searches: [] as string[],
      recentViewed: [] as string[],
      cartSkus: [] as string[]
    };
  }
}

function resolvePriceBandThresholds(products: any[]) {
  const prices = products
    .map((item: any) => Number(item?.priceValue || 0))
    .filter((value: any) => Number.isFinite(value) && value > 0)
    .sort((a: any, b: any) => a - b);
  if (prices.length < 3) return { lowMax: 400, midMax: 1100 };

  const lowIndex = Math.floor(prices.length * 0.33);
  const midIndex = Math.floor(prices.length * 0.66);
  const lowMax = prices[Math.max(0, Math.min(prices.length - 1, lowIndex))];
  const midMax = prices[Math.max(0, Math.min(prices.length - 1, midIndex))];
  return {
    lowMax: Math.max(1, Number(lowMax || 400)),
    midMax: Math.max(Number(lowMax || 400) + 1, Number(midMax || 1100))
  };
}

function resolveProductPriceBand(product: any, thresholds: any) {
  const price = Number(product?.priceValue || 0);
  if (!Number.isFinite(price) || price <= thresholds.lowMax) return "low";
  if (price <= thresholds.midMax) return "mid";
  return "high";
}

function rankPersonalizedProducts({
  products,
  signals,
  purchasedSkus
}: {
  products: any[];
  signals: any;
  purchasedSkus: Set<string>;
}) {
  const activeProducts = (products || []).filter((item: any) => item && item.active !== false);
  const bySku = new Map(activeProducts.map((item: any) => [String(item.sku || item.id), item]));
  const clickedProduct = bySku.get(String(signals.topClickedSku || ""));
  const thresholds = resolvePriceBandThresholds(activeProducts);
  const normalizedTopCategory = foldRecommendationText(signals.topCategory);
  const normalizedSearches = (signals.searches || []).map((term: any) => foldRecommendationText(term)).filter(Boolean);
  const viewedSet = new Set((signals.recentViewed || []).map((value: any) => String(value || "").trim()).filter(Boolean));
  const cartSet = new Set((signals.cartSkus || []).map((value: any) => String(value || "").trim()).filter(Boolean));
  const requestedBand = ["low", "mid", "high"].includes(String(signals.topPriceBand || "")) ? String(signals.topPriceBand) : "";

  const scored = activeProducts.map((product: any) => {
    let score = 0;
    const reasons: string[] = [];
    const productSku = String(product.sku || product.id || "").trim();
    const category = foldRecommendationText(product.category);
    const collection = foldRecommendationText(product.collection);
    const material = foldRecommendationText(product.material);

    if (normalizedTopCategory && category === normalizedTopCategory) {
      score += 5;
      reasons.push("top_category");
    }

    if (clickedProduct && productSku && productSku !== String(clickedProduct.sku || clickedProduct.id || "")) {
      const clickedCategory = foldRecommendationText(clickedProduct.category);
      const clickedCollection = foldRecommendationText(clickedProduct.collection);
      const clickedMaterial = foldRecommendationText(clickedProduct.material);
      if (category === clickedCategory || collection === clickedCollection || material === clickedMaterial) {
        score += 4;
        reasons.push("similar_to_clicked");
      }
    }

    if (requestedBand) {
      const band = resolveProductPriceBand(product, thresholds);
      if (band === requestedBand) {
        score += 3;
        reasons.push("price_band");
      }
    }

    if (normalizedSearches.length > 0) {
      const searchable = [product.name, product.category, product.collection, product.material]
        .map((entry: any) => foldRecommendationText(entry))
        .filter(Boolean)
        .join(" ");
      if (normalizedSearches.some((term: any) => searchable.includes(term))) {
        score += 2;
        reasons.push("search_match");
      }
    }

    if (viewedSet.has(productSku)) {
      score += 2;
      reasons.push("recently_viewed");
    }
    if (cartSet.has(productSku)) {
      score += 2;
      reasons.push("cart_related");
    }
    if (purchasedSkus.has(productSku)) {
      score -= 8;
      reasons.push("already_purchased");
    }

    return { product, score, reasons };
  });

  scored.sort((a: any, b: any) => {
    if (b.score !== a.score) return b.score - a.score;
    if (Number(b.product.stock || 0) !== Number(a.product.stock || 0)) return Number(b.product.stock || 0) - Number(a.product.stock || 0);
    return String(a.product.name || "").localeCompare(String(b.product.name || ""));
  });

  return scored;
}

app.get("/api/recommendations", async (req: any, res: any) => {
  try {
    const limit = Math.max(1, Math.min(12, Number(req.query.limit || 6) || 6));
    const placement = String(req.query.placement || "search").trim();
    const sessionUserId = req.session?.userId ? String(req.session.userId) : "";
    const requestedUserId = String(req.query.userId || "").trim();
    if (requestedUserId && requestedUserId !== sessionUserId) {
      return res.status(403).json({ error: "FORBIDDEN_USER_SCOPE" });
    }
    const userId = sessionUserId;
    const anonId = String(req.query.anon_id || req.query.anonId || req.headers["x-anon-id"] || "").trim();
    const products = await listProducts();

    const recommendation = await getRecommendationsForActor({
      products,
      userId,
      anonId,
      placement,
      limit
    });

    return res.json({
      title: recommendation.title,
      source: recommendation.source,
      placement: recommendation.placement,
      actorKey: recommendation.actorKey,
      products: recommendation.products,
      items: recommendation.items
    });
  } catch {
    return res.status(500).json({ error: "RECOMMENDATIONS_FAILED" });
  }
});

app.get("/api/appointments/slots", async (req: any, res: any) => {
  try {
    const date = String(req.query.date || "").trim();
    const slots = await listAppointmentSlotsForDate(date);
    return res.json({ slots });
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "APPOINTMENT_SLOTS_FAILED" });
  }
});

app.post("/api/appointments", requireUserCsrfForMutations, async (req: any, res: any) => {
  const sessionUserId = String(req.session?.userId || "").trim();
  if (!sessionUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const parsed = appointmentCreateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const appointment = await createAppointment({
      slotId: parsed.data.slotId,
      userId: sessionUserId,
      serviceType: parsed.data.serviceType,
      modality: parsed.data.modality,
      notes: parsed.data.notes,
    });

    const appName = String(process.env.APP_NAME || "Tsebi").trim() || "Tsebi";
    if (appointment.userEmail) {
      const scheduledAt = appointment.startsAt
        ? new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "America/Sao_Paulo",
          }).format(new Date(appointment.startsAt))
        : `${appointment.date} às ${appointment.time}`;
      const serviceLabel = appointment.label || appointment.serviceType || "Atendimento privado";
      const placeLabel = appointment.location
        ? `<p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 8px;"><strong>Local:</strong> ${appointment.location}</p>`
        : "";
      const notesLabel = appointment.notes
        ? `<p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 8px;"><strong>Observações:</strong> ${appointment.notes}</p>`
        : "";

      sendEmail({
        to: appointment.userEmail,
        subject: `${appName} — Agendamento confirmado`,
        html: `
          <div style="font-family:'Cormorant Garamond','Georgia',serif;max-width:480px;margin:0 auto;padding:40px 20px;color:#1a1a1a;">
            <p style="font-size:11px;letter-spacing:.15em;color:#aaa;font-family:sans-serif;font-weight:600;margin-bottom:24px;">TSEBI</p>
            <h2 style="font-size:22px;font-weight:400;margin-bottom:16px;">Agendamento confirmado</h2>
            <p style="font-size:15px;line-height:1.6;color:#444;margin-bottom:20px;">
              Olá, ${appointment.userName || "cliente"}. Seu agendamento foi confirmado com sucesso.
            </p>
            <div style="padding:16px;border:1px solid #eee;background:#fbfbfb;margin-bottom:24px;">
              <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 8px;"><strong>Data e horário:</strong> ${scheduledAt}</p>
              <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 8px;"><strong>Tipo:</strong> ${serviceLabel}</p>
              <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 8px;"><strong>Modalidade:</strong> ${appointment.modality || "-"}</p>
              ${placeLabel}
              ${notesLabel}
            </div>
            <p style="font-size:14px;color:#888;line-height:1.6;">
              Se precisar remarcar ou tiver dúvidas, entre em contato com nossa equipe.
            </p>
            <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eee;">
              <p style="font-size:11px;color:#bbb;font-family:sans-serif;">${appName} · Atendimento Privado</p>
            </div>
          </div>
        `,
        text: [
          `Olá, ${appointment.userName || "cliente"}. Seu agendamento foi confirmado com sucesso.`,
          `Data e horário: ${scheduledAt}`,
          `Tipo: ${serviceLabel}`,
          `Modalidade: ${appointment.modality || "-"}`,
          appointment.location ? `Local: ${appointment.location}` : "",
          appointment.notes ? `Observações: ${appointment.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }).catch(() => {});
    }

    return res.status(201).json({ appointment });
  } catch (error: any) {
    return res.status(Number(error?.status || 500) || 500).json({ error: error?.message || "APPOINTMENT_CREATE_FAILED" });
  }
});

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
    maxInstallments: 10,
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

  let hasPreviousOrders = false;
  const sessionUserId = req.session?.userId ? String(req.session.userId) : "";
  if (sessionUserId) {
    try {
      const userOrders = await listOrdersByUserId(sessionUserId);
      hasPreviousOrders = Array.isArray(userOrders) && userOrders.some((o: any) => String(o.status || "") === "paid");
    } catch { /* ignore — non-critical check */ }
  }

  try {
    const result = await evaluateAccessCode({
      code,
      subtotalCents,
      shippingCents,
      hasPreviousOrders
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
      amountOffCents: result.entry.amountOffCents,
      freeShipping: result.entry.type === "free_shipping"
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
  const requestedInstallments = parsed.data.installments;
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
        const tempPasswordHash = await hashPassword(tempPassword);
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
  const catalogForMetadata = await listProducts().catch(() => []);
  const catalogBySku = new Map(
    (Array.isArray(catalogForMetadata) ? catalogForMetadata : []).map((product: any) => [String(product.sku || product.id || "").trim(), product])
  );
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
  const maxInstallmentsForOrder = resolveCheckoutMaxInstallments(orderAmount);
  const installments = Math.max(1, Math.min(maxInstallmentsForOrder, Number(requestedInstallments || 1)));
  const ticketBucket = priceBucketFromCents(orderAmount);
  const checkoutMetaEventId = String(parsed.data.metaEventId || "").trim() || crypto.randomUUID();
  const topCategories = Array.from(
    new Set(
      availability.resolvedItems
        .map((item: any) => {
          const sku = String(item.id || item.sku || "").trim();
          const product = catalogBySku.get(sku);
          return String(product?.category || "").trim();
        })
        .filter(Boolean)
    )
  ).slice(0, 4);
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

  logBehaviorEvent({
    eventName: "begin_checkout",
    eventId: checkoutMetaEventId,
    userId: String(checkoutUser?.id || ""),
    productId: availability.resolvedItems.map((item: any) => String(item.id || item.sku || "").trim()).filter(Boolean).slice(0, 3).join(","),
    category: topCategories[0] || "",
    price: orderAmount,
    currency,
    source: "checkout_payment_intent",
    attributes: {
      item_count: availability.resolvedItems.length,
      checkout_mode: checkoutMode,
      ticket_bucket: ticketBucket,
      top_categories: topCategories
    },
    meta: {
      email: checkoutUser?.email || guest.email || ""
    },
    userAgent: String(req.headers["user-agent"] || ""),
    ipAddress: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim()
  }).catch(() => {});

  /** @type {import("stripe").Stripe.PaymentIntentCreateParams} */
  const paymentIntentParams: any = {
    amount: Math.max(0, Number(order?.amount || orderAmount)),
    currency,
    payment_method_types: stripeCheckoutPaymentMethodTypes,
    metadata: {
      orderId: String(order.id || ""),
      orderNumber: String(order.orderNumber || ""),
      userId: String(checkoutUser?.id || ""),
      event_id: checkoutMetaEventId,
      checkoutMode,
      top_categories: topCategories.join("|").slice(0, 180),
      ticket_bucket: ticketBucket || "",
      avg_item_ticket_bucket: priceBucketFromCents(Math.floor(itemsAmount / Math.max(1, availability.resolvedItems.length))) || ""
    }
  };

  if (stripeCheckoutPaymentMethodTypes.includes("card")) {
    paymentIntentParams.payment_method_options = {
      card: {
        installments: {
          enabled: true
        }
      }
    };
  }

  if (parsed.data.selectedPmId && String(parsed.data.selectedPmId).startsWith("pm_")) {
    paymentIntentParams.payment_method = parsed.data.selectedPmId;
  }

  // ── Stripe Customer (para cartões salvos) ────────────────────────────────
  let stripeCustomerId: string | null = checkoutUser.stripeCustomerId || null;
  let ephemeralKey: string | null = null;

  if (sessionUserId && checkoutUser.id) {
    try {
      // Cria ou recupera o Stripe Customer vinculado ao usuário
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: checkoutUser.email || "",
          name:  checkoutUser.name  || "",
          metadata: { userId: checkoutUser.id }
        });
        stripeCustomerId = customer.id;
        await updateUser(checkoutUser.id, { stripeCustomerId });
      }

      // Associa o customer ao PaymentIntent para cartões salvos
      paymentIntentParams.customer = stripeCustomerId;

      // Se o usuário quer salvar o cartão, configura setup_future_usage
      if (parsed.data.saveCard) {
        paymentIntentParams.setup_future_usage = "on_session";
      }

      // Se há um cartão salvo selecionado, pré-seleciona no PaymentIntent
      if (parsed.data.selectedPmId && String(parsed.data.selectedPmId).startsWith("pm_")) {
        paymentIntentParams.payment_method = parsed.data.selectedPmId;
      }

      // Cria ephemeral key para o app iOS poder gerenciar métodos de pagamento
      const ek = await stripe.ephemeralKeys.create(
        { customer: stripeCustomerId },
        { apiVersion: "2023-10-16" }
      );
      ephemeralKey = ek.secret || null;
    } catch (ekErr: any) {
      // Não bloqueia o checkout se der erro na criação do customer/ek
      ephemeralKey = null;
    }
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
      customerId:   stripeCustomerId,
      ephemeralKey: ephemeralKey,
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
  const hasSessionAccess = Boolean(sessionUserId && String(order.userId || "") === sessionUserId);
  if (!hasSessionAccess) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  try {
    const reconciled = await reconcileOrderWithStripe(order);
    return res.json(reconciled || order);
  } catch {
    return res.json(order);
  }
});

// ── Cartões salvos (Stripe Customer Payment Methods) ──────────────────────

/**
 * GET /api/payment-methods
 * Lista os cartões salvos do usuário autenticado via Stripe Customer API.
 */
app.get("/api/payment-methods", async (req: any, res: any) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured." });
  const userId = req.session?.userId ? String(req.session.userId) : "";
  if (!userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });

  try {
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    if (!user.stripeCustomerId) {
      return res.json({ paymentMethods: [] });
    }

    const pmList = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card"
    });

    const paymentMethods = (pmList.data || []).map((pm: any) => ({
      id:        pm.id,
      brand:     pm.card?.brand     || "unknown",
      last4:     pm.card?.last4     || "****",
      exp_month: pm.card?.exp_month || 0,
      exp_year:  pm.card?.exp_year  || 0
    }));

    return res.json({ paymentMethods });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "PAYMENT_METHODS_ERROR" });
  }
});

/**
 * DELETE /api/payment-methods/:pmId
 * Desvincula um cartão salvo do cliente Stripe do usuário.
 */
app.delete("/api/payment-methods/:pmId", async (req: any, res: any) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured." });
  const userId = req.session?.userId ? String(req.session.userId) : "";
  if (!userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });

  try {
    const user = await findUserById(userId);
    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({ error: "NO_SAVED_CARDS" });
    }

    const pmId = String(req.params.pmId || "").trim();
    if (!pmId.startsWith("pm_")) {
      return res.status(400).json({ error: "INVALID_PAYMENT_METHOD_ID" });
    }

    // Verifica que o PM pertence ao customer deste usuário
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (pm.customer !== user.stripeCustomerId) {
      return res.status(403).json({ error: "PAYMENT_METHOD_NOT_OWNED" });
    }

    await stripe.paymentMethods.detach(pmId);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "DETACH_ERROR" });
  }
});

// ── Push Notification routes ───────────────────────────────────────────────
app.get("/api/push/vapid-key", (_req: any, res: any) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  if (!publicKey) return res.status(503).json({ error: "PUSH_NOT_CONFIGURED" });
  res.json({ publicKey });
});

app.post("/api/notifications/register-token", async (req: any, res: any) => {
  const fcmToken = String(req.body?.fcmToken || "").trim();
  const platform = String(req.body?.platform || "ios").trim();
  const userId = req.session?.userId ? String(req.session.userId) : null;

  if (!fcmToken) return res.status(400).json({ error: "MISSING_TOKEN" });

  try {
    await query(
      `INSERT INTO device_tokens (user_id, fcm_token, platform, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (fcm_token) DO UPDATE SET user_id = $1, platform = $3, updated_at = now()`,
      [userId, fcmToken, platform]
    );
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[REGISTER_TOKEN_FAILED]", err);
    res.status(500).json({ error: "REGISTER_TOKEN_FAILED" });
  }
});

// POST /api/cart/save — Salva estado do carrinho para detectar abandono
app.post("/api/cart/save", async (req: any, res: any) => {
  const userId = req.session?.userId ? String(req.session.userId) : null;
  if (!userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });

  const items = req.body?.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: "INVALID_ITEMS" });

  const itemCount = items.length;
  const totalCents = items.reduce((sum: number, item: any) => {
    return sum + (Number(item?.price_cents || item?.priceCents || 0) * Number(item?.quantity || 1));
  }, 0);

  try {
    await query(
      `INSERT INTO cart_sessions (user_id, items, item_count, total_cents, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET
         items = $2::jsonb,
         item_count = $3,
         total_cents = $4,
         updated_at = now()`,
      [userId, JSON.stringify(items), itemCount, totalCents]
    );
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[CART_SAVE_FAILED]", err);
    res.status(500).json({ error: "CART_SAVE_FAILED" });
  }
});

// DELETE /api/cart/clear — Limpa carrinho após compra concluída
app.delete("/api/cart/clear", async (req: any, res: any) => {
  const userId = req.session?.userId ? String(req.session.userId) : null;
  if (!userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  try {
    await query("DELETE FROM cart_sessions WHERE user_id = $1", [userId]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "CART_CLEAR_FAILED" });
  }
});

app.post("/api/push/subscribe", attachUserCsrfToken, requireUserCsrfForMutations, async (req: any, res: any) => {
  const userId = req.session?.userId ? String(req.session.userId) : "";
  if (!userId) return res.status(401).json({ error: "NOT_AUTHENTICATED" });

  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: "INVALID_SUBSCRIPTION" });
  }

  try {
    await saveSubscription(userId, sub, req.headers["user-agent"]);
    res.json({ ok: true });
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error("[PUSH_SUBSCRIBE_FAILED]", err);
    res.status(500).json({ error: "SUBSCRIBE_FAILED" });
  }
});

app.delete("/api/push/unsubscribe", attachUserCsrfToken, requireUserCsrfForMutations, async (req: any, res: any) => {
  const endpoint = String(req.body?.endpoint || "").trim();
  if (!endpoint) return res.status(400).json({ error: "MISSING_ENDPOINT" });

  try {
    await deleteSubscription(endpoint);
    res.json({ ok: true });
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error("[PUSH_UNSUBSCRIBE_FAILED]", err);
    res.status(500).json({ error: "UNSUBSCRIBE_FAILED" });
  }
});

const isMainModule = typeof require !== "undefined" && require.main === module;
if (isMainModule && !isVercelRuntime) {
  startMelhorEnvioSyncScheduler();
  startNotificationScheduler();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TSEBI server running on http://localhost:${port}`);
  });
}
