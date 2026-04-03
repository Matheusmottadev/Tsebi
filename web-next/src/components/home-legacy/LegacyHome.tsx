"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/types";
import { GenderShowcase } from "@/components/home-legacy/GenderShowcase";
import { LegacyFooter } from "@/components/home-legacy/LegacyFooter";
import { LegacyHero } from "@/components/home-legacy/LegacyHero";
import { NewsletterPopup } from "@/components/home-legacy/NewsletterPopup";
import { SearchOverlayRecommendations } from "@/components/SearchOverlayRecommendations";
import { cartSelectors, useCartStore } from "@/lib/cart/cartStore";
import {
  trackRecommendationCategoryVisit,
  trackRecommendationProductInteraction,
  trackRecommendationSearch,
} from "@/lib/recommendationSignals";
import { startSearchPlaceholderRotator } from "@/lib/searchPlaceholderRotator";
import { getMe } from "@/services/auth";
import { searchProductsDetailed, trackSearchEvent } from "@/services/products";
import { buildHoverImagePair, collectProductMedia } from "@/lib/product-media";

type LegacyHomeProps = {
  products: Product[];
};

type HomeProductCard = Pick<Product, "id" | "sku" | "name" | "image" | "secondaryImage">;
type HomeCarouselProduct = {
  id: string;
  sku: string;
  name: string;
  images: string[];
  href: string;
};
type CarouselDirection = "prev" | "next";

type SearchPiece = {
  id: string;
  sku: string;
  name: string;
  image: string;
  secondaryImage?: string;
  href: string;
};

const TOP_MESSAGES = [
  "Nova Coleção Genesis",
  "Você merece vestir algo a sua altura.",
  "Cadastre-se para receber lançamentos",
  "Exclusividade para quem valoriza o que é único.",
  "Excelência garantida. Reparos por 1 ano.",
  "Produção em pequena escala. Qualidade em cada detalhe.",
];

const SEARCH_CHIPS = [
  "NOVIDADE PARA HOMENS",
  "NOVIDADE PARA MULHERES",
  "BOLSAS FEMININAS",
  "VESTIDOS",
  "JAQUETAS",
  "TENIS",
  "Acessórios",
];


const SEARCH_CATEGORIES = ["Feminino", "Masculino", "Calças", "Camisas", "Bolsas"] as const;
const MENU_NAV_ITEMS = ["Novidades", "Presentes", "Feminino", "Masculino", "Bolsas e Acessórios", "Seleção Tsebi"] as const;
const MENU_NOVIDADES_GALLERY_ITEMS = [
  { name: "Origem Shirt", image: "/images/product/origem-shirt-1.jpg", href: "/product/origem-shirt" },
  { name: "Genesis Bomber", image: "/images/product/genesis-bomber-1.jpg", href: "/product/genesis-bomber" },
  { name: "Essence Trousers", image: "/images/product/essence-trousers-1.jpg", href: "/product/essence-trousers" },
  { name: "Origem Skirt", image: "/images/product/origem-skirt-1.jpg", href: "/product/origem-skirt" },
] as const;
const MENU_PRESENTES_GALLERY_ITEMS = [
  { name: "Atelier Bag", image: "/images/product/atelier-bag-1.jpg", href: "/product/atelier-bag" },
  { name: "Atelier Heels", image: "/images/product/atelier-heels-1.jpg", href: "/product/atelier-heels" },
  { name: "Noir Sneaker", image: "/images/product/noir-sneaker-1.jpg", href: "/product/noir-sneaker" },
  { name: "Noir Dress", image: "/images/product/noir-dress-1.jpg", href: "/product/noir-dress" },
] as const;
const MENU_FEMININO_CATEGORIES = [
  {
    title: "Ready-to-Wear",
    items: ["Vestidos", "Camisetas", "Camisas", "Calças", "Saias"],
  },
  {
    title: "Outerwear",
    items: ["Casacos", "Jaquetas"],
  },
  {
    title: "Leather",
    items: ["Jaquetas de couro", "Calças de couro", "Saias de couro"],
  },
  {
    title: "Accessories",
    items: ["Cintos", "Bolsas", "Lenços"],
  },
] as const;
const MENU_MASCULINO_CATEGORIES = [
  {
    title: "Ready-to-Wear",
    items: ["Camisetas", "Camisas", "Calças", "Bermudas"],
  },
  {
    title: "Outerwear",
    items: ["Jaquetas", "Casacos"],
  },
  {
    title: "Leather",
    items: ["Jaquetas de couro", "Calças de couro"],
  },
  {
    title: "Accessories",
    items: ["Cintos", "Bolsas"],
  },
] as const;

function buildProductsMenuHref(gender: "Feminino" | "Masculino", category?: string, subcategory?: string): string {
  const params = new URLSearchParams();
  params.set("gender", gender);
  if (category) params.set("category", category);
  if (subcategory) params.set("subcategory", subcategory);
  return `/products?${params.toString()}`;
}

function buildAccessoriesMenuHref(options?: {
  subcategory?: string;
  sort?: string;
  isFeatured?: boolean;
  query?: string;
}): string {
  const params = new URLSearchParams();
  params.set("category", "Accessories");
  if (options?.subcategory) params.set("subcategory", options.subcategory);
  if (options?.sort) params.set("sort", options.sort);
  if (options?.isFeatured) params.set("isFeatured", "true");
  if (options?.query) params.set("q", options.query);
  return `/products?${params.toString()}`;
}

const MENU_SELECAO_TSEBI_LOOK = {
  heroImage: "https://media.tsebi.com.br/generation-57e63375-48cf-4bbf-a7b9-22ce3f1b5a6a.png",
  title: "Seleção Tsebi",
  subtitle: "Uma curadoria semanal com peças que representam a essência da marca.",
  products: [
    {
      id: "genesis-bomber",
      name: "Genesis Bomber",
      priceLabel: "R$ 2.990",
      unitAmount: 299000,
      currency: "brl",
      image: "/images/product/genesis-bomber-1.jpg",
      href: "/product/genesis-bomber",
    },
    {
      id: "origem-shirt",
      name: "Origem Shirt",
      priceLabel: "R$ 590",
      unitAmount: 59000,
      currency: "brl",
      image: "/images/product/origem-shirt-1.jpg",
      href: "/product/origem-shirt",
    },
    {
      id: "essence-trousers",
      name: "Essence Trousers",
      priceLabel: "R$ 1.490",
      unitAmount: 149000,
      currency: "brl",
      image: "/images/product/essence-trousers-1.jpg",
      href: "/product/essence-trousers",
    },
    {
      id: "atelier-bag",
      name: "Atelier Bag",
      priceLabel: "R$ 3.490",
      unitAmount: 349000,
      currency: "brl",
      image: "/images/product/atelier-bag-1.jpg",
      href: "/product/atelier-bag",
    },
  ],
} as const;
const COLLECTION_DROP_IMAGE = "https://media.tsebi.com.br/generation-6393ea28-757e-45d6-ab49-4dfed1ba1a87.png";
const COLLECTION_PLACEHOLDER = "/images/hero.jpg";
const HOMEPAGE_PICTURE_IMAGE = "https://media.tsebi.com.br/generation-57e63375-48cf-4bbf-a7b9-22ce3f1b5a6a.png";
const HOMEPAGE_PICTURE_FALLBACK = "/images/hero.jpg";
const MOBILE_MAX_WIDTH_PX = 760;

