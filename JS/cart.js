(() => {
if (window.__TSEBI_CART_BOOTED__) {
  return;
}
window.__TSEBI_CART_BOOTED__ = true;

const CART_KEY = "tsebi-cart-v1";
const LEGACY_CART_KEYS = ["tsebi-cart", "cart"];
const SHIPPING_KEY_BASE = "tsebi-checkout-shipping-v2";
const SHIPPING_KEY_LEGACY = "tsebi-checkout-shipping-v1";
const userStore = window.TsebiUserStore;
const GUEST_CHECKOUT_MESSAGE = "Finalize como visitante. Sua conta pode ser ativada apÃ³s a compra.";
const CEP_LOOKUP_DEBOUNCE_MS = 450;
const cepLookupCache = new Map();
let cepLookupTimeoutId = 0;
let cepLookupController = null;
let cepLookupRequestSeq = 0;
let shippingQuoteRequestSeq = 0;
const CHECKOUT_TRACKING_KEY = "tsebi-checkout-tracking";
const LAST_ORDER_EMAIL_KEY = "tsebi_last_order_email";
const LAST_ORDER_NUMBER_KEY = "tsebi_last_order_number";

const checkoutState = {
  currentStep: 1,
  maxStepReached: 1,
  cart: {
    items: [],
    subtotal: 0,
    discount: 0,
    discountCode: ""
  },
  shipping: {
    firstName: "",
    lastName: "",
    fullName: "",
    email: "",
    phone: "",
    cpf: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    country: "BR",
    shippingMethod: "",
    shippingCost: 0,
    shippingEstimate: "",
    shippingQuoteId: "",
    shippingProvider: "",
    shippingServiceCode: "",
    shippingServiceName: "",
    shippingCarrierName: "",
    shippingDeadlineDays: null
  },
  shippingQuoteOptions: {
    list: []
  },
  authUserId: "guest",
  shippingStorageKey: "",
  payment: {
    methodPreference: "automatic",
    installments: 1,
    billingName: "",
    billingNameTouched: false,
    sessionSignature: "",
    orderId: "",
    orderNumber: "",
    checkoutEmail: "",
    clientSecret: "",
    elements: null,
    paymentElement: null,
    preparing: false
  },
  stripe: {
    instance: null
  },
  config: null
};

const DEFAULT_SHIPPING_STATE = {
  firstName: "",
  lastName: "",
  fullName: "",
  email: "",
  phone: "",
  cpf: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  country: "BR",
  shippingMethod: "",
  shippingCost: 0,
  shippingEstimate: "",
  shippingQuoteId: "",
  shippingProvider: "",
  shippingServiceCode: "",
  shippingServiceName: "",
  shippingCarrierName: "",
  shippingDeadlineDays: null
};

const dom = {
  stepper: document.getElementById("checkoutStepper"),
  panels: {
    1: document.getElementById("step1"),
    2: document.getElementById("step2"),
    3: document.getElementById("step3")
  },
  cartItems: document.getElementById("cartItems"),
  cartEmpty: document.getElementById("cartEmpty"),
  goToShippingBtn: document.getElementById("goToShippingBtn"),
  shippingForm: document.getElementById("shippingForm"),
  goToPaymentBtn: document.getElementById("goToPaymentBtn"),
  checkoutButton: document.getElementById("checkoutButton"),
  checkoutStatus: document.getElementById("checkoutStatus"),
  installments: document.getElementById("installments"),
  installmentsField: document.getElementById("installmentsField"),
  installmentsHint: document.getElementById("installmentsHint"),
  installmentsPreview: document.getElementById("installmentsPreview"),
  billingName: document.getElementById("billingName"),
  billingNameError: document.getElementById("error-billingName"),
  paymentElementWrap: document.getElementById("paymentElementWrap"),
  paymentElement: document.getElementById("payment-element"),
  summarySubtotal: document.getElementById("summarySubtotal"),
  summaryShipping: document.getElementById("summaryShipping"),
  summaryDiscount: document.getElementById("summaryDiscount"),
  summaryTotal: document.getElementById("summaryTotal"),
  summaryEstimate: document.getElementById("summaryEstimate"),
  accessCodeInput: document.getElementById("accessCodeInput"),
  applyAccessCodeBtn: document.getElementById("applyAccessCodeBtn"),
  accessCodeFeedback: document.getElementById("accessCodeFeedback"),
  summary: document.getElementById("checkoutSummary"),
  summaryCollapseBtn: document.getElementById("summaryCollapseBtn"),
  shippingOptionsList: document.getElementById("shippingOptionsList"),
  checkoutAuthCta: document.getElementById("checkoutAuthCta"),
  headerCartLinks: Array.from(document.querySelectorAll('a[aria-label="Carrinho"]'))
};

const shippingFields = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "cpf",
  "cep",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "country"
];
const CEP_AUTOFILL_LOCKED_FIELDS = ["street", "district", "city", "state"];

function readCart() {
  function normalizeCartItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const rawKey = String(item.key || "").trim();
        const idFromKey = rawKey.includes("::") ? rawKey.split("::")[0] : rawKey;
        const id = String(item.id || item.productId || idFromKey || "").trim();
        const qty = Math.max(1, Number(item.qty || item.quantity || 1));
        const key = String(item.key || `${id || "item"}::${item.color || "-"}::${item.size || "-"}`);
        const priceLabel = String(item.priceLabel || item.price || "R$ 0,00");
        return {
          key,
          id,
          name: String(item.name || item.title || id),
          priceLabel,
          image: String(item.image || item.img || "images/placeholder.jpg"),
          color: String(item.color || "-"),
          size: String(item.size || "-"),
          maxStock: Math.max(1, Number(item.maxStock || 99)),
          qty
        };
      })
      .filter(Boolean);
  }

  function parseCartPayload(rawValue) {
    if (!rawValue) return [];
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) return normalizeCartItems(parsed);
      if (parsed && Array.isArray(parsed.items)) return normalizeCartItems(parsed.items);
      return [];
    } catch {
      return [];
    }
  }

  try {
    const current = parseCartPayload(localStorage.getItem(CART_KEY));
    if (current.length > 0) {
      const validCurrent = current.filter((item) => item && item.id);
      if (validCurrent.length !== current.length) {
        localStorage.setItem(CART_KEY, JSON.stringify(validCurrent));
      }
      return validCurrent;
    }

    for (const legacyKey of LEGACY_CART_KEYS) {
      const legacy = parseCartPayload(localStorage.getItem(legacyKey));
      if (legacy.length > 0) {
        const validLegacy = legacy.filter((item) => item && item.id);
        localStorage.setItem(CART_KEY, JSON.stringify(validLegacy));
        return validLegacy;
      }
    }

    return [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {}
}

function getCurrentAuthUserId() {
  const user = userStore?.getCurrentUser?.() || null;
  const id = String(user?.id || "").trim();
  return id || "guest";
}

function getShippingStorageKey(userId) {
  const safeUserId = String(userId || "guest").trim() || "guest";
  return `${SHIPPING_KEY_BASE}:${safeUserId}`;
}

function saveShipping() {
  try {
    const key = checkoutState.shippingStorageKey || getShippingStorageKey(getCurrentAuthUserId());
    localStorage.setItem(key, JSON.stringify(checkoutState.shipping));
  } catch {}
}

function readShipping(key) {
  try {
    if (!key) return {};
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parsePriceLabel(label) {
  const normalized = String(label || "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toCents(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function fromCents(value) {
  return Math.max(0, Number(value || 0) / 100);
}

const COLOR_SWATCH_MAP = {
  branco: "#f7f7f2",
  azul: "#355f9a",
  preto: "#121212",
  grafite: "#4d4f53",
  marfim: "#f4ecdf",
  bege: "#d9c3a4",
  caramelo: "#a4693f",
  marrom: "#6f4e37",
  vinho: "#6f1f36",
  areia: "#d6c3a2",
  vermelho: "#b2282f",
  amarelo: "#d4af37",
  verde: "#2f6b3f",
  oliva: "#667247",
  cinza: "#8d8f95",
  rosa: "#d47fa6",
  laranja: "#d67a2e",
  roxo: "#6e4c8f",
  lilas: "#a08cc6",
  "lilÃ¡s": "#a08cc6",
  lilac: "#a08cc6",
  dourado: "#b08a2e",
  prata: "#b1b3b8",
  "off white": "#f5f2ea",
  unico: "#d3d3d3",
  "Ãºnico": "#d3d3d3"
};

function resolveColorSwatch(colorName) {
  const raw = String(colorName || "").trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(raw)) return raw;
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (COLOR_SWATCH_MAP[key]) return COLOR_SWATCH_MAP[key];
  const match = Object.keys(COLOR_SWATCH_MAP).find((name) => key.includes(name));
  return match ? COLOR_SWATCH_MAP[match] : "#b5b5b5";
}

function getInstallmentsTotal() {
  return Math.max(0, Number(getSummaryTotal() || 0));
}

function updateInstallmentsPreview(isCard) {
  if (!dom.installmentsPreview) return;
  if (!isCard) {
    dom.installmentsPreview.textContent = "Parcelamento disponÃ­vel apenas para pagamentos com cartÃ£o.";
    return;
  }

  const installments = Math.max(1, Math.min(6, Number(dom.installments?.value || 1)));
  const total = getInstallmentsTotal();
  const installmentValue = total / installments;
  dom.installmentsPreview.textContent = `${installments}x de ${formatCurrency(installmentValue)} sem juros (total ${formatCurrency(total)}).`;
}

function updateInstallmentsOptions() {
  if (!dom.installments) return;
  const total = getInstallmentsTotal();
  const isCard = (checkoutState.payment.methodPreference || "automatic") === "card";
  const maxInstallments = Math.max(1, Math.min(6, Number(checkoutState.config?.maxInstallments || 6)));

  Array.from(dom.installments.options).forEach((option) => {
    const count = Math.max(1, Number(option.value || 1));
    option.hidden = count > maxInstallments;
    option.disabled = count > maxInstallments;
    const installmentValue = total / count;
    option.textContent = `${count}x de ${formatCurrency(installmentValue)} sem juros`;
  });

  if (Number(dom.installments.value || 1) > maxInstallments) {
    dom.installments.value = String(maxInstallments);
    checkoutState.payment.installments = maxInstallments;
  }

  updateInstallmentsPreview(isCard);
}

function normalizeCepDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatCepDisplay(value) {
  const digits = normalizeCepDigits(value);
  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
}

function sanitizeDisplayText(value) {
  let text = String(value || "");
  const mojibakePattern = /\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]/u;
  for (let i = 0; i < 2; i += 1) {
    if (!mojibakePattern.test(text)) break;
    try {
      const decoded = decodeURIComponent(escape(text));
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text;
}

function setButtonDisabled(button, disabled) {
  if (!button) return;
  button.disabled = Boolean(disabled);
  button.setAttribute("aria-disabled", disabled ? "true" : "false");
}

function setCheckoutStatus(message, type = "") {
  if (!dom.checkoutStatus) return;
  dom.checkoutStatus.textContent = message || "";
  dom.checkoutStatus.classList.remove("is-error", "is-success", "is-warning");
  if (type === "error") dom.checkoutStatus.classList.add("is-error");
  if (type === "success") dom.checkoutStatus.classList.add("is-success");
  if (type === "warning") dom.checkoutStatus.classList.add("is-warning");
}

function setProcessingState(processing) {
  setButtonDisabled(dom.checkoutButton, processing);
  if (!dom.checkoutButton) return;
  dom.checkoutButton.textContent = processing ? "Processando..." : "Finalizar compra";
}

async function apiRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const serverMessage =
      (data && (data.error || data.message || data.detail)) ||
      "Falha na comunicacao com o servidor.";
    const error = new Error(serverMessage);
    error.status = response.status;
    error.code = data.error || data.code || "";
    throw error;
  }
  return data;
}

function isInvalidCartError(error) {
  const status = Number(error?.status || 0);
  const raw = String(error?.message || error?.code || "").toLowerCase();
  if (raw.includes("invalid cart")) return true;
  if (status === 409 || status === 422) return true;
  return false;
}

function getProductStock(product) {
  const stock = Number(product?.stock ?? product?.stock_qty ?? 0);
  return Number.isFinite(stock) ? stock : 0;
}

function getProductPriceLabel(product) {
  if (product && typeof product.priceLabel === "string" && product.priceLabel.trim()) {
    return product.priceLabel;
  }
  const numeric = Number(product?.priceValue ?? product?.price ?? 0);
  return formatCurrency(Number.isFinite(numeric) ? numeric : 0);
}

async function fetchProductsCatalog() {
  try {
    const response = await fetch("/api/products", { method: "GET" });
    if (!response.ok) return [];
    const parsed = await response.json();
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.products)) return parsed.products;
  } catch {}
  return [];
}

