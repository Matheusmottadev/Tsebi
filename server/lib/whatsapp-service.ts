export {};
const {
  normalizePhone,
  findContactByPhone,
  listVipContactsRaw,
  insertSendLog
} = require("./whatsapp-repository");

const DEFAULT_API_VERSION = "v18.0";
type JsonRecord = Record<string, unknown>;
type ApiResult =
  | { ok: true; data: JsonRecord }
  | { ok: false; error: string; status?: number; payload?: unknown };

function getApiBaseUrl(): string {
  const version = String(process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION).trim() || DEFAULT_API_VERSION;
  return `https://graph.facebook.com/${version}`;
}

function getPhoneNumberId(): string {
  return String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
}

function getToken(): string {
  return String(process.env.WHATSAPP_TOKEN || "").trim();
}

function isConfigured(): boolean {
  return Boolean(getPhoneNumberId() && getToken());
}

function normalizeRecipientPhone(phone: string): string {
  return normalizePhone(phone);
}

async function canSendFreeMessage(phone: string): Promise<boolean> {
  const normalized = normalizeRecipientPhone(phone);
  if (!normalized) return false;
  const contact = await findContactByPhone(normalized);
  if (!contact?.windowExpiresAt) return false;
  const expiresAt = new Date(contact.windowExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function whatsappApiRequest(path: string, payload: JsonRecord): Promise<ApiResult> {
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

  const data = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const apiError = (data.error || {}) as { message?: unknown };
    return {
      ok: false,
      error: String(apiError.message || `HTTP_${response.status}`),
      status: response.status,
      payload: data
    };
  }

  return { ok: true, data };
}

async function sendReply(phone: string, message: string): Promise<ApiResult> {
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

function buildTemplateComponents(variables: string[]): Array<{ type: string; parameters: Array<{ type: string; text: string }> }> {
  if (!Array.isArray(variables) || variables.length === 0) return [];
  return [
    {
      type: "body",
      parameters: variables.map((value) => ({ type: "text", text: String(value ?? "") }))
    }
  ];
}

async function sendTemplate(
  phone: string,
  templateName: string,
  variables: string[] = [],
  languageCode = "pt_BR"
): Promise<ApiResult> {
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

function extractOrderPhone(order: { shipping?: { phone?: string } } | null | undefined): string {
  const shippingPhone = String(order?.shipping?.phone || "").trim();
  if (shippingPhone) return shippingPhone;
  return "";
}

async function sendOrderConfirmedWhatsApp(order: { shipping?: { phone?: string } } | null | undefined): Promise<ApiResult | { ok: false; skipped: string }> {
  const phone = extractOrderPhone(order);
  if (!phone) return { ok: false, skipped: "NO_PHONE" };

  const freeAllowed = await canSendFreeMessage(phone);
  const message = "Seu pedido foi confirmado! Em breve você receberá atualizações. Obrigado por escolher a Tsebi.";
  if (freeAllowed) {
    return sendReply(phone, message);
  }

  return sendTemplate(phone, "order_confirmed", []);
}

async function sendOrderShippedWhatsApp(
  order: { shipping?: { phone?: string }; trackingCode?: string; tracking_code?: string } | null | undefined,
  shipment: { trackingCode?: string; tracking_code?: string } | null | undefined
): Promise<ApiResult | { ok: false; skipped: string }> {
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

function estimateTemplateCost(quantity: number): number {
  const perMessage = Math.max(0, Number(process.env.WHATSAPP_COST_PER_MESSAGE_CENTS || 0));
  return Math.max(0, Number(quantity || 0)) * perMessage;
}

async function sendNewCollectionToVIP(collectionName: string, message: string): Promise<{
  ok: true;
  quantity: number;
  costEstimateCents: number;
  results: Array<{ phone: string; ok: boolean; error: string | null }>;
}> {
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
      const error = result.ok ? null : String((result as { error?: unknown }).error || "UNKNOWN_ERROR");
      results.push({ phone: contact.phone, ok: result.ok, error });
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