const HOMEPAGE_CATEGORIES = [
  {
    href: "/products?q=Feminino",
    image: "/images/product/origem-skirt-1.jpg",
    secondaryImage: "/images/product/origem-skirt-2.jpg",
    fallbackImage: "/images/product/origem-skirt-1.jpg",
    alt: "Categoria Feminino",
    label: "Feminino",
  },
  {
    href: "/products?q=Masculino",
    image: "/images/product/origem-shirt-1.jpg",
    secondaryImage: "/images/product/origem-shirt-2.jpg",
    fallbackImage: "/images/product/origem-shirt-1.jpg",
    alt: "Categoria Masculino",
    label: "Masculino",
  },
  {
    href: "/products?q=Carteiras+Masculinas",
    image: "/images/product/atelier-bag-1.jpg",
    secondaryImage: "/images/product/atelier-bag-2.jpg",
    fallbackImage: "/images/product/atelier-bag-1.jpg",
    alt: "Categoria Carteiras Masculinas",
    label: "Carteiras Masculinas",
    desktopOnly: true,
  },
  {
    href: "/products?q=Vestidos",
    image: "/images/product/noir-dress-1.jpg",
    secondaryImage: "/images/product/noir-dress-2.jpg",
    fallbackImage: "/images/product/noir-dress-1.jpg",
    alt: "Categoria Vestidos",
    label: "Vestidos",
  },
  {
    href: "/products?q=Cal%C3%A7as",
    image: "/images/product/essence-trousers-1.jpg",
    secondaryImage: "/images/product/essence-trousers-2.jpg",
    fallbackImage: "/images/product/essence-trousers-1.jpg",
    alt: "Categoria Calças",
    label: "Calças",
  },
  {
    href: "/products?q=Carteiras+Femininas",
    image: "/images/product/atelier-heels-1.jpg",
    secondaryImage: "/images/product/atelier-heels-2.jpg",
    fallbackImage: "/images/product/atelier-heels-1.jpg",
    alt: "Categoria Carteiras Femininas",
    label: "Carteiras Femininas",
    desktopOnly: true,
  },
  {
    href: "/products?q=Jaquetas",
    image: "/images/product/genesis-bomber-1.jpg",
    secondaryImage: "/images/product/genesis-bomber-2.jpg",
    fallbackImage: "/images/product/genesis-bomber-1.jpg",
    alt: "Categoria Jaquetas",
    label: "Jaquetas",
  },
  {
    href: "/products?q=Acess%C3%B3rios",
    image: "/images/product/noir-sneaker-1.jpg",
    secondaryImage: "/images/product/noir-sneaker-2.jpg",
    fallbackImage: "/images/product/noir-sneaker-1.jpg",
    alt: "Categoria Acessórios",
    label: "Acessórios",
  },
] as const;

const FALLBACK_POPULAR_PRODUCTS: HomeProductCard[] = [
  { id: "origem-skirt", sku: "origem-skirt", name: "Origem Skirt", image: "/images/product/origem-skirt-1.jpg", secondaryImage: "/images/product/origem-skirt-2.jpg" },
  { id: "genesis-tailored", sku: "genesis-tailored", name: "Genesis Tailored", image: "/images/product/genesis-tailored-1.jpg", secondaryImage: "/images/product/genesis-tailored-2.jpg" },
  { id: "atelier-heels", sku: "atelier-heels", name: "Atelier Heels", image: "/images/product/atelier-heels-1.jpg", secondaryImage: "/images/product/atelier-heels-2.jpg" },
  { id: "essence-blazer", sku: "essence-blazer", name: "Essence Blazer", image: "/images/product/essence-blazer-1.jpg", secondaryImage: "/images/product/essence-blazer-2.jpg" },
  { id: "noir-dress", sku: "noir-dress", name: "Noir Dress", image: "/images/product/noir-dress-1.jpg", secondaryImage: "/images/product/noir-dress-2.jpg" },
];

const FALLBACK_SEARCH_PIECES: SearchPiece[] = [
  { id: "origem-skirt", sku: "origem-skirt", name: "Sabrina charmosa", image: "/images/product/origem-skirt-1.jpg", secondaryImage: "/images/product/origem-skirt-2.jpg", href: "/product/origem-skirt" },
  { id: "origem-shirt", sku: "origem-shirt", name: "Sabrina linda", image: "/images/product/origem-shirt-1.jpg", secondaryImage: "/images/product/origem-shirt-2.jpg", href: "/product/origem-shirt" },
  {
    id: "genesis-tailored",
    sku: "genesis-tailored",
    name: "Sabrina maravilhosa",
    image: "/images/product/genesis-tailored-1.jpg",
    secondaryImage: "/images/product/genesis-tailored-2.jpg",
    href: "/product/genesis-tailored",
  },
  { id: "genesis-bomber", sku: "genesis-bomber", name: "Sabrina incrível", image: "/images/placeholderreal.webp", secondaryImage: "/images/placeholderreal.webp", href: "/product/genesis-bomber" },
];

function normalizeProducts(products: Product[]): Product[] {
  return (Array.isArray(products) ? products : [])
    .map((product) => {
      const normalizedId = String(product?.id || product?.sku || "").trim();
      const normalizedSku = String(product?.sku || product?.id || "").trim();
      return { ...product, id: normalizedId, sku: normalizedSku };
    })
    .filter((product) => {
      const id = String(product?.id || product?.sku || "").trim();
    const hasName = Boolean(String(product?.name || "").trim());
    return Boolean(id) && hasName;
  });
}

function resolveProductHref(product: HomeProductCard): string | null {
  const sku = String(product.sku || product.id || "").trim();
  if (!sku) return null;
  return `/product/${encodeURIComponent(sku)}`;
}

function resolveProductImageSrc(product: HomeProductCard): string {
  const raw = String(product.image || "").trim();
  if (!raw) return COLLECTION_PLACEHOLDER;
  if (raw === "/" || raw === "." || raw === "#") return COLLECTION_PLACEHOLDER;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/images/")) return raw;
  if (raw.startsWith("/")) return raw.length > 1 ? raw : COLLECTION_PLACEHOLDER;

  const clean = raw.replace(/^\.?\//, "");
  if (clean.startsWith("images/")) return `/${clean}`;
  if (clean.startsWith("produtos/")) return `/images/${clean}`;
  return `/${clean}`;
}

function mapProductToSearchPiece(product: HomeProductCard): SearchPiece | null {
  const href = resolveProductHref(product);
  if (!href) return null;
  const pair = buildHoverImagePair(product);
  return {
    id: String(product.id || product.sku),
    sku: String(product.sku || product.id),
    name: String(product.name || "Produto TSEBI"),
    image: pair.primary || resolveProductImageSrc(product),
    secondaryImage: pair.secondary || resolveProductImageSrc(product),
    href
  };
}

function PopularCarouselCard({ product }: { product: HomeCarouselProduct }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isHorizontalRef = useRef<boolean | null>(null);
  const isSwipingRef = useRef(false);

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
        deltaX < 0 ? Math.min(prev + 1, product.images.length - 1) : Math.max(prev - 1, 0)
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
    <article className="category-card">
      <Link
        href={product.href}
        className="category-media"
        prefetch={false}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="category-image">
          {product.images.map((src, i) => (
            <Image
              key={src}
              className={`card-media-img${i === activeIndex ? " card-media-img-active" : ""}`}
              src={src}
              alt={i === 0 ? product.name : `${product.name} - foto ${i + 1}`}
              width={900}
              height={1200}
              unoptimized
              onError={(event) => {
                const element = event.currentTarget;
                element.onerror = null;
                element.src = product.images[0] ?? COLLECTION_PLACEHOLDER;
              }}
            />
          ))}
        </div>
        {product.images.length > 1 ? (
          <div className="card-dots" aria-hidden="true">
            {product.images.map((_, i) => (
              <span
                key={i}
                className={`card-dot${i === activeIndex ? " card-dot-active" : i < activeIndex ? " card-dot-done" : ""}`}
              />
            ))}
          </div>
        ) : null}
      </Link>
      <h3>
        <Link href={product.href} prefetch={false}>
          {product.name}
        </Link>
      </h3>
    </article>
  );
}

function PopularCarouselPeek({ product, side }: { product: HomeCarouselProduct; side: CarouselDirection }) {
  const previewImage = product.images[0] || COLLECTION_PLACEHOLDER;
  return (
    <div className={`mobile-showcase-peek mobile-showcase-peek-${side}`} aria-hidden="true">
      <Image className="mobile-showcase-peek-image" src={previewImage} alt="" width={900} height={1200} unoptimized />
    </div>
  );
}


