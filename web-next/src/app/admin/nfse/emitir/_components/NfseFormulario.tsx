"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { bootstrapAdminCsrfToken } from "@/services/admin";

const CODIGOS_ISS = [
  { value: "01.07", label: "01.07 — Programacao e desenvolvimento de software" },
  { value: "17.01", label: "17.01 — Assessoria e consultoria" },
  { value: "17.06", label: "17.06 — Servicos de propaganda e publicidade" },
  { value: "14.01", label: "14.01 — Lubrificacao, limpeza e conservacao" },
];

export type PedidoPrefill = {
  id: string;
  cliente_nome: string;
  cliente_cpf: string;
  cliente_email: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  total: number;
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#1a1a1a",
  border: "0.5px solid #2a2a2a",
  borderRadius: "6px",
  padding: "8px 10px",
  color: "#ccc",
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  fontSize: "9px",
  letterSpacing: "1.5px",
  color: "#444",
  fontWeight: 500,
  display: "block",
  marginBottom: "5px",
};

const fieldStyle: CSSProperties = { marginBottom: "14px" };
const rowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" };
const sectionStyle: CSSProperties = {
  fontSize: "10px",
  letterSpacing: "2px",
  color: "#444",
  marginBottom: "12px",
  marginTop: "20px",
  fontWeight: 500,
};

type NfseFormularioProps = {
  pedido: PedidoPrefill | null;
  pedidoId?: string;
  substituir?: string;
};

