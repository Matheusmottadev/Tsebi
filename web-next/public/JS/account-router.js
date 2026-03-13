(function initAccountRouter() {
  document.body?.classList.add("conta-page");
  let store = window.TsebiUserStore || null;
  let subnav = document.querySelector(".account-route-toolbar") || document.getElementById("accountToolbarShell") || document.querySelector(".conta-subnav");
  let subnavLinks = subnav ? Array.from(subnav.querySelectorAll("[data-section]")) : [];
  const mount = document.getElementById("accountSectionMount");
  const loader = document.getElementById("sectionLoader");
  const authGate = document.getElementById("contaAuthGate");
  const dashboard = document.getElementById("contaDashboard");
  const mainWrap = document.querySelector(".conta-wrap");
  const heroSection = document.getElementById("accountHero");
  const authForm = document.getElementById("contaAuthForm");
  const authEmail = document.getElementById("contaAuthEmail");
  const authPassword = document.getElementById("contaAuthPassword");
  const authSubmit = document.getElementById("contaAuthSubmit");
  const authFeedback = document.getElementById("contaAuthFeedback");
  const logoutBtn = document.getElementById("contaLogoutBtn");
  const avatarEl = document.getElementById("contaAvatar");
  const titleEl = document.getElementById("contaClientTitle");
  const nameEl = document.getElementById("contaClientName");

  const previewMode = String(new URLSearchParams(window.location.search).get("preview") || "") === "1";

  const state = {
    user: null,
    orders: [],
    favorites: [],
    products: [],
    detailCache: {}
  };

  function resolveStore() {
    if (!store && window.TsebiUserStore) {
      store = window.TsebiUserStore;
    }
    return store;
  }

  function toolbarMarkup() {
    return `
      <a href="#overview" data-section="overview" class="is-active">Visao Geral</a>
      <a href="#profile" data-section="profile">Meu Perfil</a>
      <a href="#orders" data-section="orders">Meus Pedidos</a>
      <a href="#private-care" data-section="private-care">Atendimentos Privados</a>
      <a href="#recommendations" data-section="recommendations">Recomendacoes</a>
      <a href="#wishlist" data-section="wishlist">Lista de Desejos</a>
      <a href="#repairs" data-section="repairs">Servico de Reparos</a>
    `;
  }

  function applyToolbarStyles(node) {
    if (!node) return;
    node.style.display = "flex";
    node.style.visibility = "visible";
    node.style.opacity = "1";
    node.style.height = "60px";
    node.style.minHeight = "60px";
    node.style.position = "relative";
    node.style.zIndex = "30";
    node.style.alignItems = "center";
    node.style.justifyContent = "center";
    node.style.gap = "0";
    node.style.padding = "0 16px";
    node.style.background = "#fff";
    node.style.borderBottom = "1px solid #eaeaea";
    node.style.overflowX = "auto";
    node.style.whiteSpace = "nowrap";

    Array.from(node.querySelectorAll("[data-section]")).forEach((link, index) => {
      link.style.display = "inline-flex";
      link.style.alignItems = "center";
      link.style.height = "60px";
      link.style.padding = "0 14px";
      link.style.color = "#111";
      link.style.textDecoration = "none";
      link.style.fontSize = "13px";
      link.style.fontFamily = "\"Montserrat\", sans-serif";
      link.style.borderBottom = "2px solid transparent";
      if (index > 0) {
        link.style.borderLeft = "1px solid #e6e6e6";
      }
    });
  }

  function ensureSubnavPlacement() {
    const routeToolbar = document.querySelector(".account-route-toolbar");
    if (routeToolbar) {
      subnav = routeToolbar;
      subnavLinks = Array.from(subnav.querySelectorAll("[data-section]"));
      return;
    }
    if (!dashboard && !mainWrap) return;
    const oldSubnavs = Array.from(document.querySelectorAll(".conta-subnav"));
    oldSubnavs.forEach((node) => {
      if (node.id !== "accountToolbarShell") node.remove();
    });
    subnav = document.getElementById("accountToolbarShell");
    if (!subnav) {
      subnav = document.createElement("nav");
      subnav.id = "accountToolbarShell";
      subnav.className = "account-toolbar-shell";
      subnav.setAttribute("aria-label", "Navegacao da conta");
      subnav.innerHTML = toolbarMarkup();
    }
    if (dashboard && heroSection) {
      if (subnav.parentElement !== dashboard || subnav.nextElementSibling !== heroSection) {
        dashboard.insertBefore(subnav, heroSection);
      }
    } else if (mainWrap && subnav.nextElementSibling !== mainWrap) {
      mainWrap.parentNode?.insertBefore(subnav, mainWrap);
    }

    subnav.hidden = false;
    subnav.removeAttribute("hidden");
    applyToolbarStyles(subnav);
    subnavLinks = Array.from(subnav.querySelectorAll("[data-section]"));
  }

  function showLoader() {
    if (!loader) return;
    loader.classList.add("is-active");
    loader.setAttribute("aria-hidden", "false");
  }

  function hideLoader() {
    if (!loader) return;
    loader.classList.remove("is-active");
    loader.setAttribute("aria-hidden", "true");
  }

  function setAuthFeedback(message, isError) {
    if (!authFeedback) return;
    authFeedback.textContent = String(message || "");
    authFeedback.style.color = isError ? "#991b1b" : "#1d6a2d";
  }

  function showAuthGate() {
    const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  function showDashboard() {
    ensureSubnavPlacement();
    if (authGate) authGate.hidden = true;
    if (dashboard) dashboard.hidden = false;
    if (subnav) {
      subnav.hidden = false;
      subnav.removeAttribute("hidden");
      applyToolbarStyles(subnav);
    }
  }

  function normalizeTitle(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "sr" || normalized === "sra" || normalized === "srta") return normalized;
    return "nao_informar";
  }

  function titleLabel(value) {
    const key = normalizeTitle(value);
    if (key === "sr") return "SR.";
    if (key === "sra") return "SRA.";
    if (key === "srta") return "SRTA.";
    return "CLIENTE";
  }

  function titlePrefix(value) {
    const key = normalizeTitle(value);
    if (key === "sr") return "Sr.";
    if (key === "sra") return "Sra.";
    if (key === "srta") return "Srta.";
    return "";
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "CL";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  function renderHeaderUser() {
    const safeName = String(state.user?.name || "Cliente Tsebi").trim() || "Cliente Tsebi";
    const prefix = titlePrefix(state.user?.title);
    if (avatarEl) avatarEl.textContent = initials(safeName);
    if (titleEl) titleEl.textContent = titleLabel(state.user?.title);
    if (nameEl) nameEl.textContent = prefix ? `${prefix} ${safeName}` : safeName;
  }

  function setActiveSubnav(section) {
    ensureSubnavPlacement();
    const active = normalizeSection(section);
    subnavLinks.forEach((link) => {
      const linkSection = normalizeSection(link.getAttribute("data-section") || "");
      link.classList.toggle("is-active", linkSection === active);
      link.style.borderBottomColor = linkSection === active ? "#111" : "transparent";
      link.style.fontWeight = linkSection === active ? "500" : "400";
    });
  }

  function toggleHeroImages() {
    const banner = document.querySelector(".account-hero-banner");
    const avatar = document.querySelector(".account-hero-avatar");
    if (!banner || !avatar) return;
    banner.style.display = "";
    avatar.style.display = "";
  }

  function renderTemplate(templateId) {
    const tpl = document.getElementById(templateId);
    if (!tpl || !mount) return;
    mount.innerHTML = "";
    mount.appendChild(tpl.content.cloneNode(true));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function money(value, currency) {
    return (Number(value || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: String(currency || "brl").toUpperCase()
    });
  }

  function orderStatus(orderOrStatus) {
    const order = orderOrStatus && typeof orderOrStatus === "object" ? orderOrStatus : null;
    const s = String(order ? order.status : orderOrStatus || "").trim().toLowerCase();
    const currentStatus = String(order?.currentStatus || order?.trackingStatus || "").trim().toUpperCase();
    const canceledAt = String(order?.canceledAt || "").trim();
    const refundedAt = String(order?.refundedAt || "").trim();
    if (s === "refunded" || refundedAt) return "Reembolsado";
    if (
      canceledAt ||
      currentStatus === "CANCELED" ||
      currentStatus === "CANCELLED" ||
      s === "canceled" ||
      s === "cancelled" ||
      s === "cancelado"
    ) return "Cancelado";
    if (s === "failed") return "Falhou";
    if (currentStatus === "DELIVERED") return "Entregue";
    if (currentStatus === "OUT_FOR_DELIVERY") return "Saiu para entrega";
    if (currentStatus === "IN_TRANSIT" || currentStatus === "SHIPPED") return "Em transporte";
    if (s === "paid") return "Pago";
    if (s === "processing") return "Processando";
    if (s === "pending_payment") return "Aguardando pagamento";
    return "Em análise";
  }

  function cardProducts(items) {
    if (!items.length) return '<p class="conta-muted">Nenhum item para mostrar no momento.</p>';
    return `<div class="conta-mini-grid">${items.map((item) => {
      const id = String(item.id || item.sku || "").trim();
      const image = String(item.imageUrl || item.image_url || "/images/placeholderreal.webp").trim();
      const href = id ? `/produto?id=${encodeURIComponent(id)}` : "#";
      return `<a class="conta-mini-item" href="${escapeHtml(href)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.name || "Produto")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/placeholderreal.webp';" /><strong>${escapeHtml(item.name || "Produto")}</strong></a>`;
    }).join("")}</div>`;
  }

  function renderOverviewSummaries() {
    const ordersSummary = document.getElementById("ordersSummary");
    const wishlistSummary = document.getElementById("wishlistSummary");
    const recommendSummary = document.getElementById("recommendSummary");
    const emailEl = document.getElementById("profileEmail");

    if (emailEl) emailEl.textContent = String(state.user?.email || "-");
    if (ordersSummary) {
      if (!state.orders.length) {
        ordersSummary.textContent = "Não há compras em aberto.";
      } else {
        const last = state.orders[0];
        ordersSummary.textContent = `Último pedido: ${orderStatus(last)} • ${money(last.amount, last.currency)}`;
      }
    }
    if (wishlistSummary) {
      wishlistSummary.textContent = state.favorites.length
        ? `${state.favorites.length} item(ns) salvos na sua lista.`
        : "Sua Lista de Desejos está vazia.";
    }
    if (recommendSummary) {
      const recs = state.products.filter((p) => !state.favorites.includes(String(p.id || p.sku || ""))).slice(0, 4);
      recommendSummary.textContent = recs.length
        ? `${recs.length} recomendações disponíveis para você.`
        : "Não há nenhuma recomendação.";
    }
  }

  function renderOverviewDetails(kind) {
    if (state.detailCache[kind]) return state.detailCache[kind];
    if (kind === "profile") {
      const firstAddress = Array.isArray(state.user?.addresses) ? state.user.addresses[0] : null;
      const addressText = firstAddress
        ? `${firstAddress.street || ""}, ${firstAddress.number || ""} - ${firstAddress.city || ""}/${firstAddress.state || ""}`
        : "Não informado";
      state.detailCache[kind] = `<div class="conta-detail-row"><span>Telefone</span><strong>${escapeHtml(state.user?.phone || "Não informado")}</strong></div><div class="conta-detail-row"><span>Endereço</span><strong>${escapeHtml(addressText)}</strong></div><div class="conta-detail-row"><span>Data de cadastro</span><strong>${escapeHtml(String(state.user?.createdAt || "-"))}</strong></div>`;
      return state.detailCache[kind];
    }
    if (kind === "orders") {
      if (!state.orders.length) return '<p class="conta-muted">Não há compras em aberto.</p>';
      state.detailCache[kind] = state.orders.slice(0, 5).map((order) => `<div class="conta-detail-row"><span>Pedido #${escapeHtml(String(order.orderNumber || order.id || "").slice(0, 12))}</span><strong>${escapeHtml(orderStatus(order))} • ${escapeHtml(money(order.amount, order.currency))}</strong></div>`).join("");
      return state.detailCache[kind];
    }
    if (kind === "private") {
      return '<p class="conta-muted">Histórico: nenhum atendimento privado registrado.</p>';
    }
    if (kind === "wishlist") {
      const items = state.products.filter((p) => state.favorites.includes(String(p.id || p.sku || "")));
      return cardProducts(items);
    }
    if (kind === "recommendations") {
      const recs = state.products.filter((p) => !state.favorites.includes(String(p.id || p.sku || ""))).slice(0, 4);
      return cardProducts(recs);
    }
    if (kind === "repairs") {
      return '<p class="conta-muted">Histórico de solicitações: vazio.</p>';
    }
    return '<p class="conta-muted">Sem dados.</p>';
  }

  function initOverviewSection() {
    state.detailCache = {};
    renderOverviewSummaries();
    const detailBlocks = new Map(Array.from(document.querySelectorAll(".conta-details")).map((el) => [el.id.replace("details-", ""), el]));
    function closeAll(exceptKey) {
      detailBlocks.forEach((block, key) => {
        if (!block || key === exceptKey) return;
        block.classList.remove("is-open");
        block.innerHTML = "";
      });
    }
    document.querySelectorAll(".conta-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = String(btn.getAttribute("data-toggle") || "");
        const block = detailBlocks.get(key);
        if (!block) return;
        const isOpen = block.classList.contains("is-open");
        closeAll(key);
        if (isOpen) {
          block.classList.remove("is-open");
          block.innerHTML = "";
          return;
        }
        block.innerHTML = renderOverviewDetails(key);
        block.classList.add("is-open");
      });
    });
  }

  async function loadProductsCatalog() {
    try {
      const response = await fetch("/api/products", {
        credentials: "same-origin",
        next: { revalidate: 30 }
      });
      if (!response.ok) return [];
      const parsed = await response.json();
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.products) ? parsed.products : []);
      return list.filter(Boolean);
    } catch {
      return [];
    }
  }

  function normalizeSection(raw) {
    const section = String(raw || "overview").replace(/^#/, "").trim().toLowerCase();
    if (section === "private") return "private-care";
    if (["profile", "overview", "orders", "private-care", "recommendations", "wishlist", "repairs"].includes(section)) return section;
    return "overview";
  }

  function buildLoginUrl() {
    return "/login?loggedOut=1";
  }

  async function navigate(section, options = {}) {
    bindSubnavLinks();
    const next = normalizeSection(section);
    toggleHeroImages();
    const useLoader = !options.skipLoader;
    if (useLoader) showLoader();

    if (next === "profile") {
      renderTemplate("tpl-profile");
      setActiveSubnav("profile");
      if (typeof window.initProfileSection === "function") {
        window.initProfileSection({
          previewMode,
          onAuthRequired: () => showAuthGate()
        });
      }
    } else if (next === "orders") {
      renderTemplate("tpl-orders");
      setActiveSubnav("orders");
      if (typeof window.initOrdersSection === "function") {
        window.initOrdersSection({
          orders: state.orders || [],
          products: state.products || []
        });
      }
    } else if (next === "private-care") {
      renderTemplate("tpl-private-care");
      setActiveSubnav("private-care");
      if (typeof window.initPrivateCareSection === "function") {
        window.initPrivateCareSection({
          user: state.user || null
        });
      }
    } else if (next === "recommendations") {
      renderTemplate("tpl-recommendations");
      setActiveSubnav("recommendations");
      if (typeof window.initRecommendationsSection === "function") {
        window.initRecommendationsSection({
          favorites: state.favorites || [],
          products: state.products || []
        });
      }
    } else if (next === "wishlist") {
      renderTemplate("tpl-wishlist");
      setActiveSubnav("wishlist");
      if (typeof window.initWishlistSection === "function") {
        const activeStore = resolveStore();
        window.initWishlistSection({
          store: activeStore,
          favorites: state.favorites || [],
          products: state.products || [],
          onFavoritesChanged: async () => {
            state.favorites = Array.isArray(activeStore?.getFavoriteIds?.())
              ? activeStore.getFavoriteIds().map((id) => String(id || ""))
              : [];
          }
        });
      }
    } else if (next === "repairs") {
      renderTemplate("tpl-repairs");
      setActiveSubnav("repairs");
      if (typeof window.initRepairsSection === "function") {
        window.initRepairsSection({
          user: state.user || null,
          orders: state.orders || []
        });
      }
    } else {
      renderTemplate("tpl-overview");
      setActiveSubnav(next);
      initOverviewSection();
      if (next !== "overview") {
        const targetKey = next === "private-care" ? "private" : next;
        const target = document.getElementById(`card-${targetKey}`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    if (!options.skipHash) {
      history.pushState({}, "", `#${next}`);
    }
    if (useLoader) hideLoader();
    if (!options.skipLayoutEvent) {
      window.dispatchEvent(new Event("account:layout-change"));
    }
  }

  async function bootAuthenticated() {
    const activeStore = resolveStore();
    if (!activeStore) {
      showAuthGate();
      return;
    }

    renderHeaderUser();
    await navigate(normalizeSection(window.location.hash || "overview"), {
      skipHash: true,
      skipLoader: true,
      skipLayoutEvent: true
    });
    showDashboard();
    window.dispatchEvent(new Event("account:layout-change"));

    Promise.all([
      activeStore.fetchMyOrders(),
      loadProductsCatalog(),
      typeof activeStore.fetchMyFavorites === "function"
        ? activeStore.fetchMyFavorites()
        : Promise.resolve({ ok: true, favorites: activeStore.getFavoriteIds() })
    ])
      .then(([ordersResult, products, favoritesResult]) => {
        state.orders = ordersResult.ok ? ordersResult.orders || [] : [];
        state.products = Array.isArray(products) ? products : [];
        state.favorites = Array.isArray(favoritesResult?.favorites)
          ? favoritesResult.favorites.map((id) => String(id || ""))
          : [];
        return navigate(normalizeSection(window.location.hash || "overview"), {
          skipHash: true,
          skipLoader: true,
          skipLayoutEvent: true
        });
      })
      .then(() => {
        window.dispatchEvent(new Event("account:layout-change"));
      })
      .catch(() => {});
  }

  async function boot() {
    ensureSubnavPlacement();
    if (previewMode) {
      state.user = { name: "Cliente Tsebi", email: "cliente@tsebi.com", title: "nao_informar", phone: "" };
      state.orders = [];
      state.favorites = [];
      state.products = await loadProductsCatalog();
      renderHeaderUser();
      await navigate(normalizeSection(window.location.hash || "overview"), {
        skipHash: true,
        skipLoader: true,
        skipLayoutEvent: true
      });
      showDashboard();
      window.dispatchEvent(new Event("account:layout-change"));
      return;
    }

    const activeStore = resolveStore();
    if (!activeStore) {
      showAuthGate();
      return;
    }

    const me = await activeStore.fetchMe();
    if (!me.ok || !me.user) {
      const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.href = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;
      return;
    }
    state.user = me.user;
    await bootAuthenticated();
  }

  function bindSubnavLinks() {
    ensureSubnavPlacement();
    subnavLinks.forEach((link) => {
      if (link.dataset.boundSectionNav === "1") return;
      link.dataset.boundSectionNav = "1";
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        const section = String(link.getAttribute("data-section") || "overview");
        await navigate(section);
      });
    });
  }

  bindSubnavLinks();

  window.addEventListener("hashchange", () => {
    if (!dashboard || dashboard.hidden) return;
    navigate(normalizeSection(window.location.hash || "overview"), { skipHash: true });
  });

  logoutBtn?.addEventListener("click", async () => {
    const activeStore = resolveStore();
    if (!activeStore) return;
    const logoutResult = await activeStore.logout();
    if (!logoutResult?.ok) {
      setAuthFeedback(logoutResult?.error || "Nao foi possivel sair da conta agora.", true);
      return;
    }
    state.user = null;
    state.orders = [];
    state.favorites = [];
    if (authPassword) authPassword.value = "";
    window.location.href = buildLoginUrl();
  });

  authForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(authEmail?.value || "").trim().toLowerCase();
    const password = String(authPassword?.value || "");
    if (!email || !password) {
      setAuthFeedback("Preencha e-mail e senha.", true);
      return;
    }
    if (authSubmit) authSubmit.disabled = true;
    setAuthFeedback("");
    const activeStore = resolveStore();
    if (!activeStore) {
      if (authSubmit) authSubmit.disabled = false;
      setAuthFeedback("Não foi possível iniciar o login agora. Atualize a página e tente novamente.", true);
      return;
    }
    const result = await activeStore.login({ email, password });
    if (authSubmit) authSubmit.disabled = false;
    if (!result?.ok || !result?.user) {
      setAuthFeedback(result?.error || "Não foi possível entrar.", true);
      return;
    }
    state.user = result.user;
    if (authPassword) authPassword.value = "";
    await bootAuthenticated();
  });

  boot().catch(() => {
    showAuthGate();
  });
})();



