(function initVipAdminPage() {
  const TOKEN_KEY = "tsebi-vip-admin-token";

  const tokenInput = document.getElementById("vipToken");
  const saveTokenBtn = document.getElementById("saveTokenBtn");
  const clearTokenBtn = document.getElementById("clearTokenBtn");
  const authStatus = document.getElementById("authStatus");
  const limitInput = document.getElementById("limitInput");
  const offsetInput = document.getElementById("offsetInput");
  const loadBtn = document.getElementById("loadBtn");
  const loadStatus = document.getElementById("loadStatus");
  const vipTable = document.getElementById("vipTable");
  const vipTableBody = document.getElementById("vipTableBody");

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

  function clearToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  function setAuthStatus(message, isError) {
    if (!authStatus) return;
    authStatus.textContent = message || "";
    authStatus.classList.toggle("error", Boolean(isError));
  }

  function setLoadStatus(message, isError) {
    if (!loadStatus) return;
    loadStatus.textContent = message || "";
    loadStatus.classList.toggle("error", Boolean(isError));
  }

  function formatDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString("pt-BR");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderSubscribers(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!vipTableBody || !vipTable) return;
    vipTableBody.innerHTML = "";

    if (rows.length === 0) {
      vipTable.hidden = true;
      return;
    }

    rows.forEach((entry) => {
      const tr = document.createElement("tr");
      const accountCreated = Boolean(entry && entry.accountCreated);
      tr.innerHTML = `
        <td>${escapeHtml(entry?.id)}</td>
        <td>${escapeHtml(entry?.name)}</td>
        <td>${escapeHtml(entry?.email)}</td>
        <td>${escapeHtml(entry?.birthDate || "-")}</td>
        <td>${escapeHtml(entry?.cpf || "-")}</td>
        <td>${escapeHtml(entry?.cep || "-")}</td>
        <td><span class="pill${accountCreated ? "" : " no"}">${accountCreated ? "Criada" : "Nao"}</span></td>
        <td>${escapeHtml(formatDate(entry?.subscribedAt))}</td>
      `;
      vipTableBody.appendChild(tr);
    });

    vipTable.hidden = false;
  }

  async function loadSubscribers() {
    const token = readToken();
    if (!token) {
      setLoadStatus("Informe e salve o token primeiro.", true);
      return;
    }

    const limit = Math.max(1, Math.min(500, Number(limitInput?.value || 100)));
    const offset = Math.max(0, Number(offsetInput?.value || 0));
    setLoadStatus("Carregando...", false);

    try {
      const response = await fetch(`/api/vip/subscribers?limit=${limit}&offset=${offset}`, {
        method: "GET",
        headers: {
          "x-vip-admin-token": token
        },
        credentials: "include"
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = String(data?.error || "");
        if (code === "UNAUTHORIZED") {
          setLoadStatus("Token invalido.", true);
          return;
        }
        setLoadStatus("Falha ao carregar inscritos.", true);
        return;
      }

      const subscribers = Array.isArray(data.subscribers) ? data.subscribers : [];
      renderSubscribers(subscribers);
      setLoadStatus(`Carregado com sucesso. ${subscribers.length} registro(s).`, false);
    } catch {
      setLoadStatus("Falha de conexao ao carregar inscritos.", true);
    }
  }

  saveTokenBtn?.addEventListener("click", () => {
    const token = String(tokenInput?.value || "").trim();
    if (!token) {
      setAuthStatus("Informe um token valido.", true);
      return;
    }
    writeToken(token);
    if (tokenInput) tokenInput.value = "";
    setAuthStatus("Token salvo nesta sessao.", false);
  });

  clearTokenBtn?.addEventListener("click", () => {
    clearToken();
    renderSubscribers([]);
    setAuthStatus("Token removido.", false);
    setLoadStatus("");
  });

  loadBtn?.addEventListener("click", loadSubscribers);

  const existingToken = readToken();
  if (existingToken) {
    setAuthStatus("Token ativo nesta sessao.", false);
    loadSubscribers();
  } else {
    setAuthStatus("Sem token salvo.", false);
  }
})();

