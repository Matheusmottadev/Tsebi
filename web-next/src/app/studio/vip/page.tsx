import type { Metadata } from "next";
import { HttpError } from "@/lib/http";
import { readStudioSession } from "@/lib/studio/server";
import { listVipAdmin } from "@/services/admin";
import { StudioShell } from "@/components/studio/StudioShell";
import styles from "./page.module.css";

type StudioVipPageProps = {
  searchParams?: {
    query?: string;
  };
};

export const metadata: Metadata = {
  title: "Studio VIP",
  description: "Studio VIP subscribers list.",
  robots: {
    index: false,
    follow: false,
  },
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default async function StudioVipPage({ searchParams }: StudioVipPageProps) {
  const session = await readStudioSession("/studio/vip");
  const query = String(searchParams?.query || "").trim();

  let errorMessage = "";
  let result: Awaited<ReturnType<typeof listVipAdmin>> = {
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
  };

  try {
    result = await listVipAdmin({ query: query || undefined, page: 1, pageSize: 100 }, { cookie: session.cookie, cache: "no-store" });
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 500) {
        errorMessage = "Banco VIP nao configurado no backend.";
      } else {
        errorMessage = error.message || "Falha ao carregar lista VIP.";
      }
    } else {
      errorMessage = "Falha ao carregar lista VIP.";
    }
  }

  return (
    <StudioShell admin={session.admin} title="Lista VIP" subtitle="Inscritos com busca, edicao e auditoria.">
      <form className={styles.filters} method="get">
        <input type="search" name="query" defaultValue={query} placeholder="Buscar por nome, email, CPF, CEP" />
        <button type="submit">Buscar</button>
      </form>

      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Email</th>
              <th>Origem</th>
              <th>Inscrito em</th>
              <th>Cliente?</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name || "-"}</td>
                <td>{row.email || "-"}</td>
                <td>{row.source || "-"}</td>
                <td>{formatDate(row.subscribedAt)}</td>
                <td>{row.accountCreated ? "conta criada" : "nao"}</td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Nenhum inscrito encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </StudioShell>
  );
}
