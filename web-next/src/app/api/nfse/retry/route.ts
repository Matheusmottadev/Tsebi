import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminApiSession } from "@/lib/admin/api-auth";
import { atualizarNfse, registrarEmailLog } from "../../../../../../lib/nfse";
import { emitirNFSeNoBling } from "../../../../../../lib/bling";
import { enviarEmailNfse } from "../../../../../../lib/email";
import type { Nfse } from "../../../../../../types/nfse";

const { query } = require("../../../../../../server/lib/db") as {
  query: <TRow = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: TRow[] }>;
};

const db = { query };

export async function GET(req: NextRequest) {
  try {
    const denied = await requireAdminApiSession(req);
    if (denied) return denied;

    const { rows } = await db.query(`
      SELECT * FROM nfse
      WHERE (
        status = 'erro' OR
        (status = 'processando' AND updated_at < NOW() - interval '5 minutes')
      )
      AND tentativas < 3
      ORDER BY created_at ASC
      LIMIT 10
    `);

    const resultados = [];

    for (const nfse of rows as Array<Record<string, any>>) {
      try {
        await atualizarNfse(nfse.id, { tentativas: nfse.tentativas + 1, status: "processando" });

        const blingResult = await emitirNFSeNoBling(nfse.bling_payload);
        const blingData = blingResult?.data as Record<string, unknown> ?? {};

        await atualizarNfse(nfse.id, {
          status: "autorizada",
          bling_id: String(blingData.id ?? ""),
          numero: String(blingData.numero ?? ""),
          pdf_url: String(blingData.linkPdf ?? ""),
          erro_mensagem: null,
        });

        if (nfse.tomador_email && !nfse.email_enviado_em) {
          const nfseAtualizada = {
            ...nfse,
            status: "autorizada" as const,
            numero: String(blingData.numero ?? ""),
            pdf_url: String(blingData.linkPdf ?? ""),
          } as Nfse;
          try {
            const resendId = await enviarEmailNfse(nfseAtualizada);
            await registrarEmailLog({
              nfse_id: nfse.id,
              destinatario: nfse.tomador_email,
              status: "enviado",
              resend_id: resendId,
            });
            await atualizarNfse(nfse.id, { email_enviado_em: new Date().toISOString() });
          } catch {}
        }

        resultados.push({ id: nfse.id, resultado: "sucesso" });
      } catch (err) {
        await atualizarNfse(nfse.id, { status: "erro", erro_mensagem: String(err) });
        resultados.push({ id: nfse.id, resultado: "falhou", erro: String(err) });
      }
    }

    return NextResponse.json({ processadas: resultados.length, resultados });
  } catch (_err) {
    return NextResponse.json({ error: "Erro no retry" }, { status: 500 });
  }
}
