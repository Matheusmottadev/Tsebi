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

function brl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((Number(cents) || 0) / 100);
}

function dayKey(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function hourInSaoPaulo(value: string | null): number {
  if (!value) return -1;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return -1;
  const hour = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const parsed = Number.parseInt(hour, 10);
  return Number.isFinite(parsed) ? parsed : -1;
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

function buildChart(orders: AdminOrderSummary[], today: string) {
  const bins = [
    { label: "00-02", start: 0, end: 2, cents: 0 },
    { label: "03-05", start: 3, end: 5, cents: 0 },
    { label: "06-08", start: 6, end: 8, cents: 0 },
    { label: "09-11", start: 9, end: 11, cents: 0 },
    { label: "12-14", start: 12, end: 14, cents: 0 },
    { label: "15-17", start: 15, end: 17, cents: 0 },
    { label: "18-20", start: 18, end: 20, cents: 0 },
    { label: "21-23", start: 21, end: 23, cents: 0 },
  ];

  for (const order of orders) {
    if (order.status !== "paid") continue;
    if (dayKey(order.createdAt) !== today) continue;
    const hour = hourInSaoPaulo(order.createdAt);
    if (hour < 0) continue;
    const bin = bins.find((item) => hour >= item.start && hour <= item.end);
    if (!bin) continue;
    bin.cents += Number(order.amount || 0);
  }

  const maxCents = Math.max(...bins.map((item) => item.cents), 1);
  return bins.map((item) => ({
    label: item.label,
    value: item.cents,
    height: Math.max(8, Math.round((item.cents / maxCents) * 100)),
  }));
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
  const paidTodayCents = orders
    .filter((order) => order.status === "paid" && dayKey(order.createdAt) === today)
    .reduce((sum, order) => sum + Number(order.amount || 0), 0);

  const orderRows = buildOrderRows(orders, today);

  const usersToday = users.filter((user) => dayKey(user.createdAt) === today).length;
  const newsletterToday = newsletterRows.filter((row) => dayKey(row.subscribedAt) === today).length;
  const vipToday = vipRows.filter((row) => dayKey(row.subscribedAt) === today).length;

  const chart = buildChart(orders, today);

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

      <section className={styles.chartCard}>
        <header className={styles.chartHeader}>
          <div>
            <h3>Vendas do dia</h3>
            <p>{today}</p>
          </div>
          <strong>{brl(paidTodayCents)}</strong>
        </header>
        <div className={styles.chartBars}>
          {chart.map((item) => (
            <div key={item.label} className={styles.barCol}>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ height: `${item.height}%` }} title={`${item.label} - ${brl(item.value)}`} />
              </div>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </StudioShell>
  );
}
