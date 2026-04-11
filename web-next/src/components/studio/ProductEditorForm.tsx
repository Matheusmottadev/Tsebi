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

function seedColorImages(product: Product): Record<string, string[]> {
  const source = product?.colorImages;
  if (!source || typeof source !== "object") return {};
  const seeded: Record<string, string[]> = {};
  Object.entries(source).forEach(([color, urls]) => {
    if (Array.isArray(urls)) seeded[color] = urls.filter(Boolean);
  });
  return seeded;
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 403) return "CSRF inválido. Recarregue a página e tente novamente.";
    return error.message || "Falha ao salvar produto.";
  }
  if (error instanceof Error) return error.message || "Falha ao salvar produto.";
  return "Falha ao salvar produto.";
}

const MAX_COLOR_IMAGES = 6;

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
  const [colorImagesInput, setColorImagesInput] = useState<Record<string, string[]>>(() => seedColorImages(product));
  const [uploadingColor, setUploadingColor] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const sizes = useMemo(() => normalizeOptionsText(sizesText), [sizesText]);
  const colors = useMemo(() => normalizeOptionsText(colorsText), [colorsText]);

  const variantPairs = useMemo(() => {
    const pairs: Array<{ key: string; color: string; size: string }> = [];
    colors.forEach((color) => {
      sizes.forEach((size) => {
        pairs.push({ key: `${color}__${size}`, color, size });
      });
    });
    return pairs;
  }, [colors, sizes]);

  const hasVariantMatrix = variantPairs.length > 0;
  const totalVariantStock = useMemo(() => {
    if (!hasVariantMatrix) return 0;
    return variantPairs.reduce((sum, pair) => {
      return sum + Math.max(0, Number(variantStockInput[pair.key] || 0));
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
    setVariantStockInput((current) => ({ ...current, [variantKey]: safeValue }));
  }

  function handleColorImageChange(color: string, index: number, value: string) {
    setColorImagesInput((current) => {
      const urls = [...(current[color] || [])];
      urls[index] = value;
      return { ...current, [color]: urls };
    });
  }

  function handleColorImageAdd(color: string) {
    setColorImagesInput((current) => {
      const urls = current[color] || [];
      if (urls.length >= MAX_COLOR_IMAGES) return current;
      return { ...current, [color]: [...urls, ""] };
    });
  }

  function handleColorImageRemove(color: string, index: number) {
    setColorImagesInput((current) => {
      const urls = [...(current[color] || [])];
      urls.splice(index, 1);
      return { ...current, [color]: urls };
    });
  }

  async function handleColorImageUpload(color: string, file: File) {
    setUploadingColor(color);
    try {
      const token = String(csrfToken || "").trim() || (await bootstrapAdminCsrfToken());
      const currentUrls = colorImagesInput[color] || [];
      const slot = currentUrls.filter(Boolean).length + 1;

      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productId)}/image?slot=${slot}&color=${encodeURIComponent(color)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "x-csrf-token": token,
          },
          body: file,
        }
      );

      if (!response.ok) throw new Error("Falha no upload da imagem.");
      const data = await response.json();
      const uploadedUrl = String(data?.image?.url || "");
      if (!uploadedUrl) throw new Error("URL não retornada pelo servidor.");

      setColorImagesInput((current) => {
        const urls = [...(current[color] || [])].filter(Boolean);
        return { ...current, [color]: [...urls, uploadedUrl] };
      });
    } catch (error) {
      alert(pickErrorMessage(error));
    } finally {
      setUploadingColor(null);
    }
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

      // Limpa colorImages: remove entradas vazias, mantém só cores com imagens
      const payloadColorImages: Record<string, string[]> = {};
      Object.entries(colorImagesInput).forEach(([color, urls]) => {
        const clean = urls.filter((u) => String(u || "").trim());
        if (clean.length > 0) payloadColorImages[color] = clean;
      });

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
          colorImages: payloadColorImages,
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
        <span>Imagem principal (URL)</span>
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

      {colors.length > 0 && (
        <div className={styles.variantMatrix}>
          <p className={styles.variantTitle}>Fotos por cor</p>
          <p className={styles.help}>
            Adicione até {MAX_COLOR_IMAGES} fotos por cor. Essas imagens serão exibidas no card e na galeria
            correspondente a cada cor no app.
          </p>
          {colors.map((color) => {
            const urls = colorImagesInput[color] || [];
            const isUploading = uploadingColor === color;
            return (
              <div key={color} className={styles.colorImageBlock}>
                <p className={styles.colorImageLabel}>{color}</p>

                {urls.map((url, index) => (
                  <div key={index} className={styles.colorImageRow}>
                    <input
                      type="url"
                      className={styles.colorImageInput}
                      placeholder="https://..."
                      value={url}
                      onChange={(e) => handleColorImageChange(color, index, e.target.value)}
                    />
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className={styles.colorImagePreview} />
                    )}
                    <button
                      type="button"
                      className={styles.colorImageRemove}
                      onClick={() => handleColorImageRemove(color, index)}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className={styles.colorImageActions}>
                  {urls.length < MAX_COLOR_IMAGES && (
                    <button type="button" className={styles.colorImageAdd} onClick={() => handleColorImageAdd(color)}>
                      + URL
                    </button>
                  )}
                  {urls.length < MAX_COLOR_IMAGES && (
                    <label className={styles.colorImageUpload}>
                      {isUploading ? "Enviando..." : "↑ Upload"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleColorImageUpload(color, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
