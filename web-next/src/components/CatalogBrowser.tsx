"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/types";
import { ProductGrid } from "@/components/ProductGrid";
import {
  buildRecommendationSignalPayload,
  trackRecommendationCategoryVisit,
  trackRecommendationProductInteraction,
  trackRecommendationSearch,
} from "@/lib/recommendationSignals";
import { getOrCreateAnonId, trackCommerceEvent } from "@/lib/analytics";
import { getMe } from "@/services/auth";
import { getPersonalizedProducts, trackSearchEvent } from "@/services/products";
import { buildHoverImagePair } from "@/lib/product-media";
import styles from "./CatalogBrowser.module.css";

type SortOption = "name_asc" | "price_asc" | "price_desc";

type CatalogBrowserProps = {
  products: Product[];
  imageBaseUrl?: string;
  initialLimit?: number;
};

const DEFAULT_LIMIT = 12;

function normalizeText(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function resolveProductHref(product: Product): string | null {
  const sku = String(product.sku || product.id || "").trim();
  if (!sku) return null;
  return `/product/${encodeURIComponent(sku)}`;
}

function resolveProductImageSrc(product: Product): string {
  const raw = String(product.image || "").trim();
  if (!raw) return "/images/hero.jpg";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\.?\//, "")}`;
}

function resolvePriceLabel(product: Product): string {
  const label = String(product.priceLabel || "").trim();
  if (label) return label;
  const value = Number(product.priceValue || 0);
  if (Number.isFinite(value) && value > 0) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  return "Sob consulta";
}

function sortProducts(list: Product[], sortBy: SortOption): Product[] {
  const copy = [...list];

  if (sortBy === "price_asc") {
    copy.sort((a, b) => Number(a.unitAmount || 0) - Number(b.unitAmount || 0));
    return copy;
  }

  if (sortBy === "price_desc") {
    copy.sort((a, b) => Number(b.unitAmount || 0) - Number(a.unitAmount || 0));
    return copy;
  }

  copy.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  return copy;
}

export function CatalogBrowser({ products, imageBaseUrl, initialLimit = DEFAULT_LIMIT }: CatalogBrowserProps) {
  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [category, setCategory] = useState("all");
  const [collection, setCollection] = useState("all");
  const [visibleCount, setVisibleCount] = useState(Math.max(1, initialLimit));
  const [recommendationTitle, setRecommendationTitle] = useState("Seleção personalizada");
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [favoriteSkus, setFavoriteSkus] = useState<Record<string, boolean>>({});
  const [hasTrackedRecommendationView, setHasTrackedRecommendationView] = useState(false);

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        safeProducts
          .map((item) => String(item.category || "").trim())
          .filter((item) => item.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [safeProducts]);

  const collections = useMemo(() => {
    return Array.from(
      new Set(
        safeProducts
          .map((item) => String(item.collection || "").trim())
          .filter((item) => item.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [safeProducts]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    const byFilter = safeProducts.filter((item) => {
      const matchesCategory = category === "all" ? true : String(item.category || "").trim() === category;
      if (!matchesCategory) return false;

      const matchesCollection = collection === "all" ? true : String(item.collection || "").trim() === collection;
      if (!matchesCollection) return false;

      if (!normalizedQuery) return true;

      const haystack = [item.name, item.category, item.collection, item.material, item.sku]
        .map((value) => normalizeText(String(value || "")))
        .join(" ");
      return haystack.includes(normalizedQuery);
    });

    return sortProducts(byFilter, sortBy);
  }, [category, collection, query, safeProducts, sortBy]);

  const visibleProducts = filtered.slice(0, visibleCount);
  const hasMore = visibleProducts.length < filtered.length;
  const recommendationFallback = useMemo(() => safeProducts.slice(0, 8), [safeProducts]);
  const recommendationsToRender = useMemo(
    () => (recommendations.length > 0 ? recommendations : recommendationFallback).slice(0, 8),
    [recommendations, recommendationFallback]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const incomingQuery = String(new URLSearchParams(window.location.search).get("q") || "").trim();
    if (!incomingQuery) return;
    setQuery(incomingQuery);
    trackRecommendationSearch(incomingQuery);
    void trackCommerceEvent({
      eventName: "search",
      anonId: getOrCreateAnonId(),
      query: incomingQuery,
      source: "catalog_search_qs",
      attributes: { placement: "catalog" },
    });
  }, []);

  useEffect(() => {
    if (visibleProducts.length === 0) return;
    void trackCommerceEvent({
      eventName: "view_item_list",
      anonId: getOrCreateAnonId(),
      source: "catalog_products",
      attributes: {
        list_size: visibleProducts.length,
        category_filter: category,
        collection_filter: collection,
      },
    });
  }, [visibleProducts, category, collection]);

  useEffect(() => {
    let active = true;
    async function loadRecommendations() {
      try {
        const me = await getMe({ cache: "no-store" }).catch(() => null);
        const userId = String(me?.id || "").trim();
        const anonId = getOrCreateAnonId();
        const signals = buildRecommendationSignalPayload();
        const response = await getPersonalizedProducts(userId, 8, signals, { anonId, placement: "search" });
        if (!active) return;
        setRecommendationTitle(String(response.title || "Seleção personalizada"));
        setRecommendations(Array.isArray(response.products) ? response.products : recommendationFallback);
      } catch {
        if (!active) return;
        setRecommendationTitle("Recomendado para você");
        setRecommendations(recommendationFallback);
      }
    }
    loadRecommendations();
    return () => {
      active = false;
    };
  }, [recommendationFallback]);

  useEffect(() => {
    if (hasTrackedRecommendationView) return;
    if (recommendationsToRender.length === 0) return;
    setHasTrackedRecommendationView(true);
    void trackCommerceEvent({
      eventName: "view_recommendations",
      anonId: getOrCreateAnonId(),
      source: "products_page",
      attributes: {
        placement: "search",
        count: recommendationsToRender.length,
      },
    });
  }, [hasTrackedRecommendationView, recommendationsToRender]);

  return (
    <section className={styles.section}>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span>Search</span>
          <input
            type="search"
            placeholder="Search products"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              if (next.trim().length >= 2) trackRecommendationSearch(next);
              if (next.trim().length >= 2) {
                void trackCommerceEvent({
                  eventName: "search",
                  anonId: getOrCreateAnonId(),
                  query: next.trim(),
                  source: "catalog_input",
                  attributes: { placement: "catalog" },
                });
              }
              setVisibleCount(Math.max(1, initialLimit));
            }}
          />
        </label>

        <label className={styles.field}>
          <span>Sort</span>
          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as SortOption);
              setVisibleCount(Math.max(1, initialLimit));
            }}
          >
            <option value="name_asc">Name A-Z</option>
            <option value="price_asc">Price low-high</option>
            <option value="price_desc">Price high-low</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => {
              const next = event.target.value;
              setCategory(next);
              if (next !== "all") trackRecommendationCategoryVisit(next, 6000);
              setVisibleCount(Math.max(1, initialLimit));
            }}
          >
            <option value="all">All</option>
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Collection</span>
          <select
            value={collection}
            onChange={(event) => {
              const next = event.target.value;
              setCollection(next);
              if (next !== "all") trackRecommendationCategoryVisit(next, 6000);
              setVisibleCount(Math.max(1, initialLimit));
            }}
          >
            <option value="all">All</option>
            {collections.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className={styles.recommendSection} aria-label="Seleção personalizada">
        <div className={styles.recommendHead}>
          <h3>{recommendationTitle}</h3>
        </div>
        <div className={styles.recommendGrid} role="list">
          {recommendationsToRender.map((product, index) => {
            const href = resolveProductHref(product);
            if (!href) return null;
            const sku = String(product.sku || product.id || "").trim();
            const pair = buildHoverImagePair(product);
            const isFavorite = Boolean(favoriteSkus[sku]);
            return (
              <article key={`search-rec-${sku || index}`} className={styles.recommendCard} role="listitem">
                <button
                  type="button"
                  className={`${styles.favoriteBtn} ${isFavorite ? styles.favoriteBtnActive : ""}`}
                  aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  onClick={() => {
                    const nextActive = !isFavorite;
                    setFavoriteSkus((current) => ({ ...current, [sku]: nextActive }));
                    void trackCommerceEvent({
                      eventName: "favorite_toggle",
                      anonId: getOrCreateAnonId(),
                      productId: sku,
                      category: String(product.category || "").trim(),
                      price: Number(product.priceValue || 0),
                      currency: product.currency || "brl",
                      source: "catalog_recommendations",
                      attributes: { active: nextActive },
                    });
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 20.4l-1.16-1.05C6.14 15.09 3 12.24 3 8.75 3 5.98 5.15 4 7.75 4c1.52 0 2.98.72 3.92 1.92A5.05 5.05 0 0 1 15.59 4C18.19 4 20.34 5.98 20.34 8.75c0 3.49-3.14 6.34-7.84 10.6L12 20.4z" />
                  </svg>
                </button>
                <Link
                  href={href}
                  className={styles.recommendLink}
                  onClick={() => {
                    trackRecommendationProductInteraction({
                      sku,
                      category: String(product.category || "").trim(),
                      priceValue: Number(product.priceValue || 0),
                      viewed: true,
                    });
                    void trackSearchEvent({
                      type: "result_click",
                      query: String(query || "").trim() || "catalog_recommendations",
                      productSku: sku,
                      position: index + 1,
                      source: "catalog_recommendations",
                    }).catch(() => {});
                    void trackCommerceEvent({
                      eventName: "click_recommendation",
                      anonId: getOrCreateAnonId(),
                      productId: sku,
                      category: String(product.category || "").trim(),
                      price: Number(product.priceValue || 0),
                      currency: product.currency || "brl",
                      source: "catalog_recommendations",
                      attributes: { placement: "search", position: index + 1 },
                    });
                  }}
                >
                  <div className={styles.recommendMedia}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={`${styles.recommendImg} ${styles.recommendImgPrimary}`}
                      loading="lazy"
                      decoding="async"
                      src={pair.primary || resolveProductImageSrc(product)}
                      alt={product.name}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={`${styles.recommendImg} ${styles.recommendImgSecondary}`}
                      loading="lazy"
                      decoding="async"
                      src={pair.secondary || resolveProductImageSrc(product)}
                      alt={`${product.name} - detalhe`}
                    />
                  </div>
                  <div className={styles.recommendMeta}>
                    <h4>{product.name}</h4>
                    <p>{resolvePriceLabel(product)}</p>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <p className={styles.summary}>
        Showing {visibleProducts.length} of {filtered.length} product(s).
      </p>

      <ProductGrid
        products={visibleProducts}
        imageBaseUrl={imageBaseUrl}
        emptyMessage="No products matched your filters."
      />

      {hasMore ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.loadMore}
            onClick={() => setVisibleCount((current) => current + Math.max(1, initialLimit))}
          >
            Load more
          </button>
        </div>
      ) : null}
    </section>
  );
}

