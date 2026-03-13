import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getMe } from "@/services/auth";
import { AccountHero } from "./_components/AccountHero";
import { AccountShell } from "./_components/AccountShell";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "Minha Conta",
  description: "Area da conta Tsebi com perfil, pedidos, favoritos e servicos exclusivos.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;
  const user = await getMe({ cache: "no-store", cookie });

  if (!user) redirect("/login");

  return (
    <div className={styles.root}>
      <AccountHero user={user} />
      <AccountShell user={user} />
    </div>
  );
}
