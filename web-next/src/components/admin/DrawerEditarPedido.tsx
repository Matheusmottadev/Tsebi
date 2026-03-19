"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HttpError } from "@/lib/http";
import { getOrderAdmin, getProductAdmin, updateOrderAdmin, type AdminOrderSummary } from "@/services/admin";
import type { Order } from "@/types";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";
import styles from "./DrawerEditarPedido.module.css";

type UiStatus = "Pendente" | "Pago" | "Enviado" | "Entregue" | "Cancelado" | "Reembolsado";
type UiPayment = "Cartao de Credito" | "Debito" | "Boleto";

type DrawerEditarPedidoProps = {
  isOpen: boolean;
  order: AdminOrderSummary | null;
  onClose: () => void;
  onSaved: (order: Order) => void;
};

type ItemDraft = {
  id: string;
  name: string;
  qty: number;
  unitAmount: number;
  currency: string;
  variantColor: string;
  variantSize: string;
};

const STATUS_OPTIONS: UiStatus[] = ["Pendente", "Pago", "Enviado", "Entregue", "Cancelado", "Reembolsado"];
const PAYMENT_OPTIONS: UiPayment[] = ["Cartao de Credito", "Debito", "Boleto"];
const SHIPPING_OPTIONS = ["SEDEX", "PAC", "Express - Loggi", "Transportadora"];
const SIZE_OPTIONS = ["PP", "P", "M", "G", "GG", "XG", "Unico"];
const STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

function formatMoney(cents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: String(currency || "BRL").toUpperCase(),
    maximumFractionDigits: 0,
  }).format((Number(cents || 0) || 0) / 100);
}

type OrderStatusSource = {
  status?: unknown;
  trackingStatus?: unknown;
  currentStatus?: unknown;
  shipment?: { status?: unknown } | null;
};

function mapStatusFromOrder(order: OrderStatusSource): UiStatus {
  const status = String(order.status || "").trim().toLowerCase();
  const tracking = `${String(order.trackingStatus || "").trim().toLowerCase()} ${String(order.currentStatus || "").trim().toLowerCase()} ${String(order.shipment?.status || "").trim().toLowerCase()}`;
  if (status === "refunded") return "Reembolsado";
  if (status === "canceled" || status === "cancelled" || status === "failed") return "Cancelado";
  if (tracking.includes("delivered") || tracking.includes("entreg")) return "Entregue";
  if (tracking.includes("transit") || tracking.includes("shipped") || status === "processing") return "Enviado";
  if (status === "paid") return "Pago";
  return "Pendente";
}

function mapStatusToPayload(status: UiStatus): { status: string; trackingStatus?: string } {
  if (status === "Pendente") return { status: "pending_payment", trackingStatus: "ORDER_PLACED" };
  if (status === "Pago") return { status: "paid" };
  if (status === "Enviado") return { status: "processing", trackingStatus: "IN_TRANSIT" };
  if (status === "Entregue") return { status: "paid", trackingStatus: "DELIVERED" };
  if (status === "Cancelado") return { status: "canceled" };
  return { status: "refunded" };
}

function pickShippingMethod(order: {
  shippingSelectedService?: unknown;
  shippingSelectedCarrierName?: unknown;
  carrier?: unknown;
}): string {
  const source = [order.shippingSelectedService, order.shippingSelectedCarrierName, order.carrier]
    .map((value) => String(value || "").trim().toLowerCase())
    .join(" ");
  if (source.includes("sedex")) return "SEDEX";
  if (source.includes("pac")) return "PAC";
  if (source.includes("loggi") || source.includes("express")) return "Express - Loggi";
  if (source.includes("transport")) return "Transportadora";
  return "SEDEX";
}

function pickPaymentMethod(value: string | null): UiPayment {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("debit")) return "Debito";
  if (normalized.includes("boleto")) return "Boleto";
  return "Cartao de Credito";
}

function buildOrderCode(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function normalizeDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function getSaveErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.message === "ORDER_REFUNDED_LOCKED") return "Pedido reembolsado não pode mudar de status.";
    if (error.message === "INVALID_INPUT") return "Dados inválidos ao salvar. Revise os campos do pedido.";
    if (error.message === "NOT_FOUND") return "Pedido não encontrado.";
    return error.message || "Falha ao atualizar pedido.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Falha ao atualizar pedido.";
}

