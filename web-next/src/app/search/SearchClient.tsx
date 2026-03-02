"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductImage } from "@/components/ProductImage";
import type { Product } from "@/types";
import { buildHoverImagePair } from "@/lib/product-media";
import { searchProductsDetailed, trackSearchEvent } from "@/services/products";
import styles from "./SearchClient.module.css";

function normalizeQuery(value: string): string {
  return String(value || "").trim();
}

function normalizeForCompare(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type SearchClientProps = {
  initialQuery?: string;
};

export function SearchClient({ initialQuery = "" }: SearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryFromUrl = normalizeQuery(searchParams.get("q") || initialQuery);

  const [queryInput, setQueryInput] = useState(queryFromUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [found, setFound] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestedQuery, setSuggestedQuery] = useState<string | null>(null);
  const [curatedProducts, setCuratedProducts] = useState<Product[]>([]);
  const [sort, setSort] = useState<"relevance" | "newest" | "price_asc" | "price_desc">("relevance");
  const [genderFilter, setGenderFilter] = useState<"" | "Masculino" | "Feminino">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [maybeLikeProducts, setMaybeLikeProducts] = useState<Product[]>([]);

  useEffect(() => {
    setQueryInput(queryFromUrl);
  }, [queryFromUrl]);

  const loadResults = useCallback(async (query: string) => {
    const normalized = normalizeQuery(query);
    if (normalized.length < 2) {
      setProducts([]);
      setFound(0);
      setSuggestions([]);
      setSuggestedQuery(null);
      setCuratedProducts([]);
      return;
    }

    setIsLoading(true);
    try {
      const result = await searchProductsDetailed(normalized, {
        page: 1,
        limit: 24,
        sort,
        gender: genderFilter || undefined,
        category: categoryFilter || undefined
      });
      const baseProducts = Array.isArray(result.products) ? result.products : [];
      const refined = baseProducts.filter((product) => {
        if (materialFilter && normalizeForCompare(product.material) !== normalizeForCompare(materialFilter)) return false;
        if (colorFilter) {
          const hasColor = Array.isArray(product.colors)
            ? product.colors.some((color) => normalizeForCompare(color) === normalizeForCompare(colorFilter))
            : false;
          if (!hasColor) return false;
        }
        return true;
      });
      setProducts(refined);
      setFound(Number(result.found || 0));
      setSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
      setSuggestedQuery(result.suggestedQuery || null);
      setCuratedProducts(Array.isArray(result.curatedProducts) ? result.curatedProducts : []);

      void trackSearchEvent({
        type: "search_view",
        query: normalized,
        resultsCount: refined.length,
        source: "search_page"
      }).catch(() => {});

      if (refined.length === 0) {
        void trackSearchEvent({
          type: "zero_result",
          query: normalized,
          resultsCount: 0,
          source: "search_page"
        }).catch(() => {});
      }
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, colorFilter, genderFilter, materialFilter, sort]);

  useEffect(() => {
    void loadResults(queryFromUrl);
  }, [queryFromUrl, loadResults]);

  const submitSearch = useCallback(
    (query: string) => {
      const normalized = normalizeQuery(query);
      if (normalized.length < 2) return;
      router.push(`/search?q=${encodeURIComponent(normalized)}`);
    },
    [router]
  );

  const recommendedWhenEmpty = useMemo(() => {
    if (curatedProducts.length > 0) return curatedProducts.slice(0, 12);
    const inStock = products.filter((item) => Number(item.stock || 0) > 0);
    return inStock.slice(0, 12);
  }, [curatedProducts, products]);

  const filterCatalog = useMemo(() => {
    const categories = Array.from(new Set(products.map((item) => String(item.category || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const materials = Array.from(new Set(products.map((item) => String(item.material || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const colors = Array.from(
      new Set(
        products
          .flatMap((item) => (Array.isArray(item.colors) ? item.colors : []))
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return { categories, materials, colors };
  }, [products]);

  const handleOutOfStockClick = useCallback(
    (product: Product, event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      const fallbackPool = products.filter((item) => item.id !== product.id && Number(item.stock || 0) > 0);
      const sameCategory = fallbackPool.filter(
        (item) => normalizeForCompare(item.category) === normalizeForCompare(product.category)
      );
      const sameCollection = fallbackPool.filter(
        (item) => normalizeForCompare(item.collection) === normalizeForCompare(product.collection)
      );
      const curated = curatedProducts.filter((item) => Number(item.stock || 0) > 0 && item.id !== product.id);
      const merged = [...sameCategory, ...sameCollection, ...curated, ...fallbackPool];
      const seen = new Set<string>();
      const selected: Product[] = [];
      merged.forEach((item) => {
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        selected.push(item);
      });

      setNotice(`"${product.name}" está indisponível no momento. Veja opções parecidas abaixo.`);
      setMaybeLikeProducts(selected.slice(0, 12));

      void trackSearchEvent({
        type: "result_click",
        query: queryFromUrl,
        productSku: product.sku,
        source: "search_page_out_of_stock"
      }).catch(() => {});
    },
    [curatedProducts, products, queryFromUrl]
  );

  return (
    <main className={styles.page} aria-label="Pagina de busca">
      <section className={styles.topSearchBar}>
        <form
          className={styles.topSearchForm}
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(queryInput);
          }}
        >
          <input
            type="search"
            className={styles.topSearchInput}
            placeholder="O que voce esta buscando?"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
          />
          <button type="submit" className={styles.topSearchSubmit}>
            BUSCAR
          </button>
        </form>
        <Link href="/" className={styles.closeLink}>CLOSE</Link>
      </section>

      <section className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.genderRow}>
            <button
              type="button"
              className={`${styles.genderButton}${!genderFilter ? ` ${styles.genderButtonActive}` : ""}`}
              onClick={() => setGenderFilter("")}
            >
              todos
            </button>
            <button
              type="button"
              className={`${styles.genderButton}${genderFilter === "Masculino" ? ` ${styles.genderButtonActive}` : ""}`}
              onClick={() => setGenderFilter("Masculino")}
            >
              homem
            </button>
            <button
              type="button"
              className={`${styles.genderButton}${genderFilter === "Feminino" ? ` ${styles.genderButtonActive}` : ""}`}
              onClick={() => setGenderFilter("Feminino")}
            >
              mulher
            </button>
          </div>

          <div className={styles.sidebarGroup}>
            {suggestions.slice(0, 4).map((term, index) => (
              <button
                key={`${term}-${index}`}
                type="button"
                className={styles.quickTerm}
                onClick={() => {
                  void trackSearchEvent({
                    type: "suggestion_click",
                    query: queryFromUrl,
                    suggestion: term,
                    position: index,
                    source: "search_sidebar_terms"
                  }).catch(() => {});
                  submitSearch(term);
                }}
              >
                {term}
              </button>
            ))}
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="sortFilter">Ordenar por</label>
            <select
              id="sortFilter"
              className={styles.filterSelect}
              value={sort}
              onChange={(event) => setSort(event.target.value as "relevance" | "newest" | "price_asc" | "price_desc")}
            >
              <option value="relevance">Relevancia</option>
              <option value="newest">Novidades</option>
              <option value="price_asc">Preco: menor</option>
              <option value="price_desc">Preco: maior</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="categoryFilter">Categoria</label>
            <select
              id="categoryFilter"
              className={styles.filterSelect}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">Todas</option>
              {filterCatalog.categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="materialFilter">Material</label>
            <select
              id="materialFilter"
              className={styles.filterSelect}
              value={materialFilter}
              onChange={(event) => setMaterialFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {filterCatalog.materials.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel} htmlFor="colorFilter">Cor</label>
            <select
              id="colorFilter"
              className={styles.filterSelect}
              value={colorFilter}
              onChange={(event) => setColorFilter(event.target.value)}
            >
              <option value="">Todas</option>
              {filterCatalog.colors.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </aside>

        <div className={styles.contentArea}>
          {suggestedQuery ? (
            <p className={styles.didYouMean}>
              Voce quis dizer{" "}
              <button
                type="button"
                className={styles.didYouMeanButton}
                onClick={() => {
                  void trackSearchEvent({
                    type: "did_you_mean_click",
                    query: queryFromUrl,
                    suggestion: suggestedQuery,
                    source: "search_page"
                  }).catch(() => {});
                  submitSearch(suggestedQuery);
                }}
              >
                {suggestedQuery}
              </button>
              ?
            </p>
          ) : null}

          {notice ? <div className={styles.notice}>{notice}</div> : null}

          <section className={styles.resultsSection}>
            <p className={styles.meta}>
              {isLoading ? "Buscando..." : `${found} itens encontrados para "${queryFromUrl || "..."}"`}
            </p>
            {products.length === 0 && !isLoading ? (
              <p className={styles.empty}>
                Nenhum item encontrado. Veja alguns itens que talvez voce goste abaixo.
              </p>
            ) : null}

            <div className={styles.grid}>
              {products.map((product, index) => {
                const imagePair = buildHoverImagePair(product);
                const outOfStock = Number(product.stock || 0) <= 0;
                return (
                  <article key={product.id} className={styles.card}>
                    <Link
                      href={`/product/${encodeURIComponent(product.id)}`}
                      className={styles.cardMedia}
                      onClick={(event) => {
                        if (outOfStock) {
                          handleOutOfStockClick(product, event);
                          return;
                        }
                        void trackSearchEvent({
                          type: "result_click",
                          query: queryFromUrl,
                          productSku: product.sku,
                          position: index,
                          source: "search_page"
                        }).catch(() => {});
                      }}
                    >
                      <ProductImage src={imagePair.primary} alt={product.name} className={`${styles.image} ${styles.imagePrimary}`} />
                      <ProductImage
                        src={imagePair.secondary}
                        alt={`${product.name} - segunda foto`}
                        className={`${styles.image} ${styles.imageSecondary}`}
                      />
                      {outOfStock ? <span className={styles.stockBadge}>Sem estoque</span> : null}
                    </Link>
                    <div className={styles.cardBody}>
                      <h3 className={styles.title}>{product.name}</h3>
                      <p className={styles.price}>{product.priceLabel}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {maybeLikeProducts.length > 0 || (products.length === 0 && recommendedWhenEmpty.length > 0) ? (
            <section className={styles.carouselSection}>
              <h2>Itens que talvez voce goste</h2>
              <div className={styles.carouselTrack}>
                {(maybeLikeProducts.length > 0 ? maybeLikeProducts : recommendedWhenEmpty).map((product) => {
                  const imagePair = buildHoverImagePair(product);
                  return (
                    <Link key={`maybe-${product.id}`} href={`/product/${encodeURIComponent(product.id)}`} className={styles.carouselCard}>
                      <div className={styles.carouselMedia}>
                        <ProductImage src={imagePair.primary} alt={product.name} className={styles.carouselImage} />
                      </div>
                      <div className={styles.carouselBody}>
                        <p className={styles.carouselTitle}>{product.name}</p>
                        <p className={styles.carouselMeta}>{product.collection}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
