import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/admin/api-auth";
import { listarNfse } from "../../../../../../lib/nfse";

export async function GET(req: NextRequest) {
  try {
    const denied = await requireAdminApiSession(req);
    if (denied) return denied;

    const { searchParams } = req.nextUrl;
    const { notas } = await listarNfse({
      status: searchParams.get("status") ?? undefined,
      periodo: searchParams.get("periodo") ?? undefined,
    });

    const header = "Número,Pedido,Cliente,Documento,Valor,ISS,Status,Emitida em\n";
    const rows = notas.map((n) =>
      [
        n.numero ?? "-",
        n.pedido_id,
        n.tomador_nome,
        n.tomador_documento,
        n.valor_servicos,
        n.valor_iss ?? "-",
        n.status,
        new Date(n.created_at).toLocaleDateString("pt-BR"),
      ].join(",")
    ).join("\n");

    return new NextResponse(header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="notas-fiscais.csv"',
      },
    });
  } catch (err) {
    console.error("[GET /api/nfse/export]", err);
    return NextResponse.json({ error: "Erro ao exportar" }, { status: 500 });
  }
}
