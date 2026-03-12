import { redirect } from "next/navigation";

type ConfirmationPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function pickValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export default function CheckoutConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const status = pickValue(searchParams?.status).toLowerCase();
  const orderId = pickValue(searchParams?.orderId);
  const email = pickValue(searchParams?.email).toLowerCase();

  if (status === "success" || status === "processing") {
    const params = new URLSearchParams();
    if (orderId) params.set("orderId", orderId);
    if (email) params.set("email", email);
    const query = params.toString();
    redirect(query ? `/checkout/success?${query}` : "/checkout/success");
  }

  redirect("/checkout/failure");
}
