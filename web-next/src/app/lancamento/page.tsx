import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Lancamento",
  description: "Acompanhe o pre-lancamento da Tsebi e receba acesso antecipado as proximas pecas da marca.",
  alternates: {
    canonical: "/lancamento",
  },
  openGraph: {
    title: "Lancamento | Tsebi Brasil",
    description: "Acompanhe o pre-lancamento da Tsebi e receba acesso antecipado as proximas pecas da marca.",
    url: "/lancamento",
    type: "website",
  },
};

export default function LancamentoPage() {
  redirect("/legacy/pages/lancamento.html");
}
