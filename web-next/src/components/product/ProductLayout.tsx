import styles from "./ProductExperience.module.css";

type ProductLayoutProps = {
  media: React.ReactNode;
  content: React.ReactNode;
};

export function ProductLayout({ media, content }: ProductLayoutProps) {
  return (
    <main className={styles.main}>
      <section className={styles.mediaPanel}>{media}</section>
      <section className={styles.infoPanel}>{content}</section>
    </main>
  );
}
