import { redirect } from "next/navigation";

type LegacyProdutoByIdPageProps = {
  params: {
    id: string;
  };
};

export default function LegacyProdutoByIdPage({ params }: LegacyProdutoByIdPageProps) {
  redirect(`/product/${encodeURIComponent(params.id)}`);
}
