import { redirect } from "next/navigation";

export const revalidate = 3600;

type LegacyProdutoByIdPageProps = {
  params: {
    id: string;
  };
};

export default function LegacyProdutoByIdPage({ params }: LegacyProdutoByIdPageProps) {
  redirect(`/product/${encodeURIComponent(params.id)}`);
}
