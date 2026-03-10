import type { ReactNode } from "react";
import "@/app/globals.css";
import styles from "./admin.module.css";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className={styles.adminRoot}>
      <div className={styles.main}>{children}</div>
    </div>
  );
}
