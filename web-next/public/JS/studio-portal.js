(() => {
  const dom = {
    adminApp: document.getElementById("adminApp"),
    adminLocked: document.getElementById("adminLocked"),
    adminHeadActions: document.getElementById("adminHeadActions"),
    adminIdentity: document.getElementById("adminIdentity"),
    adminStatus: document.getElementById("adminStatus"),
    actionModal: document.getElementById("actionModal"),
    actionModalTitle: document.getElementById("actionModalTitle"),
    actionModalMessage: document.getElementById("actionModalMessage"),
    actionModalForm: document.getElementById("actionModalForm"),
    actionModalFields: document.getElementById("actionModalFields"),
    actionModalError: document.getElementById("actionModalError"),
    actionModalCancel: document.getElementById("actionModalCancel"),
    actionModalConfirm: document.getElementById("actionModalConfirm"),
    refreshAllBtn: document.getElementById("refreshAllBtn"),
    regenerateRecoveryBtn: document.getElementById("regenerateRecoveryBtn"),
    disableMfaBtn: document.getElementById("disableMfaBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    panels: Array.from(document.querySelectorAll(".tab-panel")),

    usersSearch: document.getElementById("usersSearch"),
    usersRefreshBtn: document.getElementById("usersRefreshBtn"),
    usersBody: document.getElementById("usersBody"),
    createUserForm: document.getElementById("createUserForm"),
    newUserName: document.getElementById("newUserName"),
    newUserEmail: document.getElementById("newUserEmail"),
    newUserPassword: document.getElementById("newUserPassword"),
    newUserBirthDate: document.getElementById("newUserBirthDate"),
    newUserCpf: document.getElementById("newUserCpf"),
    newUserCep: document.getElementById("newUserCep"),

    ordersSearch: document.getElementById("ordersSearch"),
    ordersStatusFilter: document.getElementById("ordersStatusFilter"),
    ordersRefreshBtn: document.getElementById("ordersRefreshBtn"),
    ordersBody: document.getElementById("ordersBody"),
    ordersSaveSectionBtn: document.getElementById("ordersSaveSectionBtn"),

    productsSearch: document.getElementById("productsSearch"),
    productsIncludeInactive: document.getElementById("productsIncludeInactive"),
    productsRefreshBtn: document.getElementById("productsRefreshBtn"),
    productsBody: document.getElementById("productsBody"),
    productsSaveSectionBtn: document.getElementById("productsSaveSectionBtn"),
    createProductForm: document.getElementById("createProductForm"),
    newProductSku: document.getElementById("newProductSku"),
    newProductName: document.getElementById("newProductName"),
    newProductPrice: document.getElementById("newProductPrice"),
    newProductStock: document.getElementById("newProductStock"),
    newProductImageUrl: document.getElementById("newProductImageUrl"),

    vipRefreshBtn: document.getElementById("vipRefreshBtn"),
    vipBody: document.getElementById("vipBody"),
    createVipForm: document.getElementById("createVipForm"),
    newVipName: document.getElementById("newVipName"),
    newVipEmail: document.getElementById("newVipEmail"),
    newVipBirthDate: document.getElementById("newVipBirthDate"),
    newVipCpf: document.getElementById("newVipCpf"),
    newVipCep: document.getElementById("newVipCep"),
    newVipAccountCreated: document.getElementById("newVipAccountCreated"),

    auditRefreshBtn: document.getElementById("auditRefreshBtn"),
    auditBody: document.getElementById("auditBody")
  };

  const state = {
    activeTab: "users",
    csrfToken: "",
    activeModal: null,
    users: [],
    orders: [],
    products: [],
    vip: [],
    auditLogs: [],
    pendingOrderEdits: {},
    pendingProductEdits: {},
    shippingLabelsByOrderId: {}
  };

  const orderStatuses = ["pending_payment", "processing", "paid", "failed", "canceled", "refunded"];
  const studioFlowKey = "tsebi-studio-entry-ok";

  function getCurrentStudioPath() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function redirectToStudioLoading() {
    const params = new URLSearchParams();
    params.set("returnTo", getCurrentStudioPath());
    window.location.href = `/studio?${params.toString()}`;
  }

  function ensureStudioEntryFlow() {
    const hasFlowFlag = sessionStorage.getItem(studioFlowKey) === "1";
    if (hasFlowFlag) return true;
    redirectToStudioLoading();
    return false;
  }

  function setHeadActionsVisible(visible) {
    if (!dom.adminHeadActions) return;
    dom.adminHeadActions.hidden = !visible;
  }

  if (!ensureStudioEntryFlow()) {
    return;
  }

  function setStatus(message, tone = "") {
    if (!dom.adminStatus) return;
    dom.adminStatus.textContent = String(message || "");
    dom.adminStatus.classList.toggle("error", tone === "error");
    dom.adminStatus.classList.toggle("ok", tone === "ok");
  }

  function moneyFromCents(value, currency = "brl") {
    const amount = Math.max(0, Number(value || 0)) / 100;
    return amount.toLocaleString("pt-BR", { style: "currency", currency: String(currency || "brl").toUpperCase() });
  }

  function formatDate(value) {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("pt-BR");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function digitsOnly(value, maxLength) {
    return String(value || "").replace(/\D/g, "").slice(0, maxLength);
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function setRowDirty(row, dirty) {
    if (!(row instanceof HTMLTableRowElement)) return;
    row.classList.toggle("row-dirty", Boolean(dirty));
  }

  function closeActionModal(result) {
    if (!state.activeModal) return;
    const resolver = state.activeModal.resolve;
    state.activeModal = null;

    if (dom.actionModal) dom.actionModal.hidden = true;
    if (dom.actionModalFields) dom.actionModalFields.innerHTML = "";
    if (dom.actionModalError) {
      dom.actionModalError.hidden = true;
      dom.actionModalError.textContent = "";
    }
    if (dom.actionModalForm) dom.actionModalForm.reset();
    if (dom.actionModalCancel) dom.actionModalCancel.hidden = false;

    resolver(result || { confirmed: false, values: {} });
  }

  function readModalValues(fields) {
    const values = {};
    fields.forEach((field) => {
      const key = String(field.name || "").trim();
      if (!key) return;
      const input = dom.actionModalFields?.querySelector(`[data-field-key="${key}"]`);
      if (!(input instanceof HTMLInputElement)) return;
      if (field.type === "checkbox") {
        values[key] = Boolean(input.checked);
      } else {
        values[key] = String(input.value || "");
      }
    });
    return values;
  }

  function validateModalValues(fields, values) {
    for (const field of fields) {
      const key = String(field.name || "").trim();
      if (!key || !field.required) continue;
      if (field.type === "checkbox") {
        if (!values[key]) return String(field.requiredMessage || `Confirme: ${field.label || key}`);
        continue;
      }
      if (!String(values[key] || "").trim()) {
        return String(field.requiredMessage || `Preencha: ${field.label || key}`);
      }
    }
    return "";
  }

  function renderModalFields(fields) {
    if (!dom.actionModalFields) return;
    dom.actionModalFields.innerHTML = fields
      .map((field) => {
        const key = String(field.name || "").trim();
        if (!key) return "";
        const label = escapeHtml(field.label || key);

        if (field.type === "checkbox") {
          return `
            <label class="action-modal-check">
              <input
                data-field-key="${escapeAttr(key)}"
                name="${escapeAttr(key)}"
                type="checkbox"
                ${field.checked ? "checked" : ""}
              />
              <span>${label}</span>
            </label>
          `;
        }

        const type = escapeAttr(field.type || "text");
        const value = escapeAttr(field.value || "");
        const placeholder = escapeAttr(field.placeholder || "");
        const maxLength = Number(field.maxLength || 0);
        const inputMode = escapeAttr(field.inputMode || "");

        return `
          <label class="action-modal-field">
            <span>${label}</span>
            <input
              data-field-key="${escapeAttr(key)}"
              name="${escapeAttr(key)}"
              type="${type}"
              value="${value}"
              placeholder="${placeholder}"
              ${maxLength > 0 ? `maxlength="${maxLength}"` : ""}
              ${inputMode ? `inputmode="${inputMode}"` : ""}
            />
          </label>
        `;
      })
      .join("");
  }

  function showActionModal(options = {}) {
    if (!dom.actionModal || !dom.actionModalForm) {
      return Promise.resolve({ confirmed: false, values: {} });
    }

    const fields = Array.isArray(options.fields) ? options.fields : [];
    const tone = String(options.tone || "ok");
    const title = String(options.title || "Confirmar acao");
    const message = String(options.message || "");
    const confirmLabel = String(options.confirmLabel || "Confirmar");
    const cancelLabel = typeof options.cancelLabel === "string" ? options.cancelLabel : "Cancelar";
    const hideCancel = cancelLabel.length === 0;

    dom.actionModal.hidden = false;
    dom.actionModal.setAttribute("data-tone", tone);
    if (dom.actionModalTitle) dom.actionModalTitle.textContent = title;
    if (dom.actionModalMessage) dom.actionModalMessage.textContent = message;
    if (dom.actionModalError) {
      dom.actionModalError.hidden = true;
      dom.actionModalError.textContent = "";
    }

    renderModalFields(fields);

    if (dom.actionModalConfirm) {
      dom.actionModalConfirm.textContent = confirmLabel;
      dom.actionModalConfirm.className = tone === "danger" ? "btn btn-danger" : "btn";
    }

    if (dom.actionModalCancel) {
      dom.actionModalCancel.hidden = hideCancel;
      dom.actionModalCancel.textContent = cancelLabel || "Cancelar";
    }

    const firstInput = dom.actionModalFields?.querySelector("input");
    if (firstInput instanceof HTMLInputElement) {
      firstInput.focus();
    } else if (dom.actionModalConfirm instanceof HTMLButtonElement) {
      dom.actionModalConfirm.focus();
    }

    return new Promise((resolve) => {
      state.activeModal = {
        fields,
        resolve
      };
    });
  }

  async function confirmAction(options = {}) {
    const result = await showActionModal({
      ...options,
      fields: []
    });
    return Boolean(result?.confirmed);
  }

  async function promptActionFields(options = {}) {
    const result = await showActionModal(options);
    if (!result?.confirmed) return null;
    return result.values || {};
  }

  function redirectToStudioLogin(reason = "") {
    const params = new URLSearchParams();
    params.set("returnTo", getCurrentStudioPath());
    if (reason) params.set("reason", String(reason));
    window.location.href = `studio-login.html?${params.toString()}`;
  }

  function isMutatingMethod(method) {
    return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "").toUpperCase());
  }

  function isStudioAuthError(code) {
    return [
      "ADMIN_UNAUTHORIZED",
      "ADMIN_SESSION_EXPIRED",
      "ADMIN_MFA_REQUIRED",
      "ADMIN_MFA_SETUP_REQUIRED"
    ].includes(String(code || ""));
  }

  async function api(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const suppressAuthRedirect = Boolean(options.suppressAuthRedirect);
    const headers = {
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    };

    if (isMutatingMethod(method) && state.csrfToken) {
      headers["x-csrf-token"] = state.csrfToken;
    }

    const response = await fetch(path, {
      ...options,
      method,
      credentials: "include",
      headers
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(data && data.error ? data.error : "REQUEST_FAILED"));
      error.code = String(data && data.error ? data.error : "REQUEST_FAILED");
      error.status = response.status;
      error.detail = data && Object.prototype.hasOwnProperty.call(data, "detail") ? data.detail : null;
      error.payload = data;

      if (!suppressAuthRedirect && isStudioAuthError(error.code)) {
        redirectToStudioLogin(error.code);
      }

      throw error;
    }

    return data;
  }

  function pickErrorText(error, fallback = "Falha na requisicao.") {
    const detail = error?.detail || null;
    if (typeof detail === "string" && detail.trim()) return detail.trim();

    const providerResponse = detail?.response || null;
    const requestId = providerResponse?.request_id || detail?.request_id || "";
    const providerMessage =
      providerResponse?.message ||
      providerResponse?.error ||
      detail?.message ||
      error?.code ||
      error?.message ||
      fallback;

    const safeMessage = String(providerMessage || fallback).trim() || fallback;
    if (requestId) {
      return `${safeMessage} (request_id: ${requestId})`;
    }
    return safeMessage;
  }

  function switchTab(tab) {
    state.activeTab = tab;
    dom.tabs.forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-tab") === tab);
    });
    dom.panels.forEach((panel) => {
      const isActive = panel.getAttribute("data-panel") === tab;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  }

  function renderUsers() {
    if (!dom.usersBody) return;
    dom.usersBody.innerHTML = "";
    state.users.forEach((user) => {
      const row = document.createElement("tr");
      row.setAttribute("data-id", String(user.id));
      row.innerHTML = `
        <td>${escapeHtml(user.name)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(user.cpf || "-")}</td>
        <td>${escapeHtml(user.cep || "-")}</td>
        <td><small>${escapeHtml(formatDate(user.createdAt))}</small></td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-ghost" data-action="user-edit">Editar</button>
            <button type="button" class="btn btn-danger" data-action="user-delete">Excluir</button>
          </div>
        </td>
      `;
      dom.usersBody.appendChild(row);
    });
  }

  function renderOrders() {
    if (!dom.ordersBody) return;
    dom.ordersBody.innerHTML = "";
    state.orders.forEach((order) => {
      const row = document.createElement("tr");
      row.setAttribute("data-id", String(order.id));
      const pending = state.pendingOrderEdits[String(order.id)] || {};
      const selectedStatus = String(pending.status || order.status || "");
      const selectOptions = orderStatuses
        .map((status) => `<option value="${status}" ${selectedStatus === status ? "selected" : ""}>${status}</option>`)
        .join("");
      const isRefunded = String(order.status || "").trim().toLowerCase() === "refunded";
      const shipment = getOrderShippingLabel(order);
      const shipmentStatus = String(shipment?.status || "").trim();
      const trackingCode = String(shipment?.trackingCode || "").trim();
      const buyButtonState = getShippingBuyButtonState(order, shipment);
      const trackEnabled = canTrackShippingLabel(order, shipment);
      row.innerHTML = `
        <td><small>${escapeHtml(formatDate(order.createdAt))}</small></td>
        <td><small>${escapeHtml(order.id)}</small></td>
        <td>
          <div>${escapeHtml(order.userName || "-")}</div>
          <small>${escapeHtml(order.userEmail || "-")}</small>
          ${order.isGuest ? '<div><span class="pill no">Guest</span></div>' : ""}
        </td>
        <td>${escapeHtml(moneyFromCents(order.shippingPriceCents || order.shippingAmount || 0, order.currency))}</td>
        <td>
          <div>${escapeHtml(moneyFromCents(order.amount, order.currency))}</div>
          <small>
            itens ${escapeHtml(moneyFromCents(order.itemsAmount || 0, order.currency))}
            + frete ${escapeHtml(moneyFromCents(order.shippingPriceCents || order.shippingAmount || 0, order.currency))}
          </small>
        </td>
        <td>
          <select data-field="status" ${isRefunded ? "disabled" : ""}>${selectOptions}</select>
        </td>
        <td>
          <div>${escapeHtml(formatShippingService(order))}</div>
          <small>${escapeHtml(shipmentStatus || "-")}</small>
        </td>
        <td>
          <button
            type="button"
            class="${escapeAttr(buyButtonState.className)}"
            data-action="shipping-buy-label"
            ${buyButtonState.disabled ? "disabled" : ""}
          >
            ${escapeHtml(buyButtonState.label)}
          </button>
        </td>
        <td>
          <button
            type="button"
            class="btn btn-ghost"
            data-action="shipping-track-label"
            ${trackEnabled ? "" : "disabled"}
          >
            ${escapeHtml(trackEnabled && trackingCode ? `Rastrear (${trackingCode})` : "Rastrear")}
          </button>
        </td>
        <td>
          <button type="button" class="btn btn-danger" data-action="order-delete">Excluir</button>
        </td>
      `;
      setRowDirty(row, Boolean(state.pendingOrderEdits[String(order.id)]));
      dom.ordersBody.appendChild(row);
    });
  }

  function getOrderShippingLabel(order) {
    const saved = state.shippingLabelsByOrderId[String(order?.id || "")];
    if (saved) return saved;
    if (order?.shipment) return order.shipment;
    return null;
  }

  function formatShippingService(order) {
    const carrier = String(order?.shippingSelectedCarrierName || "").trim();
    const service = String(order?.shippingSelectedService || "").trim();
    const deadline = order?.shippingDeadlineDays == null ? null : Number(order.shippingDeadlineDays || 0);
    const parts = [];
    if (carrier) parts.push(carrier);
    if (service) parts.push(service);
    if (deadline != null && Number.isFinite(deadline) && deadline > 0) {
      parts.push(`${deadline} dia(s)`);
    }
    return parts.join(" | ") || "-";
  }

  function canBuyShippingLabel(order, shipment = null) {
    const hasServiceCode = Boolean(
      String(order?.shippingSelectedServiceCode || order?.shipping?.shippingServiceCode || "").trim()
    );
    const isPaid = String(order?.status || "").trim().toLowerCase() === "paid";
    const shipmentStatus = String(shipment?.status || "").trim().toUpperCase();
    const hasBoughtLabel = shipmentStatus === "ETIQUETA_COMPRADA" || shipmentStatus === "EM_TRANSITO" || shipmentStatus === "ENTREGUE";
    return hasServiceCode && isPaid && !hasBoughtLabel;
  }

  function canTrackShippingLabel(order, shipment) {
    const trackingCode = String(shipment?.trackingCode || "").trim();
    return Boolean(trackingCode);
  }

  function getShippingBuyButtonState(order, shipment = null) {
    const status = String(order?.status || "").trim().toLowerCase();
    const hasServiceCode = Boolean(
      String(order?.shippingSelectedServiceCode || order?.shipping?.shippingServiceCode || "").trim()
    );
    const shipmentStatus = String(shipment?.status || "").trim().toUpperCase();

    if (status === "canceled" || status === "refunded") {
      return { label: status === "refunded" ? "Estornado" : "Cancelado", className: "btn btn-neutral", disabled: true };
    }
    if (status === "failed") {
      return { label: "Falhou", className: "btn btn-danger", disabled: true };
    }
    if (status === "pending_payment") {
      return { label: "Pendente", className: "btn btn-warn", disabled: true };
    }
    if (status === "processing") {
      return { label: "Processando", className: "btn btn-warn", disabled: true };
    }
    if (!hasServiceCode) {
      return { label: "Frete incompleto", className: "btn btn-neutral", disabled: true };
    }
    if (shipmentStatus === "ETIQUETA_COMPRADA" || shipmentStatus === "EM_TRANSITO" || shipmentStatus === "ENTREGUE") {
      return { label: "Etiqueta expedida", className: "btn btn-neutral", disabled: true };
    }
    if (status === "paid" && canBuyShippingLabel(order, shipment)) {
      return { label: "Expedir etiqueta", className: "btn", disabled: false };
    }
    return { label: "Indisponivel", className: "btn btn-neutral", disabled: true };
  }

  function renderProducts() {
    if (!dom.productsBody) return;
    dom.productsBody.innerHTML = "";
    state.products.forEach((product) => {
      const row = document.createElement("tr");
      row.setAttribute("data-id", String(product.id));
      const pending = state.pendingProductEdits[String(product.id)] || {};
      const nameValue =
        Object.prototype.hasOwnProperty.call(pending, "name")
          ? String(pending.name || "")
          : String(product.name || "");
      const priceValue =
        Object.prototype.hasOwnProperty.call(pending, "priceCents")
          ? Number(pending.priceCents || 0)
          : Number(product.unitAmount || 0);
      const stockValue =
        Object.prototype.hasOwnProperty.call(pending, "stockQty")
          ? Number(pending.stockQty || 0)
          : Number(product.stock || 0);
      const imageUrlValue =
        Object.prototype.hasOwnProperty.call(pending, "imageUrl")
          ? String(pending.imageUrl || "")
          : String(product.image || "");
      const activeValue =
        Object.prototype.hasOwnProperty.call(pending, "active")
          ? Boolean(pending.active)
          : Boolean(product.active);
      row.innerHTML = `
        <td><small>${escapeHtml(product.sku || product.id)}</small></td>
        <td><input data-field="name" value="${escapeHtml(nameValue)}" /></td>
        <td><input data-field="priceCents" type="number" min="0" step="1" value="${priceValue}" /></td>
        <td><input data-field="stockQty" type="number" min="0" step="1" value="${stockValue}" /></td>
        <td><input data-field="imageUrl" value="${escapeHtml(imageUrlValue)}" placeholder="https://..." /></td>
        <td><input data-field="active" type="checkbox" ${activeValue ? "checked" : ""} /></td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-danger" data-action="product-delete">Arquivar</button>
          </div>
        </td>
      `;
      setRowDirty(row, Boolean(state.pendingProductEdits[String(product.id)]));
      dom.productsBody.appendChild(row);
    });
  }

  function renderVip() {
    if (!dom.vipBody) return;
    dom.vipBody.innerHTML = "";
    state.vip.forEach((entry) => {
      const row = document.createElement("tr");
      row.setAttribute("data-id", String(entry.id));
      row.innerHTML = `
        <td>${escapeHtml(entry.name || "-")}</td>
        <td>${escapeHtml(entry.email || "-")}</td>
        <td>${escapeHtml(entry.cpf || "-")}</td>
        <td>${escapeHtml(entry.cep || "-")}</td>
        <td><span class="pill ${entry.accountCreated ? "" : "no"}">${entry.accountCreated ? "Criada" : "Nao"}</span></td>
        <td><small>${escapeHtml(formatDate(entry.subscribedAt))}</small></td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-ghost" data-action="vip-edit">Editar</button>
            <button type="button" class="btn btn-danger" data-action="vip-delete">Excluir</button>
          </div>
        </td>
      `;
      dom.vipBody.appendChild(row);
    });
  }

  function getAuditStatus(entry) {
    if (entry?.reversedAt) {
      return { label: "Revertido", tone: "muted" };
    }
    if (entry?.reversible) {
      return { label: "Reversivel", tone: "ok" };
    }
    return { label: "Expirado", tone: "warn" };
  }

  function getChangedFields(before, after, fieldMap = []) {
    if (!before || !after) return [];
    return fieldMap
      .filter((item) => String(before[item.key] ?? "") !== String(after[item.key] ?? ""))
      .map((item) => item.label);
  }

  function getAuditActionLabel(entry) {
    const action = String(entry?.action || "").toLowerCase();
    const entityType = String(entry?.entityType || "").toLowerCase();
    const before = entry?.before || null;
    const after = entry?.after || null;

    if (action === "reverse") return "reverteu alteracao";
    if (entityType === "product") {
      if (before && after && Boolean(before.active) !== Boolean(after.active)) {
        return Boolean(after.active) ? "ativou produto" : "desativou produto";
      }
      if (action === "delete" || action === "archive") return "apagou produto";
      if (action === "create") return "criou produto";
      return "salvou produto";
    }

    if (entityType === "order") {
      if (before && after && String(before.status || "") !== String(after.status || "")) {
        return "alterou status do pedido";
      }
      return "salvou pedido";
    }

    if (entityType === "user") {
      if (action === "delete") return "apagou usuario";
      if (action === "create") return "criou usuario";
      return "salvou usuario";
    }

    if (entityType === "vip_subscriber") {
      if (action === "delete") return "apagou VIP";
      if (action === "create") return "criou VIP";
      return "salvou VIP";
    }

    if (action === "delete") return "apagou";
    if (action === "create") return "criou";
    return "salvou";
  }

  function getAuditSummaryLabel(entry) {
    const entityType = String(entry?.entityType || "").toLowerCase();
    const before = entry?.before || null;
    const after = entry?.after || null;
    const target = String(entry?.entityId || "");

    if (entityType === "product" && before && after && Boolean(before.active) !== Boolean(after.active)) {
      return `Produto ${target}: ${Boolean(after.active) ? "ativado" : "desativado"}.`;
    }

    if (entityType === "order" && before && after && String(before.status || "") !== String(after.status || "")) {
      return `Pedido ${target}: ${String(before.status || "-")} -> ${String(after.status || "-")}.`;
    }

    const mapByEntity = {
      product: [
        { key: "name", label: "nome" },
        { key: "priceCents", label: "preco" },
        { key: "stockQty", label: "estoque" },
        { key: "active", label: "status ativo" }
      ],
      order: [
        { key: "status", label: "status" },
        { key: "paymentMethod", label: "metodo pagamento" },
        { key: "installments", label: "parcelas" }
      ],
      user: [
        { key: "name", label: "nome" },
        { key: "email", label: "email" },
        { key: "birthDate", label: "nascimento" },
        { key: "cpf", label: "cpf" },
        { key: "cep", label: "cep" }
      ],
      vip_subscriber: [
        { key: "name", label: "nome" },
        { key: "email", label: "email" },
        { key: "birthDate", label: "nascimento" },
        { key: "cpf", label: "cpf" },
        { key: "cep", label: "cep" },
        { key: "accountCreated", label: "conta criada" }
      ]
    };

    const changedFields = getChangedFields(before, after, mapByEntity[entityType] || []);
    if (changedFields.length > 0) {
      return `Campos alterados: ${changedFields.join(", ")}.`;
    }

    return String(entry?.summary || "-");
  }

  function renderAuditLogs() {
    if (!dom.auditBody) return;
    dom.auditBody.innerHTML = "";
    state.auditLogs.forEach((entry) => {
      const row = document.createElement("tr");
      row.setAttribute("data-id", String(entry.id || ""));
      const status = getAuditStatus(entry);
      const actionLabel = getAuditActionLabel(entry);
      const summaryLabel = getAuditSummaryLabel(entry);
      row.innerHTML = `
        <td><small>${escapeHtml(formatDate(entry.createdAt))}</small></td>
        <td>${escapeHtml(entry.actorEmail || "-")}</td>
        <td>${escapeHtml(actionLabel)}</td>
        <td>
          <div>${escapeHtml(entry.entityType || "-")}</div>
          <small>${escapeHtml(entry.entityId || "-")}</small>
        </td>
        <td>${escapeHtml(summaryLabel)}</td>
        <td><span class="audit-status ${status.tone}">${escapeHtml(status.label)}</span></td>
        <td>
          <div class="row-actions">
            <button
              type="button"
              class="btn btn-ghost"
              data-action="audit-reverse"
              ${entry.reversible ? "" : "disabled"}
            >
              Reverter
            </button>
          </div>
        </td>
      `;
      dom.auditBody.appendChild(row);
    });
  }

  async function loadUsers() {
    const search = encodeURIComponent(String(dom.usersSearch?.value || "").trim());
    const data = await api(`/api/admin/users?limit=200&offset=0&search=${search}`);
    state.users = Array.isArray(data.users) ? data.users : [];
    renderUsers();
  }

  async function loadOrders() {
    const search = encodeURIComponent(String(dom.ordersSearch?.value || "").trim());
    const status = encodeURIComponent(String(dom.ordersStatusFilter?.value || "").trim());
    const data = await api(`/api/admin/orders?limit=200&offset=0&search=${search}&status=${status}`);
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    state.shippingLabelsByOrderId = {};
    state.orders.forEach((order) => {
      if (order?.shipment) {
        state.shippingLabelsByOrderId[String(order.id)] = order.shipment;
      }
    });
    state.pendingOrderEdits = {};
    renderOrders();
  }

  async function loadProducts() {
    const search = encodeURIComponent(String(dom.productsSearch?.value || "").trim());
    const includeInactive = dom.productsIncludeInactive?.checked ? "1" : "0";
    const data = await api(`/api/admin/products?limit=300&offset=0&search=${search}&includeInactive=${includeInactive}`);
    state.products = Array.isArray(data.products) ? data.products : [];
    state.pendingProductEdits = {};
    renderProducts();
  }

  async function loadVip() {
    const data = await api(`/api/admin/vip/subscribers?limit=300&offset=0`);
    state.vip = Array.isArray(data.subscribers) ? data.subscribers : [];
    renderVip();
  }

  async function loadAuditLogs() {
    const data = await api(`/api/admin/audit-logs?limit=200&offset=0`);
    state.auditLogs = Array.isArray(data.logs) ? data.logs : [];
    renderAuditLogs();
  }

  async function loadAll() {
    setStatus("Atualizando dados...", "");
    try {
      await Promise.all([loadUsers(), loadOrders(), loadProducts(), loadVip(), loadAuditLogs()]);
      setStatus("Dados atualizados.", "ok");
    } catch (error) {
      setStatus(`Falha ao atualizar painel: ${error.code || error.message}`, "error");
    }
  }

  function clearForm(form) {
    if (!(form instanceof HTMLFormElement)) return;
    form.reset();
  }

  async function ensureAdmin() {
    try {
      const session = await api("/api/studio-auth/me", { suppressAuthRedirect: true });
      if (!session?.authenticated) {
        if (session?.stage === "mfa_required" || session?.stage === "mfa_setup_required") {
          redirectToStudioLogin(session.stage);
          return false;
        }
        dom.adminIdentity.textContent = "Voce nao esta autenticado no Studio.";
        dom.adminApp.hidden = true;
        dom.adminLocked.hidden = false;
        setHeadActionsVisible(false);
        setStatus("Entre com o login exclusivo do Studio para continuar.", "error");
        return false;
      }

      state.csrfToken = String(session.csrfToken || "");
      dom.adminIdentity.textContent = `Acesso admin liberado para ${session?.admin?.name || session?.admin?.email || "Administrador"}.`;
      dom.adminApp.hidden = false;
      dom.adminLocked.hidden = true;
      setHeadActionsVisible(true);
      return true;
    } catch (error) {
      if (isStudioAuthError(error.code)) {
        redirectToStudioLogin(error.code);
        return false;
      }

      dom.adminIdentity.textContent = "Falha ao validar sessao de administrador.";
      dom.adminApp.hidden = true;
      dom.adminLocked.hidden = false;
      setHeadActionsVisible(false);
      setStatus(
        error.code === "ADMIN_NOT_CONFIGURED"
          ? "Defina ADMIN_EMAILS no Railway para liberar o painel admin."
          : `Acesso negado ao painel admin: ${error.code || error.message}`,
        "error"
      );
      return false;
    }
  }

  async function handleUserCreate(event) {
    event.preventDefault();
    const payload = {
      name: String(dom.newUserName?.value || "").trim(),
      email: String(dom.newUserEmail?.value || "").trim(),
      password: String(dom.newUserPassword?.value || "").trim(),
      birthDate: String(dom.newUserBirthDate?.value || "").trim(),
      cpf: digitsOnly(dom.newUserCpf?.value || "", 11),
      cep: digitsOnly(dom.newUserCep?.value || "", 8)
    };

    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
      clearForm(dom.createUserForm);
      await loadUsers();
      setStatus("Usuario criado com sucesso.", "ok");
    } catch (error) {
      setStatus(`Falha ao criar usuario: ${error.code || error.message}`, "error");
    }
  }

  async function handleUserAction(event) {
    const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    const row = target.closest("tr[data-id]");
    if (!row) return;

    const id = String(row.getAttribute("data-id") || "");
    const action = String(target.getAttribute("data-action") || "");

    if (action === "user-delete") {
      const confirmed = await confirmAction({
        title: "Remover usuario",
        message: "Deseja remover este usuario agora?",
        confirmLabel: "Remover",
        tone: "danger"
      });
      if (!confirmed) return;
      try {
        await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadUsers();
        setStatus("Usuario removido.", "ok");
      } catch (error) {
        setStatus(`Falha ao remover usuario: ${error.code || error.message}`, "error");
      }
      return;
    }

    if (action === "user-edit") {
      const current = state.users.find((user) => String(user.id) === id);
      if (!current) return;

      const values = await promptActionFields({
        title: "Editar usuario",
        message: "Atualize os campos e confirme.",
        confirmLabel: "Salvar alteracoes",
        tone: "ok",
        fields: [
          { name: "name", label: "Nome", value: current.name || "", required: true },
          { name: "email", label: "Email", type: "email", value: current.email || "", required: true },
          { name: "birthDate", label: "Nascimento (YYYY-MM-DD)", value: current.birthDate || "" },
          { name: "cpf", label: "CPF (somente numeros)", value: current.cpf || "", inputMode: "numeric", maxLength: 11 },
          { name: "cep", label: "CEP (somente numeros)", value: current.cep || "", inputMode: "numeric", maxLength: 8 }
        ]
      });
      if (!values) return;

      try {
        await api(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: String(values.name || "").trim(),
            email: String(values.email || "").trim(),
            birthDate: String(values.birthDate || "").trim(),
            cpf: digitsOnly(values.cpf || "", 11),
            cep: digitsOnly(values.cep || "", 8)
          })
        });
        await loadUsers();
        setStatus("Usuario atualizado.", "ok");
      } catch (error) {
        setStatus(`Falha ao editar usuario: ${error.code || error.message}`, "error");
      }
    }
  }

  function handleOrderFieldChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.getAttribute("data-field") !== "status") return;

    const row = target.closest("tr[data-id]");
    if (!row) return;
    const id = String(row.getAttribute("data-id") || "");
    const original = state.orders.find((order) => String(order.id) === id);
    if (!original) return;
    if (String(original.status || "").trim().toLowerCase() === "refunded") {
      target.value = String(original.status || "");
      setRowDirty(row, false);
      return;
    }

    const nextStatus = String(target.value || "");
    const currentStatus = String(original.status || "");

    if (nextStatus === currentStatus) {
      delete state.pendingOrderEdits[id];
      setRowDirty(row, false);
      return;
    }

    state.pendingOrderEdits[id] = { status: nextStatus };
    setRowDirty(row, true);
  }

  async function handleOrdersSaveSection() {
    const entries = Object.entries(state.pendingOrderEdits || {});
    if (entries.length === 0) {
      setStatus("Nenhuma alteracao pendente em pedidos.", "");
      return;
    }

    const confirmed = await confirmAction({
      title: "Salvar pedidos",
      message: `Aplicar ${entries.length} alteracao(oes) de pedidos agora?`,
      confirmLabel: "Salvar tudo",
      tone: "ok"
    });
    if (!confirmed) return;

    let success = 0;
    for (const [id, patch] of entries) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await api(`/api/admin/orders/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
        success += 1;
      } catch {
        // Ignora erro individual para seguir com os demais.
      }
    }

    await Promise.all([loadOrders(), loadAuditLogs()]);
    if (success === entries.length) {
      setStatus(`${success} pedido(s) salvo(s) com sucesso.`, "ok");
    } else {
      setStatus(`Salvou ${success}/${entries.length} pedidos. Verifique os restantes.`, "error");
    }
  }

  async function handleShippingOrderAction(event) {
    const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    const action = String(target.getAttribute("data-action") || "");
    if (!["shipping-buy-label", "shipping-track-label", "order-delete"].includes(action)) return;

    const row = target.closest("tr[data-id]");
    if (!row) return;
    const orderId = String(row.getAttribute("data-id") || "").trim();
    if (!orderId) return;

    const order = state.orders.find((item) => String(item.id) === orderId);
    if (!order) return;

    if (action === "order-delete") {
      const confirmed = await confirmAction({
        title: "Excluir pedido",
        message: `Deseja excluir permanentemente o pedido ${orderId}? Esta ação é irreversível.`,
        confirmLabel: "Excluir",
        tone: "danger"
      });
      if (!confirmed) return;

      try {
        await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
        state.orders = state.orders.filter((item) => String(item.id) !== orderId);
        renderOrders();
        setStatus("Pedido excluído.", "ok");
      } catch (error) {
        setStatus(`Falha ao excluir pedido: ${pickErrorText(error, "ORDER_DELETE_FAILED")}`, "error");
      }
      return;
    }

    if (action === "shipping-track-label") {
      const currentShipment = getOrderShippingLabel(order);
      if (!canTrackShippingLabel(order, currentShipment)) return;

      target.disabled = true;
      target.textContent = "Rastreando...";
      try {
        const data = await api(`/api/admin/orders/${encodeURIComponent(orderId)}/shipping/track`);
        const shipment = data?.data?.shipment || null;
        const tracking = data?.data?.tracking || null;
        if (shipment) {
          state.shippingLabelsByOrderId[orderId] = shipment;
          order.shipment = shipment;
        }
        renderOrders();
        setStatus(
          tracking?.status
            ? `Rastreio atualizado: ${tracking.status}`
            : "Rastreio atualizado com sucesso.",
          "ok"
        );
      } catch (error) {
        target.disabled = false;
        target.textContent = "Rastrear";
        setStatus(`Falha ao rastrear etiqueta: ${pickErrorText(error, "TRACK_REQUEST_FAILED")}`, "error");
      }
      return;
    }

    const currentShipment = getOrderShippingLabel(order);
    if (!canBuyShippingLabel(order, currentShipment)) return;

    const confirmed = await confirmAction({
      title: "Expedir etiqueta",
      message: `Expedir etiqueta do Melhor Envio para o pedido ${orderId}?`,
      confirmLabel: "Expedir agora",
      tone: "ok"
    });
    if (!confirmed) return;

    target.disabled = true;
    target.textContent = "Expedindo...";

    try {
      const data = await api(`/api/admin/orders/${encodeURIComponent(orderId)}/shipping/buy-label`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const shipment = data?.data?.shipment || null;
      if (shipment) {
        state.shippingLabelsByOrderId[orderId] = shipment;
        order.shipment = shipment;
      }
      renderOrders();
      setStatus(
        shipment?.trackingCode
          ? `Etiqueta expedida com sucesso. Rastreio: ${shipment.trackingCode}`
          : "Etiqueta expedida com sucesso.",
        "ok"
      );
    } catch (error) {
      target.disabled = false;
      target.textContent = "Expedir etiqueta";
      setStatus(`Falha ao expedir etiqueta: ${pickErrorText(error, "BUY_LABEL_FAILED")}`, "error");
    }
  }

  async function handleProductCreate(event) {
    event.preventDefault();
    const payload = {
      sku: String(dom.newProductSku?.value || "").trim(),
      name: String(dom.newProductName?.value || "").trim(),
      priceCents: Number(dom.newProductPrice?.value || 0),
      stockQty: Number(dom.newProductStock?.value || 0),
      imageUrl: String(dom.newProductImageUrl?.value || "").trim(),
      currency: "brl",
      active: true
    };

    try {
      await api("/api/admin/products", { method: "POST", body: JSON.stringify(payload) });
      clearForm(dom.createProductForm);
      await loadProducts();
      setStatus("Produto criado com sucesso.", "ok");
    } catch (error) {
      setStatus(`Falha ao criar produto: ${error.code || error.message}`, "error");
    }
  }

  function buildProductPatchFromRow(row, original) {
    if (!row || !original) return null;
    const nameInput = row.querySelector('input[data-field="name"]');
    const priceInput = row.querySelector('input[data-field="priceCents"]');
    const stockInput = row.querySelector('input[data-field="stockQty"]');
    const imageUrlInput = row.querySelector('input[data-field="imageUrl"]');
    const activeInput = row.querySelector('input[data-field="active"]');

    const current = {
      name: nameInput instanceof HTMLInputElement ? nameInput.value.trim() : String(original.name || ""),
      priceCents: priceInput instanceof HTMLInputElement ? Number(priceInput.value || 0) : Number(original.unitAmount || 0),
      stockQty: stockInput instanceof HTMLInputElement ? Number(stockInput.value || 0) : Number(original.stock || 0),
      imageUrl: imageUrlInput instanceof HTMLInputElement ? imageUrlInput.value.trim() : String(original.image || ""),
      active: activeInput instanceof HTMLInputElement ? activeInput.checked : Boolean(original.active)
    };

    const patch = {};
    if (String(current.name || "") !== String(original.name || "")) patch.name = current.name;
    if (Number(current.priceCents || 0) !== Number(original.unitAmount || 0)) patch.priceCents = Number(current.priceCents || 0);
    if (Number(current.stockQty || 0) !== Number(original.stock || 0)) patch.stockQty = Number(current.stockQty || 0);
    if (String(current.imageUrl || "") !== String(original.image || "")) patch.imageUrl = String(current.imageUrl || "");
    if (Boolean(current.active) !== Boolean(original.active)) patch.active = Boolean(current.active);
    return patch;
  }

  function handleProductFieldChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const field = String(target.getAttribute("data-field") || "");
    if (!["name", "priceCents", "stockQty", "imageUrl", "active"].includes(field)) return;

    const row = target.closest("tr[data-id]");
    if (!row) return;
    const id = String(row.getAttribute("data-id") || "");
    const original = state.products.find((product) => String(product.id) === id);
    if (!original) return;

    const patch = buildProductPatchFromRow(row, original) || {};
    if (Object.keys(patch).length === 0) {
      delete state.pendingProductEdits[id];
      setRowDirty(row, false);
      return;
    }

    state.pendingProductEdits[id] = patch;
    setRowDirty(row, true);
  }

  async function handleProductsSaveSection() {
    const entries = Object.entries(state.pendingProductEdits || {});
    if (entries.length === 0) {
      setStatus("Nenhuma alteracao pendente em produtos.", "");
      return;
    }

    const confirmed = await confirmAction({
      title: "Salvar produtos",
      message: `Aplicar ${entries.length} alteracao(oes) de produtos agora?`,
      confirmLabel: "Salvar tudo",
      tone: "ok"
    });
    if (!confirmed) return;

    let success = 0;
    for (const [id, patch] of entries) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await api(`/api/admin/products/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
        success += 1;
      } catch {
        // Ignora erro individual para seguir com os demais.
      }
    }

    await Promise.all([loadProducts(), loadAuditLogs()]);
    if (success === entries.length) {
      setStatus(`${success} produto(s) salvo(s) com sucesso.`, "ok");
    } else {
      setStatus(`Salvou ${success}/${entries.length} produtos. Verifique os restantes.`, "error");
    }
  }

  async function handleProductAction(event) {
    const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.getAttribute("data-action") !== "product-delete") return;

    const row = target.closest("tr[data-id]");
    if (!row) return;
    const id = String(row.getAttribute("data-id") || "");

    const confirmed = await confirmAction({
      title: "Arquivar produto",
      message: "Deseja arquivar este produto?",
      confirmLabel: "Arquivar",
      tone: "danger"
    });
    if (!confirmed) return;

    try {
      await api(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
      await Promise.all([loadProducts(), loadAuditLogs()]);
      setStatus("Produto arquivado.", "ok");
    } catch (error) {
      setStatus(`Falha ao arquivar produto: ${error.code || error.message}`, "error");
    }
  }

  async function handleVipCreate(event) {
    event.preventDefault();
    const payload = {
      name: String(dom.newVipName?.value || "").trim(),
      email: String(dom.newVipEmail?.value || "").trim(),
      birthDate: String(dom.newVipBirthDate?.value || "").trim(),
      cpf: digitsOnly(dom.newVipCpf?.value || "", 11),
      cep: digitsOnly(dom.newVipCep?.value || "", 8),
      accountCreated: Boolean(dom.newVipAccountCreated?.checked)
    };

    try {
      await api("/api/admin/vip/subscribers", { method: "POST", body: JSON.stringify(payload) });
      clearForm(dom.createVipForm);
      await loadVip();
      setStatus("Inscrito VIP adicionado.", "ok");
    } catch (error) {
      setStatus(`Falha ao adicionar VIP: ${error.code || error.message}`, "error");
    }
  }

  async function handleVipAction(event) {
    const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    const row = target.closest("tr[data-id]");
    if (!row) return;

    const id = String(row.getAttribute("data-id") || "");
    const action = String(target.getAttribute("data-action") || "");

    if (action === "vip-delete") {
      const confirmed = await confirmAction({
        title: "Excluir VIP",
        message: "Deseja excluir este inscrito VIP?",
        confirmLabel: "Excluir",
        tone: "danger"
      });
      if (!confirmed) return;
      try {
        await api(`/api/admin/vip/subscribers/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadVip();
        setStatus("Inscrito VIP removido.", "ok");
      } catch (error) {
        setStatus(`Falha ao remover VIP: ${error.code || error.message}`, "error");
      }
      return;
    }

    if (action === "vip-edit") {
      const current = state.vip.find((item) => String(item.id) === id);
      if (!current) return;

      const values = await promptActionFields({
        title: "Editar VIP",
        message: "Atualize os dados do inscrito VIP.",
        confirmLabel: "Salvar alteracoes",
        tone: "ok",
        fields: [
          { name: "name", label: "Nome", value: current.name || "", required: true },
          { name: "email", label: "Email", type: "email", value: current.email || "", required: true },
          { name: "birthDate", label: "Nascimento (YYYY-MM-DD)", value: current.birthDate || "" },
          { name: "cpf", label: "CPF", value: current.cpf || "", inputMode: "numeric", maxLength: 11 },
          { name: "cep", label: "CEP", value: current.cep || "", inputMode: "numeric", maxLength: 8 },
          { name: "accountCreated", label: "Conta criada", type: "checkbox", checked: Boolean(current.accountCreated) }
        ]
      });
      if (!values) return;

      try {
        await api(`/api/admin/vip/subscribers/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: String(values.name || "").trim(),
            email: String(values.email || "").trim(),
            birthDate: String(values.birthDate || "").trim(),
            cpf: digitsOnly(values.cpf || "", 11),
            cep: digitsOnly(values.cep || "", 8),
            accountCreated: Boolean(values.accountCreated)
          })
        });
        await loadVip();
        setStatus("VIP atualizado.", "ok");
      } catch (error) {
        setStatus(`Falha ao editar VIP: ${error.code || error.message}`, "error");
      }
    }
  }

  async function handleAuditAction(event) {
    const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.getAttribute("data-action") !== "audit-reverse") return;

    const row = target.closest("tr[data-id]");
    if (!row) return;
    const id = String(row.getAttribute("data-id") || "");
    const current = state.auditLogs.find((entry) => String(entry.id) === id);
    if (!current || !current.reversible) return;

    const confirmed = await confirmAction({
      title: "Reverter alteracao",
      message: `${current.summary || "Deseja reverter esta alteracao?"}\n\nEsta acao vai restaurar o estado salvo no log.`,
      confirmLabel: "Reverter agora",
      tone: "danger"
    });
    if (!confirmed) return;

    try {
      await api(`/api/admin/audit-logs/${encodeURIComponent(id)}/reverse`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await loadAll();
      setStatus("Reversao aplicada com sucesso.", "ok");
    } catch (error) {
      setStatus(`Falha ao reverter alteracao: ${error.code || error.message}`, "error");
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/studio-auth/logout", { method: "POST", credentials: "include" });
      redirectToStudioLogin();
    } catch {
      redirectToStudioLogin();
    }
  }

  async function handleRecoveryRegenerate() {
    const values = await promptActionFields({
      title: "Gerar novos codigos MFA",
      message: "Confirme com senha e codigo MFA atual.",
      confirmLabel: "Gerar codigos",
      tone: "ok",
      fields: [
        { name: "password", label: "Senha", type: "password", required: true },
        {
          name: "token",
          label: "Codigo MFA (6 digitos)",
          required: true,
          inputMode: "numeric",
          maxLength: 6
        }
      ]
    });
    if (!values) return;

    try {
      const data = await api("/api/studio-auth/mfa/recovery/regenerate", {
        method: "POST",
        body: JSON.stringify({
          password: String(values.password || ""),
          token: String(values.token || "").replace(/\D/g, "").slice(0, 6)
        })
      });
      const codes = Array.isArray(data?.recoveryCodes) ? data.recoveryCodes : [];
      if (codes.length > 0) {
        await showActionModal({
          title: "Codigos atualizados",
          message: `Guarde estes codigos em local seguro:\n\n${codes.join("\n")}`,
          confirmLabel: "Fechar",
          cancelLabel: "",
          tone: "ok",
          fields: []
        });
      }
      setStatus("Codigos de recuperacao atualizados.", "ok");
    } catch (error) {
      setStatus(`Falha ao renovar codigos MFA: ${error.code || error.message}`, "error");
    }
  }

  async function handleDisableMfa() {
    const values = await promptActionFields({
      title: "Desativar MFA",
      message: "Esta acao vai bloquear o Studio ate nova configuracao de MFA.",
      confirmLabel: "Desativar MFA",
      tone: "danger",
      fields: [
        { name: "password", label: "Senha", type: "password", required: true },
        {
          name: "token",
          label: "Codigo MFA (6 digitos)",
          required: true,
          inputMode: "numeric",
          maxLength: 6
        }
      ]
    });
    if (!values) return;

    try {
      await api("/api/studio-auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({
          password: String(values.password || ""),
          token: String(values.token || "").replace(/\D/g, "").slice(0, 6)
        })
      });
      setStatus("MFA desativado. Configure novamente para operar o Studio.", "ok");
      redirectToStudioLogin("mfa_setup_required");
    } catch (error) {
      setStatus(`Falha ao desativar MFA: ${error.code || error.message}`, "error");
    }
  }

  function handleActionModalSubmit(event) {
    event.preventDefault();
    if (!state.activeModal) return;

    const fields = Array.isArray(state.activeModal.fields) ? state.activeModal.fields : [];
    const values = readModalValues(fields);
    const validationError = validateModalValues(fields, values);

    if (validationError) {
      if (dom.actionModalError) {
        dom.actionModalError.hidden = false;
        dom.actionModalError.textContent = validationError;
      }
      return;
    }

    closeActionModal({ confirmed: true, values });
  }

  function handleActionModalCancel() {
    closeActionModal({ confirmed: false, values: {} });
  }

  function handleActionModalBackdrop(event) {
    if (!state.activeModal) return;
    if (event.target === dom.actionModal) {
      handleActionModalCancel();
    }
  }

  function handleEscapeKey(event) {
    if (event.key !== "Escape") return;
    if (!state.activeModal) return;
    handleActionModalCancel();
  }

  function bindEvents() {
    dom.actionModalForm?.addEventListener("submit", handleActionModalSubmit);
    dom.actionModalCancel?.addEventListener("click", handleActionModalCancel);
    dom.actionModal?.addEventListener("click", handleActionModalBackdrop);
    document.addEventListener("keydown", handleEscapeKey);

    dom.tabs.forEach((button) => {
      button.addEventListener("click", () => {
        switchTab(String(button.getAttribute("data-tab") || "users"));
      });
    });

    dom.refreshAllBtn?.addEventListener("click", loadAll);
    dom.regenerateRecoveryBtn?.addEventListener("click", handleRecoveryRegenerate);
    dom.disableMfaBtn?.addEventListener("click", handleDisableMfa);
    dom.logoutBtn?.addEventListener("click", handleLogout);

    dom.usersRefreshBtn?.addEventListener("click", loadUsers);
    dom.usersSearch?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadUsers();
      }
    });
    dom.createUserForm?.addEventListener("submit", handleUserCreate);
    dom.usersBody?.addEventListener("click", handleUserAction);

    dom.ordersRefreshBtn?.addEventListener("click", loadOrders);
    dom.ordersSearch?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadOrders();
      }
    });
    dom.ordersStatusFilter?.addEventListener("change", loadOrders);
    dom.ordersBody?.addEventListener("change", handleOrderFieldChange);
    dom.ordersBody?.addEventListener("click", handleShippingOrderAction);
    dom.ordersSaveSectionBtn?.addEventListener("click", handleOrdersSaveSection);

    dom.productsRefreshBtn?.addEventListener("click", loadProducts);
    dom.productsSearch?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadProducts();
      }
    });
    dom.productsIncludeInactive?.addEventListener("change", loadProducts);
    dom.createProductForm?.addEventListener("submit", handleProductCreate);
    dom.productsBody?.addEventListener("input", handleProductFieldChange);
    dom.productsBody?.addEventListener("change", handleProductFieldChange);
    dom.productsBody?.addEventListener("click", handleProductAction);
    dom.productsSaveSectionBtn?.addEventListener("click", handleProductsSaveSection);

    dom.vipRefreshBtn?.addEventListener("click", loadVip);
    dom.createVipForm?.addEventListener("submit", handleVipCreate);
    dom.vipBody?.addEventListener("click", handleVipAction);

    dom.auditRefreshBtn?.addEventListener("click", loadAuditLogs);
    dom.auditBody?.addEventListener("click", handleAuditAction);
  }

  async function init() {
    setHeadActionsVisible(false);
    bindEvents();
    switchTab("users");
    const allowed = await ensureAdmin();
    if (!allowed) return;
    await loadAll();
  }

  init();
})();

