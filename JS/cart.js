const CART_KEY = "tsebi-cart-v1";
const SHIPPING_KEY = "tsebi-checkout-shipping-v1";

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
    shippingEstimate: ""
  },
  payment: {
    method: "card",
    installments: 1
  },
  stripe: {
    instance: null,
    cardElement: null
  }
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
  paymentMethod: document.getElementById("paymentMethod"),
  installments: document.getElementById("installments"),
  installmentsField: document.getElementById("installmentsField"),
  cardElementWrap: document.getElementById("cardElementWrap"),
  cardElement: document.getElementById("cardElement"),
  summarySubtotal: document.getElementById("summarySubtotal"),
  summaryShipping: document.getElementById("summaryShipping"),
  summaryDiscount: document.getElementById("summaryDiscount"),
  summaryTotal: document.getElementById("summaryTotal"),
  summaryEstimate: document.getElementById("summaryEstimate"),
  summary: document.getElementById("checkoutSummary"),
  summaryCollapseBtn: document.getElementById("summaryCollapseBtn"),
  shippingStandardPrice: document.getElementById("shippingStandardPrice"),
  shippingExpressPrice: document.getElementById("shippingExpressPrice")
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

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {}
}

function saveShipping() {
  try {
    localStorage.setItem(SHIPPING_KEY, JSON.stringify(checkoutState.shipping));
  } catch {}
}

