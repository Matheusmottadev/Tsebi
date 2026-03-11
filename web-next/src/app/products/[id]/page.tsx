import { redirect } from "next/navigation";

export const revalidate = 3600;

export default async function ProductsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/product/${id}`);
}
