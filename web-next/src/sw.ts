/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Rotas que NUNCA devem ser cacheadas (auth, user, admin, studio, cart, checkout)
// Espelha shouldBypassDefaultCache() em src/lib/http.ts
const NEVER_CACHE_PATTERNS = [
  /^\/api\/auth/,
  /^\/api\/my/,
  /^\/api\/admin/,
  /^\/api\/studio-auth/,
  /^\/cart/,
  /^\/checkout/,
  /^\/account/,
  /^\/login/,
  /^\/studio/,
  /^\/admin/,
];

function shouldNeverCache(url: URL): boolean {
  return NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  offlineAnalyticsConfig: false,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
  runtimeCaching: [
    // ── 1. Assets estáticos do Next.js — CacheFirst, 1 ano (hashed) ──────────
    {
      matcher: /^\/_next\/static\/.*/i,
      handler: new CacheFirst({
        cacheName: "next-static-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          }),
        ],
      }),
    },

    // ── 2. Imagens de produto (media.tsebi.com.br) — CacheFirst, 30 dias ─────
    {
      matcher: /^https:\/\/media\.tsebi\.com\.br\/.*/i,
      handler: new CacheFirst({
        cacheName: "product-images",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 120,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },

    // ── 3. Assets estáticos locais (/images, /videos, /css, /JS) ─────────────
    {
      matcher: /^\/(images|videos|css|JS)\/.*/i,
      handler: new CacheFirst({
        cacheName: "local-static-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 80,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },

    // ── 4. Chamadas de API públicas — NetworkFirst, timeout 5s ───────────────
    {
      matcher: ({ url }) => {
        if (!url.pathname.startsWith("/api/")) return false;
        return !shouldNeverCache(url);
      },
      handler: new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 5 * 60,
          }),
        ],
      }),
    },

    // ── 5. Páginas HTML (navegação) — NetworkFirst, fallback /offline ─────────
    {
      matcher: ({ request, url }) => {
        if (request.destination !== "document") return false;
        return !shouldNeverCache(url);
      },
      handler: new NetworkFirst({
        cacheName: "html-pages",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },

    // ── 6. Fallback padrão do Serwist ─────────────────────────────────────────
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// ── Push Notifications ─────────────────────────────────────────────────────

self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() ?? {};
  const title: string = data.title ?? "Tsebi Brasil";
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: data.body ?? "",
    icon: data.icon ?? "/images/pwa-192.png",
    badge: data.badge ?? "/images/pwa-maskable-192.png",
    data: { url: data.url ?? "/" },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url: string = (event.notification.data as { url?: string })?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find(
        (c) => c.url.includes(url) && "focus" in c
      );
      if (existing) return (existing as WindowClient).focus();
      return self.clients.openWindow(url);
    })
  );
});
