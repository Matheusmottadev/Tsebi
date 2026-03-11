import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StudioLoginFlow } from "@/components/studio/StudioLoginFlow";
import { HttpError } from "@/lib/http";
import { studioAuthMe } from "@/services/admin";
import styles from "./page.module.css";

export const revalidate = 30;

type StudioLoginPageProps = {
  searchParams?: Promise<{
    returnTo?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Studio Login",
  description: "Admin login with MFA for Studio portal.",
  robots: {
    index: false,
    follow: false,
  },
};

function sanitizeReturnTo(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/studio";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/studio";
  return raw;
}

export default async function StudioLoginPage({ searchParams }: StudioLoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const returnTo = sanitizeReturnTo(resolvedSearchParams?.returnTo);
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;

  try {
    const me = await studioAuthMe({ cookie, cache: "no-store" });
    if (me.authenticated) {
      redirect(returnTo);
    }
  } catch (error) {
    if (!(error instanceof HttpError) || (error.status !== 401 && error.status !== 403)) {
      throw error;
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <p className={styles.kicker}>Acesso interno</p>
          <h1>Studio Login</h1>
          <p>Login separado do cliente com MFA obrigatorio para administradores.</p>
          <StudioLoginFlow returnTo={returnTo} />
        </section>
      </main>
    </div>
  );
}
