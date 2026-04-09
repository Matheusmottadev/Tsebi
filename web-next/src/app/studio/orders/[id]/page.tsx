import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Price } from "@/components/Price";
import { StudioShell } from "@/components/studio/StudioShell";
import { HttpError } from "@/lib/http";
import { readStudioSession } from "@/lib/studio/server";
import { getOrderAdmin } from "@/services/admin";
import { buscarNfsePorPedido } from "../../../../../../lib/nfse";
import styles from "./page.module.css";

export const revalidate = 0;

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
  const nfse = await buscarNfsePorPedido(orderId);

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

      <div
        style={{
          marginTop: "24px",
          padding: "16px 20px",
          background: "#161616",
          border: "0.5px solid #1e1e1e",
          borderRadius: "8px",
        }}
      >
        <p style={{ fontSize: "10px", letterSpacing: "2px", color: "#444", margin: "0 0 12px", fontWeight: 500 }}>
          NOTA FISCAL
        </p>

        {!nfse ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ fontSize: "13px", color: "#555" }}>Nenhuma nota emitida</span>
            <a
              href={`/admin/nfse/emitir?pedidoId=${encodeURIComponent(orderId)}`}
              style={{
                background: "transparent",
                border: "0.5px solid #334",
                color: "#5577aa",
                fontSize: "11px",
                padding: "5px 12px",
                borderRadius: "5px",
                textDecoration: "none",
              }}
            >
              Emitir NFS-e
            </a>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <span style={{ fontSize: "13px", color: "#ccc" }}>
                {nfse.numero ? `NFS-e ${nfse.numero}` : "Em processamento"}
              </span>
              <span style={{ fontSize: "11px", color: "#555", marginLeft: "10px" }}>
                {Number(nfse.valor_servicos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "20px",
                  background: nfse.status === "autorizada" ? "#0d2b1a" : "#1a1a1a",
                  color: nfse.status === "autorizada" ? "#3a9e6a" : "#555",
                }}
              >
                {nfse.status}
              </span>
              {nfse.pdf_url ? (
                <a
                  href={nfse.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: "11px",
                    color: "#666",
                    textDecoration: "none",
                    border: "0.5px solid #2a2a2a",
                    padding: "4px 10px",
                    borderRadius: "5px",
                  }}
                >
                  PDF
                </a>
              ) : null}
            </div>
          </div>
        )}
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
