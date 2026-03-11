import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Price } from "@/components/Price";
import { HttpError } from "@/lib/http";
import { getMyOrder } from "@/services/orders";
import type { Order } from "@/types";
import styles from "./page.module.css";

type OrderDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const metadata: Metadata = {
  title: "Order details",
  description: "Order line items and payment status from your account.",
};

function formatOrderDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatOrderStatus(status: string): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  return normalized.replaceAll("_", " ");
}

async function loadOrder(orderId: string): Promise<Order | null> {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;

  try {
    return await getMyOrder(orderId, { cookie, cache: "no-store" });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      redirect("/login");
    }
    throw error;
  }
}

export default async function AccountOrderDetailsPage({ params }: OrderDetailsPageProps) {
  const { id } = await params;
  const order = await loadOrder(decodeURIComponent(id));

  if (!order) {
    notFound();
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.qty * item.unitAmount, 0);

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2>{order.orderNumber || order.id}</h2>
        <p>{formatOrderDate(order.createdAt)}</p>
      </header>

      <div className={styles.metaRow}>
        <span className={styles.status}>{formatOrderStatus(order.status)}</span>
        <span className={styles.status}>tracking: {String(order.currentStatus || "N/A").toLowerCase()}</span>
      </div>

      {String(order.status || "").toLowerCase() === "processing" ? (
        <p className={styles.processing}>Payment received, order is being processed.</p>
      ) : null}

      <div className={styles.items}>
        {order.items.map((item) => (
          <article key={`${order.id}-${item.id}`} className={styles.item}>
            <div>
              <h3>{item.name}</h3>
              <p>Qty: {item.qty}</p>
            </div>
            <div className={styles.prices}>
              <Price amountCents={item.unitAmount} currency={item.currency} />
              <Price amountCents={item.unitAmount * item.qty} currency={item.currency} />
            </div>
          </article>
        ))}
      </div>

      <div className={styles.totals}>
        <div className={styles.totalLine}>
          <span>Subtotal</span>
          <Price amountCents={subtotal} currency={order.currency} />
        </div>
        <div className={styles.totalLine}>
          <span>Total</span>
          <Price amountCents={order.amount} currency={order.currency} />
        </div>
      </div>

      <footer className={styles.footer}>
        <p>Payment status: {formatOrderStatus(order.status)}</p>
        {order.stripePaymentIntentId ? (
          <p className={styles.intent}>Stripe PaymentIntent: {order.stripePaymentIntentId}</p>
        ) : null}
      </footer>
    </section>
  );
}
