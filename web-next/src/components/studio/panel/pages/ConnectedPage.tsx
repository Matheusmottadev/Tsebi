import { PencilLine, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { DrawerDetalhesUsuario } from "@/components/admin/DrawerDetalhesUsuario";
import { DrawerEditarCupom } from "@/components/admin/DrawerEditarCupom";
import { DrawerEditarPedido } from "@/components/admin/DrawerEditarPedido";
import { DrawerEditarProduto } from "@/components/admin/DrawerEditarProduto";
import { Toast } from "@/components/admin/Toast";
import {
  deleteCouponAdmin,
  deleteNewsletterAdmin,
  deletePrivateCareAdmin,
  deleteVipAdmin,
  type AdminAuditLog,
  type AdminNewsletterRow,
  type AdminOrderSummary,
  type AdminPrivateCareRequest,
  type AdminUserRow,
  type AdminVipRow,
} from "@/services/admin";
import type { Coupon, Order, Product } from "@/types";
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
  onRequestRefresh?: () => void;
};

type ConfirmDeleteTarget =
  | { kind: "coupon"; id: string; label: string }
  | { kind: "attendance"; id: string; label: string }
  | { kind: "vip"; id: string; label: string }
  | { kind: "newsletter"; id: string; label: string };

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

function normalizeUserStatus(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "-";
  if (normalized === "disabled") return "suspended";
  return normalized;
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Falha na operacao.";
}

function getProductKey(product: Product): string {
  return String(product.dbId || product.id || product.sku || "").trim();
}

function toSummaryFromOrder(base: AdminOrderSummary, next: Order): AdminOrderSummary {
  return {
    ...base,
    status: String(next.status || base.status || ""),
    currency: String(next.currency || base.currency || "BRL"),
    amount: Number(next.amount || base.amount || 0),
    itemsAmount: Number(next.itemsAmount || base.itemsAmount || 0),
    shippingAmount: Number(next.shippingAmount || base.shippingAmount || 0),
    shippingPriceCents: Number(next.shippingPriceCents || base.shippingPriceCents || 0),
    shippingSelectedProvider: String(next.shippingSelectedProvider || base.shippingSelectedProvider || ""),
    shippingSelectedService: String(next.shippingSelectedService || base.shippingSelectedService || ""),
    shippingSelectedServiceCode: String(next.shippingSelectedServiceCode || base.shippingSelectedServiceCode || ""),
    shippingSelectedCarrierName: String(next.shippingSelectedCarrierName || base.shippingSelectedCarrierName || ""),
    shippingDeadlineDays:
      next.shippingDeadlineDays == null ? base.shippingDeadlineDays : Number(next.shippingDeadlineDays),
    shippingDestinationZip: String(next.shippingDestinationZip || base.shippingDestinationZip || ""),
    trackingId: String(next.trackingId || base.trackingId || ""),
    trackingStatus: String(next.trackingStatus || base.trackingStatus || ""),
    carrier: String(next.carrier || base.carrier || ""),
    shippingDeadline: next.shippingDeadline ?? base.shippingDeadline ?? null,
    updatedAt: next.updatedAt || base.updatedAt || null,
    createdAt: next.createdAt || base.createdAt || null,
  };
}

function getDeleteContent(target: ConfirmDeleteTarget): {
  title: string;
  text: string;
  confirmLabel: string;
} {
  if (target.kind === "coupon") {
    return {
      title: "Confirmar exclusao",
      text: `Tem certeza que deseja excluir o cupom ${target.label}? Esta acao e irreversivel.`,
      confirmLabel: "Excluir permanentemente",
    };
  }

  if (target.kind === "attendance") {
    return {
      title: "Confirmar exclusao",
      text: `Tem certeza que deseja excluir o atendimento de ${target.label}?`,
      confirmLabel: "Excluir permanentemente",
    };
  }

  if (target.kind === "vip") {
    return {
      title: "Confirmar exclusao",
      text: `Tem certeza que deseja remover ${target.label} da Lista VIP?`,
      confirmLabel: "Excluir permanentemente",
    };
  }

  return {
    title: "Confirmar exclusao",
    text: `Tem certeza que deseja remover ${target.label} da Newsletter?`,
    confirmLabel: "Excluir permanentemente",
  };
}

