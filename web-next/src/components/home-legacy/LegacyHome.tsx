"use client";

import Link from "next/link";
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
import { buildHoverImagePair } from "@/lib/product-media";

type LegacyHomeProps = {
  products: Product[];
};

type HomeProductCard = Pick<Product, "id" | "sku" | "name" | "image" | "secondaryImage">;

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
  "Acesso antecipado a novas coleções.",
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


const SEARCH_CATEGORIES = ["Feminino", "Masculino", "Calças", "Camisas", "Blazers", "Bolsas"] as const;
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

const HOMEPAGE_CATEGORIES = [
  {
    href: "/categoria/feminino",
    image: "/images/product/origem-skirt-1.jpg",
    secondaryImage: "/images/product/origem-skirt-2.jpg",
    fallbackImage: "/images/product/origem-skirt-1.jpg",
    alt: "Categoria Feminino",
    label: "Feminino",
  },
  {
    href: "/categoria/masculino",
    image: "/images/product/origem-shirt-1.jpg",
    secondaryImage: "/images/product/origem-shirt-2.jpg",
    fallbackImage: "/images/product/origem-shirt-1.jpg",
    alt: "Categoria Masculino",
    label: "Masculino",
  },
  {
    href: "/categoria/carteiras-masculinas",
    image: "/images/product/atelier-bag-1.jpg",
    secondaryImage: "/images/product/atelier-bag-2.jpg",
    fallbackImage: "/images/product/atelier-bag-1.jpg",
    alt: "Categoria Carteiras Masculinas",
    label: "Carteiras Masculinas",
  },
  {
    href: "/categoria/vestidos",
    image: "/images/product/noir-dress-1.jpg",
    secondaryImage: "/images/product/noir-dress-2.jpg",
    fallbackImage: "/images/product/noir-dress-1.jpg",
    alt: "Categoria Vestidos",
    label: "Vestidos",
  },
  {
    href: "/categoria/calcas",
    image: "/images/product/essence-trousers-1.jpg",
    secondaryImage: "/images/product/essence-trousers-2.jpg",
    fallbackImage: "/images/product/essence-trousers-1.jpg",
    alt: "Categoria Calças",
    label: "Calças",
  },
  {
    href: "/categoria/carteiras-femininas",
    image: "/images/product/atelier-heels-1.jpg",
    secondaryImage: "/images/product/atelier-heels-2.jpg",
    fallbackImage: "/images/product/atelier-heels-1.jpg",
    alt: "Categoria Carteiras Femininas",
    label: "Carteiras Femininas",
  },
  {
    href: "/categoria/jaquetas",
    image: "/images/product/genesis-bomber-1.jpg",
    secondaryImage: "/images/product/genesis-bomber-2.jpg",
    fallbackImage: "/images/product/genesis-bomber-1.jpg",
    alt: "Categoria Jaquetas",
    label: "Jaquetas",
  },
  {
    href: "/categoria/Acessórios",
    image: "/images/product/noir-sneaker-1.jpg",
    secondaryImage: "/images/product/noir-sneaker-2.jpg",
    fallbackImage: "/images/product/noir-sneaker-1.jpg",
    alt: "Categoria Acessórios",
    label: "Acessórios",
  },
] as const;

const FALLBACK_POPULAR_PRODUCTS: HomeProductCard[] = [
  { id: "origem-skirt", sku: "origem-skirt", name: "Origem Skirt", image: "/images/placeholderreal.webp", secondaryImage: "/images/placeholderreal.webp" },
  { id: "genesis-tailored", sku: "genesis-tailored", name: "Genesis Tailored", image: "/images/placeholderreal.webp", secondaryImage: "/images/placeholderreal.webp" },
  { id: "atelier-heels", sku: "atelier-heels", name: "Atelier Heels", image: "/images/placeholderreal.webp", secondaryImage: "/images/placeholderreal.webp" },
  { id: "essence-blazer", sku: "essence-blazer", name: "Essence Blazer", image: "/images/placeholderreal.webp", secondaryImage: "/images/placeholderreal.webp" },
  { id: "noir-dress", sku: "noir-dress", name: "Noir Dress", image: "/images/placeholderreal.webp", secondaryImage: "/images/placeholderreal.webp" },
];

