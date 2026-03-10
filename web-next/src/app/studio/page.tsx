import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";
import { readStudioSession } from "@/lib/studio/server";
import { listNewsletterAdmin, listOrdersAdmin, listUsersAdmin, listVipAdmin, type AdminOrderSummary } from "@/services/admin";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Studio Inicio",
  description: "Resumo geral do Studio.",
  robots: {
    index: false,
    follow: false,
  },
};

type StatRow = {
  label: string;
  value: number;
  tone: "neutral" | "positive" | "info" | "danger";
};

function dayKey(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function buildOrderRows(orders: AdminOrderSummary[], today: string): StatRow[] {
  const totalSales = orders.filter((order) => order.status === "paid").length;
  const newOrders = orders.filter((order) => dayKey(order.createdAt) === today).length;
  const inProgress = orders.filter((order) => ["processing", "pending_payment"].includes(order.status)).length;
  const canceled = orders.filter((order) => ["canceled", "failed", "refunded"].includes(order.status)).length;

  return [
    { label: "Total de vendas", value: totalSales, tone: "neutral" },
    { label: "Novos", value: newOrders, tone: "positive" },
    { label: "Em andamento", value: inProgress, tone: "info" },
    { label: "Cancelados", value: canceled, tone: "danger" },
  ];
}

export default async function StudioHomePage() {
  const session = await readStudioSession("/studio");

  const [ordersRes, usersRes, newsletterRes, vipRes] = await Promise.all([
    listOrdersAdmin({ page: 1, pageSize: 200 }, { cookie: session.cookie, cache: "no-store" }),
    listUsersAdmin({ page: 1, pageSize: 200 }, { cookie: session.cookie, cache: "no-store" }),
    listNewsletterAdmin({ page: 1, pageSize: 200 }, { cookie: session.cookie, cache: "no-store" }),
    listVipAdmin({ page: 1, pageSize: 200 }, { cookie: session.cookie, cache: "no-store" }),
  ]);

  const orders = ordersRes.orders || [];
  const users = usersRes.users || [];
  const newsletterRows = newsletterRes.rows || [];
  const vipRows = vipRes.rows || [];

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const orderRows = buildOrderRows(orders, today);

  const usersToday = users.filter((user) => dayKey(user.createdAt) === today).length;
  const newsletterToday = newsletterRows.filter((row) => dayKey(row.subscribedAt) === today).length;
  const vipToday = vipRows.filter((row) => dayKey(row.subscribedAt) === today).length;

  return (
    <StudioShell admin={session.admin} title="Inicio" subtitle="Resumo geral do Studio em tempo real.">
      <section className={styles.metricsGrid}>
        <article className={styles.card}>
          <header className={styles.cardHeader}>
            <h3>Pedidos de venda</h3>
          </header>
          <ul className={styles.statsList}>
            {orderRows.map((row) => (
              <li key={row.label} className={styles.statItem}>
                <span className={`${styles.dot} ${styles[`dot_${row.tone}`]}`} />
                <strong>{row.value}</strong>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.card}>
          <header className={styles.cardHeader}>
            <h3>Usuarios</h3>
          </header>
          <ul className={styles.statsList}>
            <li className={styles.statItem}>
              <span className={`${styles.dot} ${styles.dot_neutral}`} />
              <strong>{usersRes.total ?? users.length}</strong>
              <span>Total cadastrados</span>
            </li>
            <li className={styles.statItem}>
              <span className={`${styles.dot} ${styles.dot_positive}`} />
              <strong>{usersToday}</strong>
              <span>Novos hoje</span>
            </li>
          </ul>
        </article>

        <article className={styles.card}>
          <header className={styles.cardHeader}>
            <h3>Newsletter</h3>
          </header>
          <ul className={styles.statsList}>
            <li className={styles.statItem}>
              <span className={`${styles.dot} ${styles.dot_neutral}`} />
              <strong>{newsletterRes.total ?? newsletterRows.length}</strong>
              <span>Total inscritos</span>
            </li>
            <li className={styles.statItem}>
              <span className={`${styles.dot} ${styles.dot_positive}`} />
              <strong>{newsletterToday}</strong>
              <span>Novos hoje</span>
            </li>
          </ul>
        </article>

        <article className={styles.card}>
          <header className={styles.cardHeader}>
            <h3>Lista VIP</h3>
          </header>
          <ul className={styles.statsList}>
            <li className={styles.statItem}>
              <span className={`${styles.dot} ${styles.dot_neutral}`} />
              <strong>{vipRes.total ?? vipRows.length}</strong>
              <span>Total inscritos</span>
            </li>
            <li className={styles.statItem}>
              <span className={`${styles.dot} ${styles.dot_positive}`} />
              <strong>{vipToday}</strong>
              <span>Novos hoje</span>
            </li>
          </ul>
        </article>
      </section>
    </StudioShell>
  );
}
