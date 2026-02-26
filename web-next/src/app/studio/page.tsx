import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";
import { UsersManager } from "@/components/studio/UsersManager";
import { readStudioSession } from "@/lib/studio/server";
import { listUsersAdmin } from "@/services/admin";
import styles from "./page.module.css";

type StudioUsersPageProps = {
  searchParams?: {
    query?: string;
    status?: string;
  };
};

export const metadata: Metadata = {
  title: "Studio Usuarios",
  description: "Gestao de usuarios do site no Studio.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioUsersPage({ searchParams }: StudioUsersPageProps) {
  const session = await readStudioSession("/studio");
  const query = String(searchParams?.query || "").trim();
  const status = String(searchParams?.status || "").trim();

  const result = await listUsersAdmin(
    { query: query || undefined, status: status || undefined, page: 1, pageSize: 100 },
    { cookie: session.cookie, cache: "no-store" }
  );

  return (
    <StudioShell admin={session.admin} title="Usuarios" subtitle="Gerencie cadastro, acesso e seguranca dos usuarios do site.">
      <form className={styles.filters} method="get">
        <input type="search" name="query" defaultValue={query} placeholder="Buscar por nome, email, CPF, CEP" />
        <select name="status" defaultValue={status}>
          <option value="">Todos status</option>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </select>
        <button type="submit">Buscar</button>
      </form>

      <UsersManager users={result.users || []} csrfToken={session.csrfToken} />
    </StudioShell>
  );
}