const FALLBACK_SEARCH_PIECES: SearchPiece[] = [
  { id: "origem-skirt", sku: "origem-skirt", name: "Sabrina charmosa", image: "/images/placeholderreal.webp", secondaryImage: "/images/placeholderreal.webp", href: "/product/origem-skirt" },
  { id: "origem-shirt", sku: "origem-shirt", name: "Sabrina linda", image: "/images/placeholderreal.webp", secondaryImage: "/images/placeholderreal.webp", href: "/product/origem-shirt" },
  {
    id: "genesis-tailored",
    sku: "genesis-tailored",
    name: "Sabrina maravilhosa",
    image: "/images/placeholderreal.webp",
    secondaryImage: "/images/placeholderreal.webp",
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
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/images/")) return raw;
  if (raw.startsWith("/")) return raw;

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selecaoFeedback, setSelecaoFeedback] = useState("");
  const [searchResults, setSearchResults] = useState<SearchPiece[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [didYouMeanQuery, setDidYouMeanQuery] = useState<string | null>(null);
  const [zeroResultCurated, setZeroResultCurated] = useState<SearchPiece[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchRequest, setHasSearchRequest] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const wishlistTarget = "/account#wishlist";
  const wishlistHref = isAuthenticated
    ? wishlistTarget
    : `/login?returnUrl=${encodeURIComponent(wishlistTarget)}`;
  const [language, setLanguage] = useState<"pt" | "en">("pt");
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
    return () => {
      document.body.classList.remove("home-page");
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
    setIsMenuOpen(true);
    setIsMenuNavPanelOpen(false);
    setActiveMenuNavPanel(null);
  }, []);

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

  const submitSearchPage = useCallback(() => {
    const normalized = String(searchQuery || "").trim();
    if (normalized.length < 2) return;
    trackRecommendationSearch(normalized);
    router.push(`/search?q=${encodeURIComponent(normalized)}`);
  }, [router, searchQuery]);

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
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
            <Link className="logo-center-link" href="/">
              <span className="logo-center-text">TSEBI</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo-center-image" src="/images/logo-tsebi.png" alt="Logo TSEBI" />
            </Link>
          </h1>

          <div className="header-right">
            <Link className="quick-action" href={isAuthenticated ? "/account" : "/login"} aria-label="Conta">
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
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7h10l1 12H6L7 7z"></path>
                <path d="M9 7V6a3 3 0 1 1 6 0v1"></path>
              </svg>
            </Link>

            <div className="site-language-switcher" aria-label="Language switcher">
              <button
                type="button"
                className={`lang-btn ${language === "pt" ? "is-active" : ""}`}
                onClick={() => setLanguage("pt")}
              >
                PT
              </button>
              <span className="lang-divider">|</span>
              <button
                type="button"
                className={`lang-btn ${language === "en" ? "is-active" : ""}`}
                onClick={() => setLanguage("en")}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      <button
        type="button"
        className={`home-legacy-menu-backdrop ${isMenuOpen ? "is-open" : ""}`}
        aria-label="Fechar menu"
        onClick={() => setIsMenuOpen(false)}
      />

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
              <label className="header-menu-utility header-menu-language" aria-label="Idioma">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M3 12h18"></path>
                  <path d="M12 3a14 14 0 0 1 0 18"></path>
                  <path d="M12 3a14 14 0 0 0 0 18"></path>
                </svg>
                <span>Idioma</span>
                <select
                  value={language === "pt" ? "pt-br" : "en"}
                  onChange={(event) => setLanguage(event.target.value === "pt-br" ? "pt" : "en")}
                  aria-label="Selecionar idioma"
                >
                  <option value="pt-br">PT-BR</option>
                  <option value="en">Ingles</option>
                </select>
              </label>
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
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={galleryItem.image} alt={`${galleryItem.name} destaque ${imageIndex + 1}`} />
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
                          <a href="/products?category=Bolsas">Todas as bolsas</a>
                          <a href="/products?q=Genesis%20Bag%20%E2%80%94%20Black">Genesis Bag — Black</a>
                          <a href="/products?q=Genesis%20Bag%20%E2%80%94%20Sand">Genesis Bag — Sand</a>
                        </div>
                      </div>
                      <div className="header-menu-subpanel-category-group">
                        <span className="header-menu-subpanel-category-title">ACESSÓRIOS</span>
                        <div className="header-menu-subpanel-category-links">
                          <a href="/products?category=Carteiras">Carteiras</a>
                          <a href="/products?category=Cintos">Cintos</a>
                        </div>
                      </div>
                      <div className="header-menu-subpanel-category-group">
                        <span className="header-menu-subpanel-category-title">FEATURED</span>
                        <div className="header-menu-subpanel-category-links">
                          <a href="/products?sort=latest">New Arrivals</a>
                          <a href="/products?featured=signature">Signature Pieces</a>
                        </div>
                      </div>
                      <a
                        href="#"
                        onClick={(event) => event.preventDefault()}
                        className="header-menu-subpanel-single-image header-menu-subpanel-single-image--clean"
                        aria-label="Imagem destaque Bolsas e Acessórios"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="https://media.tsebi.com.br/Pin%20on%20IN%20EYE%2C%20EAR%2C%20MOUTH.jpg"
                          alt="Destaque Bolsas e Acessórios"
                        />
                      </a>
                    </div>
                  ) : item === "Seleção Tsebi" ? (
                    <section className="header-menu-subpanel-curation" aria-label="Seleção Tsebi">
                      <div className="header-menu-subpanel-curation-hero">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={MENU_SELECAO_TSEBI_LOOK.heroImage} alt="Modelo com look completo Tsebi" />
                      </div>
                      <h3 className="header-menu-subpanel-curation-title">{MENU_SELECAO_TSEBI_LOOK.title}</h3>
                      <p className="header-menu-subpanel-curation-subtitle">{MENU_SELECAO_TSEBI_LOOK.subtitle}</p>
                      <h4 className="header-menu-subpanel-curation-shop-title">COMPRE O LOOK</h4>
                      <div className="header-menu-subpanel-curation-grid">
                        {MENU_SELECAO_TSEBI_LOOK.products.map((product, index) => (
                          <article key={product.id} className="header-menu-subpanel-curation-card">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={product.image} alt={`Produto ${index + 1} - ${product.name}`} />
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
                            <span className="header-menu-subpanel-category-title">{group.title}</span>
                            <div className="header-menu-subpanel-category-links">
                              {group.items.map((subItem) => (
                                <a key={subItem} href={`/products?q=${encodeURIComponent(subItem)}`}>
                                  {subItem}
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                        <a className="header-menu-subpanel-view-all" href="/products?gender=Feminino">
                          Ver tudo
                        </a>
                      </div>
                      <aside className="header-menu-subpanel-editorial-banner" aria-hidden="true">
                        <div className="header-menu-subpanel-editorial-banner-space"></div>
                      </aside>
                    </div>
                  ) : item === "Masculino" ? (
                    <div className="header-menu-subpanel-categories">
                      {MENU_MASCULINO_CATEGORIES.map((group) => (
                        <div key={group.title} className="header-menu-subpanel-category-group">
                          <span className="header-menu-subpanel-category-title">{group.title}</span>
                          <div className="header-menu-subpanel-category-links">
                            {group.items.map((subItem) => (
                              <a key={subItem} href={`/products?q=${encodeURIComponent(subItem)}`}>
                                {subItem}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                      <a className="header-menu-subpanel-view-all" href="/products?gender=Masculino">
                        Ver tudo
                      </a>
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
                    setSearchQuery(category);
                    searchInputRef.current?.focus();
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="new-drop-static-image"
              src={COLLECTION_DROP_IMAGE}
              alt="Nova Coleção em destaque"
              loading="lazy"
              decoding="async"
              onError={(event) => {
                const element = event.currentTarget;
                element.onerror = null;
                element.src = COLLECTION_PLACEHOLDER;
              }}
            />
          </div>
          <h2>Coleção Alicerce</h2>
          <Link className="new-drop-cta" href="/">
            EM BREVE
          </Link>
        </div>
      </section>

      <section className="category-switch" data-category-switch="popular" aria-label="Peças mais clicadas">
        <div className="category-grid" id="popularGrid">
          {popularProducts.map((product) => {
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
                <Link href={href} className="category-media">
                  <div className="category-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="card-media-img card-media-img-primary"
                      loading="lazy"
                      decoding="async"
                      src={pair.primary || resolveProductImageSrc(product)}
                      alt={product.name}
                      onError={(event) => {
                        const element = event.currentTarget;
                        element.onerror = null;
                        element.src = COLLECTION_PLACEHOLDER;
                      }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="card-media-img card-media-img-secondary"
                      loading="lazy"
                      decoding="async"
                      src={pair.secondary || resolveProductImageSrc(product)}
                      alt={`${product.name} - segunda foto`}
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
          })}
        </div>
      </section>

      <section className="new-drop homepage-picture-drop" aria-label="Imagem de destaque da home">
        <div className="new-drop-inner" style={{ width: "100vw", maxWidth: "none", margin: "0 calc(50% - 50vw)" }}>
          <div className="new-drop-media" style={{ width: "100vw", maxWidth: "none", margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="homepage-picture-image"
              src={HOMEPAGE_PICTURE_IMAGE}
              alt="Imagem de destaque da homepage"
              loading="eager"
              decoding="async"
              fetchPriority="high"
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

      <section className="t-section" aria-label="Categorias">
        <div className="t-container">
          <header style={{ textAlign: "center", marginBottom: "var(--t-space-6)" }}>
            <h2 className="t-h2">Explore as Categorias</h2>
            <p className="t-subtitle" style={{ marginTop: "var(--t-space-2)" }}>
              Seleção por estilo e essenciais
            </p>
          </header>

          <div className="t-grid t-grid--4 t-grid--mobile-carousel">
            {HOMEPAGE_CATEGORIES.map((item) => (
              <a
                key={`${item.href}-${item.label}`}
                className="t-card-link"
                href={item.href}
                onClick={() => trackRecommendationCategoryVisit(item.label, 7000)}
              >
                <div className="t-media t-media--cat">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt={item.alt}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      const element = event.currentTarget;
                      element.onerror = null;
                      element.src = item.fallbackImage;
                    }}
                  />
                </div>
                <span className="t-card-label">{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <LegacyFooter language={language} onLanguageChange={setLanguage} />
    </div>
  );
}










