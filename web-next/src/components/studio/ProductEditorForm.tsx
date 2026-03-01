"use client";

import { FormEvent, useMemo, useState } from "react";
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

function normalizeOptionsText(value: string): string[] {
  const parts = String(value || "")
    .split(/[\n,;]+/g)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  parts.forEach((entry) => {
    const key = entry.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(entry);
  });
  return unique;
}

function parseVariantKey(rawKey: string): string | null {
  const key = String(rawKey || "").trim();
  if (!key) return null;
  if (key.includes("__")) {
    const [color, size] = key.split("__");
    if (!String(color || "").trim() || !String(size || "").trim()) return null;
    return `${String(color).trim()}__${String(size).trim()}`;
  }
  if (key.includes("|")) {
    const [color, size] = key.split("|");
    if (!String(color || "").trim() || !String(size || "").trim()) return null;
    return `${String(color).trim()}__${String(size).trim()}`;
  }
  return null;
}

function seedVariantStock(product: Product): Record<string, string> {
  const seeded: Record<string, string> = {};
  const source =
    product?.variantStock && typeof product.variantStock === "object" && !Array.isArray(product.variantStock)
      ? product.variantStock
      : {};
  Object.entries(source).forEach(([rawKey, rawQty]) => {
    const key = parseVariantKey(rawKey);
    if (!key) return;
    seeded[key] = String(Math.max(0, Number(rawQty || 0)));
  });
  return seeded;
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 403) return "CSRF invalido. Recarregue a pagina e tente novamente.";
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
  const [sizesText, setSizesText] = useState(Array.isArray(product.sizes) ? product.sizes.join(", ") : "");
  const [colorsText, setColorsText] = useState(Array.isArray(product.colors) ? product.colors.join(", ") : "");
  const [variantStockInput, setVariantStockInput] = useState<Record<string, string>>(() => seedVariantStock(product));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const sizes = useMemo(() => normalizeOptionsText(sizesText), [sizesText]);
  const colors = useMemo(() => normalizeOptionsText(colorsText), [colorsText]);

  const variantPairs = useMemo(() => {
    const pairs: Array<{ key: string; color: string; size: string }> = [];
    colors.forEach((color) => {
      sizes.forEach((size) => {
        pairs.push({
          key: `${color}__${size}`,
          color,
          size,
        });
      });
    });
    return pairs;
  }, [colors, sizes]);

  const hasVariantMatrix = variantPairs.length > 0;
  const totalVariantStock = useMemo(() => {
    if (!hasVariantMatrix) return 0;
    return variantPairs.reduce((sum, pair) => {
      const qty = Math.max(0, Number(variantStockInput[pair.key] || 0));
      return sum + qty;
    }, 0);
  }, [hasVariantMatrix, variantPairs, variantStockInput]);

  const resolvedStockQty = hasVariantMatrix
    ? totalVariantStock
    : toSafeInt(stockQty, Math.max(0, Number(product.stock || 0)));

  function handleOptionsTextChange(
    value: string,
    setter: (value: string) => void,
    nextColorsText: string,
    nextSizesText: string
  ) {
    setter(value);
    const nextColors = normalizeOptionsText(nextColorsText);
    const nextSizes = normalizeOptionsText(nextSizesText);
    const allowedKeys = new Set<string>();
    nextColors.forEach((color) => {
      nextSizes.forEach((size) => {
        allowedKeys.add(`${color}__${size}`);
      });
    });

    setVariantStockInput((current) => {
      const next: Record<string, string> = {};
      allowedKeys.forEach((key) => {
        next[key] = String(current[key] || "0");
      });
      return next;
    });
  }

  function handleVariantStockChange(variantKey: string, value: string) {
    const safeValue = String(value || "").replace(/[^\d]/g, "");
    setVariantStockInput((current) => ({
      ...current,
      [variantKey]: safeValue,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const token = String(csrfToken || "").trim() || (await bootstrapAdminCsrfToken());

      const payloadVariantStock: Record<string, number> = {};
      if (hasVariantMatrix) {
        variantPairs.forEach((pair) => {
          payloadVariantStock[pair.key] = Math.max(0, Number(variantStockInput[pair.key] || 0));
        });
      }

      await updateProductAdmin(
        productId,
        {
          name: name.trim(),
          priceCents: toSafeInt(priceCents, Math.max(0, Number(product.unitAmount || 0))),
          stockQty: resolvedStockQty,
          imageUrl: imageUrl.trim(),
          active: isActive,
          sizes,
          colors,
          variantStock: payloadVariantStock,
        },
        token
      );

      setStockQty(String(resolvedStockQty));
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
          <span>Preco (centavos)</span>
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
          <span>{hasVariantMatrix ? "Estoque total (calculado)" : "Estoque total"}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={hasVariantMatrix ? String(resolvedStockQty) : stockQty}
            onChange={(event) => setStockQty(event.target.value)}
            readOnly={hasVariantMatrix}
            required
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>Imagem URL</span>
        <input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
      </label>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Tamanhos (separados por virgula)</span>
          <input
            type="text"
            value={sizesText}
            onChange={(event) =>
              handleOptionsTextChange(event.target.value, setSizesText, colorsText, event.target.value)
            }
            placeholder="PP, P, M, G, GG"
          />
        </label>

        <label className={styles.field}>
          <span>Cores (separadas por virgula)</span>
          <input
            type="text"
            value={colorsText}
            onChange={(event) =>
              handleOptionsTextChange(event.target.value, setColorsText, event.target.value, sizesText)
            }
            placeholder="Preto, Off White, Azul"
          />
        </label>
      </div>

      {hasVariantMatrix ? (
        <div className={styles.variantMatrix}>
          <p className={styles.variantTitle}>Estoque por cor e tamanho</p>
          <div className={styles.variantGrid}>
            {variantPairs.map((pair) => (
              <label key={pair.key} className={styles.field}>
                <span>
                  {pair.color} / {pair.size}
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={variantStockInput[pair.key] || "0"}
                  onChange={(event) => handleVariantStockChange(pair.key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.help}>Preencha cores e tamanhos para ativar o estoque por variante.</p>
      )}

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