async function refreshCartFromLatestProducts() {
  const products = await fetchProductsCatalog();
  if (!Array.isArray(products) || products.length === 0) return { ok: false, removedOutOfStock: false };

  const byId = new Map();
  products.forEach((product) => {
    const id = String(product?.id || "").trim();
    const sku = String(product?.sku || "").trim();
    if (id) byId.set(id, product);
    if (sku) byId.set(sku, product);
  });

  let removedOutOfStock = false;
  const nextItems = [];

  checkoutState.cart.items.filter((item) => item && item.id).forEach((item) => {
    const product = byId.get(String(item.id || "").trim());
    if (!product) {
      nextItems.push(item);
      return;
    }

    const stock = getProductStock(product);
    if (stock <= 0) {
      removedOutOfStock = true;
      return;
    }

    nextItems.push({
      ...item,
      priceLabel: getProductPriceLabel(product),
      maxStock: stock,
      qty: Math.min(Math.max(1, Number(item.qty) || 1), stock)
    });
  });

  checkoutState.cart.items = nextItems;
  saveCart(nextItems);
  invalidatePaymentSession();
  renderCartItems();
  return { ok: true, removedOutOfStock };
}

function clearSelectedShippingQuote() {
  checkoutState.shipping.shippingMethod = "";
  checkoutState.shipping.shippingCost = 0;
  checkoutState.shipping.shippingEstimate = "";
  checkoutState.shipping.shippingQuoteId = "";
  checkoutState.shipping.shippingProvider = "";
  checkoutState.shipping.shippingServiceCode = "";
  checkoutState.shipping.shippingServiceName = "";
  checkoutState.shipping.shippingCarrierName = "";
  checkoutState.shipping.shippingDeadlineDays = null;
}

function getShippingQuoteByMethod(methodCode) {
  const wanted = String(methodCode || "").trim();
  if (!wanted) return null;
  const list = Array.isArray(checkoutState.shippingQuoteOptions?.list)
    ? checkoutState.shippingQuoteOptions.list
    : [];
  return list.find((quote) => String(quote?.id || "").trim() === wanted) || null;
}

function renderShippingOptionsList(quotes) {
  if (!dom.shippingOptionsList) return;
  const list = Array.isArray(quotes) ? quotes : [];

  if (list.length === 0) {
    dom.shippingOptionsList.innerHTML = `
      <label class="shipping-option">
        <input type="radio" name="shippingMethod" value="" disabled />
        <span>Informe o CEP para carregar as opcoes de frete</span>
        <strong>R$ 0,00</strong>
      </label>
    `;
    return;
  }

  dom.shippingOptionsList.innerHTML = list
    .map((quote) => {
      const quoteId = String(quote?.id || "").trim();
      const serviceName = sanitizeDisplayText(String(quote?.serviceName || "Frete"));
      const carrierName = sanitizeDisplayText(String(quote?.carrierName || ""));
      const deadlineDays = Number(quote?.deadlineDays);
      const deadlineText =
        Number.isFinite(deadlineDays) && deadlineDays > 0 ? `${deadlineDays} dias` : "sem prazo estimado";
      const selected =
        String(checkoutState.shipping.shippingMethod || "").trim() === quoteId ||
        String(checkoutState.shipping.shippingQuoteId || "").trim() === quoteId;

      const label = carrierName
        ? `${serviceName} - ${carrierName} (${deadlineText})`
        : `${serviceName} (${deadlineText})`;

      return `
        <label class="shipping-option">
          <input
            type="radio"
            name="shippingMethod"
            value="${quoteId}"
            ${selected ? "checked" : ""}
          />
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(formatCurrency(Number(quote?.priceCents || 0) / 100))}</strong>
        </label>
      `;
    })
    .join("");
}

