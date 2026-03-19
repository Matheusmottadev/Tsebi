"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Price } from "@/components/Price";
import { getOrCreateAnonId, trackCommerceEvent } from "@/lib/analytics";
import { HttpError } from "@/lib/http";
import { getFavorites, updateFavorites } from "@/services/auth";
import styles from "./page.module.css";

export type ProductsSearchGridItem = {
  key: string;
  id: string;
  name: string;
  href: string;
  category: string;
  currency: string;
  unitAmount: number;
  images: string[];
  isEditorial: boolean;
};

function toFavoriteMap(ids: string[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  (Array.isArray(ids) ? ids : []).forEach((entry) => {
    const id = String(entry || "").trim();
    if (!id) return;
    next[id] = true;
  });
  return next;
}

function ProductsSearchCard({
  item,
  isFavorite,
  isPending,
  onFavoriteClick,
}: {
  item: ProductsSearchGridItem;
  isFavorite: boolean;
  isPending: boolean;
  onFavoriteClick: () => void;
}) {
  const images = item.images.length > 0 ? item.images : [""];
  const hasMultipleImages = images.length > 1;

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
      if (dx > 5 || dy > 5) {
        isHorizontalRef.current = dx > dy;
      }
    }
    if (isHorizontalRef.current) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (isHorizontalRef.current && Math.abs(deltaX) > 30) {
      isSwipingRef.current = true;
      setActiveIndex((prev) => (deltaX < 0 ? Math.min(prev + 1, images.length - 1) : Math.max(prev - 1, 0)));
    }
    isHorizontalRef.current = null;
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    if (isSwipingRef.current) {
      e.preventDefault();
      isSwipingRef.current = false;
    }
  };

  return (
    <article className={`${styles.productsTightCard} ${item.isEditorial ? styles.productsTightCardEditorial : ""}`}>
      <button
        type="button"
        className={`${styles.productsTightFavorite} ${isFavorite ? styles.productsTightFavoriteActive : ""}`}
        aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        aria-busy={isPending}
        onClick={onFavoriteClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.1A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"></path>
        </svg>
      </button>

      <Link
        href={item.href}
        className={styles.productsTightCardLink}
        onClick={handleLinkClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.productsTightMedia}>
          {images.map((src, i) => (
            <Image
              key={`${item.id}-${i}-${src}`}
              src={src}
              alt={i === 0 ? item.name : `${item.name} - foto ${i + 1}`}
              width={900}
              height={1200}
              className={`${styles.productsTightImage} ${i === 0 ? styles.productsTightImagePrimary : styles.productsTightImageSecondary} ${i === activeIndex ? styles.productsTightImageActive : ""}`}
              unoptimized
            />
          ))}
          {hasMultipleImages && (
            <div className={styles.productsTightDots} aria-hidden="true">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`${styles.productsTightDot}${i === activeIndex ? ` ${styles.productsTightDotActive}` : i < activeIndex ? ` ${styles.productsTightDotDone}` : ""}`}
                />
              ))}
            </div>
          )}
        </div>
      </Link>

      <div className={styles.productsTightMeta}>
        <p className={styles.productsTightName}>{item.name}</p>
        <Price amountCents={Number(item.unitAmount || 0)} currency={item.currency} className={styles.productsTightPrice} />
      </div>
    </article>
  );
}

export function ProductsSearchGrid({ items }: { items: ProductsSearchGridItem[] }) {
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});
  const [csrfToken, setCsrfToken] = useState("");
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [pendingFavoriteId, setPendingFavoriteId] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [notice, setNotice] = useState("");
  const [hidingNotice, setHidingNotice] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadingFavorites(true);
      try {
        const response = await getFavorites({ cache: "no-store" });
        if (cancelled) return;
        setIsLoggedIn(true);
        setFavoriteMap(toFavoriteMap(response.favorites));
        setCsrfToken(String(response.csrfToken || "").trim());
      } catch (error) {
        if (cancelled) return;
        setIsLoggedIn(false);
        if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
          setFavoriteMap({});
          setCsrfToken("");
        }
      } finally {
        if (!cancelled) setLoadingFavorites(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    setHidingNotice(false);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setHidingNotice(true), 5600);
    clearTimerRef.current = window.setTimeout(() => {
      setNotice("");
      setHidingNotice(false);
    }, 6000);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    };
  }, [notice]);

  return (
    <>
      <div className={styles.productsTightGrid}>
        {items.map((item) => {
          const isFavorite = Boolean(favoriteMap[item.id]);
          return (
            <ProductsSearchCard
              key={item.key}
              item={item}
              isFavorite={isFavorite}
              isPending={pendingFavoriteId === item.id}
              onFavoriteClick={async () => {
                if (!isLoggedIn) {
                  setNotice("Voce precisa estar logado para adicionar favoritos.");
                  return;
                }

                const previousMap = favoriteMap;
                const nextMap = { ...favoriteMap, [item.id]: !isFavorite };
                setFavoriteMap(nextMap);
                setPendingFavoriteId(item.id);

                try {
                  const nextFavorites = Object.keys(nextMap).filter((id) => Boolean(nextMap[id]));
                  const response = await updateFavorites(nextFavorites, {
                    headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
                  });
                  setFavoriteMap(toFavoriteMap(response.favorites));
                  setCsrfToken(String(response.csrfToken || csrfToken || "").trim());

                  void trackCommerceEvent({
                    eventName: "favorite_toggle",
                    anonId: getOrCreateAnonId(),
                    productId: item.id,
                    category: item.category,
                    price: Number(item.unitAmount || 0) / 100,
                    currency: item.currency || "brl",
                    source: "products_search_grid",
                    attributes: { active: !isFavorite },
                  });
                } catch (error) {
                  setFavoriteMap(previousMap);
                  if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
                    setIsLoggedIn(false);
                    setNotice("Sua sessão expirou. Faça login novamente para favoritar.");
                  }
                } finally {
                  setPendingFavoriteId("");
                }
              }}
            />
          );
        })}
      </div>

      {notice ? (
        <div className={`${styles.novidadesToast} ${hidingNotice ? styles.novidadesToastHiding : ""}`} role="alert" aria-live="assertive">
          {notice}
        </div>
      ) : null}
    </>
  );
}
