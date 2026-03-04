import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Perguntas frequentes sobre pedidos, pagamentos, entregas e atendimento da Tsebi.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "FAQ | Tsebi Brasil",
    description: "Perguntas frequentes sobre pedidos, pagamentos, entregas e atendimento da Tsebi.",
    url: "/faq",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ | Tsebi Brasil",
    description: "Perguntas frequentes sobre pedidos, pagamentos, entregas e atendimento da Tsebi.",
  },
};

export default function FaqPage() {
  redirect("/legacy/pages/faq.html");
}
