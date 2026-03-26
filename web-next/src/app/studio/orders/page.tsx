import type { Metadata } from "next";
import Link from "next/link";
import { Price } from "@/components/Price";
import { StudioShell } from "@/components/studio/StudioShell";
import { readStudioSession } from "@/lib/studio/server";
import { listOrdersAdmin } from "@/services/admin";
import styles from "./page.module.css";

export const revalidate = 0;

type StudioOrdersPageProps = {
  searchParams?: Promise<{
    status?: string;
    query?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Studio Orders",
  description: "Admin order list in Studio portal.",
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

export default async function StudioOrdersPage({ searchParams }: StudioOrdersPageProps) {
  const session = await readStudioSession("/studio/orders");
  const resolvedSearchParams = await searchParams;
  const status = String(resolvedSearchParams?.status || "").trim();
  const query = String(resolvedSearchParams?.query || "").trim();
  const result = await listOrdersAdmin(
    { page: 1, pageSize: 100, status: status || undefined, query: query || undefined },
    { cookie: session.cookie, cache: "no-store" }
  );

  return (
    <StudioShell admin={session.admin} title="Orders" subtitle="Acompanhe pedidos e pagamentos via backend.">
      <form className={styles.filters} method="get">
        <input type="search" name="query" defaultValue={query} placeholder="Buscar por id, email, cliente" />
        <select name="status" defaultValue={status}>
          <option value="">Todos status</option>
          <option value="pending_payment">pending_payment</option>
          <option value="processing">processing</option>
          <option value="paid">paid</option>
          <option value="failed">failed</option>
          <option value="canceled">canceled</option>
          <option value="refunded">refunded</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Total</th>
              <th>Criado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderNumber || order.id}</td>
                <td>
                  <div className={styles.customerCell}>
                    <span>{order.userName || "-"}</span>
                    <small>{order.userEmail || "-"}</small>
                  </div>
                </td>
                <td>{order.status}</td>
                <td>
                  <Price amountCents={order.amount} currency={order.currency} />
                </td>
                <td>{formatDate(order.createdAt)}</td>
                <td>
                  <Link href={`/studio/orders/${encodeURIComponent(order.id)}`}>Detalhes</Link>
                </td>
              </tr>
            ))}
            {result.orders.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Nenhum pedido encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </StudioShell>
  );
}
