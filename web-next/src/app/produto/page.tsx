import { redirect } from "next/navigation";

type LegacyProdutoPageProps = {
  searchParams?: {
    id?: string | string[];
  };
};

export default function LegacyProdutoPage({ searchParams }: LegacyProdutoPageProps) {
  const raw = searchParams?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;

  if (id && String(id).trim()) {
    redirect(`/product/${encodeURIComponent(String(id).trim())}`);
  }

  redirect("/");
}