function applyShippingSelectionFromMethod(methodCode) {
  const quote = getShippingQuoteByMethod(methodCode);
  if (!quote) {
    clearSelectedShippingQuote();
    return false;
  }

  checkoutState.shipping.shippingMethod = String(quote.id || "");
  checkoutState.shipping.shippingQuoteId = String(quote.id || "");
  checkoutState.shipping.shippingProvider = String(quote.provider || "");
  checkoutState.shipping.shippingServiceCode = String(quote.serviceCode || "");
  checkoutState.shipping.shippingServiceName = String(quote.serviceName || "");
  checkoutState.shipping.shippingCarrierName = String(quote.carrierName || "");
  checkoutState.shipping.shippingDeadlineDays = quote.deadlineDays == null ? null : Number(quote.deadlineDays || 0);
  checkoutState.shipping.shippingCost = Number(quote.priceCents || 0) / 100;
  checkoutState.shipping.shippingEstimate =
    quote.deadlineDays == null || Number(quote.deadlineDays) <= 0 ? "" : `${quote.deadlineDays} dias`;
  return true;
}

function isUsableShippingQuote(quote) {
  if (!quote || typeof quote !== "object") return false;
  const serviceName = String(quote.serviceName || "").trim();
  if (!serviceName) return false;

  const providerError = String(quote?.rawPayload?.error || "").trim();
  if (providerError) return false;

  const priceCents = Number(quote.priceCents);
  if (!Number.isFinite(priceCents) || priceCents < 0) return false;
  return true;
}

function applyShippingQuotesToUI(quotes) {
  const sorted = (Array.isArray(quotes) ? quotes : [])
    .filter(isUsableShippingQuote)
    .slice()
    .sort((a, b) => Number(a?.priceCents || 0) - Number(b?.priceCents || 0));

  checkoutState.shippingQuoteOptions = {
    list: sorted
  };
  renderShippingOptionsList(checkoutState.shippingQuoteOptions.list);

  if (checkoutState.shipping.shippingMethod) {
    const selected = applyShippingSelectionFromMethod(checkoutState.shipping.shippingMethod);
    if (!selected) {
      clearSelectedShippingQuote();
      renderShippingOptionsList(checkoutState.shippingQuoteOptions.list);
      clearFieldError("shippingMethod");
    }
  }

  updateSummary();
  refreshShippingProgressButton();
}

function getSummaryTotal() {
  return checkoutState.cart.subtotal + checkoutState.shipping.shippingCost - checkoutState.cart.discount;
}

function setAccessCodeFeedback(message, tone = "") {
  if (!dom.accessCodeFeedback) return;
  dom.accessCodeFeedback.textContent = String(message || "");
  dom.accessCodeFeedback.style.color = tone === "error" ? "#9d1f1f" : "#1d6a2d";
}

function clearAccessCode({ clearInput = false } = {}) {
  checkoutState.cart.discount = 0;
  checkoutState.cart.discountCode = "";
  if (clearInput && dom.accessCodeInput) dom.accessCodeInput.value = "";
  setAccessCodeFeedback("");
}

async function applyAccessCode(rawCode, { silent = false } = {}) {
  const normalized = String(rawCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);

  if (!normalized) {
    clearAccessCode({ clearInput: false });
    updateSummary();
    if (!silent) setAccessCodeFeedback("Informe um código de acesso válido.", "error");
    return false;
  }

  if (dom.applyAccessCodeBtn) dom.applyAccessCodeBtn.disabled = true;
  if (!silent) setAccessCodeFeedback("Validando código de acesso...");

  try {
    const result = await apiRequest("/api/discount-codes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: normalized,
        subtotalCents: toCents(checkoutState.cart.subtotal),
        shippingCents: toCents(checkoutState.shipping.shippingCost)
      })
    });

    checkoutState.cart.discount = fromCents(result?.discountCents || 0);
    checkoutState.cart.discountCode = String(result?.code || normalized);
    if (dom.accessCodeInput) dom.accessCodeInput.value = checkoutState.cart.discountCode;
    updateSummary();
    invalidatePaymentSession();
    if (!silent) setAccessCodeFeedback("Código de acesso aplicado com sucesso.");
    return true;
  } catch (error) {
    clearAccessCode({ clearInput: false });
    updateSummary();
    invalidatePaymentSession();
    if (!silent) {
      const code = String(error?.code || error?.message || "");
      if (code.includes("NOT_FOUND")) setAccessCodeFeedback("Código de acesso não encontrado.", "error");
      else if (code.includes("INACTIVE")) setAccessCodeFeedback("Código de acesso inativo.", "error");
      else if (code.includes("NOT_AVAILABLE_NOW")) setAccessCodeFeedback("Código fora do período de validade.", "error");
      else if (code.includes("NOT_APPLICABLE")) setAccessCodeFeedback("Código não aplicável para este carrinho.", "error");
      else setAccessCodeFeedback("Não foi possível aplicar o código de acesso.", "error");
    }
    return false;
  } finally {
    if (dom.applyAccessCodeBtn) dom.applyAccessCodeBtn.disabled = false;
  }
}

function revalidateAccessCodeSilently() {
  if (!checkoutState.cart.discountCode) return;
  applyAccessCode(checkoutState.cart.discountCode, { silent: true });
}

function updateSummary() {
  if (dom.summarySubtotal) dom.summarySubtotal.textContent = formatCurrency(checkoutState.cart.subtotal);
  if (dom.summaryShipping) dom.summaryShipping.textContent = formatCurrency(checkoutState.shipping.shippingCost);
  if (dom.summaryDiscount) {
    dom.summaryDiscount.textContent = checkoutState.cart.discount > 0
      ? `- ${formatCurrency(checkoutState.cart.discount)}`
      : formatCurrency(0);
  }
  if (dom.summaryTotal) dom.summaryTotal.textContent = formatCurrency(getSummaryTotal());
  if (dom.summaryEstimate) {
    dom.summaryEstimate.textContent = checkoutState.shipping.shippingEstimate
      ? `Entrega estimada: ${checkoutState.shipping.shippingEstimate}`
      : "Selecione um metodo de entrega para ver o prazo estimado.";
  }
  updateInstallmentsOptions();
}

function recalcCartTotals() {
  let subtotal = 0;
  checkoutState.cart.items.filter((item) => item && item.id).forEach((item) => {
    const qty = Math.max(1, Number(item.qty) || 1);
    subtotal += parsePriceLabel(item.priceLabel) * qty;
  });
  checkoutState.cart.subtotal = subtotal;
  if (checkoutState.cart.discountCode) {
    revalidateAccessCodeSilently();
  }
  updateSummary();
}

