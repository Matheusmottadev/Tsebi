import { headers } from "next/headers";
import { requireAdminSession } from "@/lib/admin/server";
import { getOrderAdmin } from "@/services/admin";
import NfseFormulario, { type PedidoPrefill } from "./_components/NfseFormulario";

type EmitirNfsePageProps = {
  searchParams: Promise<{
    pedidoId?: string;
    substituir?: string;
  }>;
};

async function buscarPedido(pedidoId: string): Promise<PedidoPrefill | null> {
  try {
    const headerStore = await headers();
    const cookie = headerStore.get("cookie") || undefined;
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

export default async function EmitirNfsePage({ searchParams }: EmitirNfsePageProps) {
  await requireAdminSession("/admin/nfse/emitir");

  const resolvedSearchParams = await searchParams;
  const pedido = resolvedSearchParams.pedidoId ? await buscarPedido(resolvedSearchParams.pedidoId) : null;

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)" }} />
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
          zIndex: 1,
          boxSizing: "border-box",
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
          pedido={pedido}
          pedidoId={resolvedSearchParams.pedidoId}
          substituir={resolvedSearchParams.substituir}
        />
      </div>
    </div>
  );
}
