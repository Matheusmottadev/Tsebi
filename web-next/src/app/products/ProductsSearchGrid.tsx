"use client";

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
  primaryImage: string;
  secondaryImage: string;
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

export function ProductsSearchGrid({ items }: { items: ProductsSearchGridItem[] }) {
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});
  const [csrfToken, setCsrfToken] = useState("");
  const [loadingFavorites, setLoadingFavorites] = useState(false);
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
            <article
              key={item.key}
              className={`${styles.productsTightCard} ${item.isEditorial ? styles.productsTightCardEditorial : ""}`}
            >
              <button
                type="button"
                className={`${styles.productsTightFavorite} ${isFavorite ? styles.productsTightFavoriteActive : ""}`}
                aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                disabled={loadingFavorites}
                onClick={async () => {
                  if (!isLoggedIn) {
                    setNotice("Voce precisa estar logado para adicionar favoritos.");
                    return;
                  }

                  const previousMap = favoriteMap;
                  const nextMap = { ...favoriteMap, [item.id]: !isFavorite };
                  setFavoriteMap(nextMap);
                  setLoadingFavorites(true);

                  try {
                    const nextFavorites = Object.keys(nextMap).filter((id) => Boolean(nextMap[id]));
                    const response = await updateFavorites(nextFavorites, {
                      headers: csrfToken
                        ? {
                            "x-csrf-token": csrfToken,
                          }
                        : undefined,
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
                      setNotice("Sua sessao expirou. Faca login novamente para favoritar.");
                    }
                  } finally {
                    setLoadingFavorites(false);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.1A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"></path>
                </svg>
              </button>
              <Link href={item.href} className={styles.productsTightCardLink}>
                <div className={styles.productsTightMedia}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.primaryImage} alt={item.name} className={`${styles.productsTightImage} ${styles.productsTightImagePrimary}`} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.secondaryImage || item.primaryImage}
                    alt={`${item.name} - segunda foto`}
                    className={`${styles.productsTightImage} ${styles.productsTightImageSecondary}`}
                  />
                  <div className={styles.productsTightMeta}>
                    <p className={styles.productsTightName}>{item.name}</p>
                    <Price amountCents={Number(item.unitAmount || 0)} currency={item.currency} className={styles.productsTightPrice} />
                  </div>
                </div>
              </Link>
            </article>
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