function renderCartItems() {
  if (!dom.cartItems || !dom.cartEmpty) return;
  const validItems = checkoutState.cart.items.filter((item) => item && item.id);
  if (validItems.length !== checkoutState.cart.items.length) {
    checkoutState.cart.items = validItems;
    saveCart(validItems);
  }

  const hasItems = validItems.length > 0;
  dom.cartItems.innerHTML = "";
  dom.cartEmpty.hidden = hasItems;
  setButtonDisabled(dom.goToShippingBtn, !hasItems);
  syncHeaderCartBadge();

  if (!hasItems) {
    clearAccessCode({ clearInput: true });
    clearShippingQuotes({ keepSelection: false });
    dom.shippingForm?.querySelectorAll('input[name="shippingMethod"]').forEach((input) => {
      input.checked = false;
    });
    saveShipping();
    updateSummary();
    invalidatePaymentSession();
    return;
  }

  validItems.forEach((item) => {
    const safeName = sanitizeDisplayText(item?.name || "Produto");
    const safeImage = String(item?.image || "images/placeholder.jpg");
    const safeColor = String(item?.color || "-");
    const safeSize = String(item?.size || "-");
    const safePriceLabel = String(item?.priceLabel || "R$ 0,00");
    const qty = Math.max(1, Number(item?.qty) || 1);
    const unit = parsePriceLabel(safePriceLabel);
    const total = unit * qty;
    const key = String(item?.key || item?.id || "");
    if (!key) return;

    const article = document.createElement("article");
    article.className = "cart-item-v2";

    const image = document.createElement("img");
    image.src = safeImage;
    image.alt = safeName;
    image.loading = "lazy";
    image.decoding = "async";

    const details = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = safeName;

    const price = document.createElement("p");
    price.textContent = safePriceLabel;

    const variant = document.createElement("p");
    variant.className = "cart-item-variant";

    const dot = document.createElement("span");
    dot.className = "cart-color-dot";
    dot.style.backgroundColor = resolveColorSwatch(safeColor);
    dot.setAttribute("aria-hidden", "true");

    const size = document.createElement("span");
    size.textContent = safeSize;

    variant.append(dot, size);

    const controls = document.createElement("div");
    controls.className = "cart-item-controls";

    const decreaseBtn = document.createElement("button");
    decreaseBtn.type = "button";
    decreaseBtn.setAttribute("data-action", "decrease");
    decreaseBtn.setAttribute("data-key", key);
    decreaseBtn.setAttribute("aria-label", "Diminuir quantidade");
    decreaseBtn.textContent = "-";

    const qtyText = document.createElement("span");
    qtyText.textContent = String(qty);

    const increaseBtn = document.createElement("button");
    increaseBtn.type = "button";
    increaseBtn.setAttribute("data-action", "increase");
    increaseBtn.setAttribute("data-key", key);
    increaseBtn.setAttribute("aria-label", "Aumentar quantidade");
    increaseBtn.textContent = "+";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.setAttribute("data-action", "remove");
    removeBtn.setAttribute("data-key", key);
    removeBtn.textContent = "Remover";

    controls.append(decreaseBtn, qtyText, increaseBtn, removeBtn);
    details.append(title, price, variant, controls);

    const totalPrice = document.createElement("strong");
    totalPrice.className = "cart-item-price";
    totalPrice.textContent = formatCurrency(total);

    article.append(image, details, totalPrice);
    dom.cartItems.appendChild(article);
  });

  recalcCartTotals();
}

function syncHeaderCartBadge() {
  const links = Array.isArray(dom.headerCartLinks) ? dom.headerCartLinks : [];
  if (!links.length) return;
  const totalItems = checkoutState.cart.items
    .filter((item) => item && item.id)
    .reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);

  links.forEach((link) => {
    link.classList.add("cart-link");
    if (totalItems > 0) {
      link.setAttribute("data-cart-count", String(totalItems));
    } else {
      link.removeAttribute("data-cart-count");
    }
  });
}

function renderCartSkeleton() {
  if (!dom.cartItems) return;
  dom.cartItems.innerHTML = "";
  for (let i = 0; i < 2; i += 1) {
    const row = document.createElement("div");
    row.className = "cart-skeleton-row";
    row.innerHTML = `
      <div class="cart-skeleton-media checkout-skeleton"></div>
      <div>
        <div class="cart-skeleton-meta checkout-skeleton"></div>
        <div class="cart-skeleton-meta checkout-skeleton"></div>
        <div class="cart-skeleton-meta checkout-skeleton"></div>
      </div>
      <div class="cart-skeleton-price checkout-skeleton"></div>
    `;
    dom.cartItems.appendChild(row);
  }
}

function updateItemQuantity(key, delta) {
  const item = checkoutState.cart.items.find((entry) => (entry.key || entry.id) === key);
  if (!item) return;
  const maxStock = Math.max(1, Number(item.maxStock) || 1);
  const nextQty = Math.max(1, Math.min(maxStock, (Number(item.qty) || 1) + delta));
  item.qty = nextQty;
  saveCart(checkoutState.cart.items);
  invalidatePaymentSession();
  renderCartItems();
}

function removeItem(key) {
  checkoutState.cart.items = checkoutState.cart.items.filter((entry) => (entry.key || entry.id) !== key);
  saveCart(checkoutState.cart.items);
  invalidatePaymentSession();
  renderCartItems();
}

function getServerItemsPayload() {
  const grouped = new Map();
  checkoutState.cart.items.filter((item) => item && item.id).forEach((item) => {
    if (!item || !item.id) return;
    const qty = Math.max(1, Number(item.qty) || 1);
    grouped.set(item.id, (grouped.get(item.id) || 0) + qty);
  });
  return Array.from(grouped.entries()).map(([id, qty]) => ({ id, qty }));
}

function getShippingFullName() {
  const first = String(checkoutState.shipping.firstName || "").trim();
  const last = String(checkoutState.shipping.lastName || "").trim();
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || String(checkoutState.shipping.fullName || "").trim();
}

function buildShippingPayload() {
  const firstName = String(checkoutState.shipping.firstName || "").trim();
  const lastName = String(checkoutState.shipping.lastName || "").trim();
  const fullName = getShippingFullName();
  return {
    firstName,
    lastName,
    fullName,
    email: checkoutState.shipping.email.trim(),
    phone: checkoutState.shipping.phone.trim(),
    cpf: checkoutState.shipping.cpf.trim(),
    cep: checkoutState.shipping.cep.trim(),
    street: checkoutState.shipping.street.trim(),
    number: checkoutState.shipping.number.trim(),
    complement: checkoutState.shipping.complement.trim(),
    district: checkoutState.shipping.district.trim(),
    city: checkoutState.shipping.city.trim(),
    state: checkoutState.shipping.state.trim().toUpperCase(),
    country: String(checkoutState.shipping.country || "BR").trim().toUpperCase().slice(0, 2) || "BR",
    shippingMethod: checkoutState.shipping.shippingMethod,
    shippingCost: checkoutState.shipping.shippingCost,
    shippingEstimate: checkoutState.shipping.shippingEstimate,
    quoteId: checkoutState.shipping.shippingQuoteId || null,
    shippingProvider: checkoutState.shipping.shippingProvider || "",
    shippingServiceCode: checkoutState.shipping.shippingServiceCode || "",
    shippingServiceName: checkoutState.shipping.shippingServiceName || "",
    shippingCarrierName: checkoutState.shipping.shippingCarrierName || "",
    shippingDeadlineDays: checkoutState.shipping.shippingDeadlineDays
  };
}

function saveTrackingContext(partial = {}) {
  try {
    const current = JSON.parse(sessionStorage.getItem(CHECKOUT_TRACKING_KEY) || "{}");
    const next = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString()
    };
    sessionStorage.setItem(CHECKOUT_TRACKING_KEY, JSON.stringify(next));
    const normalizedEmail = String(next.email || "").trim().toLowerCase();
    const normalizedOrderNumber = String(next.orderNumber || "").trim();
    if (normalizedEmail) sessionStorage.setItem(LAST_ORDER_EMAIL_KEY, normalizedEmail);
    if (normalizedOrderNumber) sessionStorage.setItem(LAST_ORDER_NUMBER_KEY, normalizedOrderNumber);
  } catch {}
}

function renderCheckoutAuthCta() {
  if (!dom.checkoutAuthCta) return;
  const user = userStore?.getCurrentUser?.() || null;
  if (user) {
    dom.checkoutAuthCta.textContent = `VocÃª estÃ¡ comprando como ${user.email}.`;
    return;
  }
  dom.checkoutAuthCta.textContent = GUEST_CHECKOUT_MESSAGE;
}

function prefillShippingFromUser() {
  const user = userStore?.getCurrentUser?.() || null;
  if (!user) return;
  const addresses = Array.isArray(user.addresses) ? user.addresses : [];
  const defaultAddress =
    addresses.find((address) => address && address.id === user.defaultAddressId) ||
    addresses.find((address) => address && address.isDefault) ||
    null;

  const userName = String(user.name || "").trim();
  const [firstFromUser = "", ...restFromUser] = userName.split(/\s+/).filter(Boolean);
  if (!checkoutState.shipping.firstName) checkoutState.shipping.firstName = firstFromUser;
  if (!checkoutState.shipping.lastName) checkoutState.shipping.lastName = restFromUser.join(" ");
  checkoutState.shipping.fullName = getShippingFullName();
  if (!checkoutState.shipping.email) checkoutState.shipping.email = String(user.email || "").trim();
  if (!checkoutState.shipping.cpf) checkoutState.shipping.cpf = String(user.cpf || "").replace(/\D/g, "").slice(0, 11);
  if (!checkoutState.shipping.cep) {
    checkoutState.shipping.cep = String(defaultAddress?.cep || user.cep || "")
      .replace(/\D/g, "")
      .slice(0, 8);
  }
  if (!checkoutState.shipping.street) checkoutState.shipping.street = String(defaultAddress?.street || "").trim();
  if (!checkoutState.shipping.number) checkoutState.shipping.number = String(defaultAddress?.number || "").trim();
  if (!checkoutState.shipping.complement) checkoutState.shipping.complement = String(defaultAddress?.complement || "").trim();
  if (!checkoutState.shipping.district) checkoutState.shipping.district = String(defaultAddress?.district || "").trim();
  if (!checkoutState.shipping.city) checkoutState.shipping.city = String(defaultAddress?.city || "").trim();
  if (!checkoutState.shipping.state) checkoutState.shipping.state = String(defaultAddress?.state || "").trim().toUpperCase().slice(0, 2);
  if (!checkoutState.shipping.country) checkoutState.shipping.country = "BR";
  syncBillingNameFromShipping();
}

