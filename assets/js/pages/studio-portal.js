import { api, setCsrfToken } from "../api.js";
import { toast } from "../ui/toast.js";
import { createDrawer } from "../ui/drawer.js";
import { confirmDiff } from "../ui/modalConfirmDiff.js";
import { createUsersPage } from "./users.js";
import { createOrdersPage } from "./orders.js";
import { createProductsPage } from "./products.js";
import { createVipPage } from "./vip.js";
import { createAuditPage } from "./audit.js";
import { createWhatsAppPage } from "./whatsapp.js";

const studioFlowKey = "tsebi-studio-entry-ok";

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function redirectToStudioLoading() {
  const params = new URLSearchParams();
  params.set("returnTo", currentPath());
  window.location.href = `/studio?${params.toString()}`;
}

function ensureStudioEntryFlow() {
  const hasFlowFlag = sessionStorage.getItem(studioFlowKey) === "1";
  if (hasFlowFlag) return true;
  redirectToStudioLoading();
  return false;
}

function initials(nameOrEmail) {
  const raw = String(nameOrEmail || "").trim();
  if (!raw) return "A";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function applyTheme(theme) {
  const value = String(theme || "system").toLowerCase();
  if (value === "light" || value === "dark") {
    document.documentElement.dataset.theme = value;
    return;
  }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
}

function applyAccent(accent) {
  const value = String(accent || "emerald").toLowerCase();
  document.documentElement.dataset.accent = value;
}

function debounce(fn, ms = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), Math.max(0, Number(ms) || 0));
  };
}

