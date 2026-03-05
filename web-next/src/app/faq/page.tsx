import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyStaticPageRenderer } from "@/components/LegacyStaticPageRenderer";
import { loadLegacyStaticPage } from "@/lib/legacy-static-pages";

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

export default async function FaqPage() {
  const page = await loadLegacyStaticPage("faq");
  if (!page) notFound();

  return (
    <LegacyStaticPageRenderer
      stylesheetHrefs={page.stylesheetHrefs}
      inlineStyles={page.inlineStyles}
      bodyMarkup={page.bodyMarkup}
    />
  );
}
