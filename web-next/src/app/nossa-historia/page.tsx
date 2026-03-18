import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyStaticPageRenderer } from "@/components/LegacyStaticPageRenderer";
import { loadLegacyStaticPage } from "@/lib/legacy-static-pages";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Nossa historia",
  description: "ConheÃ§a a origem da Tsebi, nossa visÃ£o de marca e os pilares que guiam cada coleÃ§Ã£o.",
  alternates: {
    canonical: "/nossa-historia",
  },
  openGraph: {
    title: "Nossa historia | Tsebi Brasil",
    description: "ConheÃ§a a origem da Tsebi, nossa visÃ£o de marca e os pilares que guiam cada coleÃ§Ã£o.",
    url: "/nossa-historia",
    type: "website",
  },
};

export default async function NossaHistoriaPage() {
  return null;
}

