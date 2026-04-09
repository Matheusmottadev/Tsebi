import { headers } from "next/headers";
import { requireAdminSession } from "@/lib/admin/server";
import { getNfseStatsAdmin, listNfseAdmin } from "@/services/admin";
import { NfseStats } from "./_components/NfseStats";
import NfseTabela from "./_components/NfseTabela";

type NfsePageProps = {
  searchParams: Promise<{
    status?: string;
    busca?: string;
    pagina?: string;
    periodo?: string;
  }>;
};

export const revalidate = 0;

export default async function NfsePage({ searchParams }: NfsePageProps) {
  await requireAdminSession("/admin/nfse");

  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;
  const resolvedSearchParams = await searchParams;
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
            href="/admin/nfse/emitir"
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
    </div>
  );
}
