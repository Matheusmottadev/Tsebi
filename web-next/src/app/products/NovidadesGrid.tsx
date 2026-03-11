"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getOrCreateAnonId, trackCommerceEvent } from "@/lib/analytics";
import { HttpError } from "@/lib/http";
import { getFavorites, updateFavorites } from "@/services/auth";
import styles from "./page.module.css";

export type NovidadesGridTile = {
  key: string;
  id: string;
  name: string;
  image: string;
  secondaryImage: string;
  priceLabel: string;
  category: string;
  priceValue: number;
  currency: string;
  href: string;
  variant: "default" | "large";
};

type NovidadesGridProps = {
  tiles: NovidadesGridTile[];
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

export function NovidadesGrid({ tiles }: NovidadesGridProps) {
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
      <div className={styles.novidadesGrid}>
        {tiles.map((tile) => {
          const isFavorite = Boolean(favoriteMap[tile.id]);
          return (
            <article
              key={tile.key}
              className={`${styles.novidadesCard} ${tile.variant === "large" ? styles.novidadesCardLarge : ""}`}
            >
              <button
                type="button"
                className={`${styles.novidadesFavoriteBtn} ${isFavorite ? styles.novidadesFavoriteBtnActive : ""}`}
                aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                disabled={loadingFavorites}
                onClick={async () => {
                  if (!isLoggedIn) {
                    setNotice("Você precisa estar logado para adicionar favoritos.");
                    return;
                  }

                  const previousMap = favoriteMap;
                  const nextMap = { ...favoriteMap, [tile.id]: !isFavorite };
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
                      productId: tile.id,
                      category: tile.category,
                      price: Number(tile.priceValue || 0),
                      currency: tile.currency || "brl",
                      source: "products_novidades_grid",
                      attributes: { active: !isFavorite },
                    });
                  } catch (error) {
                    setFavoriteMap(previousMap);
                    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
                      setIsLoggedIn(false);
                      setNotice("Sua sessão expirou. Faça login novamente para favoritar.");
                    }
                  } finally {
                    setLoadingFavorites(false);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s-6.7-4.5-9.2-8.2C.9 10 .8 6.8 3.3 4.9 5.8 3 8.7 3.7 10.5 5.6L12 7.1l1.5-1.5c1.8-1.9 4.7-2.6 7.2-.7 2.5 1.9 2.4 5.1.5 7.9C18.7 16.5 12 21 12 21z" />
                </svg>
              </button>

              <Link href={tile.href} className={styles.novidadesLink}>
                <Image
                  src={tile.image}
                  alt={tile.name}
                  width={900}
                  height={1200}
                  className={`${styles.novidadesImage} ${styles.novidadesImagePrimary}`}
                  unoptimized
                />
                <Image
                  src={tile.secondaryImage || tile.image}
                  alt={`${tile.name} - segunda foto`}
                  width={900}
                  height={1200}
                  className={`${styles.novidadesImage} ${styles.novidadesImageSecondary}`}
                  unoptimized
                  onError={(event) => {
                    const element = event.currentTarget;
                    element.onerror = null;
                    element.src = tile.image || "/images/placeholderreal.webp";
                  }}
                />
                <div className={styles.novidadesMeta}>
                  <p className={styles.novidadesName}>{tile.name}</p>
                  <p className={styles.novidadesPrice}>{tile.priceLabel}</p>
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
