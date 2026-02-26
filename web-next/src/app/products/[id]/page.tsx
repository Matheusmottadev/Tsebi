import { redirect } from "next/navigation";

export default async function ProductsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/product/${id}`);
}
