"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildHoverImagePair, collectProductMedia } from "@/lib/product-media";
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

type ShowcaseCardProduct = {
  id: string;
  sku: string;
  name: string;
  images: string[];
  alt: string;
  href: string;
};

type CarouselDirection = "prev" | "next";

const MOBILE_MAX_WIDTH_PX = 760;
const MOBILE_SHOWCASE_REPLACEMENTS: Partial<Record<GenderTab, Record<string, LegacyShowcaseCard>>> = {
  feminino: {
    "genesis-tailored": {
      id: "atelier-bag",
      sku: "atelier-bag",
      name: "Bolsa Atelier em couro estruturado",
      image: "/images/product/atelier-bag-1.jpg",
      secondaryImage: "/images/product/atelier-bag-2.jpg",
      alt: "Bolsa Atelier em couro estruturado",
    },
  },
};

function ShowcaseCard({ product, isClone }: { product: ShowcaseCardProduct; isClone?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isHorizontalRef = useRef<boolean | null>(null);
  const isSwipingRef = useRef(false);

  const images = product.images;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isSwipingRef.current = false;
    isHorizontalRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    if (isHorizontalRef.current === null) {
      const dx = Math.abs(e.touches[0].clientX - touchStartXRef.current);
      const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
      if (dx > 5 || dy > 5) isHorizontalRef.current = dx > dy;
    }
    if (isHorizontalRef.current) e.preventDefault();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (isHorizontalRef.current && Math.abs(deltaX) > 30) {
      isSwipingRef.current = true;
      setActiveIndex((prev) =>
        deltaX < 0 ? Math.min(prev + 1, images.length - 1) : Math.max(prev - 1, 0)
      );
    }
    isHorizontalRef.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isSwipingRef.current) {
      e.preventDefault();
      isSwipingRef.current = false;
    }
  };

  return (
    <article className="category-card" {...(isClone ? { "data-carousel-clone": "true" } : {})}>
      <Link
        href={product.href}
        className="category-media"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="category-image">
          {images.map((src, i) => (
            <Image
              key={src}
              className={`card-media-img${i === activeIndex ? " card-media-img-active" : ""}`}
              src={src}
              alt={i === 0 ? product.alt : `${product.alt} - foto ${i + 1}`}
              width={900}
              height={1200}
              unoptimized
              onError={(event) => {
                const el = event.currentTarget;
                el.onerror = null;
                el.src = product.images[0] ?? "";
              }}
            />
          ))}
        </div>
        {images.length > 1 && (
          <div className="card-dots" aria-hidden="true">
            {images.map((_, i) => (
              <span
                key={i}
                className={`card-dot${i === activeIndex ? " card-dot-active" : i < activeIndex ? " card-dot-done" : ""}`}
              />
            ))}
          </div>
        )}
      </Link>
      <h3>
        <Link href={product.href}>{product.name}</Link>
      </h3>
    </article>
  );
}

