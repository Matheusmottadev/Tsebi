"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cartSelectors, useCartStore } from "@/lib/cart/cartStore";
import { startSearchPlaceholderRotator } from "@/lib/searchPlaceholderRotator";
import { SearchOverlayRecommendations } from "@/components/SearchOverlayRecommendations";
import { getMe } from "@/services/auth";

const TOP_MESSAGES = [
  "Nova Coleção Genesis",
  "Você merece vestir algo a sua altura.",
  "Cadastre-se para receber lançamentos",
  "Exclusividade para quem valoriza o que é único.",
  "Acesso antecipado a novas coleções.",
  "Produção em pequena escala. Qualidade em cada detalhe.",
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

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isProductPage = pathname === "/product" || String(pathname || "").startsWith("/product/");
  const currentPath = String(pathname || "").trim();
  const novidadesToken = String(searchParams?.get("n") || "").trim().toLowerCase();
  const novidadesView = String(searchParams?.get("view") || "").trim().toLowerCase();
  const isNovidadesListingPage =
    currentPath === "/products" &&
    (["e", "a", "ele", "ela", "m", "f", "masculino", "feminino"].includes(novidadesToken) ||
      novidadesView === "novidades-para-ele" ||
      novidadesView === "novidades-para-ela");
  const hasHydrated = useCartStore(cartSelectors.hasHydrated);
  const itemCount = useCartStore(cartSelectors.itemCount);
  const addItem = useCartStore((state) => state.addItem);
  const displayCount = hasHydrated ? itemCount : 0;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const wishlistTarget = "/account#wishlist";
  const wishlistHref = isAuthenticated
    ? wishlistTarget
    : `/login?returnUrl=${encodeURIComponent(wishlistTarget)}`;
  const [messageIndex, setMessageIndex] = useState(0);
  const [messageClass, setMessageClass] = useState("slide-right");
  const [messageKey, setMessageKey] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuNavPanelOpen, setIsMenuNavPanelOpen] = useState(false);
  const [activeMenuNavPanel, setActiveMenuNavPanel] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selecaoFeedback, setSelecaoFeedback] = useState("");
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isHeaderForcedHidden, setIsHeaderForcedHidden] = useState(false);
  const headerMenuRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchDialogRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchPlaceholderCurrentRef = useRef<HTMLSpanElement | null>(null);
  const searchPlaceholderNextRef = useRef<HTMLSpanElement | null>(null);
  const searchPlaceholderTrackRef = useRef<HTMLSpanElement | null>(null);
  const leftArrowRef = useRef<HTMLButtonElement | null>(null);
  const rightArrowRef = useRef<HTMLButtonElement | null>(null);
  const lastScrollYRef = useRef(0);
  const scrollTickingRef = useRef(false);

  const currentMessage = useMemo(() => TOP_MESSAGES[messageIndex] || TOP_MESSAGES[0], [messageIndex]);

  const animateArrow = useCallback((direction: "left" | "right") => {
    const button = direction === "right" ? rightArrowRef.current : leftArrowRef.current;
    if (!button || typeof button.animate !== "function") return;

    const distance = direction === "right" ? 14 : -14;
    button.getAnimations().forEach((animation) => animation.cancel());
    button.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${distance}px)` }, { transform: "translateX(0)" }],
      { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  }, []);

  const stepTopMessage = useCallback(
    (direction: "left" | "right", delta: number) => {
      setMessageClass(direction === "left" ? "slide-left" : "slide-right");
      setMessageIndex((current) => (current + delta + TOP_MESSAGES.length) % TOP_MESSAGES.length);
      setMessageKey((current) => current + 1);
      animateArrow(direction);
    },
    [animateArrow]
  );

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
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const isHome = pathname === "/";
    document.body.classList.toggle("home-page", isHome);
    return () => {
      document.body.classList.remove("home-page");
    };
  }, [isProductPage, pathname]);

  useEffect(() => {
    let timerId = window.setInterval(() => {
      stepTopMessage("right", 1);
    }, 4000);

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearInterval(timerId);
      } else {
        timerId = window.setInterval(() => {
          stepTopMessage("right", 1);
        }, 4000);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [stepTopMessage]);

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
    if (!isMenuOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (headerMenuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [isMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      setIsSearchOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsSearchOpen(false);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isProductPage) return;
    lastScrollYRef.current = window.scrollY || 0;
    scrollTickingRef.current = false;

    const applyScrollDirection = () => {
      scrollTickingRef.current = false;
      if (isHeaderForcedHidden) {
        setIsHeaderHidden(true);
        return;
      }
      const currentY = window.scrollY || 0;
      const delta = currentY - lastScrollYRef.current;
      lastScrollYRef.current = currentY;

      if (isMenuOpen) {
        setIsHeaderHidden(false);
        return;
      }

      if (currentY <= 8) {
        setIsHeaderHidden(false);
        return;
      }

      if (Math.abs(delta) < 3) return;
      if (delta > 0 && currentY > 120) {
        setIsHeaderHidden(true);
      } else if (delta < 0) {
        setIsHeaderHidden(false);
      }
    };

    const onScroll = () => {
      if (scrollTickingRef.current) return;
      scrollTickingRef.current = true;
      window.requestAnimationFrame(applyScrollDirection);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [isHeaderForcedHidden, isMenuOpen, pathname, isProductPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isProductPage) return;

    const onProductMediaDirection = (event: Event) => {
      if (isMenuOpen) return;
      const customEvent = event as CustomEvent<{ hidden?: boolean }>;
      const hidden = Boolean(customEvent.detail?.hidden);
      setIsHeaderHidden(hidden);
    };

    window.addEventListener("product-media-scroll-direction", onProductMediaDirection as EventListener, {
      passive: true,
    });
    return () => {
      window.removeEventListener("product-media-scroll-direction", onProductMediaDirection as EventListener);
    };
  }, [isMenuOpen, isProductPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isProductPage) return;

    const onStickyBarVisibility = (event: Event) => {
      const customEvent = event as CustomEvent<{ active?: boolean }>;
      const active = Boolean(customEvent.detail?.active);
      setIsHeaderForcedHidden(active);
      if (active) setIsHeaderHidden(true);
    };

    window.addEventListener("product-sticky-bar-visibility", onStickyBarVisibility as EventListener, {
      passive: true,
    });
    return () => {
      window.removeEventListener("product-sticky-bar-visibility", onStickyBarVisibility as EventListener);
      setIsHeaderForcedHidden(false);
    };
  }, [isProductPage]);

  const cartCountBadge = displayCount > 0 ? String(displayCount) : undefined;
  const openSearchOverlay = useCallback(() => {
    setIsMenuOpen(false);
    setIsMenuNavPanelOpen(false);
    setActiveMenuNavPanel(null);
    setIsSearchOpen(true);
  }, []);

  const closeSearchOverlay = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
  }, []);

  const handleMenuNavPanelOpen = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const key = String(event.currentTarget.dataset.menuPanel || "").trim();
    if (!key) return;
    setActiveMenuNavPanel(key);
    setIsMenuNavPanelOpen(true);
  }, []);

  const submitSearch = useCallback(() => {
    const normalized = String(searchQuery || "").trim();
    if (normalized.length < 2) return;
    router.push(`/products?q=${encodeURIComponent(normalized)}`);
    closeSearchOverlay();
  }, [closeSearchOverlay, router, searchQuery]);

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

  return (
    <>
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

      <header
        className={`home-header is-scrolled${isProductPage ? " product-mode" : ""}${isNovidadesListingPage ? " novidades-listing-mode" : ""}${isProductPage && (isHeaderHidden || isHeaderForcedHidden) ? " header--hidden" : ""}`}
      >
        <div className="header-row">
          <div className="header-left">
            <button
              className="menu-toggle"
              id="openHeaderMenu"
              type="button"
              ref={menuButtonRef}
              aria-label="Abrir menu"
              onClick={() => {
                setIsMenuOpen(true);
                setIsMenuNavPanelOpen(false);
                setActiveMenuNavPanel(null);
              }}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
            <button type="button" className="header-search-trigger" aria-label="Buscar produtos" onClick={openSearchOverlay}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M20 20l-4.2-4.2"></path>
              </svg>
            </button>
          </div>

          <h1 className="logo">
            <Link href="/" className="logo-center-link">
              <span className="logo-center-text">TSEBI</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo-center-image" src="/images/logo-tsebi.png" alt="Logo TSEBI" />
            </Link>
          </h1>

          <div className="header-right">
            {isAuthenticated ? (
              <a className="quick-action" href="/account" aria-label="Conta">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0"></path>
                  <circle cx="12" cy="8" r="4"></circle>
                </svg>
              </a>
            ) : (
              <a className="quick-action" href="/login" aria-label="Conta">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0"></path>
                  <circle cx="12" cy="8" r="4"></circle>
                </svg>
              </a>
            )}
            <Link className="quick-action cart-link" href="/cart" aria-label={`Carrinho (${displayCount})`} data-cart-count={cartCountBadge}>
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
                <select defaultValue="pt-br" aria-label="Selecionar idioma">
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
                    <div className="header-menu-subpanel-fashion-layout">
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

      <div className={`tsebi-search-overlay ${isSearchOpen ? "is-open" : ""}`} aria-hidden={!isSearchOpen}>
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
          aria-labelledby="siteHeaderSearchTitle"
        >
          <div className="tsebi-search-head">
            <h2 id="siteHeaderSearchTitle" className="tsebi-search-title">
              Tsebi
            </h2>
            <button className="tsebi-search-close" type="button" aria-label="Fechar busca" onClick={closeSearchOverlay}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="tsebi-search-body">
            <div className="tsebi-search-input-wrap">
              <label htmlFor="site-header-search-input" className="sr-only">
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
                id="site-header-search-input"
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
                  submitSearch();
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
              placement="search_overlay_header"
              title="Recomendado para você"
              limit={6}
              mode="personalized"
            />
            <SearchOverlayRecommendations
              isOpen={isSearchOpen}
              query={searchQuery}
              placement="search_overlay_header_best_sellers"
              title="Seleção Tsebi"
              limit={6}
              mode="best_sellers"
            />
            <p className="tsebi-search-footer-quote">Se torne a sua melhor versão!</p>
          </div>
        </section>
      </div>
    </>
  );
}










