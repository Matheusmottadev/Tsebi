"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildHoverImagePair } from "@/lib/product-media";
import type { Product } from "@/types";

type GenderTab = "feminino" | "masculino";

type GenderShowcaseProps = {
  products: Product[];
};

type LegacyShowcaseCard = {
  id: string;
  sku: string;
  name: string;
  image: string;
  secondaryImage?: string;
  alt: string;
};

const LEGACY_SHOWCASE_CARDS: Record<GenderTab, LegacyShowcaseCard[]> = {
  feminino: [
    {
      id: "origem-skirt",
      sku: "origem-skirt",
      name: "Saia estruturada em la fria",
      image: "/images/produtos/sug2.jpeg",
      alt: "Saia estruturada em la fria",
    },
    {
      id: "genesis-tailored",
      sku: "genesis-tailored",
      name: "Calca de alfaiataria premium",
      image: "/images/produtos/sug4.jpeg",
      alt: "Calca de alfaiataria premium",
    },
    {
      id: "atelier-heels",
      sku: "atelier-heels",
      name: "Scarpin em couro envernizado",
      image: "/images/produtos/sug2.jpeg",
      alt: "Scarpin em couro envernizado",
    },
    {
      id: "essence-blazer",
      sku: "essence-blazer",
      name: "Blazer em linho premium",
      image: "/images/produtos/sug4.jpeg",
      alt: "Blazer em linho premium",
    },
    {
      id: "noir-dress",
      sku: "noir-dress",
      name: "Vestido coluna em crepe de seda",
      image: "/images/produtos/sug6.jpeg",
      alt: "Vestido coluna em crepe de seda",
    },
  ],
  masculino: [
    {
      id: "origem-shirt",
      sku: "origem-shirt",
      name: "Camisa em algodao croata",
      image: "/images/produtos/sug3.jpeg",
      alt: "Camisa em algodao croata",
    },
    {
      id: "genesis-bomber",
      sku: "genesis-bomber",
      name: "Jaqueta bomber em couro italiano",
      image: "/images/produtos/sug1.jpeg",
      alt: "Jaqueta bomber em couro italiano",
    },
    {
      id: "noir-sneaker",
      sku: "noir-sneaker",
      name: "Tenis em nylon tecnico premium",
      image: "/images/produtos/sug1.jpeg",
      alt: "Tenis em nylon tecnico premium",
    },
    {
      id: "flux-trench",
      sku: "flux-trench",
      name: "Trench coat em gabardine",
      image: "/images/produtos/sug3.jpeg",
      alt: "Trench coat em gabardine",
    },
    {
      id: "flux-knit",
      sku: "flux-knit",
      name: "Malha em la merino",
      image: "/images/produtos/sug5.jpeg",
      alt: "Malha em la merino",
    },
  ],
};

function resolveProductImageSrc(image: string): string {
  const raw = String(image || "").trim();
  if (!raw) return "/images/placeholder.jpg";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/images/")) return raw;
  if (raw.startsWith("/")) return raw;

  const clean = raw.replace(/^\.?\//, "");
  if (clean.startsWith("images/")) return `/${clean}`;
  if (clean.startsWith("produtos/")) return `/images/${clean}`;
  return `/${clean}`;
}

export function GenderShowcase({ products }: GenderShowcaseProps) {
  const [activeTab, setActiveTab] = useState<GenderTab>("feminino");
  const [renderedTab, setRenderedTab] = useState<GenderTab>("feminino");
  const [isSwitching, setIsSwitching] = useState(false);
  const switchTimerRef = useRef<number | null>(null);

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    (Array.isArray(products) ? products : []).forEach((product) => {
      const id = String(product?.id || "").trim();
      const sku = String(product?.sku || "").trim();
      if (id) map.set(id, product);
      if (sku) map.set(sku, product);
    });
    return map;
  }, [products]);

  useEffect(
    () => () => {
      if (switchTimerRef.current !== null) {
        window.clearTimeout(switchTimerRef.current);
      }
    },
    []
  );

  function handleTabChange(nextTab: GenderTab) {
    if (nextTab === activeTab && nextTab === renderedTab && !isSwitching) return;

    setActiveTab(nextTab);
    if (switchTimerRef.current !== null) {
      window.clearTimeout(switchTimerRef.current);
    }

    setIsSwitching(true);
    switchTimerRef.current = window.setTimeout(() => {
      setRenderedTab(nextTab);
      setIsSwitching(false);
      switchTimerRef.current = null;
    }, 180);
  }

  const visibleProducts = useMemo(() => {
    return LEGACY_SHOWCASE_CARDS[renderedTab].map((item) => {
      const matched = productById.get(item.sku) || productById.get(item.id);
      const resolvedName = String(matched?.name || "").trim() || item.name;
      const pair = buildHoverImagePair({
        id: item.id,
        secondaryImage: matched?.secondaryImage,
        image: matched?.image ? resolveProductImageSrc(String(matched.image)) : item.image,
      });
      const href = `/product/${encodeURIComponent(item.sku || item.id)}`;

      return {
        ...item,
        name: resolvedName,
        image: pair.primary,
        secondaryImage: pair.secondary,
        href,
      };
    });
  }, [productById, renderedTab]);

  return (
    <section className="category-switch" data-category-switch="featured" aria-label="Destaques por genero">
      <div className="category-intro">
        <p>Ha uma raiz que sustenta tudo o que escolhemos ser. Porque estilo nao e sobre o que voce veste, e sobre quem voce e.</p>
        <div className="category-tabs" role="tablist" aria-label="Selecionar genero">
          <button
            className={`category-tab ${activeTab === "feminino" ? "is-active" : ""}`}
            id="tabFeminino"
            type="button"
            role="tab"
            data-category="feminino"
            aria-selected={activeTab === "feminino"}
            aria-controls="categoryGrid"
            onClick={() => handleTabChange("feminino")}
          >
            Feminino
          </button>
          <button
            className={`category-tab ${activeTab === "masculino" ? "is-active" : ""}`}
            id="tabMasculino"
            type="button"
            role="tab"
            data-category="masculino"
            aria-selected={activeTab === "masculino"}
            aria-controls="categoryGrid"
            onClick={() => handleTabChange("masculino")}
          >
            Masculino
          </button>
        </div>
      </div>

      <div className={`category-grid ${isSwitching ? "is-switching" : ""}`} id="categoryGrid">
        {visibleProducts.map((product) => (
          <article key={`${product.sku || product.id}-${product.name}`} className="category-card">
            <Link href={product.href} className="category-media">
              <div className="category-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="card-media-img card-media-img-primary"
                  loading="lazy"
                  decoding="async"
                  src={product.image}
                  alt={product.alt}
                  onError={(event) => {
                    const element = event.currentTarget;
                    element.onerror = null;
                    element.src = "/images/placeholder.jpg";
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="card-media-img card-media-img-secondary"
                  loading="lazy"
                  decoding="async"
                  src={product.secondaryImage || product.image}
                  alt={`${product.alt} - segunda foto`}
                  onError={(event) => {
                    const element = event.currentTarget;
                    element.onerror = null;
                    element.src = product.image || "/images/placeholder.jpg";
                  }}
                />
              </div>
            </Link>
            <h3>
              <Link href={product.href}>{product.name}</Link>
            </h3>
          </article>
        ))}
      </div>
    </section>
  );
}
