(function initVipAdminPage() {
  const TOKEN_KEY = "tsebi-vip-admin-token";

  const tokenInput = document.getElementById("vipToken");
  const saveTokenBtn = document.getElementById("saveTokenBtn");
  const clearTokenBtn = document.getElementById("clearTokenBtn");
  const authStatus = document.getElementById("authStatus");

  const addCard = document.getElementById("addCard");
  const listCard = document.getElementById("listCard");

  const newVipName = document.getElementById("newVipName");
  const newVipEmail = document.getElementById("newVipEmail");
  const newVipBirthDate = document.getElementById("newVipBirthDate");
  const newVipCpf = document.getElementById("newVipCpf");
  const newVipCep = document.getElementById("newVipCep");
  const newVipAccountCreated = document.getElementById("newVipAccountCreated");
  const addVipBtn = document.getElementById("addVipBtn");
  const formStatus = document.getElementById("formStatus");

  const loadStatus = document.getElementById("loadStatus");
  const vipList = document.getElementById("vipList");
  const emptyState = document.getElementById("emptyState");
  const vipCount = document.getElementById("vipCount");

  let subscribers = [];
  let isBusy = false;

  function readToken() {
    try {
      return String(sessionStorage.getItem(TOKEN_KEY) || "").trim();
    } catch {
      return "";
    }
  }

  function writeToken(token) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {}
  }

  function clearTokenStorage() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  function setStatus(node, message, tone) {
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error", tone === "error");
    node.classList.toggle("ok", tone === "ok");
  }

  function setAuthenticatedView(enabled) {
    if (addCard) addCard.hidden = !enabled;
    if (listCard) listCard.hidden = !enabled;
    if (!enabled) {
      subscribers = [];
      renderList();
    }
  }

  function formatDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString("pt-BR");
  }

  function formatBirthDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("pt-BR");
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
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, maxLength);
  }

  function setBusy(nextBusy) {
    isBusy = Boolean(nextBusy);
    if (saveTokenBtn) saveTokenBtn.disabled = isBusy;
    if (clearTokenBtn) clearTokenBtn.disabled = isBusy;
    if (addVipBtn) addVipBtn.disabled = isBusy;
  }

  async function apiRequest(path, options) {
    const token = readToken();
    if (!token) {
      const err = new Error("Token ausente");
      err.code = "UNAUTHORIZED";
      throw err;
    }

    const headers = {
      "x-vip-admin-token": token,
      ...(options && options.headers ? options.headers : {})
    };

    const method = String(options?.method || "GET").toUpperCase();
    const requestOptions = {
      ...(options || {}),
      method,
      headers,
      credentials: "include"
    };

    if (method === "GET" && typeof requestOptions.cache === "undefined" && typeof requestOptions.next === "undefined") {
      requestOptions.next = { revalidate: 60 };
    }

    const response = await fetch(path, requestOptions);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const err = new Error(String(data && data.error ? data.error : "REQUEST_FAILED"));
      err.code = String(data && data.error ? data.error : "REQUEST_FAILED");
      throw err;
    }

    return data;
  }

  function renderList() {
    if (!vipList || !emptyState || !vipCount) return;

    vipList.innerHTML = "";

    vipCount.textContent = `${subscribers.length} inscrito(s)`;
    emptyState.hidden = subscribers.length !== 0;

    subscribers.forEach((entry) => {
      const accountCreated = Boolean(entry && entry.accountCreated);
      const item = document.createElement("li");
      item.className = "vip-item";
      item.setAttribute("data-id", String(entry.id || ""));
      item.innerHTML = `
        <div class="vip-item-head">
          <div class="vip-main">
            <strong>${escapeHtml(entry.name || "-")}</strong>
            <span>${escapeHtml(entry.email || "-")}</span>
            <span>Inscricao: ${escapeHtml(formatDate(entry.subscribedAt))}</span>
          </div>
          <span class="pill${accountCreated ? "" : " no"}">${accountCreated ? "Conta criada" : "Conta nao criada"}</span>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="secondary" data-action="toggle">Abrir detalhes</button>
            <button type="button" class="danger" data-action="remove">Remover</button>
          </div>
        </div>
        <div class="vip-details">
          <div class="vip-details-grid">
            <div><strong>ID:</strong> ${escapeHtml(entry.id || "-")}</div>
            <div><strong>Nascimento:</strong> ${escapeHtml(formatBirthDate(entry.birthDate))}</div>
            <div><strong>CPF:</strong> ${escapeHtml(entry.cpf || "-")}</div>
            <div><strong>CEP:</strong> ${escapeHtml(entry.cep || "-")}</div>
            <div><strong>Origem:</strong> ${escapeHtml(entry.source || "-")}</div>
            <div><strong>Conta criada em:</strong> ${escapeHtml(formatDate(entry.accountCreatedAt))}</div>
            <div><strong>IP:</strong> ${escapeHtml(entry.ipAddress || "-")}</div>
            <div><strong>User agent:</strong> ${escapeHtml(entry.userAgent || "-")}</div>
          </div>
        </div>
      `;

      vipList.appendChild(item);
    });
  }

  async function loadSubscribers() {
    setBusy(true);
    setStatus(loadStatus, "Carregando inscritos...", null);

    try {
      const data = await apiRequest("/api/vip/subscribers?limit=500&offset=0", {
        method: "GET"
      });

      subscribers = Array.isArray(data && data.subscribers) ? data.subscribers : [];
      renderList();
      setAuthenticatedView(true);
      setStatus(loadStatus, "Lista carregada com sucesso.", "ok");
      setStatus(authStatus, "Token valido e ativo nesta sessao.", "ok");
      return true;
    } catch (error) {
      const code = String(error && error.code ? error.code : "");
      if (code === "UNAUTHORIZED") {
        setAuthenticatedView(false);
        setStatus(authStatus, "Token invalido. Confira e tente novamente.", "error");
        setStatus(loadStatus, "", null);
        return false;
      }

      setStatus(loadStatus, "Falha ao buscar inscritos VIP.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function clearAddForm() {
    if (newVipName) newVipName.value = "";
    if (newVipEmail) newVipEmail.value = "";
    if (newVipBirthDate) newVipBirthDate.value = "";
    if (newVipCpf) newVipCpf.value = "";
    if (newVipCep) newVipCep.value = "";
    if (newVipAccountCreated) newVipAccountCreated.checked = false;
  }

  async function addSubscriber() {
    const name = String(newVipName && newVipName.value ? newVipName.value : "").trim();
    const email = String(newVipEmail && newVipEmail.value ? newVipEmail.value : "").trim();
    const birthDate = String(newVipBirthDate && newVipBirthDate.value ? newVipBirthDate.value : "").trim();
    const cpf = digitsOnly(newVipCpf && newVipCpf.value ? newVipCpf.value : "", 11);
    const cep = digitsOnly(newVipCep && newVipCep.value ? newVipCep.value : "", 8);
    const accountCreated = Boolean(newVipAccountCreated && newVipAccountCreated.checked);

    if (!name || !email) {
      setStatus(formStatus, "Preencha nome e email para adicionar.", "error");
      return;
    }

    setBusy(true);
    setStatus(formStatus, "Salvando inscrito...", null);

    try {
      await apiRequest("/api/vip/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, birthDate, cpf, cep, accountCreated })
      });

      clearAddForm();
      setStatus(formStatus, "Inscrito salvo com sucesso.", "ok");
      await loadSubscribers();
    } catch (error) {
      const code = String(error && error.code ? error.code : "");
      if (code === "INVALID_INPUT") {
        setStatus(formStatus, "Dados invalidos. Revise os campos.", "error");
      } else if (code === "UNAUTHORIZED") {
        setStatus(formStatus, "Token invalido. Entre novamente.", "error");
        setAuthenticatedView(false);
      } else {
        setStatus(formStatus, "Nao foi possivel salvar inscrito.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeSubscriber(id) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return;

    const confirmed = window.confirm("Tem certeza que deseja remover este inscrito VIP?");
    if (!confirmed) return;

    setBusy(true);
    setStatus(loadStatus, "Removendo inscrito...", null);

    try {
      await apiRequest(`/api/vip/subscribers/${numericId}`, {
        method: "DELETE"
      });

      subscribers = subscribers.filter((entry) => Number(entry && entry.id) !== numericId);
      renderList();
      setStatus(loadStatus, "Inscrito removido com sucesso.", "ok");
    } catch (error) {
      const code = String(error && error.code ? error.code : "");
      if (code === "UNAUTHORIZED") {
        setAuthenticatedView(false);
        setStatus(authStatus, "Token invalido. Entre novamente.", "error");
      } else {
        setStatus(loadStatus, "Nao foi possivel remover o inscrito.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveTokenAndLoad() {
    const token = String(tokenInput && tokenInput.value ? tokenInput.value : "").trim();
    if (!token) {
      setStatus(authStatus, "Informe um token valido.", "error");
      return;
    }

    writeToken(token);
    if (tokenInput) tokenInput.value = "";
    setStatus(authStatus, "Token salvo. Validando...", null);
    await loadSubscribers();
  }

  saveTokenBtn && saveTokenBtn.addEventListener("click", saveTokenAndLoad);

  tokenInput && tokenInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveTokenAndLoad();
    }
  });

  clearTokenBtn && clearTokenBtn.addEventListener("click", () => {
    clearTokenStorage();
    setAuthenticatedView(false);
    setStatus(authStatus, "Token removido.", null);
    setStatus(loadStatus, "", null);
    setStatus(formStatus, "", null);
  });

  addVipBtn && addVipBtn.addEventListener("click", addSubscriber);

  vipList && vipList.addEventListener("click", (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest("button[data-action]") : null;
    if (!button) return;

    const action = String(button.getAttribute("data-action") || "");
    const item = button.closest(".vip-item");
    if (!item) return;

    const id = Number(item.getAttribute("data-id") || 0);

    if (action === "toggle") {
      const isOpen = item.classList.toggle("open");
      button.textContent = isOpen ? "Fechar detalhes" : "Abrir detalhes";
      return;
    }

    if (action === "remove") {
      removeSubscriber(id);
    }
  });

  const existingToken = readToken();
  if (existingToken) {
    setStatus(authStatus, "Token encontrado na sessao. Carregando lista...", null);
    loadSubscribers();
  } else {
    setAuthenticatedView(false);
    setStatus(authStatus, "Informe o token para liberar a lista VIP.", null);
  }
})();
