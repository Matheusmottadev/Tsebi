(function initTsebiUserStore() {
  const LEGACY_AUTH_CACHE_KEY = "tsebi-auth-user-cache-v1";
  const FAVORITES_KEY = "tsebi-favorites-v2";

  let currentUser = null;
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

  function snapshotUser(user) {
    return JSON.stringify({
      id: user?.id || "",
      email: normalizeEmail(user?.email || ""),
      name: String(user?.name || ""),
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
    const nextSnapshot = snapshotUser(currentUser);
    const hasChanged = prevSnapshot !== nextSnapshot;

    if (hasChanged && authReady) {
      emitAuthChange();
    }
  }

  async function apiRequest(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options
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

  function mapAuthError(errorMessage) {
    const code = String(errorMessage || "");
    if (code === "INVALID_INPUT") return "Dados inválidos.";
    if (code === "INVALID_CREDENTIALS") return "E-mail ou senha inválidos.";
    if (code === "EMAIL_ALREADY_EXISTS") return "Este e-mail já está cadastrado.";
    if (code === "TOO_MANY_ATTEMPTS") return "Muitas tentativas. Tente novamente em alguns minutos.";
    if (code === "UNAUTHORIZED") return "Sessão expirada. Faça login novamente.";
    if (code === "ORDER_NOT_FOUND") return "Pedido não encontrado.";
    if (code === "ORDER_NOT_CANCELABLE") return "Este pedido não pode ser cancelado.";
    if (code === "ORDER_ALREADY_PAID_USE_REFUND") return "Pedido pago. Use reembolso.";
    if (code === "ORDER_NOT_REFUNDABLE") return "Este pedido não pode ser reembolsado.";
    if (code === "REFUND_WINDOW_EXPIRED") return "Prazo de reembolso expirado (10 minutos após a compra).";
    if (code === "CANCEL_FAILED") return "Não foi possível cancelar o pedido.";
    if (code === "REFUND_FAILED") return "Não foi possível solicitar o reembolso.";
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

  function getFavoriteIds() {
    const root = readFavoritesRoot();
    if (!currentUser) return Array.from(new Set(root.guest.map(String)));
    const userFavs = root.users[currentUser.id];
    if (!Array.isArray(userFavs)) return [];
    return Array.from(new Set(userFavs.map(String)));
  }

  function saveFavoriteIds(nextIds) {
    const root = readFavoritesRoot();
    const safeIds = Array.from(new Set((Array.isArray(nextIds) ? nextIds : []).map(String)));
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
    return !has;
  }

  async function register({ name, email, password, birthDate, cpf, cep }) {
    try {
      const data = await apiRequest("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(name || "").trim(),
          email: normalizeEmail(email),
          password: String(password || ""),
          birthDate: String(birthDate || "").trim(),
          cpf: String(cpf || "").replace(/\D/g, "").slice(0, 11),
          cep: String(cep || "").replace(/\D/g, "").slice(0, 8)
        })
      });
      setCachedUser(data.user || null);
      return { ok: true, user: data.user || null };
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
      return { ok: true, exists: Boolean(data.exists) };
    } catch (error) {
      return { ok: false, error: mapAuthError(error.message), code: String(error.message || ""), exists: false };
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
      setCachedUser(data.user || null);
      return { ok: true, user: data.user || null };
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
      return { ok: true, user: data.user || null };
    } catch (error) {
      if (String(error.message || "") === "UNAUTHORIZED") {
        setCachedUser(null);
      }
      return { ok: false, error: mapAuthError(error.message) };
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

  async function updateMyProfile({ name, birthDate, cpf, cep }) {
    try {
      const data = await apiRequest("/api/my/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(name || "").trim(),
          birthDate: String(birthDate || "").trim(),
          cpf: String(cpf || "").replace(/\D/g, "").slice(0, 11),
          cep: String(cep || "").replace(/\D/g, "").slice(0, 8)
        })
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

  function getCurrentUser() {
    return currentUser;
  }

  function getDisplayName() {
    if (!currentUser) return "Entrar / Criar conta";
    const firstName = String(currentUser.name || "").trim().split(/\s+/)[0] || "Cliente";
    return `Olá, ${firstName}`;
  }

  function ensureAuthBoot() {
    if (authReady) return Promise.resolve(currentUser);
    if (authBootPromise) return authBootPromise;
    clearLegacyAuthCache();

    authBootPromise = (async () => {
      try {
        const data = await apiRequest("/api/auth/me", { method: "GET" });
        setCachedUser(data.user || null);
      } catch {
        setCachedUser(null);
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
    logout,
    fetchMe,
    fetchMyOrders,
    fetchMyOrder,
    cancelMyOrder,
    refundMyOrder,
    updateMyProfile,
    fetchMyAddresses,
    createMyAddress,
    updateMyAddress,
    setMyAddressDefault,
    deleteMyAddress,
    getCurrentUser,
    getDisplayName,
    getFavoriteIds,
    isFavorite,
    toggleFavorite
  };

  ensureAuthBoot();
})();
