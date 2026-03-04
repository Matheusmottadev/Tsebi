import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";
import { readStudioSession } from "@/lib/studio/server";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Studio",
  description: "Studio dashboard.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioPage() {
  const session = await readStudioSession("/studio");

  return (
    <StudioShell admin={session.admin} title="Studio" subtitle="Selecione uma categoria no header para começar.">
      <section className={styles.welcomeCard}>
        <h3>Painel pronto</h3>
        <p>Backend mantido. Agora podemos evoluir cada categoria com as funções que você quiser.</p>
      </section>
    </StudioShell>
  );
}
