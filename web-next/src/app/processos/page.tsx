import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Processos",
  description: "Entenda os processos da Tsebi: criacao, modelagem, acabamento e controle de qualidade.",
  alternates: {
    canonical: "/processos",
  },
  openGraph: {
    title: "Processos | Tsebi Brasil",
    description: "Entenda os processos da Tsebi: criacao, modelagem, acabamento e controle de qualidade.",
    url: "/processos",
    type: "website",
  },
};

export default function ProcessosPage() {
  redirect("/legacy/pages/processos.html");
}
