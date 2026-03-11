"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { getOrCreateAnonId, trackCommerceEvent } from "@/lib/analytics";
import { HttpError } from "@/lib/http";
import { getFavorites, updateFavorites } from "@/services/auth";
import { getPersonalizedProducts, listProducts } from "@/services/products";
import type { Product } from "@/types";

type RecommendationCard = {
  id: string;
  name: string;
  priceLabel: string;
  image: string;
  link: string;
  category: string;
  priceValue: number;
  currency: string;
};

type SearchOverlayRecommendationsProps = {
  isOpen: boolean;
  query?: string;
  placement?: string;
  title?: string;
  limit?: number;
  mode?: "personalized" | "best_sellers";
};

function toCard(product: Product): RecommendationCard | null {
  const id = String(product.sku || product.id || "").trim();
  if (!id) return null;
  const link = String(product.href || "").trim().startsWith("/")
    ? String(product.href || "").trim()
    : `/product/${encodeURIComponent(id)}`;
  const rawImage = String(product.image || "").trim();
  const image =
    rawImage && /^https?:\/\//i.test(rawImage)
      ? rawImage
      : rawImage.startsWith("/")
        ? rawImage
        : rawImage
          ? `/${rawImage.replace(/^\.?\//, "")}`
          : "/images/placeholderreal.webp";
  return {
    id,
    name: String(product.name || "Produto Tsebi"),
    priceLabel: String(product.priceLabel || ""),
    image,
    link,
    category: String(product.category || ""),
    priceValue: Number(product.priceValue || 0),
    currency: String(product.currency || "brl"),
  };
}

