import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buscar | TSEBI",
  description: "Busca de produtos Tsebi.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/search",
  },
};

export default function SearchPage() {
  return <main style={{ minHeight: "100vh", background: "#fff" }} aria-label="Pagina de busca" />;
}
