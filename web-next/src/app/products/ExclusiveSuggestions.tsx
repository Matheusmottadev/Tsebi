"use client";

import Link from "next/link";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getOrCreateAnonId } from "@/lib/analytics";
import { buildRecommendationSignalPayload } from "@/lib/recommendationSignals";
import { getPersonalizedProducts } from "@/services/products";
import type { Product } from "@/types";
import styles from "./page.module.css";

export type ExclusiveSuggestionFallbackCard = {
  id: string;
  name: string;
  image: string;
  href: string;
};

type ExclusiveSuggestionCard = ExclusiveSuggestionFallbackCard & {
  category: string;
  collection: string;
  material: string;
};

type ExclusiveSuggestionsProps = {
  query: string;
  contextHint: string;
  fallbackCards: ExclusiveSuggestionFallbackCard[];
};

type ExclusiveSuggestionsBoundaryProps = {
  fallbackCards: ExclusiveSuggestionFallbackCard[];
  children: ReactNode;
};

type ExclusiveSuggestionsBoundaryState = {
  hasError: boolean;
};

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function toCard(product: Product): ExclusiveSuggestionCard | null {
  const id = String(product.sku || product.id || "").trim();
  if (!id) return null;
  const rawHref = String(product.href || "").trim();
  const href = rawHref.startsWith("/") ? rawHref : `/product/${encodeURIComponent(String(product.id || id).trim())}`;
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
    name: String(product.name || "Produto Tsebi").trim(),
    image,
    href,
    category: String(product.category || "").trim(),
    collection: String(product.collection || "").trim(),
    material: String(product.material || "").trim(),
  };
}

function extractReferrerTerms(): string[] {
  if (typeof document === "undefined") return [];
  const raw = String(document.referrer || "").trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    const params = ["q", "query", "p", "k", "wd", "text"];
    const collected = params
      .map((key) => String(url.searchParams.get(key) || "").trim())
      .filter(Boolean)
      .join(" ");
    return tokenize(collected);
  } catch {
    return [];
  }
}

function rankCards(
  cards: ExclusiveSuggestionCard[],
  input: {
    queryTokens: string[];
    intentTokens: string[];
    topCategory: string;
    topClickedSku: string;
    recentViewed: string[];
    cartSkus: string[];
  }
): ExclusiveSuggestionCard[] {
  const topCategory = normalizeText(input.topCategory);
  const topClickedSku = normalizeText(input.topClickedSku);
  const recentViewedSet = new Set(input.recentViewed.map((value) => normalizeText(value)));
  const cartSkusSet = new Set(input.cartSkus.map((value) => normalizeText(value)));

  return [...cards]
    .map((card, index) => {
      const sku = normalizeText(card.id);
      const name = normalizeText(card.name);
      const category = normalizeText(card.category);
      const collection = normalizeText(card.collection);
      const material = normalizeText(card.material);
      const searchable = `${name} ${category} ${collection} ${material}`;

      let score = 0;

      if (sku && sku === topClickedSku) score += 18;
      if (sku && recentViewedSet.has(sku)) score += 12;
      if (sku && cartSkusSet.has(sku)) score += 8;
      if (topCategory && category && category === topCategory) score += 6;

      input.queryTokens.forEach((token) => {
        if (searchable.includes(token)) score += 30;
      });

      input.intentTokens.forEach((token) => {
        if (name.includes(token)) score += 3;
        if (category.includes(token)) score += 2;
        if (collection.includes(token)) score += 1;
        if (material.includes(token)) score += 1;
      });

      return { card, score, index };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.card);
}

function cardMatchesTokens(card: ExclusiveSuggestionCard, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const searchable = normalizeText([card.name, card.category, card.collection, card.material].join(" "));
  return tokens.some((token) => searchable.includes(token));
}

export function ExclusiveSuggestions({ query, contextHint, fallbackCards }: ExclusiveSuggestionsProps) {
  return (
    <ExclusiveSuggestionsErrorBoundary fallbackCards={fallbackCards}>
      <ExclusiveSuggestionsContent query={query} contextHint={contextHint} fallbackCards={fallbackCards} />
    </ExclusiveSuggestionsErrorBoundary>
  );
}

class ExclusiveSuggestionsErrorBoundary extends Component<
  ExclusiveSuggestionsBoundaryProps,
  ExclusiveSuggestionsBoundaryState
> {
  state: ExclusiveSuggestionsBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ExclusiveSuggestionsBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (!this.state.hasError) return this.props.children;
    const fallback = this.props.fallbackCards.slice(0, 2);
    if (fallback.length === 0) return null;
    return (
      <section className={styles.productsExclusiveSection} aria-label="Seleção Exclusiva para você">
        <h3 className={styles.productsExclusiveTitle}>Seleção Exclusiva para você</h3>
        <p className={styles.productsExclusiveSubtitle}>
          Curadoria exclusiva da Tsebi, selecionada com base no seu perfil e nos seus gostos.
        </p>
        <div className={styles.productsExclusiveGrid}>
          {fallback.map((card) => (
            <article key={card.id} className={styles.productsExclusiveCard}>
              <Link href={card.href} className={styles.productsExclusiveCardLink}>
                <div className={styles.productsExclusiveMedia}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.image} alt={card.name} className={styles.productsExclusiveImage} loading="lazy" decoding="async" />
                </div>
                <p className={styles.productsExclusiveName}>{card.name}</p>
              </Link>
            </article>
          ))}
        </div>
      </section>
    );
  }
}

