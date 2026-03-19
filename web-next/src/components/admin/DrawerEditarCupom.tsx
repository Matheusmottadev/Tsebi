"use client";

import { useEffect, useMemo, useState } from "react";
import { updateCouponAdmin } from "@/services/admin";
import type { Coupon } from "@/types";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";
import styles from "./DrawerEditarCupom.module.css";

type CouponTypeValue = "percent" | "fixed" | "free_shipping";

type DrawerEditarCupomProps = {
  isOpen: boolean;
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: (coupon: Coupon) => void;
};

function normalizeCode(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function parseDateInput(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return raw;
}

function formatDateInput(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format((Number(cents || 0) || 0) / 100);
}

function randomCouponCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `TSEBI${code}`;
}

export function DrawerEditarCupom({ isOpen, coupon, onClose, onSaved }: DrawerEditarCupomProps) {
  const [originalCode, setOriginalCode] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponTypeValue>("percent");
  const [discountValue, setDiscountValue] = useState("0");
  const [active, setActive] = useState(true);
  const [minSubtotal, setMinSubtotal] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [maxUses, setMaxUses] = useState("0");
  const [firstPurchaseOnly, setFirstPurchaseOnly] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !coupon) return;
    setOriginalCode(String(coupon.code || ""));
    setCode(normalizeCode(String(coupon.code || "")));
    const couponType: CouponTypeValue =
      coupon.type === "fixed" ? "fixed" : coupon.type === "free_shipping" ? "free_shipping" : "percent";
    setType(couponType);
    // amountOffCents vem em centavos → exibir em reais
    setDiscountValue(
      couponType === "fixed"
        ? String(Number(coupon.amountOffCents || 0) / 100)
        : couponType === "free_shipping"
          ? "0"
          : String(Math.max(0, Number(coupon.percentOff || 0)))
    );
    setActive(Boolean(coupon.active));
    // minSubtotalCents e maxDiscountCents em centavos → exibir em reais
    setMinSubtotal(String(Number(coupon.minSubtotalCents || 0) / 100 || ""));
    setMaxDiscount(String(Number(coupon.maxDiscountCents || 0) / 100 || ""));
    setMaxUses(String(Math.max(0, Number(coupon.maxUses || 0) || 0)));
    setFirstPurchaseOnly(Boolean(coupon.firstPurchaseOnly));
    setStartsAt(formatDateInput(String(coupon.startsAt || "")));
    setExpiresAt(formatDateInput(String(coupon.expiresAt || "")));
    setDescription(String(coupon.description || ""));
    setError("");
  }, [coupon, isOpen]);

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!String(code || "").trim()) errors.code = "Código obrigatório.";
    if (type !== "free_shipping" && Number(discountValue || 0) <= 0) {
      errors.discountValue = "Valor do desconto obrigatório.";
    }
    return errors;
  }, [code, discountValue, type]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  const previewText = useMemo(() => {
    const normalizedCode = String(code || "").trim() || "CUPOM";
    let valueLabel: string;
    if (type === "free_shipping") {
      valueLabel = "frete grátis";
    } else if (type === "percent") {
      valueLabel = `${Math.max(0, Number(discountValue || 0))}% de desconto`;
    } else {
      // discountValue agora está em reais; formatMoney espera centavos
      valueLabel = `${formatMoney(Math.max(0, Number(discountValue || 0)) * 100)} de desconto`;
    }
    const starts = startsAt ? new Date(startsAt).toLocaleDateString("pt-BR") : "agora";
    const ends = expiresAt ? new Date(expiresAt).toLocaleDateString("pt-BR") : "sem expiração";
    // minSubtotal agora está em reais; formatMoney espera centavos
    const min = minSubtotal ? formatMoney(Number(minSubtotal || 0) * 100) : "sem valor mínimo";
    const usesLine = Number(maxUses || 0) > 0 ? `\nLimite de usos: ${maxUses}` : "";
    const firstLine = firstPurchaseOnly ? "\nApenas primeira compra" : "";
    return `Cupom ${normalizedCode} - ${valueLabel}\nVálido de ${starts} até ${ends}\nPedido mínimo: ${min}${usesLine}${firstLine}`;
  }, [code, discountValue, expiresAt, minSubtotal, startsAt, type, maxUses, firstPurchaseOnly]);

  async function handleSave() {
    if (!coupon) return;
    if (hasErrors) {
      setError("Revise os campos obrigatórios.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      // discountValue, minSubtotal e maxDiscount estão em reais → converter para centavos
      const payload = {
        code: normalizeCode(code),
        type,
        percentOff: type === "percent" ? Math.max(0, Number(discountValue || 0)) : 0,
        amountOffCents: type === "fixed" ? Math.round(Math.max(0, Number(discountValue || 0)) * 100) : 0,
        active,
        minSubtotalCents: minSubtotal ? Math.round(Math.max(0, Number(minSubtotal || 0)) * 100) : 0,
        maxDiscountCents: type === "percent" && maxDiscount ? Math.round(Math.max(0, Number(maxDiscount || 0)) * 100) : 0,
        maxUses: Math.max(0, Math.floor(Number(maxUses || 0))),
        firstPurchaseOnly,
        startsAt: parseDateInput(startsAt),
        expiresAt: parseDateInput(expiresAt),
        description: String(description || "").trim(),
      };

      const response = await updateCouponAdmin(originalCode || String(coupon.code || ""), payload);
      onSaved(response.coupon);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao atualizar cupom.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Editar Cupom"
      subtitle="Configuracao completa de regras e validade"
      onSave={handleSave}
      saveLabel={isSaving ? "Salvando..." : "Salvar alteracoes"}
      cancelLabel="Cancelar"
      disableSave={isSaving || hasErrors}
      wide={true}
      stickyFooter={true}
    >
      <div className={form.stack}>
        {error ? <p className={styles.error}>{error}</p> : null}

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Codigo do cupom</h4>
          <div className={styles.codeRow}>
            <div>
              <input
                className={`${form.input} ${validationErrors.code ? styles.inputError : ""}`}
                value={code}
                onChange={(event) => setCode(normalizeCode(event.target.value))}
              />
              {validationErrors.code ? <p className={styles.fieldError}>{validationErrors.code}</p> : null}
            </div>
            <button type="button" className={styles.generateBtn} onClick={() => setCode(randomCouponCode())}>
              Gerar aleatorio
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Tipo e valor</h4>
          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Tipo de desconto</label>
              <select
                className={form.select}
                value={type}
                onChange={(event) => { setType(event.target.value as CouponTypeValue); setDiscountValue("0"); }}
              >
                <option value="percent">Percentual %</option>
                <option value="fixed">Valor fixo R$</option>
                <option value="free_shipping">Frete grátis</option>
              </select>
            </div>
            {type !== "free_shipping" ? (
              <div className={form.field}>
                <label className={form.label}>
                  {type === "percent" ? "Valor do desconto (%)" : "Valor do desconto (R$)"}
                </label>
                <input
                  className={`${form.input} ${validationErrors.discountValue ? styles.inputError : ""}`}
                  type="number"
                  min={0}
                  step={type === "percent" ? "1" : "0.01"}
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                />
                {validationErrors.discountValue ? <p className={styles.fieldError}>{validationErrors.discountValue}</p> : null}
              </div>
            ) : null}
          </div>

          <div className={styles.switchRow}>
            <span className={form.label}>Status (Ativo / Inativo)</span>
            <button
              type="button"
              className={`${styles.switchBtn} ${active ? styles.switchBtnOn : ""}`}
              onClick={() => setActive((value) => !value)}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Regras de aplicacao</h4>
          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Valor minimo (R$)</label>
              <input className={form.input} type="number" min={0} step="0.01" value={minSubtotal} onChange={(event) => setMinSubtotal(event.target.value)} />
            </div>
            {type === "percent" ? (
              <div className={form.field}>
                <label className={form.label}>Limite maximo de desconto (R$)</label>
                <input className={form.input} type="number" min={0} step="0.01" value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} />
              </div>
            ) : null}
          </div>

          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Limite de usos (0 = ilimitado)</label>
              <input
                className={form.input}
                type="number"
                min={0}
                step={1}
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
              />
            </div>

            <div className={form.field}>
              <span className={form.label}>Apenas primeira compra</span>
              <div className={styles.switchRow} style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className={`${styles.switchBtn} ${firstPurchaseOnly ? styles.switchBtnOn : ""}`}
                  onClick={() => setFirstPurchaseOnly((value) => !value)}
                />
                <span style={{ marginLeft: 8, fontSize: 11 }}>{firstPurchaseOnly ? "Sim" : "Não"}</span>
              </div>
            </div>
          </div>

          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Data de inicio</label>
              <input className={form.input} type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </div>
            <div className={form.field}>
              <label className={form.label}>Data de expiracao</label>
              <input className={form.input} type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </div>
          </div>

          <div className={form.field}>
            <label className={form.label}>Descricao</label>
            <textarea className={form.textarea} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Preview</h4>
          <div className={styles.preview}>{previewText}</div>
        </section>
      </div>
    </Drawer>
  );
}
