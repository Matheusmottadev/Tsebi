"use client";

import Link from "next/link";
import Image from "next/image";
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
      image: "/images/product/origem-skirt-1.jpg",
      secondaryImage: "/images/product/origem-skirt-2.jpg",
      alt: "Saia estruturada em la fria",
    },
    {
      id: "genesis-tailored",
      sku: "genesis-tailored",
      name: "Calca de alfaiataria premium",
      image: "/images/product/genesis-tailored-1.jpg",
      secondaryImage: "/images/product/genesis-tailored-2.jpg",
      alt: "Calca de alfaiataria premium",
    },
    {
      id: "atelier-heels",
      sku: "atelier-heels",
      name: "Scarpin em couro envernizado",
      image: "/images/product/atelier-heels-1.jpg",
      secondaryImage: "/images/product/atelier-heels-2.jpg",
      alt: "Scarpin em couro envernizado",
    },
    {
      id: "essence-blazer",
      sku: "essence-blazer",
      name: "Blazer em linho premium",
      image: "/images/product/essence-blazer-1.jpg",
      secondaryImage: "/images/product/essence-blazer-2.jpg",
      alt: "Blazer em linho premium",
    },
    {
      id: "noir-dress",
      sku: "noir-dress",
      name: "Vestido coluna em crepe de seda",
      image: "/images/product/noir-dress-1.jpg",
      secondaryImage: "/images/product/noir-dress-2.jpg",
      alt: "Vestido coluna em crepe de seda",
    },
  ],
  masculino: [
    {
      id: "origem-shirt",
      sku: "origem-shirt",
      name: "Camisa em algodao croata",
      image: "/images/product/origem-shirt-1.jpg",
      secondaryImage: "/images/product/origem-shirt-2.jpg",
      alt: "Camisa em algodao croata",
    },
    {
      id: "genesis-bomber",
      sku: "genesis-bomber",
      name: "Jaqueta bomber em couro italiano",
      image: "/images/product/genesis-bomber-1.jpg",
      secondaryImage: "/images/product/genesis-bomber-2.jpg",
      alt: "Jaqueta bomber em couro italiano",
    },
    {
      id: "noir-sneaker",
      sku: "noir-sneaker",
      name: "Tenis em nylon técnico premium",
      image: "/images/product/noir-sneaker-1.jpg",
      secondaryImage: "/images/product/noir-sneaker-2.jpg",
      alt: "Tenis em nylon técnico premium",
    },
    {
      id: "flux-trench",
      sku: "flux-trench",
      name: "Trench coat em gabardine",
      image: "/images/product/flux-trench-1.jpg",
      secondaryImage: "/images/product/flux-trench-2.jpg",
      alt: "Trench coat em gabardine",
    },
    {
      id: "flux-knit",
      sku: "flux-knit",
      name: "Malha em la merino",
      image: "/images/product/flux-knit-1.jpg",
      secondaryImage: "/images/product/flux-knit-2.jpg",
      alt: "Malha em la merino",
    },
  ],
};

function resolveProductImageSrc(image: string): string {
  const raw = String(image || "").trim();
  if (!raw) return "/images/product/origem-skirt-1.jpg";
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
  const gridRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth > 760) return;

    const resetCarousel = () => {
      const grid = gridRef.current;
      if (!grid) return;
      grid.scrollTo({ left: 0, behavior: "auto" });
    };

    resetCarousel();
    const rafId = window.requestAnimationFrame(resetCarousel);
    const timeoutId = window.setTimeout(resetCarousel, 120);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [renderedTab]);

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
      const matchedRecord = (matched || {}) as Record<string, unknown>;
      const pair = buildHoverImagePair({
        id: item.id,
        metadata: matchedRecord.metadata,
        secondaryImage: String(matchedRecord.secondaryImage || "").trim() || item.secondaryImage,
        image:
          (String(matchedRecord.image || "").trim()
            ? resolveProductImageSrc(String(matchedRecord.image))
            : String(matchedRecord.image_url || "").trim()
              ? resolveProductImageSrc(String(matchedRecord.image_url))
              : item.image),
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
    <section className="category-switch" data-category-switch="featured" aria-label="Destaques por gênero">
      <div className="category-intro">
        <p>Ha uma raiz que sustenta tudo o que escolhemos ser. Porque estilo não e sobre o que Você veste, e sobre quem Você e.</p>
        <div className="category-tabs" role="tablist" aria-label="Selecionar gênero">
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

      <div ref={gridRef} className={`category-grid ${isSwitching ? "is-switching" : ""}`} id="categoryGrid">
        {visibleProducts.map((product) => (
          <article key={`${product.sku || product.id}-${product.name}`} className="category-card">
            <Link href={product.href} className="category-media">
              <div className="category-image">
                <Image
                  className="card-media-img card-media-img-primary"
                  src={product.image}
                  alt={product.alt}
                  width={900}
                  height={1200}
                  unoptimized
                  onError={(event) => {
                    const element = event.currentTarget;
                    element.onerror = null;
                    element.src = product.image || "/images/product/origem-skirt-1.jpg";
                  }}
                />
                <Image
                  className="card-media-img card-media-img-secondary"
                  src={product.secondaryImage || product.image}
                  alt={`${product.alt} - segunda foto`}
                  width={900}
                  height={1200}
                  unoptimized
                  onError={(event) => {
                    const element = event.currentTarget;
                    element.onerror = null;
                    element.src = product.image || "/images/product/origem-skirt-1.jpg";
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

