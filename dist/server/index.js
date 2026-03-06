"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
exports.createApp = createApp;
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const Stripe = require("stripe");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { createSessionMiddleware } = require("./session");
const { attachUserCsrfToken, requireUserCsrfForMutations } = require("./middlewares/userCsrf");
const { authRouter, myRouter } = require("./auth");
const { studioAuthRouter } = require("./studio-auth");
const { vipRouter } = require("./vip");
const { adminRouter } = require("./admin");
const { readJson, writeJson } = require("./lib/json-store");
const { findUserById, upsertCheckoutGuestUser, setGuestTempPasswordIfMissing, normalizeEmail } = require("./user-repository");
const { sendGuestCheckoutAccountCreatedEmail } = require("./lib/email-service");
const { createOrder, updateOrder, findOrderById, listOrdersByUserId } = require("./lib/order-repository");
const { notifyOrderConfirmed, notifyPaymentApproved } = require("./lib/order-notification-service");
const { listProducts, getProductByIdentifier, searchStorefrontProducts, searchStorefrontSuggestions } = require("./lib/product-repository");
const { checkAvailability, commitStock } = require("./lib/inventory-repository");
const { evaluateAccessCode } = require("./lib/access-code-repository");
const { withTransaction } = require("./lib/db");
const { logProductSearchEvent } = require("./lib/search-telemetry-repository");
const { logBehaviorEvent, mergeAnonymousIdentity, getRecommendationsForActor, priceBucketFromCents } = require("./lib/behavior-analytics-repository");
const { shippingRouter } = require("../src/routes/shipping.routes");
const { adminShippingRouter } = require("../src/routes/admin.shipping.routes");
const { adminWhatsAppRouter } = require("../src/routes/admin.whatsapp.routes");
const { orderTrackingRouter } = require("../src/routes/order-tracking.routes");
const { whatsappRouter } = require("../src/routes/whatsapp.routes");
const { resolveQuoteForCheckout, selectShippingForOrder } = require("../src/shipping/shipping.service");
const { syncMelhorEnvioTrackingJob } = require("../src/shipping/order-tracking.service");
const { sendOrderConfirmedWhatsApp } = require("./lib/whatsapp-service");
dotenv.config();
const expressApp = express();
function createApp() {
    return expressApp;
}
exports.app = createApp();
const port = Number(process.env.PORT) || 4242;
const isVercelRuntime = String(process.env.VERCEL || "").trim() === "1" ||
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
    if (raw === "1" || raw === "true")
        return true;
    if (raw === "0" || raw === "false")
        return false;
    return process.env.NODE_ENV !== "production";
})();
/** @type {import("stripe").Stripe | null} */
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
let melhorEnvioSyncTimer = null;
const newsletterDataFile = path.resolve(__dirname, "..", "data", "newsletter-subscribers.json");
let newsletterWriteQueue = Promise.resolve(null);
function normalizePosthogHost(value) {
    const fallback = "https://us.i.posthog.com";
    const raw = String(value || "").trim();
    if (!raw)
        return fallback;
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
            return fallback;
        return parsed.origin;
    }
    catch {
        return fallback;
    }
}
function parseAllowedCorsOrigins() {
    const fromEnv = String(process.env.CORS_ORIGIN || "")
        .split(",")
        .map((entry) => String(entry || "").trim())
        .filter(Boolean);
    const appBaseUrl = String(process.env.APP_BASE_URL || "").trim();
    if (appBaseUrl)
        fromEnv.push(appBaseUrl);
    const normalized = new Set();
    fromEnv.forEach((entry) => {
        try {
            normalized.add(new URL(entry).origin);
        }
        catch { }
    });
    if (normalized.size > 0)
        return Array.from(normalized);
    if (process.env.NODE_ENV !== "production") {
        return ["http://localhost:3000", "http://localhost:4242", "http://127.0.0.1:3000", "http://127.0.0.1:4242"];
    }
    return [];
}
exports.app.set("trust proxy", 1);
exports.app.disable("x-powered-by");
exports.app.use((req, res, next) => {
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
        .refine((value) => ["search_view", "suggestion_click", "result_click", "did_you_mean_click", "zero_result"].includes(value)),
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
    installments: z.coerce.number().int().min(1).max(6).optional().default(1),
    metaEventId: z.string().trim().max(120).optional().default(""),
    items: z
        .array(z.object({
        id: z.string().trim().min(1),
        qty: z.coerce.number().int().min(1).max(999),
        color: z.string().trim().max(80).optional().default(""),
        size: z.string().trim().max(80).optional().default(""),
        variantKey: z.string().trim().max(180).optional().default("")
    }))
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
        .optional()
});
const behaviorEventSchema = z.object({
    eventName: z
        .string()
        .trim()
        .toLowerCase()
        .refine((value) => [
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
    ].includes(value)),
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
const metaCapiEventSchema = z.object({
    event_name: z.string().trim().min(1).max(80),
    event_id: z.string().trim().min(6).max(160),
    event_time: z.coerce.number().int().positive().optional(),
    action_source: z.string().trim().max(40).optional().default("website"),
    email: z.string().trim().email().optional().or(z.literal("")).default(""),
    currency: z.string().trim().max(12).optional().default("BRL"),
    value: z.coerce.number().min(0).optional().default(0)
});
function sha256Lower(value) {
    return crypto
        .createHash("sha256")
        .update(String(value || "").trim().toLowerCase())
        .digest("hex");
}
function parseTriStateBooleanEnv(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw)
        return null;
    if (raw === "1" || raw === "true" || raw === "yes" || raw === "on")
        return true;
    if (raw === "0" || raw === "false" || raw === "no" || raw === "off")
        return false;
    return null;
}
function parseCookieValue(rawCookie, key) {
    const source = String(rawCookie || "");
    if (!source || !key)
        return "";
    const entries = source.split(";");
    for (const entry of entries) {
        const [name, ...valueParts] = entry.split("=");
        if (String(name || "").trim() !== key)
            continue;
        try {
            return decodeURIComponent(valueParts.join("=").trim());
        }
        catch {
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
async function sendMetaCapiEvent(payload) {
    const metaConfig = resolveMetaConfig();
    const appBaseUrl = String(process.env.APP_BASE_URL || "https://www.tsebi.com.br").trim().replace(/\/+$/, "");
    if (!metaConfig.enabled)
        return { ok: false, skipped: true, reason: "META_NOT_CONFIGURED" };
    const eventTime = Number(payload.eventTime || Math.floor(Date.now() / 1000));
    const email = normalizeEmail(payload.email || "");
    const externalId = String(payload.externalId || "").trim();
    const normalizedCurrency = String(payload.currency || "BRL").trim().toUpperCase() || "BRL";
    const normalizedValue = Number(Math.max(0, Number(payload.value || 0)).toFixed(2));
    const body = {
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
    const endpoint = `https://graph.facebook.com/${encodeURIComponent(metaConfig.apiVersion)}/${encodeURIComponent(metaConfig.pixelId)}/events`;
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
function normalizeAndAggregateItems(rawItems) {
    if (!Array.isArray(rawItems))
        return [];
    const byId = new Map();
    rawItems.forEach((item) => {
        const id = item && typeof item.id === "string" ? item.id.trim() : "";
        const qtyRaw = item ? Number(item.qty) : 0;
        const qty = Number.isInteger(qtyRaw) ? qtyRaw : Math.floor(qtyRaw);
        const color = String(item?.color || "").trim();
        const size = String(item?.size || "").trim();
        const rawVariantKey = String(item?.variantKey || "").trim();
        const variantKey = rawVariantKey && rawVariantKey.includes("__")
            ? rawVariantKey
            : color && size
                ? `${color}__${size}`
                : "";
        if (!id || qty <= 0)
            return;
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
function normalizeShipping(rawShipping) {
    if (!rawShipping || typeof rawShipping !== "object")
        return null;
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
function normalizeGuestCustomer(payload = {}) {
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
function getShippingCostFromRules(shipping) {
    if (!shipping || !shipping.shippingMethod)
        return 0;
    if (shipping.shippingMethod === "company_emergency")
        return 5000;
    const cepDigits = String(shipping.cep || "").replace(/\D/g, "");
    const firstDigit = Number(cepDigits[0] || 0);
    let standard = 2900;
    let express = 4900;
    if (firstDigit <= 3) {
        standard = 2200;
        express = 3900;
    }
    else if (firstDigit >= 7) {
        standard = 3400;
        express = 5600;
    }
    if (shipping.shippingMethod === "standard")
        return standard;
    if (shipping.shippingMethod === "express")
        return express;
    return 0;
}
function isCompanyPaidShippingZip(value) {
    const zip = String(value || "").replace(/\D/g, "").slice(0, 8);
    if (zip.length !== 8)
        return false;
    const prefix = Number(zip.slice(0, 5));
    if (!Number.isFinite(prefix))
        return false;
    const isSaoPauloCapital = (prefix >= 1000 && prefix <= 5999) || (prefix >= 8000 && prefix <= 8499);
    const isOsasco = prefix >= 6000 && prefix <= 6299;
    return isSaoPauloCapital || isOsasco;
}
function normalizeItemsForComparison(items) {
    return (Array.isArray(items) ? items : [])
        .map((item) => ({
        id: String(item?.id || "").trim(),
        qty: Math.max(1, Number(item?.qty || 0)),
        unitAmount: Math.max(0, Number(item?.unitAmount || 0)),
        variantKey: String(item?.variantKey || "").trim()
    }))
        .filter((item) => item.id)
        .sort((a, b) => `${a.id}|${a.variantKey}`.localeCompare(`${b.id}|${b.variantKey}`));
}
function normalizeNewsletterPhone(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 15);
}
function sanitizeNewsletterSource(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_\-/.:]+/g, "-")
        .slice(0, 80);
}
function enqueueNewsletterWrite(task) {
    newsletterWriteQueue = newsletterWriteQueue.then(task, task);
    return newsletterWriteQueue;
}
function parseBooleanEnv(value, fallback = false) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized)
        return fallback;
    if (["1", "true", "yes", "on"].includes(normalized))
        return true;
    if (["0", "false", "no", "off"].includes(normalized))
        return false;
    return fallback;
}
function toSafeErrorMessage(error, fallback = "unknown_error") {
    const message = String(error?.message || "").trim();
    return message ? message.slice(0, 300) : fallback;
}
function sanitizeLogDetails(value) {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeLogDetails(item));
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
    const sanitized = {};
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
function logStripeLifecycle(event, details = {}) {
    const payload = {
        ts: new Date().toISOString(),
        event,
        ...sanitizeLogDetails(details)
    };
    try {
        // eslint-disable-next-line no-console
        console.log("[stripe]", JSON.stringify(payload));
    }
    catch {
        // eslint-disable-next-line no-console
        console.log("[stripe]", event);
    }
}
/**
 * @param {import("stripe").Stripe.Event} event
 * @returns {boolean}
 */
function isPaymentIntentEvent(event) {
    return String(event?.type || "").startsWith("payment_intent.");
}
/**
 * @param {import("stripe").Stripe.Event} event
 * @param {unknown} stripeObject
 * @returns {string}
 */
function extractPaymentIntentIdFromWebhook(event, stripeObject) {
    if (!stripeObject || typeof stripeObject !== "object")
        return "";
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
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error("[melhorenvio-sync] failed", String(error?.message || "unknown_error"));
    }
}
function startMelhorEnvioSyncScheduler() {
    if (isVercelRuntime)
        return;
    if (parseBooleanEnv(process.env.MELHORENVIO_SYNC_DISABLE_AUTO, false))
        return;
    if (melhorEnvioSyncTimer)
        return;
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
    if (a.length !== b.length)
        return false;
    for (let index = 0; index < a.length; index += 1) {
        const left = a[index];
        const right = b[index];
        if (!right)
            return false;
        if (left.id !== right.id ||
            left.qty !== right.qty ||
            left.unitAmount !== right.unitAmount ||
            String(left.variantKey || "") !== String(right.variantKey || "")) {
            return false;
        }
    }
    return true;
}
function isReusableOrderStatus(status) {
    const normalized = String(status || "").trim().toLowerCase();
    return normalized === "pending_payment" || normalized === "processing";
}
async function findReusableCheckoutOrder({ userId, paymentMethod, installments, itemsAmount, shippingAmount, orderAmount, shipping, resolvedItems }) {
    const orders = await listOrdersByUserId(userId);
    const now = Date.now();
    const requestedItems = normalizeItemsForComparison(resolvedItems);
    const expectedShippingZip = String(shipping?.cep || "").replace(/\D/g, "").slice(0, 8);
    const expectedShippingMethod = String(shipping?.shippingMethod || "").trim().toLowerCase();
    for (const order of orders) {
        if (!order || !isReusableOrderStatus(order.status))
            continue;
        if (now - new Date(order.createdAt || 0).getTime() > 30 * 60 * 1000)
            continue;
        if (String(order.paymentMethod || "automatic") !== String(paymentMethod || "automatic"))
            continue;
        if (Math.max(1, Number(order.installments || 1)) !== Math.max(1, Number(installments || 1)))
            continue;
        if (Number(order.itemsAmount || 0) !== Number(itemsAmount || 0))
            continue;
        if (Number(order.shippingAmount || 0) !== Number(shippingAmount || 0))
            continue;
        if (Number(order.amount || 0) !== Number(orderAmount || 0))
            continue;
        const orderShippingZip = String(order.shippingDestinationZip || order?.shipping?.cep || "")
            .replace(/\D/g, "")
            .slice(0, 8);
        const orderShippingMethod = String(order?.shipping?.shippingMethod || "").trim().toLowerCase();
        if (expectedShippingZip && orderShippingZip !== expectedShippingZip)
            continue;
        if (expectedShippingMethod && orderShippingMethod !== expectedShippingMethod)
            continue;
        const orderItems = normalizeItemsForComparison(order.items);
        if (!areSameItemSet(orderItems, requestedItems))
            continue;
        return order;
    }
    return null;
}
async function getReusablePaymentIntentClientSecret(order, expectedAmount) {
    if (!stripe || !order?.stripePaymentIntentId)
        return null;
    const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    const status = String(intent?.status || "").toLowerCase();
    const amount = Number(intent?.amount || 0);
    if (amount !== Math.max(0, Number(expectedAmount || 0)))
        return null;
    const paymentMethodTypes = Array.isArray(intent?.payment_method_types)
        ? intent.payment_method_types.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
        : [];
    const hasDisallowedType = paymentMethodTypes.some((type) => !stripeCheckoutPaymentMethodTypes.includes(type));
    if (hasDisallowedType)
        return null;
    if (status === "requires_payment_method" ||
        status === "requires_confirmation" ||
        status === "requires_action" ||
        status === "processing") {
        const clientSecret = String(intent?.client_secret || "").trim() || null;
        if (!clientSecret)
            return null;
        return {
            clientSecret,
            paymentMethodTypes
        };
    }
    return null;
}
async function markOrderPaid(order) {
    if (!order)
        return order;
    if (order.status === "paid" && order.stockCommitted)
        return order;
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
    if (!order)
        return order;
    return updateOrder(order.id, {
        status: "failed",
        failureReason: reason || "payment_failed"
    });
}
async function markOrderCanceled(order, reason) {
    if (!order)
        return order;
    return updateOrder(order.id, {
        status: "canceled",
        canceledAt: new Date().toISOString(),
        cancellationReason: reason || "canceled_by_customer"
    });
}
async function markOrderRefunded(order, stripeRefundId) {
    if (!order)
        return order;
    return updateOrder(order.id, {
        status: "refunded",
        refundedAt: new Date().toISOString(),
        stripeRefundId: stripeRefundId || order.stripeRefundId || null
    });
}
async function reconcileOrderWithStripe(order) {
    if (!stripe || !order?.stripePaymentIntentId)
        return order;
    if (["failed", "canceled", "refunded"].includes(order.status))
        return order;
    const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    const status = String(intent?.status || "").toLowerCase();
    if (status === "succeeded") {
        const updated = await markOrderPaid(order);
        if (String(order.status || "").toLowerCase() !== "paid" && String(updated?.status || "").toLowerCase() === "paid") {
            notifyPaymentApproved(updated).catch(() => { });
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
    const result = await client.query(`
    INSERT INTO webhook_events (stripe_event_id, event_type)
    VALUES ($1, $2)
    ON CONFLICT (stripe_event_id) DO NOTHING
    RETURNING id
    `, [event.id, event.type]);
    return result.rowCount > 0;
}
async function findOrderForWebhook(client, metadataOrderId, paymentIntentId) {
    if (metadataOrderId) {
        const byId = await client.query(`SELECT id FROM orders WHERE id = $1 LIMIT 1`, [metadataOrderId]);
        if (byId.rowCount > 0)
            return byId.rows[0].id;
    }
    if (paymentIntentId) {
        const byIntent = await client.query(`SELECT id FROM orders WHERE stripe_payment_intent_id = $1 LIMIT 1`, [paymentIntentId]);
        if (byIntent.rowCount > 0)
            return byIntent.rows[0].id;
    }
    return null;
}
async function fetchOrderWithItemsInTx(client, orderId) {
    const orderResult = await client.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
    if (orderResult.rowCount === 0)
        return null;
    const order = orderResult.rows[0];
    const itemsResult = await client.query(`
    SELECT product_sku, product_id, name, qty, price_cents, currency, variant_color, variant_size, variant_key
    FROM order_items
    WHERE order_id = $1
    `, [orderId]);
    return {
        id: order.id,
        userId: order.user_id || null,
        userEmail: order.user_email || null,
        totalCents: Math.max(0, Number(order.total_cents || 0)),
        status: order.status,
        stockCommitted: Boolean(order.stock_committed),
        items: itemsResult.rows.map((item) => ({
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
async function processWebhookEvent(event, requestContext = {}) {
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
    const webhookContext = {
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
    const pendingNotifications = [];
    const pendingBehaviorEvents = [];
    const pendingMetaCapiEvents = [];
    await withTransaction(async (client) => {
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
                    await client.query(`
            UPDATE orders
            SET status = 'failed',
                failure_reason = $2,
                stock_issues = $3::jsonb,
                stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $4),
                updated_at = NOW()
            WHERE id = $1
            `, [order.id, "stock_unavailable_after_payment", JSON.stringify(stockResult.issues || []), paymentIntentId || null]);
                    webhookContext.outcome = "order_updated";
                    webhookContext.reason = "stock_commit_failed";
                    webhookContext.statusFrom = previousStatus;
                    webhookContext.statusTo = "failed";
                    return;
                }
            }
            await client.query(`
        UPDATE orders
        SET status = 'paid',
            stock_committed = true,
            paid_at = COALESCE(paid_at, NOW()),
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2),
            updated_at = NOW()
        WHERE id = $1
        `, [order.id, paymentIntentId || null]);
            webhookContext.outcome = "order_updated";
            webhookContext.statusFrom = previousStatus;
            webhookContext.statusTo = "paid";
            const paymentIntent = stripeObject || {};
            const webhookMetaEventId = paymentIntentId
                ? `pi_${String(paymentIntentId)}_purchase`
                : `order_${String(order.id || "")}_purchase`;
            const amountCentsFromStripe = Math.max(0, Number(paymentIntent?.amount_received || paymentIntent?.amount || 0));
            const amountCents = Math.max(0, amountCentsFromStripe || Number(order?.totalCents || 0));
            const orderForMeta = order;
            const orderItems = Array.isArray(order.items) ? order.items : [];
            const contentIds = orderItems
                .map((item) => String(item?.id || "").trim())
                .filter(Boolean);
            const contents = orderItems
                .map((item) => {
                const id = String(item?.id || "").trim();
                const quantity = Math.max(1, Number(item?.qty || 1));
                const itemPrice = Math.max(0, Number(item?.unitAmount || 0)) / 100;
                if (!id)
                    return null;
                return {
                    id,
                    quantity,
                    item_price: Number(itemPrice.toFixed(2))
                };
            })
                .filter(Boolean);
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
                        .map((item) => String(item.id || "").trim())
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(",")
                    : "",
                category: "",
                price: Array.isArray(order.items)
                    ? order.items.reduce((sum, item) => sum + Math.max(0, Number(item.unitAmount || 0) * Math.max(1, Number(item.qty || 1))), 0)
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
            await client.query(`UPDATE orders SET status = 'processing', stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2), updated_at = NOW() WHERE id = $1`, [order.id, paymentIntentId || null]);
            webhookContext.outcome = "order_updated";
            webhookContext.statusFrom = previousStatus;
            webhookContext.statusTo = "processing";
            if (previousStatus !== "processing" && previousStatus !== "paid") {
                pendingNotifications.push({ type: "payment_confirmed", orderId: order.id });
            }
            return;
        }
        if (event.type === "payment_intent.payment_failed") {
            await client.query(`
        UPDATE orders
        SET status = 'failed',
            failure_reason = $2,
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
            updated_at = NOW()
        WHERE id = $1
        `, [order.id, stripeObject.last_payment_error?.message || event.type, paymentIntentId || null]);
            webhookContext.outcome = "order_updated";
            webhookContext.statusFrom = previousStatus;
            webhookContext.statusTo = "failed";
            return;
        }
        if (event.type === "payment_intent.canceled") {
            await client.query(`
        UPDATE orders
        SET status = 'canceled',
            canceled_at = NOW(),
            cancellation_reason = $2,
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
            updated_at = NOW()
        WHERE id = $1
        `, [order.id, stripeObject.cancellation_reason || "canceled", paymentIntentId || null]);
            webhookContext.outcome = "order_updated";
            webhookContext.statusFrom = previousStatus;
            webhookContext.statusTo = "canceled";
            return;
        }
        if (event.type === "charge.refunded") {
            const refundId = stripeObject.refunds?.data?.[0]?.id || null;
            await client.query(`
        UPDATE orders
        SET status = 'refunded',
            refunded_at = NOW(),
            stripe_refund_id = COALESCE($2, stripe_refund_id),
            stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
            updated_at = NOW()
        WHERE id = $1
        `, [order.id, refundId, paymentIntentId || null]);
            webhookContext.outcome = "order_updated";
            webhookContext.statusFrom = previousStatus;
            webhookContext.statusTo = "refunded";
            return;
        }
        webhookContext.outcome = "ignored";
        webhookContext.reason = "unsupported_event_type";
    });
    if (webhookContext.outcome === "order_updated" &&
        webhookContext.statusFrom &&
        webhookContext.statusTo &&
        webhookContext.statusFrom !== webhookContext.statusTo) {
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
        if (notification.type !== "payment_approved" && notification.type !== "payment_confirmed")
            continue;
        try {
            const order = await findOrderById(notification.orderId);
            if (!order)
                continue;
            const currentStatus = String(order.status || "").toLowerCase();
            if (notification.type === "payment_confirmed" && (currentStatus === "processing" || currentStatus === "paid")) {
                await notifyOrderConfirmed(order);
                sendOrderConfirmedWhatsApp(order).catch(() => { });
                continue;
            }
            if (notification.type === "payment_approved" && currentStatus === "paid") {
                await notifyPaymentApproved(order);
            }
        }
        catch (error) {
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
        }
        catch (error) {
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
                status: Number(result?.status || 0)
            });
            console.log("[meta] response_body", {
                requestId: webhookContext.requestId || "",
                body: String(result?.responseBody || "")
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
        }
        catch (error) {
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
exports.app.use(cors({
    origin: (requestOrigin, callback) => {
        const allowedOrigins = parseAllowedCorsOrigins();
        if (!requestOrigin)
            return callback(null, false);
        if (allowedOrigins.includes(String(requestOrigin)))
            return callback(null, true);
        return callback(null, false);
    },
    credentials: true
}));
exports.app.use(helmet({
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
                "'unsafe-inline'",
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
            styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://fonts.googleapis.com"],
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
}));
exports.app.use(compression());
exports.app.use(createSessionMiddleware());
exports.app.post("/api/stripe/webhook", webhookRateLimit, express.raw({ type: "application/json" }), 
/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async (req, res) => {
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
    }
    catch (error) {
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
    }
    catch (error) {
        logStripeLifecycle("webhook_processing_failed", {
            requestId: String(req.requestId || ""),
            webhookEventId: event?.id || null,
            eventType: event?.type || null,
            error: toSafeErrorMessage(error)
        });
        return res.status(200).json({ received: true, warning: "processing_failed" });
    }
});
exports.app.use(express.json({
    verify: (req, _res, buf) => {
        try {
            if (String(req.originalUrl || "").startsWith("/api/whatsapp/webhook")) {
                req.rawBody = Buffer.from(buf);
            }
        }
        catch { }
    }
}));
exports.app.use("/images", express.static(path.resolve(process.cwd(), "images"), {
    fallthrough: false,
    maxAge: "30d",
    immutable: true
}));
exports.app.use("/api/auth", attachUserCsrfToken, requireUserCsrfForMutations, authRouter);
exports.app.use("/api/my", attachUserCsrfToken, requireUserCsrfForMutations, myRouter);
exports.app.use("/api/studio-auth", studioAuthRouter);
exports.app.use("/api/vip", vipRouter);
exports.app.use("/api", shippingRouter);
exports.app.use("/api", orderTrackingRouter);
exports.app.use("/api/whatsapp", whatsappRouter);
exports.app.use("/api/admin", adminRouter);
exports.app.use("/api/admin", adminShippingRouter);
exports.app.use("/api/admin", adminWhatsAppRouter);
exports.app.get("/api/products", async (req, res) => {
    try {
        const products = await listProducts();
        return res.json(products);
    }
    catch {
        return res.status(500).json({ error: "Failed to load products." });
    }
});
exports.app.get("/api/products/search", async (req, res) => {
    try {
        const queryText = String(req.query.q || req.query.query || "").trim();
        const page = Math.max(1, Number(req.query.page || 1) || 1);
        const limit = Math.max(1, Math.min(24, Number(req.query.limit || 8) || 8));
        const category = String(req.query.category || "").trim();
        const collection = String(req.query.collection || "").trim();
        const gender = String(req.query.gender || "").trim();
        const sortRaw = String(req.query.sort || "relevance").trim().toLowerCase();
        const sort = sortRaw === "newest" || sortRaw === "price_asc" || sortRaw === "price_desc" ? sortRaw : "relevance";
        const inStockRaw = String(req.query.inStock || req.query.in_stock || "").trim().toLowerCase();
        const inStock = inStockRaw === "1" || inStockRaw === "true" || inStockRaw === "yes";
        const hasFilter = Boolean(category) || Boolean(collection) || Boolean(gender) || inStock || sort !== "relevance";
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
    }
    catch {
        return res.status(500).json({ error: "SEARCH_FAILED" });
    }
});
exports.app.get("/api/products/search/suggestions", productSearchSuggestionsRateLimit, async (req, res) => {
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
    }
    catch {
        return res.status(500).json({ error: "SEARCH_SUGGESTIONS_FAILED" });
    }
});
exports.app.post("/api/products/search/events", productSearchEventsRateLimit, async (req, res) => {
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
    }
    catch {
        return res.status(500).json({ ok: false, error: "SEARCH_EVENT_FAILED" });
    }
});
exports.app.post("/api/events", behaviorEventsRateLimit, async (req, res) => {
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
    }
    catch {
        return res.status(500).json({ ok: false, error: "EVENT_TRACKING_FAILED" });
    }
});
exports.app.post("/api/meta/capi", behaviorEventsRateLimit, async (req, res) => {
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
    }
    catch {
        return res.status(500).json({ ok: false, error: "META_CAPI_FAILED" });
    }
});
exports.app.post("/api/identify", identifyRateLimit, async (req, res) => {
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
    }
    catch {
        return res.status(500).json({ ok: false, error: "IDENTIFY_FAILED" });
    }
});
exports.app.get("/api/products/recent", async (req, res) => {
    try {
        const ids = String(req.query.ids || "")
            .split(",")
            .map((id) => String(id || "").trim())
            .filter(Boolean);
        if (!ids.length)
            return res.json({ products: [] });
        const products = await listProducts();
        const byId = new Map(products.map((item) => [String(item.id), item]));
        const unique = [];
        const seen = new Set();
        ids.forEach((id) => {
            if (seen.has(id))
                return;
            const item = byId.get(id);
            if (!item)
                return;
            seen.add(id);
            unique.push(item);
        });
        return res.json({ products: unique });
    }
    catch {
        return res.status(500).json({ error: "Failed to load recent products." });
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
        if (seen.has(item.id))
            continue;
        seen.add(item.id);
        unique.push(item);
        if (unique.length >= safeLimit)
            break;
    }
    return unique;
}
function foldRecommendationText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
function splitRecommendationTokens(value) {
    return String(value || "")
        .split(",")
        .map((item) => String(item || "").trim())
        .filter(Boolean);
}
function parseRecommendationSignals(rawSignals) {
    if (!rawSignals) {
        return {
            topCategory: "",
            topClickedSku: "",
            topPriceBand: "",
            searches: [],
            recentViewed: [],
            cartSkus: []
        };
    }
    try {
        const parsed = typeof rawSignals === "string" ? JSON.parse(rawSignals) : rawSignals;
        return {
            topCategory: String(parsed?.topCategory || "").trim(),
            topClickedSku: String(parsed?.topClickedSku || "").trim(),
            topPriceBand: String(parsed?.topPriceBand || "").trim().toLowerCase(),
            searches: Array.isArray(parsed?.searches) ? parsed.searches.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12) : [],
            recentViewed: Array.isArray(parsed?.recentViewed)
                ? parsed.recentViewed.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 16)
                : [],
            cartSkus: Array.isArray(parsed?.cartSkus) ? parsed.cartSkus.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 16) : []
        };
    }
    catch {
        return {
            topCategory: "",
            topClickedSku: "",
            topPriceBand: "",
            searches: [],
            recentViewed: [],
            cartSkus: []
        };
    }
}
function resolvePriceBandThresholds(products) {
    const prices = products
        .map((item) => Number(item?.priceValue || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b);
    if (prices.length < 3)
        return { lowMax: 400, midMax: 1100 };
    const lowIndex = Math.floor(prices.length * 0.33);
    const midIndex = Math.floor(prices.length * 0.66);
    const lowMax = prices[Math.max(0, Math.min(prices.length - 1, lowIndex))];
    const midMax = prices[Math.max(0, Math.min(prices.length - 1, midIndex))];
    return {
        lowMax: Math.max(1, Number(lowMax || 400)),
        midMax: Math.max(Number(lowMax || 400) + 1, Number(midMax || 1100))
    };
}
function resolveProductPriceBand(product, thresholds) {
    const price = Number(product?.priceValue || 0);
    if (!Number.isFinite(price) || price <= thresholds.lowMax)
        return "low";
    if (price <= thresholds.midMax)
        return "mid";
    return "high";
}
function rankPersonalizedProducts({ products, signals, purchasedSkus }) {
    const activeProducts = (products || []).filter((item) => item && item.active !== false);
    const bySku = new Map(activeProducts.map((item) => [String(item.sku || item.id), item]));
    const clickedProduct = bySku.get(String(signals.topClickedSku || ""));
    const thresholds = resolvePriceBandThresholds(activeProducts);
    const normalizedTopCategory = foldRecommendationText(signals.topCategory);
    const normalizedSearches = (signals.searches || []).map((term) => foldRecommendationText(term)).filter(Boolean);
    const viewedSet = new Set((signals.recentViewed || []).map((value) => String(value || "").trim()).filter(Boolean));
    const cartSet = new Set((signals.cartSkus || []).map((value) => String(value || "").trim()).filter(Boolean));
    const requestedBand = ["low", "mid", "high"].includes(String(signals.topPriceBand || "")) ? String(signals.topPriceBand) : "";
    const scored = activeProducts.map((product) => {
        let score = 0;
        const reasons = [];
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
                .map((entry) => foldRecommendationText(entry))
                .filter(Boolean)
                .join(" ");
            if (normalizedSearches.some((term) => searchable.includes(term))) {
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
    scored.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        if (Number(b.product.stock || 0) !== Number(a.product.stock || 0))
            return Number(b.product.stock || 0) - Number(a.product.stock || 0);
        return String(a.product.name || "").localeCompare(String(b.product.name || ""));
    });
    return scored;
}
exports.app.get("/api/recommendations", async (req, res) => {
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
    }
    catch {
        return res.status(500).json({ error: "RECOMMENDATIONS_FAILED" });
    }
});
exports.app.get("/api/products/:id", async (req, res) => {
    try {
        const product = await getProductByIdentifier(req.params.id);
        if (!product || product.active === false) {
            return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
        }
        return res.json(product);
    }
    catch {
        return res.status(500).json({ error: "Failed to load product." });
    }
});
exports.app.get("/api/products/:id/recommendations", async (req, res) => {
    try {
        const product = await getProductByIdentifier(req.params.id);
        if (!product || product.active === false) {
            return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
        }
        const products = await listProducts();
        const limit = Number(req.query.limit || 4);
        const similar = buildSimilarProducts(product, products, limit);
        return res.json({ base: product, recommendations: similar });
    }
    catch {
        return res.status(500).json({ error: "Failed to load recommendations." });
    }
});
exports.app.get("/api/config", (req, res) => {
    res.json({
        stripePublishableKey,
        currency: "brl",
        maxInstallments: 6,
        posthog: posthogPublicKey
            ? {
                key: posthogPublicKey,
                host: normalizePosthogHost(posthogHost)
            }
            : null
    });
});
exports.app.post("/api/discount-codes/apply", async (req, res) => {
    const code = String(req.body?.code || "").trim();
    const subtotalCents = Math.max(0, Math.floor(Number(req.body?.subtotalCents || 0)));
    const shippingCents = Math.max(0, Math.floor(Number(req.body?.shippingCents || 0)));
    if (!code)
        return res.status(400).json({ ok: false, error: "INVALID_CODE" });
    try {
        const result = await evaluateAccessCode({
            code,
            subtotalCents,
            shippingCents
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
            amountOffCents: result.entry.amountOffCents
        });
    }
    catch {
        return res.status(500).json({ ok: false, error: "ACCESS_CODE_EVALUATION_FAILED" });
    }
});
exports.app.post("/api/newsletter/subscribe", newsletterSubscribeRateLimit, async (req, res) => {
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
            const existingIndex = safeList.findIndex((entry) => normalizeEmail(entry?.email || "") === email);
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
            }
            else {
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
    }
    catch {
        return res.status(500).json({ ok: false, error: "NEWSLETTER_SUBSCRIBE_FAILED" });
    }
});
exports.app.post("/api/orders/payment-intent", paymentIntentRateLimit, 
/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async (req, res) => {
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
        const installments = parsed.data.installments;
        const normalizedItems = normalizeAndAggregateItems(parsed.data.items);
        const shipping = normalizeShipping(parsed.data.shipping || null);
        const sessionUserId = req.session?.userId ? String(req.session.userId) : "";
        let checkoutUser = sessionUserId ? await findUserById(sessionUserId) : null;
        const guest = normalizeGuestCustomer(parsed.data);
        if (!checkoutUser) {
            const hasRequiredGuestData = guest.email &&
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
                    const tempPasswordHash = await bcrypt.hash(tempPassword, 12);
                    const updatedGuest = await setGuestTempPasswordIfMissing(checkoutUser.id, tempPasswordHash);
                    if (updatedGuest) {
                        checkoutUser = updatedGuest;
                        sendGuestCheckoutAccountCreatedEmail({
                            to: checkoutUser.email || guest.email || "",
                            fullName: checkoutUser.name || guest.fullName || "",
                            tempPassword
                        }).catch(() => { });
                    }
                }
                catch { }
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
        const itemsAmount = availability.resolvedItems.reduce((sum, item) => sum + item.unitAmount * item.qty, 0);
        const catalogForMetadata = await listProducts().catch(() => []);
        const catalogBySku = new Map((Array.isArray(catalogForMetadata) ? catalogForMetadata : []).map((product) => [String(product.sku || product.id || "").trim(), product]));
        let shippingAmount = getShippingCostFromRules(shipping);
        let selectedShippingQuote = null;
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
            }
            catch (error) {
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
        const ticketBucket = priceBucketFromCents(orderAmount);
        const checkoutMetaEventId = String(parsed.data.metaEventId || "").trim() || crypto.randomUUID();
        const topCategories = Array.from(new Set(availability.resolvedItems
            .map((item) => {
            const sku = String(item.id || item.sku || "").trim();
            const product = catalogBySku.get(sku);
            return String(product?.category || "").trim();
        })
            .filter(Boolean))).slice(0, 4);
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
        }
        catch { }
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
            }
            catch (error) {
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
            productId: availability.resolvedItems.map((item) => String(item.id || item.sku || "").trim()).filter(Boolean).slice(0, 3).join(","),
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
        }).catch(() => { });
        /** @type {import("stripe").Stripe.PaymentIntentCreateParams} */
        const paymentIntentParams = {
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
                paymentMethodTypes: Array.isArray(paymentIntent.payment_method_types)
                    ? paymentIntent.payment_method_types.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
                    : []
            });
        }
        catch (error) {
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
    }
    catch (error) {
        const safeMessage = toSafeErrorMessage(error) || "Unexpected payment intent failure.";
        logStripeLifecycle("payment_intent_unhandled_error", {
            error: safeMessage
        });
        return res.status(500).json({
            error: "PAYMENT_INTENT_INTERNAL_ERROR",
            message: safeMessage
        });
    }
});
exports.app.get("/api/orders/:orderId", async (req, res) => {
    const order = await findOrderById(req.params.orderId);
    if (!order)
        return res.status(404).json({ error: "Order not found." });
    const sessionUserId = req.session?.userId ? String(req.session.userId) : "";
    const hasSessionAccess = Boolean(sessionUserId && String(order.userId || "") === sessionUserId);
    if (!hasSessionAccess) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    try {
        const reconciled = await reconcileOrderWithStripe(order);
        return res.json(reconciled || order);
    }
    catch {
        return res.json(order);
    }
});
const isMainModule = typeof require !== "undefined" && require.main === module;
if (isMainModule && !isVercelRuntime) {
    startMelhorEnvioSyncScheduler();
    exports.app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`TSEBI server running on http://localhost:${port}`);
    });
}
//# sourceMappingURL=index.js.map