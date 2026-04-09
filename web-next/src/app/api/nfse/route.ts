import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/admin/api-auth";
import { listarNfse, buscarStatsNfse } from "../../../../../lib/nfse";
import { criarNfse, atualizarNfse, registrarEmailLog } from "../../../../../lib/nfse";
import { emitirNFSeNoBling } from "../../../../../lib/bling";
import { enviarEmailNfse } from "../../../../../lib/email";
import type { EmitirNfsePayload } from "../../../../../types/nfse";

export async function GET(req: NextRequest) {
  try {
    const denied = await requireAdminApiSession(req);
    if (denied) return denied;

    const { searchParams } = req.nextUrl;
    const stats = searchParams.get("stats");

    if (stats === "true") {
      const data = await buscarStatsNfse();
      return NextResponse.json(data);
    }

    const notas = await listarNfse({
      status: searchParams.get("status") ?? undefined,
      busca: searchParams.get("busca") ?? undefined,
      pagina: Number(searchParams.get("pagina") ?? 1),
      periodo: searchParams.get("periodo") ?? undefined,
    });

    return NextResponse.json(notas);
  } catch (err) {
    console.error("[GET /api/nfse]", err);
    return NextResponse.json({ error: "Erro ao buscar notas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireAdminApiSession(req);
    if (denied) return denied;

    const body: EmitirNfsePayload = await req.json();

    const nfse = await criarNfse(body);

    const blingPayload = {
      naturezaOperacao: 1,
      dataEmissao: new Date().toISOString().split("T")[0],
      prestador: { cpfCnpj: process.env.BLING_CNPJ_PRESTADOR },
      tomador: {
        nome: body.tomador_nome,
        cpfCnpj: body.tomador_documento,
        email: body.tomador_email,
        endereco: {
          logradouro: body.tomador_logradouro,
          numero: body.tomador_numero,
          bairro: body.tomador_bairro,
          municipio: body.tomador_municipio,
          uf: body.tomador_uf,
          cep: body.tomador_cep,
        },
      },
      servico: {
        descricao: body.servico_descricao,
        valorServicos: body.valor_servicos,
        codigoServico: body.servico_codigo,
        aliquota: body.aliquota_iss * 100,
        issRetido: false,
        municipioPrestacao: "3550308",
      },
    };

    let blingResult: Record<string, unknown>;
    try {
      blingResult = await emitirNFSeNoBling(blingPayload);
    } catch (err) {
      await atualizarNfse(nfse.id, {
        status: "erro",
        erro_mensagem: err instanceof Error ? err.message : "Erro desconhecido",
        bling_payload: blingPayload as Record<string, unknown>,
      });
      return NextResponse.json({ error: "Erro ao emitir no Bling", detalhes: String(err) }, { status: 422 });
    }

    const blingData = blingResult?.data as Record<string, unknown> ?? {};
    await atualizarNfse(nfse.id, {
      status: "autorizada",
      bling_id: String(blingData.id ?? ""),
      numero: String(blingData.numero ?? ""),
      serie: String(blingData.serie ?? ""),
      pdf_url: String(blingData.linkPdf ?? ""),
      link_nota: String(blingData.linkNota ?? ""),
      bling_payload: blingPayload as Record<string, unknown>,
    });

    if (body.enviar_email && body.tomador_email) {
      const nfseAtualizada = {
        ...nfse,
        status: "autorizada" as const,
        numero: String(blingData.numero ?? ""),
        pdf_url: String(blingData.linkPdf ?? ""),
      };
      try {
        const resendId = await enviarEmailNfse(nfseAtualizada);
        await registrarEmailLog({
          nfse_id: nfse.id,
          destinatario: body.tomador_email,
          status: "enviado",
          resend_id: resendId,
        });
        await atualizarNfse(nfse.id, { email_enviado_em: new Date().toISOString() });
      } catch (emailErr) {
        await registrarEmailLog({
          nfse_id: nfse.id,
          destinatario: body.tomador_email,
          status: "falhou",
          erro: String(emailErr),
        });
      }
    }

    return NextResponse.json({ ok: true, id: nfse.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/nfse]", err);
    return NextResponse.json({ error: "Erro interno ao emitir nota" }, { status: 500 });
  }
}