function sendStudioLogoutBeacon() {
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/studio-auth/logout");
      return;
    }
  } catch {}

  try {
    fetch("/api/studio-auth/logout", { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
  } catch {}
}

async function ensureAdminSession() {
  const session = await api("/api/studio-auth/me", { suppressAuthRedirect: false });
  if (!session?.authenticated) {
    throw new Error(String(session?.stage || "ADMIN_UNAUTHORIZED"));
  }
  setCsrfToken(String(session.csrfToken || ""));
  return session;
}

async function loadAdminProfile() {
  const data = await api("/api/admin/me");
  return data?.profile || null;
}

function setActiveTab(tab) {
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  tabs.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
  panels.forEach((p) => {
    const active = p.dataset.panel === tab;
    p.hidden = !active;
  });
}

function buildProfileDrawer({ profile, onSave }) {
  const root = document.createElement("div");
  root.innerHTML = `
    <div class="section">
      <h3>Perfil</h3>
      <div class="form-grid">
        <label class="label full">
          <span>Apelido</span>
          <input class="field" data-key="nickname" type="text" value="${String(profile?.nickname || "").replace(/"/g, "&quot;")}" />
        </label>
        <label class="label full">
          <span>Avatar URL</span>
          <input class="field" data-key="avatarUrl" type="text" value="${String(profile?.avatarUrl || "").replace(/"/g, "&quot;")}" />
        </label>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
        <button type="button" class="btn" data-action="save">Salvar</button>
      </div>
    </div>
  `;

  root.addEventListener("click", async (event) => {
    const btn = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    const action = String(btn.dataset.action || "");
    if (action === "cancel") {
      onSave?.(null);
      return;
    }
    if (action !== "save") return;
    const nickname = String(root.querySelector('[data-key="nickname"]')?.value || "").trim();
    const avatarUrl = String(root.querySelector('[data-key="avatarUrl"]')?.value || "").trim();
    onSave?.({ nickname, avatarUrl });
  });

  return root;
}

function buildThemeDrawer({ currentTheme, currentAccent, onPick }) {
  const root = document.createElement("div");
  const theme = String(currentTheme || "system").toLowerCase();
  const accent = String(currentAccent || "emerald").toLowerCase();

  root.innerHTML = `
    <div class="section">
      <h3>Tema</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${["system", "light", "dark"]
          .map(
            (t) => `<button type="button" class="btn btn-ghost" data-theme="${t}" ${t === theme ? "disabled" : ""}>${t}</button>`
          )
          .join("")}
      </div>
    </div>

    <div class="section">
      <h3>Paleta</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${["emerald", "blue", "violet", "amber", "rose", "slate"]
          .map(
            (a) => `<button type="button" class="btn btn-ghost" data-accent="${a}" ${a === accent ? "disabled" : ""}>${a}</button>`
          )
          .join("")}
      </div>
    </div>

    <div class="section">
      <h3>Ações</h3>
      <button type="button" class="btn btn-ghost" data-action="close">Fechar</button>
    </div>
  `;

  root.addEventListener("click", (event) => {
    const el = event.target instanceof Element ? event.target.closest("button") : null;
    if (!(el instanceof HTMLButtonElement)) return;
    const pickedTheme = el.dataset.theme || "";
    const pickedAccent = el.dataset.accent || "";
    const action = el.dataset.action || "";
    if (action === "close") onPick?.({ close: true });
    if (pickedTheme) onPick?.({ theme: pickedTheme });
    if (pickedAccent) onPick?.({ accent: pickedAccent });
  });

  return root;
}

async function main() {
  if (!ensureStudioEntryFlow()) return;

  window.addEventListener("pagehide", () => {
    sendStudioLogoutBeacon();
  });

  const els = {
    globalSearch: document.getElementById("globalSearch"),
    refreshBtn: document.getElementById("refreshBtn"),
    adminAvatar: document.getElementById("adminAvatar"),
    adminMenuBtn: document.getElementById("adminMenuBtn"),
    adminMenuPanel: document.getElementById("adminMenuPanel"),

    tabs: Array.from(document.querySelectorAll(".tab")),
    usersStatus: document.getElementById("usersStatus"),
    ordersStatus: document.getElementById("ordersStatus"),
    productsStatus: document.getElementById("productsStatus"),
    productsStock: document.getElementById("productsStock"),
    auditMode: document.getElementById("auditMode"),

    usersCreateBtn: document.getElementById("usersCreateBtn"),
    productsCreateBtn: document.getElementById("productsCreateBtn"),
    vipCreateBtn: document.getElementById("vipCreateBtn"),

    usersMount: document.getElementById("usersMount"),
    ordersMount: document.getElementById("ordersMount"),
    productsMount: document.getElementById("productsMount"),
    vipMount: document.getElementById("vipMount"),
    whatsappMount: document.getElementById("whatsappMount"),
    auditMount: document.getElementById("auditMount")
  };

  const drawer = createDrawer();

  let activeTab = "users";
  let profile = null;

  try {
    const session = await ensureAdminSession();
    els.adminAvatar.textContent = initials(session?.admin?.name || session?.admin?.email || "Admin");
    profile = await loadAdminProfile();
    applyTheme(profile?.theme || "system");
    applyAccent(profile?.accent || "emerald");
  } catch (error) {
    toast("Acesso admin indisponível. Vá para o login do Studio.", { tone: "error" });
    return;
  }

  const usersPage = createUsersPage({
    mount: els.usersMount,
    drawer,
    getStatusFilter: () => els.usersStatus?.value || ""
  });
  const ordersPage = createOrdersPage({
    mount: els.ordersMount,
    drawer,
    getStatusFilter: () => els.ordersStatus?.value || ""
  });
  const productsPage = createProductsPage({
    mount: els.productsMount,
    drawer,
    getStatusFilter: () => els.productsStatus?.value || "",
    getStockFilter: () => els.productsStock?.value || ""
  });
  const vipPage = createVipPage({ mount: els.vipMount, drawer });
  const whatsappPage = createWhatsAppPage({ mount: els.whatsappMount });
  const auditPage = createAuditPage({
    mount: els.auditMount,
    drawer,
    getMode: () => els.auditMode?.value || "changes"
  });

  const pages = {
    users: usersPage,
    orders: ordersPage,
    products: productsPage,
    vip: vipPage,
    whatsapp: whatsappPage,
    audit: auditPage
  };

  function currentPage() {
    return pages[activeTab] || usersPage;
  }

  async function reloadActive() {
    await currentPage().reload();
  }

  const syncSearch = debounce(async () => {
    const q = String(els.globalSearch?.value || "").trim();
    currentPage().setQuery?.(q);
    await reloadActive();
  }, 260);

  els.globalSearch?.addEventListener("input", syncSearch);
  els.refreshBtn?.addEventListener("click", reloadActive);
  els.usersStatus?.addEventListener("change", reloadActive);
  els.ordersStatus?.addEventListener("change", reloadActive);
  els.productsStatus?.addEventListener("change", reloadActive);
  els.productsStock?.addEventListener("change", reloadActive);
  els.auditMode?.addEventListener("change", reloadActive);

  els.usersCreateBtn?.addEventListener("click", () => usersPage.openCreate?.());
  els.productsCreateBtn?.addEventListener("click", () => productsPage.openCreate?.());
  els.vipCreateBtn?.addEventListener("click", () => vipPage.openCreate?.());

  els.tabs.forEach((btn) => {
    btn.addEventListener("click", async () => {
      activeTab = String(btn.dataset.tab || "users");
      setActiveTab(activeTab);
      els.globalSearch.value = "";
      currentPage().setQuery?.("");
      await reloadActive();
    });
  });

  function toggleMenu(show) {
    if (!els.adminMenuPanel) return;
    els.adminMenuPanel.hidden = show == null ? !els.adminMenuPanel.hidden : !show;
  }

  els.adminMenuBtn?.addEventListener("click", () => toggleMenu());
  document.addEventListener("click", (event) => {
    if (!els.adminMenuPanel || els.adminMenuPanel.hidden) return;
    const inside = event.target instanceof Element ? event.target.closest(".menu") : null;
    if (!inside) toggleMenu(false);
  });

  els.adminMenuPanel?.addEventListener("click", async (event) => {
    const btn = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    const action = String(btn.dataset.action || "");
    toggleMenu(false);

    if (action === "logout") {
      try {
        await fetch("/api/studio-auth/logout", { method: "POST", credentials: "include" });
      } finally {
        const params = new URLSearchParams();
        params.set("returnTo", currentPath());
        window.location.href = `studio-login.html?${params.toString()}`;
      }
      return;
    }

    if (action === "profile") {
      drawer.open({
        titleText: "Perfil • admin",
        content: buildProfileDrawer({
          profile,
          onSave: async (patch) => {
            if (!patch) {
              drawer.close();
              return;
            }
            try {
              const diffs = [
                { field: "Apelido", before: profile?.nickname || "", after: patch.nickname || "" },
                { field: "Avatar URL", before: profile?.avatarUrl || "", after: patch.avatarUrl || "" }
              ];
              const ok = await confirmDiff({
                title: "Salvar perfil",
                message: "Confirme as alterações do seu perfil.",
                diffs,
                tone: "ok"
              });
              if (!ok) return;

              const updated = await api("/api/admin/me", { method: "PATCH", json: patch });
              profile = updated?.profile || profile;
              toast("Perfil atualizado.", { tone: "success" });
              drawer.close();
            } catch (error) {
              toast(`Falha ao salvar perfil: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
            }
          }
        })
      });
      return;
    }

    if (action === "theme" || action === "accent") {
      drawer.open({
        titleText: "Tema e paleta",
        content: buildThemeDrawer({
          currentTheme: profile?.theme || "system",
          currentAccent: profile?.accent || "emerald",
          onPick: async (picked) => {
            if (picked?.close) {
              drawer.close();
              return;
            }
            try {
              const patch = {};
              if (picked?.theme) patch.theme = picked.theme;
              if (picked?.accent) patch.accent = picked.accent;
              if (Object.keys(patch).length === 0) return;
              const updated = await api("/api/admin/me", { method: "PATCH", json: patch });
              profile = updated?.profile || profile;
              applyTheme(profile?.theme || "system");
              applyAccent(profile?.accent || "emerald");
              toast("Preferências atualizadas.", { tone: "success" });
              drawer.close();
            } catch (error) {
              toast(`Falha ao salvar preferências: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
            }
          }
        })
      });
    }
  });

  setActiveTab(activeTab);
  await reloadActive();
}

main().catch(() => {
  toast("Falha ao inicializar Studio Portal.", { tone: "error" });
});
