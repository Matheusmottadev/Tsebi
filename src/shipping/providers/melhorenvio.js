const crypto = require("node:crypto");
const { melhorEnvioApiRequest } = require("../melhorenvio-auth");

function normalizeZip(zip) {
  return String(zip || "").replace(/\D/g, "").slice(0, 8);
}

function getFromZip() {
  return normalizeZip(process.env.SHIP_FROM_ZIP || "");
}

function readEnv(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function readBooleanEnv(name, fallback) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function mapCalculateResponse(item) {
  const serviceCode =
    String(item?.id || item?.service || item?.service_id || item?.name || "")
      .trim()
      .toLowerCase() || crypto.randomUUID();
  const serviceName = String(item?.name || item?.service_name || "Servico").trim() || "Servico";
  const priceRaw = toNumber(item?.custom_price ?? item?.price ?? item?.total ?? 0, 0);
  const deadlineRaw = toNumber(item?.custom_delivery_time ?? item?.delivery_time ?? item?.deadline ?? 0, 0);
  const carrierName = String(item?.company?.name || item?.company_name || item?.agency || "Melhor Envio").trim();

  return {
    provider: "melhorenvio",
    serviceCode,
    serviceName,
    priceCents: Math.max(0, Math.round(priceRaw * 100)),
    deadlineDays: deadlineRaw > 0 ? Math.round(deadlineRaw) : null,
    carrierName,
    rawPayload: item || {}
  };
}

function buildQuoteProducts(packages = []) {
  const fallbackWeight = Math.max(0.1, toNumber(process.env.DEFAULT_PACKAGE_WEIGHT_KG || 0.3, 0.3));
  const fallbackLength = Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_LENGTH_CM || 20, 20)));
  const fallbackWidth = Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_WIDTH_CM || 15, 15)));
  const fallbackHeight = Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_HEIGHT_CM || 5, 5)));

  const list = Array.isArray(packages) ? packages : [];
  if (list.length === 0) {
    return [
      {
        id: "pkg-1",
        width: fallbackWidth,
        height: fallbackHeight,
        length: fallbackLength,
        weight: fallbackWeight,
        insurance_value: 0,
        quantity: 1
      }
    ];
  }

  return list.map((entry, index) => ({
    id: `pkg-${index + 1}`,
    width: Math.max(1, Math.round(toNumber(entry?.widthCm, fallbackWidth))),
    height: Math.max(1, Math.round(toNumber(entry?.heightCm, fallbackHeight))),
    length: Math.max(1, Math.round(toNumber(entry?.lengthCm, fallbackLength))),
    weight: Math.max(0.1, toNumber(entry?.weightKg, fallbackWeight)),
    insurance_value: Math.max(0, toNumber(entry?.insuranceValue, 0)),
    quantity: Math.max(1, Math.round(toNumber(entry?.quantity, 1)))
  }));
}

async function melhorEnvioRequest(path, { method = "GET", body } = {}) {
  return melhorEnvioApiRequest(path, {
    method,
    body
  });
}

async function quote({ fromZip, toZip, packages = [] }) {
  const normalizedFrom = normalizeZip(fromZip || getFromZip());
  const normalizedTo = normalizeZip(toZip);
  if (!/^\d{8}$/.test(normalizedFrom) || !/^\d{8}$/.test(normalizedTo)) {
    const error = new Error("INVALID_ZIP_FOR_QUOTE");
    error.code = "INVALID_ZIP_FOR_QUOTE";
    throw error;
  }

  const payload = {
    from: { postal_code: normalizedFrom },
    to: { postal_code: normalizedTo },
    products: buildQuoteProducts(packages),
    options: {
      receipt: false,
      own_hand: false,
      collect: false
    }
  };

  const result = await melhorEnvioRequest("/me/shipment/calculate", {
    method: "POST",
    body: payload
  });

  const list = Array.isArray(result) ? result : [];
  const normalized = list
    .map(mapCalculateResponse)
    .filter((entry) => entry.priceCents >= 0 && entry.serviceCode && entry.serviceName);

  if (normalized.length === 0) {
    const error = new Error("NO_SHIPPING_OPTIONS_AVAILABLE");
    error.code = "NO_SHIPPING_OPTIONS_AVAILABLE";
    throw error;
  }

  return normalized;
}

