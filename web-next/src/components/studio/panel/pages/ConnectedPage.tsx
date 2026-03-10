import type {
  AdminAuditLog,
  AdminNewsletterRow,
  AdminOrderSummary,
  AdminPrivateCareRequest,
  AdminUserRow,
  AdminVipRow,
} from "@/services/admin";
import type { Coupon, Product } from "@/types";
import type { AdminPageKey } from "../types";
import styles from "./ConnectedPage.module.css";

export interface ConnectedPanelData {
  orders: AdminOrderSummary[];
  products: Product[];
  users: AdminUserRow[];
  privateCare: AdminPrivateCareRequest[];
  vip: AdminVipRow[];
  newsletter: AdminNewsletterRow[];
  coupons: Coupon[];
  audit: AdminAuditLog[];
}

type ConnectedPageProps = {
  page: Exclude<AdminPageKey, "inicio">;
  data: ConnectedPanelData;
  loading: boolean;
  errorMessage: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatMoneyCents(amountCents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: String(currency || "BRL").toUpperCase(),
    maximumFractionDigits: 0,
  }).format((Number(amountCents || 0) || 0) / 100);
}

function formatCouponRule(coupon: Coupon): string {
  if (coupon.type === "percent") return `${Number(coupon.percentOff || 0)}%`;
  return formatMoneyCents(Number(coupon.amountOffCents || 0), "BRL");
}

function pickOrderId(order: AdminOrderSummary): string {
  const raw = String(order.id || "").trim();
  if (!raw) return "-";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function renderEmpty(colSpan: number, text: string) {
  return (
    <tr>
      <td colSpan={colSpan} className={styles.empty}>
        {text}
      </td>
    </tr>
  );
}

export function ConnectedPage({ page, data, loading, errorMessage }: ConnectedPageProps) {
  return (
    <section className={styles.panel}>
      {errorMessage ? <p className={styles.warning}>{errorMessage}</p> : null}
      {loading ? <p className={styles.loading}>Carregando dados reais...</p> : null}

      {page === "pedidos" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Total</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.slice(0, 200).map((order) => (
                <tr key={order.id}>
                  <td>{pickOrderId(order)}</td>
                  <td>{order.userName || order.userEmail || "-"}</td>
                  <td>{order.status || "-"}</td>
                  <td>{formatMoneyCents(order.amount, order.currency)}</td>
                  <td>{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
              {!data.orders.length ? renderEmpty(5, "Nenhum pedido encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "produtos" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produto</th>
                <th>Preço</th>
                <th>Estoque</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.products.slice(0, 200).map((product) => (
                <tr key={product.dbId || product.id || product.sku}>
                  <td>{product.sku || "-"}</td>
                  <td>{product.name || "-"}</td>
                  <td>{formatMoneyCents(product.unitAmount, product.currency)}</td>
                  <td>{Number(product.stock || 0)}</td>
                  <td>{product.active ? "active" : "inactive"}</td>
                </tr>
              ))}
              {!data.products.length ? renderEmpty(5, "Nenhum produto encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "usuarios" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Email</th>
                <th>Status</th>
                <th>Último login</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {data.users.slice(0, 200).map((user) => (
                <tr key={user.id}>
                  <td>{user.name || "-"}</td>
                  <td>{user.email || "-"}</td>
                  <td>{user.status || "-"}</td>
                  <td>{formatDateTime(user.lastLoginAt)}</td>
                  <td>{formatDateTime(user.createdAt)}</td>
                </tr>
              ))}
              {!data.users.length ? renderEmpty(5, "Nenhum usuário encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "atendimentos" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Assunto</th>
                <th>Status</th>
                <th>Canal</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {data.privateCare.slice(0, 200).map((care) => (
                <tr key={care.id}>
                  <td>{care.userName || care.userEmail || "-"}</td>
                  <td>{care.subject || "-"}</td>
                  <td>{care.status || "-"}</td>
                  <td>{care.channel || "-"}</td>
                  <td>{formatDateTime(care.createdAt)}</td>
                </tr>
              ))}
              {!data.privateCare.length ? renderEmpty(5, "Nenhum atendimento encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "lista_vip" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Telefone</th>
                <th>Origem</th>
                <th>Inscrito em</th>
              </tr>
            </thead>
            <tbody>
              {data.vip.slice(0, 200).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.name || "-"}</td>
                  <td>{entry.email || "-"}</td>
                  <td>{entry.phone || "-"}</td>
                  <td>{entry.source || "-"}</td>
                  <td>{formatDateTime(entry.subscribedAt)}</td>
                </tr>
              ))}
              {!data.vip.length ? renderEmpty(5, "Nenhum inscrito VIP encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "newsletter" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Origem</th>
                <th>Inscrito em</th>
              </tr>
            </thead>
            <tbody>
              {data.newsletter.slice(0, 200).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.email || "-"}</td>
                  <td>{entry.phone || "-"}</td>
                  <td>{entry.status || "-"}</td>
                  <td>{entry.source || "-"}</td>
                  <td>{formatDateTime(entry.subscribedAt)}</td>
                </tr>
              ))}
              {!data.newsletter.length ? renderEmpty(5, "Nenhum inscrito de newsletter encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "cupons" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Regra</th>
                <th>Ativo</th>
                <th>Expira em</th>
              </tr>
            </thead>
            <tbody>
              {data.coupons.slice(0, 200).map((coupon) => (
                <tr key={coupon.code}>
                  <td>{coupon.code || "-"}</td>
                  <td>{coupon.type || "-"}</td>
                  <td>{formatCouponRule(coupon)}</td>
                  <td>{coupon.active ? "sim" : "não"}</td>
                  <td>{formatDateTime(coupon.expiresAt || null)}</td>
                </tr>
              ))}
              {!data.coupons.length ? renderEmpty(5, "Nenhum cupom encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "auditoria" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Resumo</th>
                <th>Ator</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.slice(0, 200).map((log) => (
                <tr key={log.id}>
                  <td>{log.action || "-"}</td>
                  <td>{log.entityType || "-"}</td>
                  <td>{log.summary || "-"}</td>
                  <td>{log.actorEmail || "-"}</td>
                  <td>{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
              {!data.audit.length ? renderEmpty(5, "Nenhum log de auditoria encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
