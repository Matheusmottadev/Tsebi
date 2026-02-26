"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { z } = require("zod");
const { findOrderById } = require("../../server/lib/order-repository");
const { findTrackableOrderByOrderNumberAndEmail, listTrackableOrdersByUserId, listTrackingEventsByOrderId, insertTrackingEvents, updateOrderTrackingState, listTrackableOrdersForSync } = require("../db/queries/order-tracking.queries");
const { updateShipmentTracking, upsertShipmentPending } = require("../db/queries/shipping.queries");
const melhorEnvioProvider = require("./providers/melhorenvio");
const { melhorEnvioApiRequest } = require("./melhorenvio-auth");
const { INTERNAL_TRACKING_STATES, mapMelhorEnvioStatusToInternal } = require("./melhorenvio-status");
const MANUAL_SHIPPING_SCHEMA = z.object({
    trackingCode: z.string().trim().min(3).max(120),
    carrier: z.string().trim().min(2).max(120)
});
const SYNC_CHUNK_SIZE = 20;
const SYNC_RATE_DELAY_MS = 280;
function toIsoOrNull(value) {
    const date = new Date(String(value || "").trim());
    if (Number.isNaN(date.getTime()))
        return null;
    return date.toISOString();
}
function sanitizeText(value, max = 280) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, Number(ms || 0)));
    });
}
function normalizeTrackingEvent(input, fallbackStatus) {
    const rawStatus = sanitizeText(input?.rawStatus || input?.status || "");
    const mapped = mapMelhorEnvioStatusToInternal(rawStatus || fallbackStatus || "");
    const description = sanitizeText(input?.description || input?.message || input?.event || rawStatus || "Atualização de rastreio", 380) ||
        "Atualização de rastreio";
    const location = sanitizeText(input?.location || input?.city || input?.local || input?.where || "", 140);
    const occurredAt = toIsoOrNull(input?.occurredAt || input?.date || input?.createdAt || input?.datetime || input?.at) ||
        new Date().toISOString();
    return {
        status: mapped.status,
        rawStatus: rawStatus || "",
        description,
        location,
        occurredAt
    };
}
function milestoneEventsFromShipmentPayload(payload) {
    const status = sanitizeText(payload?.status || "");
    const events = [];
    const pushMilestone = (dateValue, eventStatus, rawStatus, description) => {
        const occurredAt = toIsoOrNull(dateValue);
        if (!occurredAt)
            return;
        events.push(normalizeTrackingEvent({
            occurredAt,
            status: rawStatus,
            rawStatus,
            description
        }, eventStatus));
    };
    pushMilestone(payload?.created_at, INTERNAL_TRACKING_STATES.ORDER_PLACED, "created", "Pedido confirmado");
    pushMilestone(payload?.paid_at, INTERNAL_TRACKING_STATES.PROCESSING, "paid", "Frete confirmado");
    pushMilestone(payload?.generated_at, INTERNAL_TRACKING_STATES.PROCESSING, "generated", "Etiqueta gerada");
    pushMilestone(payload?.posted_at, INTERNAL_TRACKING_STATES.SHIPPED, "posted", "Objeto postado");
    pushMilestone(payload?.delivered_at, INTERNAL_TRACKING_STATES.DELIVERED, "delivered", "Objeto entregue");
    pushMilestone(payload?.canceled_at, INTERNAL_TRACKING_STATES.EXCEPTION, "canceled", "Envio cancelado");
    pushMilestone(payload?.expired_at, INTERNAL_TRACKING_STATES.EXCEPTION, "expired", "Etiqueta expirada");
    if (Array.isArray(payload?.events)) {
        payload.events.forEach((entry) => {
            events.push(normalizeTrackingEvent(entry, status));
        });
    }
    return events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}
