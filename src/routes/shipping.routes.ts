export {};
const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { requireAuth } = require("../../server/middlewares/requireAuth");
const { findOrderById } = require("../../server/lib/order-repository");
const { quoteShipping, selectShippingForOrder } = require("../shipping/shipping.service");

const shippingRouter = express.Router();

const shippingQuoteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" }
});

const shippingQuoteSchema = z.object({
  orderId: z.string().uuid().optional(),
  destinationZip: z
    .string()
    .transform((value: any) => String(value || "").replace(/\D/g, "").slice(0, 8))
    .refine((value: any) => /^\d{8}$/.test(value), { message: "INVALID_DESTINATION_ZIP" })
});

const selectShippingSchema = z.object({
  quoteId: z.string().uuid(),
  destinationZip: z
    .string()
    .optional()
    .default("")
    .transform((value: any) => String(value || "").replace(/\D/g, "").slice(0, 8))
});

function mapShippingError(error: any) {
  const code = String(error?.code || error?.message || "SHIPPING_REQUEST_FAILED");
  const status = Number(error?.status || 0) || 400;
  return { status: Math.max(400, Math.min(500, status)), code };
}

shippingRouter.post("/shipping/quote", shippingQuoteRateLimit, async (req: any, res: any) => {
  const parsed = shippingQuoteSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  const userId = req.session?.userId || null;
  const destinationZip = parsed.data.destinationZip;
  const orderId = parsed.data.orderId || null;

  try {
    let itemsCount = 1;
    if (orderId) {
      const order = await findOrderById(orderId);
      if (!order || String(order.userId || "") !== String(userId || "")) {
        return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
      }
      itemsCount = Math.max(
        1,
        (Array.isArray(order.items) ? order.items : []).reduce(
          (sum: any, item: any) => sum + Math.max(1, Number(item?.qty || 1)),
          0
        )
      );
    }

    const quotes = await quoteShipping({
      orderId,
      userId,
      destinationZip,
      itemsCount
    });

    return res.json({
      ok: true,
      data: {
        destinationZip,
        quotes
      }
    });
  } catch (error: any) {
    const mapped = mapShippingError(error);
    return res.status(mapped.status).json({ ok: false, error: mapped.code });
  }
});

shippingRouter.post("/orders/:id/shipping/select", requireAuth, async (req: any, res: any) => {
  const parsed = selectShippingSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  try {
    const selected = await selectShippingForOrder({
      orderId: String(req.params.id || "").trim(),
      userId: req.session.userId,
      quoteId: parsed.data.quoteId,
      destinationZip: parsed.data.destinationZip
    });

    return res.json({
      ok: true,
      data: selected
    });
  } catch (error: any) {
    const mapped = mapShippingError(error);
    return res.status(mapped.status).json({ ok: false, error: mapped.code });
  }
});

module.exports = {
  shippingRouter
};
