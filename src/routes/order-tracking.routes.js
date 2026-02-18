const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { requireAuth } = require("../../server/middlewares/requireAuth");
const {
  getTrackedOrderByLookup,
  listAccountTrackingOrders,
  syncMelhorEnvioTrackingJob
} = require("../shipping/order-tracking.service");

const orderTrackingRouter = express.Router();

const trackRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

const trackQuerySchema = z.object({
  orderNumber: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(180)
});

const syncPayloadSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(120)
});

const trackCache = new Map();
const TRACK_CACHE_TTL_MS = 45 * 1000;

function readInternalSecret(req) {
  const headerSecret = String(req.get("x-internal-job-secret") || "").trim();
  if (headerSecret) return headerSecret;
  const auth = String(req.get("authorization") || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  return "";
}

function clearExpiredTrackCache() {
  const now = Date.now();
  for (const [key, entry] of trackCache.entries()) {
    if (!entry || now - Number(entry.createdAt || 0) > TRACK_CACHE_TTL_MS) {
      trackCache.delete(key);
    }
  }
}

function getTrackCacheKey(orderNumber, email) {
  return `${String(orderNumber || "").trim().toUpperCase()}::${String(email || "").trim().toLowerCase()}`;
}

orderTrackingRouter.get("/orders/track", trackRateLimit, async (req, res) => {
  const parsed = trackQuerySchema.safeParse(req.query || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  clearExpiredTrackCache();
  const cacheKey = getTrackCacheKey(parsed.data.orderNumber, parsed.data.email);
  const cached = trackCache.get(cacheKey);
  if (cached && Date.now() - Number(cached.createdAt || 0) <= TRACK_CACHE_TTL_MS) {
    return res.json(cached.payload);
  }

  const tracked = await getTrackedOrderByLookup(parsed.data.orderNumber, parsed.data.email);
  if (!tracked) {
    return res.status(404).json({ error: "ORDER_NOT_FOUND" });
  }

  const payload = { order: tracked };
  trackCache.set(cacheKey, {
    createdAt: Date.now(),
    payload
  });

  return res.json(payload);
});

orderTrackingRouter.get("/account/orders", requireAuth, async (req, res) => {
  const orders = await listAccountTrackingOrders(req.session.userId);
  return res.json({ orders });
});

orderTrackingRouter.post("/internal/jobs/melhorenvio-sync", async (req, res) => {
  const configuredSecret = String(process.env.INTERNAL_JOB_SECRET || "").trim();
  if (!configuredSecret) {
    return res.status(500).json({ error: "INTERNAL_JOB_SECRET_NOT_CONFIGURED" });
  }

  const providedSecret = readInternalSecret(req);
  if (!providedSecret || providedSecret !== configuredSecret) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const parsedBody = syncPayloadSchema.safeParse(req.body || {});
  if (!parsedBody.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const result = await syncMelhorEnvioTrackingJob({
    limit: parsedBody.data.limit
  });
  return res.json({
    ok: true,
    result
  });
});

module.exports = {
  orderTrackingRouter
};
