const {
  sendOrderConfirmedEmail,
  sendPaymentApprovedEmail,
  sendOrderShippedEmail,
  sendOrderOutForDeliveryEmail,
  sendOrderDeliveredEmail
} = require("./email-service");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getOrderRecipientEmail(order) {
  const shippingEmail = normalizeEmail(order?.shipping?.email || "");
  if (isValidEmail(shippingEmail)) return shippingEmail;

  const userEmail = normalizeEmail(order?.userEmail || "");
  if (isValidEmail(userEmail)) return userEmail;

  return "";
}

function normalizeShipmentStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function mapShipmentStatusToMilestone(status) {
  const normalized = normalizeShipmentStatus(status);
  if (!normalized) return "";

  if (
    normalized.includes("ENTREGUE") ||
    normalized.includes("DELIVERED") ||
    normalized === "DELIVERED"
  ) {
    return "delivered";
  }

  if (
    normalized.includes("SAIU PARA ENTREGA") ||
    normalized.includes("OUT_FOR_DELIVERY") ||
    normalized.includes("OUT FOR DELIVERY") ||
    normalized.includes("EM ROTA DE ENTREGA") ||
    normalized.includes("ROTA DE ENTREGA")
  ) {
    return "out_for_delivery";
  }

  return "";
}

async function safeNotify(kind, handler, context = {}) {
  try {
    await handler();
    return { ok: true, kind };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ORDER_EMAIL_FAILED]", {
      kind,
      orderId: context?.orderId || null,
      message: error?.message || String(error || "UNKNOWN_ERROR")
    });
    return { ok: false, kind, error: error?.message || "ORDER_EMAIL_FAILED" };
  }
}

async function notifyOrderConfirmed(order) {
  const to = getOrderRecipientEmail(order);
  if (!to) return { ok: false, skipped: "NO_EMAIL_RECIPIENT" };

  return safeNotify(
    "order_confirmed",
    async () => {
      await sendOrderConfirmedEmail({ to, order });
    },
    { orderId: order?.id }
  );
}

async function notifyPaymentApproved(order) {
  const to = getOrderRecipientEmail(order);
  if (!to) return { ok: false, skipped: "NO_EMAIL_RECIPIENT" };

  return safeNotify(
    "payment_approved",
    async () => {
      await sendPaymentApprovedEmail({ to, order });
    },
    { orderId: order?.id }
  );
}

async function notifyOrderShipped(order, shipment) {
  const to = getOrderRecipientEmail(order);
  if (!to) return { ok: false, skipped: "NO_EMAIL_RECIPIENT" };

  return safeNotify(
    "order_shipped",
    async () => {
      await sendOrderShippedEmail({ to, order, shipment });
    },
    { orderId: order?.id }
  );
}

async function notifyShipmentMilestoneTransition({ order, previousStatus, nextStatus, shipment }) {
  const previousMilestone = mapShipmentStatusToMilestone(previousStatus);
  const nextMilestone = mapShipmentStatusToMilestone(nextStatus);
  if (!nextMilestone || previousMilestone === nextMilestone) {
    return { ok: false, skipped: "NO_NEW_MILESTONE" };
  }

  const to = getOrderRecipientEmail(order);
  if (!to) return { ok: false, skipped: "NO_EMAIL_RECIPIENT" };

  if (nextMilestone === "out_for_delivery") {
    return safeNotify(
      "order_out_for_delivery",
      async () => {
        await sendOrderOutForDeliveryEmail({ to, order, shipment });
      },
      { orderId: order?.id }
    );
  }

  if (nextMilestone === "delivered") {
    return safeNotify(
      "order_delivered",
      async () => {
        await sendOrderDeliveredEmail({ to, order, shipment });
      },
      { orderId: order?.id }
    );
  }

  return { ok: false, skipped: "MILESTONE_NOT_SUPPORTED" };
}

module.exports = {
  notifyOrderConfirmed,
  notifyPaymentApproved,
  notifyOrderShipped,
  notifyShipmentMilestoneTransition,
  mapShipmentStatusToMilestone
};
