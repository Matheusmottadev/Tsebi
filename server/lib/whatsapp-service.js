const {
  normalizePhone,
  findContactByPhone,
  listVipContactsRaw,
  insertSendLog
} = require("./whatsapp-repository");

const DEFAULT_API_VERSION = "v18.0";

function getApiBaseUrl() {
  const version = String(process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION).trim() || DEFAULT_API_VERSION;
  return `https://graph.facebook.com/${version}`;
}

function getPhoneNumberId() {
  return String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
}

function getToken() {
  return String(process.env.WHATSAPP_TOKEN || "").trim();
}

function isConfigured() {
  return Boolean(getPhoneNumberId() && getToken());
}

function normalizeRecipientPhone(phone) {
  return normalizePhone(phone);
}

async function canSendFreeMessage(phone) {
  const normalized = normalizeRecipientPhone(phone);
  if (!normalized) return false;
  const contact = await findContactByPhone(normalized);
  if (!contact?.windowExpiresAt) return false;
  const expiresAt = new Date(contact.windowExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function whatsappApiRequest(path, payload) {
  if (!isConfigured()) {
    return { ok: false, error: "WHATSAPP_NOT_CONFIGURED" };
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify(payload || {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: data?.error?.message || `HTTP_${response.status}`,
      status: response.status,
      payload: data
    };
  }

  return { ok: true, data };
}

async function sendReply(phone, message) {
  const normalized = normalizeRecipientPhone(phone);
  if (!normalized) return { ok: false, error: "INVALID_PHONE" };

  const allowed = await canSendFreeMessage(normalized);
  if (!allowed) {
    return { ok: false, error: "OUTSIDE_FREE_WINDOW" };
  }

  const payload = {
    messaging_product: "whatsapp",
    to: normalized,
    type: "text",
    text: { body: String(message || "").trim() }
  };

  const result = await whatsappApiRequest(`/` + getPhoneNumberId() + `/messages`, payload);
  if (result.ok) {
    insertSendLog({
      type: "support",
      templateName: "",
      quantity: 1,
      costEstimateCents: 0,
      payload: { phone: normalized, message }
    }).catch(() => {});
  }
  return result;
}

function buildTemplateComponents(variables) {
  if (!Array.isArray(variables) || variables.length === 0) return [];
  return [
    {
      type: "body",
      parameters: variables.map((value) => ({ type: "text", text: String(value ?? "") }))
    }
  ];
}

async function sendTemplate(phone, templateName, variables = [], languageCode = "pt_BR") {
  const normalized = normalizeRecipientPhone(phone);
  if (!normalized) return { ok: false, error: "INVALID_PHONE" };
  if (!templateName) return { ok: false, error: "TEMPLATE_REQUIRED" };

  const payload = {
    messaging_product: "whatsapp",
    to: normalized,
    type: "template",
    template: {
      name: String(templateName),
      language: { code: String(languageCode || "pt_BR") },
      components: buildTemplateComponents(variables)
    }
  };

  const result = await whatsappApiRequest(`/` + getPhoneNumberId() + `/messages`, payload);
  if (result.ok) {
    insertSendLog({
      type: "template",
      templateName: String(templateName),
      quantity: 1,
      costEstimateCents: estimateTemplateCost(1),
      payload: { phone: normalized, variables }
    }).catch(() => {});
  }
  return result;
}

function extractOrderPhone(order) {
  const shippingPhone = String(order?.shipping?.phone || "").trim();
  if (shippingPhone) return shippingPhone;
  return "";
}

async function sendOrderConfirmedWhatsApp(order) {
  const phone = extractOrderPhone(order);
  if (!phone) return { ok: false, skipped: "NO_PHONE" };

  const freeAllowed = await canSendFreeMessage(phone);
  const message = "Seu pedido foi confirmado! Em breve você receberá atualizações. Obrigado por escolher a Tsebi.";
  if (freeAllowed) {
    return sendReply(phone, message);
  }

  return sendTemplate(phone, "order_confirmed", []);
}

async function sendOrderShippedWhatsApp(order, shipment) {
  const phone = extractOrderPhone(order);
  if (!phone) return { ok: false, skipped: "NO_PHONE" };

  const trackingCode = String(
    shipment?.trackingCode || shipment?.tracking_code || order?.trackingCode || order?.tracking_code || ""
  ).trim();
  const freeAllowed = await canSendFreeMessage(phone);
  const message = trackingCode
    ? `Seu pedido foi enviado! Código de rastreio: ${trackingCode}`
    : "Seu pedido foi enviado! Em breve você receberá atualizações.";

  if (freeAllowed) {
    return sendReply(phone, message);
  }

  return sendTemplate(phone, "order_shipped", trackingCode ? [trackingCode] : []);
}

function estimateTemplateCost(quantity) {
  const perMessage = Math.max(0, Number(process.env.WHATSAPP_COST_PER_MESSAGE_CENTS || 0));
  return Math.max(0, Number(quantity || 0)) * perMessage;
}

async function sendNewCollectionToVIP(collectionName, message) {
  const templateName = String(process.env.WHATSAPP_VIP_TEMPLATE || "vip_new_collection").trim() || "vip_new_collection";
  const vipContacts = await listVipContactsRaw({ limit: 5000 });
  const quantity = vipContacts.length;
  const costEstimateCents = estimateTemplateCost(quantity);

  const batchSize = Math.max(50, Math.min(200, Number(process.env.WHATSAPP_VIP_BATCH_SIZE || 100)));
  const results = [];

  for (let i = 0; i < vipContacts.length; i += batchSize) {
    const chunk = vipContacts.slice(i, i + batchSize);
    for (const contact of chunk) {
      const variables = [
        String(collectionName || "").trim(),
        String(message || "").trim()
      ].filter(Boolean);
      const result = await sendTemplate(contact.phone, templateName, variables);
      results.push({ phone: contact.phone, ok: result.ok, error: result.error || null });
    }
  }

  await insertSendLog({
    type: "vip_broadcast",
    templateName,
    quantity,
    costEstimateCents,
    payload: {
      collectionName: String(collectionName || "").trim(),
      message: String(message || "").trim(),
      results
    }
  });

  return { ok: true, quantity, costEstimateCents, results };
}

module.exports = {
  isConfigured,
  canSendFreeMessage,
  sendReply,
  sendTemplate,
  sendOrderConfirmedWhatsApp,
  sendOrderShippedWhatsApp,
  sendNewCollectionToVIP,
  estimateTemplateCost
};
