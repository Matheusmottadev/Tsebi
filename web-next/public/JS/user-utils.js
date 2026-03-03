(function initTsebiUserStore() {
  const LEGACY_AUTH_CACHE_KEY = "tsebi-auth-user-cache-v1";
  const AUTH_CACHE_KEY = "tsebi-auth-user-cache-v2";
  const FAVORITES_KEY = "tsebi-favorites-v2";

  let currentUser = readJson(AUTH_CACHE_KEY, null);
  let authReady = false;
  let authBootPromise = null;

  function emitAuthChange() {
    window.dispatchEvent(
      new CustomEvent("tsebi:auth-changed", {
        detail: { user: currentUser, ready: authReady }
      })
    );
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function clearLegacyAuthCache() {
    try {
      localStorage.removeItem(LEGACY_AUTH_CACHE_KEY);
    } catch {}
  }

  function writeAuthCache(user) {
    try {
      if (user) {
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(AUTH_CACHE_KEY);
      }
    } catch {}
  }

  function snapshotUser(user) {
    return JSON.stringify({
      id: user?.id || "",
      email: normalizeEmail(user?.email || ""),
      title: normalizeTitle(user?.title || ""),
      name: String(user?.name || ""),
      emailVerified: Boolean(user?.emailVerified),
      emailVerifiedAt: String(user?.emailVerifiedAt || ""),
      birthDate: String(user?.birthDate || ""),
      cpf: String(user?.cpf || ""),
      cep: String(user?.cep || ""),
      defaultAddressId: String(user?.defaultAddressId || ""),
      addresses: Array.isArray(user?.addresses)
        ? user.addresses.map((address) => ({
            id: String(address?.id || ""),
            cep: String(address?.cep || ""),
            state: String(address?.state || "")
          }))
        : []
    });
  }

  function setCachedUser(user) {
    const prevSnapshot = snapshotUser(currentUser);
    currentUser = user || null;
    writeAuthCache(currentUser);
    const nextSnapshot = snapshotUser(currentUser);
    const hasChanged = prevSnapshot !== nextSnapshot;

    if (hasChanged && authReady) {
      emitAuthChange();
    }

    if (hasChanged && currentUser) {
      fetchMyFavorites()
        .then(() => {
          if (authReady) emitAuthChange();
        })
        .catch(() => {});
    }
  }

  function readCookie(name) {
    const source = String(document.cookie || "");
    if (!source) return "";
    const prefix = `${String(name || "").trim()}=`;
    const parts = source.split(";");
    for (const part of parts) {
      const item = String(part || "").trim();
      if (!item.startsWith(prefix)) continue;
      return decodeURIComponent(item.slice(prefix.length));
    }
    return "";
  }

  async function apiRequest(url, options) {
    const method = String(options?.method || "GET").trim().toUpperCase();
    const isMutation = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    const headers = new Headers((options && options.headers) || undefined);

    if (isMutation && !headers.has("x-csrf-token")) {
      const csrfToken = readCookie("tsebi.csrf");
      if (csrfToken) headers.set("x-csrf-token", csrfToken);
    }

    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      method,
      headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data && data.error ? data.error : "REQUEST_FAILED";
      throw new Error(message);
    }
    return data;
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function normalizeTitle(value) {
    const normalized = String(value || "").trim().toLowerCase();
    const allowed = new Set(["sr", "sra", "srta", "nao_informar"]);
    if (!allowed.has(normalized)) return "";
    return normalized;
  }

  function formatTitlePrefix(value) {
    const title = normalizeTitle(value);
    if (title === "sr") return "Sr.";
    if (title === "sra") return "Sra.";
    if (title === "srta") return "Srta.";
    return "";
  }

  function mapAuthError(errorMessage) {
    const code = String(errorMessage || "");
    if (code === "INVALID_INPUT") return "Dados inválidos.";
    if (code === "INVALID_CREDENTIALS") return "E-mail ou senha inválidos.";
    if (code === "EMAIL_ALREADY_EXISTS") return "Este e-mail já está cadastrado.";
    if (code === "EMAIL_NOT_VERIFIED") return "Seu e-mail ainda não foi verificado.";
    if (code === "INVALID_OR_EXPIRED_CODE") return "Código inválido ou expirado.";
    if (code === "EMAIL_DELIVERY_FAILED") return "Falha ao enviar e-mail. Tente novamente.";
    if (code === "AUTH_CODE_ISSUE_FAILED") return "Não foi possível gerar código de verificação.";
    if (code === "RESET_TOKEN_FLOW_DEPRECATED_USE_EMAIL_CODE") return "Este fluxo foi atualizado. Use código enviado por e-mail.";
    if (code === "TOO_MANY_ATTEMPTS") return "Muitas tentativas. Tente novamente em alguns minutos.";
    if (code === "UNAUTHORIZED") return "Sessão expirada. Faça login novamente.";
    if (code === "ORDER_NOT_FOUND") return "Pedido não encontrado.";
    if (code === "ORDER_NOT_CANCELABLE") return "Este pedido não pode ser cancelado.";
    if (code === "ORDER_ALREADY_PAID_USE_REFUND") return "Pedido pago. Use reembolso.";
    if (code === "ORDER_NOT_REFUNDABLE") return "Este pedido não pode ser reembolsado.";
    if (code === "REFUND_WINDOW_EXPIRED") return "Prazo de reembolso expirado (10 minutos após a compra).";
    if (code === "CANCEL_FAILED") return "Não foi possível cancelar o pedido.";
    if (code === "REFUND_FAILED") return "Não foi possível solicitar o reembolso.";
    if (code === "TOO_MANY_REQUESTS") return "Muitas tentativas. Aguarde e tente novamente.";
    if (code === "FORBIDDEN") return "Acesso não autorizado.";
    if (code === "CSRF_MISSING") return "Sessão expirada. Recarregue a página e tente novamente.";
    if (code === "CSRF_INVALID") return "Sessão expirada. Recarregue a página e tente novamente.";
    return "Não foi possível concluir a operação.";
  }

  function readFavoritesRoot() {
    const fallback = { guest: [], users: {} };
    const root = readJson(FAVORITES_KEY, fallback);
    if (!root || typeof root !== "object") return fallback;
    if (!Array.isArray(root.guest)) root.guest = [];
    if (!root.users || typeof root.users !== "object") root.users = {};
    return root;
  }

  function normalizeFavoriteIds(nextIds) {
    return Array.from(new Set((Array.isArray(nextIds) ? nextIds : []).map((entry) => String(entry || "").trim()).filter(Boolean))).slice(0, 500);
  }

  function getFavoriteIds() {
    const root = readFavoritesRoot();
    if (!currentUser) return normalizeFavoriteIds(root.guest);
    const userFavs = root.users[currentUser.id];
    if (!Array.isArray(userFavs)) return [];
    return normalizeFavoriteIds(userFavs);
  }

  function saveFavoriteIds(nextIds) {
    const root = readFavoritesRoot();
    const safeIds = normalizeFavoriteIds(nextIds);
    if (!currentUser) {
      root.guest = safeIds;
    } else {
      root.users[currentUser.id] = safeIds;
    }
    writeJson(FAVORITES_KEY, root);
  }

  function isFavorite(productId) {
    const id = String(productId || "");
    if (!id) return false;
    return getFavoriteIds().includes(id);
  }

  function toggleFavorite(productId) {
    const id = String(productId || "");
    if (!id) return false;
    const favorites = getFavoriteIds();
    const has = favorites.includes(id);
    const next = has ? favorites.filter((entry) => entry !== id) : [...favorites, id];
    saveFavoriteIds(next);
    if (currentUser) {
      saveMyFavorites(next).catch(() => {});
    }
    return !has;
  }

  async function fetchMyFavorites() {
    if (!currentUser) {
      return { ok: true, favorites: getFavoriteIds() };
    }

    try {
      const root = readFavoritesRoot();
      const guestFavorites = normalizeFavoriteIds(root.guest);
      const localUserFavorites = normalizeFavoriteIds(root.users[currentUser.id]);
      const data = await apiRequest("/api/my/favorites", { method: "GET" });
      const serverFavorites = normalizeFavoriteIds(data.favorites);

      const merged = normalizeFavoriteIds([...serverFavorites, ...localUserFavorites, ...guestFavorites]);
      root.guest = [];
      root.users[currentUser.id] = merged;
      writeJson(FAVORITES_KEY, root);

      if (merged.join("|") !== serverFavorites.join("|")) {
        await apiRequest("/api/my/favorites", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorites: merged })
        });
      }

      return { ok: true, favorites: merged };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || ""), favorites: getFavoriteIds() };
    }
  }

  async function saveMyFavorites(nextIds) {
    const favorites = normalizeFavoriteIds(nextIds);
    if (!currentUser) {
      saveFavoriteIds(favorites);
      return { ok: true, favorites };
    }

    try {
      const data = await apiRequest("/api/my/favorites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites })
      });
      const safe = normalizeFavoriteIds(data.favorites);
      saveFavoriteIds(safe);
      return { ok: true, favorites: safe };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || ""), favorites };
    }
  }

  async function register({ title, name, email, password, birthDate, cpf, cep }) {
    try {
      const data = await apiRequest("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizeTitle(title) || "nao_informar",
          name: String(name || "").trim(),
          email: normalizeEmail(email),
          password: String(password || ""),
          birthDate: String(birthDate || "").trim(),
          cpf: String(cpf || "").replace(/\D/g, "").slice(0, 11),
          cep: String(cep || "").replace(/\D/g, "").slice(0, 8)
        })
      });
      if (data.user) {
        setCachedUser(data.user || null);
        await fetchMyFavorites();
      }
      return {
        ok: true,
        user: data.user || null,
        stage: String(data.stage || ""),
        email: String(data.email || normalizeEmail(email)),
        expiresAt: data.expiresAt || null,
        devCode: data.devCode || null
      };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || "") };
    }
  }

  async function checkEmail(email) {
    try {
      const data = await apiRequest("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizeEmail(email)
        })
      });
      return { ok: true, exists: Boolean(data.exists), emailVerified: Boolean(data.emailVerified) };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        exists: false,
        emailVerified: false
      };
    }
  }

  async function login({ email, password }) {
    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizeEmail(email),
          password: String(password || "")
        })
      });
      if (data.user) {
        setCachedUser(data.user || null);
        await fetchMyFavorites();
      }
      return {
        ok: true,
        user: data.user || null,
        stage: String(data.stage || ""),
        email: String(data.email || normalizeEmail(email)),
        expiresAt: data.expiresAt || null,
        devCode: data.devCode || null
      };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || "") };
    }
  }

  async function verifyAccountEmailCode({ email, code }) {
    try {
      const data = await apiRequest("/api/auth/email/verify-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizeEmail(email),
          code: String(code || "").replace(/\D/g, "").slice(0, 6)
        })
      });
      setCachedUser(data.user || null);
      await fetchMyFavorites();
      return { ok: true, user: data.user || null };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || "") };
    }
  }

  async function resendAccountEmailCode(email) {
    try {
      const data = await apiRequest("/api/auth/email/resend-account-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email) })
      });
      return {
        ok: true,
        stage: String(data.stage || ""),
        expiresAt: data.expiresAt || null,
        devCode: data.devCode || null
      };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || "") };
    }
  }

  async function verifyLoginEmailCode({ email, code }) {
    try {
      const data = await apiRequest("/api/auth/login/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizeEmail(email),
          code: String(code || "").replace(/\D/g, "").slice(0, 6)
        })
      });
      setCachedUser(data.user || null);
      await fetchMyFavorites();
      return { ok: true, user: data.user || null };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || "") };
    }
  }

  async function requestPasswordReset(email) {
    try {
      const data = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email) })
      });
      return {
        ok: true,
        expiresAt: data.expiresAt || null,
        devCode: data.devCode || null
      };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || "") };
    }
  }

  async function verifyPasswordResetCode({ email, code, password }) {
    try {
      const data = await apiRequest("/api/auth/forgot-password/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizeEmail(email),
          code: String(code || "").replace(/\D/g, "").slice(0, 6),
          password: String(password || "")
        })
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || "") };
    }
  }

  async function logout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {}
    setCachedUser(null);
    return { ok: true };
  }

  async function fetchMe() {
    try {
      const data = await apiRequest("/api/auth/me", { method: "GET" });
      setCachedUser(data.user || null);
      if (data.user) {
        await fetchMyFavorites();
      }
      return { ok: true, user: data.user || null };
    } catch (error) {
      const code = String(error.message || "");
      if (code === "UNAUTHORIZED") {
        setCachedUser(null);
      }
      return { ok: false, error: mapAuthError(code), code, user: currentUser || null };
    }
  }

  async function fetchMyOrders() {
    try {
      const data = await apiRequest("/api/my/orders", { method: "GET" });
      return { ok: true, orders: Array.isArray(data.orders) ? data.orders : [] };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), orders: [] };
    }
  }

  async function fetchMyOrder(orderId) {
    try {
      const id = encodeURIComponent(String(orderId || "").trim());
      const data = await apiRequest(`/api/my/orders/${id}`, { method: "GET" });
      return { ok: true, order: data.order || null };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), order: null };
    }
  }

  async function fetchTrackingOrders() {
    try {
      const data = await apiRequest("/api/account/orders", { method: "GET" });
      return { ok: true, orders: Array.isArray(data.orders) ? data.orders : [] };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || ""), orders: [] };
    }
  }

  async function fetchTrackOrderByNumberAndEmail(orderNumber, email) {
    try {
      const params = new URLSearchParams({
        orderNumber: String(orderNumber || "").trim(),
        email: normalizeEmail(email)
      });
      const data = await apiRequest(`/api/orders/track?${params.toString()}`, { method: "GET" });
      return { ok: true, order: data.order || null };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || ""), order: null };
    }
  }

  async function cancelMyOrder(orderId) {
    try {
      const id = encodeURIComponent(String(orderId || "").trim());
      const data = await apiRequest(`/api/my/orders/${id}/cancel`, { method: "POST" });
      return { ok: true, order: data.order || null };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || ""), order: null };
    }
  }

  async function refundMyOrder(orderId) {
    try {
      const id = encodeURIComponent(String(orderId || "").trim());
      const data = await apiRequest(`/api/my/orders/${id}/refund`, { method: "POST" });
      return { ok: true, order: data.order || null, refundId: data.refundId || null };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        order: null,
        refundId: null
      };
    }
  }

  async function updateMyProfile({ title, name, birthDate, cpf, cep }) {
    try {
      const payload = {
        name: String(name || "").trim()
      };
      const normalizedBirthDate = String(birthDate || "").trim();
      const normalizedCpf = String(cpf || "").replace(/\D/g, "").slice(0, 11);
      const normalizedCep = String(cep || "").replace(/\D/g, "").slice(0, 8);

      if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) payload.birthDate = normalizedBirthDate;
      if (normalizedCpf.length === 11) payload.cpf = normalizedCpf;
      if (normalizedCep.length === 8) payload.cep = normalizedCep;

      const normalizedTitle = normalizeTitle(title);
      if (normalizedTitle) payload.title = normalizedTitle;

      const data = await apiRequest("/api/my/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setCachedUser(data.user || null);
      return { ok: true, user: data.user || null };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || "") };
    }
  }

  async function fetchMyAddresses() {
    try {
      const data = await apiRequest("/api/my/addresses", { method: "GET" });
      return {
        ok: true,
        defaultAddressId: String(data.defaultAddressId || ""),
        addresses: Array.isArray(data.addresses) ? data.addresses : []
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        defaultAddressId: "",
        addresses: []
      };
    }
  }

  async function createMyAddress(payload) {
    try {
      const data = await apiRequest("/api/my/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      return {
        ok: true,
        defaultAddressId: String(data.defaultAddressId || ""),
        addresses: Array.isArray(data.addresses) ? data.addresses : []
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        defaultAddressId: "",
        addresses: []
      };
    }
  }

  async function updateMyAddress(addressId, payload) {
    try {
      const id = encodeURIComponent(String(addressId || "").trim());
      const data = await apiRequest(`/api/my/addresses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      return {
        ok: true,
        defaultAddressId: String(data.defaultAddressId || ""),
        addresses: Array.isArray(data.addresses) ? data.addresses : []
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        defaultAddressId: "",
        addresses: []
      };
    }
  }

  async function setMyAddressDefault(addressId) {
    try {
      const id = encodeURIComponent(String(addressId || "").trim());
      const data = await apiRequest(`/api/my/addresses/${id}/default`, {
        method: "POST"
      });
      return {
        ok: true,
        defaultAddressId: String(data.defaultAddressId || ""),
        addresses: Array.isArray(data.addresses) ? data.addresses : []
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        defaultAddressId: "",
        addresses: []
      };
    }
  }

  async function deleteMyAddress(addressId) {
    try {
      const id = encodeURIComponent(String(addressId || "").trim());
      const data = await apiRequest(`/api/my/addresses/${id}`, {
        method: "DELETE"
      });
      return {
        ok: true,
        defaultAddressId: String(data.defaultAddressId || ""),
        addresses: Array.isArray(data.addresses) ? data.addresses : []
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        defaultAddressId: "",
        addresses: []
      };
    }
  }

  async function fetchAccountPreferences() {
    try {
      const data = await apiRequest("/api/my/preferences", { method: "GET" });
      return { ok: true, preferences: data.preferences || { marketing: {}, contact: {} } };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        preferences: { marketing: {}, contact: {} }
      };
    }
  }

  async function updateAccountPreferences(payload) {
    try {
      const data = await apiRequest("/api/my/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      return { ok: true, preferences: data.preferences || { marketing: {}, contact: {} } };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        preferences: { marketing: {}, contact: {} }
      };
    }
  }

  async function fetchPrivateCare() {
    try {
      const data = await apiRequest("/api/my/private-care", { method: "GET" });
      return {
        ok: true,
        history: Array.isArray(data.history) ? data.history : [],
        preferences: data.preferences || {}
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        history: [],
        preferences: {}
      };
    }
  }

  async function createPrivateCare(payload) {
    try {
      const data = await apiRequest("/api/my/private-care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      return {
        ok: true,
        request: data.request || null,
        history: Array.isArray(data.history) ? data.history : []
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        request: null,
        history: []
      };
    }
  }

  async function updatePrivateCarePreferences(payload) {
    try {
      const data = await apiRequest("/api/my/private-care/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      return {
        ok: true,
        preferences: data.preferences || {}
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        preferences: {}
      };
    }
  }

  async function fetchRepairs() {
    try {
      const data = await apiRequest("/api/my/repairs", { method: "GET" });
      return {
        ok: true,
        history: Array.isArray(data.history) ? data.history : []
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        history: []
      };
    }
  }

  async function createRepair(payload) {
    try {
      const data = await apiRequest("/api/my/repairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      return {
        ok: true,
        repair: data.repair || null,
        history: Array.isArray(data.history) ? data.history : []
      };
    } catch (error) {
      return {
        ok: false,
        error: mapAuthError(error.message),
        code: String(error.message || ""),
        repair: null,
        history: []
      };
    }
  }

  function getCurrentUser() {
    return currentUser;
  }

  function getDisplayName() {
    if (!currentUser) return "Entrar / Criar conta";
    const firstName = String(currentUser.name || "").trim().split(/\s+/)[0] || "Cliente";
    const prefix = formatTitlePrefix(currentUser.title);
    return prefix ? `Olá, ${prefix} ${firstName}` : `Olá, ${firstName}`;
  }

  function ensureAuthBoot() {
    if (authReady) return Promise.resolve(currentUser);
    if (authBootPromise) return authBootPromise;
    clearLegacyAuthCache();

    authBootPromise = (async () => {
      try {
        const data = await apiRequest("/api/auth/me", { method: "GET" });
        setCachedUser(data.user || null);
        if (data.user) {
          await fetchMyFavorites();
        }
      } catch {
        // Keep local cached user on transient failures to avoid forced relogin loops.
        if (!currentUser) setCachedUser(null);
      } finally {
        authReady = true;
        emitAuthChange();
      }
      return currentUser;
    })();

    return authBootPromise;
  }

  window.TsebiUserStore = {
    ensureAuthBoot,
    checkEmail,
    register,
    login,
    verifyAccountEmailCode,
    resendAccountEmailCode,
    verifyLoginEmailCode,
    requestPasswordReset,
    verifyPasswordResetCode,
    logout,
    fetchMe,
    fetchMyOrders,
    fetchMyOrder,
    fetchTrackingOrders,
    fetchTrackOrderByNumberAndEmail,
    cancelMyOrder,
    refundMyOrder,
    updateMyProfile,
    fetchMyAddresses,
    createMyAddress,
    updateMyAddress,
    setMyAddressDefault,
    deleteMyAddress,
    fetchAccountPreferences,
    updateAccountPreferences,
    fetchPrivateCare,
    createPrivateCare,
    updatePrivateCarePreferences,
    fetchRepairs,
    createRepair,
    getCurrentUser,
    getDisplayName,
    getFavoriteIds,
    isFavorite,
    toggleFavorite,
    fetchMyFavorites,
    saveMyFavorites
  };

  ensureAuthBoot();
})();

