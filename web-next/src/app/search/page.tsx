import type { Metadata } from "next";
import { SearchClient } from "@/app/search/SearchClient";

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

type SearchPageProps = {
  searchParams?: {
    q?: string;
  };
};

export default function SearchPage({ searchParams }: SearchPageProps) {
  const initialQuery = String(searchParams?.q || "").trim();
  return <SearchClient initialQuery={initialQuery} />;
}
