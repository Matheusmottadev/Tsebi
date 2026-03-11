import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Buscar produtos",
  description: "Busque produtos, categorias e colecoes da Tsebi Brasil.",
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: "/products",
  },
};

export default function SearchPage() {
  redirect("/products");
}
