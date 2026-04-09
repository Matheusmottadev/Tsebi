import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/admin/server";

type EmitirNfsePageProps = {
  searchParams: Promise<{
    pedidoId?: string;
    substituir?: string;
  }>;
};

export default async function EmitirNfsePage({ searchParams }: EmitirNfsePageProps) {
  await requireAdminSession("/admin/nfse/emitir");

  const resolvedSearchParams = await searchParams;
  const nextParams = new URLSearchParams();
  nextParams.set("emitir", "1");
  if (resolvedSearchParams.pedidoId) nextParams.set("pedidoId", resolvedSearchParams.pedidoId);
  if (resolvedSearchParams.substituir) nextParams.set("substituir", resolvedSearchParams.substituir);
  redirect(`/admin/nfse?${nextParams.toString()}`);
}