function readShipping() {
  try {
    const raw = localStorage.getItem(SHIPPING_KEY);
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

function setButtonDisabled(button, disabled) {
  if (!button) return;
  button.disabled = Boolean(disabled);
  button.setAttribute("aria-disabled", disabled ? "true" : "false");
}

function setCheckoutStatus(message, type = "") {
  if (!dom.checkoutStatus) return;
  dom.checkoutStatus.textContent = message || "";
  dom.checkoutStatus.classList.remove("is-error", "is-success");
  if (type === "error") dom.checkoutStatus.classList.add("is-error");
  if (type === "success") dom.checkoutStatus.classList.add("is-success");
}

function getShippingOptionsFromCep(cepDigits) {
  const firstDigit = Number(String(cepDigits || "")[0] || 0);
  let standard = 29;
  let express = 49;

  if (firstDigit <= 3) {
    standard = 22;
    express = 39;
  } else if (firstDigit >= 7) {
    standard = 34;
    express = 56;
  }

  return {
    standard: { code: "standard", label: "Padrão", estimate: "3-7 dias", price: standard },
    express: { code: "express", label: "Expressa", estimate: "1-3 dias", price: express }
  };
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
      : "Selecione um método de entrega para ver o prazo estimado.";
  }
}

function recalcCartTotals() {
  let subtotal = 0;
  checkoutState.cart.items.forEach((item) => {
    const qty = Math.max(1, Number(item.qty) || 1);
    subtotal += parsePriceLabel(item.priceLabel) * qty;
  });
  checkoutState.cart.subtotal = subtotal;
  updateSummary();
}

function renderCartItems() {
  if (!dom.cartItems || !dom.cartEmpty) return;

  const hasItems = checkoutState.cart.items.length > 0;
  dom.cartItems.innerHTML = "";
  dom.cartEmpty.hidden = hasItems;

  setButtonDisabled(dom.goToShippingBtn, !hasItems);

  if (!hasItems) {
    updateSummary();
    return;
  }

  checkoutState.cart.items.forEach((item) => {
    const qty = Math.max(1, Number(item.qty) || 1);
    const unit = parsePriceLabel(item.priceLabel);
    const total = unit * qty;
    const key = item.key || item.id;

    const article = document.createElement("article");
    article.className = "cart-item-v2";
    article.innerHTML = `
      <img src="${item.image}" alt="${item.name}" loading="lazy" decoding="async" />
      <div>
        <h3>${item.name}</h3>
        <p>${item.priceLabel}</p>
        <p>${item.color || "-"} / ${item.size || "-"}</p>
        <div class="cart-item-controls">
          <button type="button" data-action="decrease" data-key="${key}" aria-label="Diminuir quantidade">-</button>
          <span>${qty}</span>
          <button type="button" data-action="increase" data-key="${key}" aria-label="Aumentar quantidade">+</button>
          <button type="button" data-action="remove" data-key="${key}">Remover</button>
        </div>
      </div>
      <strong class="cart-item-price">${formatCurrency(total)}</strong>
    `;

    dom.cartItems.appendChild(article);
  });

  recalcCartTotals();
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
  renderCartItems();
}

function removeItem(key) {
  checkoutState.cart.items = checkoutState.cart.items.filter((entry) => (entry.key || entry.id) !== key);
  saveCart(checkoutState.cart.items);
  renderCartItems();
}

function getServerItemsPayload() {
  const grouped = new Map();
  checkoutState.cart.items.forEach((item) => {
    if (!item || !item.id) return;
    const qty = Math.max(1, Number(item.qty) || 1);
    grouped.set(item.id, (grouped.get(item.id) || 0) + qty);
  });
  return Array.from(grouped.entries()).map(([id, qty]) => ({ id, qty }));
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
  const errors = {};
  const s = checkoutState.shipping;

  if (!s.fullName || s.fullName.trim().length < 3) errors.fullName = "Informe seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || "").trim())) errors.email = "Informe um email válido.";
  if (!/^\d{8}$/.test(String(s.cep || ""))) errors.cep = "CEP deve conter 8 dígitos.";
  if (!s.street || s.street.trim().length < 3) errors.street = "Informe a rua.";
  if (!s.number || !String(s.number).trim()) errors.number = "Informe o número.";
  if (!s.district || s.district.trim().length < 2) errors.district = "Informe o bairro.";
  if (!s.city || s.city.trim().length < 2) errors.city = "Informe a cidade.";
  if (!/^[A-Za-z]{2}$/.test(String(s.state || "").trim())) errors.state = "Use a sigla do estado.";
  if (!s.shippingMethod) errors.shippingMethod = "Selecione um método de entrega.";

  Object.entries(errors).forEach(([field, message]) => setFieldError(field, message));
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

function isShippingValidForProgress() {
  const s = checkoutState.shipping;
  const isNameValid = Boolean(s.fullName && s.fullName.trim().length >= 3);
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || "").trim());
  const isCepValid = /^\d{8}$/.test(String(s.cep || ""));
  const isStreetValid = Boolean(s.street && s.street.trim().length >= 3);
  const isNumberValid = Boolean(String(s.number || "").trim());
  const isDistrictValid = Boolean(s.district && s.district.trim().length >= 2);
  const isCityValid = Boolean(s.city && s.city.trim().length >= 2);
  const isStateValid = /^[A-Za-z]{2}$/.test(String(s.state || "").trim());
  const hasShippingMethod = Boolean(s.shippingMethod);
  return (
    isNameValid &&
    isEmailValid &&
    isCepValid &&
    isStreetValid &&
    isNumberValid &&
    isDistrictValid &&
    isCityValid &&
    isStateValid &&
    hasShippingMethod
  );
}

function refreshShippingProgressButton() {
  setButtonDisabled(dom.goToPaymentBtn, !isShippingValidForProgress());
}

function fillShippingForm() {
  shippingFields.forEach((field) => {
    const input = document.getElementById(field);
    if (input) input.value = checkoutState.shipping[field] || "";
  });

  const shippingMethod = checkoutState.shipping.shippingMethod;
  if (shippingMethod) {
    const radio = dom.shippingForm?.querySelector(`input[name="shippingMethod"][value="${shippingMethod}"]`);
    if (radio) radio.checked = true;
  }
}

function updateShippingMethodPrices() {
  const options = getShippingOptionsFromCep(checkoutState.shipping.cep || "");
  if (dom.shippingStandardPrice) dom.shippingStandardPrice.textContent = formatCurrency(options.standard.price);
  if (dom.shippingExpressPrice) dom.shippingExpressPrice.textContent = formatCurrency(options.express.price);

  if (!checkoutState.shipping.shippingMethod) return;
  const selected = options[checkoutState.shipping.shippingMethod];
  if (!selected) return;
  checkoutState.shipping.shippingCost = selected.price;
  checkoutState.shipping.shippingEstimate = selected.estimate;
}

