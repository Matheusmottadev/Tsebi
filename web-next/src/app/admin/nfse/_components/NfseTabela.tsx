"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import type { Nfse } from "../../../../../../types/nfse";

const STATUS_STYLE: Record<string, { bg: string; cor: string; dot: string }> = {
  autorizada: { bg: "#0d2b1a", cor: "#3a9e6a", dot: "#3a9e6a" },
  processando: { bg: "#1e1e08", cor: "#8a7a20", dot: "#8a7a20" },
  cancelada: { bg: "#2a1010", cor: "#9e3a3a", dot: "#9e3a3a" },
  pendente: { bg: "#1a1a1a", cor: "#555", dot: "#444" },
  erro: { bg: "#2a1010", cor: "#cc4444", dot: "#cc4444" },
};

type NfseTabelaProps = {
  notas: Nfse[];
  total: number;
  searchParams: Record<string, string | undefined>;
};

export default function NfseTabela({ notas, total, searchParams }: NfseTabelaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function atualizarFiltro(chave: string, valor: string) {
    const nextParams = new URLSearchParams(params.toString());
    if (valor) nextParams.set(chave, valor);
    else nextParams.delete(chave);
    nextParams.delete("pagina");

    const query = nextParams.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  async function cancelarNota(id: string) {
    if (!window.confirm("Cancelar esta nota fiscal?")) return;
    setLoadingId(id);
    try {
      const response = await fetch(`/api/nfse/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setErroModal(data?.error ?? "Erro ao cancelar nota");
        return;
      }
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  async function reenviarEmail(id: string) {
    setLoadingId(id);
    try {
      const response = await fetch(`/api/nfse/${id}/reenviar`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setErroModal(data?.error ?? "Erro ao reenviar email");
        return;
      }
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  const thStyle: CSSProperties = {
    fontSize: "10px",
    letterSpacing: "1.5px",
    color: "#444",
    fontWeight: 500,
    padding: "8px 0",
    borderBottom: "0.5px solid #1e1e1e",
    textAlign: "left",
  };

  const tdStyle: CSSProperties = {
    padding: "13px 0",
    borderBottom: "0.5px solid #1a1a1a",
    verticalAlign: "middle",
  };

  return (
    <>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
        <input
          defaultValue={searchParams.busca}
          onChange={(event) => atualizarFiltro("busca", event.target.value)}
          placeholder="Buscar por nota, pedido ou cliente..."
          style={{
            flex: 1,
            background: "#1a1a1a",
            border: "0.5px solid #2a2a2a",
            borderRadius: "6px",
            padding: "7px 12px",
            color: "#888",
            fontSize: "12px",
            outline: "none",
          }}
        />
        <select
          onChange={(event) => atualizarFiltro("status", event.target.value)}
          defaultValue={searchParams.status ?? ""}
          style={{
            background: "#1a1a1a",
            border: "0.5px solid #2a2a2a",
            borderRadius: "6px",
            padding: "7px 10px",
            color: "#666",
            fontSize: "11px",
          }}
        >
          <option value="">Status: Todos</option>
          <option value="autorizada">Autorizada</option>
          <option value="processando">Processando</option>
          <option value="pendente">Pendente</option>
          <option value="cancelada">Cancelada</option>
          <option value="erro">Erro</option>
        </select>
        <select
          onChange={(event) => atualizarFiltro("periodo", event.target.value)}
          defaultValue={searchParams.periodo ?? ""}
          style={{
            background: "#1a1a1a",
            border: "0.5px solid #2a2a2a",
            borderRadius: "6px",
            padding: "7px 10px",
            color: "#666",
            fontSize: "11px",
          }}
        >
          <option value="">Periodo: Todos</option>
          <option value="mes-atual">Este mes</option>
          <option value="mes-anterior">Mes anterior</option>
        </select>
        <span style={{ fontSize: "11px", color: "#444" }}>{total} resultado(s)</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["NOTA", "PEDIDO", "CLIENTE", "VALOR", "STATUS", "EMITIDA EM", ""].map((header) => (
              <th key={header} style={thStyle}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notas.map((nota) => {
            const statusStyle = STATUS_STYLE[nota.status] ?? STATUS_STYLE.pendente;
            const loading = loadingId === nota.id;

            return (
              <tr key={nota.id} style={{ cursor: "default" }}>
                <td style={tdStyle}>
                  <span style={{ fontSize: "11px", color: "#555", fontFamily: "monospace" }}>
                    {nota.numero ? `NFS-e ${nota.numero}` : "—"}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: "11px", color: "#777", fontFamily: "monospace" }}>
                    #{nota.pedido_id.slice(0, 12)}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: "13px", color: "#ccc" }}>{nota.tomador_nome}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: "13px", color: "#ccc" }}>
                    {Number(nota.valor_servicos).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "3px 8px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 500,
                      background: statusStyle.bg,
                      color: statusStyle.cor,
                    }}
                  >
                    <span
                      style={{
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        background: statusStyle.dot,
                      }}
                    />
                    {nota.status.charAt(0).toUpperCase() + nota.status.slice(1)}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: "12px", color: "#555" }}>
                  {new Date(nota.created_at).toLocaleString("pt-BR")}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    {nota.status === "autorizada" ? (
                      <>
                        <a
                          href={nota.pdf_url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: "transparent",
                            border: "0.5px solid #2a2a2a",
                            color: "#666",
                            fontSize: "11px",
                            padding: "5px 10px",
                            borderRadius: "5px",
                            textDecoration: "none",
                          }}
                        >
                          PDF
                        </a>
                        <button
                          onClick={() => reenviarEmail(nota.id)}
                          disabled={loading}
                          style={{
                            background: "transparent",
                            border: "0.5px solid #2a2a2a",
                            color: "#666",
                            fontSize: "11px",
                            padding: "5px 10px",
                            borderRadius: "5px",
                            cursor: "pointer",
                          }}
                        >
                          {loading ? "..." : "Reenviar email"}
                        </button>
                        <button
                          onClick={() => cancelarNota(nota.id)}
                          disabled={loading}
                          style={{
                            background: "transparent",
                            border: "0.5px solid #2a1010",
                            color: "#9e3a3a",
                            fontSize: "11px",
                            padding: "5px 10px",
                            borderRadius: "5px",
                            cursor: "pointer",
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : null}

                    {nota.status === "pendente" ? (
                      <a
                        href={`/admin/nfse/emitir?pedidoId=${nota.pedido_id}`}
                        style={{
                          background: "transparent",
                          border: "0.5px solid #334",
                          color: "#5577aa",
                          fontSize: "11px",
                          padding: "5px 10px",
                          borderRadius: "5px",
                          textDecoration: "none",
                        }}
                      >
                        Emitir nota
                      </a>
                    ) : null}

                    {nota.status === "cancelada" ? (
                      <a
                        href={`/admin/nfse/emitir?pedidoId=${nota.pedido_id}&substituir=${nota.id}`}
                        style={{
                          background: "transparent",
                          border: "0.5px solid #2a2a2a",
                          color: "#666",
                          fontSize: "11px",
                          padding: "5px 10px",
                          borderRadius: "5px",
                          textDecoration: "none",
                        }}
                      >
                        Substituir
                      </a>
                    ) : null}

                    {nota.status === "erro" ? (
                      <button
                        onClick={() => setErroModal(nota.erro_mensagem ?? "Erro desconhecido")}
                        style={{
                          background: "transparent",
                          border: "0.5px solid #2a1010",
                          color: "#cc4444",
                          fontSize: "11px",
                          padding: "5px 10px",
                          borderRadius: "5px",
                          cursor: "pointer",
                        }}
                      >
                        Ver erro
                      </button>
                    ) : null}

                    {nota.status === "processando" ? (
                      <span style={{ fontSize: "11px", color: "#444" }}>Aguardando...</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {erroModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "#161616",
              border: "0.5px solid #2a2a2a",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "480px",
              width: "100%",
            }}
          >
            <p style={{ fontSize: "14px", fontWeight: 500, color: "#fff", marginBottom: "12px" }}>Erro na emissao</p>
            <p
              style={{
                fontSize: "13px",
                color: "#cc4444",
                fontFamily: "monospace",
                background: "#1a0a0a",
                padding: "12px",
                borderRadius: "6px",
              }}
            >
              {erroModal}
            </p>
            <button
              onClick={() => setErroModal(null)}
              style={{
                marginTop: "16px",
                background: "transparent",
                border: "0.5px solid #2a2a2a",
                color: "#666",
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