function buildProductsForLabel(order) {
  const fallbackWeight = Math.max(0.1, toNumber(process.env.DEFAULT_PACKAGE_WEIGHT_KG || 0.3, 0.3));
  const fallbackLength = Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_LENGTH_CM || 20, 20)));
  const fallbackWidth = Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_WIDTH_CM || 15, 15)));
  const fallbackHeight = Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_HEIGHT_CM || 5, 5)));

  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) {
    return [
      {
        id: "order-item-1",
        name: "Produto Tsebi",
        unitary_value: 1,
        quantity: 1,
        width: fallbackWidth,
        height: fallbackHeight,
        length: fallbackLength,
        weight: fallbackWeight,
        insurance_value: 1
      }
    ];
  }

  return items.map((item, index) => ({
    id: String(item?.id || `item-${index + 1}`),
    name: String(item?.title || item?.name || item?.sku || `item-${index + 1}`).trim().slice(0, 120),
    unitary_value: Math.max(0.01, toNumber(item?.unitAmount, 0) / 100),
    quantity: Math.max(1, Math.round(toNumber(item?.qty, 1))),
    width: fallbackWidth,
    height: fallbackHeight,
    length: fallbackLength,
    weight: fallbackWeight,
    insurance_value: Math.max(0.01, toNumber(item?.unitAmount, 0) / 100)
  }));
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length <= 11) return digits;
  return digits.slice(-11);
}

function normalizeDocument(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 || digits.length === 14) return digits;
  return "";
}

function normalizeCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 ? digits : "";
}

function normalizeCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toAddressLine(street, number) {
  const a = String(street || "").trim();
  const b = String(number || "").trim();
  return [a, b].filter(Boolean).join(", ").slice(0, 200);
}

function toMoney(value) {
  const num = Math.max(0, toNumber(value, 0));
  return Number(num.toFixed(2));
}

function getInsuranceCapForNonCommercial() {
  return Math.max(1, toMoney(readEnv("MELHOR_ENVIO_NON_COMMERCIAL_INSURANCE_CAP", "1000")));
}

function rebalanceProductsInsurance(products, cap) {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) return [];
  const safeCap = Math.max(1, toMoney(cap));

  const total = list.reduce((sum, item) => {
    const qty = Math.max(1, toNumber(item?.quantity, 1));
    const iv = Math.max(0.01, toMoney(item?.insurance_value ?? item?.unitary_value ?? 1));
    return sum + iv * qty;
  }, 0);

  if (total <= safeCap) {
    return list.map((item) => ({
      ...item,
      insurance_value: Math.max(0.01, toMoney(item?.insurance_value ?? item?.unitary_value ?? 1))
    }));
  }

  const factor = safeCap / total;
  return list.map((item) => {
    const base = Math.max(0.01, toMoney(item?.insurance_value ?? item?.unitary_value ?? 1));
    return {
      ...item,
      insurance_value: Math.max(0.01, toMoney(base * factor))
    };
  });
}

function capProductsUnitaryValue(products, cap) {
  const list = Array.isArray(products) ? products : [];
  const safeCap = Math.max(1, toMoney(cap));
  return list.map((item) => ({
    ...item,
    unitary_value: Math.min(Math.max(0.01, toMoney(item?.unitary_value ?? 1)), safeCap)
  }));
}

function buildSenderAddress() {
  const postalCode = normalizeZip(process.env.SHIP_FROM_ZIP || "");
  const rawDocument = normalizeDocument(readEnv("SHIP_FROM_DOCUMENT", ""));
  const responsibleCpf = normalizeCpf(
    readEnv("SHIP_FROM_RESPONSIBLE_CPF", "") || readEnv("SHIP_FROM_CPF", "")
  );
  const cnpjFromDocument = rawDocument.length === 14 ? rawDocument : "";
  const cpfFromDocument = rawDocument.length === 11 ? rawDocument : "";
  const sender = {
    name: normalizeText(readEnv("SHIP_FROM_NAME", "Tsebi")),
    document: cpfFromDocument || responsibleCpf || "",
    phone: normalizePhone(readEnv("SHIP_FROM_PHONE", "11999999999")) || "11999999999",
    email: readEnv("SHIP_FROM_EMAIL", "contato@tsebi.com.br").toLowerCase(),
    address: normalizeText(readEnv("SHIP_FROM_ADDRESS", "Endereco de origem")),
    number: readEnv("SHIP_FROM_NUMBER", "0"),
    complement: normalizeText(readEnv("SHIP_FROM_COMPLEMENT", "")),
    district: normalizeText(readEnv("SHIP_FROM_DISTRICT", "Centro")),
    city: normalizeText(readEnv("SHIP_FROM_CITY", "Sao Paulo")),
    state_abbr: readEnv("SHIP_FROM_STATE", "SP").toUpperCase().slice(0, 2),
    postal_code: postalCode,
    country_id: "BR"
  };

  const explicitCnpj = normalizeCnpj(readEnv("SHIP_FROM_CNPJ", ""));
  const companyDocument = explicitCnpj || cnpjFromDocument;
  if (companyDocument) {
    sender.company_document = companyDocument;
  }

  if (companyDocument && !sender.document) {
    const error = new Error("SHIP_FROM_RESPONSIBLE_CPF_REQUIRED");
    error.code = "SHIP_FROM_RESPONSIBLE_CPF_REQUIRED";
    error.status = 500;
    error.details = {
      message:
        "Para remetente com CNPJ no Melhor Envio, configure SHIP_FROM_RESPONSIBLE_CPF com um CPF valido.",
      env: ["SHIP_FROM_DOCUMENT", "SHIP_FROM_CNPJ", "SHIP_FROM_RESPONSIBLE_CPF"]
    };
    throw error;
  }

  return sender;
}

