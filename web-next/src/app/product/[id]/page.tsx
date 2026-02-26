import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductExperience } from "@/components/product/ProductExperience";
import { LegacyFooter } from "@/components/home-legacy/LegacyFooter";
import { readPublicEnv } from "@/lib/env";
import { getProduct, getRecommendations } from "@/services/products";
import type { Product } from "@/types";

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

  const imageBaseUrl = buildImageBaseUrl();
  const canonicalPath = `/product/${encodeURIComponent(product.id)}`;
  const baseUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "https://tsebi.com.br").replace(/\/+$/, "");
  const productUrl = `${baseUrl}${canonicalPath}`;
  const productImage = buildOgImage(product);
  const availability = Number(product.stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
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
      <ProductExperience product={product} recommendations={recommendations} imageBaseUrl={imageBaseUrl} />
      <LegacyFooter variant="light" />
    </>
  );
}
