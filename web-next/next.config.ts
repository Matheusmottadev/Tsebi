import path from "node:path";
import type { NextConfig } from "next";

const projectRoot = path.resolve(__dirname);

function normalizeApiProxyTarget(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function readApiProxyTarget(): string | null {
  const raw = String(process.env.API_PROXY_TARGET || "").trim();
  if (!raw) {
    return null;
  }

  return normalizeApiProxyTarget(raw);
}

const migratedHtmlRedirects = [
  { source: "/index.html", destination: "/" },
  { source: "/home-legacy.html", destination: "/" },
  { source: "/cart.html", destination: "/cart" },
  { source: "/legacy/pages/cart.html", destination: "/cart" },
  { source: "/login.html", destination: "/login" },
  { source: "/produto.html", destination: "/produto" },
  { source: "/conta.html", destination: "/account" },
  { source: "/minha-conta.html", destination: "/account" },
  { source: "/meu-perfil.html", destination: "/account" },
  { source: "/studio-login.html", destination: "/studio/login" },
  { source: "/studio-portal.html", destination: "/studio" },
  { source: "/vip-admin.html", destination: "/studio" },
] as const;

const staticLegacyPageSlugs = [
  "aviso-legal",
  "candidatura",
  "carreiras",
  "cookie-policy",
  "faq",
  "genesis",
  "loading-careers",
  "loading-studio",
  "nossa-historia",
  "order",
  "payment-result",
  "politica-privacidade",
  "processos",
  "recuperar-senha",
  "recuperar-senha-codigo",
] as const;

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  staticPageGenerationTimeout: 600,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.tsebi.com.br",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/public/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
      {
        source: "/videos/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
      {
        source: "/JS/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
      {
        source: "/css/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/login/admin",
        destination: "/admin/login",
        permanent: false,
      },
      {
        source: "/login/admin/login",
        destination: "/admin/login",
        permanent: false,
      },
      {
        source: "/payment-result",
        destination: "/",
        permanent: false,
      },
      {
        source: "/payment-result.html",
        destination: "/",
        permanent: false,
      },
      {
        source: "/legacy/pages/payment-result.html",
        destination: "/",
        permanent: false,
      },
      ...migratedHtmlRedirects.map((entry) => ({
        ...entry,
        permanent: true,
      })),
      ...staticLegacyPageSlugs.map((slug) => ({
        source: `/${slug}.html`,
        destination: `/${slug}`,
        permanent: true,
      })),
    ];
  },
  async rewrites() {
    const apiProxyTarget = readApiProxyTarget();
    const rewrites = [];

    if (!apiProxyTarget && process.env.NODE_ENV !== "production") {
      throw new Error(
        "API_PROXY_TARGET is required in development. Set it in web-next/.env.local " +
          "(e.g. http://localhost:4242 for local dev)."
      );
    }

    if (apiProxyTarget) {
      rewrites.push({
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      });

      if (process.env.NODE_ENV !== "production") {
        rewrites.push({
          source: "/images/:path*",
          destination: `${apiProxyTarget}/images/:path*`,
        });
      }
    }

    return rewrites;
  },
};

export default nextConfig;