function setFieldLocked(fieldId, locked) {
  const input = document.getElementById(fieldId);
  if (!(input instanceof HTMLInputElement)) return;
  input.readOnly = Boolean(locked);
  input.setAttribute("aria-readonly", locked ? "true" : "false");
  input.classList.toggle("is-locked", Boolean(locked));
}

function syncLockedPrefilledFields() {
  CEP_AUTOFILL_LOCKED_FIELDS.forEach((fieldId) => setFieldLocked(fieldId, true));
  setFieldLocked("firstName", false);
  setFieldLocked("lastName", false);
  setFieldLocked("email", false);
  setFieldLocked("cpf", false);
  setFieldLocked("cep", false);
}

function clearCepAutofilledAddressFields() {
  CEP_AUTOFILL_LOCKED_FIELDS.forEach((fieldName) => {
    checkoutState.shipping[fieldName] = "";
  });
}

function getPaymentSessionSignature() {
  return JSON.stringify({
    items: getServerItemsPayload(),
    shipping: buildShippingPayload(),
    paymentMethod: checkoutState.payment.methodPreference || "automatic",
    installments: checkoutState.payment.installments,
    discountCode: checkoutState.cart.discountCode || ""
  });
}

function syncInstallmentsByPaymentMethod(methodType) {
  const isCard = methodType === "card";
  if (dom.installmentsField) {
    dom.installmentsField.classList.toggle("is-enabled", isCard);
    dom.installmentsField.classList.toggle("is-disabled", !isCard);
  }
  if (dom.installmentsHint) {
    dom.installmentsHint.textContent = isCard
      ? "Escolha em quantas vezes deseja pagar. Todas as parcelas sem juros."
      : "Selecione cartao na forma de pagamento para habilitar as parcelas.";
  }
  if (dom.installments) {
    dom.installments.disabled = !isCard;
  }
  if (!isCard) {
    checkoutState.payment.installments = 1;
    if (dom.installments) dom.installments.value = "1";
  }
  updateInstallmentsOptions();
}

function invalidatePaymentSession() {
  if (checkoutState.payment.paymentElement) {
    checkoutState.payment.paymentElement.unmount();
  }
  checkoutState.payment = {
    ...checkoutState.payment,
    sessionSignature: "",
    orderId: "",
    orderNumber: "",
    checkoutEmail: "",
    clientSecret: "",
    elements: null,
    paymentElement: null
  };
}

function setBillingNameError(message) {
  if (dom.billingNameError) dom.billingNameError.textContent = message || "";
}

function getBillingName() {
  return String(checkoutState.payment.billingName || "").trim();
}

function syncBillingNameFromShipping() {
  if (checkoutState.payment.billingNameTouched && getBillingName()) return;
  checkoutState.shipping.fullName = getShippingFullName();
  checkoutState.payment.billingName = String(checkoutState.shipping.fullName || "").trim();
  if (dom.billingName) dom.billingName.value = checkoutState.payment.billingName;
  setBillingNameError("");
}

function validateBillingName() {
  const billingName = getBillingName();
  if (billingName.length < 3) {
    setBillingNameError("Informe o nome do titular para pagar.");
    return false;
  }
  setBillingNameError("");
  return true;
}

function clearFieldError(fieldName) {
  const el = document.getElementById(`error-${fieldName}`);
  if (el) el.textContent = "";
}

function setFieldError(fieldName, message) {
  const el = document.getElementById(`error-${fieldName}`);
  if (el) el.textContent = message || "";
}

function clearAllShippingErrors() {
  [...shippingFields, "shippingMethod"].forEach(clearFieldError);
}

function validateShipping() {
  clearAllShippingErrors();
  const s = checkoutState.shipping;
  const errors = {};

  if (!s.firstName || s.firstName.trim().length < 2) errors.firstName = "Informe seu nome.";
  if (!s.lastName || s.lastName.trim().length < 2) errors.lastName = "Informe seu sobrenome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || "").trim())) errors.email = "Informe um email valido.";
  if (!String(s.phone || "").replace(/\D/g, "").trim()) errors.phone = "Informe seu telefone.";
  if (!/^\d{8}$/.test(String(s.cep || ""))) errors.cep = "CEP deve conter 8 digitos.";
  if (!s.street || s.street.trim().length < 3) errors.street = "Informe a rua.";
  if (!s.number || !String(s.number).trim()) errors.number = "Informe o numero.";
  if (!s.district || s.district.trim().length < 2) errors.district = "Informe o bairro.";
  if (!s.city || s.city.trim().length < 2) errors.city = "Informe a cidade.";
  if (!/^[A-Za-z]{2}$/.test(String(s.state || "").trim())) errors.state = "Use a sigla do estado.";
  if (!s.shippingMethod) errors.shippingMethod = "Selecione um metodo de entrega.";
  if (s.shippingMethod && !s.shippingQuoteId) {
    errors.shippingMethod = "Recalcule o frete para o CEP informado.";
  }

  Object.entries(errors).forEach(([field, message]) => setFieldError(field, message));
  return { valid: Object.keys(errors).length === 0, errors };
}

function isShippingValidForProgress() {
  const s = checkoutState.shipping;
  return Boolean(
    s.firstName &&
      s.firstName.trim().length >= 2 &&
      s.lastName &&
      s.lastName.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || "").trim()) &&
      String(s.phone || "").replace(/\D/g, "").trim() &&
      /^\d{8}$/.test(String(s.cep || "")) &&
      s.street &&
      s.street.trim().length >= 3 &&
      String(s.number || "").trim() &&
      s.district &&
      s.district.trim().length >= 2 &&
      s.city &&
      s.city.trim().length >= 2 &&
      /^[A-Za-z]{2}$/.test(String(s.state || "").trim()) &&
      s.shippingMethod &&
      s.shippingQuoteId
  );
}

function refreshShippingProgressButton() {
  setButtonDisabled(dom.goToPaymentBtn, !isShippingValidForProgress());
}

function fillShippingForm() {
  shippingFields.forEach((field) => {
    const input = document.getElementById(field);
    if (!input) return;
    if (field === "cep") {
      input.value = formatCepDisplay(checkoutState.shipping[field] || "");
      return;
    }
    input.value = checkoutState.shipping[field] || "";
  });

  const shippingMethod = checkoutState.shipping.shippingMethod;
  if (shippingMethod) {
    const radio = dom.shippingForm?.querySelector(`input[name="shippingMethod"][value="${shippingMethod}"]`);
    if (radio) radio.checked = true;
  }
  syncBillingNameFromShipping();
  syncLockedPrefilledFields();
}

function updateShippingMethodPrices() {
  renderShippingOptionsList(checkoutState.shippingQuoteOptions.list);
  if (checkoutState.shipping.shippingMethod) {
    applyShippingSelectionFromMethod(checkoutState.shipping.shippingMethod);
  }
}

function canQuoteShippingNow() {
  return true;
}

function clearShippingQuotes({ keepSelection = false } = {}) {
  checkoutState.shippingQuoteOptions = {
    list: []
  };
  if (!keepSelection) {
    clearSelectedShippingQuote();
    dom.shippingForm?.querySelectorAll('input[name="shippingMethod"]').forEach((input) => {
      input.checked = false;
    });
  }
  updateShippingMethodPrices();
  updateSummary();
  refreshShippingProgressButton();
}

