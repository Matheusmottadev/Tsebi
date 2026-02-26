import styles from "./layout.module.css";

type StudioLayoutProps = {
  children: React.ReactNode;
};

export default function StudioLayout({ children }: StudioLayoutProps) {
  return <div className={styles.root}>{children}</div>;
}