async function fillAddressFromCepIfPossible() {
  const cep = String(checkoutState.shipping.cep || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) return;
  setFieldError("cep", "Buscando endereço...");

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (!response.ok || data.erro) {
      setFieldError("cep", "Não foi possível localizar este CEP.");
      return;
    }

    checkoutState.shipping.street = data.logradouro || checkoutState.shipping.street;
    checkoutState.shipping.district = data.bairro || checkoutState.shipping.district;
    checkoutState.shipping.city = data.localidade || checkoutState.shipping.city;
    checkoutState.shipping.state = data.uf || checkoutState.shipping.state;
    fillShippingForm();
    clearFieldError("cep");
    saveShipping();
  } catch {
    setFieldError("cep", "Falha ao consultar CEP. Preencha o endereço manualmente.");
  }
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
  syncStepperUI();
  setTimeout(() => focusFirstFieldInStep(target), 120);
}

function advanceToStep(step) {
  checkoutState.maxStepReached = Math.max(checkoutState.maxStepReached, step);
  goToStep(step);
}

function syncPaymentFields() {
  const method = dom.paymentMethod ? dom.paymentMethod.value : "card";
  checkoutState.payment.method = method;
  const isCard = method === "card";
  if (dom.installmentsField) dom.installmentsField.style.display = isCard ? "grid" : "none";
  if (dom.cardElementWrap) dom.cardElementWrap.style.display = isCard ? "grid" : "none";
}

async function apiRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Falha na comunicação com o servidor.");
  }
  return data;
}

function setProcessingState(processing) {
  setButtonDisabled(dom.checkoutButton, processing);
  if (!dom.checkoutButton) return;
  dom.checkoutButton.textContent = processing ? "Processando..." : "Finalizar compra";
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
    shippingEstimate: checkoutState.shipping.shippingEstimate
  };
}

async function handleCheckoutSubmit() {
  if (!checkoutState.stripe.instance) {
    setCheckoutStatus("Pagamento indisponível no momento.", "error");
    return;
  }

  const items = getServerItemsPayload();
  if (items.length === 0) {
    setCheckoutStatus("Seu carrinho está vazio.", "error");
    goToStep(1);
    return;
  }

  const shippingValidation = validateShipping();
  if (!shippingValidation.valid) {
    setCheckoutStatus("Revise os dados de entrega para continuar.", "error");
    advanceToStep(2);
    return;
  }

  setCheckoutStatus("");
  setProcessingState(true);

  try {
    // Backend remains source of truth for prices/stock and order state.
    const order = await apiRequest("/api/orders/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        paymentMethod: checkoutState.payment.method,
        installments: checkoutState.payment.method === "card" ? checkoutState.payment.installments : 1,
        shipping: buildShippingPayload()
      })
    });

    if (!order || !order.orderId || !order.clientSecret) {
      throw new Error("Não foi possível iniciar o pagamento.");
    }

    const resultUrl = `payment-result.html?orderId=${encodeURIComponent(order.orderId)}`;

    if (checkoutState.payment.method === "card") {
      const result = await checkoutState.stripe.instance.confirmCardPayment(order.clientSecret, {
        payment_method: {
          card: checkoutState.stripe.cardElement,
          billing_details: {
            name: checkoutState.shipping.fullName || "Cliente Tsebi",
            email: checkoutState.shipping.email || undefined
          }
        }
      });

      if (result.error) {
        window.location.href = resultUrl;
        return;
      }

      if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
        saveCart([]);
      }
      window.location.href = resultUrl;
      return;
    }

    const returnUrl = `${window.location.origin}/payment-result.html?orderId=${encodeURIComponent(order.orderId)}`;
    const result = await checkoutState.stripe.instance.confirmPixPayment(order.clientSecret, {
      payment_method: {
        billing_details: {
          name: checkoutState.shipping.fullName || "Cliente Tsebi",
          email: checkoutState.shipping.email || undefined
        }
      },
      return_url: returnUrl
    });

    if (result.error) {
      window.location.href = resultUrl;
      return;
    }

    window.location.href = resultUrl;
  } catch (error) {
    setCheckoutStatus(error.message || "Não foi possível finalizar seu pagamento.", "error");
  } finally {
    setProcessingState(false);
  }
}

