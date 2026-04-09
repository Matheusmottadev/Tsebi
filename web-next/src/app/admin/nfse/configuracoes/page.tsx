import { requireAdminSession } from "@/lib/admin/server";

export const revalidate = 0;

function maskSecret(value: string): string {
  if (!value) return "Nao configurado";
  if (value.length <= 8) return "Configurado";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value || "Nao configurado";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export default async function NfseConfiguracoesPage() {
  await requireAdminSession("/admin/nfse/configuracoes");

  const clientId = String(process.env.BLING_CLIENT_ID || "").trim();
  const hasClientSecret = Boolean(String(process.env.BLING_CLIENT_SECRET || "").trim());
  const hasAccessToken = Boolean(String(process.env.BLING_ACCESS_TOKEN || "").trim());
  const hasRefreshToken = Boolean(String(process.env.BLING_REFRESH_TOKEN || "").trim());
  const cnpjPrestador = String(process.env.BLING_CNPJ_PRESTADOR || "").trim();
  const emailFrom = String(process.env.EMAIL_FROM || "").trim();
  const redirectUri =
    String(process.env.BLING_REDIRECT_URI || "").trim() ||
    `${String(process.env.APP_BASE_URL || "https://tsebi.com.br").trim().replace(/\/+$/, "")}/api/integrations/bling/callback`;

  const authUrl = clientId
    ? `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=tsebi-bling`
    : "";

  const statusItems = [
    {
      label: "App Bling",
      value: clientId ? "Conectado" : "Pendente",
      tone: clientId ? "#0f7b49" : "#8a6b15",
      bg: clientId ? "#eef8f2" : "#fff8e6",
    },
    {
      label: "Token de acesso",
      value: hasAccessToken ? "Configurado" : "Pendente",
      tone: hasAccessToken ? "#0f7b49" : "#8a6b15",
      bg: hasAccessToken ? "#eef8f2" : "#fff8e6",
    },
    {
      label: "Refresh token",
      value: hasRefreshToken ? "Configurado" : "Pendente",
      tone: hasRefreshToken ? "#0f7b49" : "#8a6b15",
      bg: hasRefreshToken ? "#eef8f2" : "#fff8e6",
    },
    {
      label: "CNPJ prestador",
      value: cnpjPrestador ? "Configurado" : "Pendente",
      tone: cnpjPrestador ? "#0f7b49" : "#8a6b15",
      bg: cnpjPrestador ? "#eef8f2" : "#fff8e6",
    },
  ];

  return (
    <div style={{ padding: "32px 28px", color: "#111" }}>
      <div style={{ maxWidth: "1120px" }}>
        <div style={{ marginBottom: "24px" }}>
          <p
            style={{
              fontSize: "10px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#7a7a7a",
              margin: 0,
            }}
          >
            Fiscal
          </p>
          <h1 style={{ fontSize: "28px", fontWeight: 500, color: "#111", margin: "10px 0 8px" }}>Configurações NFS-e</h1>
          <p style={{ fontSize: "14px", color: "#666", lineHeight: 1.6, margin: 0, maxWidth: "720px" }}>
            Veja o estado da integração com o Bling, confirme os dados do emissor e refaça a autorização quando precisar.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          {statusItems.map((item) => (
            <div
              key={item.label}
              style={{
                background: "#fff",
                border: "1px solid #ececec",
                borderRadius: "12px",
                padding: "16px",
                boxShadow: "0 8px 24px rgba(17,17,17,0.04)",
              }}
            >
              <p style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#7a7a7a", margin: 0 }}>
                {item.label}
              </p>
              <div
                style={{
                  display: "inline-flex",
                  marginTop: "10px",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: item.bg,
                  color: item.tone,
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.25fr 0.95fr",
            gap: "16px",
            alignItems: "start",
          }}
        >
          <div
            style={{
              background: "#fff",
              border: "1px solid #ececec",
              borderRadius: "14px",
              padding: "22px",
              boxShadow: "0 10px 28px rgba(17,17,17,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
              <div>
                <p
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "#7a7a7a",
                    margin: 0,
                  }}
                >
                  Integracao Bling
                </p>
                <h2 style={{ fontSize: "22px", color: "#111", margin: "10px 0 8px" }}>Conexao do emissor fiscal</h2>
                <p style={{ fontSize: "14px", color: "#666", lineHeight: 1.6, margin: 0, maxWidth: "520px" }}>
                  Use o mesmo aplicativo do Bling para reconectar a integracao sempre que trocar o secret, os tokens ou os escopos.
                </p>
              </div>
              {authUrl ? (
                <a
                  href={authUrl}
                  style={{
                    background: "#111",
                    color: "#fff",
                    padding: "10px 16px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Reconectar Bling
                </a>
              ) : null}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginTop: "18px",
              }}
            >
              {[
                { label: "Client ID", value: maskSecret(clientId) },
                { label: "Client Secret", value: hasClientSecret ? "Configurado" : "Nao configurado" },
                { label: "Redirect URI", value: redirectUri },
                { label: "CNPJ do prestador", value: formatCnpj(cnpjPrestador) },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: "1px solid #ececec",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    background: "#fcfcfc",
                  }}
                >
                  <p style={{ fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#7a7a7a", margin: 0 }}>
                    {item.label}
                  </p>
                  <p style={{ fontSize: "14px", color: "#111", margin: "8px 0 0", lineHeight: 1.5, wordBreak: "break-word" }}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            <div
              style={{
                background: "#fff",
                border: "1px solid #ececec",
                borderRadius: "14px",
                padding: "22px",
                boxShadow: "0 10px 28px rgba(17,17,17,0.04)",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#7a7a7a",
                  margin: 0,
                }}
              >
                Padroes do modulo
              </p>
              <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
                <div>
                  <p style={{ fontSize: "11px", color: "#7a7a7a", margin: 0 }}>Codigo ISS padrao</p>
                  <p style={{ fontSize: "16px", color: "#111", margin: "4px 0 0" }}>01.07</p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", color: "#7a7a7a", margin: 0 }}>Descricao inicial</p>
                  <p style={{ fontSize: "14px", color: "#111", margin: "4px 0 0" }}>Venda de produtos vinculada ao pedido</p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", color: "#7a7a7a", margin: 0 }}>Envio automatico por e-mail</p>
                  <p style={{ fontSize: "14px", color: "#111", margin: "4px 0 0" }}>Ativado por padrao no formulario</p>
                </div>
                <div>
                  <p style={{ fontSize: "11px", color: "#7a7a7a", margin: 0 }}>Remetente do e-mail</p>
                  <p style={{ fontSize: "14px", color: "#111", margin: "4px 0 0", wordBreak: "break-word" }}>
                    {emailFrom || "Nao configurado"}
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #ececec",
                borderRadius: "14px",
                padding: "22px",
                boxShadow: "0 10px 28px rgba(17,17,17,0.04)",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#7a7a7a",
                  margin: 0,
                }}
              >
                Proximos passos
              </p>
              <ol style={{ margin: "14px 0 0", paddingLeft: "18px", color: "#444", fontSize: "14px", lineHeight: 1.7 }}>
                <li>Abra a listagem de Notas Fiscais.</li>
                <li>Escolha um pedido pago e tente emitir uma NFS-e real.</li>
                <li>Se houver erro, use o botao de detalhes da nota para ver a mensagem exata.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