export function DrawerEditarPedido({ isOpen, order, onClose, onSaved }: DrawerEditarPedidoProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState<UiStatus>("Pendente");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemId, setAddItemId] = useState("");
  const [addItemColor, setAddItemColor] = useState("");
  const [addItemSize, setAddItemSize] = useState("M");
  const [addItemQty, setAddItemQty] = useState("1");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");

  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("SP");

  const [paymentMethod, setPaymentMethod] = useState<UiPayment>("Cartao de Credito");
  const [installments, setInstallments] = useState("1");
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState("0");
  const [shippingMethod, setShippingMethod] = useState("SEDEX");
  const [shippingCost, setShippingCost] = useState("0");
  const [trackingCode, setTrackingCode] = useState("");
  const [adminNote, setAdminNote] = useState("");

  useEffect(() => {
    if (!isOpen || !order) return;
    const selectedOrder = order;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const full = await getOrderAdmin(String(selectedOrder.id || ""));
        if (cancelled) return;

        setStatus(mapStatusFromOrder(full));
        setItems(
          (Array.isArray(full.items) ? full.items : []).map((item) => ({
            id: String(item.id || "").trim(),
            name: String(item.name || item.id || "").trim(),
            qty: Math.max(1, Number(item.qty || 1)),
            unitAmount: Math.max(0, Number(item.unitAmount || 0)),
            currency: String(item.currency || full.currency || "brl").toUpperCase(),
            variantColor: String(item.variantColor || "").trim(),
            variantSize: String(item.variantSize || "").trim(),
          }))
        );

        setFullName(String(full.userName || selectedOrder.userName || ""));
        setEmail(String(full.userEmail || selectedOrder.userEmail || ""));

        const shipping = full.shipping && typeof full.shipping === "object" ? full.shipping : {};
        setPhone(String((shipping as Record<string, unknown>).phone || ""));
        setCpf(String((shipping as Record<string, unknown>).cpf || ""));
        setZip(String(full.shippingDestinationZip || (shipping as Record<string, unknown>).cep || ""));
        setStreet(String((shipping as Record<string, unknown>).street || ""));
        setNumber(String((shipping as Record<string, unknown>).number || ""));
        setComplement(String((shipping as Record<string, unknown>).complement || ""));
        setDistrict(String((shipping as Record<string, unknown>).district || ""));
        setCity(String((shipping as Record<string, unknown>).city || ""));
        setStateUf(String((shipping as Record<string, unknown>).state || "SP").toUpperCase() || "SP");

        setPaymentMethod(pickPaymentMethod(full.paymentMethod));
        setInstallments(String(Math.max(1, Number(full.installments || 1))));
        setCouponCode(String((shipping as Record<string, unknown>).discountCode || ""));
        setDiscount(String(Math.max(0, Number((shipping as Record<string, unknown>).discountCents || 0))));
        setShippingMethod(pickShippingMethod(full));
        setShippingCost(String(Math.max(0, Number(full.shippingPriceCents || full.shippingAmount || 0))));
        setTrackingCode(String(full.trackingCode || full.trackingId || ""));
        setAdminNote(String(full.adminNotes || ""));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Falha ao carregar pedido.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, order]);

  useEffect(() => {
    const digits = normalizeDigits(zip);
    if (digits.length !== 8) return;
    let cancelled = false;

    async function fetchZip() {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const payload = await response.json();
        if (cancelled || payload?.erro) return;
        setStreet(String(payload.logradouro || ""));
        setDistrict(String(payload.bairro || ""));
        setCity(String(payload.localidade || ""));
        setStateUf(String(payload.uf || "").toUpperCase() || "SP");
      } catch {
        // Ignore CEP lookup errors.
      }
    }

    fetchZip();
    return () => {
      cancelled = true;
    };
  }, [zip]);

  const itemsSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1)) * Math.max(0, Number(item.unitAmount || 0)), 0),
    [items]
  );

  const shippingCents = useMemo(() => Math.max(0, Number(shippingCost || 0)), [shippingCost]);
  const discountCents = useMemo(() => Math.max(0, Number(discount || 0)), [discount]);
  const totalCents = useMemo(() => Math.max(0, itemsSubtotal + shippingCents - discountCents), [itemsSubtotal, shippingCents, discountCents]);

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!String(fullName || "").trim()) errors.fullName = "Nome obrigatório.";
    if (!String(email || "").trim()) errors.email = "E-mail obrigatório.";
    if (!String(status || "").trim()) errors.status = "Status obrigatório.";
    if (items.length === 0) errors.items = "Pedido precisa ter pelo menos um item.";
    return errors;
  }, [email, fullName, items.length, status]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  async function handleAddItem() {
    const productId = String(addItemId || "").trim();
    if (!productId) return;

    try {
      const product = await getProductAdmin(productId);
      const unitAmount = Math.max(0, Number(product?.unitAmount || 0));
      const productName = String(product?.name || productId);
      setItems((current) => [
        ...current,
        {
          id: productId,
          name: productName,
          qty: Math.max(1, Number(addItemQty || 1)),
          unitAmount,
          currency: String(product?.currency || "BRL").toUpperCase(),
          variantColor: String(addItemColor || "").trim(),
          variantSize: String(addItemSize || "M").trim(),
        },
      ]);
      setAddItemId("");
      setAddItemColor("");
      setAddItemSize("M");
      setAddItemQty("1");
      setShowAddItem(false);
    } catch {
      setError("Não foi possível adicionar o item informado.");
    }
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_item, itemIndex) => itemIndex !== index));
  }

  async function handleSave() {
    if (!order) return;
    if (hasErrors) {
      setError("Revise os campos obrigatórios.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const statusPatch = mapStatusToPayload(status);
      const payload = {
        ...statusPatch,
        paymentMethod,
        installments: paymentMethod === "Cartao de Credito" ? Math.max(1, Number(installments || 1)) : 1,
        userName: String(fullName || "").trim(),
        userEmail: String(email || "").trim(),
        userPhone: String(phone || "").trim(),
        userCpf: String(cpf || "").trim(),
        shippingDestinationZip: normalizeDigits(zip).slice(0, 8),
        shippingStreet: String(street || "").trim(),
        shippingNumber: String(number || "").trim(),
        shippingComplement: String(complement || "").trim(),
        shippingDistrict: String(district || "").trim(),
        shippingCity: String(city || "").trim(),
        shippingState: String(stateUf || "").trim().toUpperCase(),
        shippingSelectedService: String(shippingMethod || "").trim(),
        shippingPriceCents: shippingCents,
        shippingAmount: shippingCents,
        couponCode: String(couponCode || "").trim(),
        discountCents,
        trackingCode: String(trackingCode || "").trim(),
        adminNotes: String(adminNote || "").trim(),
        itemsAmount: itemsSubtotal,
        amount: totalCents,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          qty: Math.max(1, Number(item.qty || 1)),
          unitAmount: Math.max(0, Number(item.unitAmount || 0)),
          currency: String(item.currency || "BRL").toLowerCase(),
          variantColor: item.variantColor || undefined,
          variantSize: item.variantSize || undefined,
          variantKey: item.variantColor && item.variantSize ? `${item.variantColor}__${item.variantSize}` : undefined,
        })),
      };

      const response = await updateOrderAdmin(String(order.id || ""), payload);
      onSaved(response.order);
      onClose();
    } catch (saveError) {
      setError(getSaveErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Editar Pedido"
      subtitle="Edicao completa de itens, cliente e entrega"
      onSave={handleSave}
      saveLabel={saving ? "Salvando..." : "Salvar alteracoes"}
      cancelLabel="Cancelar"
      disableSave={saving || hasErrors}
      wide={true}
      stickyFooter={true}
    >
      <div className={form.stack}>
        {loading ? <p className={styles.loading}>Carregando dados do pedido...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Resumo do pedido</h4>
          <div className={styles.headerMeta}>
            <div>
              <p className={styles.orderCode}>{buildOrderCode(String(order?.orderNumber || order?.id || ""))}</p>
              <p className={styles.orderDate}>{order?.createdAt ? new Date(order.createdAt).toLocaleString("pt-BR") : "-"}</p>
            </div>
            <span className={styles.badge}>{status}</span>
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Itens do pedido</h4>
          {validationErrors.items ? <p className={styles.fieldError}>{validationErrors.items}</p> : null}
          <div className={styles.itemsList}>
            {items.map((item, index) => (
              <div key={`${item.id}-${index}`} className={styles.itemRow}>
                <div className={styles.itemTop}>
                  <p className={styles.itemName}>{item.name}</p>
                  <button className={styles.removeItemBtn} type="button" onClick={() => removeItem(index)}>
                    <X size={14} />
                  </button>
                </div>
                <p className={styles.itemMeta}>
                  Cor: {item.variantColor || "-"} | Tamanho: {item.variantSize || "-"} | Qtde: {item.qty} | Unit.: {formatMoney(item.unitAmount, item.currency)}
                </p>
                <p className={styles.itemSubtotal}>Subtotal: {formatMoney(item.unitAmount * item.qty, item.currency)}</p>
              </div>
            ))}
          </div>

          <button type="button" className={styles.addItemBtn} onClick={() => setShowAddItem((value) => !value)}>
            <Plus size={12} /> Adicionar item
          </button>

          {showAddItem ? (
            <div className={styles.addItemPanel}>
              <div className={form.field}>
                <label className={form.label}>Produto por ID</label>
                <input className={form.input} value={addItemId} onChange={(event) => setAddItemId(event.target.value)} />
              </div>
              <div className={form.row2}>
                <div className={form.field}>
                  <label className={form.label}>Cor</label>
                  <input className={form.input} value={addItemColor} onChange={(event) => setAddItemColor(event.target.value)} />
                </div>
                <div className={form.field}>
                  <label className={form.label}>Tamanho</label>
                  <select className={form.select} value={addItemSize} onChange={(event) => setAddItemSize(event.target.value)}>
                    {SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={form.field}>
                <label className={form.label}>Quantidade</label>
                <input className={form.input} type="number" min={1} value={addItemQty} onChange={(event) => setAddItemQty(event.target.value)} />
              </div>
              <div className={styles.addItemFooter}>
                <button type="button" className={styles.addItemSubmit} onClick={handleAddItem}>
                  Adicionar ao pedido
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Dados do cliente</h4>
          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Nome completo</label>
              <input
                className={`${form.input} ${validationErrors.fullName ? styles.inputError : ""}`}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
              {validationErrors.fullName ? <p className={styles.fieldError}>{validationErrors.fullName}</p> : null}
            </div>
            <div className={form.field}>
              <label className={form.label}>E-mail</label>
              <input
                className={`${form.input} ${validationErrors.email ? styles.inputError : ""}`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              {validationErrors.email ? <p className={styles.fieldError}>{validationErrors.email}</p> : null}
            </div>
          </div>
          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Telefone</label>
              <input className={form.input} value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <div className={form.field}>
              <label className={form.label}>CPF</label>
              <input className={form.input} value={cpf} onChange={(event) => setCpf(event.target.value)} />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Endereco de entrega</h4>
          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>CEP</label>
              <input className={form.input} value={zip} onChange={(event) => setZip(event.target.value)} />
            </div>
            <div className={form.field}>
              <label className={form.label}>Rua</label>
              <input className={form.input} value={street} onChange={(event) => setStreet(event.target.value)} />
            </div>
          </div>

          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Numero</label>
              <input className={form.input} value={number} onChange={(event) => setNumber(event.target.value)} />
            </div>
            <div className={form.field}>
              <label className={form.label}>Complemento</label>
              <input className={form.input} value={complement} onChange={(event) => setComplement(event.target.value)} />
            </div>
          </div>

          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Bairro</label>
              <input className={form.input} value={district} onChange={(event) => setDistrict(event.target.value)} />
            </div>
            <div className={form.field}>
              <label className={form.label}>Cidade</label>
              <input className={form.input} value={city} onChange={(event) => setCity(event.target.value)} />
            </div>
          </div>

          <div className={form.field}>
            <label className={form.label}>Estado</label>
            <select className={form.select} value={stateUf} onChange={(event) => setStateUf(event.target.value)}>
              {STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Pagamento e frete</h4>
          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Status do pedido</label>
              <select className={`${form.select} ${validationErrors.status ? styles.inputError : ""}`} value={status} onChange={(event) => setStatus(event.target.value as UiStatus)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {validationErrors.status ? <p className={styles.fieldError}>{validationErrors.status}</p> : null}
            </div>
            <div className={form.field}>
              <label className={form.label}>Forma de pagamento</label>
              <select className={form.select} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as UiPayment)}>
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {paymentMethod === "Cartao de Credito" ? (
            <div className={form.field}>
              <label className={form.label}>Parcelas</label>
              <select className={form.select} value={installments} onChange={(event) => setInstallments(event.target.value)}>
                {Array.from({ length: 10 }, (_, index) => `${index + 1}`).map((option) => (
                  <option key={option} value={option}>
                    {option}x
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Cupom aplicado</label>
              <input className={form.input} value={couponCode} onChange={(event) => setCouponCode(event.target.value)} />
            </div>
            <div className={form.field}>
              <label className={form.label}>Desconto (R$)</label>
              <input className={form.input} value={discount} onChange={(event) => setDiscount(event.target.value)} />
            </div>
          </div>

          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Metodo de frete</label>
              <select className={form.select} value={shippingMethod} onChange={(event) => setShippingMethod(event.target.value)}>
                {SHIPPING_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className={form.field}>
              <label className={form.label}>Frete (R$)</label>
              <input className={form.input} value={shippingCost} onChange={(event) => setShippingCost(event.target.value)} />
            </div>
          </div>

          <div className={form.field}>
            <label className={form.label}>Codigo de rastreio</label>
            <input className={form.input} value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} />
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Observacao interna</h4>
          <textarea className={form.textarea} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} />
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Totais</h4>
          <div className={styles.totalsBox}>
            <div className={styles.totalRow}>
              <span>Subtotal:</span>
              <span>{formatMoney(itemsSubtotal)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Frete:</span>
              <span>{formatMoney(shippingCents)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Desconto:</span>
              <span>-{formatMoney(discountCents)}</span>
            </div>
            <div className={`${styles.totalRow} ${styles.totalFinal}`}>
              <span>Total:</span>
              <span>{formatMoney(totalCents)}</span>
            </div>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