async function fetchShippingQuotesForCep(cepDigits) {
  const cep = normalizeCepDigits(cepDigits);
  if (!/^\d{8}$/.test(cep)) {
    clearShippingQuotes({ keepSelection: false });
    return;
  }

  if (!canQuoteShippingNow()) return;
  const requestSeq = ++shippingQuoteRequestSeq;
  clearFieldError("shippingMethod");

  try {
    const response = await apiRequest("/api/shipping/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: checkoutState.payment.orderId || undefined,
        destinationZip: cep
      })
    });

    if (requestSeq !== shippingQuoteRequestSeq) return;

    const quotes = Array.isArray(response?.data?.quotes)
      ? response.data.quotes
      : Array.isArray(response?.quotes)
        ? response.quotes
        : [];

    if (!quotes.length) {
      clearShippingQuotes({ keepSelection: false });
      setFieldError("shippingMethod", "Nenhuma opcao de frete disponivel para este CEP.");
      return;
    }

    applyShippingQuotesToUI(quotes);
    saveShipping();
  } catch {
    if (requestSeq !== shippingQuoteRequestSeq) return;
    clearShippingQuotes({ keepSelection: false });
    setFieldError("shippingMethod", "Falha ao cotar frete. Revise o CEP e tente novamente.");
  }
}

function shouldAutofillAddressFromCep() {
  return Boolean(
    !String(checkoutState.shipping.street || "").trim() ||
      !String(checkoutState.shipping.district || "").trim() ||
      !String(checkoutState.shipping.city || "").trim() ||
      !String(checkoutState.shipping.state || "").trim()
  );
}

function normalizeCepLookupPayload(raw) {
  return {
    logradouro: String(raw?.logradouro || raw?.street || "").trim(),
    bairro: String(raw?.bairro || raw?.neighborhood || "").trim(),
    localidade: String(raw?.localidade || raw?.city || "").trim(),
    uf: String(raw?.uf || raw?.state || "").trim().toUpperCase().slice(0, 2),
    complemento: String(raw?.complemento || raw?.service || "").trim()
  };
}

async function fetchCepLookupData(cep, signal) {
  const sources = [
    {
      kind: "viacep",
      url: `https://viacep.com.br/ws/${cep}/json/`,
      map: (payload) => {
        if (!payload || payload.erro) {
          const error = new Error("CEP_NOT_FOUND");
          error.code = "CEP_NOT_FOUND";
          throw error;
        }
        return normalizeCepLookupPayload(payload);
      }
    },
    {
      kind: "brasilapi",
      url: `https://brasilapi.com.br/api/cep/v1/${cep}`,
      map: (payload) => normalizeCepLookupPayload(payload)
    }
  ];

  let lastError = null;
  for (const source of sources) {
    try {
      const response = await fetch(source.url, { signal, cache: "no-store" });
      if (!response.ok) {
        if (response.status === 404 || response.status === 400) {
          const notFoundError = new Error("CEP_NOT_FOUND");
          notFoundError.code = "CEP_NOT_FOUND";
          throw notFoundError;
        }
        throw new Error(`CEP_LOOKUP_HTTP_${response.status}`);
      }
      const data = await response.json().catch(() => ({}));
      return source.map(data);
    } catch (error) {
      if (error && error.name === "AbortError") throw error;
      lastError = error;
      if (error?.code === "CEP_NOT_FOUND") {
        continue;
      }
    }
  }

  if (lastError?.code === "CEP_NOT_FOUND") {
    const notFound = new Error("CEP_NOT_FOUND");
    notFound.code = "CEP_NOT_FOUND";
    throw notFound;
  }
  const failed = new Error("CEP_LOOKUP_FAILED");
  failed.code = "CEP_LOOKUP_FAILED";
  throw failed;
}

function applyAddressFromCepLookup(data) {
  checkoutState.shipping.street = String(data?.logradouro || "").trim();
  checkoutState.shipping.district = String(data?.bairro || "").trim();
  checkoutState.shipping.city = String(data?.localidade || "").trim();
  checkoutState.shipping.state = String(data?.uf || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!String(checkoutState.shipping.complement || "").trim()) {
    checkoutState.shipping.complement = String(data?.complemento || "").trim();
  }
}

async function lookupAddressByCep(cep, { force = false } = {}) {
  if (!/^\d{8}$/.test(String(cep || ""))) return false;

  if (!force && cepLookupCache.has(cep)) {
    applyAddressFromCepLookup(cepLookupCache.get(cep));
    fillShippingForm();
    clearFieldError("cep");
    saveShipping();
    refreshShippingProgressButton();
    return true;
  }

  const requestSeq = ++cepLookupRequestSeq;
  if (cepLookupController) {
    try {
      cepLookupController.abort();
    } catch {}
  }

  const controller = new AbortController();
  cepLookupController = controller;
  setFieldError("cep", "Buscando endereco...");

  try {
    const data = await fetchCepLookupData(cep, controller.signal);

    if (requestSeq !== cepLookupRequestSeq || checkoutState.shipping.cep !== cep) {
      return false;
    }

    cepLookupCache.set(cep, data);
    applyAddressFromCepLookup(data);
    fillShippingForm();
    clearFieldError("cep");
    saveShipping();
    invalidatePaymentSession();
    refreshShippingProgressButton();

    const numberInput = document.getElementById("number");
    if (numberInput instanceof HTMLInputElement && !String(numberInput.value || "").trim()) {
      numberInput.focus();
    }
    return true;
  } catch (error) {
    if (error && error.name === "AbortError") return false;
    if (requestSeq === cepLookupRequestSeq) {
      if (error?.code === "CEP_NOT_FOUND") {
        clearCepAutofilledAddressFields();
        fillShippingForm();
        saveShipping();
        refreshShippingProgressButton();
        setFieldError("cep", "CEP nao encontrado.");
      } else {
        setFieldError("cep", "Falha ao consultar CEP. Tente novamente.");
      }
    }
    return false;
  } finally {
    if (requestSeq === cepLookupRequestSeq) {
      cepLookupController = null;
    }
  }
}

function scheduleCepLookup() {
  if (cepLookupTimeoutId) {
    clearTimeout(cepLookupTimeoutId);
  }

  const cep = normalizeCepDigits(checkoutState.shipping.cep);
  if (!/^\d{8}$/.test(cep)) return;

  cepLookupTimeoutId = setTimeout(() => {
    lookupAddressByCep(cep);
  }, CEP_LOOKUP_DEBOUNCE_MS);
}

async function fillAddressFromCepIfPossible() {
  const cep = normalizeCepDigits(checkoutState.shipping.cep);
  if (!/^\d{8}$/.test(cep)) return;
  await lookupAddressByCep(cep, { force: true });
}

function syncStepperUI() {
  const buttons = Array.from(document.querySelectorAll(".checkout-step-btn"));
  buttons.forEach((button) => {
    const targetStep = Number(button.dataset.stepTarget || 1);
    const isActive = targetStep === checkoutState.currentStep;
    const canAccess = targetStep <= checkoutState.maxStepReached;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-disabled", canAccess ? "false" : "true");
  });
}

function focusFirstFieldInStep(step) {
  const panel = dom.panels[step];
  if (!panel) return;
  const firstField = panel.querySelector("input, select, button");
  if (firstField) firstField.focus();
}

