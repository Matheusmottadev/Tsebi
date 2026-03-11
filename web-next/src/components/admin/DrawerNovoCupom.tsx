"use client";

import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { createCouponAdmin } from "@/services/admin";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

function parseMoneyToCents(value: string): number {
  const digits = String(value || "").replace(/\D/g, "");
  return Number(digits || 0);
}

function parsePercent(value: string): number {
  const normalized = String(value || "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function randomCouponCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

type DrawerNovoCupomProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function DrawerNovoCupom({ isOpen, onClose, onSaved }: DrawerNovoCupomProps) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [discount, setDiscount] = useState("");
  const [active, setActive] = useState(true);

  const [optionalOpen, setOptionalOpen] = useState(false);
  const [minSubtotal, setMinSubtotal] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [description, setDescription] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiredValid = useMemo(() => {
    const trimmedCode = code.trim();
    if (trimmedCode.length < 3) return false;
    if (type === "percent") return parsePercent(discount) > 0;
    return parseMoneyToCents(discount) > 0;
  }, [code, discount, type]);

  function validate() {
    const nextErrors: Record<string, string> = {};
    const trimmedCode = code.trim();
    if (trimmedCode.length < 3) {
      nextErrors.code = "Informe um código com no mínimo 3 caracteres.";
    }

    if (type === "percent") {
      const value = parsePercent(discount);
      if (value <= 0 || value > 100) {
        nextErrors.discount = "Use um percentual entre 1 e 100.";
      }
    } else {
      const cents = parseMoneyToCents(discount);
      if (cents <= 0) {
        nextErrors.discount = "Informe um valor fixo maior que zero.";
      }
    }

    if (startsAt && expiresAt && startsAt > expiresAt) {
      nextErrors.expiresAt = "A expiração deve ser igual ou posterior ao início.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setIsSubmitting(true);
    setErrors({});
    try {
      const payload: Parameters<typeof createCouponAdmin>[0] = {
        code: code.trim().toUpperCase(),
        type,
        active,
      };

      if (type === "percent") {
        payload.percentOff = Math.round(parsePercent(discount));
      } else {
        payload.amountOffCents = parseMoneyToCents(discount);
      }

      if (minSubtotal.trim()) payload.minSubtotalCents = parseMoneyToCents(minSubtotal);
      if (maxDiscount.trim()) payload.maxDiscountCents = parseMoneyToCents(maxDiscount);
      if (startsAt.trim()) payload.startsAt = startsAt;
      if (expiresAt.trim()) payload.expiresAt = expiresAt;
      if (description.trim()) payload.description = description.trim();

      await createCouponAdmin(payload);
      onClose();
      onSaved();

      setCode("");
      setType("percent");
      setDiscount("");
      setActive(true);
      setOptionalOpen(false);
      setMinSubtotal("");
      setMaxDiscount("");
      setStartsAt("");
      setExpiresAt("");
      setDescription("");
    } catch {
      setErrors({ form: "Falha ao criar cupom. Verifique os dados e tente novamente." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Cupom"
      subtitle="Criar código de desconto"
      onSave={handleSave}
      disableSave={!requiredValid || isSubmitting}
      saveLabel={isSubmitting ? "Salvando..." : "Salvar"}
    >
      <div className={form.stack}>
        {errors.form ? <p className={form.error}>{errors.form}</p> : null}

        <div className={form.field}>
          <label className={form.label} htmlFor="coupon-code">
            Código
          </label>
          <div className={form.row2}>
            <input
              id="coupon-code"
              className={`${form.input} ${errors.code ? form.inputError : ""}`}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="TSEBI10"
            />
            <button type="button" className={form.inlineBtn} onClick={() => setCode(randomCouponCode())}>
              <RefreshCw size={12} strokeWidth={1.8} style={{ marginRight: 6 }} />
              Gerar aleatório
            </button>
          </div>
          {errors.code ? <p className={form.error}>{errors.code}</p> : null}
        </div>

        <div className={form.row2}>
          <div className={form.field}>
            <label className={form.label} htmlFor="coupon-type">
              Tipo de desconto
            </label>
            <select
              id="coupon-type"
              className={form.select}
              value={type}
              onChange={(event) => setType(event.target.value as "percent" | "fixed")}
            >
              <option value="percent">Percentual %</option>
              <option value="fixed">Valor fixo R$</option>
            </select>
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="coupon-value">
              Valor do desconto
            </label>
            <input
              id="coupon-value"
              className={`${form.input} ${errors.discount ? form.inputError : ""}`}
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              placeholder={type === "percent" ? "10" : "1500"}
            />
            {errors.discount ? <p className={form.error}>{errors.discount}</p> : null}
          </div>
        </div>

        <div className={form.field}>
          <span className={form.label}>Status</span>
          <span className={form.switch}>
            <button
              type="button"
              className={active ? form.switchOn : ""}
              onClick={() => setActive((current) => !current)}
              aria-label="Alternar status"
            />
            {active ? "Ativo" : "Inativo"}
          </span>
        </div>

        <section className={form.optional}>
          <button type="button" className={form.optionalBtn} onClick={() => setOptionalOpen((current) => !current)}>
            {optionalOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Opcionais
          </button>

          {optionalOpen ? (
            <div className={form.optionalContent}>
              <div className={form.row2}>
                <div className={form.field}>
                  <label className={form.label} htmlFor="coupon-minSubtotal">
                    Valor mínimo do pedido
                  </label>
                  <input
                    id="coupon-minSubtotal"
                    className={form.input}
                    value={minSubtotal}
                    onChange={(event) => setMinSubtotal(event.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className={form.field}>
                  <label className={form.label} htmlFor="coupon-maxDiscount">
                    Limite máximo de desconto
                  </label>
                  <input
                    id="coupon-maxDiscount"
                    className={form.input}
                    value={maxDiscount}
                    onChange={(event) => setMaxDiscount(event.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className={form.row2}>
                <div className={form.field}>
                  <label className={form.label} htmlFor="coupon-startsAt">
                    Data de início
                  </label>
                  <input
                    id="coupon-startsAt"
                    className={form.input}
                    type="date"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                  />
                </div>

                <div className={form.field}>
                  <label className={form.label} htmlFor="coupon-expiresAt">
                    Data de expiração
                  </label>
                  <input
                    id="coupon-expiresAt"
                    className={`${form.input} ${errors.expiresAt ? form.inputError : ""}`}
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                  {errors.expiresAt ? <p className={form.error}>{errors.expiresAt}</p> : null}
                </div>
              </div>

              <div className={form.field}>
                <label className={form.label} htmlFor="coupon-description">
                  Descrição
                </label>
                <textarea
                  id="coupon-description"
                  className={form.textarea}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </Drawer>
  );
}

