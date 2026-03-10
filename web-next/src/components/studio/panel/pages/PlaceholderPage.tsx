import type { LucideIcon } from "lucide-react";
import styles from "./PlaceholderPage.module.css";

type PlaceholderPageProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
};

export function PlaceholderPage({ title, subtitle, icon: Icon }: PlaceholderPageProps) {
  return (
    <section className={styles.wrap}>
      <Icon size={40} strokeWidth={1} color="#e0e0e0" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </section>
  );
}

