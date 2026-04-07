"use client";

import { useEffect, useState } from "react";
import styles from "../account.module.css";
import type { GiftCard } from "@/types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function maskCode(code: string): string {
  const parts = code.split("-");
  if (parts.length < 4) return code;
  return `${parts[0]}-${parts[1]}-••••-••••`;
}

const GC_ERRORS: Record<string, string> = {
  GC_NOT_FOUND: "Gift card não encontrado.",
  GC_INACTIVE: "Este gift card está inativo.",
  GC_EXPIRED: "Este gift card está expirado.",
  GC_ALREADY_LINKED: "Este gift card já está vinculado a uma conta.",
  GC_LINK_FAILED: "Não foi possível vincular o gift card.",
};

export function GiftCardsTab() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkCode, setLinkCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkSuccess, setLinkSuccess] = useState(false);

  const loadCards = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gift-cards/mine", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCards(data.giftCards || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCards(); }, []);

  const handleLink = async () => {
    const code = linkCode.trim().toUpperCase();
    if (!code) return;
    setLinking(true);
    setLinkError("");
    setLinkSuccess(false);
    try {
      // get csrf token first
      const csrfRes = await fetch("/api/csrf-token", { credentials: "include" });
      const { csrfToken } = csrfRes.ok ? await csrfRes.json() : { csrfToken: "" };

      const res = await fetch("/api/gift-cards/link", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkError(GC_ERRORS[data.error] || "Não foi possível vincular o gift card.");
      } else {
        setLinkCode("");
        setLinkSuccess(true);
        await loadCards();
        setTimeout(() => setLinkSuccess(false), 3000);
      }
    } catch {
      setLinkError("Erro de conexão. Tente novamente.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className={styles.tabContent}>
      <h2 className={styles.sectionTitle}>Meus Gift Cards</h2>

      {loading && <p className={styles.emptyState}>Carregando…</p>}

      {!loading && cards.length === 0 && (
        <p className={styles.emptyState}>
          Você ainda não tem gift cards vinculados à sua conta.
        </p>
      )}

      {!loading && cards.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {cards.map((card) => {
            const usageRatio = card.initialBalanceCents > 0
              ? card.balanceCents / card.initialBalanceCents
              : 0;
            const isExpired = card.expiresAt ? new Date(card.expiresAt) <= new Date() : false;
            return (
              <div
                key={card.id}
                style={{
                  border: "1px solid #e8e8e8",
                  borderRadius: 4,
                  padding: "20px 24px",
                  background: "#fafaf8",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: 2, color: "#aaa", marginBottom: 4 }}>GIFT CARD</div>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#111", fontWeight: 400 }}>
                      {formatCents(card.balanceCents)}
                    </div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{maskCode(card.code)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: 1.5,
                        padding: "4px 10px",
                        borderRadius: 2,
                        background: !card.active || isExpired ? "#f5e6e6" : "#e6f5ec",
                        color: !card.active || isExpired ? "#c0392b" : "#27ae60",
                      }}
                    >
                      {!card.active ? "INATIVO" : isExpired ? "EXPIRADO" : "ATIVO"}
                    </span>
                    {card.expiresAt && (
                      <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
                        Expira: {new Date(card.expiresAt).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      height: 3,
                      background: "#e8e8e8",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(usageRatio * 100)}%`,
                        background: "#111",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "#bbb" }}>
                    <span>R$ 0</span>
                    <span>Valor inicial: {formatCents(card.initialBalanceCents)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add gift card section */}
      <div style={{ borderTop: "1px solid #eee", paddingTop: 24 }}>
        <h3 style={{ fontSize: 11, letterSpacing: 2, color: "#555", marginBottom: 16 }}>ADICIONAR GIFT CARD</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              placeholder="GC-XXXX-XXXX-XXXX"
              value={linkCode}
              onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
              maxLength={20}
              style={{
                width: "100%",
                padding: "10px 0",
                borderBottom: "1px solid #ccc",
                border: "none",
                borderBottom: "1px solid #ccc",
                background: "transparent",
                fontSize: 14,
                letterSpacing: 1,
                outline: "none",
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleLink}
            disabled={linking || !linkCode.trim()}
            style={{
              padding: "10px 20px",
              background: linkCode.trim() ? "#111" : "#ccc",
              color: "#fff",
              border: "none",
              cursor: linkCode.trim() ? "pointer" : "not-allowed",
              fontSize: 10,
              letterSpacing: 2,
            }}
          >
            {linking ? "…" : "VINCULAR"}
          </button>
        </div>
        {linkError && <p style={{ fontSize: 12, color: "#c0392b", marginTop: 8 }}>{linkError}</p>}
        {linkSuccess && <p style={{ fontSize: 12, color: "#27ae60", marginTop: 8 }}>Gift card vinculado com sucesso!</p>}
      </div>
    </div>
  );
}
