import type { Metadata } from "next";
import { readStudioSession } from "@/lib/studio/server";
import { listNewsletterAdmin } from "@/services/admin";
import { StudioShell } from "@/components/studio/StudioShell";
import styles from "./page.module.css";

export const revalidate = 30;

type StudioNewsletterPageProps = {
  searchParams?: Promise<{
    query?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Studio Newsletter",
  description: "Studio newsletter subscribers.",
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

export default async function StudioNewsletterPage({ searchParams }: StudioNewsletterPageProps) {
  const session = await readStudioSession("/studio/newsletter");
  const resolvedSearchParams = await searchParams;
  const query = String(resolvedSearchParams?.query || "").trim();
  const result = await listNewsletterAdmin(
    { query: query || undefined, page: 1, pageSize: 100 },
    { cookie: session.cookie, cache: "no-store" }
  );

  return (
    <StudioShell admin={session.admin} title="Newsletter" subtitle="Inscritos ativos para campanhas e segmentacao.">
      <form className={styles.filters} method="get">
        <input type="search" name="query" defaultValue={query} placeholder="Buscar por email, telefone, origem" />
        <button type="submit">Buscar</button>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Telefone</th>
              <th>Origem</th>
              <th>Status</th>
              <th>Consentimento</th>
              <th>Inscrito em</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.email || "-"}</td>
                <td>{row.phone || "-"}</td>
                <td>{row.source || "-"}</td>
                <td>{row.status || "-"}</td>
                <td>{row.consent ? "sim" : "não"}</td>
                <td>{formatDate(row.subscribedAt)}</td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
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
