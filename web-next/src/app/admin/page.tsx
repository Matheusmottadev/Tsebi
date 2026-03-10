import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#111", color: "#fff" }}>
      <p style={{ fontFamily: "sans-serif", fontWeight: 300, letterSpacing: "0.08em" }}>Área administrativa</p>
    </main>
  );
}