export function SearchOverlayRecommendations({
  isOpen,
  query = "",
  placement = "search_overlay",
  title = "Recomendado para você",
  limit = 6,
  mode = "personalized",
}: SearchOverlayRecommendationsProps) {
  const [loading, setLoading] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [cards, setCards] = useState<RecommendationCard[]>([]);
  const [resolvedTitle, setResolvedTitle] = useState(title);
  const [favoriteSkus, setFavoriteSkus] = useState<Record<string, boolean>>({});
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [favoritesCsrfToken, setFavoritesCsrfToken] = useState("");
  const [guestFavoriteNotice, setGuestFavoriteNotice] = useState("");
  const [isToastHiding, setIsToastHiding] = useState(false);
  const toastHideTimerRef = useRef<number | null>(null);
  const toastClearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const userId = String(window.localStorage.getItem("tsebi.user_id") || "").trim();
    setIsLoggedIn(Boolean(userId));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isLoggedIn) {
      setFavoriteSkus({});
      setFavoritesCsrfToken("");
      return;
    }

    let cancelled = false;
    const run = async () => {
      setFavoritesLoading(true);
      try {
        const response = await getFavorites({ cache: "no-store" });
        if (cancelled) return;
        const nextMap: Record<string, boolean> = {};
        (Array.isArray(response.favorites) ? response.favorites : []).forEach((sku) => {
          const key = String(sku || "").trim();
          if (!key) return;
          nextMap[key] = true;
        });
        setFavoriteSkus(nextMap);
        setFavoritesCsrfToken(String(response.csrfToken || "").trim());
      } catch {
        if (!cancelled) {
          setFavoriteSkus({});
          setFavoritesCsrfToken("");
        }
      } finally {
        if (!cancelled) setFavoritesLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isLoggedIn]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const anonId = getOrCreateAnonId();
        const userId = String(window.localStorage.getItem("tsebi.user_id") || "").trim();

        if (mode === "best_sellers") {
          const catalog = await listProducts();
          if (cancelled) return;
          const bestSellerCards = [...(Array.isArray(catalog) ? catalog : [])]
            .sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0))
            .map(toCard)
            .filter((item): item is RecommendationCard => Boolean(item))
            .slice(0, limit);

          setCards(bestSellerCards);
          setResolvedTitle(String(title || "Mais vendidos"));

          if (bestSellerCards.length > 0) {
            void trackCommerceEvent({
              eventName: "view_recommendations",
              userId,
              anonId,
              source: placement,
              query: String(query || "").trim(),
              attributes: {
                product_ids: bestSellerCards.map((item) => item.id),
                total: bestSellerCards.length,
                mode: "best_sellers",
              },
            });
          }

          return;
        }

        const response = await getPersonalizedProducts(userId, limit, {}, { anonId, placement });
        if (cancelled) return;

        const mapped = (Array.isArray(response.products) ? response.products : [])
          .map(toCard)
          .filter((item): item is RecommendationCard => Boolean(item))
          .slice(0, limit);

        let finalCards = mapped;
        if (mapped.length < limit) {
          const fallbackProducts = await listProducts();
          if (cancelled) return;
          const seen = new Set(mapped.map((entry) => entry.id));
          const fallbackCards = (Array.isArray(fallbackProducts) ? fallbackProducts : [])
            .map(toCard)
            .filter((item): item is RecommendationCard => Boolean(item))
            .filter((item) => !seen.has(item.id))
            .slice(0, Math.max(0, limit - mapped.length));
          finalCards = [...mapped, ...fallbackCards].slice(0, limit);
        }

        setCards(finalCards);
        setResolvedTitle(String(title || response.title || "Recomendado para você"));

        if (finalCards.length > 0) {
          void trackCommerceEvent({
            eventName: "view_recommendations",
            userId,
            anonId,
            source: placement,
            query: String(query || "").trim(),
            attributes: {
              product_ids: finalCards.map((item) => item.id),
              total: finalCards.length,
            },
          });
        }
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, limit, mode, placement, query, title]);

  const hasCards = cards.length > 0;

  useEffect(() => {
    if (!guestFavoriteNotice) return;
    setIsToastHiding(false);

    if (toastHideTimerRef.current) window.clearTimeout(toastHideTimerRef.current);
    if (toastClearTimerRef.current) window.clearTimeout(toastClearTimerRef.current);

    toastHideTimerRef.current = window.setTimeout(() => {
      setIsToastHiding(true);
    }, 5600);

    toastClearTimerRef.current = window.setTimeout(() => {
      setGuestFavoriteNotice("");
      setIsToastHiding(false);
    }, 6000);

    return () => {
      if (toastHideTimerRef.current) window.clearTimeout(toastHideTimerRef.current);
      if (toastClearTimerRef.current) window.clearTimeout(toastClearTimerRef.current);
    };
  }, [guestFavoriteNotice]);

  const skeletons = useMemo(
    () =>
      Array.from({ length: Math.min(Math.max(4, limit), 8) }).map((_, index) => (
        <article key={`skeleton-${index}`} className="tsebi-search-reco-card is-loading" aria-hidden="true">
          <div className="tsebi-search-reco-media" />
          <div className="tsebi-search-reco-name" />
          <div className="tsebi-search-reco-price" />
        </article>
      )),
    [limit]
  );

  return (
    <section className="tsebi-search-reco" aria-label={resolvedTitle}>
      <header className="tsebi-search-reco-head">
        <h3 className="tsebi-search-reco-title">{resolvedTitle}</h3>
      </header>

      <div className="tsebi-search-reco-track" role="list">
        {loading && !hasCards
          ? skeletons
          : cards.map((item) => (
              <article key={item.id} className="tsebi-search-reco-card" role="listitem">
                <button
                  type="button"
                  className={`tsebi-search-reco-fav ${favoriteSkus[item.id] ? "is-active" : ""}`}
                  aria-label={
                    !isLoggedIn
                      ? "Entre na conta para favoritar"
                      : favoriteSkus[item.id]
                        ? `Remover ${item.name} dos favoritos`
                        : `Favoritar ${item.name}`
                  }
                  disabled={favoritesLoading}
                  title={!isLoggedIn ? "Disponível apenas para clientes logados" : undefined}
                  onClick={async () => {
                    if (!isLoggedIn) {
                      setGuestFavoriteNotice("Você precisa estar logado para adicionar favoritos.");
                      return;
                    }
                    const isFavorite = Boolean(favoriteSkus[item.id]);
                    const nextActive = !isFavorite;
                    const nextMap = { ...favoriteSkus, [item.id]: nextActive };
                    setFavoriteSkus(nextMap);

                    try {
                      const nextFavorites = Object.keys(nextMap).filter((sku) => Boolean(nextMap[sku]));
                      const response = await updateFavorites(nextFavorites, {
                        headers: favoritesCsrfToken
                          ? {
                              "x-csrf-token": favoritesCsrfToken,
                            }
                          : undefined,
                      });
                      const confirmedMap: Record<string, boolean> = {};
                      (Array.isArray(response.favorites) ? response.favorites : []).forEach((sku) => {
                        const key = String(sku || "").trim();
                        if (!key) return;
                        confirmedMap[key] = true;
                      });
                      setFavoriteSkus(confirmedMap);
                      setFavoritesCsrfToken(String(response.csrfToken || favoritesCsrfToken || "").trim());

                      const anonId = getOrCreateAnonId();
                      const userId = String(window.localStorage.getItem("tsebi.user_id") || "").trim();
                      void trackCommerceEvent({
                        eventName: "favorite_toggle",
                        userId,
                        anonId,
                        productId: item.id,
                        category: item.category,
                        price: item.priceValue,
                        currency: item.currency,
                        source: placement,
                        query: String(query || "").trim(),
                        attributes: { active: nextActive },
                      });
                    } catch (error) {
                      setFavoriteSkus(favoriteSkus);
                      if (error instanceof HttpError && error.status === 403) {
                        setGuestFavoriteNotice("Sua sessão foi atualizada. Recarregue a página e tente novamente.");
                      }
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21s-6.7-4.5-9.2-8.2C.9 10 .8 6.8 3.3 4.9 5.8 3 8.7 3.7 10.5 5.6L12 7.1l1.5-1.5c1.8-1.9 4.7-2.6 7.2-.7 2.5 1.9 2.4 5.1.5 7.9C18.7 16.5 12 21 12 21z" />
                  </svg>
                </button>

                <Link
                  href={item.link}
                  className="tsebi-search-reco-link"
                  onClick={() => {
                    const anonId = getOrCreateAnonId();
                    const userId = String(window.localStorage.getItem("tsebi.user_id") || "").trim();
                    void trackCommerceEvent({
                      eventName: "click_recommendation",
                      userId,
                      anonId,
                      productId: item.id,
                      category: item.category,
                      price: item.priceValue,
                      currency: item.currency,
                      source: placement,
                      query: String(query || "").trim(),
                    });
                  }}
                >
                  <Image
                    className="tsebi-search-reco-image"
                    src={item.image}
                    alt={item.name}
                    width={720}
                    height={900}
                    onError={(event) => {
                      const element = event.currentTarget;
                      element.onerror = null;
                      element.src = "/images/placeholderreal.webp";
                    }}
                    unoptimized
                  />
                  <div className="tsebi-search-reco-meta">
                    <h4 className="tsebi-search-reco-name">{item.name}</h4>
                    <p className="tsebi-search-reco-price">{item.priceLabel}</p>
                  </div>
                </Link>
              </article>
            ))}
      </div>
      {guestFavoriteNotice ? (
        <div
          className={`tsebi-search-toast${isToastHiding ? " is-hiding" : ""}`}
          role="alert"
          aria-live="assertive"
        >
          {guestFavoriteNotice}
        </div>
      ) : null}
    </section>
  );
}


