import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Nossa historia",
  description: "Conheca a origem da Tsebi, nossa visao de marca e os pilares que guiam cada colecao.",
  alternates: {
    canonical: "/nossa-historia",
  },
  openGraph: {
    title: "Nossa historia | Tsebi Brasil",
    description: "Conheca a origem da Tsebi, nossa visao de marca e os pilares que guiam cada colecao.",
    url: "/nossa-historia",
    type: "website",
  },
};

export default function NossaHistoriaPage() {
  redirect("/legacy/pages/nossa-historia.html");
}
