"use client";

import { useEffect, useState } from "react";
import { listMyOrders } from "@/services/orders";
import { post } from "@/lib/http";
import type { PublicUser } from "@/types";
import styles from "../account.module.css";

const REPAIR_TYPES = [
  "Ajuste de tamanho",
  "Reparo de costura",
  "Substituição de aviamento",
  "Limpeza especializada",
  "Outro",
];

const STEPS = [
  {
    num: "01",
    title: "Solicitação",
    desc: "Preencha o formulário com os detalhes da peça e do reparo necessário.",
  },
  {
    num: "02",
    title: "Análise",
    desc: "Nossa equipe avalia a solicitação e define o melhor procedimento para o reparo.",
  },
  {
    num: "03",
    title: "Envio",
    desc: "Envie a peça para o nosso ateliê. Instruções de envio serão enviadas por email.",
  },
  {
    num: "04",
    title: "Devolução",
    desc: "Após o reparo, a peça é devolvida ao endereço indicado com frete incluso.",
  },
];

type Props = { user: PublicUser };

interface DeliveredOrderOption {
  id: string;
  label: string;
}

export function RepairsTab({ user }: Props) {
  const [deliveredOrders, setDeliveredOrders] = useState<DeliveredOrderOption[]>([]);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [repairType, setRepairType] = useState(REPAIR_TYPES[0] ?? "");
  const [description, setDescription] = useState("");

  const defaultAddr =
    user.addresses.find((address) => address.id === user.defaultAddressId) ?? user.addresses[0] ?? null;
  const defaultAddrStr = defaultAddr
    ? `${defaultAddr.street}${defaultAddr.number ? `, ${defaultAddr.number}` : ""} - ${defaultAddr.city}, ${defaultAddr.state}`
    : "";
  const [returnAddress, setReturnAddress] = useState(defaultAddrStr);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    listMyOrders()
      .then((orders) => {
        const delivered = orders
          .filter((order) => order.currentStatus === "DELIVERED")
          .flatMap((order) =>
            order.items.map((item) => ({
              id: `${order.id}__${item.id}`,
              label: `${item.name} - Pedido #${order.orderNumber ?? order.id}`,
            }))
          );
        setDeliveredOrders(delivered);
        if (delivered.length) setSelectedOrder(delivered[0]?.id ?? "");
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOrder || !repairType || !description) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await post("/api/repairs", {
        orderId: selectedOrder.split("__")[0],
        repairType,
        description,
        returnAddress,
      });
      setSubmitted(true);
      setDescription("");
      setTimeout(() => setSubmitted(false), 5000);
    } catch {
      setSubmitError("Não foi possível enviar a solicitação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className={styles.repairBanner}>
        <h2 className={styles.repairBannerTitle}>Compromisso com a durabilidade</h2>
        <p className={styles.repairBannerDesc}>
          Todas as peças Tsebi têm garantia de reparos por 1 ano a partir da data de compra.
          Nossa equipe de ateliê cuida de cada detalhe com o mesmo rigor de quando a peça foi
          criada.
        </p>
      </div>

      <div className={styles.stepsRow}>
        {STEPS.map(({ num, title, desc }) => (
          <div key={num} className={styles.step}>
            <span className={styles.stepNum}>{num}</span>
            <p className={styles.stepTitle}>{title}</p>
            <p className={styles.stepDesc}>{desc}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <div className={styles.formGrid} style={{ maxWidth: 640 }}>
          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.fieldLabel}>Qual peça precisa de reparo?</label>
            {deliveredOrders.length > 0 ? (
              <select
                className={styles.fieldSelect}
                value={selectedOrder}
                onChange={(event) => setSelectedOrder(event.target.value)}
              >
                {deliveredOrders.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={styles.fieldInput}
                value={selectedOrder}
                onChange={(event) => setSelectedOrder(event.target.value)}
                placeholder="Descreva a peça (ex: Genesis Blazer, tamanho M)"
              />
            )}
          </div>

          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.fieldLabel}>Tipo de reparo</label>
            <select
              className={styles.fieldSelect}
              value={repairType}
              onChange={(event) => setRepairType(event.target.value)}
            >
              {REPAIR_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.fieldLabel}>Descrição do problema</label>
            <textarea
              className={styles.fieldTextarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descreva detalhadamente o que precisa ser reparado..."
              rows={4}
            />
          </div>

          <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.fieldLabel}>Endereço para devolução</label>
            <input
              className={styles.fieldInput}
              value={returnAddress}
              onChange={(event) => setReturnAddress(event.target.value)}
              placeholder="Rua, número, cidade, estado"
            />
          </div>
        </div>

        {submitError ? <p style={{ color: "var(--error)", fontSize: 13, marginTop: 12 }}>{submitError}</p> : null}

        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.btnPill} ${styles.btnPillFilled}`}
            disabled={submitting || !description || !selectedOrder}
          >
            {submitted ? "Solicitação enviada!" : submitting ? "Enviando..." : "Solicitar reparo"}
          </button>
        </div>
      </form>
    </div>
  );
}
