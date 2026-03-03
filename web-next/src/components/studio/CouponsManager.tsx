"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HttpError } from "@/lib/http";
import {
  bootstrapAdminCsrfToken,
  createCouponAdmin,
  deleteCouponAdmin,
  updateCouponAdmin,
} from "@/services/admin";
import type { Coupon } from "@/types";
import styles from "./CouponsManager.module.css";

type CouponsManagerProps = {
  initialCoupons: Coupon[];
  csrfToken: string;
};

type CouponDraft = {
  code: string;
  type: "percent" | "fixed";
  percentOff: string;
  amountOffCents: string;
  minSubtotalCents: string;
  maxDiscountCents: string;
  active: boolean;
  description: string;
};

function toInt(value: string, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function createDraft(coupon?: Coupon): CouponDraft {
  return {
    code: String(coupon?.code || ""),
    type: (coupon?.type || "percent") as "percent" | "fixed",
    percentOff: String(Math.max(0, Number(coupon?.percentOff || 0))),
    amountOffCents: String(Math.max(0, Number(coupon?.amountOffCents || 0))),
    minSubtotalCents: String(Math.max(0, Number(coupon?.minSubtotalCents || 0))),
    maxDiscountCents: String(Math.max(0, Number(coupon?.maxDiscountCents || 0))),
    active: Boolean(coupon?.active),
    description: String(coupon?.description || ""),
  };
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 403) return "CSRF inválido. Recarregue a página.";
    return error.message || "Falha ao salvar cupom.";
  }
  if (error instanceof Error) return error.message || "Falha ao salvar cupom.";
  return "Falha ao salvar cupom.";
}

