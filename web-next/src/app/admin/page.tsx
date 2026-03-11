import type { Metadata } from "next";
import { StudioAdminPanel } from "@/components/studio/panel/StudioAdminPanel";
import { requireAdminSession } from "@/lib/admin/server";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Admin | Tsebi",
  description: "Painel administrativo da Tsebi.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  await requireAdminSession("/admin");
  return <StudioAdminPanel />;
}
