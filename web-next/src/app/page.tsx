import type { Metadata } from "next";
import { BodyClassName } from "@/components/BodyClassName";
import { LegacyHome } from "@/components/home-legacy/LegacyHome";
import { listProducts } from "@/services/products";
import type { Product } from "@/types";
import styles from "@/app/home-legacy/page.module.css";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Tsebi Brasil | Moda Autoral e Design Contemporâneo",
  description:
    "Tsebi Brasil: moda autoral com coleções exclusivas, design contemporâneo e acabamento premium. Compre online com entrega para todo o Brasil.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Tsebi Brasil | Moda Autoral e Design Contemporâneo",
    description:
      "Tsebi Brasil: moda autoral com coleções exclusivas, design contemporâneo e acabamento premium.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tsebi Brasil | Moda Autoral e Design Contemporâneo",
    description:
      "Tsebi Brasil: moda autoral com coleções exclusivas, design contemporâneo e acabamento premium.",
  },
};

const homePageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://tsebi.com.br/#webpage",
  name: "Tsebi Brasil | Moda Autoral e Design Contemporâneo",
  url: "https://tsebi.com.br/",
  description:
    "Tsebi Brasil: moda autoral com coleções exclusivas, design contemporâneo e acabamento premium. Compre online com entrega para todo o Brasil.",
  isPartOf: { "@id": "https://tsebi.com.br/#website" },
  about: { "@id": "https://tsebi.com.br/#organization" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Tsebi Brasil",
        item: "https://tsebi.com.br/",
      },
    ],
  },
};

async function loadProducts(): Promise<Product[]> {
  try {
    return await listProducts();
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const products = await loadProducts();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homePageSchema) }}
      />
      <div className={styles.route}>
        <BodyClassName className="home-legacy-page" />
        <LegacyHome products={products} />
      </div>
    </>
  );
}