export default function NfseFormulario({ pedido, pedidoId, substituir }: NfseFormularioProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviarEmail, setEnviarEmail] = useState(true);

  const [form, setForm] = useState({
    tomador_nome: String(pedido?.cliente_nome ?? ""),
    tomador_documento: String(pedido?.cliente_cpf ?? ""),
    tomador_email: String(pedido?.cliente_email ?? ""),
    tomador_cep: String(pedido?.cep ?? ""),
    tomador_logradouro: String(pedido?.logradouro ?? ""),
    tomador_numero: String(pedido?.numero ?? ""),
    tomador_bairro: String(pedido?.bairro ?? ""),
    tomador_municipio: String(pedido?.municipio ?? "Sao Paulo"),
    tomador_uf: String(pedido?.uf ?? "SP"),
    servico_descricao: pedidoId ? `Venda de produtos — Pedido #${pedidoId.slice(0, 8)}` : "",
    servico_codigo: "01.07",
    valor_servicos: pedido?.total ? String(pedido.total.toFixed(2)) : "",
    aliquota_iss: "0.02",
    competencia: new Date().toISOString().slice(0, 7),
  });

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function buscarCep(cep: string) {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;

    const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = (await response.json()) as Record<string, unknown>;
    if (!data.erro) {
      setForm((current) => ({
        ...current,
        tomador_logradouro: String(data.logradouro || ""),
        tomador_bairro: String(data.bairro || ""),
        tomador_municipio: String(data.localidade || ""),
        tomador_uf: String(data.uf || ""),
      }));
    }
  }

  async function submeter() {
    if (!pedidoId) {
      setErro("Selecione um pedido para emitir a nota.");
      return;
    }

    setErro(null);
    setLoading(true);
    try {
      const csrfToken = await bootstrapAdminCsrfToken({ cache: "no-store" });
      const response = await fetch("/api/nfse", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          ...form,
          pedido_id: pedidoId,
          valor_servicos: Number(form.valor_servicos),
          aliquota_iss: Number(form.aliquota_iss),
          competencia: `${form.competencia}-01`,
          enviar_email: enviarEmail,
        }),
      });

      const data = (await response.json()) as { detalhes?: string; error?: string };
      if (!response.ok) {
        setErro(data.detalhes ?? data.error ?? "Erro ao emitir");
        return;
      }

      router.push("/admin/nfse");
      router.refresh();
    } catch (error) {
      setErro(String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {!pedidoId ? (
        <p
          style={{
            fontSize: "12px",
            color: "#d9b06c",
            background: "#1f1610",
            border: "0.5px solid #463324",
            padding: "10px 12px",
            borderRadius: "6px",
            marginBottom: "18px",
          }}
        >
          Esta emissao precisa estar vinculada a um pedido.
        </p>
      ) : null}

      {substituir ? (
        <p
          style={{
            fontSize: "12px",
            color: "#8eb0ff",
            background: "#101727",
            border: "0.5px solid #243657",
            padding: "10px 12px",
            borderRadius: "6px",
            marginBottom: "18px",
          }}
        >
          Substituindo a nota anterior {substituir.slice(0, 8)}.
        </p>
      ) : null}

      <p style={sectionStyle}>TOMADOR</p>
      <div style={fieldStyle}>
        <label style={labelStyle}>NOME COMPLETO *</label>
        <input style={inputStyle} value={form.tomador_nome} onChange={(event) => set("tomador_nome", event.target.value)} />
      </div>
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>CPF / CNPJ *</label>
          <input
            style={inputStyle}
            value={form.tomador_documento}
            onChange={(event) => set("tomador_documento", event.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>EMAIL</label>
          <input style={inputStyle} value={form.tomador_email} onChange={(event) => set("tomador_email", event.target.value)} />
        </div>
      </div>

      <p style={sectionStyle}>ENDERECO</p>
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>CEP *</label>
          <input
            style={inputStyle}
            value={form.tomador_cep}
            onChange={(event) => set("tomador_cep", event.target.value)}
            onBlur={(event) => {
              void buscarCep(event.target.value);
            }}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>NUMERO *</label>
          <input style={inputStyle} value={form.tomador_numero} onChange={(event) => set("tomador_numero", event.target.value)} />
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>LOGRADOURO *</label>
        <input
          style={inputStyle}
          value={form.tomador_logradouro}
          onChange={(event) => set("tomador_logradouro", event.target.value)}
        />
      </div>
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>BAIRRO *</label>
          <input style={inputStyle} value={form.tomador_bairro} onChange={(event) => set("tomador_bairro", event.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>MUNICIPIO *</label>
          <input
            style={inputStyle}
            value={form.tomador_municipio}
            onChange={(event) => set("tomador_municipio", event.target.value)}
          />
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>UF *</label>
        <input
          style={inputStyle}
          value={form.tomador_uf}
          onChange={(event) => set("tomador_uf", event.target.value.toUpperCase())}
          maxLength={2}
        />
      </div>

      <p style={sectionStyle}>SERVICO</p>
      <div style={fieldStyle}>
        <label style={labelStyle}>DESCRICAO *</label>
        <textarea
          style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }}
          value={form.servico_descricao}
          onChange={(event) => set("servico_descricao", event.target.value)}
        />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>CODIGO ISS *</label>
        <select style={inputStyle} value={form.servico_codigo} onChange={(event) => set("servico_codigo", event.target.value)}>
          {CODIGOS_ISS.map((codigo) => (
            <option key={codigo.value} value={codigo.value}>
              {codigo.label}
            </option>
          ))}
        </select>
      </div>
      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>VALOR (R$) *</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            value={form.valor_servicos}
            onChange={(event) => set("valor_servicos", event.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>ALIQUOTA ISS</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            value={form.aliquota_iss}
            onChange={(event) => set("aliquota_iss", event.target.value)}
          />
        </div>
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle}>COMPETENCIA</label>
        <input style={inputStyle} type="month" value={form.competencia} onChange={(event) => set("competencia", event.target.value)} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "16px 0" }}>
        <input type="checkbox" id="enviar_email" checked={enviarEmail} onChange={(event) => setEnviarEmail(event.target.checked)} />
        <label htmlFor="enviar_email" style={{ fontSize: "12px", color: "#888", cursor: "pointer" }}>
          Enviar email com a nota para o cliente ao emitir
        </label>
      </div>

      {erro ? (
        <p
          style={{
            fontSize: "12px",
            color: "#cc4444",
            background: "#1a0a0a",
            padding: "10px",
            borderRadius: "6px",
            marginBottom: "12px",
            fontFamily: "monospace",
          }}
        >
          {erro}
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "10px",
          paddingTop: "8px",
          borderTop: "0.5px solid #1e1e1e",
          marginTop: "8px",
        }}
      >
        <a
          href="/admin/nfse"
          style={{
            background: "transparent",
            border: "0.5px solid #2a2a2a",
            color: "#666",
            padding: "8px 16px",
            borderRadius: "6px",
            fontSize: "12px",
            textDecoration: "none",
          }}
        >
          CANCELAR
        </a>
        <button
          onClick={submeter}
          disabled={loading || !pedidoId}
          style={{
            background: "#fff",
            color: "#111",
            border: "none",
            padding: "8px 20px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: 500,
            cursor: loading || !pedidoId ? "not-allowed" : "pointer",
            opacity: loading || !pedidoId ? 0.7 : 1,
          }}
        >
          {loading ? "EMITINDO..." : "EMITIR NOTA"}
        </button>
      </div>
    </div>
  );
}
