(function initTsebiUserStore() {
  const USERS_KEY = "tsebi-users-v1";
  const SESSION_KEY = "tsebi-session-v1";
  const FAVORITES_KEY = "tsebi-favorites-v1";

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
      return true;
    } catch {
      return false;
    }
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function normalizeCpf(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function isValidBirthDate(value) {
    const raw = String(value || "").trim();
    let day = 0;
    let month = 0;
    let year = 0;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const parts = raw.split("/");
      day = Number(parts[0]);
      month = Number(parts[1]);
      year = Number(parts[2]);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parts = raw.split("-");
      year = Number(parts[0]);
      month = Number(parts[1]);
      day = Number(parts[2]);
    } else {
      return false;
    }

    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
    if (year < 1900 || year > new Date().getFullYear()) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    const dt = new Date(year, month - 1, day);
    return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
  }

  function createId() {
    return `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getUsers() {
    const users = readJson(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
  }

  function saveUsers(users) {
    return writeJson(USERS_KEY, Array.isArray(users) ? users : []);
  }

  function getSession() {
    const session = readJson(SESSION_KEY, null);
    if (!session || typeof session !== "object") return null;
    if (!session.userId) return null;
    return session;
  }

  function setSession(userId) {
    return writeJson(SESSION_KEY, {
      userId,
      loggedAt: new Date().toISOString()
    });
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  function getCurrentUser() {
    const session = getSession();
    if (!session) return null;
    const users = getUsers();
    return users.find((user) => user.id === session.userId) || null;
  }

  function updateCurrentUser(patch) {
    const session = getSession();
    if (!session) return { ok: false, error: "Sessão não encontrada." };

    const users = getUsers();
    const index = users.findIndex((user) => user.id === session.userId);
    if (index < 0) return { ok: false, error: "Usuário não encontrado." };

    const current = users[index];
    const next = { ...current, ...(patch || {}) };
    if (next.firstName || next.lastName) {
      next.name = `${String(next.firstName || "").trim()} ${String(next.lastName || "").trim()}`.trim();
    }
    users[index] = next;

    if (!saveUsers(users)) return { ok: false, error: "Não foi possível salvar alterações." };
    return { ok: true, user: next };
  }

  function createUser(payload) {
    const firstName = String(payload?.firstName || "").trim();
    const lastName = String(payload?.lastName || "").trim();
    const cpf = normalizeCpf(payload?.cpf);
    const birthDate = String(payload?.birthDate || "").trim();
    const name = `${firstName} ${lastName}`.trim();
    const email = normalizeEmail(payload?.email);
    const password = String(payload?.password || "");

    if (firstName.length < 2) return { ok: false, error: "Nome inválido." };
    if (lastName.length < 2) return { ok: false, error: "Sobrenome inválido." };
    if (cpf.length !== 11) return { ok: false, error: "CPF inválido." };
    if (!isValidBirthDate(birthDate)) return { ok: false, error: "Data de nascimento inválida. Use DD/MM/AAAA." };
    if (!email.includes("@")) return { ok: false, error: "E-mail inválido." };
    if (password.length < 6) return { ok: false, error: "A senha deve ter ao menos 6 caracteres." };

    const users = getUsers();
    const alreadyExists = users.some((user) => normalizeEmail(user.email) === email);
    if (alreadyExists) return { ok: false, error: "Esse e-mail já possui cadastro." };

    const user = {
      id: createId(),
      firstName,
      lastName,
      name,
      cpf,
      birthDate,
      email,
      password,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    if (!saveUsers(users)) return { ok: false, error: "Não foi possível salvar seu cadastro." };
    return { ok: true, user };
  }

  function login(payload) {
    const email = normalizeEmail(payload?.email);
    const password = String(payload?.password || "");
    const users = getUsers();
    const user = users.find((entry) => normalizeEmail(entry.email) === email && entry.password === password);
    if (!user) return { ok: false, error: "E-mail ou senha inválidos." };
    setSession(user.id);
    return { ok: true, user };
  }

  function logout() {
    clearSession();
    return { ok: true };
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
    const currentUser = getCurrentUser();
    const root = readFavoritesRoot();
    if (!currentUser) return Array.from(new Set(root.guest.map(String)));
    const userFavs = root.users[currentUser.id];
    if (!Array.isArray(userFavs)) return [];
    return Array.from(new Set(userFavs.map(String)));
  }

  function saveFavoriteIds(nextIds) {
    const currentUser = getCurrentUser();
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

  function getDisplayName() {
    const currentUser = getCurrentUser();
    if (!currentUser) return "Conta";
    const firstName = String(currentUser.firstName || currentUser.name || "").trim().split(/\s+/)[0] || "Conta";
    return `Olá, ${firstName}`;
  }

  window.TsebiUserStore = {
    getUsers,
    createUser,
    login,
    logout,
    getCurrentUser,
    updateCurrentUser,
    getDisplayName,
    getFavoriteIds,
    isFavorite,
    toggleFavorite
  };
})();
