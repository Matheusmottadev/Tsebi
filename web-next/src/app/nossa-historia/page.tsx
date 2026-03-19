import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyStaticPageRenderer } from "@/components/LegacyStaticPageRenderer";
import { loadLegacyStaticPage } from "@/lib/legacy-static-pages";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Nossa história",
  description: "Conheça a origem da Tsebi, nossa visão de marca e os pilares que guiam cada coleção.",
  alternates: {
    canonical: "/nossa-historia",
  },
  openGraph: {
    title: "Nossa história | Tsebi Brasil",
    description: "Conheça a origem da Tsebi, nossa visão de marca e os pilares que guiam cada coleção.",
    url: "/nossa-historia",
    type: "website",
  },
};

export default async function NossaHistoriaPage() {
  return null;
}

