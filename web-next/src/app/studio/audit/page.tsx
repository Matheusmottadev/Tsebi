import type { Metadata } from "next";
import Link from "next/link";
import { StudioShell } from "@/components/studio/StudioShell";
import { readStudioSession } from "@/lib/studio/server";
import { getAuditLogAdmin, listAuditLogsAdmin, searchAuditLogsAdmin } from "@/services/admin";
import styles from "./page.module.css";

type StudioAuditPageProps = {
  searchParams?: {
    query?: string;
    id?: string;
  };
};

export const metadata: Metadata = {
  title: "Studio Audit",
  description: "Admin audit log list and detail in Studio portal.",
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

export default async function StudioAuditPage({ searchParams }: StudioAuditPageProps) {
  const session = await readStudioSession("/studio/audit");
  const query = String(searchParams?.query || "").trim();
  const detailId = String(searchParams?.id || "").trim();

  const baseOptions = { cookie: session.cookie, cache: "no-store" } as const;
  const logsResult = query
    ? await searchAuditLogsAdmin({ query, page: 1, pageSize: 100 }, baseOptions)
    : await listAuditLogsAdmin({ limit: 100, offset: 0 }, baseOptions);
  const logs = "rows" in logsResult ? logsResult.rows : logsResult.logs;
  const detail = detailId ? await getAuditLogAdmin(detailId, baseOptions).catch(() => null) : null;

  return (
    <StudioShell admin={session.admin} title="Audit logs" subtitle="Trilha de ações administrativas em produção.">
      <form className={styles.filters} method="get">
        <input type="search" name="query" defaultValue={query} placeholder="Buscar por ator, entidade, resumo" />
        <button type="submit">Buscar</button>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Ação</th>
              <th>Entidade</th>
              <th>Resumo</th>
              <th>Ator</th>
              <th>Data</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.action}</td>
                <td>{log.entityType}</td>
                <td>{log.summary}</td>
                <td>{log.actorEmail || "-"}</td>
                <td>{formatDate(log.createdAt)}</td>
                <td>
                  <Link href={`/studio/audit?id=${encodeURIComponent(log.id)}`}>Detalhes</Link>
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Nenhum log encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detail ? (
        <section className={styles.detailCard}>
          <h3>Detalhe do log {detail.id}</h3>
          <pre>{JSON.stringify(detail, null, 2)}</pre>
        </section>
      ) : null}
    </StudioShell>
  );
}
