(() => {
  const dom = {
    adminApp: document.getElementById("adminApp"),
    adminLocked: document.getElementById("adminLocked"),
    adminIdentity: document.getElementById("adminIdentity"),
    adminStatus: document.getElementById("adminStatus"),
    refreshAllBtn: document.getElementById("refreshAllBtn"),
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

    productsSearch: document.getElementById("productsSearch"),
    productsIncludeInactive: document.getElementById("productsIncludeInactive"),
    productsRefreshBtn: document.getElementById("productsRefreshBtn"),
    productsBody: document.getElementById("productsBody"),
    createProductForm: document.getElementById("createProductForm"),
    newProductSku: document.getElementById("newProductSku"),
    newProductName: document.getElementById("newProductName"),
    newProductPrice: document.getElementById("newProductPrice"),
    newProductStock: document.getElementById("newProductStock"),

    vipRefreshBtn: document.getElementById("vipRefreshBtn"),
    vipBody: document.getElementById("vipBody"),
    createVipForm: document.getElementById("createVipForm"),
    newVipName: document.getElementById("newVipName"),
    newVipEmail: document.getElementById("newVipEmail"),
    newVipBirthDate: document.getElementById("newVipBirthDate"),
    newVipCpf: document.getElementById("newVipCpf"),
    newVipCep: document.getElementById("newVipCep"),
    newVipAccountCreated: document.getElementById("newVipAccountCreated")
  };

  const state = {
    activeTab: "users",
    users: [],
    orders: [],
    products: [],
    vip: []
  };

  const orderStatuses = ["pending_payment", "processing", "paid", "failed", "canceled", "refunded"];

  function setStatus(message, tone = "") {
    if (!dom.adminStatus) return;
    dom.adminStatus.textContent = message || "";
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

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.headers || {}),
        ...(options.body ? { "Content-Type": "application/json" } : {})
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(data && data.error ? data.error : "REQUEST_FAILED"));
      error.code = String(data && data.error ? data.error : "REQUEST_FAILED");
      error.status = response.status;
      throw error;
    }

    return data;
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
      const selectOptions = orderStatuses
        .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`)
        .join("");
      row.innerHTML = `
        <td><small>${escapeHtml(order.id)}</small></td>
        <td>
          <div>${escapeHtml(order.userName || "-")}</div>
          <small>${escapeHtml(order.userEmail || "-")}</small>
        </td>
        <td>${escapeHtml(moneyFromCents(order.amount, order.currency))}</td>
        <td>
          <select data-field="status">${selectOptions}</select>
        </td>
        <td><small>${escapeHtml(formatDate(order.createdAt))}</small></td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-ghost" data-action="order-save">Salvar</button>
          </div>
        </td>
      `;
      dom.ordersBody.appendChild(row);
    });
  }

  function renderProducts() {
    if (!dom.productsBody) return;
    dom.productsBody.innerHTML = "";
    state.products.forEach((product) => {
      const row = document.createElement("tr");
      row.setAttribute("data-id", String(product.id));
      row.innerHTML = `
        <td><small>${escapeHtml(product.sku || product.id)}</small></td>
        <td><input data-field="name" value="${escapeHtml(product.name || "")}" /></td>
        <td><input data-field="priceCents" type="number" min="0" step="1" value="${Number(product.unitAmount || 0)}" /></td>
        <td><input data-field="stockQty" type="number" min="0" step="1" value="${Number(product.stock || 0)}" /></td>
        <td><input data-field="active" type="checkbox" ${product.active ? "checked" : ""} /></td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-ghost" data-action="product-save">Salvar</button>
            <button type="button" class="btn btn-danger" data-action="product-delete">Arquivar</button>
          </div>
        </td>
      `;
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
    renderOrders();
  }

  async function loadProducts() {
    const search = encodeURIComponent(String(dom.productsSearch?.value || "").trim());
    const includeInactive = dom.productsIncludeInactive?.checked ? "1" : "0";
    const data = await api(`/api/admin/products?limit=300&offset=0&search=${search}&includeInactive=${includeInactive}`);
    state.products = Array.isArray(data.products) ? data.products : [];
    renderProducts();
  }

  async function loadVip() {
    const data = await api(`/api/admin/vip/subscribers?limit=300&offset=0`);
    state.vip = Array.isArray(data.subscribers) ? data.subscribers : [];
    renderVip();
  }

  async function loadAll() {
    setStatus("Atualizando dados...", "");
    try {
      await Promise.all([loadUsers(), loadOrders(), loadProducts(), loadVip()]);
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
      const data = await api("/api/admin/me");
      dom.adminIdentity.textContent = `Acesso admin liberado para ${data?.admin?.name || data?.admin?.email || "Administrador"}.`;
      dom.adminApp.hidden = false;
      dom.adminLocked.hidden = true;
      return true;
    } catch (error) {
      dom.adminIdentity.textContent = "Você não está autenticado como administrador.";
      dom.adminApp.hidden = true;
      dom.adminLocked.hidden = false;
      setStatus(
        error.code === "ADMIN_NOT_CONFIGURED"
          ? "Defina ADMIN_EMAILS no Railway para liberar o painel admin."
          : "Acesso negado ao painel admin.",
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
      setStatus("Usuário criado com sucesso.", "ok");
    } catch (error) {
      setStatus(`Falha ao criar usuário: ${error.code || error.message}`, "error");
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
      if (!window.confirm("Remover este usuário?")) return;
      try {
        await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadUsers();
        setStatus("Usuário removido.", "ok");
      } catch (error) {
        setStatus(`Falha ao remover usuário: ${error.code || error.message}`, "error");
      }
      return;
    }

    if (action === "user-edit") {
      const current = state.users.find((user) => String(user.id) === id);
      if (!current) return;

      const name = window.prompt("Nome", current.name || "");
      if (name == null) return;
      const email = window.prompt("Email", current.email || "");
      if (email == null) return;
      const birthDate = window.prompt("Nascimento (YYYY-MM-DD)", current.birthDate || "");
      if (birthDate == null) return;
      const cpf = window.prompt("CPF (somente números)", current.cpf || "") || "";
      const cep = window.prompt("CEP (somente números)", current.cep || "") || "";

      try {
        await api(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: String(name || "").trim(),
            email: String(email || "").trim(),
            birthDate: String(birthDate || "").trim(),
            cpf: digitsOnly(cpf, 11),
            cep: digitsOnly(cep, 8)
          })
        });
        await loadUsers();
        setStatus("Usuário atualizado.", "ok");
      } catch (error) {
        setStatus(`Falha ao editar usuário: ${error.code || error.message}`, "error");
      }
    }
  }

  async function handleOrderAction(event) {
    const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.getAttribute("data-action") !== "order-save") return;

    const row = target.closest("tr[data-id]");
    if (!row) return;
    const id = String(row.getAttribute("data-id") || "");
    const statusSelect = row.querySelector('select[data-field="status"]');
    const status = statusSelect instanceof HTMLSelectElement ? statusSelect.value : "";

    try {
      await api(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadOrders();
      setStatus("Pedido atualizado.", "ok");
    } catch (error) {
      setStatus(`Falha ao atualizar pedido: ${error.code || error.message}`, "error");
    }
  }

  async function handleProductCreate(event) {
    event.preventDefault();
    const payload = {
      sku: String(dom.newProductSku?.value || "").trim(),
      name: String(dom.newProductName?.value || "").trim(),
      priceCents: Number(dom.newProductPrice?.value || 0),
      stockQty: Number(dom.newProductStock?.value || 0),
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

  async function handleProductAction(event) {
    const target = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(target instanceof HTMLButtonElement)) return;

    const row = target.closest("tr[data-id]");
    if (!row) return;

    const id = String(row.getAttribute("data-id") || "");
    const action = String(target.getAttribute("data-action") || "");

    if (action === "product-delete") {
      if (!window.confirm("Arquivar este produto?")) return;
      try {
        await api(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadProducts();
        setStatus("Produto arquivado.", "ok");
      } catch (error) {
        setStatus(`Falha ao arquivar produto: ${error.code || error.message}`, "error");
      }
      return;
    }

    if (action === "product-save") {
      const nameInput = row.querySelector('input[data-field="name"]');
      const priceInput = row.querySelector('input[data-field="priceCents"]');
      const stockInput = row.querySelector('input[data-field="stockQty"]');
      const activeInput = row.querySelector('input[data-field="active"]');

      const payload = {
        name: nameInput instanceof HTMLInputElement ? nameInput.value.trim() : "",
        priceCents: priceInput instanceof HTMLInputElement ? Number(priceInput.value || 0) : 0,
        stockQty: stockInput instanceof HTMLInputElement ? Number(stockInput.value || 0) : 0,
        active: activeInput instanceof HTMLInputElement ? activeInput.checked : true
      };

      try {
        await api(`/api/admin/products/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        await loadProducts();
        setStatus("Produto atualizado.", "ok");
      } catch (error) {
        setStatus(`Falha ao atualizar produto: ${error.code || error.message}`, "error");
      }
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
      if (!window.confirm("Excluir este inscrito VIP?")) return;
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

      const name = window.prompt("Nome", current.name || "");
      if (name == null) return;
      const email = window.prompt("Email", current.email || "");
      if (email == null) return;
      const birthDate = window.prompt("Nascimento (YYYY-MM-DD)", current.birthDate || "");
      if (birthDate == null) return;
      const cpf = window.prompt("CPF", current.cpf || "") || "";
      const cep = window.prompt("CEP", current.cep || "") || "";
      const accountCreated = window.confirm("Marcar conta como criada?");

      try {
        await api(`/api/admin/vip/subscribers/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: String(name || "").trim(),
            email: String(email || "").trim(),
            birthDate: String(birthDate || "").trim(),
            cpf: digitsOnly(cpf, 11),
            cep: digitsOnly(cep, 8),
            accountCreated
          })
        });
        await loadVip();
        setStatus("VIP atualizado.", "ok");
      } catch (error) {
        setStatus(`Falha ao editar VIP: ${error.code || error.message}`, "error");
      }
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      window.location.href = "conta.html";
    } catch {
      window.location.href = "conta.html";
    }
  }

  function bindEvents() {
    dom.tabs.forEach((button) => {
      button.addEventListener("click", () => {
        switchTab(String(button.getAttribute("data-tab") || "users"));
      });
    });

    dom.refreshAllBtn?.addEventListener("click", loadAll);
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
    dom.ordersBody?.addEventListener("click", handleOrderAction);

    dom.productsRefreshBtn?.addEventListener("click", loadProducts);
    dom.productsSearch?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadProducts();
      }
    });
    dom.productsIncludeInactive?.addEventListener("change", loadProducts);
    dom.createProductForm?.addEventListener("submit", handleProductCreate);
    dom.productsBody?.addEventListener("click", handleProductAction);

    dom.vipRefreshBtn?.addEventListener("click", loadVip);
    dom.createVipForm?.addEventListener("submit", handleVipCreate);
    dom.vipBody?.addEventListener("click", handleVipAction);
  }

  async function init() {
    bindEvents();
    switchTab("users");
    const allowed = await ensureAdmin();
    if (!allowed) return;
    await loadAll();
  }

  init();
})();
