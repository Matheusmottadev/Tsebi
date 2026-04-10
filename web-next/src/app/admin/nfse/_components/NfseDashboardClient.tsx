"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOrderAdmin, type NfseRow, type NfseStats } from "@/services/admin";
import { NfseStats as NfseStatsCards } from "./NfseStats";
import NfseTabela from "./NfseTabela";
import NfseFormulario, { type PedidoPrefill } from "../emitir/_components/NfseFormulario";

type DashboardProps = {
  notas: NfseRow[];
  total: number;
  stats: NfseStats;
  searchParams: Record<string, string | undefined>;
  initialPedidoPrefill: PedidoPrefill | null;
  initialPedidoId?: string;
  initialSubstituir?: string;
};

function mapOrderToPrefill(order: Awaited<ReturnType<typeof getOrderAdmin>>): PedidoPrefill {
  const shipping = (order.shipping || {}) as Record<string, unknown>;
  const shippingAddress =
    shipping.shippingAddress && typeof shipping.shippingAddress === "object"
      ? (shipping.shippingAddress as Record<string, unknown>)
      : shipping;

  return {
    id: order.id,
    cliente_nome: String(order.userName || shipping.fullName || ""),
    cliente_email: String(order.userEmail || shipping.email || ""),
    cliente_cpf: String(shipping.customerCpf || shipping.cpf || shipping.document || ""),
    cep: String(shippingAddress.cep || shipping.cep || order.shippingDestinationZip || ""),
    logradouro: String(shippingAddress.street || shippingAddress.logradouro || shipping.logradouro || ""),
    numero: String(shippingAddress.number || shippingAddress.numero || shipping.numero || ""),
    bairro: String(shippingAddress.district || shippingAddress.bairro || shipping.bairro || ""),
    municipio: String(shippingAddress.city || shippingAddress.municipio || shipping.municipio || ""),
    uf: String(shippingAddress.state || shippingAddress.uf || shipping.uf || ""),
    total: Number(order.amount || 0) / 100,
  };
}

