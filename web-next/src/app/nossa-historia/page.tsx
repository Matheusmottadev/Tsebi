import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyStaticPageRenderer } from "@/components/LegacyStaticPageRenderer";
import { loadLegacyStaticPage } from "@/lib/legacy-static-pages";

export const metadata: Metadata = {
  title: "Nossa historia",
  description: "Conheça a origem da Tsebi, nossa visão de marca e os pilares que guiam cada coleção.",
  alternates: {
    canonical: "/nossa-historia",
  },
  openGraph: {
    title: "Nossa historia | Tsebi Brasil",
    description: "Conheça a origem da Tsebi, nossa visão de marca e os pilares que guiam cada coleção.",
    url: "/nossa-historia",
    type: "website",
  },
};

export default async function NossaHistoriaPage() {
  const page = await loadLegacyStaticPage("nossa-historia");
  if (!page) notFound();

  return (
    <LegacyStaticPageRenderer
      stylesheetHrefs={page.stylesheetHrefs}
      inlineStyles={page.inlineStyles}
      bodyMarkup={page.bodyMarkup}
    />
  );
}
