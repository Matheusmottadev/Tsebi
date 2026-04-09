import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/admin/api-auth";
import { buscarNfsePorId, atualizarNfse } from "../../../../../../lib/nfse";
import { cancelarNFSeNoBling } from "../../../../../../lib/bling";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireAdminApiSession(req);
    if (denied) return denied;

    const nfse = await buscarNfsePorId(params.id);
    if (!nfse) return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
    return NextResponse.json(nfse);
  } catch (_err) {
    return NextResponse.json({ error: "Erro ao buscar nota" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireAdminApiSession(req);
    if (denied) return denied;

    const nfse = await buscarNfsePorId(params.id);
    if (!nfse) return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
    if (nfse.status !== "autorizada") {
      return NextResponse.json({ error: "Só é possível cancelar notas autorizadas" }, { status: 400 });
    }

    if (nfse.bling_id) await cancelarNFSeNoBling(nfse.bling_id);
    await atualizarNfse(params.id, { status: "cancelada" });

    return NextResponse.json({ ok: true });
  } catch (_err) {
    return NextResponse.json({ error: "Erro ao cancelar nota" }, { status: 500 });
  }
}
