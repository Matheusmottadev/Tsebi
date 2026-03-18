"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listMyOrders } from "@/services/orders";
import { useCartStore } from "@/lib/cart/cartStore";
import type { Order } from "@/types";
import { OrderTracker, type OrderStatus } from "@/components/OrderTracker";
import styles from "../account.module.css";

function toOrderStatus(order: Order): OrderStatus {
  if (order.status === "canceled") return "cancelado";
  if (order.status === "failed")   return "falhou";

  // tracking de envio (currentStatus = SHIPPED, IN_TRANSIT, DELIVERED, etc.)
  const tracking = String(order.currentStatus || "").toUpperCase();
  if (tracking === "DELIVERED")                                    return "entregue";
  if (tracking === "IN_TRANSIT" || tracking === "OUT_FOR_DELIVERY") return "saiu_para_entregar";
  if (tracking === "SHIPPED")                                      return "enviado";

  // para ORDER_PLACED / PROCESSING / EXCEPTION ou sem tracking, usa status de pagamento
  const payment = String(order.status || "").toUpperCase();
  if (payment === "PAID")       return "confirmado";
  if (payment === "PROCESSING") return "confirmado";

  return "recebido";
}

function getStatusMeta(order: Order): { label: string; cls: string } {
  const s = order.currentStatus ?? order.status;
  if (s === "DELIVERED") return { label: "Entregue", cls: styles.statusGreen };
  if (s === "IN_TRANSIT" || s === "OUT_FOR_DELIVERY" || s === "SHIPPED") {
    return { label: "Em trânsito", cls: styles.statusYellow };
  }
  if (order.status === "failed" || order.status === "canceled") {
    return { label: order.status === "failed" ? "Falhou" : "Cancelado", cls: styles.statusRed };
  }
  if (order.status === "paid") {
    return { label: "Confirmado", cls: styles.statusGreen };
  }
  if (order.status === "processing") {
    return { label: "Processando", cls: styles.statusBlue };
  }
  return { label: "Pendente", cls: styles.statusGray };
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(val: string | null): string {
  if (!val) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(val));
}


function OrderRow({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; warn: boolean } | null>(null);
  const { label, cls } = getStatusMeta(order);
  const isFailed = order.status === "failed" || order.status === "canceled";
  const isDelivered = order.currentStatus === "DELIVERED";
  const addItem = useCartStore((s) => s.addItem);
  const router = useRouter();

  const handleRetry = () => {
    const outOfStock: string[] = [];
    for (const item of order.items) {
      const result = addItem({
        item: {
          productId: item.id,
          name: item.name,
          unitAmount: item.unitAmount,
          currency: item.currency,
          variant: (item.variantKey || item.variantSize || item.variantColor)
            ? { variantId: item.variantKey ?? null, variantName: null, size: item.variantSize ?? null, color: item.variantColor ?? null }
            : null,
        },
        qty: item.qty,
      });
      if (!result.ok) outOfStock.push(item.name);
    }

    const msg = outOfStock.length > 0
      ? `Sem estoque: ${outOfStock.join(", ")}`
      : "Produtos adicionados ao carrinho";
    setToast({ msg, warn: outOfStock.length > 0 });
    setTimeout(() => {
      setToast(null);
      router.push("/cart");
    }, 2000);
  };

  return (
    <>
      {toast && (
        <div className={`${styles.toastBar} ${toast.warn ? styles.toastBarWarn : styles.toastBarSuccess}`}>
          {toast.msg}
        </div>
      )}
      <div className={styles.orderRow}>
        <button
          type="button"
          className={styles.orderHeader}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className={styles.orderNumber}>#{order.orderNumber || order.id}</span>
          <span className={styles.orderDate}>{formatDate(order.createdAt)}</span>
          <span className={styles.orderTotal}>{formatBRL(order.amount)}</span>
          <span className={`${styles.statusBadge} ${cls}`}>{label}</span>
          <span className={`${styles.orderChevron} ${open ? styles.orderChevronOpen : ""}`}>v</span>
        </button>

        {open && (
          <div className={styles.orderExpanded}>
            <OrderTracker status={toOrderStatus(order)} />

            {(order.trackingCode || order.carrier) && (
              <p className={styles.trackingInfo}>
                {order.carrier && <span>Transportadora: {order.carrier} · </span>}
                {order.trackingCode && <span>Código: {order.trackingCode}</span>}
              </p>
            )}

            <div className={styles.orderItems}>
              {order.items.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className={styles.orderItem}>
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className={styles.orderItemImg}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.orderItemImgPlaceholder} />
                  )}
                  <div className={styles.orderItemInfo}>
                    <p className={styles.orderItemMeta}>
                      {[item.qty > 1 ? `Qtd: ${item.qty}` : null, item.variantSize, item.variantColor]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className={styles.orderItemName}>{item.name}</p>
                  </div>
                  <p className={styles.orderItemPrice}>{formatBRL(item.unitAmount * item.qty)}</p>
                </div>
              ))}
            </div>

            <div className={styles.orderActions}>
              {isDelivered && (
                <button type="button" className={styles.btnPill}>
                  Solicitar troca ou devolução
                </button>
              )}
              {isFailed && (
                <button type="button" className={`${styles.btnPill} ${styles.btnPillFilled}`} onClick={handleRetry}>
                  Tentar novamente
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    listMyOrders()
      .then(setOrders)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.loading}>Carregando pedidos...</div>;
  if (error) return <div className={styles.errorState}>Não foi possível carregar os pedidos.</div>;
  if (!orders.length) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>Nenhum pedido ainda</p>
        <p className={styles.emptyDesc}>Seus pedidos aparecerão aqui após a primeira compra.</p>
      </div>
    );
  }

  return (
    <div className={styles.orderList}>
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
    </div>
  );
}
