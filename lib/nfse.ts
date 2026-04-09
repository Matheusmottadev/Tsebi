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
  includePendingOrders = true,
}: {
  status?: string;
  busca?: string;
  pagina?: number;
  periodo?: string;
  includePendingOrders?: boolean;
}): Promise<{ notas: Nfse[]; total: number }> {
  const limite = 20;
  const offset = (pagina - 1) * limite;
  const nfseConditions: string[] = [];
  const pendingConditions: string[] = [
    "NOT EXISTS (SELECT 1 FROM nfse existing WHERE existing.pedido_id = o.id)",
    "o.canceled_at IS NULL",
    "o.refunded_at IS NULL",
    "(o.paid_at IS NOT NULL OR LOWER(COALESCE(o.status, '')) = 'paid')",
  ];
  const nfseValues: unknown[] = [];
  const pendingValues: unknown[] = [];
  let nfseIndex = 1;
  let pendingIndex = 1;

  if (status && status !== "todos") {
    nfseConditions.push(`n.status = $${nfseIndex++}`);
    nfseValues.push(status);
  }

  if (busca) {
    nfseConditions.push(
      `(n.tomador_nome ILIKE $${nfseIndex} OR n.numero ILIKE $${nfseIndex} OR n.pedido_id::text ILIKE $${nfseIndex})`
    );
    nfseValues.push(`%${busca}%`);
    nfseIndex++;

    pendingConditions.push(
      `(COALESCE(o.user_name, '') ILIKE $${pendingIndex}
        OR COALESCE(o.user_email, '') ILIKE $${pendingIndex}
        OR COALESCE(o.order_number, '') ILIKE $${pendingIndex}
        OR o.id::text ILIKE $${pendingIndex})`
    );
    pendingValues.push(`%${busca}%`);
    pendingIndex++;
  }

  if (periodo === "mes-atual") {
    nfseConditions.push(`date_trunc('month', n.created_at) = date_trunc('month', NOW())`);
    pendingConditions.push(
      `date_trunc('month', COALESCE(o.paid_at, o.created_at)) = date_trunc('month', NOW())`
    );
  } else if (periodo === "mes-anterior") {
    nfseConditions.push(`date_trunc('month', n.created_at) = date_trunc('month', NOW() - interval '1 month')`);
    pendingConditions.push(
      `date_trunc('month', COALESCE(o.paid_at, o.created_at)) = date_trunc('month', NOW() - interval '1 month')`
    );
  }

  const nfseWhere = nfseConditions.length ? `WHERE ${nfseConditions.join(" AND ")}` : "";
  const pendingWhere =
    includePendingOrders && (!status || status === "pendente" || status === "todos")
      ? `WHERE ${pendingConditions.join(" AND ")}`
      : "WHERE FALSE";

  const combinedQuery = `
    WITH nfse_rows AS (
      SELECT n.*
      FROM nfse n
      ${nfseWhere}
    ),
    pending_rows AS (
      SELECT
        CONCAT('pending:', o.id) AS id,
        o.id AS pedido_id,
        NULL::varchar(100) AS bling_id,
        NULL::varchar(20) AS numero,
        NULL::varchar(10) AS serie,
        'pendente'::varchar(30) AS status,
        COALESCE(NULLIF(o.user_name, ''), NULLIF(o.user_email, ''), NULLIF(o.order_number, ''), 'Pedido sem cliente') AS tomador_nome,
        ''::varchar(20) AS tomador_documento,
        NULLIF(o.user_email, '')::varchar(255) AS tomador_email,
        NULL::varchar(10) AS tomador_cep,
        NULL::varchar(255) AS tomador_logradouro,
        NULL::varchar(20) AS tomador_numero,
        NULL::varchar(100) AS tomador_bairro,
        NULL::varchar(100) AS tomador_municipio,
        NULL::varchar(2) AS tomador_uf,
        CONCAT('Emissão pendente do pedido ', COALESCE(NULLIF(o.order_number, ''), UPPER(LEFT(o.id::text, 8))))::text AS servico_descricao,
        '01.07'::varchar(20) AS servico_codigo,
        ROUND(COALESCE(o.total_cents, 0)::numeric / 100, 2) AS valor_servicos,
        0.02::numeric(5,4) AS aliquota_iss,
        NULL::numeric(10,2) AS valor_iss,
        COALESCE(o.paid_at::date, o.created_at::date) AS competencia,
        NULL::text AS pdf_url,
        NULL::text AS xml_url,
        NULL::text AS link_nota,
        NULL::text AS erro_mensagem,
        0::integer AS tentativas,
        NULL::jsonb AS bling_payload,
        NULL::timestamptz AS email_enviado_em,
        COALESCE(o.paid_at, o.created_at) AS created_at,
        COALESCE(o.paid_at, o.created_at) AS updated_at
      FROM orders o
      ${pendingWhere}
    ),
    combined AS (
      SELECT * FROM nfse_rows
      UNION ALL
      SELECT * FROM pending_rows
    )
    SELECT *
    FROM combined
    ORDER BY created_at DESC
    LIMIT $${nfseValues.length + pendingValues.length + 1}
    OFFSET $${nfseValues.length + pendingValues.length + 2}
  `;

  const countQuery = `
    WITH nfse_rows AS (
      SELECT n.id
      FROM nfse n
      ${nfseWhere}
    ),
    pending_rows AS (
      SELECT CONCAT('pending:', o.id) AS id
      FROM orders o
      ${pendingWhere}
    ),
    combined AS (
      SELECT id FROM nfse_rows
      UNION ALL
      SELECT id FROM pending_rows
    )
    SELECT COUNT(*) FROM combined
  `;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    db.query(combinedQuery, [...nfseValues, ...pendingValues, limite, offset]),
    db.query(countQuery, [...nfseValues, ...pendingValues]),
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
  const { rows: pendingRows } = await db.query(`
    SELECT COUNT(*) AS total
    FROM orders o
    WHERE NOT EXISTS (SELECT 1 FROM nfse n WHERE n.pedido_id = o.id)
      AND o.canceled_at IS NULL
      AND o.refunded_at IS NULL
      AND (o.paid_at IS NOT NULL OR LOWER(COALESCE(o.status, '')) = 'paid')
  `);
  const r = rows[0];
  return {
    emitidas_mes: Number(r.emitidas_mes),
    total_faturado: Number(r.total_faturado),
    pendentes: Number(r.pendentes) + Number(pendingRows[0]?.total || 0),
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
