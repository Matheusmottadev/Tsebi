const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { findOrderById } = require("../../server/lib/order-repository");
const { requireAdmin, requireAdminCsrfForMutations } = require("../../server/middlewares/requireAdmin");
const {
  notifyOrderShipped,
  notifyShipmentMilestoneTransition
} = require("../../server/lib/order-notification-service");
const { buyLabelForOrder, getLabelForOrder, trackOrderShipment } = require("../shipping/shipping.service");
const { attachManualShippingToOrder } = require("../shipping/order-tracking.service");

const adminShippingRouter = express.Router();

const adminShippingRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" }
});

const orderIdSchema = z.object({
  id: z.string().uuid()
});
const manualShippingSchema = z.object({
  tracking_code: z.string().trim().min(3).max(120),
  carrier: z.string().trim().min(2).max(120)
});

function mapShippingError(error) {
  const code = String(error?.code || error?.message || "ADMIN_SHIPPING_REQUEST_FAILED");
  const status = Number(error?.status || 0) || 400;
  const safeStatus = Math.max(400, Math.min(500, status));
  let detail = null;

  if (error?.details != null) {
    detail = error.details;
  } else if (error?.payload != null) {
    detail = error.payload;
  } else if (error?.message) {
    detail = String(error.message);
  }

  return { status: safeStatus, code, detail };
}

async function loadOrderOr404(orderId) {
  const order = await findOrderById(orderId);
  if (!order) {
    const error = new Error("ORDER_NOT_FOUND");
    error.code = "ORDER_NOT_FOUND";
    error.status = 404;
    throw error;
  }
  return order;
}

adminShippingRouter.use(adminShippingRateLimit);
adminShippingRouter.use(requireAdmin);
adminShippingRouter.use(requireAdminCsrfForMutations);

adminShippingRouter.post("/orders/:id/shipping/buy-label", async (req, res) => {
  const parsedParams = orderIdSchema.safeParse(req.params || {});
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: "INVALID_ID" });
  }

  try {
    const order = await loadOrderOr404(parsedParams.data.id);
    const shipment = await buyLabelForOrder(order);
    const previousStatus = String(shipment?.previousStatus || "").trim().toUpperCase();
    const currentStatus = String(shipment?.status || "").trim().toUpperCase();
    if (currentStatus === "ETIQUETA_COMPRADA" && previousStatus !== "ETIQUETA_COMPRADA") {
      notifyOrderShipped(order, shipment).catch(() => {});
    }
    return res.json({
      ok: true,
      data: {
        orderId: order.id,
        shipment
      }
    });
  } catch (error) {
    const mapped = mapShippingError(error);
    return res.status(mapped.status).json({ ok: false, error: mapped.code, detail: mapped.detail });
  }
});

adminShippingRouter.get("/orders/:id/shipping/label", async (req, res) => {
  const parsedParams = orderIdSchema.safeParse(req.params || {});
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: "INVALID_ID" });
  }

  try {
    const order = await loadOrderOr404(parsedParams.data.id);
    const data = await getLabelForOrder(order);
    return res.json({ ok: true, data });
  } catch (error) {
    const mapped = mapShippingError(error);
    return res.status(mapped.status).json({ ok: false, error: mapped.code, detail: mapped.detail });
  }
});

adminShippingRouter.get("/orders/:id/shipping/track", async (req, res) => {
  const parsedParams = orderIdSchema.safeParse(req.params || {});
  if (!parsedParams.success) {
    return res.status(400).json({ ok: false, error: "INVALID_ID" });
  }

  try {
    const order = await loadOrderOr404(parsedParams.data.id);
    const data = await trackOrderShipment(order);
    notifyShipmentMilestoneTransition({
      order,
      previousStatus: data?.previousStatus || "",
      nextStatus: data?.shipment?.status || data?.tracking?.status || "",
      shipment: data?.shipment || null
    }).catch(() => {});
    return res.json({ ok: true, data });
  } catch (error) {
    const mapped = mapShippingError(error);
    return res.status(mapped.status).json({ ok: false, error: mapped.code, detail: mapped.detail });
  }
});

adminShippingRouter.post("/orders/:id/shipping", async (req, res) => {
  const parsedParams = orderIdSchema.safeParse(req.params || {});
  const parsedBody = manualShippingSchema.safeParse(req.body || {});
  if (!parsedParams.success || !parsedBody.success) {
    return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
  }

  try {
    const tracked = await attachManualShippingToOrder(parsedParams.data.id, {
      trackingCode: parsedBody.data.tracking_code,
      carrier: parsedBody.data.carrier
    });

    return res.json({
      ok: true,
      data: {
        orderId: parsedParams.data.id,
        order: tracked
      }
    });
  } catch (error) {
    const mapped = mapShippingError(error);
    return res.status(mapped.status).json({ ok: false, error: mapped.code, detail: mapped.detail });
  }
});

module.exports = {
  adminShippingRouter
};
