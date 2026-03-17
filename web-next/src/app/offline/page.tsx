import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sem conexão | Tsebi Brasil",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <img
          src="/images/Gazelalogo-round-256.png"
          alt="Tsebi Brasil"
          className={styles.logo}
          width={80}
          height={80}
        />
        <h1 className={styles.heading}>Você está offline</h1>
        <p className={styles.body}>
          Verifique sua conexão com a internet e tente novamente.
        </p>
        <a href="/" className={styles.cta}>
          Tentar novamente
        </a>
      </div>
    </main>
  );
}
