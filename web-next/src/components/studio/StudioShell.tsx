"use client";

import styles from "./StudioShell.module.css";

type StudioShellProps = {
  admin: unknown;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function StudioShell(_props: StudioShellProps) {
  return <div className={styles.blank} />;
}
