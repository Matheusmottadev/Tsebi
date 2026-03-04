import type { MetadataRoute } from "next";

const defaultSiteUrl = "https://tsebi.com.br";

function resolveSiteUrl(): string {
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!raw) return defaultSiteUrl;
  try {
    return new URL(raw).toString().replace(/\/+$/, "");
  } catch {
    return defaultSiteUrl;
  }
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/products",
          "/product/",
          "/novidades",
          "/nossa-historia",
          "/processos",
          "/faq",
          "/aviso-legal.html",
          "/politica-privacidade.html",
          "/cookie-policy.html",
        ],
        disallow: ["/api/", "/account", "/checkout", "/cart", "/studio", "/login", "/search", "/legacy/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