async function ensurePaymentElementReady() {
  if (checkoutState.payment.preparing) return;
  if (!checkoutState.stripe.instance || !dom.paymentElement) return;

  const items = getServerItemsPayload();
  if (items.length === 0) {
    setCheckoutStatus("Seu carrinho estÃ¡ vazio.", "error");
    return;
  }

  const shippingValidation = validateShipping();
  if (!shippingValidation.valid) {
    setCheckoutStatus("Revise os dados de entrega para continuar.", "error");
    return;
  }

  const nextSignature = getPaymentSessionSignature();
  if (
    checkoutState.payment.sessionSignature === nextSignature &&
    checkoutState.payment.paymentElement &&
    checkoutState.payment.clientSecret
  ) {
    return;
  }

  checkoutState.payment.preparing = true;
  setCheckoutStatus("Preparando pagamento...");
  setProcessingState(true);

  try {
    invalidatePaymentSession();

    const shippingPayload = buildShippingPayload();
    const order = await apiRequest("/api/orders/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        paymentMethod: checkoutState.payment.methodPreference || "automatic",
        discountCode: checkoutState.cart.discountCode || "",
        installments: checkoutState.payment.installments,
        shipping: shippingPayload,
        customer: {
          firstName: shippingPayload.firstName,
          lastName: shippingPayload.lastName,
          email: shippingPayload.email,
          phone: shippingPayload.phone,
          cpf: shippingPayload.cpf
        },
        shippingAddress: {
          zip: shippingPayload.cep,
          street: shippingPayload.street,
          number: shippingPayload.number,
          complement: shippingPayload.complement,
          district: shippingPayload.district,
          city: shippingPayload.city,
          state: shippingPayload.state,
          country: shippingPayload.country || "BR"
        },
        cartItems: items,
        totals: {
          subtotal: checkoutState.cart.subtotal,
          shipping: checkoutState.shipping.shippingCost,
          discount: checkoutState.cart.discount,
          total: getSummaryTotal()
        }
      })
    });

    const paymentIntentClientSecret = String(order?.clientSecret || order?.paymentIntentClientSecret || "").trim();
    if (!order || !order.orderId || !paymentIntentClientSecret) {
      throw new Error("NÃ£o foi possÃ­vel iniciar a sessÃ£o de pagamento.");
    }

    const appearance = {
      theme: "stripe",
      variables: {
        colorPrimary: "#141414",
        colorText: "#1f1f1f",
        colorDanger: "#9d1f1f",
        fontFamily: "Montserrat, sans-serif",
        borderRadius: "0px"
      }
    };

    const elements = checkoutState.stripe.instance.elements({
      clientSecret: paymentIntentClientSecret,
      appearance
    });

    const billingName = getBillingName() || String(checkoutState.shipping.fullName || "").trim();
    const paymentElement = elements.create("payment", {
      layout: "tabs",
      wallets: {
        applePay: "auto",
        googlePay: "auto"
      },
      business: { name: "TSEBI" },
      defaultValues: {
        billingDetails: {
          name: billingName
        }
      }
    });

    paymentElement.on("change", (event) => {
      const selectedType = String(event?.value?.type || "automatic");
      const previousType = checkoutState.payment.methodPreference;
      const previousInstallments = checkoutState.payment.installments;
      checkoutState.payment.methodPreference = selectedType;
      syncInstallmentsByPaymentMethod(selectedType);

      if (
        previousType === "card" &&
        selectedType !== "card" &&
        previousInstallments > 1 &&
        checkoutState.currentStep === 3
      ) {
        invalidatePaymentSession();
        setTimeout(() => {
          ensurePaymentElementReady();
        }, 0);
      }
    });

    paymentElement.mount("#payment-element");

    checkoutState.payment = {
      ...checkoutState.payment,
      sessionSignature: nextSignature,
      orderId: order.orderId,
      orderNumber: String(order.orderNumber || "").trim(),
      checkoutEmail: String(order.customerEmail || shippingPayload.email || "").trim(),
      clientSecret: paymentIntentClientSecret,
      elements,
      paymentElement
    };
    if (!checkoutState.payment.orderNumber) {
      // eslint-disable-next-line no-console
      console.error("[checkout] payment-intent sem orderNumber", order);
    }
    saveTrackingContext({
      orderId: checkoutState.payment.orderId,
      orderNumber: checkoutState.payment.orderNumber || "",
      email: checkoutState.payment.checkoutEmail || ""
    });

    setCheckoutStatus("Pagamento pronto.");
  } catch (error) {
    if (isInvalidCartError(error)) {
      const refreshed = await refreshCartFromLatestProducts();
      if (refreshed.ok) {
        const messages = ["Atualizamos seu carrinho porque o estoque ou o preco de um item mudou."];
        if (refreshed.removedOutOfStock) {
          messages.push("Alguns itens foram removidos por falta de estoque.");
        }
        messages.push("Confira o resumo e tente finalizar novamente.");
        setCheckoutStatus(messages.join(" "), "warning");
      } else {
        setCheckoutStatus("Nao foi possivel atualizar seu carrinho agora. Tente novamente em instantes.", "error");
      }
      return;
    }
    setCheckoutStatus(error.message || "Falha ao preparar o pagamento.", "error");
  } finally {
    checkoutState.payment.preparing = false;
    setProcessingState(false);
  }
}

function updateUrlHashForStep(step) {
  const safeStep = Math.max(1, Math.min(3, Number(step) || 1));
  history.replaceState(null, "", `#step=${safeStep}`);
}

function readStepFromHash() {
  const match = String(window.location.hash || "").match(/step=(\d)/i);
  if (!match) return 1;
  const step = Number(match[1]);
  if (!Number.isInteger(step)) return 1;
  return Math.max(1, Math.min(3, step));
}

function goToStep(step) {
  const target = Math.max(1, Math.min(3, Number(step) || 1));
  if (target > checkoutState.maxStepReached) return;

  Object.entries(dom.panels).forEach(([panelStep, panel]) => {
    if (!panel) return;
    const numericStep = Number(panelStep);
    const isTarget = numericStep === target;
    panel.hidden = !isTarget;
    panel.classList.toggle("is-active", isTarget);
  });

  checkoutState.currentStep = target;
  updateUrlHashForStep(target);
  syncStepperUI();
  setTimeout(() => focusFirstFieldInStep(target), 120);

  if (target === 3) {
    ensurePaymentElementReady();
  }
}

function advanceToStep(step) {
  checkoutState.maxStepReached = Math.max(checkoutState.maxStepReached, step);
  goToStep(step);
}

async function handleCheckoutSubmit() {
  if (!checkoutState.stripe.instance || !checkoutState.payment.elements || !checkoutState.payment.orderId) {
    await ensurePaymentElementReady();
    if (!checkoutState.payment.elements || !checkoutState.payment.orderId) return;
  }

  setCheckoutStatus("");
  if (!validateBillingName()) {
    setCheckoutStatus("Informe o nome do titular para continuar.", "error");
    dom.billingName?.focus();
    return;
  }
  setProcessingState(true);

  try {
    const checkoutEmail = String(
      checkoutState.payment.checkoutEmail ||
        checkoutState.shipping.email ||
        ""
    ).trim();
    const orderNumber = String(checkoutState.payment.orderNumber || "").trim();
    const returnUrl = `${window.location.origin}/payment-result.html?orderId=${encodeURIComponent(
      checkoutState.payment.orderId
    )}&orderNumber=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(checkoutEmail)}`;

    const billingName = getBillingName();
    const result = await checkoutState.stripe.instance.confirmPayment({
      elements: checkoutState.payment.elements,
      confirmParams: {
        return_url: returnUrl,
        payment_method_data: {
          billing_details: {
            name: billingName
          }
        }
      },
      redirect: "if_required"
    });

    if (result.error) {
      setCheckoutStatus(result.error.message || "NÃ£o foi possÃ­vel confirmar o pagamento.", "error");
      return;
    }

    if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
      saveCart([]);
    }

    saveTrackingContext({
      orderId: checkoutState.payment.orderId,
      orderNumber: orderNumber || "",
      email: checkoutEmail || ""
    });

    window.location.href = `payment-result.html?orderId=${encodeURIComponent(checkoutState.payment.orderId)}&orderNumber=${encodeURIComponent(orderNumber || "")}&email=${encodeURIComponent(checkoutEmail || "")}`;
  } catch (error) {
    setCheckoutStatus(error.message || "NÃ£o foi possÃ­vel finalizar seu pagamento.", "error");
  } finally {
    setProcessingState(false);
  }
}

async function initStripe() {
  if (!window.Stripe) return;

  try {
    const config = await apiRequest("/api/config", { method: "GET" });
    checkoutState.config = config;
    if (!config.stripePublishableKey) {
      setCheckoutStatus("Checkout indisponÃ­vel no momento.", "error");
      setButtonDisabled(dom.checkoutButton, true);
      return;
    }

    checkoutState.stripe.instance = window.Stripe(config.stripePublishableKey);
    setButtonDisabled(dom.checkoutButton, false);
    if (checkoutState.currentStep === 3) {
      ensurePaymentElementReady();
    }
  } catch {
    setCheckoutStatus("NÃ£o foi possÃ­vel iniciar o pagamento.", "error");
    setButtonDisabled(dom.checkoutButton, true);
  }
}

function onShippingFieldInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const { id } = target;
  if (!shippingFields.includes(id)) return;
  const previousCep = id === "cep" ? normalizeCepDigits(checkoutState.shipping.cep) : "";

  let value = target.value;
  if (id === "cep") value = normalizeCepDigits(value);
  if (id === "state") value = value.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();

  target.value = id === "cep" ? formatCepDisplay(value) : value;
  if (target.readOnly) return;
  checkoutState.shipping[id] = value;
  clearFieldError(id);
  saveShipping();
  invalidatePaymentSession();

  if (id === "cep") {
    if (value !== previousCep) {
      clearCepAutofilledAddressFields();
      clearShippingQuotes({ keepSelection: false });
      fillShippingForm();
      saveShipping();
    }
    if (!/^\d{8}$/.test(value)) {
      clearShippingQuotes({ keepSelection: false });
    } else {
      fetchShippingQuotesForCep(value);
    }
    updateSummary();
    scheduleCepLookup();
  }
  if (id === "firstName" || id === "lastName") {
    checkoutState.shipping.fullName = getShippingFullName();
    syncBillingNameFromShipping();
  }
  refreshShippingProgressButton();
}

function onShippingMethodChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.name !== "shippingMethod") return;

  const selectedFromQuote = applyShippingSelectionFromMethod(target.value);
  if (!selectedFromQuote) {
    clearSelectedShippingQuote();
    setFieldError("shippingMethod", "Recalcule o frete para este CEP.");
    updateSummary();
    refreshShippingProgressButton();
    return;
  }
  clearFieldError("shippingMethod");
  saveShipping();
  invalidatePaymentSession();
  updateSummary();
  refreshShippingProgressButton();
}

function bindEvents() {
  dom.cartItems?.addEventListener("click", (event) => {
    const targetNode = event.target;
    if (!(targetNode instanceof Node)) return;
    const targetElement = targetNode instanceof Element ? targetNode : targetNode.parentElement;
    if (!(targetElement instanceof Element)) return;
    const actionButton = targetElement.closest("[data-action][data-key]");
    if (!(actionButton instanceof HTMLElement)) return;
    const action = actionButton.getAttribute("data-action");
    const key = actionButton.getAttribute("data-key");
    if (!action || !key) return;

    if (action === "increase") updateItemQuantity(key, 1);
    if (action === "decrease") updateItemQuantity(key, -1);
    if (action === "remove") removeItem(key);
  });

  dom.goToShippingBtn?.addEventListener("click", () => {
    if (checkoutState.cart.items.length === 0) return;
    advanceToStep(2);
  });

  dom.applyAccessCodeBtn?.addEventListener("click", () => {
    const code = String(dom.accessCodeInput?.value || "");
    applyAccessCode(code, { silent: false });
  });

  dom.accessCodeInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = String(dom.accessCodeInput?.value || "");
    applyAccessCode(code, { silent: false });
  });

  dom.shippingForm?.addEventListener("input", onShippingFieldInput);
  dom.shippingForm?.addEventListener("change", onShippingMethodChange);
  dom.shippingForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const validation = validateShipping();
    if (!validation.valid) return;
    saveShipping();
    advanceToStep(3);
  });

  document.querySelectorAll("[data-go-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = Number(button.getAttribute("data-go-step") || 1);
      goToStep(target);
    });
  });

  dom.stepper?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".checkout-step-btn");
    if (!button) return;
    const step = Number(button.dataset.stepTarget || 1);
    if (step > checkoutState.maxStepReached) return;
    goToStep(step);
  });

  dom.installments?.addEventListener("change", () => {
    if ((checkoutState.payment.methodPreference || "automatic") !== "card") {
      checkoutState.payment.installments = 1;
      dom.installments.value = "1";
      updateInstallmentsOptions();
      return;
    }
    checkoutState.payment.installments = Math.max(1, Math.min(6, Number(dom.installments.value || 1)));
    updateInstallmentsOptions();
    invalidatePaymentSession();
    if (checkoutState.currentStep === 3) ensurePaymentElementReady();
  });

  dom.checkoutButton?.addEventListener("click", handleCheckoutSubmit);

  dom.billingName?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    checkoutState.payment.billingName = String(target.value || "").trimStart();
    checkoutState.payment.billingNameTouched = true;
    setBillingNameError("");
  });

  const cepInput = document.getElementById("cep");
  cepInput?.addEventListener("blur", fillAddressFromCepIfPossible);

  dom.summaryCollapseBtn?.addEventListener("click", () => {
    const expanded = dom.summary?.classList.toggle("is-expanded");
    dom.summaryCollapseBtn?.setAttribute("aria-expanded", expanded ? "true" : "false");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === CART_KEY) {
      checkoutState.cart.items = readCart();
      invalidatePaymentSession();
      renderCartItems();
    }
  });

  window.addEventListener("tsebi:auth-changed", () => {
    const nextUserId = getCurrentAuthUserId();
    if (nextUserId !== checkoutState.authUserId) {
      checkoutState.authUserId = nextUserId;
      checkoutState.shippingStorageKey = getShippingStorageKey(nextUserId);
      const persistedShipping = readShipping(checkoutState.shippingStorageKey);
      checkoutState.shipping = {
        ...DEFAULT_SHIPPING_STATE,
        ...persistedShipping
      };
      checkoutState.shipping.fullName = getShippingFullName();
      if (!checkoutState.shipping.country) checkoutState.shipping.country = "BR";
      clearSelectedShippingQuote();
      checkoutState.payment.billingName = "";
      checkoutState.payment.billingNameTouched = false;
    }

    prefillShippingFromUser();
    saveShipping();
    fillShippingForm();
    renderCheckoutAuthCta();
    updateShippingMethodPrices();
    if (/^\d{8}$/.test(normalizeCepDigits(checkoutState.shipping.cep || ""))) {
      fetchShippingQuotesForCep(checkoutState.shipping.cep);
    } else {
      clearShippingQuotes({ keepSelection: false });
    }
    updateSummary();
    refreshShippingProgressButton();
    invalidatePaymentSession();
  });
}

function hydrateState() {
  checkoutState.cart.items = readCart();
  checkoutState.authUserId = getCurrentAuthUserId();
  checkoutState.shippingStorageKey = getShippingStorageKey(checkoutState.authUserId);

  // Cleanup old global key to avoid cross-account leaks from previous versions.
  try {
    localStorage.removeItem(SHIPPING_KEY_LEGACY);
  } catch {}

  const persistedShipping = readShipping(checkoutState.shippingStorageKey);
  checkoutState.shipping = {
    ...DEFAULT_SHIPPING_STATE,
    ...persistedShipping
  };
  checkoutState.shipping.fullName = getShippingFullName();
  if (!checkoutState.shipping.country) checkoutState.shipping.country = "BR";
  clearSelectedShippingQuote();
  prefillShippingFromUser();
  checkoutState.shipping.fullName = getShippingFullName();
  checkoutState.payment.billingName = String(checkoutState.shipping.fullName || "").trim();
  checkoutState.payment.billingNameTouched = false;
  saveShipping();
}

async function init() {
  hydrateState();
  bindEvents();
  renderCartItems();
  fillShippingForm();
  if (dom.billingName) dom.billingName.value = checkoutState.payment.billingName || "";
  renderCheckoutAuthCta();
  updateShippingMethodPrices();
  if (/^\d{8}$/.test(normalizeCepDigits(checkoutState.shipping.cep || "")) && canQuoteShippingNow()) {
    fetchShippingQuotesForCep(checkoutState.shipping.cep);
  }
  syncInstallmentsByPaymentMethod(checkoutState.payment.methodPreference);
  syncLockedPrefilledFields();
  refreshShippingProgressButton();
  updateSummary();
  syncStepperUI();
  const requestedStep = readStepFromHash();
  goToStep(1);
  if (requestedStep >= 2) {
    checkoutState.maxStepReached = Math.max(checkoutState.maxStepReached, requestedStep);
    goToStep(requestedStep);
  }

  if (/^\d{8}$/.test(checkoutState.shipping.cep) && shouldAutofillAddressFromCep()) {
    fillAddressFromCepIfPossible();
  }

  initStripe();
}

init();
})();



