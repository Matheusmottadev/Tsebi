import type { KpiTone } from "./types";
import styles from "./KpiCard.module.css";

type KpiCardProps = {
  label: string;
  value: string;
  delta: string;
  tone: KpiTone;
};

export function KpiCard({ label, value, delta, tone }: KpiCardProps) {
  return (
    <article className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      <p className={`${styles.delta} ${tone === "positive" ? styles.positive : styles.negative}`}>{delta}</p>
    </article>
  );
}

