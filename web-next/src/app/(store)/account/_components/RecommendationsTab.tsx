"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { get } from "@/lib/http";
import styles from "../account.module.css";

interface RecommendationItem {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  badge?: string | null;
  reason?: string | null;
  currency?: string;
}

interface RecommendationsResponse {
  items?: RecommendationItem[];
  recommendations?: RecommendationItem[];
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function getRecommendationKey(item: RecommendationItem, index: number): string {
  const parts = [
    String(item.id || "").trim(),
    String(item.name || "").trim(),
    String(item.badge || "").trim(),
    String(item.reason || "").trim(),
  ].filter(Boolean);

  return parts.length ? `${parts.join("::")}::${index}` : `recommendation-${index}`;
}

export function RecommendationsTab() {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    get<RecommendationsResponse>("/api/recommendations")
      .then((res) => {
        setItems(res.items ?? res.recommendations ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.loading}>Carregando recomendações…</div>;

  if (error || !items.length) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>Nenhuma recomendação ainda</p>
        <p className={styles.emptyDesc}>
          Nossa equipe está preparando uma curadoria exclusiva para você.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.recsGrid}>
      {items.map((item, index) => (
        <div key={getRecommendationKey(item, index)} className={styles.recCard}>
          <div className={styles.recImgWrap}>
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                style={{ objectFit: "cover" }}
              />
            ) : null}
            {item.badge && <span className={styles.recBadge}>{item.badge}</span>}
          </div>
          <p className={styles.recName}>{item.name}</p>
          <p className={styles.recPrice}>{formatBRL(item.price)}</p>
          {item.reason && <p className={styles.recReason}>"{item.reason}"</p>}
          <button type="button" className={styles.btnPill}>
            Adicionar ao carrinho
          </button>
        </div>
      ))}
    </div>
  );
}
