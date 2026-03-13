import type { PublicUser } from "@/types";
import styles from "../account.module.css";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function AccountHero({ user }: { user: PublicUser }) {
  return (
    <>
      <div className={styles.hero} />
      <div className={styles.avatarBlock}>
        <div className={styles.avatar}>{getInitials(user.name)}</div>
        <p className={styles.userRole}>Cliente</p>
        <h1 className={styles.userName}>{user.name}</h1>
      </div>
    </>
  );
}