function ExclusiveSuggestionsContent({ query, contextHint, fallbackCards }: ExclusiveSuggestionsProps) {
  const [cards, setCards] = useState<ExclusiveSuggestionFallbackCard[]>(fallbackCards.slice(0, 2));

  const fallback = useMemo(() => fallbackCards.slice(0, 2), [fallbackCards]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const safeFallback = fallback.slice(0, 2);

      try {
        const signals = buildRecommendationSignalPayload();
        const referrerTokens = extractReferrerTerms();
        const queryTokens = tokenize(query);
        const signalTokens = Array.isArray(signals.searches) ? signals.searches.flatMap((entry) => tokenize(entry)) : [];
        const intentTokens = Array.from(new Set([...queryTokens, ...tokenize(contextHint), ...signalTokens, ...referrerTokens]));
        const hasSignals =
          Boolean(signals.topCategory || signals.topClickedSku || signals.topPriceBand) ||
          (Array.isArray(signals.searches) && signals.searches.length > 0) ||
          (Array.isArray(signals.recentViewed) && signals.recentViewed.length > 0) ||
          (Array.isArray(signals.cartSkus) && signals.cartSkus.length > 0) ||
          referrerTokens.length > 0;

        if (!hasSignals) {
          if (!cancelled) setCards(safeFallback);
          return;
        }

        const userId =
          typeof window !== "undefined" ? String(window.localStorage.getItem("tsebi.user_id") || "").trim() : "";
        const anonId = getOrCreateAnonId();
        const response = await getPersonalizedProducts(userId, 8, signals, {
          anonId,
          placement: "products_sidebar_exclusive",
        });
        if (cancelled) return;

        const mapped = (Array.isArray(response.products) ? response.products : [])
          .map(toCard)
          .filter((item): item is ExclusiveSuggestionCard => Boolean(item));
        const queryMatched = queryTokens.length > 0 ? mapped.filter((card) => cardMatchesTokens(card, queryTokens)) : mapped;
        const candidatePool = queryTokens.length > 0 ? queryMatched : mapped;
        const ranked = rankCards(candidatePool, {
          queryTokens,
          intentTokens,
          topCategory: signals.topCategory || "",
          topClickedSku: signals.topClickedSku || "",
          recentViewed: Array.isArray(signals.recentViewed) ? signals.recentViewed : [],
          cartSkus: Array.isArray(signals.cartSkus) ? signals.cartSkus : [],
        });

        const dedupe = new Set<string>();
        const merged: ExclusiveSuggestionFallbackCard[] = [];
        [...ranked, ...safeFallback].forEach((item) => {
          if (merged.length >= 2) return;
          const key = normalizeText(item.id);
          if (!key || dedupe.has(key)) return;
          dedupe.add(key);
          merged.push({
            id: item.id,
            name: item.name,
            image: item.image,
            href: item.href,
          });
        });

        setCards(merged.length > 0 ? merged : safeFallback);
      } catch {
        if (!cancelled) setCards(safeFallback);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [contextHint, fallback, query]);

  if (cards.length === 0) return null;

  return (
    <section className={styles.productsExclusiveSection} aria-label="Seleção Exclusiva para você">
      <h3 className={styles.productsExclusiveTitle}>Seleção Exclusiva para você</h3>
      <p className={styles.productsExclusiveSubtitle}>
        Curadoria exclusiva da Tsebi, selecionada com base no seu perfil e nos seus gostos.
      </p>
      <div className={styles.productsExclusiveGrid}>
        {cards.slice(0, 2).map((card) => (
          <article key={card.id} className={styles.productsExclusiveCard}>
            <Link href={card.href} className={styles.productsExclusiveCardLink}>
              <div className={styles.productsExclusiveMedia}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.image}
                  alt={card.name}
                  className={styles.productsExclusiveImage}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className={styles.productsExclusiveName}>{card.name}</p>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
