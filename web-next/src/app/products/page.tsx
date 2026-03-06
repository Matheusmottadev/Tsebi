import type { Metadata } from "next";
import { listProducts } from "@/services/products";
import { ProductGrid } from "@/components/ProductGrid";
import { BodyClassName } from "@/components/BodyClassName";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "Produtos",
  description: "Produtos Tsebi.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Produtos | Tsebi Brasil",
    description: "Produtos Tsebi.",
    url: "/products",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Produtos | Tsebi Brasil",
    description: "Produtos Tsebi.",
  },
};

type ProductsSearchParams = {
  view?: string;
  q?: string;
  gender?: string;
  category?: string;
  collection?: string;
  subcategory?: string;
  isNew?: string;
  isBestSeller?: string;
  isFeatured?: string;
};

type ExtendedProduct = Product & {
  subcategory?: string;
  collections?: string[];
  tags?: string[];
  isNew?: boolean;
  isBestSeller?: boolean;
  isFeatured?: boolean;
};

type HeroConfig = {
  mediaUrl: string;
  mediaType: "image" | "video";
  rotate180?: boolean;
  objectPosition?: string;
};

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseBooleanParam(value: string | undefined): boolean | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeText(value);
  if (["1", "true", "yes", "sim"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;
  return null;
}

function includesNormalized(haystack: unknown, needle: string): boolean {
  return normalizeText(haystack).includes(needle);
}

function matchesArrayField(values: unknown, needle: string): boolean {
  if (!Array.isArray(values)) return false;
  return values.some((entry) => includesNormalized(entry, needle));
}

function buildPageTitle(params: ProductsSearchParams): string {
  const view = normalizeText(params.view);
  if (view === "novidades-para-ele") return "Novidades para ele";
  if (view === "novidades-para-ela") return "Novidades para ela";

  const isNew = parseBooleanParam(params.isNew);
  const gender = normalizeText(params.gender);

  if (isNew === true && gender === "masculino") return "Novidades para ele";
  if (isNew === true && gender === "feminino") return "Novidades para ela";
  if (isNew === true) return "Novidades";
  if (gender === "masculino") return "Produtos Masculinos";
  if (gender === "feminino") return "Produtos Femininos";
  return "Produtos";
}

function resolveCommercialView(params: ProductsSearchParams): ProductsSearchParams {
  const view = normalizeText(params.view);

  if (view === "novidades-para-ele") {
    return { ...params, isNew: params.isNew ?? "true", gender: params.gender ?? "Masculino" };
  }

  if (view === "novidades-para-ela") {
    return { ...params, isNew: params.isNew ?? "true", gender: params.gender ?? "Feminino" };
  }

  return params;
}

function resolveHeroConfig(params: ProductsSearchParams): HeroConfig | null {
  const view = normalizeText(params.view);

  if (view === "novidades-para-ela") {
    return {
      mediaUrl: "https://media.tsebi.com.br/generation-8974f666-dacc-437b-a535-77e350085a50.png",
      mediaType: "image",
      objectPosition: "center 22%",
    };
  }

  if (view === "novidades-para-ele") {
    return {
      mediaUrl: "https://media.tsebi.com.br/generation-57e63375-48cf-4bbf-a7b9-22ce3f1b5a6a.png",
      mediaType: "image",
      rotate180: false,
      objectPosition: "center 28%",
    };
  }

  return null;
}

function filterProducts(products: ExtendedProduct[], params: ProductsSearchParams): ExtendedProduct[] {
  const query = normalizeText(params.q);
  const gender = normalizeText(params.gender);
  const category = normalizeText(params.category);
  const collection = normalizeText(params.collection);
  const subcategory = normalizeText(params.subcategory);
  const isNew = parseBooleanParam(params.isNew);
  const isBestSeller = parseBooleanParam(params.isBestSeller);
  const isFeatured = parseBooleanParam(params.isFeatured);

  return products.filter((product) => {
    if (gender && normalizeText(product.gender) !== gender) return false;
    if (category && normalizeText(product.category) !== category) return false;

    if (collection) {
      const matchesPrimary = normalizeText(product.collection) === collection;
      const matchesList = matchesArrayField(product.collections, collection);
      if (!matchesPrimary && !matchesList) return false;
    }

    if (subcategory && normalizeText(product.subcategory) !== subcategory) return false;
    if (isNew !== null && Boolean(product.isNew) !== isNew) return false;
    if (isBestSeller !== null && Boolean(product.isBestSeller) !== isBestSeller) return false;
    if (isFeatured !== null && Boolean(product.isFeatured) !== isFeatured) return false;

    if (!query) return true;

    const searchable = [
      product.name,
      product.category,
      product.collection,
      product.material,
      product.sku,
      product.subcategory,
      ...(Array.isArray(product.tags) ? product.tags : []),
      ...(Array.isArray(product.collections) ? product.collections : []),
    ];

    return searchable.some((entry) => includesNormalized(entry, query));
  });
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const rawParams = await searchParams;
  const params = resolveCommercialView(rawParams);
  const products = (await listProducts()) as ExtendedProduct[];
  const filtered = filterProducts(products, params);
  const title = buildPageTitle(params);
  const heroConfig = resolveHeroConfig(params);

  if (heroConfig) {
    const headerStackHeight = "calc(var(--top-bar-height, 38px) + var(--header-height, 84px))";
    const viewportHeight = `calc(100dvh - ${headerStackHeight})`;

    return (
      <main>
        <BodyClassName className="products-novidades-view" />

        <section
          aria-label={title}
          style={{
            position: "relative",
            width: "100vw",
            height: viewportHeight,
            minHeight: viewportHeight,
            marginLeft: "calc(50% - 50vw)",
            marginTop: headerStackHeight,
            overflow: "hidden",
          }}
        >
          {heroConfig.mediaType === "video" ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              src={heroConfig.mediaUrl}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: heroConfig.objectPosition ?? "center center",
                transform: heroConfig.rotate180 ? "rotate(180deg)" : "none",
                transformOrigin: "center center",
              }}
            />
          ) : (
            <img
              src={heroConfig.mediaUrl}
              alt={title}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: heroConfig.objectPosition ?? "center center",
                transform: heroConfig.rotate180 ? "rotate(180deg)" : "none",
                transformOrigin: "center center",
              }}
            />
          )}
        </section>

        <section
          aria-label={`Produtos da seção ${title}`}
          style={{
            width: "100vw",
            marginLeft: "calc(50% - 50vw)",
            background: "#f4f4f4",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 0,
            }}
          >
            {filtered.map((product) => (
              <a
                key={product.id}
                href={`/product/${encodeURIComponent(product.id)}`}
                style={{
                  position: "relative",
                  display: "block",
                  aspectRatio: "3 / 4.1",
                  overflow: "hidden",
                  background: "#e9ecef",
                }}
              >
                <img
                  src={String(product.image || "/images/placeholderreal.webp")}
                  alt={product.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center",
                    display: "block",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: "auto 0 0 0",
                    padding: "14px 14px 16px",
                    background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.66) 100%)",
                    color: "#fff",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      lineHeight: 1.25,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {product.name}
                  </p>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: "13px",
                      letterSpacing: "0.02em",
                      opacity: 0.95,
                    }}
                  >
                    {product.priceLabel}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="tsebi-category-section" aria-label="catalogo de produtos">
        <div className="tsebi-container">
          <ProductGrid
            products={filtered}
            title={title}
            description={`${filtered.length} produto(s)`}
            emptyMessage="Nenhum produto encontrado para os filtros selecionados."
          />
        </div>
      </section>
    </main>
  );
}
