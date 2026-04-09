import { requireAdminSession } from "@/lib/admin/server";

export const revalidate = 0;

export default async function NfseConfiguracoesPage() {
  await requireAdminSession("/admin/nfse/configuracoes");

  return (
    <div style={{ padding: "32px 28px", color: "#e8e8e8" }}>
      <div
        style={{
          background: "#161616",
          border: "0.5px solid #1e1e1e",
          borderRadius: "10px",
          padding: "24px",
          maxWidth: "720px",
        }}
      >
        <p style={{ fontSize: "10px", letterSpacing: "0.22em", textTransform: "uppercase", color: "#555", margin: 0 }}>
          Fiscal
        </p>
        <h1 style={{ fontSize: "24px", fontWeight: 500, color: "#fff", margin: "10px 0 8px" }}>Configurações NFS-e</h1>
        <p style={{ fontSize: "14px", color: "#8d8d8d", lineHeight: 1.6, margin: 0 }}>
          Esta área foi reservada para as configurações do emissor fiscal, integração com Bling e preferências de envio.
        </p>
      </div>
    </div>
  );
}
