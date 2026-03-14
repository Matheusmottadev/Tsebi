import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Price } from "@/components/Price";
import { StudioShell } from "@/components/studio/StudioShell";
import { HttpError } from "@/lib/http";
import { readStudioSession } from "@/lib/studio/server";
import { getOrderAdmin } from "@/services/admin";
import styles from "./page.module.css";

export const revalidate = 30;

type StudioOrderDetailPageProps = {
  params: {
    id: string;
  };
};

export const metadata: Metadata = {
  title: "Studio Order Detail",
  description: "Admin order detail in Studio portal.",
  robots: {
    index: false,
    follow: false,
  },
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function StudioOrderDetailPage({ params }: StudioOrderDetailPageProps) {
  const orderId = decodeURIComponent(params.id);
  const session = await readStudioSession(`/studio/orders/${encodeURIComponent(orderId)}`);
  let order;
  try {
    order = await getOrderAdmin(orderId, { cookie: session.cookie, cache: "no-store" });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <StudioShell
      admin={session.admin}
      title={`Order ${order.orderNumber || order.id}`}
      subtitle="Dados de pagamento e entrega consolidados no backend."
    >
      <div className={styles.grid}>
        <section className={styles.card}>
          <h3>Resumo</h3>
          <dl>
            <div>
              <dt>Pedido</dt>
              <dd>{order.orderNumber || order.id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{order.status}</dd>
            </div>
            <div>
              <dt>Tracking</dt>
              <dd>{order.currentStatus || "-"}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{formatDate(order.createdAt)}</dd>
            </div>
            <div>
              <dt>Atualizado em</dt>
              <dd>{formatDate(order.updatedAt)}</dd>
            </div>
            <div>
              <dt>PaymentIntent</dt>
              <dd>{order.stripePaymentIntentId || "-"}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.card}>
          <h3>Cliente</h3>
          <dl>
            <div>
              <dt>Nome</dt>
              <dd>{order.userName || "-"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{order.userEmail || "-"}</dd>
            </div>
            <div>
              <dt>Método</dt>
              <dd>{order.paymentMethod || "-"}</dd>
            </div>
            <div>
              <dt>Parcelas</dt>
              <dd>{order.installments}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className={styles.card}>
        <h3>Itens</h3>
        <div className={styles.items}>
          {order.items.map((item) => (
            <article key={`${order.id}-${item.id}`} className={styles.item}>
              <div>
                <h4>{item.name}</h4>
                <p>ID: {item.id}</p>
              </div>
              <div className={styles.itemMeta}>
                <span>Qtd: {item.qty}</span>
                <Price amountCents={item.unitAmount} currency={item.currency} />
                <Price amountCents={item.unitAmount * item.qty} currency={item.currency} />
              </div>
            </article>
          ))}
        </div>

        <div className={styles.totals}>
          <div>
            <span>Subtotal</span>
            <Price amountCents={order.itemsAmount} currency={order.currency} />
          </div>
          <div>
            <span>Frete</span>
            <Price amountCents={order.shippingAmount} currency={order.currency} />
          </div>
          <div>
            <span>Total</span>
            <Price amountCents={order.amount} currency={order.currency} />
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h3>Entrega</h3>
        <dl>
          <div>
            <dt>Provedor</dt>
            <dd>{order.shippingSelectedProvider || "-"}</dd>
          </div>
          <div>
            <dt>Serviço</dt>
            <dd>{order.shippingSelectedService || "-"}</dd>
          </div>
          <div>
            <dt>Código rastreio</dt>
            <dd>{order.shipment?.trackingCode || order.trackingCode || "-"}</dd>
          </div>
          <div>
            <dt>CEP destino</dt>
            <dd>{order.shippingDestinationZip || "-"}</dd>
          </div>
          <div>
            <dt>Detalhes shipping_json</dt>
            <dd>
              <pre>{JSON.stringify(order.shipping || {}, null, 2)}</pre>
            </dd>
          </div>
        </dl>
      </section>
    </StudioShell>
  );
}