export function LegacyHome({ products }: LegacyHomeProps) {
  const router = useRouter();
  const hasHydrated = useCartStore(cartSelectors.hasHydrated);
  const itemCount = useCartStore(cartSelectors.itemCount);
  const addItem = useCartStore((state) => state.addItem);
  const displayCount = hasHydrated ? itemCount : 0;
  const cartCountBadge = displayCount > 0 ? String(displayCount) : undefined;
  const [messageIndex, setMessageIndex] = useState(0);
  const [messageClass, setMessageClass] = useState("slide-right");
  const [messageKey, setMessageKey] = useState(0);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const [isLogoCycleImage, setIsLogoCycleImage] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuNavPanelOpen, setIsMenuNavPanelOpen] = useState(false);
  const [activeMenuNavPanel, setActiveMenuNavPanel] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selecaoFeedback, setSelecaoFeedback] = useState("");
  const [searchResults, setSearchResults] = useState<SearchPiece[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [didYouMeanQuery, setDidYouMeanQuery] = useState<string | null>(null);
  const [zeroResultCurated, setZeroResultCurated] = useState<SearchPiece[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchRequest, setHasSearchRequest] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [activePopularCarouselIndex, setActivePopularCarouselIndex] = useState(0);
  const [popularTransitionDirection, setPopularTransitionDirection] = useState<CarouselDirection>("next");
  const wishlistTarget = "/account#wishlist";
  const wishlistHref = isAuthenticated
    ? wishlistTarget
    : `/login?returnUrl=${encodeURIComponent(wishlistTarget)}`;
  const logoCycleTimerRef = useRef<number | null>(null);
  const leftArrowRef = useRef<HTMLButtonElement | null>(null);
  const rightArrowRef = useRef<HTMLButtonElement | null>(null);
  const openMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const headerMenuRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchDialogRef = useRef<HTMLElement | null>(null);
  const searchCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchPlaceholderCurrentRef = useRef<HTMLSpanElement | null>(null);
  const searchPlaceholderNextRef = useRef<HTMLSpanElement | null>(null);
  const searchPlaceholderTrackRef = useRef<HTMLSpanElement | null>(null);
  const lastTrackedZeroQueryRef = useRef<string>("");

  const safeProducts = useMemo(() => normalizeProducts(products), [products]);
  const currentMessage = useMemo(() => TOP_MESSAGES[messageIndex] || TOP_MESSAGES[0], [messageIndex]);

  const popularProducts = useMemo<HomeProductCard[]>(() => {
    if (safeProducts.length === 0) return FALLBACK_POPULAR_PRODUCTS;
    return safeProducts.slice(0, 5);
  }, [safeProducts]);

  const productBySku = useMemo(() => {
    const bySku = new Map<string, Product>();
    safeProducts.forEach((product) => {
      const sku = String(product.sku || product.id || "").trim();
      if (!sku) return;
      bySku.set(sku, product);
    });
    return bySku;
  }, [safeProducts]);

  const popularCarouselProducts = useMemo<HomeCarouselProduct[]>(() => {
    return popularProducts
      .map((product) => {
        const href = resolveProductHref(product);
        if (!href) return null;
        const fullProduct = productBySku.get(String(product.sku || product.id || "").trim());
        const images = collectProductMedia(fullProduct || product).slice(0, 5);

        return {
          id: String(product.id || product.sku),
          sku: String(product.sku || product.id),
          name: String(product.name || "Produto TSEBI"),
          images: images.length > 0 ? images : [COLLECTION_PLACEHOLDER],
          href,
        };
      })
      .filter(Boolean) as HomeCarouselProduct[];
  }, [popularProducts, productBySku]);

  const normalizedPopularCarouselIndex =
    popularCarouselProducts.length > 0
      ? Math.min(Math.max(activePopularCarouselIndex, 0), popularCarouselProducts.length - 1)
      : 0;
  const activePopularMobileProduct = popularCarouselProducts[normalizedPopularCarouselIndex] || null;
  const previousPopularMobileProduct =
    popularCarouselProducts.length > 1
      ? popularCarouselProducts[
          normalizedPopularCarouselIndex === 0 ? popularCarouselProducts.length - 1 : normalizedPopularCarouselIndex - 1
        ]
      : null;
  const nextPopularMobileProduct =
    popularCarouselProducts.length > 1
      ? popularCarouselProducts[
          normalizedPopularCarouselIndex === popularCarouselProducts.length - 1 ? 0 : normalizedPopularCarouselIndex + 1
        ]
      : null;

  const searchTopPieces = useMemo<SearchPiece[]>(() => {
    if (safeProducts.length === 0) return FALLBACK_SEARCH_PIECES;

    const mapped: SearchPiece[] = [];
    for (const product of safeProducts.slice(0, 4)) {
      const href = resolveProductHref(product);
      if (!href) continue;
      const pair = buildHoverImagePair(product);
      mapped.push({
        id: String(product.id || product.sku),
        sku: String(product.sku || product.id),
        name: String(product.name || "Produto TSEBI"),
        image: pair.primary || resolveProductImageSrc(product),
        secondaryImage: pair.secondary || resolveProductImageSrc(product),
        href,
      });
    }

    return mapped.length > 0 ? mapped : FALLBACK_SEARCH_PIECES;
  }, [safeProducts]);

  const searchCuratedPieces = useMemo<SearchPiece[]>(() => {
    if (safeProducts.length === 0) {
      return [...FALLBACK_SEARCH_PIECES, ...FALLBACK_SEARCH_PIECES].slice(0, 8);
    }

    const mapped: SearchPiece[] = [];
    for (const product of safeProducts.slice(4, 12)) {
      const href = resolveProductHref(product);
      if (!href) continue;
      const pair = buildHoverImagePair(product);
      mapped.push({
        id: String(product.id || product.sku),
        sku: String(product.sku || product.id),
        name: String(product.name || "Produto TSEBI"),
        image: pair.primary || resolveProductImageSrc(product),
        secondaryImage: pair.secondary || resolveProductImageSrc(product),
        href,
      });
    }

    if (mapped.length >= 4) return mapped;
    return [...mapped, ...searchTopPieces].slice(0, 8);
  }, [safeProducts, searchTopPieces]);

  const animateArrow = useCallback((direction: "left" | "right") => {
    const button = direction === "right" ? rightArrowRef.current : leftArrowRef.current;
    if (!button || typeof button.animate !== "function") return;

    const dist = direction === "right" ? 14 : -14;
    button.getAnimations().forEach((animation) => animation.cancel());
    button.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${dist}px)` }, { transform: "translateX(0)" }],
      { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  }, []);

  const stepTopMessage = useCallback((direction: "left" | "right", delta: number) => {
    setMessageClass(direction === "left" ? "slide-left" : "slide-right");
    setMessageIndex((current) => (current + delta + TOP_MESSAGES.length) % TOP_MESSAGES.length);
    setMessageKey((current) => current + 1);
    animateArrow(direction);
  }, [animateArrow]);

  useEffect(() => {
    let isMounted = true;

    async function loadAuthState() {
      try {
        const user = await getMe({ cache: "no-store" });
        if (!isMounted) return;
        setIsAuthenticated(Boolean(user));
      } catch {
        if (!isMounted) return;
      }
    }

    loadAuthState();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let timer = window.setInterval(() => {
      stepTopMessage("right", 1);
    }, 4000);

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearInterval(timer);
      } else {
        timer = window.setInterval(() => {
          stepTopMessage("right", 1);
        }, 4000);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [stepTopMessage]);

  useEffect(() => {
    document.body.classList.add("home-page");
    setHasMounted(true);
    return () => {
      document.body.classList.remove("home-page");
    };
  }, []);

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

  useEffect(() => {
    if (document.body.classList.contains("processos-page")) return;

    function startLogoCycle() {
      if (logoCycleTimerRef.current !== null) return;
      logoCycleTimerRef.current = window.setInterval(() => {
        setIsLogoCycleImage((current) => !current);
      }, 2400);
    }

    function stopLogoCycle() {
      if (logoCycleTimerRef.current !== null) {
        window.clearInterval(logoCycleTimerRef.current);
        logoCycleTimerRef.current = null;
      }
      setIsLogoCycleImage(false);
    }

    function syncHeaderState() {
      const rootStyles = window.getComputedStyle(document.documentElement);
      const headerHeight = Number.parseInt(rootStyles.getPropertyValue("--header-height"), 10) || 84;
      const threshold = Math.max(24, Math.round(headerHeight * 0.75));
      const scrolled = window.scrollY > threshold;
      setIsHeaderScrolled(scrolled);

      if (scrolled) {
        startLogoCycle();
      } else {
        stopLogoCycle();
      }
    }

    const rafId = window.requestAnimationFrame(syncHeaderState);
    window.addEventListener("scroll", syncHeaderState, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", syncHeaderState);
      if (logoCycleTimerRef.current !== null) {
        window.clearInterval(logoCycleTimerRef.current);
        logoCycleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", isMenuOpen);
    document.documentElement.classList.toggle("menu-open", isMenuOpen);
    if (!isMenuOpen) {
      setIsMenuNavPanelOpen(false);
      setActiveMenuNavPanel(null);
    }
    return () => {
      document.body.classList.remove("menu-open");
      document.documentElement.classList.remove("menu-open");
    };
  }, [isMenuOpen]);

  useEffect(() => {
    setActivePopularCarouselIndex(0);
    setPopularTransitionDirection("next");
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (headerMenuRef.current?.contains(target)) return;
      if (openMenuButtonRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    }

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [isMenuOpen]);

  useEffect(() => {
    document.body.classList.toggle("no-scroll", isSearchOpen);
    document.documentElement.classList.toggle("no-scroll", isSearchOpen);
    return () => {
      document.body.classList.remove("no-scroll");
      document.documentElement.classList.remove("no-scroll");
    };
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const currentWordEl = searchPlaceholderCurrentRef.current;
    const nextWordEl = searchPlaceholderNextRef.current;
    const trackEl = searchPlaceholderTrackRef.current;
    if (!currentWordEl || !nextWordEl || !trackEl) return;

    return startSearchPlaceholderRotator({
      currentWordEl,
      nextWordEl,
      trackEl,
      intervalMs: 1500,
      durationMs: 400,
    });
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsSearchOpen(false);
        setSearchQuery("");
        return;
      }

      if (event.key !== "Tab") return;
      const container = searchDialogRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSearchOpen]);

  const openSearchOverlay = useCallback(() => {
    setIsMenuOpen(false);
    setIsMenuNavPanelOpen(false);
    setActiveMenuNavPanel(null);
    setIsContactPanelOpen(false);
    setIsSearchOpen(true);
  }, []);

  const closeSearchOverlay = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchSuggestions([]);
    setDidYouMeanQuery(null);
    setZeroResultCurated([]);
    setIsSearching(false);
    setHasSearchRequest(false);
  }, []);

  const openHeaderMenu = useCallback(() => {
    setIsSearchOpen(false);
    setIsContactPanelOpen(false);
    setIsMenuOpen(true);
    setIsMenuNavPanelOpen(false);
    setActiveMenuNavPanel(null);
  }, []);

  const scrollPopularCarousel = useCallback((direction: CarouselDirection) => {
    if (popularCarouselProducts.length === 0) return;
    setPopularTransitionDirection(direction);
    setActivePopularCarouselIndex((current) => {
      const normalizedCurrent = Math.min(Math.max(current, 0), popularCarouselProducts.length - 1);
      if (direction === "prev") {
        return normalizedCurrent <= 0 ? popularCarouselProducts.length - 1 : normalizedCurrent - 1;
      }
      return normalizedCurrent >= popularCarouselProducts.length - 1 ? 0 : normalizedCurrent + 1;
    });
  }, [popularCarouselProducts.length]);

  const handleMenuNavPanelOpen = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    const link = event.currentTarget;
    const href = String(link.getAttribute("href") || "").trim();
    if (href && href !== "#") return;

    event.preventDefault();
    const key = String(link.dataset.menuPanel || "").trim();
    if (!key) return;
    setActiveMenuNavPanel(key);
    setIsMenuNavPanelOpen(true);
  }, []);

  const handleSearchChipClick = useCallback((label: string) => {
    trackRecommendationSearch(label);
    void trackSearchEvent({
      type: "suggestion_click",
      query: String(searchQuery || "").trim(),
      suggestion: String(label || "").trim(),
      source: "search_chip"
    }).catch(() => {});
    setSearchQuery(String(label || "").trim());
    const input = searchInputRef.current;
    if (!input) return;
    input.focus();
  }, [searchQuery]);

  const submitSearchPage = useCallback((nextQuery?: string) => {
    const normalized = String(typeof nextQuery === "string" ? nextQuery : searchQuery || "").trim();
    if (normalized.length < 2) return;
    trackRecommendationSearch(normalized);
    router.push(`/products?q=${encodeURIComponent(normalized)}`);
    closeSearchOverlay();
  }, [closeSearchOverlay, router, searchQuery]);

  const handleMenuProductsLinkClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      event.preventDefault();
      setIsMenuOpen(false);
      setIsMenuNavPanelOpen(false);
      setActiveMenuNavPanel(null);
      router.push(href);
    },
    [router]
  );

  const handleAddSelecaoLook = useCallback((event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    const results = MENU_SELECAO_TSEBI_LOOK.products.map((product) =>
      addItem({
        item: {
          productId: product.id,
          name: product.name,
          unitAmount: product.unitAmount,
          currency: product.currency,
          imageUrl: product.image,
        },
        qty: 1,
      })
    );
    const hasError = results.some((result) => !result.ok);
    setSelecaoFeedback(hasError ? "Não foi possível adicionar todos os itens." : "Look completo adicionado ao carrinho.");
    setIsMenuOpen(false);
    setIsMenuNavPanelOpen(false);
    setActiveMenuNavPanel(null);
    window.setTimeout(() => setSelecaoFeedback(""), 1800);
  }, [addItem]);

  const handleAddSelecaoItem = useCallback(
    (product: (typeof MENU_SELECAO_TSEBI_LOOK.products)[number]) => {
      const result = addItem({
        item: {
          productId: product.id,
          name: product.name,
          unitAmount: product.unitAmount,
          currency: product.currency,
          imageUrl: product.image,
        },
        qty: 1,
      });
      setSelecaoFeedback(result.ok ? `${product.name} adicionado ao carrinho.` : result.error || "Não foi possível adicionar o item.");
      window.setTimeout(() => setSelecaoFeedback(""), 1500);
    },
    [addItem]
  );

  useEffect(() => {
    if (!isSearchOpen) return;

    const normalized = String(searchQuery || "").trim();
    if (normalized.length < 2) {
      setSearchResults([]);
      setSearchSuggestions([]);
      setDidYouMeanQuery(null);
      setZeroResultCurated([]);
      setIsSearching(false);
      setHasSearchRequest(false);
      return;
    }

    let canceled = false;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await searchProductsDetailed(normalized, { limit: 8, page: 1, sort: "relevance", inStock: true });
        if (canceled) return;
        const mapped = response.products.map((product) => mapProductToSearchPiece(product)).filter(Boolean) as SearchPiece[];
        const curated = (response.curatedProducts || [])
          .map((product) => mapProductToSearchPiece(product))
          .filter(Boolean) as SearchPiece[];

        setSearchResults(mapped);
        setSearchSuggestions(Array.isArray(response.suggestions) ? response.suggestions.slice(0, 6) : []);
        setDidYouMeanQuery(response.suggestedQuery ? String(response.suggestedQuery) : null);
        setZeroResultCurated(curated);

        void trackSearchEvent({
          type: "search_view",
          query: normalized,
          resultsCount: mapped.length,
          source: "overlay_search"
        }).catch(() => {});

        if (mapped.length === 0 && lastTrackedZeroQueryRef.current !== normalized) {
          lastTrackedZeroQueryRef.current = normalized;
          void trackSearchEvent({
            type: "zero_result",
            query: normalized,
            resultsCount: 0,
            source: "overlay_search"
          }).catch(() => {});
        }
      } catch {
        if (canceled) return;
        setSearchResults([]);
        setSearchSuggestions([]);
        setDidYouMeanQuery(null);
        setZeroResultCurated([]);
      } finally {
        if (canceled) return;
        setHasSearchRequest(true);
        setIsSearching(false);
      }
    }, 220);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [isSearchOpen, searchQuery]);

  const searchResultsToRender = useMemo(() => {
    const normalized = String(searchQuery || "").trim();
    if (normalized.length < 2) return searchTopPieces;
    return searchResults;
  }, [searchQuery, searchResults, searchTopPieces]);

  const zeroStateToRender = useMemo(() => {
    if (zeroResultCurated.length > 0) return zeroResultCurated;
    return searchCuratedPieces.slice(0, 8);
  }, [zeroResultCurated, searchCuratedPieces]);

  const searchSectionTitle = useMemo(() => {
    const normalized = String(searchQuery || "").trim();
    if (normalized.length < 2) return "PRINCIPAIS PEÇAS";
    if (isSearching) return "BUSCANDO...";
    return "RESULTADOS";
  }, [searchQuery, isSearching]);

  const handleDidYouMeanClick = useCallback((value: string) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    trackRecommendationSearch(normalized);
    void trackSearchEvent({
      type: "did_you_mean_click",
      query: String(searchQuery || "").trim(),
      suggestion: normalized,
      source: "overlay_search"
    }).catch(() => {});
    setSearchQuery(normalized);
    const input = searchInputRef.current;
    if (input) input.focus();
  }, [searchQuery]);

  const handleResultClick = useCallback((piece: SearchPiece, position: number) => {
    const matched = productBySku.get(String(piece.sku || "").trim());
    trackRecommendationProductInteraction({
      sku: piece.sku,
      category: matched?.category || "",
      priceValue: matched?.priceValue || 0,
      viewed: true
    });
    void trackSearchEvent({
      type: "result_click",
      query: String(searchQuery || "").trim(),
      productSku: piece.sku,
      position,
      source: "overlay_search"
    }).catch(() => {});
  }, [productBySku, searchQuery]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      setIsSearchOpen(false);
      setIsContactPanelOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isContactPanelOpen) return;
    const panelInner = document.querySelector(".header-contact-panel-inner");
    if (!(panelInner instanceof HTMLElement)) return;
    panelInner.scrollTop = 0;
  }, [isContactPanelOpen]);

  return (
    <div className="home-legacy-shell">
      <div className="top-bar">
        <div className="top-wrapper">
          <button
            className="arrow left"
            type="button"
            ref={leftArrowRef}
            onClick={() => stepTopMessage("left", -1)}
            aria-label="Mensagem anterior"
          >
            &#10094;
          </button>
          <div id="topMessage" className={`top-message ${messageClass}`} key={messageKey}>
            {currentMessage}
          </div>
          <button
            className="arrow right"
            type="button"
            ref={rightArrowRef}
            onClick={() => stepTopMessage("right", 1)}
            aria-label="Próxima mensagem"
          >
            &#10095;
          </button>
        </div>
      </div>

      <header className={`home-header${isHeaderScrolled ? " is-scrolled" : ""}${isLogoCycleImage ? " logo-cycle-image" : ""}`}>
        <div className="header-row">
          <div className="header-left">
            <button
              className="menu-toggle"
              id="openHeaderMenu"
              type="button"
              ref={openMenuButtonRef}
              aria-label="Abrir menu"
              onClick={openHeaderMenu}
            >
              <span />
              <span />
              <span />
            </button>
            <button
              type="button"
              className="header-search-trigger"
              aria-label="Abrir busca"
              onClick={openSearchOverlay}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M20 20l-4.2-4.2"></path>
              </svg>
            </button>

          </div>

          <h1 className="logo">
            <Link className="logo-center-link" href="/" prefetch={false}>
              <span className="logo-center-text">TSEBI</span>
              <Image className="logo-center-image" src="/images/logo-tsebi.png" alt="Logo TSEBI" width={120} height={120} />
            </Link>
          </h1>

          <div className="header-right">
            <button
              type="button"
              className="quick-action-contact"
              aria-label="Fale Conosco"
              onClick={() => {
                setIsMenuOpen(false);
                setIsMenuNavPanelOpen(false);
                setActiveMenuNavPanel(null);
                setIsSearchOpen(false);
                setIsContactPanelOpen(true);
              }}
            >
              Fale Conosco
            </button>
            <Link className="quick-action" href={isAuthenticated ? "/account" : "/login"} aria-label="Conta" prefetch={false}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 21a8 8 0 0 0-16 0"></path>
                <circle cx="12" cy="8" r="4"></circle>
              </svg>
            </Link>
            <Link
              className="quick-action cart-link"
              href="/cart"
              aria-label={`Carrinho (${displayCount})`}
              data-cart-count={cartCountBadge}
              prefetch={false}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7h10l1 12H6L7 7z"></path>
                <path d="M9 7V6a3 3 0 1 1 6 0v1"></path>
              </svg>
            </Link>

          </div>
        </div>
      </header>

      <button
        type="button"
        className={`home-legacy-menu-backdrop ${isMenuOpen ? "is-open" : ""}`}
        aria-label="Fechar menu"
        onClick={() => setIsMenuOpen(false)}
      />

      <button
        type="button"
        className={`header-contact-backdrop ${isContactPanelOpen ? "is-open" : ""}`}
        aria-label="Fechar Fale Conosco"
        onClick={() => setIsContactPanelOpen(false)}
      />

      <aside className={`header-contact-panel ${isContactPanelOpen ? "is-open" : ""}`} aria-hidden={!isContactPanelOpen}>
        <div className="header-contact-panel-inner">
          <div className="header-contact-panel-handle" aria-hidden="true" />
          <div className="header-contact-panel-head">
            <h2>Fale Conosco</h2>
            <button
              type="button"
              className="header-contact-panel-close"
              aria-label="Fechar"
              onClick={() => setIsContactPanelOpen(false)}
            >
              &times;
            </button>
          </div>

          <p className="header-contact-panel-copy">
            A equipe de consultores da Tsebi está à sua disposição. Com atendimento dedicado e discreto, oferecemos
            orientação na escolha das peças e acesso a informações sobre materiais, coleções e disponibilidade.
          </p>

          <nav className="header-contact-panel-links" aria-label="Canais de atendimento">
            <a href="tel:+5511918596632" className="header-contact-panel-link">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="7" y="2.5" width="10" height="19" rx="2"></rect>
                <path d="M11 18.2h2"></path>
              </svg>
              +55 (11) 91859-6632
            </a>
            <a href="mailto:Contato@tsebi.com.br" className="header-contact-panel-link">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="6" width="18" height="12" rx="1.5"></rect>
                <path d="M4.5 7.5L12 13l7.5-5.5"></path>
              </svg>
              Envie um email
            </a>
            <a
              href="https://wa.me/5511918596632"
              target="_blank"
              rel="noopener noreferrer"
              className="header-contact-panel-link"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4.8a7.2 7.2 0 0 0-6.2 10.9"></path>
                <path d="M5.8 15.7L4.9 19l3.2-.9"></path>
                <path d="M8.1 18.1A7.2 7.2 0 1 0 12 4.8"></path>
                <path d="M9.7 9.6c.2-.3.4-.3.6-.3h.4c.2 0 .3.1.4.3l.5 1.3c.1.2.1.3 0 .5l-.4.5c.3.6.8 1.1 1.4 1.4l.5-.4c.1-.1.3-.1.5 0l1.3.5c.2.1.3.2.3.4v.4c0 .3-.1.5-.3.6-.4.2-.9.3-1.5.1-1.6-.5-2.9-1.8-3.4-3.4-.2-.5-.1-1 .1-1.5z"></path>
              </svg>
              WhatsApp
            </a>
            <a
              href="#"
              className="header-contact-panel-link"
              aria-disabled="true"
              onClick={(event) => event.preventDefault()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 14a3 3 0 0 1-3 3H9l-4 3v-3a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z"></path>
              </svg>
              Agende um atendimento privativo
            </a>
            <a
              href="https://www.instagram.com/tsebiofficial/"
              target="_blank"
              rel="noopener noreferrer"
              className="header-contact-panel-link"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="4" ry="4"></rect>
                <circle cx="12" cy="12" r="3.8"></circle>
                <circle cx="17.2" cy="6.8" r="1.1"></circle>
              </svg>
              Direct Instagram
            </a>
          </nav>

          <div className="header-contact-panel-divider" />

          <div className="header-contact-panel-help">
            <a href="/faq">Precisa de ajuda?</a>
            <a href="/faq#perguntas-frequentes">Perguntas Frequentes</a>
            <a href="/faq#entrega-e-devolucoes">Entregas e Devoluções</a>
            <a href="/faq#servicos-e-reparos">Serviços e cuidados</a>
          </div>
        </div>
      </aside>

      <aside
        className={`header-menu ${isMenuOpen ? "is-open" : ""}`}
        id="headerMenu"
        ref={headerMenuRef}
        aria-hidden={!isMenuOpen}
      >
        <div className="header-menu-actions">
          <button
            className="header-menu-close"
            id="closeHeaderMenu"
            type="button"
            aria-label="Fechar menu"
            onClick={() => setIsMenuOpen(false)}
          >
            <span className="header-menu-close-mark" aria-hidden="true">&times;</span>
            <span className="header-menu-close-label">Fechar</span>
          </button>
          <button
            className="header-menu-search"
            type="button"
            aria-label="Pesquisar"
            onClick={openSearchOverlay}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="M20 20l-4.2-4.2"></path>
            </svg>
            <span>Pesquisar</span>
          </button>
        </div>

        <div className={`header-menu-stage ${isMenuNavPanelOpen ? "is-nav-panel-open" : ""}`}>
          <div className="header-menu-main">
            <nav className="header-menu-nav" aria-label="Menu lateral">
              {MENU_NAV_ITEMS.map((item) => (
                <a key={item} href="#" data-menu-panel={item} onClick={handleMenuNavPanelOpen}>
                  {item}
                </a>
              ))}
            </nav>
            <div className="header-menu-utilities" aria-label="Utilidades do menu">
              <a className="header-menu-utility" href={isAuthenticated ? "/account" : "/login"}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0"></path>
                  <circle cx="12" cy="8" r="4"></circle>
                </svg>
                <span>{isAuthenticated ? "Minha conta" : "Entrar ou Registrar-se"}</span>
              </a>
              <a className="header-menu-utility cart-link" href="/cart" aria-label="Carrinho" data-cart-count={cartCountBadge}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7h10l1 12H6L7 7z"></path>
                  <path d="M9 7V6a3 3 0 1 1 6 0v1"></path>
                </svg>
                <span>Carrinho</span>
              </a>
              <a className="header-menu-utility" href={wishlistHref} data-link-key="wishlist">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.1A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"></path>
                </svg>
                <span>Lista de desejos</span>
              </a>
              <a
                className="header-menu-utility"
                href="#"
                data-link-key="private-care-no-route"
                data-no-route="true"
                onClick={(event) => event.preventDefault()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 3 6c0-1 1-2 2-2z"></path>
                </svg>
                <span>Marque um atendimento privativo</span>
              </a>
              <a
                className="header-menu-utility header-menu-utility--mobile-only"
                href="#"
                aria-label="Fale Conosco"
                onClick={(event) => {
                  event.preventDefault();
                  setIsMenuOpen(false);
                  setIsMenuNavPanelOpen(false);
                  setActiveMenuNavPanel(null);
                  setIsSearchOpen(false);
                  setIsContactPanelOpen(true);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 14a3 3 0 0 1-3 3H9l-4 3v-3a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z"></path>
                </svg>
                <span>Fale Conosco</span>
              </a>
            </div>
          </div>
          <div className="header-menu-subpanel" aria-hidden={!isMenuNavPanelOpen}>
            <div className="header-menu-subpanel-body">
              {MENU_NAV_ITEMS.map((item) => (
                <div
                  key={item}
                  className={`header-menu-subpanel-page ${activeMenuNavPanel === item ? "is-active" : ""}`}
                  data-nav-key={item}
                >
                  <div className="header-menu-subpanel-head">
                    <button
                      type="button"
                      className="header-menu-subpanel-back"
                      onClick={() => {
                        setIsMenuNavPanelOpen(false);
                        setActiveMenuNavPanel(null);
                      }}
                    >
                      <span aria-hidden="true">&lt;</span>
                      <span>Voltar</span>
                    </button>
                    {item !== "Seleção Tsebi" ? <h2 className="header-menu-subpanel-title">{item}</h2> : null}
                  </div>
                  {item === "Novidades" || item === "Presentes" ? (
                    <div className="header-menu-subpanel-categories">
                      <div className="header-menu-subpanel-category-group">
                        <span className="header-menu-subpanel-category-title">Para ele</span>
                        <div className="header-menu-subpanel-category-links">
                          <a
                            href={item === "Novidades" ? "/products?n=e" : "#"}
                            onClick={(event) => {
                              if (item !== "Novidades") event.preventDefault();
                            }}
                          >
                            {item === "Presentes" ? "Presentes para homens" : "Novidades para homens"}
                          </a>
                          <a href="#" onClick={(event) => event.preventDefault()}>Coleção Gênesis</a>
                          <a href="#" onClick={(event) => event.preventDefault()}>Coleção Alicerce</a>
                        </div>
                      </div>
                      <div className="header-menu-subpanel-category-group">
                        <span className="header-menu-subpanel-category-title">Para ela</span>
                        <div className="header-menu-subpanel-category-links">
                          <a
                            href={item === "Novidades" ? "/products?n=a" : "#"}
                            onClick={(event) => {
                              if (item !== "Novidades") event.preventDefault();
                            }}
                          >
                            {item === "Presentes" ? "Presentes para mulheres" : "Novidades para Mulheres"}
                          </a>
                          <a href="#" onClick={(event) => event.preventDefault()}>Coleção Gênesis</a>
                          <a href="#" onClick={(event) => event.preventDefault()}>Coleção Alicerce</a>
                        </div>
                      </div>
                      <div
                        className="header-menu-subpanel-gallery"
                        aria-label={
                          item === "Presentes"
                            ? "Destaques Presentes"
                            : "Destaques Novidades"
                        }
                      >
                        {(item === "Presentes"
                          ? MENU_PRESENTES_GALLERY_ITEMS
                          : MENU_NOVIDADES_GALLERY_ITEMS).map((galleryItem, imageIndex) => (
                          <a key={galleryItem.name} href={galleryItem.href} className="header-menu-subpanel-gallery-item">
                            <Image
                              src={galleryItem.image}
                              alt={`${galleryItem.name} destaque ${imageIndex + 1}`}
                              width={720}
                              height={900}
                              unoptimized
                            />
                            <div className="header-menu-subpanel-gallery-meta">
                              <p className="header-menu-subpanel-gallery-name">{galleryItem.name}</p>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : item === "Bolsas e Acessórios" ? (
                    <div className="header-menu-subpanel-categories">
                      <div className="header-menu-subpanel-category-group">
                        <span className="header-menu-subpanel-category-title">BOLSAS</span>
                        <div className="header-menu-subpanel-category-links">
                          <a
                            href={buildAccessoriesMenuHref({ subcategory: "Bolsas" })}
                            onClick={(event) =>
                              handleMenuProductsLinkClick(event, buildAccessoriesMenuHref({ subcategory: "Bolsas" }))
                            }
                          >
                            Todas as bolsas
                          </a>
                          <a
                            href={buildAccessoriesMenuHref({ subcategory: "Bolsas", query: "Genesis Bag Black" })}
                            onClick={(event) =>
                              handleMenuProductsLinkClick(
                                event,
                                buildAccessoriesMenuHref({ subcategory: "Bolsas", query: "Genesis Bag Black" })
                              )
                            }
                          >
                            Genesis Bag — Black
                          </a>
                          <a
                            href={buildAccessoriesMenuHref({ subcategory: "Bolsas", query: "Genesis Bag Sand" })}
                            onClick={(event) =>
                              handleMenuProductsLinkClick(
                                event,
                                buildAccessoriesMenuHref({ subcategory: "Bolsas", query: "Genesis Bag Sand" })
                              )
                            }
                          >
                            Genesis Bag — Sand
                          </a>
                        </div>
                      </div>
                      <div className="header-menu-subpanel-category-group">
                        <span className="header-menu-subpanel-category-title">ACESSÓRIOS</span>
                        <div className="header-menu-subpanel-category-links">
                          <a
                            href={buildAccessoriesMenuHref({ subcategory: "Carteiras" })}
                            onClick={(event) =>
                              handleMenuProductsLinkClick(event, buildAccessoriesMenuHref({ subcategory: "Carteiras" }))
                            }
                          >
                            Carteiras
                          </a>
                          <a
                            href={buildAccessoriesMenuHref({ subcategory: "Cintos" })}
                            onClick={(event) =>
                              handleMenuProductsLinkClick(event, buildAccessoriesMenuHref({ subcategory: "Cintos" }))
                            }
                          >
                            Cintos
                          </a>
                        </div>
                      </div>
                      <div className="header-menu-subpanel-category-group">
                        <span className="header-menu-subpanel-category-title">FEATURED</span>
                        <div className="header-menu-subpanel-category-links">
                          <a
                            href={buildAccessoriesMenuHref({ sort: "newest" })}
                            onClick={(event) => handleMenuProductsLinkClick(event, buildAccessoriesMenuHref({ sort: "newest" }))}
                          >
                            New Arrivals
                          </a>
                          <a
                            href={buildAccessoriesMenuHref({ isFeatured: true })}
                            onClick={(event) =>
                              handleMenuProductsLinkClick(event, buildAccessoriesMenuHref({ isFeatured: true }))
                            }
                          >
                            Signature Pieces
                          </a>
                        </div>
                      </div>
                      <a
                        href="#"
                        onClick={(event) => event.preventDefault()}
                        className="header-menu-subpanel-single-image header-menu-subpanel-single-image--clean"
                        aria-label="Imagem destaque Bolsas e Acessórios"
                      >
                        <Image
                          src="https://media.tsebi.com.br/Pin%20on%20IN%20EYE%2C%20EAR%2C%20MOUTH.jpg"
                          alt="Destaque Bolsas e Acessórios"
                          width={900}
                          height={1100}
                        />
                      </a>
                    </div>
                  ) : item === "Seleção Tsebi" ? (
                    <section className="header-menu-subpanel-curation" aria-label="Seleção Tsebi">
                      <div className="header-menu-subpanel-curation-hero">
                        <Image
                          src={MENU_SELECAO_TSEBI_LOOK.heroImage}
                          alt="Modelo com look completo Tsebi"
                          width={960}
                          height={1200}
                          unoptimized
                        />
                      </div>
                      <h3 className="header-menu-subpanel-curation-title">{MENU_SELECAO_TSEBI_LOOK.title}</h3>
                      <p className="header-menu-subpanel-curation-subtitle">{MENU_SELECAO_TSEBI_LOOK.subtitle}</p>
                      <h4 className="header-menu-subpanel-curation-shop-title">COMPRE O LOOK</h4>
                      <div className="header-menu-subpanel-curation-grid">
                        {MENU_SELECAO_TSEBI_LOOK.products.map((product, index) => (
                          <article key={product.id} className="header-menu-subpanel-curation-card">
                            <Image
                              src={product.image}
                              alt={`Produto ${index + 1} - ${product.name}`}
                              width={640}
                              height={800}
                              unoptimized
                            />
                            <div className="header-menu-subpanel-curation-card-body">
                              <p className="header-menu-subpanel-curation-card-name">{product.name}</p>
                              <p className="header-menu-subpanel-curation-card-price">{product.priceLabel}</p>
                              <div className="header-menu-subpanel-curation-card-actions">
                                <a href={product.href} className="header-menu-subpanel-curation-card-link">
                                  Ver produto
                                </a>
                                <button
                                  type="button"
                                  className="header-menu-subpanel-curation-card-add"
                                  onClick={() => handleAddSelecaoItem(product)}
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M7 7h10l1 12H6L7 7z"></path>
                                    <path d="M9 7V6a3 3 0 1 1 6 0v1"></path>
                                  </svg>
                                  <span>+</span>
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="header-menu-subpanel-curation-buy-all"
                        onClick={(event) => handleAddSelecaoLook(event)}
                      >
                        Comprar curadoria semanal
                      </button>
                      {selecaoFeedback ? <p className="header-menu-subpanel-curation-feedback">{selecaoFeedback}</p> : null}
                    </section>
                  ) : item === "Feminino" ? (
                    <div className="header-menu-subpanel-fashion-layout">
                      <div className="header-menu-subpanel-categories">
                        {MENU_FEMININO_CATEGORIES.map((group) => (
                          <div key={group.title} className="header-menu-subpanel-category-group">
                            <a href={buildProductsMenuHref("Feminino", group.title)} className="header-menu-subpanel-category-title">
                              {group.title}
                            </a>
                            <div className="header-menu-subpanel-category-links">
                              {group.items.map((subItem) => (
                                <a key={subItem} href={buildProductsMenuHref("Feminino", group.title, subItem)}>
                                  {subItem}
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                        <a className="header-menu-subpanel-view-all" href={buildProductsMenuHref("Feminino")}>
                          Ver tudo
                        </a>
                      </div>
                      <aside className="header-menu-subpanel-editorial-banner" aria-hidden="true">
                        <div className="header-menu-subpanel-editorial-banner-space"></div>
                      </aside>
                    </div>
                  ) : item === "Masculino" ? (
                    <div className="header-menu-subpanel-fashion-layout">
                      <div className="header-menu-subpanel-categories">
                        {MENU_MASCULINO_CATEGORIES.map((group) => (
                          <div key={group.title} className="header-menu-subpanel-category-group">
                            <a href={buildProductsMenuHref("Masculino", group.title)} className="header-menu-subpanel-category-title">
                              {group.title}
                            </a>
                            <div className="header-menu-subpanel-category-links">
                              {group.items.map((subItem) => (
                                <a key={subItem} href={buildProductsMenuHref("Masculino", group.title, subItem)}>
                                  {subItem}
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                        <a className="header-menu-subpanel-view-all" href={buildProductsMenuHref("Masculino")}>
                          Ver tudo
                        </a>
                      </div>
                      <aside
                        className="header-menu-subpanel-editorial-banner header-menu-subpanel-editorial-banner--masculino"
                        aria-hidden="true"
                        style={{
                          display: "block",
                          backgroundImage:
                            'linear-gradient(180deg, rgba(3, 4, 5, 0.46) 0%, rgba(3, 4, 5, 0.34) 30%, rgba(3, 4, 5, 0.24) 58%, rgba(3, 4, 5, 0.54) 100%), radial-gradient(80% 68% at 50% 52%, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 40%, rgba(0, 0, 0, 0.24) 100%), url("https://media.tsebi.com.br/generation-6393ea28-757e-45d6-ab49-4dfed1ba1a87.png")',
                          backgroundSize: "auto 100%",
                          backgroundPosition: "40% 60%",
                          backgroundRepeat: "no-repeat",
                        }}
                      >
                        <div className="header-menu-subpanel-editorial-banner-space"></div>
                      </aside>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <div className={`tsebi-search-overlay ${isSearchOpen ? "is-open" : ""}`} id="searchOverlay" aria-hidden={!isSearchOpen}>
        <button
          type="button"
          className="tsebi-search-backdrop"
          aria-label="Fechar busca"
          onClick={closeSearchOverlay}
        />
        <section
          ref={searchDialogRef}
          className="tsebi-search-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tsebiSearchTitle"
        >
          <div className="tsebi-search-head">
            <h2 id="tsebiSearchTitle" className="tsebi-search-title">
              Tsebi
            </h2>
            <button
              ref={searchCloseButtonRef}
              className="tsebi-search-close"
              type="button"
              aria-label="Fechar busca"
              onClick={closeSearchOverlay}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="tsebi-search-body">
            <div className="tsebi-search-input-wrap">
              <label htmlFor="tsebi-search-input" className="sr-only">
                Pesquise palavras-chave
              </label>
              <div className={`tsebi-search-placeholder ${String(searchQuery || "").trim().length > 0 ? "is-hidden" : ""}`} aria-hidden="true">
                <span className="tsebi-search-placeholder-static">Pesquise por um </span>
                <span className="tsebi-search-placeholder-word-viewport">
                  <span className="tsebi-search-placeholder-word-track" ref={searchPlaceholderTrackRef}>
                    <span className="tsebi-search-placeholder-word" ref={searchPlaceholderCurrentRef}></span>
                    <span className="tsebi-search-placeholder-word" ref={searchPlaceholderNextRef}></span>
                  </span>
                </span>
              </div>
              <input
                id="tsebi-search-input"
                ref={searchInputRef}
                className="tsebi-search-input"
                type="search"
                placeholder=""
                aria-label="Buscar"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  submitSearchPage();
                }}
              />
            </div>
            <div className="tsebi-search-categories" aria-label="Categorias de busca">
              {SEARCH_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="tsebi-search-category-btn"
                  onClick={() => {
                    trackRecommendationCategoryVisit(category, 4500);
                    submitSearchPage(category);
                  }}
                >
                  {category}
                </button>
              ))}
            </div>
            <SearchOverlayRecommendations
              isOpen={isSearchOpen}
              query={searchQuery}
              placement="search_overlay_legacy"
              title="Recomendado para você"
              limit={6}
              mode="personalized"
            />
            <SearchOverlayRecommendations
              isOpen={isSearchOpen}
              query={searchQuery}
              placement="search_overlay_legacy_best_sellers"
              title="Seleção Tsebi"
              limit={6}
              mode="best_sellers"
            />
            <p className="tsebi-search-footer-quote">Se torne a sua melhor versão!</p>
          </div>
        </section>
      </div>

      <LegacyHero />
      <NewsletterPopup />

      <GenderShowcase products={safeProducts} />

      <section className="new-drop collection-drop" aria-label="Nova Coleção em vídeo">
        <div className="new-drop-inner">
          <div className="new-drop-media">
            <Image
              className="new-drop-static-image"
              src={COLLECTION_DROP_IMAGE}
              alt="Nova Coleção em destaque"
              width={1400}
              height={1750}
              unoptimized
              onError={(event) => {
                const element = event.currentTarget;
                element.onerror = null;
                element.src = COLLECTION_PLACEHOLDER;
              }}
            />
          </div>
          <h2>Coleção Alicerce</h2>
          <Link className="new-drop-cta" href="/" prefetch={false}>
            EM BREVE
          </Link>
        </div>
      </section>

      <section className="category-switch" data-category-switch="popular" aria-label="Peças mais clicadas">
        <div className="carousel-wrapper">
          <button type="button" className="carousel-nav-btn carousel-nav-prev" onClick={() => scrollPopularCarousel("prev")} aria-label="Anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button type="button" className="carousel-nav-btn carousel-nav-next" onClick={() => scrollPopularCarousel("next")} aria-label="Próximo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <div className="category-grid" id="popularGrid">
            {hasMounted && isMobileViewport ? (
              <div className="mobile-showcase-shell">
                {previousPopularMobileProduct ? <PopularCarouselPeek product={previousPopularMobileProduct} side="prev" /> : null}
                {activePopularMobileProduct ? (
                  <div
                    key={`${activePopularMobileProduct.sku}-${normalizedPopularCarouselIndex}-${popularTransitionDirection}`}
                    className={`mobile-showcase-active mobile-showcase-active-${popularTransitionDirection}`}
                  >
                    <PopularCarouselCard product={activePopularMobileProduct} />
                  </div>
                ) : null}
                {nextPopularMobileProduct ? <PopularCarouselPeek product={nextPopularMobileProduct} side="next" /> : null}
                {popularCarouselProducts.length > 1 ? (
                  <div className="mobile-showcase-pagination" aria-label="Paginação dos destaques">
                    {popularCarouselProducts.map((product, index) => (
                      <button
                        key={product.sku || product.id}
                        type="button"
                        className={`mobile-showcase-dot${index === normalizedPopularCarouselIndex ? " is-active" : ""}`}
                        aria-label={`Ir para item ${index + 1}`}
                        aria-pressed={index === normalizedPopularCarouselIndex}
                        onClick={() => {
                          if (index === normalizedPopularCarouselIndex) return;
                          setPopularTransitionDirection(index < normalizedPopularCarouselIndex ? "prev" : "next");
                          setActivePopularCarouselIndex(index);
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              popularProducts.map((product) => {
                const href = resolveProductHref(product);
                if (!href) {
                  if (process.env.NODE_ENV !== "production") {
                    console.warn("[home-legacy] skipping popular product without id", { product });
                  }
                  return null;
                }

                const pair = buildHoverImagePair(product);
                return (
                  <article key={`popular-${product.sku || product.id}-${product.name}`} className="category-card">
                    <Link href={href} className="category-media" prefetch={false}>
                      <div className="category-image">
                        <Image
                          className="card-media-img card-media-img-primary"
                          src={pair.primary || resolveProductImageSrc(product)}
                          alt={product.name}
                          width={900}
                          height={1200}
                          unoptimized
                          onError={(event) => {
                            const element = event.currentTarget;
                            element.onerror = null;
                            element.src = COLLECTION_PLACEHOLDER;
                          }}
                        />
                        <Image
                          className="card-media-img card-media-img-secondary"
                          src={pair.secondary || resolveProductImageSrc(product)}
                          alt={`${product.name} - segunda foto`}
                          width={900}
                          height={1200}
                          unoptimized
                          onError={(event) => {
                            const element = event.currentTarget;
                            element.onerror = null;
                            element.src = pair.primary || COLLECTION_PLACEHOLDER;
                          }}
                        />
                      </div>
                    </Link>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="new-drop homepage-picture-drop" aria-label="Imagem de destaque da home">
        <div className="new-drop-inner" style={{ width: "100vw", maxWidth: "none", margin: "0 calc(50% - 50vw)" }}>
          <div className="new-drop-media" style={{ width: "100vw", maxWidth: "none", margin: 0 }}>
            <Image
              className="homepage-picture-image"
              src={HOMEPAGE_PICTURE_IMAGE}
              alt="Imagem de destaque da homepage"
              width={1920}
              height={1080}
              priority
              unoptimized
              onError={(event) => {
                const element = event.currentTarget;
                const currentSrc = element.getAttribute("src") || "";
                if (currentSrc.endsWith(HOMEPAGE_PICTURE_IMAGE)) {
                  element.src = HOMEPAGE_PICTURE_FALLBACK;
                  return;
                }
                element.onerror = null;
              }}
            />
          </div>
        </div>
      </section>

      <section className="t-section homepage-categories-section" aria-label="Categorias">
        <div className="t-container">
          <header className="homepage-categories-header" style={{ textAlign: "center", marginBottom: "var(--t-space-6)" }}>
            <h2 className="t-h2">Explore as Categorias</h2>
            <p className="t-subtitle" style={{ marginTop: "var(--t-space-2)" }}>
              Seleção por estilo e essenciais
            </p>
          </header>

          <div className="t-grid t-grid--4 t-grid--mobile-carousel homepage-categories-grid">
            {HOMEPAGE_CATEGORIES.map((item) => (
              <a
                key={`${item.href}-${item.label}`}
                className={`t-card-link homepage-categories-card${"desktopOnly" in item && item.desktopOnly ? " homepage-categories-card--desktop-only" : ""}`}
                href={item.href}
                onClick={() => trackRecommendationCategoryVisit(item.label, 7000)}
              >
                <div className="t-media t-media--cat homepage-categories-media">
                  <Image
                    src={item.image}
                    alt={item.alt}
                    width={900}
                    height={1200}
                    unoptimized
                    onError={(event) => {
                      const element = event.currentTarget;
                      element.onerror = null;
                      element.src = item.fallbackImage;
                    }}
                  />
                </div>
                <span className="t-card-label homepage-categories-label">{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <LegacyFooter />
    </div>
  );
}











