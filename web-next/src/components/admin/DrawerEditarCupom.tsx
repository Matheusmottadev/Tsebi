"use client";

import { useEffect, useMemo, useState } from "react";
import { updateCouponAdmin } from "@/services/admin";
import type { Coupon } from "@/types";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";
import styles from "./DrawerEditarCupom.module.css";

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
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("0");
  const [active, setActive] = useState(true);
  const [minSubtotal, setMinSubtotal] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !coupon) return;
    setOriginalCode(String(coupon.code || ""));
    setCode(normalizeCode(String(coupon.code || "")));
    setType(coupon.type === "fixed" ? "fixed" : "percent");
    setDiscountValue(
      coupon.type === "fixed" ? String(Math.max(0, Number(coupon.amountOffCents || 0))) : String(Math.max(0, Number(coupon.percentOff || 0)))
    );
    setActive(Boolean(coupon.active));
    setMinSubtotal(String(Math.max(0, Number(coupon.minSubtotalCents || 0) || 0) || ""));
    setMaxDiscount(String(Math.max(0, Number(coupon.maxDiscountCents || 0) || 0) || ""));
    setStartsAt(formatDateInput(String(coupon.startsAt || "")));
    setExpiresAt(formatDateInput(String(coupon.expiresAt || "")));
    setDescription(String(coupon.description || ""));
    setError("");
  }, [coupon, isOpen]);

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!String(code || "").trim()) errors.code = "Codigo obrigatorio.";
    if (Number(discountValue || 0) <= 0) errors.discountValue = "Valor do desconto obrigatorio.";
    return errors;
  }, [code, discountValue]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  const previewText = useMemo(() => {
    const normalizedCode = String(code || "").trim() || "CUPOM";
    const valueLabel = type === "percent" ? `${Math.max(0, Number(discountValue || 0))}% de desconto` : `${formatMoney(Math.max(0, Number(discountValue || 0)))} de desconto`;
    const starts = startsAt ? new Date(startsAt).toLocaleDateString("pt-BR") : "agora";
    const ends = expiresAt ? new Date(expiresAt).toLocaleDateString("pt-BR") : "sem expiracao";
    const min = minSubtotal ? formatMoney(Number(minSubtotal || 0)) : "sem valor minimo";
    return `Cupom ${normalizedCode} - ${valueLabel}\nValido de ${starts} ate ${ends}\nPedido minimo: ${min}`;
  }, [code, discountValue, expiresAt, minSubtotal, startsAt, type]);

  async function handleSave() {
    if (!coupon) return;
    if (hasErrors) {
      setError("Revise os campos obrigatorios.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const payload = {
        code: normalizeCode(code),
        type,
        percentOff: type === "percent" ? Math.max(0, Number(discountValue || 0)) : 0,
        amountOffCents: type === "fixed" ? Math.max(0, Number(discountValue || 0)) : 0,
        active,
        minSubtotalCents: minSubtotal ? Math.max(0, Number(minSubtotal || 0)) : 0,
        maxDiscountCents: type === "percent" && maxDiscount ? Math.max(0, Number(maxDiscount || 0)) : 0,
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
              <select className={form.select} value={type} onChange={(event) => setType(event.target.value as "percent" | "fixed")}>
                <option value="percent">Percentual %</option>
                <option value="fixed">Valor fixo R$</option>
              </select>
            </div>
            <div className={form.field}>
              <label className={form.label}>Valor do desconto</label>
              <input
                className={`${form.input} ${validationErrors.discountValue ? styles.inputError : ""}`}
                type="number"
                min={0}
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
              />
              {validationErrors.discountValue ? <p className={styles.fieldError}>{validationErrors.discountValue}</p> : null}
            </div>
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
              <label className={form.label}>Valor minimo (opcional)</label>
              <input className={form.input} type="number" min={0} value={minSubtotal} onChange={(event) => setMinSubtotal(event.target.value)} />
            </div>
            {type === "percent" ? (
              <div className={form.field}>
                <label className={form.label}>Limite maximo de desconto</label>
                <input className={form.input} type="number" min={0} value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} />
              </div>
            ) : null}
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
