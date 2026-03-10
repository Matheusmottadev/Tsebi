import type { Metadata } from "next";
import { StudioAdminPanel } from "@/components/studio/panel/StudioAdminPanel";

export const metadata: Metadata = {
  title: "Admin | Tsebi",
  description: "Painel administrativo da Tsebi.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return <StudioAdminPanel />;
}