export default function NfseDashboardClient({
  notas,
  total,
  stats,
  searchParams,
  initialPedidoPrefill,
  initialPedidoId,
  initialSubstituir,
}: DashboardProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(Boolean(initialPedidoId));
  const [pedidoId, setPedidoId] = useState<string | undefined>(initialPedidoId);
  const [substituir, setSubstituir] = useState<string | undefined>(initialSubstituir);
  const [pedidoPrefill, setPedidoPrefill] = useState<PedidoPrefill | null>(initialPedidoPrefill);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [bulkQueue, setBulkQueue] = useState<string[]>([]);
  const [isRefreshing, startTransition] = useTransition();

  async function openDrawer(next: { pedidoId?: string; substituir?: string } = {}) {
    setDrawerError(null);
    setSubstituir(next.substituir);
    setPedidoId(next.pedidoId);
    setDrawerOpen(true);

    if (!next.pedidoId) {
      setPedidoPrefill(null);
      return;
    }

    if (next.pedidoId === pedidoId && pedidoPrefill) return;

    setDrawerLoading(true);
    try {
      const order = await getOrderAdmin(next.pedidoId, { cache: "no-store" });
      setPedidoPrefill(mapOrderToPrefill(order));
    } catch (error) {
      setPedidoPrefill(null);
      setDrawerError(error instanceof Error ? error.message : "Não foi possível carregar os dados do pedido.");
    } finally {
      setDrawerLoading(false);
    }
  }

  async function openBulkEmitQueue(pedidoIds: string[]) {
    const uniqueIds = Array.from(new Set(pedidoIds.map((value) => String(value || "").trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return;
    setBulkQueue(uniqueIds);
    await openDrawer({ pedidoId: uniqueIds[0] });
  }

  function moveToNextQueuedOrder() {
    setBulkQueue((current) => {
      const [, ...rest] = current;
      const nextPedidoId = rest[0];
      if (nextPedidoId) {
        void openDrawer({ pedidoId: nextPedidoId });
      } else {
        closeDrawer();
      }
      return rest;
    });
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerError(null);
    setDrawerLoading(false);
    setPedidoId(undefined);
    setSubstituir(undefined);
    setPedidoPrefill(null);
    setBulkQueue([]);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 600, color: "#111111", margin: 0 }}>Notas Fiscais</h1>
          <p style={{ fontSize: "11px", color: "#6b7280", margin: "4px 0 0" }}>
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <a href="/api/nfse/export" style={{ background: "#ffffff", border: "1px solid #d1d5db", color: "#111111", padding: "7px 14px", borderRadius: "6px", fontSize: "12px", textDecoration: "none" }}>
            Exportar CSV
          </a>
          <button
            type="button"
            onClick={() => void openDrawer()}
            style={{ background: "#111111", color: "#ffffff", padding: "7px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, border: "1px solid #111111", cursor: "pointer" }}
          >
            + EMITIR NOTA
          </button>
        </div>
      </div>

      <NfseStatsCards stats={stats} />
      <NfseTabela
        notas={notas}
        total={total}
        searchParams={searchParams}
        onOpenDrawer={(next) => {
          void openDrawer(next);
        }}
        onOpenBulkEmit={(pedidoIds) => {
          void openBulkEmitQueue(pedidoIds);
        }}
      />

      {drawerOpen ? (
        <>
          <button
            type="button"
            aria-label="Fechar emissor de NFS-e"
            onClick={closeDrawer}
            style={{ position: "fixed", top: 0, left: 220, right: 0, bottom: 0, background: "rgba(15, 15, 15, 0.38)", border: "none", padding: 0, margin: 0, cursor: "pointer" }}
          />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "480px", background: "#111", borderLeft: "0.5px solid #2a2a2a", padding: "28px", overflowY: "auto", zIndex: 2, boxSizing: "border-box", boxShadow: "-24px 0 60px rgba(0,0,0,0.16)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
              <h2 style={{ fontSize: "22px", fontWeight: 500, color: "#fff", margin: 0 }}>Emitir NFS-e</h2>
              <button type="button" onClick={closeDrawer} style={{ color: "#555", fontSize: "20px", textDecoration: "none", lineHeight: 1, background: "transparent", border: "none", cursor: "pointer" }}>×</button>
            </div>
            <p style={{ fontSize: "11px", color: "#444", marginBottom: "28px", letterSpacing: "0.5px" }}>PREENCHA OS DADOS DA NOTA FISCAL</p>

            {bulkQueue.length > 1 ? (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #2f2f31",
                  background: "#18181b",
                  color: "#d4d4d8",
                  fontSize: 12,
                }}
              >
                Emitindo em fila. Depois desta nota, ainda restam {bulkQueue.length - 1} pedido(s) selecionado(s).
              </div>
            ) : null}

            {drawerLoading ? (
              <div style={{ fontSize: 13, color: "#d1d5db" }}>Carregando dados do pedido...</div>
            ) : null}

            {drawerError ? (
              <div style={{ fontSize: 12, color: "#fca5a5", background: "#2a1010", border: "1px solid #7f1d1d", borderRadius: 8, padding: 12, marginBottom: 16 }}>{drawerError}</div>
            ) : null}

            {!drawerLoading ? (
              <NfseFormulario
                pedido={pedidoPrefill}
                pedidoId={pedidoId}
                substituir={substituir}
                onClose={closeDrawer}
                onSuccess={() => {
                  if (bulkQueue.length > 1) {
                    moveToNextQueuedOrder();
                  } else {
                    closeDrawer();
                  }
                  startTransition(() => {
                    router.refresh();
                  });
                }}
              />
            ) : null}
            {isRefreshing ? <div style={{ fontSize: 11, color: "#6b7280", marginTop: 12 }}>Atualizando lista...</div> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