async function initStripe() {
  if (!window.Stripe || !dom.cardElement) return;

  try {
    const config = await apiRequest("/api/config", { method: "GET" });
    if (!config.stripePublishableKey) {
      setCheckoutStatus("Checkout indisponível no momento.", "error");
      setButtonDisabled(dom.checkoutButton, true);
      return;
    }

    checkoutState.stripe.instance = window.Stripe(config.stripePublishableKey);
    const elements = checkoutState.stripe.instance.elements();
    checkoutState.stripe.cardElement = elements.create("card", { hidePostalCode: true });
    checkoutState.stripe.cardElement.mount("#cardElement");
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

  let value = target.value;
  if (id === "cep") value = value.replace(/\D/g, "").slice(0, 8);
  if (id === "state") value = value.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();

  target.value = value;
  checkoutState.shipping[id] = value;
  clearFieldError(id);
  saveShipping();

  if (id === "cep") {
    updateShippingMethodPrices();
    if (checkoutState.shipping.shippingMethod) {
      const options = getShippingOptionsFromCep(value);
      const selected = options[checkoutState.shipping.shippingMethod];
      if (selected) {
        checkoutState.shipping.shippingCost = selected.price;
        checkoutState.shipping.shippingEstimate = selected.estimate;
      }
    }
    updateSummary();
  }
  refreshShippingProgressButton();
}

function onShippingMethodChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.name !== "shippingMethod") return;

  checkoutState.shipping.shippingMethod = target.value;
  const options = getShippingOptionsFromCep(checkoutState.shipping.cep || "");
  const selected = options[target.value];
  checkoutState.shipping.shippingCost = selected ? selected.price : 0;
  checkoutState.shipping.shippingEstimate = selected ? selected.estimate : "";
  clearFieldError("shippingMethod");
  saveShipping();
  updateSummary();
  refreshShippingProgressButton();
}

function bindEvents() {
  dom.cartItems?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    const key = target.getAttribute("data-key");
    if (!action || !key) return;

    if (action === "increase") updateItemQuantity(key, 1);
    if (action === "decrease") updateItemQuantity(key, -1);
    if (action === "remove") removeItem(key);
  });

  dom.goToShippingBtn?.addEventListener("click", () => {
    if (checkoutState.cart.items.length === 0) return;
    advanceToStep(2);
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
    if (step <= checkoutState.maxStepReached) goToStep(step);
  });

  dom.paymentMethod?.addEventListener("change", () => {
    checkoutState.payment.method = dom.paymentMethod.value;
    syncPaymentFields();
  });

  dom.installments?.addEventListener("change", () => {
    checkoutState.payment.installments = Math.max(1, Math.min(6, Number(dom.installments.value || 1)));
  });

  dom.checkoutButton?.addEventListener("click", handleCheckoutSubmit);

  const cepInput = document.getElementById("cep");
  cepInput?.addEventListener("blur", fillAddressFromCepIfPossible);

  dom.summaryCollapseBtn?.addEventListener("click", () => {
    const expanded = dom.summary?.classList.toggle("is-expanded");
    dom.summaryCollapseBtn?.setAttribute("aria-expanded", expanded ? "true" : "false");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === CART_KEY) {
      checkoutState.cart.items = readCart();
      renderCartItems();
    }
  });
}

function hydrateState() {
  checkoutState.cart.items = readCart();

  const persistedShipping = readShipping();
  checkoutState.shipping = {
    ...checkoutState.shipping,
    ...persistedShipping
  };

  if (![1, 2, 3].includes(checkoutState.currentStep)) checkoutState.currentStep = 1;
}

function init() {
  hydrateState();
  bindEvents();
  renderCartSkeleton();
  setTimeout(renderCartItems, 180);
  fillShippingForm();
  updateShippingMethodPrices();
  refreshShippingProgressButton();
  updateSummary();
  syncPaymentFields();
  syncStepperUI();
  goToStep(1);
  initStripe();
}

init();
