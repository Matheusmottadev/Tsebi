"use client";

import type { PublicUser } from "@/types";
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
  {
    key: "gift_cards",
    title: "Gift Cards",
    desc: () => "Consulte o saldo dos seus gift cards e adicione novos.",
    btnLabel: "Ver gift cards",
    linkLabel: "Adicionar gift card",
  },
];

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
    </div>
  );
}
