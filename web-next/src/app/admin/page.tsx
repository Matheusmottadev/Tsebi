import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Tsebi",
  description: "Área administrativa.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return <main style={{ minHeight: "100vh", background: "#fff" }} aria-label="Área administrativa em branco" />;
}
