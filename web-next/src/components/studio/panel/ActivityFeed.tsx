import type { ActivityItem } from "./types";
import styles from "./ActivityFeed.module.css";

type ActivityFeedProps = {
  items: ActivityItem[];
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h3>ATIVIDADE RECENTE</h3>
      </header>

      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <span className={`${styles.bullet} ${item.important ? styles.important : styles.secondary}`} aria-hidden="true" />
            <div>
              <p>{item.text}</p>
              <small>{item.time}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

