import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductExperience } from "@/components/product/ProductExperience";
import { LegacyFooter } from "@/components/home-legacy/LegacyFooter";
import { readPublicEnv } from "@/lib/env";
import { getProduct, getRecommendations, listProducts } from "@/services/products";
import type { Product } from "@/types";

export const revalidate = 60;

type ProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function normalizeImageUrl(src: string, imageBaseUrl: string): string {
  const raw = String(src || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const clean = raw.startsWith("/") ? raw : `/${raw.replace(/^\.?\//, "")}`;
  if (!imageBaseUrl) return clean;

  try {
    return new URL(clean, `${imageBaseUrl}/`).toString();
  } catch {
    return clean;
  }
}

function buildImageBaseUrl(): string {
  try {
    return readPublicEnv().apiBaseUrl;
  } catch {
    return "";
  }
}

function buildOgImage(product: Product): string | undefined {
  const imageBaseUrl = buildImageBaseUrl();
  const image = normalizeImageUrl(product.image, imageBaseUrl);
  if (!image) return undefined;
  if (/^https?:\/\//i.test(image)) return image;

  try {
    const { siteUrl } = readPublicEnv();
    if (!siteUrl) return undefined;
    return new URL(image, `${siteUrl}/`).toString();
  } catch {
    return undefined;
  }
}

function normalizeRecommendationText(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function scoreFallbackRecommendation(base: Product, candidate: Product): number {
  let score = 0;

  if (normalizeRecommendationText(base.collection) && normalizeRecommendationText(base.collection) === normalizeRecommendationText(candidate.collection)) {
    score += 5;
  }

  if (normalizeRecommendationText(base.category) && normalizeRecommendationText(base.category) === normalizeRecommendationText(candidate.category)) {
    score += 4;
  }

  if (normalizeRecommendationText(base.material) && normalizeRecommendationText(base.material) === normalizeRecommendationText(candidate.material)) {
    score += 2;
  }

  if (Number(candidate.stock || 0) > 0) {
    score += 1;
  }

  return score;
}

function buildTailoredRecommendations(base: Product, primary: Product[], catalog: Product[], limit = 4): Product[] {
  const seen = new Set<string>([String(base.id || "").trim()]);
  const merged: Product[] = [];

  for (const item of primary) {
    const key = String(item.id || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  const fallback = [...catalog]
    .filter((item) => {
      const key = String(item.id || "").trim();
      return Boolean(key) && !seen.has(key);
    })
    .sort((a, b) => scoreFallbackRecommendation(base, b) - scoreFallbackRecommendation(base, a));

  for (const item of fallback) {
    if (merged.length >= limit) break;
    const key = String(item.id || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged.slice(0, limit);
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const id = decodeURIComponent(resolvedParams.id);
  const product = await getProduct(id);

  if (!product) {
    return {
      title: "Product not found",
      description: "The requested product is not available in the current catalog.",
    };
  }

  const description = `${product.category} from ${product.collection}. ${product.material}.`;
  const ogImage = buildOgImage(product);
  const canonicalPath = `/product/${encodeURIComponent(product.id)}`;

  return {
    title: product.name,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${product.name} | Tsebi Brasil`,
      description,
      url: canonicalPath,
      type: "website",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: `${product.name} | Tsebi Brasil`,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const resolvedParams = await params;
  const id = decodeURIComponent(resolvedParams.id);
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  let recommendations: Product[] = [];
  try {
    const result = await getRecommendations(id, 4);
    recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];
  } catch {
    recommendations = [];
  }

  let catalogFallback: Product[] = [];
  if (recommendations.length < 4) {
    try {
      catalogFallback = await listProducts();
    } catch {
      catalogFallback = [];
    }
  }

  const tailoredRecommendations = buildTailoredRecommendations(product, recommendations, catalogFallback, 4);

  const imageBaseUrl = buildImageBaseUrl();
  const canonicalPath = `/product/${encodeURIComponent(product.id)}`;
  const baseUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "https://tsebi.com.br").replace(/\/+$/, "");
  const productUrl = `${baseUrl}${canonicalPath}`;
  const productImage = buildOgImage(product);
  const normalizedAvailabilityStatus = String(product.availabilityStatus || "").trim().toLowerCase();
  const hasKnownAvailabilityStatus =
    normalizedAvailabilityStatus === "disponivel" ||
    normalizedAvailabilityStatus === "esgotando" ||
    normalizedAvailabilityStatus === "esgotado";
  const isOutOfStock =
    normalizedAvailabilityStatus === "esgotado" ||
    (!hasKnownAvailabilityStatus && Number(product.stock || 0) <= 0);
  const availability = isOutOfStock ? "https://schema.org/OutOfStock" : "https://schema.org/InStock";
  const offerPrice = Number.isFinite(Number(product.priceValue)) ? Number(product.priceValue) : Number(product.unitAmount || 0) / 100;
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku || product.id,
    category: product.category || "",
    material: product.material || "",
    image: productImage ? [productImage] : undefined,
    brand: {
      "@type": "Brand",
      name: "Tsebi Brasil",
    },
    offers: {
      "@type": "Offer",
      priceCurrency: String(product.currency || "BRL").toUpperCase(),
      price: offerPrice,
      availability,
      url: productUrl,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productSchema),
        }}
      />
      <ProductExperience product={product} recommendations={tailoredRecommendations} imageBaseUrl={imageBaseUrl} />
      <div className="product-mobile-footer">
        <LegacyFooter variant="light" />
      </div>
    </>
  );
}
