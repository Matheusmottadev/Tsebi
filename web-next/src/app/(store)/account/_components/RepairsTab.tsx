"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listMyOrders } from "@/services/orders";
import {
  createRepairRequest,
  listMyRepairs,
  prepareRepairPhotoForUpload,
  resolveRepairRequestErrorMessage,
  resolveUploadErrorMessage,
  uploadRepairPhoto,
} from "@/services/repairs";
import type { PublicUser, RepairPhoto, RepairRequest } from "@/types";
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
    desc: "As instruções para envio da peça ao nosso ateliê chegam por e-mail após a análise.",
  },
  {
    num: "04",
    title: "Devolução",
    desc: "Após o reparo, a peça é devolvida ao endereço indicado com frete incluso.",
  },
];

type Props = { user: PublicUser };

type DeliveredItemOption = {
  key: string;
  orderId: string;
  orderRef: string;
  itemId: string;
  itemName: string;
  imageUrl: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatRepairStatus(status: RepairRequest["status"]): string {
  if (status === "awaiting_shipment") return "Aguardando envio";
  if (status === "item_received") return "Peça recebida";
  if (status === "in_repair") return "Em reparo";
  if (status === "completed") return "Finalizado";
  if (status === "returned") return "Devolvido";
  if (status === "rejected") return "Recusado";
  return "Em análise";
}

function validateRepairForm(params: {
  selectedItem: DeliveredItemOption | null;
  repairType: string;
  description: string;
  returnAddress: string;
}): string | null {
  if (!params.selectedItem) return "Selecione uma peça entregue para solicitar o reparo.";
  if (String(params.repairType || "").trim().length < 2) return "Selecione o tipo de reparo.";
  if (String(params.description || "").trim().length < 4) {
    return "Descreva o problema com pelo menos 4 caracteres.";
  }
  if (String(params.returnAddress || "").trim().length < 8) {
    return "Informe um endereço de devolução mais completo.";
  }
  return null;
}

export function RepairsTab({ user }: Props) {
  const [deliveredItems, setDeliveredItems] = useState<DeliveredItemOption[]>([]);
  const [history, setHistory] = useState<RepairRequest[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [repairType, setRepairType] = useState(REPAIR_TYPES[0] ?? "");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<RepairPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const defaultAddress =
    user.addresses.find((address) => address.id === user.defaultAddressId) ?? user.addresses[0] ?? null;
  const [returnAddress, setReturnAddress] = useState(
    defaultAddress
      ? `${defaultAddress.street}${defaultAddress.number ? `, ${defaultAddress.number}` : ""} - ${defaultAddress.city}, ${defaultAddress.state}`
      : ""
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [orders, repairs] = await Promise.allSettled([listMyOrders(), listMyRepairs()]);
      if (cancelled) return;

      if (orders.status === "fulfilled") {
        const delivered = orders.value
          .filter((order) => order.currentStatus === "DELIVERED" || Boolean(order.deliveredAt))
          .flatMap((order) => {
            const orderRefRaw = String(order.orderNumber || order.id || "").trim();
            const orderRef = orderRefRaw.startsWith("#") ? orderRefRaw : `#${orderRefRaw}`;
            return order.items.map((item) => ({
              key: `${order.id}__${item.id}`,
              orderId: String(order.id || ""),
              orderRef,
              itemId: String(item.id || ""),
              itemName: item.name,
              imageUrl: item.imageUrl || null,
            }));
          });
        setDeliveredItems(delivered);
        if (delivered.length > 0) setSelectedItemKey((current) => current || delivered[0]?.key || "");
      }

      if (repairs.status === "fulfilled") {
        setHistory(repairs.value);
      }
    }

    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedItem = useMemo(
    () => deliveredItems.find((item) => item.key === selectedItemKey) || null,
    [deliveredItems, selectedItemKey]
  );
  const trimmedDescription = description.trim();
  const trimmedReturnAddress = returnAddress.trim();
  const descriptionTooShort = trimmedDescription.length > 0 && trimmedDescription.length < 4;
  const returnAddressTooShort = trimmedReturnAddress.length > 0 && trimmedReturnAddress.length < 8;
  const maxPhotosReached = photos.length >= 8;
  const submitDisabled =
    submitting ||
    !selectedItem ||
    String(repairType || "").trim().length < 2 ||
    trimmedDescription.length < 4 ||
    trimmedReturnAddress.length < 8;

  async function handlePhotoSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const remainingSlots = Math.max(0, 8 - photos.length);
    const files = Array.from(event.target.files || []).slice(0, Math.min(5, remainingSlots));
    if (!files.length) return;

    setUploading(true);
    setSubmitError(null);
    try {
      const optimizedFiles = await Promise.all(files.map((file) => prepareRepairPhotoForUpload(file)));
      const uploaded = await Promise.all(optimizedFiles.map((file) => uploadRepairPhoto(file)));
      setPhotos((current) => [...current, ...uploaded].slice(0, 8));
    } catch (error) {
      setSubmitError(resolveUploadErrorMessage(error));
    } finally {
      setUploading(false);
      if (event.target) event.target.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const validationError = validateRepairForm({
      selectedItem,
      repairType,
      description,
      returnAddress,
    });
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    if (!selectedItem) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await createRepairRequest({
        orderId: selectedItem.orderId,
        orderItemId: selectedItem.itemId,
        repairType: repairType.trim(),
        description: trimmedDescription,
        returnAddress: trimmedReturnAddress,
        photos,
      });
      setHistory(response.history);
      setDescription("");
      setPhotos([]);
      setSubmitted(true);
      window.setTimeout(() => setSubmitted(false), 5000);
    } catch (error) {
      setSubmitError(resolveRepairRequestErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className={styles.repairBanner}>
        <h2 className={styles.repairBannerTitle}>Compromisso com a durabilidade</h2>
        <p className={styles.repairBannerDesc}>
          Todas as peças Tsebi têm garantia de reparos por 1 ano a partir da data de compra. Nossa equipe de ateliê
          cuida de cada detalhe com o mesmo rigor de quando a peça foi criada.
        </p>
      </div>

      <div className={styles.stepsRowRepair}>
        {STEPS.map(({ num, title, desc }) => (
          <div key={num} className={styles.step}>
            <span className={styles.stepNum}>{num}</span>
            <p className={styles.stepTitle}>{title}</p>
            <p className={styles.stepDesc}>{desc}</p>
          </div>
        ))}
      </div>

      <div className={styles.repairsLayout}>
        <form onSubmit={handleSubmit} className={styles.repairsFormCard}>
          <div className={styles.formGrid}>
            <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <label className={styles.fieldLabel}>Qual peça precisa de reparo?</label>
              <select
                className={styles.fieldSelect}
                value={selectedItemKey}
                onChange={(event) => setSelectedItemKey(event.target.value)}
                disabled={!deliveredItems.length}
              >
                {deliveredItems.length === 0 ? <option value="">Nenhuma peça entregue disponível</option> : null}
                {deliveredItems.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.itemName} - Pedido {item.orderRef}
                  </option>
                ))}
              </select>
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
                rows={5}
                minLength={4}
                required
              />
              <p className={`${styles.fieldHint} ${descriptionTooShort ? styles.fieldHintError : ""}`}>
                Mínimo de 4 caracteres. {trimmedDescription.length}/2000
              </p>
            </div>

            <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <label className={styles.fieldLabel}>Endereço para devolução</label>
              <input
                className={styles.fieldInput}
                value={returnAddress}
                onChange={(event) => setReturnAddress(event.target.value)}
                placeholder="Rua, número, cidade, estado"
                minLength={8}
                required
              />
              <p className={`${styles.fieldHint} ${returnAddressTooShort ? styles.fieldHintError : ""}`}>
                Informe um endereço completo para devolução. Mínimo de 8 caracteres.
              </p>
            </div>

            <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <div className={styles.repairUploadHeader}>
                <label className={styles.fieldLabel}>Fotos da peça</label>
                <button
                  type="button"
                  className={styles.repairUploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || maxPhotosReached}
                >
                  {uploading ? "Enviando..." : maxPhotosReached ? "Limite atingido" : "Adicionar fotos"}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                onChange={handlePhotoSelection}
                className={styles.hiddenFileInput}
              />
              {photos.length > 0 ? (
                <div className={styles.repairPhotosGrid}>
                  {photos.map((photo) => (
                    <div key={`${photo.url}-${photo.fileName}`} className={styles.repairPhotoCard}>
                      <img
                        src={photo.url}
                        alt={photo.fileName || "Foto do reparo"}
                        className={styles.repairPhotoImage}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.repairUploadHint}>
                  Envie fotos para ajudar nossa equipe a analisar o reparo antes do retorno.
                </p>
              )}
              <p className={styles.fieldHint}>
                Aceitamos JPG, PNG, WEBP ou GIF, com até 8 MB por imagem e no máximo 8 fotos. As imagens são
                otimizadas automaticamente antes do envio.
              </p>
            </div>
          </div>

          {submitError ? <p className={styles.repairError}>{submitError}</p> : null}

          <div className={styles.formActions}>
            <button type="submit" className={`${styles.btnPill} ${styles.btnPillFilled}`} disabled={submitDisabled}>
              {submitted ? "Solicitação enviada!" : submitting ? "Enviando..." : "Solicitar reparo"}
            </button>
          </div>
        </form>

        <aside className={styles.repairsSummaryCard}>
          <p className={styles.repairSummaryEyebrow}>Resumo da solicitação</p>
          <div className={styles.repairsProductCard}>
            {selectedItem?.imageUrl ? (
              <img src={selectedItem.imageUrl} alt={selectedItem.itemName} className={styles.repairsProductImage} />
            ) : (
              <div className={styles.repairsProductPlaceholder} />
            )}
            <div>
              <p className={styles.repairsProductName}>{selectedItem?.itemName || "Selecione uma peça"}</p>
              <p className={styles.repairsProductMeta}>{selectedItem?.orderRef || "Pedido"}</p>
            </div>
          </div>

          <div className={styles.repairsSummaryList}>
            <div className={styles.repairsSummaryRow}>
              <span className={styles.repairsSummaryLabel}>Tipo de reparo</span>
              <span className={styles.repairsSummaryValue}>{repairType || "-"}</span>
            </div>
            <div className={styles.repairsSummaryRow}>
              <span className={styles.repairsSummaryLabel}>Fotos enviadas</span>
              <span className={styles.repairsSummaryValue}>{photos.length}</span>
            </div>
            <div className={styles.repairsSummaryRow}>
              <span className={styles.repairsSummaryLabel}>Endereço de devolução</span>
              <span className={styles.repairsSummaryText}>{returnAddress || "-"}</span>
            </div>
          </div>

          <div className={styles.repairsInfoBox}>
            <p className={styles.repairsInfoTitle}>Prazo de análise</p>
            <p className={styles.repairsInfoText}>
              Nossa equipe retorna em até 7 dias úteis com a avaliação do reparo e os próximos passos.
            </p>
          </div>
        </aside>
      </div>

      <section className={styles.repairsHistorySection}>
        <p className={styles.sectionEyebrow}>Suas solicitações</p>
        {history.length > 0 ? (
          <div className={styles.repairsHistoryList}>
            {history.map((repair) => (
              <article key={repair.id} className={styles.repairHistoryCard}>
                <div className={styles.repairHistoryHeader}>
                  <div>
                    <p className={styles.repairHistoryPiece}>{repair.pieceName}</p>
                    <p className={styles.repairHistoryMeta}>
                      {repair.orderRef} · {formatDateTime(repair.createdAt)}
                    </p>
                  </div>
                  <span className={`${styles.repairStatusBadge} ${styles[`repairStatus_${repair.status}`]}`}>
                    {formatRepairStatus(repair.status)}
                  </span>
                </div>
                <p className={styles.repairHistoryType}>{repair.repairType}</p>
                <p className={styles.repairHistoryText}>{repair.description}</p>
                {repair.photos.length > 0 ? (
                  <div className={styles.repairHistoryPhotos}>
                    {repair.photos.map((photo) => (
                      <img
                        key={`${photo.url}-${photo.fileName}`}
                        src={photo.url}
                        alt={repair.pieceName}
                        className={styles.repairHistoryPhoto}
                      />
                    ))}
                  </div>
                ) : null}
                {repair.rejectionReason ? (
                  <div className={styles.repairReasonBox}>
                    <p className={styles.repairReasonTitle}>Motivo da recusa</p>
                    <p className={styles.repairReasonText}>{repair.rejectionReason}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Nenhuma solicitação enviada</h3>
            <p className={styles.emptyDesc}>Assim que você solicitar um reparo, o acompanhamento aparece aqui.</p>
          </div>
        )}
      </section>
    </div>
  );
}
