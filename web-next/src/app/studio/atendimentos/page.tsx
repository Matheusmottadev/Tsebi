import type { Metadata } from "next";
import { HttpError } from "@/lib/http";
import { readStudioSession } from "@/lib/studio/server";
import { listPrivateCareAdmin } from "@/services/admin";
import { StudioShell } from "@/components/studio/StudioShell";
import { PrivateCareManager } from "@/components/studio/PrivateCareManager";
import styles from "./page.module.css";

type StudioPrivateCarePageProps = {
  searchParams?: Promise<{
    query?: string;
    status?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Studio Atendimentos",
  description: "Gestao de atendimentos privados e disponibilidade de horarios.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioPrivateCarePage({ searchParams }: StudioPrivateCarePageProps) {
  const session = await readStudioSession("/studio/atendimentos");
  const resolvedSearchParams = await searchParams;
  const query = String(resolvedSearchParams?.query || "").trim();
  const status = String(resolvedSearchParams?.status || "").trim();

  let errorMessage = "";
  let rows: Awaited<ReturnType<typeof listPrivateCareAdmin>>["rows"] = [];

  try {
    const result = await listPrivateCareAdmin(
      {
        query: query || undefined,
        status: status || undefined,
        page: 1,
        pageSize: 200,
      },
      { cookie: session.cookie, cache: "no-store" }
    );
    rows = Array.isArray(result.rows) ? result.rows : [];
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 404) {
        errorMessage = "Endpoint de atendimentos ainda nao disponivel no backend.";
      } else {
        errorMessage = error.message || "Falha ao carregar atendimentos.";
      }
    } else {
      errorMessage = "Falha ao carregar atendimentos.";
    }
  }

  return (
    <StudioShell admin={session.admin} title="Atendimentos" subtitle="Aceite ou recuse solicitacoes e publique horarios disponiveis.">
      <form className={styles.filters} method="get">
        <input type="search" name="query" defaultValue={query} placeholder="Buscar por cliente, email, assunto ou id" />
        <select name="status" defaultValue={status}>
          <option value="">Todos status</option>
          <option value="pending">pending</option>
          <option value="accepted">accepted</option>
          <option value="declined">declined</option>
          <option value="scheduled">scheduled</option>
          <option value="completed">completed</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

      <PrivateCareManager rows={rows} csrfToken={session.csrfToken} />
    </StudioShell>
  );
}

