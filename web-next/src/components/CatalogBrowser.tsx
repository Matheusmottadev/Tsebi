"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/types";
import { ProductGrid } from "@/components/ProductGrid";
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
              setQuery(event.target.value);
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
              setCategory(event.target.value);
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
              setCollection(event.target.value);
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