function buildRecipientAddress(order) {
  const shipping = order?.shipping || {};
  const toZip = normalizeZip(order?.shippingDestinationZip || shipping?.cep || "");
  const fullName = normalizeText(String(shipping?.fullName || order?.userName || "Cliente Tsebi")).slice(0, 120);
  const street = normalizeText(String(shipping?.street || ""));
  const number = String(shipping?.number || "").trim();
  const district = normalizeText(String(shipping?.district || ""));
  const city = normalizeText(String(shipping?.city || ""));
  const state = String(shipping?.state || "").trim().toUpperCase().slice(0, 2);
  const phone = normalizePhone(String(shipping?.phone || "").trim()) || "11999999999";
  const email = String(shipping?.email || order?.userEmail || "").trim().toLowerCase() || "cliente@tsebi.com.br";
  const document = normalizeDocument(shipping?.cpf || "");

  return {
    name: fullName,
    document,
    phone,
    email,
    address: street || toAddressLine(street, number),
    number: number || "S/N",
    complement: normalizeText(String(shipping?.complement || "")),
    district: district || "Centro",
    city: city || "Sao Paulo",
    state_abbr: state || "SP",
    postal_code: toZip,
    country_id: "BR"
  };
}

function buildVolumes() {
  return [
    {
      height: Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_HEIGHT_CM || 5, 5))),
      width: Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_WIDTH_CM || 15, 15))),
      length: Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_LENGTH_CM || 20, 20))),
      weight: Math.max(0.1, toNumber(process.env.DEFAULT_PACKAGE_WEIGHT_KG || 0.3, 0.3))
    }
  ];
}

