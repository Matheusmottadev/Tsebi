"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const INTERNAL_TRACKING_STATES = Object.freeze({
    ORDER_PLACED: "ORDER_PLACED",
    PROCESSING: "PROCESSING",
    SHIPPED: "SHIPPED",
    IN_TRANSIT: "IN_TRANSIT",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    EXCEPTION: "EXCEPTION"
});
function normalizeStatusText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();
}
function mapMelhorEnvioStatusToInternal(rawStatus) {
    const normalized = normalizeStatusText(rawStatus);
    if (!normalized) {
        return {
            status: INTERNAL_TRACKING_STATES.IN_TRANSIT,
            fallbackApplied: true
        };
    }
    if (normalized.includes("DELIVERED") ||
        normalized.includes("ENTREGUE")) {
        return { status: INTERNAL_TRACKING_STATES.DELIVERED, fallbackApplied: false };
    }
    if (normalized.includes("OUT_FOR_DELIVERY") ||
        normalized.includes("SAIU PARA ENTREGA") ||
        normalized.includes("ROTA DE ENTREGA") ||
        normalized.includes("EM ROTA")) {
        return { status: INTERNAL_TRACKING_STATES.OUT_FOR_DELIVERY, fallbackApplied: false };
    }
    if (normalized.includes("POSTED") ||
        normalized.includes("POSTADO") ||
        normalized.includes("SHIPPED") ||
        normalized.includes("ENVIADO")) {
        return { status: INTERNAL_TRACKING_STATES.SHIPPED, fallbackApplied: false };
    }
    if (normalized.includes("TRANSIT") ||
        normalized.includes("TRANSPORTE") ||
        normalized.includes("TRIAGEM") ||
        normalized.includes("ROTEIRIZACAO")) {
        return { status: INTERNAL_TRACKING_STATES.IN_TRANSIT, fallbackApplied: false };
    }
    if (normalized.includes("PENDENTE") ||
        normalized.includes("AGUARDANDO") ||
        normalized.includes("PAGO") ||
        normalized.includes("GENERATED") ||
        normalized.includes("GERADA")) {
        return { status: INTERNAL_TRACKING_STATES.PROCESSING, fallbackApplied: false };
    }
    if (normalized.includes("EXCEPTION") ||
        normalized.includes("PROBLEMA") ||
        normalized.includes("ERRO") ||
        normalized.includes("FALHA") ||
        normalized.includes("CANCEL") ||
        normalized.includes("EXPIRED") ||
        normalized.includes("DEVOL")) {
        return { status: INTERNAL_TRACKING_STATES.EXCEPTION, fallbackApplied: false };
    }
    return {
        status: INTERNAL_TRACKING_STATES.IN_TRANSIT,
        fallbackApplied: true
    };
}
module.exports = {
    INTERNAL_TRACKING_STATES,
    normalizeStatusText,
    mapMelhorEnvioStatusToInternal
};
//# sourceMappingURL=melhorenvio-status.js.map