export function CouponsManager({ initialCoupons, csrfToken }: CouponsManagerProps) {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [createDraftState, setCreateDraftState] = useState<CouponDraft>(createDraft());
  const [editDrafts, setEditDrafts] = useState<Record<string, CouponDraft>>({});

  const sortedCoupons = useMemo(
    () => [...coupons].sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""))),
    [coupons]
  );

  async function resolveToken(): Promise<string> {
    const explicit = String(csrfToken || "").trim();
    if (explicit) return explicit;
    return bootstrapAdminCsrfToken();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const token = await resolveToken();
      const response = await createCouponAdmin(
        {
          code: createDraftState.code.trim(),
          type: createDraftState.type,
          percentOff: toInt(createDraftState.percentOff),
          amountOffCents: toInt(createDraftState.amountOffCents),
          minSubtotalCents: toInt(createDraftState.minSubtotalCents),
          maxDiscountCents: toInt(createDraftState.maxDiscountCents),
          active: createDraftState.active,
          description: createDraftState.description.trim(),
        },
        token
      );

      setCoupons((current) => {
        const withoutDuplicate = current.filter((item) => item.code !== response.coupon.code);
        return [response.coupon, ...withoutDuplicate];
      });
      setCreateDraftState(createDraft());
      setSuccessMessage(response.created ? "Cupom criado." : "Cupom atualizado.");
      router.refresh();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRowSave(code: string) {
    const draft = editDrafts[code];
    if (!draft || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const token = await resolveToken();
      const response = await updateCouponAdmin(
        code,
        {
          type: draft.type,
          percentOff: toInt(draft.percentOff),
          amountOffCents: toInt(draft.amountOffCents),
          minSubtotalCents: toInt(draft.minSubtotalCents),
          maxDiscountCents: toInt(draft.maxDiscountCents),
          active: draft.active,
          description: draft.description.trim(),
        },
        token
      );

      setCoupons((current) =>
        current.map((item) => (item.code === code ? response.coupon : item))
      );
      setSuccessMessage(`Cupom ${code} salvo.`);
      router.refresh();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(code: string) {
    if (isSubmitting) return;
    if (!window.confirm(`Remover cupom ${code}?`)) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const token = await resolveToken();
      await deleteCouponAdmin(code, token);
      setCoupons((current) => current.filter((item) => item.code !== code));
      setSuccessMessage(`Cupom ${code} removido.`);
      router.refresh();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.createForm} onSubmit={handleCreate}>
        <h3>Novo código de acesso</h3>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>Código</span>
            <input
              type="text"
              value={createDraftState.code}
              onChange={(event) =>
                setCreateDraftState((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              required
            />
          </label>

          <label className={styles.field}>
            <span>Tipo</span>
            <select
              value={createDraftState.type}
              onChange={(event) =>
                setCreateDraftState((current) => ({ ...current, type: event.target.value as "percent" | "fixed" }))
              }
            >
              <option value="percent">Percentual</option>
              <option value="fixed">Valor fixo</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>% desconto</span>
            <input
              type="number"
              min={0}
              step={1}
              value={createDraftState.percentOff}
              onChange={(event) =>
                setCreateDraftState((current) => ({ ...current, percentOff: event.target.value }))
              }
            />
          </label>

          <label className={styles.field}>
            <span>Valor desconto (centavos)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={createDraftState.amountOffCents}
              onChange={(event) =>
                setCreateDraftState((current) => ({ ...current, amountOffCents: event.target.value }))
              }
            />
          </label>

          <label className={styles.field}>
            <span>Subtotal mínimo (centavos)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={createDraftState.minSubtotalCents}
              onChange={(event) =>
                setCreateDraftState((current) => ({ ...current, minSubtotalCents: event.target.value }))
              }
            />
          </label>

          <label className={styles.field}>
            <span>Desconto máximo (centavos)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={createDraftState.maxDiscountCents}
              onChange={(event) =>
                setCreateDraftState((current) => ({ ...current, maxDiscountCents: event.target.value }))
              }
            />
          </label>
        </div>

        <label className={styles.field}>
          <span>Descrição</span>
          <input
            type="text"
            value={createDraftState.description}
            onChange={(event) =>
              setCreateDraftState((current) => ({ ...current, description: event.target.value }))
            }
          />
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={createDraftState.active}
            onChange={(event) =>
              setCreateDraftState((current) => ({ ...current, active: event.target.checked }))
            }
          />
          <span>Ativo</span>
        </label>

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? <p className={styles.success}>{successMessage}</p> : null}

        <button type="submit" className={styles.submit} disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar cupom"}
        </button>
      </form>

      <div className={styles.list}>
        {sortedCoupons.map((coupon) => {
          const draft = editDrafts[coupon.code] || createDraft(coupon);
          return (
            <article key={coupon.code} className={styles.item}>
              <div className={styles.itemHeader}>
                <h4>{coupon.code}</h4>
                <button type="button" className={styles.deleteButton} onClick={() => handleDelete(coupon.code)}>
                  Remover
                </button>
              </div>

              <div className={styles.grid}>
                <label className={styles.field}>
                  <span>Tipo</span>
                  <select
                    value={draft.type}
                    onChange={(event) =>
                      setEditDrafts((current) => ({
                        ...current,
                        [coupon.code]: { ...draft, type: event.target.value as "percent" | "fixed" },
                      }))
                    }
                  >
                    <option value="percent">Percentual</option>
                    <option value="fixed">Valor fixo</option>
                  </select>
                </label>

                <label className={styles.field}>
                  <span>%</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.percentOff}
                    onChange={(event) =>
                      setEditDrafts((current) => ({
                        ...current,
                        [coupon.code]: { ...draft, percentOff: event.target.value },
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Valor fixo (centavos)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft.amountOffCents}
                    onChange={(event) =>
                      setEditDrafts((current) => ({
                        ...current,
                        [coupon.code]: { ...draft, amountOffCents: event.target.value },
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Ativo</span>
                  <select
                    value={draft.active ? "1" : "0"}
                    onChange={(event) =>
                      setEditDrafts((current) => ({
                        ...current,
                        [coupon.code]: { ...draft, active: event.target.value === "1" },
                      }))
                    }
                  >
                    <option value="1">Sim</option>
                    <option value="0">Não</option>
                  </select>
                </label>
              </div>

              <label className={styles.field}>
                <span>Descrição</span>
                <input
                  type="text"
                  value={draft.description}
                  onChange={(event) =>
                    setEditDrafts((current) => ({
                      ...current,
                      [coupon.code]: { ...draft, description: event.target.value },
                    }))
                  }
                />
              </label>

              <button type="button" className={styles.submit} onClick={() => handleRowSave(coupon.code)}>
                Salvar alterações
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

