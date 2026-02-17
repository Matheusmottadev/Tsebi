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
const LOGIN_REQUIRED_MESSAGE = "Para finalizar sua compra, entre ou crie sua conta.";
const CEP_LOOKUP_DEBOUNCE_MS = 450;
const cepLookupCache = new Map();
let cepLookupTimeoutId = 0;
let cepLookupController = null;
let cepLookupRequestSeq = 0;
let shippingQuoteRequestSeq = 0;

const checkoutState = {
  currentStep: 1,
  maxStepReached: 1,
  cart: {
    items: [],
    subtotal: 0,
    discount: 0
  },
  shipping: {
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
    standard: null,
    express: null
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
  summary: document.getElementById("checkoutSummary"),
  summaryCollapseBtn: document.getElementById("summaryCollapseBtn"),
  shippingStandardPrice: document.getElementById("shippingStandardPrice"),
  shippingExpressPrice: document.getElementById("shippingExpressPrice")
  ,
  checkoutAuthCta: document.getElementById("checkoutAuthCta"),
  headerCartLinks: Array.from(document.querySelectorAll('a[aria-label="Carrinho"]'))
};

const shippingFields = [
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
  "state"
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
          image: String(item.image || item.img || "images/produtos/sug1.jpeg"),
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

function getInstallmentsTotal() {
  return Math.max(0, Number(getSummaryTotal() || 0));
}

function updateInstallmentsPreview(isCard) {
  if (!dom.installmentsPreview) return;
  if (!isCard) {
    dom.installmentsPreview.textContent = "Parcelamento disponível apenas para pagamentos com cartão.";
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

function getShippingOptionElements(methodCode) {
  const radio = dom.shippingForm?.querySelector(`input[name="shippingMethod"][value="${methodCode}"]`) || null;
  if (!(radio instanceof HTMLInputElement)) {
    return { radio: null, textEl: null, priceEl: null };
  }
  const option = radio.closest(".shipping-option");
  if (!(option instanceof HTMLElement)) {
    return { radio, textEl: null, priceEl: null };
  }
  const textEl = option.querySelector("span");
  const priceEl = option.querySelector("strong");
  return {
    radio,
    textEl: textEl instanceof HTMLElement ? textEl : null,
    priceEl: priceEl instanceof HTMLElement ? priceEl : null
  };
}

function ensureShippingOptionDefaults() {
  ["standard", "express"].forEach((methodCode) => {
    const elements = getShippingOptionElements(methodCode);
    if (!elements.textEl) return;
    if (!elements.textEl.dataset.defaultLabel) {
      elements.textEl.dataset.defaultLabel = elements.textEl.textContent || "";
    }
  });
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

function applyShippingQuoteOption(methodCode, quote) {
  const elements = getShippingOptionElements(methodCode);
  if (!elements.radio) return;

  if (!quote) {
    elements.radio.disabled = true;
    elements.radio.checked = false;
    elements.radio.removeAttribute("data-quote-id");
    elements.radio.removeAttribute("data-provider");
    elements.radio.removeAttribute("data-service-code");
    elements.radio.removeAttribute("data-service-name");
    elements.radio.removeAttribute("data-carrier-name");
    elements.radio.removeAttribute("data-deadline-days");
    if (elements.textEl) {
      elements.textEl.textContent = elements.textEl.dataset.defaultLabel || elements.textEl.textContent || "";
    }
    if (elements.priceEl) {
      elements.priceEl.textContent = formatCurrency(0);
    }
    return;
  }

  elements.radio.disabled = false;
  elements.radio.dataset.quoteId = String(quote.id || "");
  elements.radio.dataset.provider = String(quote.provider || "");
  elements.radio.dataset.serviceCode = String(quote.serviceCode || "");
  elements.radio.dataset.serviceName = String(quote.serviceName || "");
  elements.radio.dataset.carrierName = String(quote.carrierName || "");
  elements.radio.dataset.deadlineDays = quote.deadlineDays == null ? "" : String(quote.deadlineDays);

  if (elements.textEl) {
    const deadlineText =
      quote.deadlineDays == null || Number(quote.deadlineDays) <= 0
        ? "sem prazo estimado"
        : `${quote.deadlineDays} dias`;
    elements.textEl.textContent = `${quote.serviceName} (${deadlineText})`;
  }
  if (elements.priceEl) {
    elements.priceEl.textContent = formatCurrency(Number(quote.priceCents || 0) / 100);
  }
}

function applyShippingSelectionFromMethod(methodCode) {
  const quote = checkoutState.shippingQuoteOptions?.[methodCode] || null;
  if (!quote) {
    clearSelectedShippingQuote();
    return false;
  }

  checkoutState.shipping.shippingMethod = methodCode;
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

function applyShippingQuotesToUI(quotes) {
  const sorted = (Array.isArray(quotes) ? quotes : [])
    .slice()
    .sort((a, b) => Number(a?.priceCents || 0) - Number(b?.priceCents || 0));

  checkoutState.shippingQuoteOptions = {
    standard: sorted[0] || null,
    express: sorted[1] || null
  };

  applyShippingQuoteOption("standard", checkoutState.shippingQuoteOptions.standard);
  applyShippingQuoteOption("express", checkoutState.shippingQuoteOptions.express);

  if (checkoutState.shipping.shippingMethod) {
    const selected = applyShippingSelectionFromMethod(checkoutState.shipping.shippingMethod);
    if (!selected) {
      clearFieldError("shippingMethod");
    }
  }

  updateSummary();
  refreshShippingProgressButton();
}

function getSummaryTotal() {
  return checkoutState.cart.subtotal + checkoutState.shipping.shippingCost - checkoutState.cart.discount;
}

function updateSummary() {
  if (dom.summarySubtotal) dom.summarySubtotal.textContent = formatCurrency(checkoutState.cart.subtotal);
  if (dom.summaryShipping) dom.summaryShipping.textContent = formatCurrency(checkoutState.shipping.shippingCost);
  if (dom.summaryDiscount) dom.summaryDiscount.textContent = formatCurrency(checkoutState.cart.discount);
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
    const safeImage = String(item?.image || "images/produtos/sug1.jpeg");
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
    variant.textContent = `${safeColor} / ${safeSize}`;

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

function buildShippingPayload() {
  return {
    fullName: checkoutState.shipping.fullName.trim(),
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

function renderCheckoutAuthCta() {
  if (!dom.checkoutAuthCta) return;
  const user = userStore?.getCurrentUser?.() || null;
  if (user) {
    dom.checkoutAuthCta.textContent = `Você está comprando como ${user.email}.`;
    return;
  }
  dom.checkoutAuthCta.innerHTML = `${LOGIN_REQUIRED_MESSAGE} <a href="${getLoginUrlForStep(2)}">Entrar agora</a>.`;
}

function prefillShippingFromUser() {
  const user = userStore?.getCurrentUser?.() || null;
  if (!user) return;
  const addresses = Array.isArray(user.addresses) ? user.addresses : [];
  const defaultAddress =
    addresses.find((address) => address && address.id === user.defaultAddressId) ||
    addresses.find((address) => address && address.isDefault) ||
    null;

  if (!checkoutState.shipping.fullName) checkoutState.shipping.fullName = String(user.name || "").trim();
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

  const user = userStore?.getCurrentUser?.() || null;
  if (!user) {
    setFieldLocked("fullName", false);
    setFieldLocked("email", false);
    setFieldLocked("cpf", false);
    setFieldLocked("cep", false);
    return;
  }

  setFieldLocked("fullName", false);
  setFieldLocked("email", false);
  setFieldLocked("cpf", Boolean(String(user.cpf || "").trim()));
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
    installments: checkoutState.payment.installments
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

function getLoginUrlForStep(step = 2) {
  const safeStep = Math.max(2, Math.min(3, Number(step) || 2));
  const hash = `#step=${safeStep}`;
  const returnUrl = `${window.location.pathname}${window.location.search}${hash}`;
  return `conta.html?returnUrl=${encodeURIComponent(returnUrl)}`;
}

function redirectToLogin(step = 2) {
  window.location.href = getLoginUrlForStep(step);
}

async function ensureAuthenticatedOrRedirect(step = 2) {
  if (!userStore) {
    redirectToLogin(step);
    return false;
  }

  const cachedUser = userStore.getCurrentUser?.() || null;
  if (!cachedUser) {
    setCheckoutStatus(LOGIN_REQUIRED_MESSAGE, "error");
    redirectToLogin(step);
    return false;
  }

  const me = await userStore.fetchMe();
  if (me.ok && me.user) return true;
  if (String(me?.code || "") !== "UNAUTHORIZED") {
    setCheckoutStatus("Nao foi possivel validar sua sessao agora. Tente novamente.", "warning");
    return true;
  }

  setCheckoutStatus(LOGIN_REQUIRED_MESSAGE, "error");
  redirectToLogin(step);
  return false;
}

function invalidatePaymentSession() {
  if (checkoutState.payment.paymentElement) {
    checkoutState.payment.paymentElement.unmount();
  }
  checkoutState.payment = {
    ...checkoutState.payment,
    sessionSignature: "",
    orderId: "",
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

  if (!s.fullName || s.fullName.trim().length < 3) errors.fullName = "Informe seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || "").trim())) errors.email = "Informe um email válido.";
  if (!/^\d{8}$/.test(String(s.cep || ""))) errors.cep = "CEP deve conter 8 dígitos.";
  if (!s.street || s.street.trim().length < 3) errors.street = "Informe a rua.";
  if (!s.number || !String(s.number).trim()) errors.number = "Informe o número.";
  if (!s.district || s.district.trim().length < 2) errors.district = "Informe o bairro.";
  if (!s.city || s.city.trim().length < 2) errors.city = "Informe a cidade.";
  if (!/^[A-Za-z]{2}$/.test(String(s.state || "").trim())) errors.state = "Use a sigla do estado.";
  if (!s.shippingMethod) errors.shippingMethod = "Selecione um método de entrega.";
  if (s.shippingMethod && !s.shippingQuoteId) {
    errors.shippingMethod = "Recalcule o frete para o CEP informado.";
  }

  Object.entries(errors).forEach(([field, message]) => setFieldError(field, message));
  return { valid: Object.keys(errors).length === 0, errors };
}

function isShippingValidForProgress() {
  const s = checkoutState.shipping;
  return Boolean(
    s.fullName &&
      s.fullName.trim().length >= 3 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || "").trim()) &&
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
  ensureShippingOptionDefaults();

  const hasQuoteOptions = Boolean(
    checkoutState.shippingQuoteOptions.standard || checkoutState.shippingQuoteOptions.express
  );

  if (hasQuoteOptions) {
    applyShippingQuoteOption("standard", checkoutState.shippingQuoteOptions.standard);
    applyShippingQuoteOption("express", checkoutState.shippingQuoteOptions.express);
    if (checkoutState.shipping.shippingMethod) {
      applyShippingSelectionFromMethod(checkoutState.shipping.shippingMethod);
    }
    return;
  }
  applyShippingQuoteOption("standard", null);
  applyShippingQuoteOption("express", null);
}

function canQuoteShippingNow() {
  const user = userStore?.getCurrentUser?.() || null;
  return Boolean(user && user.id);
}

function clearShippingQuotes({ keepSelection = false } = {}) {
  checkoutState.shippingQuoteOptions = {
    standard: null,
    express: null
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
  const isAuthenticated = await ensureAuthenticatedOrRedirect(3);
  if (!isAuthenticated) return;

  const items = getServerItemsPayload();
  if (items.length === 0) {
    setCheckoutStatus("Seu carrinho está vazio.", "error");
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

    const order = await apiRequest("/api/orders/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        paymentMethod: checkoutState.payment.methodPreference || "automatic",
        installments: checkoutState.payment.installments,
        shipping: buildShippingPayload()
      })
    });

    if (!order || !order.orderId || !order.clientSecret) {
      throw new Error("Não foi possível iniciar a sessão de pagamento.");
    }

    if (checkoutState.shipping.shippingQuoteId) {
      await apiRequest(`/api/orders/${encodeURIComponent(order.orderId)}/shipping/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: checkoutState.shipping.shippingQuoteId,
          destinationZip: normalizeCepDigits(checkoutState.shipping.cep)
        })
      });
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
      clientSecret: order.clientSecret,
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
      clientSecret: order.clientSecret,
      elements,
      paymentElement
    };

    setCheckoutStatus("Pagamento pronto.");
  } catch (error) {
    if (error.status === 401 || error.code === "UNAUTHORIZED") {
      setCheckoutStatus(LOGIN_REQUIRED_MESSAGE, "error");
      redirectToLogin(3);
      return;
    }
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
  const isAuthenticated = await ensureAuthenticatedOrRedirect(3);
  if (!isAuthenticated) return;

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
    const returnUrl = `${window.location.origin}/payment-result.html?orderId=${encodeURIComponent(
      checkoutState.payment.orderId
    )}`;

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
      setCheckoutStatus(result.error.message || "Não foi possível confirmar o pagamento.", "error");
      return;
    }

    if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
      saveCart([]);
    }

    window.location.href = `payment-result.html?orderId=${encodeURIComponent(checkoutState.payment.orderId)}`;
  } catch (error) {
    setCheckoutStatus(error.message || "Não foi possível finalizar seu pagamento.", "error");
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
      setCheckoutStatus("Checkout indisponível no momento.", "error");
      setButtonDisabled(dom.checkoutButton, true);
      return;
    }

    checkoutState.stripe.instance = window.Stripe(config.stripePublishableKey);
    setButtonDisabled(dom.checkoutButton, false);
    if (checkoutState.currentStep === 3) {
      ensurePaymentElementReady();
    }
  } catch {
    setCheckoutStatus("Não foi possível iniciar o pagamento.", "error");
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
  if (id === "fullName") {
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

  dom.goToShippingBtn?.addEventListener("click", async () => {
    if (checkoutState.cart.items.length === 0) return;
    const isAuthenticated = await ensureAuthenticatedOrRedirect(2);
    if (!isAuthenticated) return;
    advanceToStep(2);
  });

  dom.shippingForm?.addEventListener("input", onShippingFieldInput);
  dom.shippingForm?.addEventListener("change", onShippingMethodChange);
  dom.shippingForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const isAuthenticated = await ensureAuthenticatedOrRedirect(3);
    if (!isAuthenticated) return;
    const validation = validateShipping();
    if (!validation.valid) return;
    saveShipping();
    advanceToStep(3);
  });

  document.querySelectorAll("[data-go-step]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = Number(button.getAttribute("data-go-step") || 1);
      if (target >= 2) {
        const isAuthenticated = await ensureAuthenticatedOrRedirect(target);
        if (!isAuthenticated) return;
      }
      goToStep(target);
    });
  });

  dom.stepper?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".checkout-step-btn");
    if (!button) return;
    const step = Number(button.dataset.stepTarget || 1);
    if (step > checkoutState.maxStepReached) return;
    if (step >= 2) {
      const isAuthenticated = await ensureAuthenticatedOrRedirect(step);
      if (!isAuthenticated) return;
    }
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
    const user = userStore?.getCurrentUser?.() || null;
    if (!user && checkoutState.currentStep > 1) {
      checkoutState.maxStepReached = 1;
      goToStep(1);
      setCheckoutStatus(LOGIN_REQUIRED_MESSAGE, "error");
    }
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
  clearSelectedShippingQuote();
  prefillShippingFromUser();
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
    const isAuthenticated = await ensureAuthenticatedOrRedirect(requestedStep);
    if (isAuthenticated) {
      checkoutState.maxStepReached = Math.max(checkoutState.maxStepReached, requestedStep);
      goToStep(requestedStep);
    }
  }

  if (/^\d{8}$/.test(checkoutState.shipping.cep) && shouldAutofillAddressFromCep()) {
    fillAddressFromCepIfPossible();
  }

  initStripe();
}

init();
})();

