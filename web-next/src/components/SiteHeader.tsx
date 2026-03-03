"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const isProductPage = pathname === "/product" || String(pathname || "").startsWith("/product/");
  const hasHydrated = useCartStore(cartSelectors.hasHydrated);
  const itemCount = useCartStore(cartSelectors.itemCount);
  const displayCount = hasHydrated ? itemCount : 0;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [messageClass, setMessageClass] = useState("slide-right");
  const [messageKey, setMessageKey] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
    return () => {
      document.body.classList.remove("menu-open");
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
    setIsSearchOpen(true);
  }, []);

  const closeSearchOverlay = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
  }, []);

  const submitSearch = useCallback(() => {
    const normalized = String(searchQuery || "").trim();
    if (normalized.length < 2) return;
    router.push(`/products?q=${encodeURIComponent(normalized)}`);
    closeSearchOverlay();
  }, [closeSearchOverlay, router, searchQuery]);

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
        className={`home-header is-scrolled${isProductPage ? " product-mode" : ""}${isProductPage && (isHeaderHidden || isHeaderForcedHidden) ? " header--hidden" : ""}`}
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
        <button
          className="header-menu-close"
          id="closeHeaderMenu"
          type="button"
          aria-label="Fechar menu"
          onClick={() => setIsMenuOpen(false)}
        >
          &times;
        </button>
        <nav className="header-menu-nav">
          <div className="menu-group">
            <Link className="menu-group-title" href="/lancamento" onClick={() => setIsMenuOpen(false)}>
              Coleção Genesis
            </Link>
          </div>
          <div className="menu-group">
            <Link className="menu-group-title" href="/nossa-historia" onClick={() => setIsMenuOpen(false)}>
              Origem
            </Link>
          </div>
          <div className="menu-group">
            <Link className="menu-group-title" href="/processos" onClick={() => setIsMenuOpen(false)}>
              Processos
            </Link>
          </div>
          <div className="menu-group">
            <Link className="menu-group-title" href="/faq" onClick={() => setIsMenuOpen(false)}>
              FAQ
            </Link>
          </div>
        </nav>
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
              title="Recomendado para voce"
              limit={6}
            />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}