function normalizeTrackingResult(order, trackingData) {
    const payload = trackingData?.rawPayload?.payload || trackingData?.rawPayload || trackingData || {};
    const rawStatus = sanitizeText(payload?.status || trackingData?.status || "");
    const mapped = mapMelhorEnvioStatusToInternal(rawStatus);
    const trackingCode = sanitizeText(payload?.tracking ||
        payload?.melhorenvio_tracking ||
        trackingData?.trackingCode ||
        order?.trackingCode ||
        "") || "";
    const events = milestoneEventsFromShipmentPayload(payload);
    if (events.length === 0) {
        events.push(normalizeTrackingEvent({
            status: rawStatus || normalizedStatusFromTracking(trackingData),
            rawStatus: rawStatus || normalizedStatusFromTracking(trackingData),
            description: rawStatus ? `Status recebido: ${rawStatus}` : "Atualização de rastreio",
            occurredAt: new Date().toISOString()
        }, mapped.status));
    }
    const shippedAt = toIsoOrNull(payload?.posted_at) ||
        events.find((event) => event.status === INTERNAL_TRACKING_STATES.SHIPPED)?.occurredAt ||
        null;
    const deliveredAt = toIsoOrNull(payload?.delivered_at) ||
        events.find((event) => event.status === INTERNAL_TRACKING_STATES.DELIVERED)?.occurredAt ||
        null;
    const hasPostedAt = Boolean(toIsoOrNull(payload?.posted_at)) ||
        events.some((event) => event.status === INTERNAL_TRACKING_STATES.SHIPPED);
    const effectiveStatus = deliveredAt
        ? INTERNAL_TRACKING_STATES.DELIVERED
        : mapped.status === INTERNAL_TRACKING_STATES.PROCESSING && hasPostedAt
            ? INTERNAL_TRACKING_STATES.SHIPPED
            : mapped.status;
    return {
        currentStatus: effectiveStatus,
        rawStatus,
        fallbackApplied: mapped.fallbackApplied,
        trackingCode,
        carrier: sanitizeText(order?.carrier || order?.shippingSelectedCarrierName || "", 120),
        shippedAt,
        deliveredAt,
        events,
        rawPayload: payload || {}
    };
}
function normalizedStatusFromTracking(trackingData) {
    return sanitizeText(trackingData?.status || trackingData?.current_status || "");
}
function toPublicOrderTracking(order, events = []) {
    return {
        id: order.id,
        orderNumber: order.orderNumber || "",
        email: order.email || "",
        purchaseDate: order.createdAt || null,
        currentStatus: order.currentStatus || INTERNAL_TRACKING_STATES.ORDER_PLACED,
        carrier: order.carrier || "",
        trackingCode: order.trackingCode || "",
        shippedAt: order.shippedAt || null,
        deliveredAt: order.deliveredAt || null,
        lastTrackingUpdate: order.lastTrackingUpdate || null,
        items: Array.isArray(order.items) ? order.items : [],
        trackingEvents: Array.isArray(events) ? events : []
    };
}
async function syncSingleTrackingByCode(trackingCode) {
    const tracking = sanitizeText(trackingCode || "", 120);
    if (!tracking)
        return null;
    return melhorEnvioProvider.track({ trackingCode: tracking });
}
async function fetchBatchTracking(codes = []) {
    const list = Array.from(new Set((Array.isArray(codes) ? codes : [])
        .map((code) => sanitizeText(code, 120))
        .filter(Boolean)));
    if (!list.length)
        return new Map();
    try {
        const data = await melhorEnvioApiRequest("/me/shipment/tracking", {
            method: "POST",
            body: {
                orders: list
            }
        });
        const entries = Array.isArray(data) ? data : Object.values(data || {});
        const byCode = new Map();
        entries.forEach((entry) => {
            const candidate = sanitizeText(entry?.tracking || entry?.melhorenvio_tracking || "", 120);
            if (!candidate)
                return;
            byCode.set(candidate.toUpperCase(), {
                trackingCode: candidate,
                status: sanitizeText(entry?.status || "", 120),
                events: Array.isArray(entry?.events) ? entry.events : [],
                rawPayload: {
                    source: "shipment_tracking_batch",
                    payload: entry
                }
            });
        });
        return byCode;
    }
    catch {
        return new Map();
    }
}
async function applyTrackingUpdate(order, trackingResult) {
    const normalized = normalizeTrackingResult(order, trackingResult);
    if (normalized.events.length > 0) {
        await insertTrackingEvents(order.id, normalized.events);
    }
    const patch = {
        currentStatus: normalized.currentStatus || INTERNAL_TRACKING_STATES.IN_TRANSIT,
        trackingCode: normalized.trackingCode || order.trackingCode || "",
        carrier: normalized.carrier || order.carrier || "",
        shippedAt: order.shippedAt || normalized.shippedAt || null,
        deliveredAt: normalized.currentStatus === INTERNAL_TRACKING_STATES.DELIVERED
            ? normalized.deliveredAt || new Date().toISOString()
            : order.deliveredAt || null,
        lastTrackingUpdate: new Date().toISOString()
    };
    const updatedOrder = await updateOrderTrackingState(order.id, patch);
    await updateShipmentTracking({
        orderId: order.id,
        trackingCode: patch.trackingCode,
        status: patch.currentStatus,
        rawPayload: normalized.rawPayload
    }).catch(() => { });
    return updatedOrder || order;
}
async function syncOrderTracking(order) {
    const trackingCode = sanitizeText(order?.trackingCode || "", 120);
    if (!trackingCode)
        return order;
    const result = await syncSingleTrackingByCode(trackingCode);
    return applyTrackingUpdate(order, result);
}
async function getTrackedOrderByLookup(orderNumber, email) {
    const order = await findTrackableOrderByOrderNumberAndEmail(orderNumber, email);
    if (!order)
        return null;
    const shouldSync = Boolean(order.trackingCode) &&
        (!order.lastTrackingUpdate ||
            Date.now() - new Date(order.lastTrackingUpdate).getTime() > 30 * 60 * 1000);
    const synced = shouldSync ? await syncOrderTracking(order).catch(() => order) : order;
    const events = await listTrackingEventsByOrderId(synced.id, "ASC");
    return toPublicOrderTracking(synced, events);
}
async function listAccountTrackingOrders(userId) {
    const orders = await listTrackableOrdersByUserId(userId, 120);
    return orders.map((order) => toPublicOrderTracking(order, []));
}
async function attachManualShippingToOrder(orderId, payload) {
    const parsed = MANUAL_SHIPPING_SCHEMA.safeParse(payload || {});
    if (!parsed.success) {
        const error = new Error("INVALID_INPUT");
        error.code = "INVALID_INPUT";
        error.status = 400;
        throw error;
    }
    const order = await findOrderById(orderId);
    if (!order) {
        const error = new Error("ORDER_NOT_FOUND");
        error.code = "ORDER_NOT_FOUND";
        error.status = 404;
        throw error;
    }
    const nowIso = new Date().toISOString();
    const trackingCode = sanitizeText(parsed.data.trackingCode, 120);
    const carrier = sanitizeText(parsed.data.carrier, 120);
    const patch = {
        trackingCode,
        carrier,
        currentStatus: String(order.currentStatus || "").toUpperCase() === INTERNAL_TRACKING_STATES.DELIVERED
            ? INTERNAL_TRACKING_STATES.DELIVERED
            : INTERNAL_TRACKING_STATES.SHIPPED,
        shippedAt: order.shippedAt || nowIso,
        lastTrackingUpdate: nowIso
    };
    const updated = await updateOrderTrackingState(order.id, patch);
    await upsertShipmentPending({
        orderId: order.id,
        provider: String(order.shippingSelectedProvider || "melhorenvio").toLowerCase(),
        serviceCode: String(order.shippingSelectedServiceCode || "manual").trim() || "manual",
        priceCents: Number(order.shippingPriceCents || order.shippingAmount || 0),
        deadlineDays: order.shippingDeadlineDays,
        rawPayload: {
            source: "manual_admin_attachment"
        }
    }).catch(() => { });
    await updateShipmentTracking({
        orderId: order.id,
        trackingCode,
        status: patch.currentStatus,
        rawPayload: {
            source: "manual_admin_attachment",
            carrier
        }
    }).catch(() => { });
    await insertTrackingEvents(order.id, [
        {
            status: patch.currentStatus,
            rawStatus: "MANUAL_ATTACHMENT",
            description: "Código de rastreio vinculado manualmente",
            location: "",
            occurredAt: nowIso
        }
    ]);
    const current = updated || order;
    const events = await listTrackingEventsByOrderId(order.id, "ASC");
    return toPublicOrderTracking(current, events);
}
async function syncMelhorEnvioTrackingJob({ limit = 120 } = {}) {
    const orders = await listTrackableOrdersForSync(limit);
    if (!orders.length) {
        return {
            processed: 0,
            updated: 0,
            errors: 0
        };
    }
    let updatedCount = 0;
    let errorCount = 0;
    const chunks = [];
    for (let index = 0; index < orders.length; index += SYNC_CHUNK_SIZE) {
        chunks.push(orders.slice(index, index + SYNC_CHUNK_SIZE));
    }
    for (const chunk of chunks) {
        const codeToOrder = new Map();
        chunk.forEach((order) => {
            const key = sanitizeText(order.trackingCode || "", 120).toUpperCase();
            if (key)
                codeToOrder.set(key, order);
        });
        const batch = await fetchBatchTracking(Array.from(codeToOrder.keys()));
        for (const [key, order] of codeToOrder.entries()) {
            try {
                const batchResult = batch.get(key) || null;
                const result = batchResult || (await syncSingleTrackingByCode(order.trackingCode));
                await applyTrackingUpdate(order, result);
                updatedCount += 1;
            }
            catch {
                errorCount += 1;
            }
        }
        await sleep(SYNC_RATE_DELAY_MS);
    }
    return {
        processed: orders.length,
        updated: updatedCount,
        errors: errorCount
    };
}
module.exports = {
    INTERNAL_TRACKING_STATES,
    getTrackedOrderByLookup,
    listAccountTrackingOrders,
    attachManualShippingToOrder,
    syncMelhorEnvioTrackingJob
};
//# sourceMappingURL=order-tracking.service.js.map