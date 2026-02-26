import type { Metadata } from "next";
import { readPublicEnv } from "@/lib/env";
import { listProducts } from "@/services/products";
import { CatalogBrowser } from "@/components/CatalogBrowser";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "Produtos",
  description: "Explore o catalogo da Tsebi por categoria, colecao, estilo e faixa de preco.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Produtos | Tsebi Brasil",
    description: "Explore o catalogo da Tsebi por categoria, colecao, estilo e faixa de preco.",
    url: "/products",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Produtos | Tsebi Brasil",
    description: "Explore o catalogo da Tsebi por categoria, colecao, estilo e faixa de preco.",
  },
};

async function loadCatalogProducts(): Promise<Product[]> {
  try {
    return await listProducts();
  } catch {
    return [];
  }
}

function getImageBaseUrl(): string {
  try {
    return readPublicEnv().apiBaseUrl;
  } catch {
    return "";
  }
}

export default async function ProductsPage() {
  const products = await loadCatalogProducts();
  const imageBaseUrl = getImageBaseUrl();

  return (
    <main className="story-page">
      <div className="story-wrap">
        <h2 className="story-title">Produtos</h2>
        <div className="story-content">
          <p>Explore o catalogo atual da TSEBI.</p>
        </div>
      </div>
      <section className="tsebi-category-section" aria-label="Catalogo de produtos">
        <div className="tsebi-container">
          <CatalogBrowser products={products} imageBaseUrl={imageBaseUrl} initialLimit={12} />
        </div>
      </section>
    </main>
  );
}
