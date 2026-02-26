"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildHoverImagePair } from "@/lib/product-media";

type HomeProduct = {
  id: string;
  name: string;
  image: string;
  gender: string;
};

type GenderTab = "feminino" | "masculino";

function normalizeGender(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function matchesGender(productGender: string, selected: GenderTab): boolean {
  const normalized = normalizeGender(productGender);
  if (!normalized) return false;
  if (selected === "feminino") return normalized.includes("femin");
  return normalized.includes("mascul") || normalized.includes("male");
}

function resolveImageSrc(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/images/produtos/sug1.jpeg";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\.?\//, "")}`;
}

export function GenderSelector() {
  const [selectedGender, setSelectedGender] = useState<GenderTab>("feminino");
  const [products, setProducts] = useState<HomeProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadProducts() {
      setIsLoading(true);
      setHasError(false);
      try {
        const response = await fetch("/api/products", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load products: ${response.status}`);
        }

        const payload = (await response.json()) as unknown;
        if (!Array.isArray(payload)) {
          throw new Error("Invalid products payload");
        }

        const safeProducts = payload
          .map((item) => item as Partial<HomeProduct>)
          .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
          .map((item) => ({
            id: String(item.id || ""),
            name: String(item.name || ""),
            image: String(item.image || ""),
            gender: String(item.gender || ""),
          }));

        if (!isMounted) return;
        setProducts(safeProducts);
      } catch (error) {
        if (!isMounted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setHasError(true);
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    }

    loadProducts();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const selected = products.filter((product) => matchesGender(product.gender, selectedGender));
    return selected.slice(0, 8);
  }, [products, selectedGender]);

  return (
    <section className="category-switch" aria-label="Selecao por genero">
      <div className="category-intro">
        <p>Explore as pecas em destaque por genero.</p>
        <div className="category-tabs" role="tablist" aria-label="Selecionar genero">
          <button
            className={`category-tab ${selectedGender === "feminino" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={selectedGender === "feminino"}
            onClick={() => setSelectedGender("feminino")}
          >
            Feminino
          </button>
          <button
            className={`category-tab ${selectedGender === "masculino" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={selectedGender === "masculino"}
            onClick={() => setSelectedGender("masculino")}
          >
            Masculino
          </button>
        </div>
      </div>

      <div className="category-grid">
        {isLoading ? <p className="genesis-empty">Carregando produtos...</p> : null}
        {!isLoading && hasError ? <p className="genesis-empty">Nao foi possivel carregar os produtos agora.</p> : null}
        {!isLoading && !hasError && filteredProducts.length === 0 ? (
          <p className="genesis-empty">Nenhum produto encontrado para este genero.</p>
        ) : null}

        {!isLoading && !hasError
          ? filteredProducts.map((product) => {
              const pair = buildHoverImagePair({
                id: product.id,
                image: resolveImageSrc(product.image),
              });

              return (
                <article key={product.id} className="category-card">
                  <Link href={`/product/${encodeURIComponent(product.id)}`} className="category-media">
                    <div className="category-image">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="card-media-img card-media-img-primary" src={pair.primary} alt={product.name} loading="lazy" decoding="async" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="card-media-img card-media-img-secondary"
                        src={pair.secondary || pair.primary}
                        alt={`${product.name} - segunda foto`}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          const element = event.currentTarget;
                          element.onerror = null;
                          element.src = pair.primary || "/images/produtos/sug1.jpeg";
                        }}
                      />
                    </div>
                  </Link>
                  <h3>{product.name}</h3>
                </article>
              );
            })
          : null}
      </div>
    </section>
  );
}
