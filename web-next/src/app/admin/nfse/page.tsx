import { headers } from "next/headers";
import { getOrderAdmin, getNfseStatsAdmin, listNfseAdmin, studioAuthMe } from "@/services/admin";
import { requireAdminSession } from "@/lib/admin/server";
import NfseAdminShell from "./_components/NfseAdminShell";
import NfseDashboardClient from "./_components/NfseDashboardClient";
import { type PedidoPrefill } from "./emitir/_components/NfseFormulario";

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
    listNfseAdmin(
      {
        status: resolvedSearchParams.status,
        busca: resolvedSearchParams.busca,
        pagina: Number(resolvedSearchParams.pagina ?? 1),
        periodo: resolvedSearchParams.periodo,
      },
      { cookie, cache: "no-store" }
    ),
    getNfseStatsAdmin({ cookie, cache: "no-store" }),
  ]);

  return (
    <NfseAdminShell admin={me.admin!} access={me.access ?? null}>
      <div style={{ padding: "20px 28px", color: "#161616", background: "#ffffff", minHeight: "100%" }}>
        <NfseDashboardClient
          notas={notas}
          total={total}
          stats={stats}
          searchParams={resolvedSearchParams}
          initialPedidoPrefill={pedidoPrefill}
          initialPedidoId={shouldOpenDrawer ? resolvedSearchParams.pedidoId : undefined}
          initialSubstituir={shouldOpenDrawer ? resolvedSearchParams.substituir : undefined}
        />
      </div>
    </NfseAdminShell>
  );
}
