"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { HttpError } from "@/lib/http";
import { bootstrapAdminCsrfToken, updateProductAdmin } from "@/services/admin";
import type { Product } from "@/types";
import styles from "./ProductEditorForm.module.css";

type ProductEditorFormProps = {
  productId: string;
  product: Product;
  csrfToken: string;
};

function toSafeInt(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 403) return "CSRF inválido. Recarregue a página e tente novamente.";
    return error.message || "Falha ao salvar produto.";
  }
  if (error instanceof Error) return error.message || "Falha ao salvar produto.";
  return "Falha ao salvar produto.";
}

export function ProductEditorForm({ productId, product, csrfToken }: ProductEditorFormProps) {
  const router = useRouter();
  const [name, setName] = useState(product.name || "");
  const [priceCents, setPriceCents] = useState(String(Math.max(0, Number(product.unitAmount || 0))));
  const [stockQty, setStockQty] = useState(String(Math.max(0, Number(product.stock || 0))));
  const [imageUrl, setImageUrl] = useState(product.image || "");
  const [isActive, setIsActive] = useState(Boolean(product.active));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const token = String(csrfToken || "").trim() || (await bootstrapAdminCsrfToken());
      await updateProductAdmin(
        productId,
        {
          name: name.trim(),
          priceCents: toSafeInt(priceCents, Math.max(0, Number(product.unitAmount || 0))),
          stockQty: toSafeInt(stockQty, Math.max(0, Number(product.stock || 0))),
          imageUrl: imageUrl.trim(),
          active: isActive,
        },
        token
      );

      setSuccessMessage("Produto atualizado com sucesso.");
      router.refresh();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span>Nome</span>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} required />
      </label>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Preço (centavos)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={priceCents}
            onChange={(event) => setPriceCents(event.target.value)}
            required
          />
        </label>

        <label className={styles.field}>
          <span>Estoque</span>
          <input
            type="number"
            min={0}
            step={1}
            value={stockQty}
            onChange={(event) => setStockQty(event.target.value)}
            required
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>Imagem URL</span>
        <input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
      </label>

      <label className={styles.checkbox}>
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
        <span>Produto ativo</span>
      </label>

      {errorMessage ? (
        <p role="alert" className={styles.error}>
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? <p className={styles.success}>{successMessage}</p> : null}

      <button type="submit" className={styles.submit} disabled={isSubmitting}>
        {isSubmitting ? "Salvando..." : "Salvar produto"}
      </button>
    </form>
  );
}