function uniqueServiceCandidates(primaryServiceCode, quoteList = []) {
  const seen = new Set();
  const candidates = [];

  const pushCandidate = (value) => {
    const normalized = String(value || "").trim();
    if (!/^\d+$/.test(normalized)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(primaryServiceCode);
  (Array.isArray(quoteList) ? quoteList : []).forEach((quoteEntry) => {
    pushCandidate(quoteEntry?.serviceCode);
  });

  return candidates;
}

async function buyLabel({ order }) {
  const fromZip = normalizeZip(process.env.SHIP_FROM_ZIP || "");
  const toZip = normalizeZip(order?.shippingDestinationZip || order?.shipping?.cep || "");
  if (!/^\d{8}$/.test(fromZip) || !/^\d{8}$/.test(toZip)) {
    const error = new Error("INVALID_ZIP_FOR_LABEL");
    error.code = "INVALID_ZIP_FOR_LABEL";
    throw error;
  }

  const recalculated = await quote({
    fromZip,
    toZip,
    packages: [
      {
        quantity: 1,
        weightKg: Math.max(0.1, toNumber(process.env.DEFAULT_PACKAGE_WEIGHT_KG || 0.3, 0.3)),
        lengthCm: Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_LENGTH_CM || 20, 20))),
        widthCm: Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_WIDTH_CM || 15, 15))),
        heightCm: Math.max(1, Math.round(toNumber(process.env.DEFAULT_PACKAGE_HEIGHT_CM || 5, 5)))
      }
    ]
  });
  const preferredServiceCode = String(order?.shippingSelectedServiceCode || "").trim();
  const candidateServiceCodes = uniqueServiceCandidates(preferredServiceCode, recalculated);

  if (!candidateServiceCodes.length) {
    const error = new Error("ORDER_MISSING_SHIPPING_SERVICE_CODE");
    error.code = "ORDER_MISSING_SHIPPING_SERVICE_CODE";
    throw error;
  }

  const sender = buildSenderAddress();
  const recipient = buildRecipientAddress(order);
  const rawProducts = buildProductsForLabel(order);
  const volumes = buildVolumes();
  const productsTotal = rawProducts.reduce((sum, product) => {
    const quantity = Math.max(1, toNumber(product?.quantity, 1));
    const unitaryValue = toMoney(product?.unitary_value);
    return sum + unitaryValue * quantity;
  }, 0);
  const nonCommercial = readBooleanEnv("MELHOR_ENVIO_NON_COMMERCIAL", true);
  const insuranceCap = getInsuranceCapForNonCommercial();
  const insuranceValue = nonCommercial
    ? toMoney(Math.min(Math.max(1, productsTotal), insuranceCap))
    : toMoney(Math.max(1, productsTotal));
  const products = nonCommercial
    ? rebalanceProductsInsurance(capProductsUnitaryValue(rawProducts, insuranceValue), insuranceValue)
    : rawProducts;

  const baseCartPayload = {
    from: sender,
    to: recipient,
    products,
    volumes,
    options: {
      receipt: false,
      own_hand: false,
      collect: false,
      reverse: false,
      non_commercial: nonCommercial,
      insurance_value: insuranceValue
    }
  };

  let cartResponse = null;
  let lastError = null;
  for (const serviceCode of candidateServiceCodes) {
    const cartPayload = {
      ...baseCartPayload,
      service: Number(serviceCode)
    };
    try {
      cartResponse = await melhorEnvioRequest("/me/cart", {
        method: "POST",
        body: cartPayload
      });
      break;
    } catch (error) {
      lastError = error;
      lastError.details = {
        stage: "cart_create",
        serviceTried: serviceCode,
        serviceCandidates: candidateServiceCodes,
        request: cartPayload,
        response: error?.payload || null
      };
    }
  }

  if (!cartResponse) {
    throw lastError || new Error("MELHOR_ENVIO_REQUEST_FAILED");
  }

  const orderFromCart = Array.isArray(cartResponse)
    ? cartResponse[0]
    : cartResponse?.data?.[0] || cartResponse?.data || cartResponse;
  const labelExternalId = String(orderFromCart?.id || "").trim();
  if (!labelExternalId) {
    const error = new Error("MELHOR_ENVIO_CART_ID_NOT_FOUND");
    error.code = "MELHOR_ENVIO_CART_ID_NOT_FOUND";
    error.payload = cartResponse;
    throw error;
  }

  const checkoutResponse = await melhorEnvioRequest("/me/shipment/checkout", {
    method: "POST",
    body: {
      orders: [labelExternalId]
    }
  });

  const trackingCode =
    String(
      orderFromCart?.tracking ||
        checkoutResponse?.tracking ||
        checkoutResponse?.tracking_code ||
        checkoutResponse?.orders?.[0]?.tracking ||
        ""
    ).trim() || null;

  return {
    labelExternalId,
    trackingCode,
    status: "ETIQUETA_COMPRADA",
    rawPayload: {
      cartResponse,
      checkoutResponse
    }
  };
}

async function getLabel({ labelExternalId }) {
  const id = String(labelExternalId || "").trim();
  if (!id) {
    const error = new Error("INVALID_LABEL_ID");
    error.code = "INVALID_LABEL_ID";
    throw error;
  }

  const result = await melhorEnvioRequest(`/me/cart/${encodeURIComponent(id)}`, { method: "GET" });
  return {
    labelExternalId: id,
    downloadUrl: String(result?.label || result?.url || "").trim(),
    rawPayload: result
  };
}

async function track({ trackingCode }) {
  const tracking = String(trackingCode || "").trim();
  if (!tracking) {
    const error = new Error("INVALID_TRACKING_CODE");
    error.code = "INVALID_TRACKING_CODE";
    throw error;
  }

  let result = null;
  let source = "shipment_tracking";

  try {
    const batch = await melhorEnvioRequest("/me/shipment/tracking", {
      method: "POST",
      body: {
        orders: [tracking]
      }
    });
    if (batch && typeof batch === "object") {
      const list = Object.values(batch);
      result =
        list.find((entry) => String(entry?.tracking || "").trim().toUpperCase() === tracking.toUpperCase()) ||
        list.find((entry) => String(entry?.melhorenvio_tracking || "").trim().toUpperCase() === tracking.toUpperCase()) ||
        list[0] ||
        null;
    }
  } catch {
    result = null;
  }

  if (!result) {
    source = "legacy_tracking";
    result = await melhorEnvioRequest(
      `/me/tracking?tracking_code=${encodeURIComponent(tracking)}`,
      { method: "GET" }
    );
  }

  return {
    trackingCode: tracking,
    status: String(result?.status || result?.current_status || "").trim().toUpperCase() || "IN_TRANSIT",
    events: Array.isArray(result?.events) ? result.events : [],
    rawPayload: {
      source,
      payload: result
    }
  };
}

module.exports = {
  quote,
  buyLabel,
  getLabel,
  track
};
