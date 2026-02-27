"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cartSelectors, useCartStore } from "@/lib/cart/cartStore";
import { getMe } from "@/services/auth";

const TOP_MESSAGES = [
  "Nova Coleção Genesis",
  "Você merece vestir algo a sua altura.",
  "Cadastre-se para receber lançamentos",
  "Exclusividade para quem valoriza o que é único.",
  "Acesso antecipado a novas coleções.",
  "Produção em pequena escala. Qualidade em cada detalhe.",
];

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
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isHeaderForcedHidden, setIsHeaderForcedHidden] = useState(false);
  const headerMenuRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
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

      if (isMenuOpen || isSearchOpen) {
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
  }, [isHeaderForcedHidden, isMenuOpen, isSearchOpen, pathname, isProductPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isProductPage) return;

    const onProductMediaDirection = (event: Event) => {
      if (isMenuOpen || isSearchOpen) return;
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
  }, [isMenuOpen, isSearchOpen, isProductPage]);

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

  function goToSearchPage(): void {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
    router.push("/search");
  }

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
                setIsSearchOpen(false);
                setIsMenuOpen(true);
              }}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
            {isProductPage ? (
              <button
                className="product-search-trigger"
                id="openSearch"
                type="button"
                aria-label="Abrir busca"
                onClick={goToSearchPage}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16L21 21" />
                </svg>
              </button>
            ) : (
              <button
                className="search-box-trigger"
                id="openSearch"
                type="button"
                aria-label="Abrir busca"
                onClick={goToSearchPage}
              >
                <span className="search-box-label">O que Você esta buscando?</span>
                <span className="search-box-icon">&#8985;</span>
              </button>
            )}
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
    </>
  );
}

