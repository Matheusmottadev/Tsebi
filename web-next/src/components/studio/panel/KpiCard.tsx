import type { KpiTone } from "./types";
import styles from "./KpiCard.module.css";

type KpiCardProps = {
  label: string;
  value: string;
  delta: string;
  tone: KpiTone;
};

export function KpiCard({ label, value, delta, tone }: KpiCardProps) {
  const [trendPart, contextPart] = delta.split(" vs ");

  return (
    <article
      className={styles.card}
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        padding: "24px 28px",
      }}
    >
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      <p className={styles.delta}>
        <span className={tone === "positive" ? styles.positive : styles.negative}>{trendPart}</span>
        {contextPart ? <span className={styles.context}> vs {contextPart}</span> : null}
      </p>
    </article>
  );
}
