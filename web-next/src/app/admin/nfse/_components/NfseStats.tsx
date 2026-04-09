"use client";

import type { NfseStats as NfseStatsType } from "../../../../../../types/nfse";

type NfseStatsProps = {
  stats: NfseStatsType;
};

export function NfseStats({ stats }: NfseStatsProps) {
  const cards = [
    { label: "EMITIDAS NO MES", value: stats.emitidas_mes, sub: null, cor: "#111111" },
    {
      label: "TOTAL FATURADO",
      value: stats.total_faturado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      sub: null,
      cor: "#111111",
    },
    {
      label: "PENDENTES",
      value: stats.pendentes,
      sub: "aguardando emissao",
      cor: stats.pendentes > 0 ? "#a16207" : "#111111",
    },
    {
      label: "ERROS",
      value: stats.erros,
      sub: stats.erros > 0 ? "requer atencao" : null,
      cor: stats.erros > 0 ? "#b91c1c" : "#111111",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "10px",
        marginBottom: "16px",
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "12px 14px",
          }}
        >
          <p style={{ fontSize: "10px", letterSpacing: "1px", color: "#6b7280", margin: "0 0 6px" }}>{card.label}</p>
          <p style={{ fontSize: "20px", fontWeight: 500, color: card.cor, margin: 0 }}>{card.value}</p>
          {card.sub ? <p style={{ fontSize: "10px", color: "#6b7280", margin: "3px 0 0" }}>{card.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}
