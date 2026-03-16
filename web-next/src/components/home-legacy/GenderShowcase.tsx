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

  const scrollCarousel = (direction: "prev" | "next") => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.children) as HTMLElement[];
    // cards = [clone_last, real_0..real_N, clone_first]
    if (cards.length < 3) return;

    const gridCenter = grid.getBoundingClientRect().left + grid.clientWidth / 2;

    let activeIdx = 0;
    let minDist = Infinity;
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - gridCenter);
      if (d < minDist) { minDist = d; activeIdx = i; }
    });

    const n = cards.length;
    const targetIdx =
      direction === "next"
        ? Math.min(activeIdx + 1, n - 1)
        : Math.max(activeIdx - 1, 0);

    const targetRect = cards[targetIdx].getBoundingClientRect();
    const newLeft = grid.scrollLeft + (targetRect.left + targetRect.width / 2 - gridCenter);
    grid.scrollTo({ left: Math.max(0, newLeft), behavior: "smooth" });

    // After animating to a clone, teleport invisibly to the real counterpart
    if (targetIdx === 0 || targetIdx === n - 1) {
      const teleport = () => {
        const realCard = targetIdx === 0 ? cards[n - 2] : cards[1];
        const gc = grid.getBoundingClientRect().left + grid.clientWidth / 2;
        const r = realCard.getBoundingClientRect();
        grid.style.scrollBehavior = "auto";
        grid.scrollLeft = grid.scrollLeft + (r.left + r.width / 2 - gc);
        window.requestAnimationFrame(() => { grid.style.scrollBehavior = ""; });
      };
      let fallback: number;
      const onEnd = () => { window.clearTimeout(fallback); teleport(); };
      grid.addEventListener("scrollend", onEnd, { once: true });
      fallback = window.setTimeout(() => {
        grid.removeEventListener("scrollend", onEnd);
        teleport();
      }, 500);
    }
  };

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
      // cards[0] is start clone, cards[1] is real first — scroll to center cards[1]
      const cards = Array.from(grid.children) as HTMLElement[];
      const realFirst = cards[1];
      if (!realFirst) { grid.scrollLeft = 0; return; }
      grid.style.scrollBehavior = "auto";
      grid.scrollLeft = Math.max(0, realFirst.offsetLeft + realFirst.offsetWidth / 2 - grid.clientWidth / 2);
      requestAnimationFrame(() => { grid.style.scrollBehavior = ""; });
    };

    resetCarousel();
    const rafId = window.requestAnimationFrame(resetCarousel);
    const timeoutId = window.setTimeout(resetCarousel, 120);
    const timeoutId2 = window.setTimeout(resetCarousel, 400);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.clearTimeout(timeoutId2);
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
  }, [productById, renderedTab]);

  // Infinite loop: prepend clone of last, append clone of first
  const carouselItems = useMemo(
    () =>
      visibleProducts.length === 0
        ? visibleProducts
        : [visibleProducts[visibleProducts.length - 1], ...visibleProducts, visibleProducts[0]],
    [visibleProducts]
  );

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
      <div ref={gridRef} className={`category-grid ${isSwitching ? "is-switching" : ""}`} id="categoryGrid">
        {carouselItems.map((product, i) => (
          <ShowcaseCard
            key={`${product.sku || product.id}-${i}`}
            product={product}
            isClone={carouselItems.length > 1 && (i === 0 || i === carouselItems.length - 1)}
          />
        ))}
      </div>
      </div>
    </section>
  );
}
