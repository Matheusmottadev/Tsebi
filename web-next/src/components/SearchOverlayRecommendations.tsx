"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getOrCreateAnonId, trackCommerceEvent } from "@/lib/analytics";
import { getPersonalizedProducts } from "@/services/products";
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
};

function toCard(product: Product): RecommendationCard | null {
  const id = String(product.sku || product.id || "").trim();
  if (!id) return null;
  const link = String(product.href || "").trim().startsWith("/")
    ? String(product.href || "").trim()
    : `/product/${encodeURIComponent(id)}`;
  return {
    id,
    name: String(product.name || "Produto Tsebi"),
    priceLabel: String(product.priceLabel || ""),
    image: String(product.image || "/images/placeholderreal.webp"),
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
}: SearchOverlayRecommendationsProps) {
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<RecommendationCard[]>([]);
  const [resolvedTitle, setResolvedTitle] = useState(title);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const anonId = getOrCreateAnonId();
        const userId = String(window.localStorage.getItem("tsebi.user_id") || "").trim();
        const response = await getPersonalizedProducts(userId, limit, {}, { anonId, placement });
        if (cancelled) return;

        const mapped = (Array.isArray(response.products) ? response.products : [])
          .map(toCard)
          .filter((item): item is RecommendationCard => Boolean(item))
          .slice(0, limit);

        setCards(mapped);
        setResolvedTitle(String(response.title || title));

        if (mapped.length > 0) {
          void trackCommerceEvent({
            eventName: "view_recommendations",
            userId,
            anonId,
            source: placement,
            query: String(query || "").trim(),
            attributes: {
              product_ids: mapped.map((item) => item.id),
              total: mapped.length,
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
  }, [isOpen, limit, placement, query, title]);

  const hasCards = cards.length > 0;

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
                <button type="button" className="tsebi-search-reco-fav" aria-label={`Favoritar ${item.name}`}>
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="tsebi-search-reco-image"
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      const element = event.currentTarget;
                      element.onerror = null;
                      element.src = "/images/placeholderreal.webp";
                    }}
                  />
                  <h4 className="tsebi-search-reco-name">{item.name}</h4>
                  <p className="tsebi-search-reco-price">{item.priceLabel}</p>
                </Link>
              </article>
            ))}
      </div>
    </section>
  );
}

