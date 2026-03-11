import type { Metadata } from "next";
import { BodyClassName } from "@/components/BodyClassName";
import { FaqPageSections } from "@/components/faq/FaqPageSections";
import { LegacyFooter } from "@/components/home-legacy/LegacyFooter";
import styles from "./page.module.css";

export const revalidate = 3600;

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
  return (
    <>
      <BodyClassName className="faq-page-body" />
      <main className={styles.page}>
        <FaqPageSections />
      </main>
      <LegacyFooter />
    </>
  );
}