export function ConnectedPage({ page, data, loading, errorMessage, onRequestRefresh }: ConnectedPageProps) {
  const [ordersRows, setOrdersRows] = useState<AdminOrderSummary[]>(data.orders || []);
  const [productsRows, setProductsRows] = useState<Product[]>(data.products || []);
  const [usersRows, setUsersRows] = useState<AdminUserRow[]>(data.users || []);
  const [privateCareRows, setPrivateCareRows] = useState<AdminPrivateCareRequest[]>(data.privateCare || []);
  const [vipRows, setVipRows] = useState<AdminVipRow[]>(data.vip || []);
  const [newsletterRows, setNewsletterRows] = useState<AdminNewsletterRow[]>(data.newsletter || []);
  const [couponsRows, setCouponsRows] = useState<Coupon[]>(data.coupons || []);

  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<AdminOrderSummary | null>(null);
  const [isOrderDrawerOpen, setIsOrderDrawerOpen] = useState(false);

  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [isCouponDrawerOpen, setIsCouponDrawerOpen] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<ConfirmDeleteTarget | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrdersRows(data.orders || []);
  }, [data.orders]);

  useEffect(() => {
    setProductsRows(data.products || []);
  }, [data.products]);

  useEffect(() => {
    setUsersRows(data.users || []);
  }, [data.users]);

  useEffect(() => {
    setPrivateCareRows(data.privateCare || []);
  }, [data.privateCare]);

  useEffect(() => {
    setVipRows(data.vip || []);
  }, [data.vip]);

  useEffect(() => {
    setNewsletterRows(data.newsletter || []);
  }, [data.newsletter]);

  useEffect(() => {
    setCouponsRows(data.coupons || []);
  }, [data.coupons]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const openUserDrawer = (user: AdminUserRow) => {
    setSelectedUser(user);
    setIsUserDrawerOpen(true);
    setIsEditingUser(false);
  };

  const closeUserDrawer = () => {
    setIsUserDrawerOpen(false);
    setIsEditingUser(false);
    setSelectedUser(null);
  };

  const openProductDrawer = (product: Product) => {
    setSelectedProduct(product);
    setIsProductDrawerOpen(true);
  };

  const closeProductDrawer = () => {
    setIsProductDrawerOpen(false);
    setSelectedProduct(null);
  };

  const openOrderDrawer = (order: AdminOrderSummary) => {
    setSelectedOrder(order);
    setIsOrderDrawerOpen(true);
  };

  const closeOrderDrawer = () => {
    setIsOrderDrawerOpen(false);
    setSelectedOrder(null);
  };

  const openCouponDrawer = (coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setIsCouponDrawerOpen(true);
  };

  const closeCouponDrawer = () => {
    setIsCouponDrawerOpen(false);
    setSelectedCoupon(null);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      toastTimerRef.current = null;
    }, 3000);
  };

  const handleUserRowUpdated = (nextUser: AdminUserRow) => {
    setUsersRows((current) => current.map((row) => (row.id === nextUser.id ? { ...row, ...nextUser } : row)));
    setSelectedUser((current) => (current && current.id === nextUser.id ? { ...current, ...nextUser } : current));
  };

  const handleUserDeleted = (userId: string) => {
    setUsersRows((current) => current.filter((row) => row.id !== userId));
    setSelectedUser((current) => (current?.id === userId ? null : current));
    onRequestRefresh?.();
  };

  const handleProductSaved = (nextProduct: Product) => {
    const nextKey = getProductKey(nextProduct);
    setProductsRows((current) =>
      current.map((row) => {
        const rowKey = getProductKey(row);
        return rowKey && rowKey === nextKey ? { ...row, ...nextProduct } : row;
      })
    );
    setSelectedProduct((current) => {
      if (!current) return current;
      const currentKey = getProductKey(current);
      return currentKey && currentKey === nextKey ? { ...current, ...nextProduct } : current;
    });
    showToast("Produto atualizado.");
    onRequestRefresh?.();
  };

  const handleOrderSaved = (nextOrder: Order) => {
    const targetId = String(nextOrder.id || "").trim();
    setOrdersRows((current) =>
      current.map((row) => {
        if (String(row.id || "").trim() !== targetId) return row;
        return toSummaryFromOrder(row, nextOrder);
      })
    );
    setSelectedOrder((current) => {
      if (!current) return current;
      if (String(current.id || "").trim() !== targetId) return current;
      return toSummaryFromOrder(current, nextOrder);
    });
    showToast("Pedido atualizado.");
    onRequestRefresh?.();
  };

  const handleCouponSaved = (nextCoupon: Coupon) => {
    setCouponsRows((current) => {
      const selectedCode = String(selectedCoupon?.code || "").trim().toLowerCase();
      let replaced = false;
      const nextRows = current.map((row) => {
        const rowCode = String(row.code || "").trim().toLowerCase();
        if (rowCode === selectedCode) {
          replaced = true;
          return nextCoupon;
        }
        return row;
      });
      return replaced ? nextRows : [nextCoupon, ...nextRows];
    });
    setSelectedCoupon(nextCoupon);
    showToast("Cupom atualizado.");
    onRequestRefresh?.();
  };

  const openDeleteConfirm = (target: ConfirmDeleteTarget) => {
    setConfirmTarget(target);
  };

  const closeDeleteConfirm = () => {
    if (confirmLoading) return;
    setConfirmTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;

    setConfirmLoading(true);
    try {
      if (confirmTarget.kind === "coupon") {
        await deleteCouponAdmin(confirmTarget.id);
        setCouponsRows((current) => current.filter((row) => String(row.code || "") !== confirmTarget.id));
        showToast("Cupom excluido.");
      }

      if (confirmTarget.kind === "attendance") {
        await deletePrivateCareAdmin(confirmTarget.id);
        setPrivateCareRows((current) => current.filter((row) => String(row.id || "") !== confirmTarget.id));
        showToast("Atendimento excluido.");
      }

      if (confirmTarget.kind === "vip") {
        await deleteVipAdmin(confirmTarget.id);
        setVipRows((current) => current.filter((row) => String(row.id) !== confirmTarget.id));
        showToast("Cadastro removido da Lista VIP.");
      }

      if (confirmTarget.kind === "newsletter") {
        await deleteNewsletterAdmin(confirmTarget.id);
        setNewsletterRows((current) => current.filter((row) => String(row.id || "") !== confirmTarget.id));
        showToast("Inscrito removido da Newsletter.");
      }

      setConfirmTarget(null);
      onRequestRefresh?.();
    } catch (error) {
      showToast(pickErrorMessage(error));
    } finally {
      setConfirmLoading(false);
    }
  };

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordersRows.slice(0, 200).map((order) => (
                <tr key={order.id}>
                  <td>{pickOrderId(order)}</td>
                  <td>{order.userName || order.userEmail || "-"}</td>
                  <td>{order.status || "-"}</td>
                  <td>{formatMoneyCents(order.amount, order.currency)}</td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td className={styles.actionCell}>
                    <button className={styles.btnEdit} onClick={() => openOrderDrawer(order)}>
                      <PencilLine size={12} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
              {!ordersRows.length ? renderEmpty(6, "Nenhum pedido encontrado.") : null}
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
                <th>Preco</th>
                <th>Estoque</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productsRows.slice(0, 200).map((product) => (
                <tr key={product.dbId || product.id || product.sku}>
                  <td>{product.sku || "-"}</td>
                  <td>{product.name || "-"}</td>
                  <td>{formatMoneyCents(product.unitAmount, product.currency)}</td>
                  <td>{Number(product.stock || 0)}</td>
                  <td>{product.active ? "active" : "inactive"}</td>
                  <td className={styles.actionCell}>
                    <button className={styles.btnEdit} onClick={() => openProductDrawer(product)}>
                      <PencilLine size={12} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
              {!productsRows.length ? renderEmpty(6, "Nenhum produto encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "usuarios" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Status</th>
                <th>Ultimo login</th>
                <th>Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usersRows.slice(0, 200).map((user) => (
                <tr key={user.id}>
                  <td>{user.name || "-"}</td>
                  <td>{user.email || "-"}</td>
                  <td>{normalizeUserStatus(user.status)}</td>
                  <td>{formatDateTime(user.lastLoginAt)}</td>
                  <td>{formatDateTime(user.createdAt)}</td>
                  <td className={styles.actionCell}>
                    <button className={styles.btnDetalhes} onClick={() => openUserDrawer(user)}>
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
              {!usersRows.length ? renderEmpty(6, "Nenhum usuario encontrado.") : null}
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {privateCareRows.slice(0, 200).map((care) => (
                <tr key={care.id}>
                  <td>{care.userName || care.userEmail || "-"}</td>
                  <td>{care.subject || "-"}</td>
                  <td>{care.status || "-"}</td>
                  <td>{care.channel || "-"}</td>
                  <td>{formatDateTime(care.createdAt)}</td>
                  <td className={styles.actionCell}>
                    <button
                      className={styles.btnDelete}
                      onClick={() =>
                        openDeleteConfirm({
                          kind: "attendance",
                          id: String(care.id || ""),
                          label: String(care.userName || care.userEmail || "cliente"),
                        })
                      }
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {!privateCareRows.length ? renderEmpty(6, "Nenhum atendimento encontrado.") : null}
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vipRows.slice(0, 200).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.name || "-"}</td>
                  <td>{entry.email || "-"}</td>
                  <td>{entry.phone || "-"}</td>
                  <td>{entry.source || "-"}</td>
                  <td>{formatDateTime(entry.subscribedAt)}</td>
                  <td className={styles.actionCell}>
                    <button
                      className={styles.btnDelete}
                      onClick={() =>
                        openDeleteConfirm({
                          kind: "vip",
                          id: String(entry.id),
                          label: String(entry.name || entry.email || "inscrito"),
                        })
                      }
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {!vipRows.length ? renderEmpty(6, "Nenhum inscrito VIP encontrado.") : null}
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {newsletterRows.slice(0, 200).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.email || "-"}</td>
                  <td>{entry.phone || "-"}</td>
                  <td>{entry.status || "-"}</td>
                  <td>{entry.source || "-"}</td>
                  <td>{formatDateTime(entry.subscribedAt)}</td>
                  <td className={styles.actionCell}>
                    <button
                      className={styles.btnDelete}
                      onClick={() =>
                        openDeleteConfirm({
                          kind: "newsletter",
                          id: String(entry.id || ""),
                          label: String(entry.email || "inscrito"),
                        })
                      }
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {!newsletterRows.length ? renderEmpty(6, "Nenhum inscrito de newsletter encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "cupons" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Tipo</th>
                <th>Regra</th>
                <th>Ativo</th>
                <th>Expira em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {couponsRows.slice(0, 200).map((coupon) => (
                <tr key={coupon.code}>
                  <td>{coupon.code || "-"}</td>
                  <td>{coupon.type || "-"}</td>
                  <td>{formatCouponRule(coupon)}</td>
                  <td>{coupon.active ? "sim" : "nao"}</td>
                  <td>{formatDateTime(coupon.expiresAt || null)}</td>
                  <td className={styles.actionCell}>
                    <button className={styles.btnEdit} onClick={() => openCouponDrawer(coupon)}>
                      <PencilLine size={12} /> Editar
                    </button>
                    <button
                      className={styles.btnDelete}
                      onClick={() =>
                        openDeleteConfirm({
                          kind: "coupon",
                          id: String(coupon.code || ""),
                          label: String(coupon.code || "cupom"),
                        })
                      }
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {!couponsRows.length ? renderEmpty(6, "Nenhum cupom encontrado.") : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "auditoria" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Acao</th>
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

      {page === "usuarios" ? (
        <DrawerDetalhesUsuario
          isOpen={isUserDrawerOpen}
          user={selectedUser}
          isEditing={isEditingUser}
          onSetEditing={setIsEditingUser}
          onClose={closeUserDrawer}
          onToast={showToast}
          onUserRowUpdated={handleUserRowUpdated}
          onUserDeleted={handleUserDeleted}
          onRequestRefresh={onRequestRefresh}
        />
      ) : null}

      {page === "produtos" ? (
        <DrawerEditarProduto
          isOpen={isProductDrawerOpen}
          product={selectedProduct}
          onClose={closeProductDrawer}
          onSaved={handleProductSaved}
        />
      ) : null}

      {page === "pedidos" ? (
        <DrawerEditarPedido
          isOpen={isOrderDrawerOpen}
          order={selectedOrder}
          onClose={closeOrderDrawer}
          onSaved={handleOrderSaved}
        />
      ) : null}

      {page === "cupons" ? (
        <DrawerEditarCupom
          isOpen={isCouponDrawerOpen}
          coupon={selectedCoupon}
          onClose={closeCouponDrawer}
          onSaved={handleCouponSaved}
        />
      ) : null}

      <ConfirmModal
        isOpen={Boolean(confirmTarget)}
        title={confirmTarget ? getDeleteContent(confirmTarget).title : ""}
        text={confirmTarget ? getDeleteContent(confirmTarget).text : ""}
        confirmLabel={confirmTarget ? getDeleteContent(confirmTarget).confirmLabel : "Confirmar"}
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={closeDeleteConfirm}
        loading={confirmLoading}
        danger={true}
      />

      <Toast message={toastMessage} visible={toastVisible} />
    </section>
  );
}
