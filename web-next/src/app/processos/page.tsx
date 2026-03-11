import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyStaticPageRenderer } from "@/components/LegacyStaticPageRenderer";
import { loadLegacyStaticPage } from "@/lib/legacy-static-pages";

export const revalidate = 3600;

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

export default async function ProcessosPage() {
  const page = await loadLegacyStaticPage("processos");
  if (!page) notFound();

  return (
    <LegacyStaticPageRenderer
      stylesheetHrefs={page.stylesheetHrefs}
      inlineStyles={page.inlineStyles}
      bodyMarkup={page.bodyMarkup}
      scriptSrcs={page.scriptSrcs}
      inlineScripts={page.inlineScripts}
    />
  );
}
