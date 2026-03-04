import type { MetadataRoute } from "next";
import { listProducts } from "@/services/products";

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

function toIsoDate(value: unknown): string {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = resolveSiteUrl();
  const now = new Date().toISOString();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/products`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/nossa-historia`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/processos`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/politica-privacidade.html`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/aviso-legal.html`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/cookie-policy.html`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const products = await listProducts();
    productRoutes = (Array.isArray(products) ? products : [])
      .filter((item) => item && item.active !== false)
      .map((item) => {
        const id = encodeURIComponent(String(item.id || "").trim());
        const lastModified = toIsoDate(item.updatedAt || item.createdAt || now);
        return {
          url: `${siteUrl}/product/${id}`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        };
      })
      .filter((entry) => !entry.url.endsWith("/product/"));
  } catch {
    productRoutes = [];
  }

  return [...staticRoutes, ...productRoutes];
}
