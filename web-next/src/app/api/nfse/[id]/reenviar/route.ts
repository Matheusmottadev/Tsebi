import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/admin/api-auth";
import { buscarNfsePorId, atualizarNfse, registrarEmailLog } from "../../../../../../../lib/nfse";
import { enviarEmailNfse } from "../../../../../../../lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireAdminApiSession(req);
    if (denied) return denied;

    const nfse = await buscarNfsePorId(params.id);
    if (!nfse) return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
    if (nfse.status !== "autorizada") {
      return NextResponse.json({ error: "Só é possível reenviar notas autorizadas" }, { status: 400 });
    }
    if (!nfse.tomador_email) {
      return NextResponse.json({ error: "Nota sem email do tomador" }, { status: 400 });
    }

    const resendId = await enviarEmailNfse(nfse);
    await registrarEmailLog({
      nfse_id: nfse.id,
      destinatario: nfse.tomador_email,
      status: "enviado",
      resend_id: resendId,
    });
    await atualizarNfse(params.id, { email_enviado_em: new Date().toISOString() });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const nfse = await buscarNfsePorId(params.id).catch(() => null);
    if (nfse?.tomador_email) {
      await registrarEmailLog({
        nfse_id: params.id,
        destinatario: nfse.tomador_email,
        status: "falhou",
        erro: String(err),
      });
    }
    return NextResponse.json({ error: "Erro ao reenviar email" }, { status: 500 });
  }
}
