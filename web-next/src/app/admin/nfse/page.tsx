import { headers } from "next/headers";
import { getOrderAdmin } from "@/services/admin";
import { requireAdminSession } from "@/lib/admin/server";
import { getNfseStatsAdmin, listNfseAdmin, studioAuthMe } from "@/services/admin";
import NfseAdminShell from "./_components/NfseAdminShell";
import { NfseStats } from "./_components/NfseStats";
import NfseTabela from "./_components/NfseTabela";
import NfseFormulario, { type PedidoPrefill } from "./emitir/_components/NfseFormulario";

type NfsePageProps = {
  searchParams: Promise<{
    status?: string;
    busca?: string;
    pagina?: string;
    periodo?: string;
    emitir?: string;
    pedidoId?: string;
    substituir?: string;
  }>;
};

export const revalidate = 0;

async function buscarPedido(pedidoId: string, cookie: string | undefined): Promise<PedidoPrefill | null> {
  try {
    const pedido = await getOrderAdmin(pedidoId, { cookie, cache: "no-store" });
    if (!pedido) return null;

    const shipping = (pedido.shipping || {}) as Record<string, unknown>;
    const shippingAddress =
      shipping.shippingAddress && typeof shipping.shippingAddress === "object"
        ? (shipping.shippingAddress as Record<string, unknown>)
        : shipping;

    return {
      id: pedido.id,
      cliente_nome: String(pedido.userName || shipping.fullName || ""),
      cliente_email: String(pedido.userEmail || shipping.email || ""),
      cliente_cpf: String(shipping.customerCpf || shipping.cpf || shipping.document || ""),
      cep: String(shippingAddress.cep || shipping.cep || pedido.shippingDestinationZip || ""),
      logradouro: String(shippingAddress.street || shippingAddress.logradouro || shipping.logradouro || ""),
      numero: String(shippingAddress.number || shippingAddress.numero || shipping.numero || ""),
      bairro: String(shippingAddress.district || shippingAddress.bairro || shipping.bairro || ""),
      municipio: String(shippingAddress.city || shippingAddress.municipio || shipping.municipio || ""),
      uf: String(shippingAddress.state || shippingAddress.uf || shipping.uf || ""),
      total: Number(pedido.amount || 0) / 100,
    };
  } catch {
    return null;
  }
}

export default async function NfsePage({ searchParams }: NfsePageProps) {
  await requireAdminSession("/admin/nfse");

  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;
  const me = await studioAuthMe({ cookie, cache: "no-store" });
  const resolvedSearchParams = await searchParams;
  const shouldOpenDrawer = resolvedSearchParams.emitir === "1" || Boolean(resolvedSearchParams.pedidoId);
  const pedidoPrefill = resolvedSearchParams.pedidoId
    ? await buscarPedido(resolvedSearchParams.pedidoId, cookie)
    : null;
  const [{ notas, total }, stats] = await Promise.all([
    listNfseAdmin({
      status: resolvedSearchParams.status,
      busca: resolvedSearchParams.busca,
      pagina: Number(resolvedSearchParams.pagina ?? 1),
      periodo: resolvedSearchParams.periodo,
    }, { cookie, cache: "no-store" }),
    getNfseStatsAdmin({ cookie, cache: "no-store" }),
  ]);

  return (
    <NfseAdminShell admin={me.admin!} access={me.access ?? null}>
    <div style={{ padding: "20px 28px", color: "#161616", background: "#ffffff", minHeight: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
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
          <a
            href="/api/nfse/export"
            style={{
              background: "#ffffff",
              border: "1px solid #d1d5db",
              color: "#111111",
              padding: "7px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              textDecoration: "none",
            }}
          >
            Exportar CSV
          </a>
          <a
            href="/admin/nfse?emitir=1"
            style={{
              background: "#111111",
              color: "#ffffff",
              padding: "7px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            + EMITIR NOTA
          </a>
        </div>
      </div>

      <NfseStats stats={stats} />
      <NfseTabela notas={notas} total={total} searchParams={resolvedSearchParams} />

      {shouldOpenDrawer ? (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 220,
              right: 0,
              bottom: 0,
              background: "rgba(15, 15, 15, 0.38)",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "480px",
              background: "#111",
              borderLeft: "0.5px solid #2a2a2a",
              padding: "28px",
              overflowY: "auto",
              zIndex: 2,
              boxSizing: "border-box",
              boxShadow: "-24px 0 60px rgba(0,0,0,0.16)",
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}
            >
              <h2 style={{ fontSize: "22px", fontWeight: 500, color: "#fff", margin: 0 }}>Emitir NFS-e</h2>
              <a href="/admin/nfse" style={{ color: "#555", fontSize: "20px", textDecoration: "none", lineHeight: 1 }}>
                ×
              </a>
            </div>
            <p style={{ fontSize: "11px", color: "#444", marginBottom: "28px", letterSpacing: "0.5px" }}>
              PREENCHA OS DADOS DA NOTA FISCAL
            </p>
            <NfseFormulario
              pedido={pedidoPrefill}
              pedidoId={resolvedSearchParams.pedidoId}
              substituir={resolvedSearchParams.substituir}
            />
          </div>
        </>
      ) : null}
    </div>
    </NfseAdminShell>
  );
}
