import type { Nfse, NfseStats, EmitirNfsePayload } from "../types/nfse";

const { query } = require("../server/lib/db") as {
  query: <TRow = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: TRow[] }>;
};

const db = { query };

export async function listarNfse({
  status,
  busca,
  pagina = 1,
  periodo,
}: {
  status?: string;
  busca?: string;
  pagina?: number;
  periodo?: string;
}): Promise<{ notas: Nfse[]; total: number }> {
  const limite = 20;
  const offset = (pagina - 1) * limite;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (status && status !== "todos") {
    conditions.push(`n.status = $${i++}`);
    values.push(status);
  }

  if (busca) {
    conditions.push(`(n.tomador_nome ILIKE $${i} OR n.numero ILIKE $${i} OR n.pedido_id::text ILIKE $${i})`);
    values.push(`%${busca}%`);
    i++;
  }

  if (periodo === "mes-atual") {
    conditions.push(`date_trunc('month', n.created_at) = date_trunc('month', NOW())`);
  } else if (periodo === "mes-anterior") {
    conditions.push(`date_trunc('month', n.created_at) = date_trunc('month', NOW() - interval '1 month')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query(
      `SELECT n.* FROM nfse n ${where} ORDER BY n.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limite, offset]
    ),
    db.query(`SELECT COUNT(*) FROM nfse n ${where}`, values),
  ]);

  return { notas: rows as unknown as Nfse[], total: Number(countRows[0].count) };
}

export async function buscarNfsePorId(id: string): Promise<Nfse | null> {
  const { rows } = await db.query("SELECT * FROM nfse WHERE id = $1", [id]);
  return (rows[0] as unknown as Nfse) ?? null;
}

export async function buscarNfsePorPedido(pedidoId: string): Promise<Nfse | null> {
  const { rows } = await db.query(
    "SELECT * FROM nfse WHERE pedido_id = $1 ORDER BY created_at DESC LIMIT 1",
    [pedidoId]
  );
  return (rows[0] as unknown as Nfse) ?? null;
}

export async function criarNfse(payload: EmitirNfsePayload): Promise<Nfse> {
  const valorIss = payload.valor_servicos * payload.aliquota_iss;
  const { rows } = await db.query(
    `INSERT INTO nfse (
      pedido_id, status, tomador_nome, tomador_documento, tomador_email,
      tomador_cep, tomador_logradouro, tomador_numero, tomador_bairro,
      tomador_municipio, tomador_uf, servico_descricao, servico_codigo,
      valor_servicos, aliquota_iss, valor_iss, competencia
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING *`,
    [
      payload.pedido_id,
      "processando",
      payload.tomador_nome,
      payload.tomador_documento,
      payload.tomador_email,
      payload.tomador_cep,
      payload.tomador_logradouro,
      payload.tomador_numero,
      payload.tomador_bairro,
      payload.tomador_municipio,
      payload.tomador_uf,
      payload.servico_descricao,
      payload.servico_codigo,
      payload.valor_servicos,
      payload.aliquota_iss,
      valorIss,
      payload.competencia,
    ]
  );
  return rows[0] as unknown as Nfse;
}

export async function atualizarNfse(id: string, dados: Partial<Nfse>): Promise<void> {
  const campos = Object.keys(dados);
  const valores = Object.values(dados);
  const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(", ");
  await db.query(
    `UPDATE nfse SET ${sets}, updated_at = NOW() WHERE id = $1`,
    [id, ...valores]
  );
}

export async function buscarStatsNfse(): Promise<NfseStats> {
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW()) AND status = 'autorizada') AS emitidas_mes,
      COALESCE(SUM(valor_servicos) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW()) AND status = 'autorizada'), 0) AS total_faturado,
      COUNT(*) FILTER (WHERE status = 'pendente') AS pendentes,
      COUNT(*) FILTER (WHERE status = 'erro') AS erros
    FROM nfse
  `);
  const r = rows[0];
  return {
    emitidas_mes: Number(r.emitidas_mes),
    total_faturado: Number(r.total_faturado),
    pendentes: Number(r.pendentes),
    erros: Number(r.erros),
  };
}

export async function registrarEmailLog({
  nfse_id, destinatario, status, resend_id, erro,
}: {
  nfse_id: string;
  destinatario: string;
  status: "enviado" | "falhou";
  resend_id?: string;
  erro?: string;
}): Promise<void> {
  await db.query(
    `INSERT INTO nfse_email_log (nfse_id, destinatario, status, resend_id, erro)
     VALUES ($1, $2, $3, $4, $5)`,
    [nfse_id, destinatario, status, resend_id ?? null, erro ?? null]
  );
}
