(function initTsebiPosthog() {
  const PREF_KEY = "tsebi-cookie-preferences-v1";
  const CONFIG_URL = "/api/config";
  const DEFAULT_HOST = "https://us.i.posthog.com";
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

  const state = {
    initialized: false,
    initPromise: null,
    config: null
  };

  function normalizeHost(value) {
    const raw = String(value || "").trim();
    if (!raw) return DEFAULT_HOST;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return DEFAULT_HOST;
      return parsed.origin;
    } catch {
      return DEFAULT_HOST;
    }
  }

  function isLocalhost() {
    return LOCAL_HOSTS.has(window.location.hostname);
  }

  function readPrefs() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        essential: true,
        functional: Boolean(parsed.functional),
        analytics: Boolean(parsed.analytics),
        marketing: Boolean(parsed.marketing)
      };
    } catch {
      return null;
    }
  }

  async function fetchConfig() {
    if (state.config) return state.config;
    try {
      const res = await fetch(CONFIG_URL, {
        credentials: "include",
        next: { revalidate: 300 }
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json || !json.posthog || !json.posthog.key) return null;
      const host = normalizeHost(json.posthog.host || DEFAULT_HOST);
      state.config = { key: String(json.posthog.key || "").trim(), host };
      return state.config;
    } catch {
      return null;
    }
  }

  function ensurePosthogSnippet(apiHost) {
    if (window.posthog && window.posthog.__SV) return;

    const scriptHost = normalizeHost(apiHost || DEFAULT_HOST)
      .replace(".i.posthog.com", "-assets.i.posthog.com")
      .replace("https://", "https://");

    (function (d, t) {
      const p = (window.posthog = window.posthog || []);
      if (p.__SV) return;
      p._i = p._i || [];
      p.init = function (apiKey, options, name) {
        function makeMethod(method) {
          return function () {
            p.push([method].concat(Array.prototype.slice.call(arguments, 0)));
          };
        }
        const instance = p;
        if (typeof name !== "undefined") {
          instance = p[name] = [];
        } else {
          name = "posthog";
        }
        instance.people = instance.people || [];
        instance.toString = function (noStub) {
          const prefix = "posthog";
          if (name !== "posthog") return prefix + "." + name + (noStub ? "" : " (stub)");
          return noStub ? prefix : prefix + " (stub)";
        };
        instance.people.toString = function () {
          return instance.toString(1) + ".people (stub)";
        };
        const methods =
          "capture identify alias people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user set_config register register_once unregister opt_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group".split(
            " "
          );
        for (let i = 0; i < methods.length; i += 1) {
          instance[methods[i]] = makeMethod(methods[i]);
        }
        p._i.push([apiKey, options, name]);
      };
      p.__SV = 1;
      const s = d.createElement(t);
      s.async = true;
      s.src = scriptHost + "/static/array.js";
      const e = d.getElementsByTagName(t)[0];
      if (e && e.parentNode) e.parentNode.insertBefore(s, e);
    })(document, "script");
  }

  async function initPosthog() {
    if (state.initialized) return;
    if (state.initPromise) return state.initPromise;
    state.initPromise = (async () => {
      if (isLocalhost()) return;
      const config = await fetchConfig();
      if (!config || !config.key) return;
      ensurePosthogSnippet(config.host);
      if (!window.posthog || typeof window.posthog.init !== "function") return;
      window.posthog.init(config.key, {
        api_host: config.host,
        opt_out_capturing_by_default: true
      });
      state.initialized = true;
    })();
    return state.initPromise;
  }

  async function enableTracking() {
    await initPosthog();
    if (window.posthog && typeof window.posthog.opt_in_capturing === "function") {
      window.posthog.opt_in_capturing();
    }
  }

  function disableTracking() {
    if (window.posthog && typeof window.posthog.opt_out_capturing === "function") {
      window.posthog.opt_out_capturing();
    }
  }

  window.tsebiPosthogUpdateConsent = function (prefs) {
    if (prefs && prefs.analytics) {
      enableTracking();
    } else {
      disableTracking();
    }
  };

  const initialPrefs = readPrefs();
  if (initialPrefs && initialPrefs.analytics) {
    enableTracking();
  }
})();
