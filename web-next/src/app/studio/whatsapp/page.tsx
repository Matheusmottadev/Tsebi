import type { Metadata } from "next";
import { readStudioSession } from "@/lib/studio/server";
import { StudioShell } from "@/components/studio/StudioShell";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Studio WhatsApp",
  description: "Studio WhatsApp management.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioWhatsAppPage() {
  const session = await readStudioSession("/studio/whatsapp");

  return (
    <StudioShell admin={session.admin} title="WhatsApp" subtitle="Canal de disparos e contatos VIP.">
      <section className={styles.card}>
        <h3>Em breve</h3>
        <p>Esta aba sera ligada ao modulo de contatos VIP e disparos via WhatsApp do backend admin.</p>
      </section>
    </StudioShell>
  );
}
