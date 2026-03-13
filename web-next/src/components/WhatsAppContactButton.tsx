"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import styles from "./WhatsAppContactButton.module.css";

const WHATSAPP_URL =
  "https://wa.me/5511918596632?text=Ol%C3%A1%21%20Preciso%20de%20ajuda%20com%20meu%20pedido%20ou%20produto%20da%20Tsebi.";

export function WhatsAppContactButton() {
  const pathname = usePathname();
  const normalizedPath = String(pathname || "").replace(/\/+$/, "") || "/";
  const isStudioRoute = pathname === "/studio" || pathname.startsWith("/studio/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPasswordRecoveryRoute = normalizedPath.startsWith("/recuperar-senha");

  if (isStudioRoute || isAdminRoute || isPasswordRecoveryRoute) return null;

  return (
    <a
      className={styles.launcher}
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Fale conosco no WhatsApp"
    >
      <Image className={styles.launcherIcon} src="/images/logo-tsebi.png" alt="" aria-hidden="true" width={44} height={44} />
      <span>Fale Conosco</span>
    </a>
  );
}
