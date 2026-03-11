import { redirect } from "next/navigation";

export const revalidate = 3600;

type LegacyProdutoPageProps = {
  searchParams?: Promise<{
    id?: string | string[];
  }>;
};

export default async function LegacyProdutoPage({ searchParams }: LegacyProdutoPageProps) {
  const resolvedSearchParams = await searchParams;
  const raw = resolvedSearchParams?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;

  if (id && String(id).trim()) {
    redirect(`/product/${encodeURIComponent(String(id).trim())}`);
  }

  redirect("/");
}
