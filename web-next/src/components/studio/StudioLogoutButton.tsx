"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { studioAuthLogout } from "@/services/admin";
import styles from "./StudioShell.module.css";

export function StudioLogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await studioAuthLogout();
    } finally {
      setIsSubmitting(false);
      router.replace("/studio/login");
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={handleLogout} className={styles.logoutButton} disabled={isSubmitting}>
      {isSubmitting ? "Saindo..." : "Sair"}
    </button>
  );
}
