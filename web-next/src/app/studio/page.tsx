import type { Metadata } from "next";
import { StudioAdminPanel } from "@/components/studio/panel/StudioAdminPanel";
import { readStudioSession } from "@/lib/studio/server";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Studio Administrativo",
  description: "Painel administrativo da Tsebi.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioHomePage() {
  await readStudioSession("/studio");
  return <StudioAdminPanel />;
}

