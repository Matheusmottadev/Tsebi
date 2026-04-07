"use client";

import { useEffect, useState } from "react";
import type { GiftCard, PublicUser } from "@/types";
import styles from "../account.module.css";
import type { AccountTab } from "./AccountShell";

type CardDef = {
  key: AccountTab;
  title: string;
  desc: (user: PublicUser) => string;
  btnLabel: string;
  linkLabel: string;
};

const CARDS: CardDef[] = [
  {
    key: "profile",
    title: "Meu Perfil",
    desc: (u) => `${u.email} · ${u.phone || "Telefone não cadastrado"}`,
    btnLabel: "Editar perfil",
    linkLabel: "Ver dados",
  },
  {
    key: "orders",
    title: "Meus Pedidos",
    desc: () => "Acompanhe o status dos seus pedidos, rastreamento e histórico de compras.",
    btnLabel: "Ver pedidos",
    linkLabel: "Rastrear entrega",
  },
  {
    key: "appointments",
    title: "Atendimentos Privados",
    desc: () =>
      "Agende uma consultoria de estilo exclusiva com um de nossos especialistas Tsebi.",
    btnLabel: "Agendar",
    linkLabel: "Meus agendamentos",
  },
  {
    key: "wishlist",
    title: "Lista de Desejos",
    desc: () => "Guarde suas peças favoritas e seja notificada sobre disponibilidade e novidades.",
    btnLabel: "Ver lista",
    linkLabel: "Adicionar peças",
  },
  {
    key: "recommendations",
    title: "Recomendações",
    desc: () =>
      "Curadoria exclusiva preparada pelos nossos estilistas com base no seu perfil.",
    btnLabel: "Ver recomendações",
    linkLabel: "Explorar coleção",
  },
  {
    key: "repairs",
    title: "Serviço de Reparos",
    desc: () =>
      "Reparos e ajustes profissionais garantidos por 1 ano em todas as suas peças Tsebi.",
    btnLabel: "Solicitar reparo",
    linkLabel: "Como funciona",
  },
];

function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function GiftCardCard({ onNavigate }: { onNavigate: (tab: AccountTab) => void }) {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [linkCode, setLinkCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    fetch("/api/gift-cards/mine", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCards(d.giftCards ?? []))
      .catch(() => {});
  }, [success]);

  const totalCents = cards.reduce((s, c) => s + c.balanceCents, 0);

  const handleLink = async () => {
    const code = linkCode.trim().toUpperCase();
    if (!code) return;
    setLinking(true);
    setError("");
    setSuccess(false);
    try {
      const csrfToken = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("tsebi.csrf="))
        ?.split("=")[1] ?? "";

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
        const msgs: Record<string, string> = {
          GC_NOT_FOUND: "Gift card não encontrado.",
          GC_INACTIVE: "Este gift card está inativo.",
          GC_EXPIRED: "Este gift card está expirado.",
          GC_ALREADY_LINKED: "Este gift card já está vinculado.",
        };
        setError(msgs[data.error] || "Não foi possível vincular o gift card.");
      } else {
        setLinkCode("");
        setSuccess(true);
        setShowInput(false);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>Gift Cards</h2>

      {cards.length > 0 ? (
        <p className={styles.cardDesc}>
          Saldo disponível: <strong>{formatBRL(totalCents)}</strong>
          {cards.length > 1 && ` · ${cards.length} gift cards`}
        </p>
      ) : (
        <p className={styles.cardDesc}>Você ainda não tem gift cards vinculados.</p>
      )}

      {success && (
        <p style={{ fontSize: 12, color: "#16a34a", marginBottom: 8 }}>
          Gift card vinculado com sucesso!
        </p>
      )}

      {showInput && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={linkCode}
              onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
              placeholder="GC-XXXX-XXXX-XXXX"
              maxLength={20}
              style={{
                flex: 1,
                padding: "8px 0",
                border: "none",
                borderBottom: "1px solid #ccc",
                background: "transparent",
                fontSize: 13,
                letterSpacing: 1,
                outline: "none",
                fontFamily: "monospace",
              }}
            />
            <button
              type="button"
              className={styles.btnPill}
              onClick={handleLink}
              disabled={linking || linkCode.length < 6}
              style={{ padding: "6px 14px", fontSize: 11 }}
            >
              {linking ? "..." : "Vincular"}
            </button>
          </div>
          {error && <p style={{ fontSize: 12, color: "red", marginTop: 4 }}>{error}</p>}
        </div>
      )}

      <div className={styles.cardActions}>
        {cards.length > 0 && (
          <button
            type="button"
            className={styles.btnPill}
            onClick={() => onNavigate("gift_cards")}
          >
            Ver gift cards
          </button>
        )}
        <button
          type="button"
          className={styles.btnText}
          onClick={() => { setShowInput((v) => !v); setError(""); }}
        >
          {showInput ? "Cancelar" : "Adicionar gift card"}
        </button>
      </div>
    </div>
  );
}

type Props = {
  user: PublicUser;
  onNavigate: (tab: AccountTab) => void;
};

export function AccountOverview({ user, onNavigate }: Props) {
  return (
    <div className={styles.cardGrid}>
      {CARDS.map(({ key, title, desc, btnLabel, linkLabel }) => (
        <div key={key} className={styles.card}>
          <h2 className={styles.cardTitle}>{title}</h2>
          <p className={styles.cardDesc}>{desc(user)}</p>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.btnPill}
              onClick={() => onNavigate(key)}
            >
              {btnLabel}
            </button>
            <button
              type="button"
              className={styles.btnText}
              onClick={() => onNavigate(key)}
            >
              {linkLabel}
            </button>
          </div>
        </div>
      ))}
      <GiftCardCard onNavigate={onNavigate} />
    </div>
  );
}