function ShowcasePeek({ product, side }: { product: ShowcaseCardProduct; side: CarouselDirection }) {
  const previewImage = product.images[0] || "";

  if (!previewImage) return null;

  return (
    <div className={`mobile-showcase-peek mobile-showcase-peek-${side}`} aria-hidden="true">
      <Image className="mobile-showcase-peek-image" src={previewImage} alt="" width={900} height={1200} unoptimized />
    </div>
  );
}

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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [mobileTransitionDirection, setMobileTransitionDirection] = useState<CarouselDirection>("next");
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

  const visibleProducts = useMemo(() => {
    const baseCards = LEGACY_SHOWCASE_CARDS[renderedTab].map((item) => {
      if (!isMobileViewport) return item;
      const replacement = MOBILE_SHOWCASE_REPLACEMENTS[renderedTab]?.[item.sku];
      return replacement || item;
    });

    return baseCards.map((item) => {
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
      const allImages: string[] = matched
        ? collectProductMedia(matched).slice(0, 5)
        : [pair.primary, pair.secondary].filter(Boolean) as string[];
      const images = allImages.length > 0 ? allImages : [pair.primary].filter(Boolean) as string[];

      const href = `/product/${encodeURIComponent(item.sku || item.id)}`;

      return {
        ...item,
        name: resolvedName,
        images,
        href,
      };
    });
  }, [isMobileViewport, productById, renderedTab]);

  const normalizedActiveCarouselIndex =
    visibleProducts.length > 0 ? Math.min(Math.max(activeCarouselIndex, 0), visibleProducts.length - 1) : 0;
  const activeMobileProduct = visibleProducts[normalizedActiveCarouselIndex] || null;
  const previousMobileProduct =
    visibleProducts.length > 1
      ? visibleProducts[normalizedActiveCarouselIndex === 0 ? visibleProducts.length - 1 : normalizedActiveCarouselIndex - 1]
      : null;
  const nextMobileProduct =
    visibleProducts.length > 1
      ? visibleProducts[normalizedActiveCarouselIndex === visibleProducts.length - 1 ? 0 : normalizedActiveCarouselIndex + 1]
      : null;

  const scrollCarousel = (direction: "prev" | "next") => {
    if (visibleProducts.length === 0) return;
    setMobileTransitionDirection(direction);
    setActiveCarouselIndex((current) => {
      const normalizedCurrent = Math.min(Math.max(current, 0), visibleProducts.length - 1);
      if (direction === "prev") {
        return normalizedCurrent <= 0 ? visibleProducts.length - 1 : normalizedCurrent - 1;
      }
      return normalizedCurrent >= visibleProducts.length - 1 ? 0 : normalizedCurrent + 1;
    });
  };

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

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
    const syncViewport = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  function handleTabChange(nextTab: GenderTab) {
    if (nextTab === activeTab && nextTab === renderedTab && !isSwitching) return;

    setActiveTab(nextTab);
    setActiveCarouselIndex(0);
    setMobileTransitionDirection("next");
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

  const carouselItems = useMemo(() => {
    if (!isMobileViewport) return visibleProducts;
    return activeMobileProduct ? [activeMobileProduct] : [];
  }, [activeMobileProduct, isMobileViewport, visibleProducts]);

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

      <div className="carousel-wrapper">
      <button type="button" className="carousel-nav-btn carousel-nav-prev" onClick={() => scrollCarousel("prev")} aria-label="Anterior">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button type="button" className="carousel-nav-btn carousel-nav-next" onClick={() => scrollCarousel("next")} aria-label="Próximo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      <div className={`category-grid ${isSwitching ? "is-switching" : ""}`} id="categoryGrid">
        {isMobileViewport ? (
          <div className="mobile-showcase-shell">
            {previousMobileProduct ? <ShowcasePeek product={previousMobileProduct} side="prev" /> : null}
            {activeMobileProduct ? (
              <div
                key={`${activeMobileProduct.sku}-${normalizedActiveCarouselIndex}-${mobileTransitionDirection}`}
                className={`mobile-showcase-active mobile-showcase-active-${mobileTransitionDirection}`}
              >
                <ShowcaseCard product={activeMobileProduct} />
              </div>
            ) : null}
            {nextMobileProduct ? <ShowcasePeek product={nextMobileProduct} side="next" /> : null}
            {visibleProducts.length > 1 ? (
              <div className="mobile-showcase-pagination" aria-label="Paginação dos destaques">
                {visibleProducts.map((product, index) => (
                  <button
                    key={product.sku || product.id}
                    type="button"
                    className={`mobile-showcase-dot${index === normalizedActiveCarouselIndex ? " is-active" : ""}`}
                    aria-label={`Ir para item ${index + 1}`}
                    aria-pressed={index === normalizedActiveCarouselIndex}
                    onClick={() => {
                      if (index === normalizedActiveCarouselIndex) return;
                      setMobileTransitionDirection(index < normalizedActiveCarouselIndex ? "prev" : "next");
                      setActiveCarouselIndex(index);
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          carouselItems.map((product, i) => (
            <ShowcaseCard
              key={`${product.sku || product.id}-${i}`}
              product={product}
            />
          ))
        )}
      </div>
      </div>
    </section>
  );
}
