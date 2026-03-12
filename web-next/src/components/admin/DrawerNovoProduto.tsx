"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bootstrapAdminCsrfToken, createProductAdmin } from "@/services/admin";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

const SIZE_OPTIONS = ["PP", "P", "M", "G", "GG", "XG"] as const;

type VariantRow = {
  key: string;
  label: string;
};

type DrawerNovoProdutoProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function parseMoneyToCents(value: string): number {
  const digits = String(value || "").replace(/\D/g, "");
  return Number(digits || 0);
}

function buildVariantRows(sizes: string[], colors: string[]): VariantRow[] {
  const cleanSizes = sizes.map((value) => value.trim()).filter(Boolean);
  const cleanColors = colors.map((value) => value.trim()).filter(Boolean);

  if (!cleanSizes.length || !cleanColors.length) return [];

  const rows: VariantRow[] = [];
  for (const size of cleanSizes) {
    for (const color of cleanColors) {
      rows.push({ key: `${color}__${size}`, label: `${size} / ${color}` });
    }
  }
  return rows;
}

export function DrawerNovoProduto({ isOpen, onClose, onSaved }: DrawerNovoProdutoProps) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const [optionalOpen, setOptionalOpen] = useState(false);
  const [currency, setCurrency] = useState("BRL");
  const [images, setImages] = useState<(File | null)[]>([null, null, null, null, null]);
  const [active, setActive] = useState(true);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [colorInput, setColorInput] = useState("");
  const [variantStock, setVariantStock] = useState<Record<string, number>>({});

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variants = useMemo(() => buildVariantRows(sizes, colors), [sizes, colors]);
  const imagePreviews = useMemo(
    () => images.map((file) => (file ? URL.createObjectURL(file) : null)),
    [images]
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [imagePreviews]);

  useEffect(() => {
    setVariantStock((current) => {
      const next: Record<string, number> = {};
      for (const row of variants) {
        next[row.key] = Number.isFinite(current[row.key]) ? Math.max(0, Number(current[row.key])) : 0;
      }
      return next;
    });
  }, [variants]);

  const requiredValid = useMemo(() => {
    if (!sku.trim()) return false;
    if (!name.trim()) return false;
    if (parseMoneyToCents(price) <= 0) return false;
    const stockQty = Number(stock);
    if (!Number.isFinite(stockQty) || stockQty < 0) return false;
    if (!images[0]) return false;
    return true;
  }, [sku, name, price, stock, images]);

  function toggleSize(value: string) {
    setSizes((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  function addColorTag() {
    const normalized = colorInput.trim();
    if (!normalized) return;
    if (colors.includes(normalized)) {
      setColorInput("");
      return;
    }
    setColors((current) => [...current, normalized]);
    setColorInput("");
  }

  function validate() {
    const nextErrors: Record<string, string> = {};

    if (!sku.trim()) nextErrors.sku = "Informe o SKU.";
    if (!name.trim()) nextErrors.name = "Informe o nome do produto.";

    const priceCents = parseMoneyToCents(price);
    if (priceCents <= 0) nextErrors.price = "Informe um preço válido.";

    const stockQty = Number(stock);
    if (!Number.isFinite(stockQty) || stockQty < 0) {
      nextErrors.stock = "Informe um estoque válido (0 ou maior).";
    }

    if (!images[0]) {
      nextErrors.image = "A primeira imagem é obrigatória.";
    }

    if (images.some((file) => file && !String(file.type || "").toLowerCase().startsWith("image/"))) {
      nextErrors.image = "Formato de imagem inválido. Use apenas imagens.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function setImageAt(index: number, file: File | null) {
    setImages((current) => current.map((item, itemIndex) => (itemIndex === index ? file : item)));
  }

  async function uploadProductImage(productId: string, file: File) {
    const csrfToken = await bootstrapAdminCsrfToken();
    const bytes = await file.arrayBuffer();
    const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/image`, {
      method: "POST",
      body: bytes,
      headers: {
        "content-type": file.type,
        "x-csrf-token": csrfToken,
      },
    });

    if (!response.ok) {
      throw new Error("IMAGE_UPLOAD_FAILED");
    }
  }

  async function handleSave() {
    if (!validate()) return;
    setIsSubmitting(true);
    setErrors({});

    try {
      const payload: Parameters<typeof createProductAdmin>[0] = {
        sku: sku.trim(),
        name: name.trim(),
        priceCents: parseMoneyToCents(price),
        stockQty: Number(stock),
        currency: currency,
        active,
      };

      if (sizes.length) payload.sizes = sizes;
      if (colors.length) payload.colors = colors;
      if (variants.length) {
        const stockMap: Record<string, number> = {};
        for (const row of variants) {
          stockMap[row.key] = Math.max(0, Number(variantStock[row.key] || 0));
        }
        payload.variantStock = stockMap;
      }

      const created = await createProductAdmin(payload);
      const createdId = String(created.product?.dbId || created.product?.id || created.product?.sku || "").trim();
      if (createdId) {
        const selectedImages = images.filter((file): file is File => Boolean(file));
        if (selectedImages.length) {
          const orderedUploads = selectedImages.length > 1 ? [...selectedImages.slice(1), selectedImages[0]] : selectedImages;
          for (const file of orderedUploads) {
            await uploadProductImage(createdId, file);
          }
        }
      }

      onClose();
      onSaved();

      setSku("");
      setName("");
      setPrice("");
      setStock("");
      setOptionalOpen(false);
      setCurrency("BRL");
      setImages([null, null, null, null, null]);
      setActive(true);
      setSizes([]);
      setColors([]);
      setColorInput("");
      setVariantStock({});
    } catch {
      setErrors({ form: "Falha ao criar produto. Verifique os dados e tente novamente." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Produto"
      subtitle="Cadastre um novo produto"
      onSave={handleSave}
      disableSave={!requiredValid || isSubmitting}
      saveLabel={isSubmitting ? "Salvando..." : "Salvar"}
    >
      <div className={form.stack}>
        {errors.form ? <p className={form.error}>{errors.form}</p> : null}

        <div className={form.field}>
          <label className={form.label} htmlFor="product-sku">
            SKU
          </label>
          <input id="product-sku" className={`${form.input} ${errors.sku ? form.inputError : ""}`} value={sku} onChange={(event) => setSku(event.target.value)} />
          {errors.sku ? <p className={form.error}>{errors.sku}</p> : null}
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="product-name">
            Nome
          </label>
          <input
            id="product-name"
            className={`${form.input} ${errors.name ? form.inputError : ""}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {errors.name ? <p className={form.error}>{errors.name}</p> : null}
        </div>

        <div className={form.row2}>
          <div className={form.field}>
            <label className={form.label} htmlFor="product-price">
              Preço (R$)
            </label>
            <input
              id="product-price"
              className={`${form.input} ${errors.price ? form.inputError : ""}`}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="Ex: 19990"
            />
            {errors.price ? <p className={form.error}>{errors.price}</p> : null}
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="product-stock">
              Estoque
            </label>
            <input
              id="product-stock"
              type="number"
              min={0}
              className={`${form.input} ${errors.stock ? form.inputError : ""}`}
              value={stock}
              onChange={(event) => setStock(event.target.value)}
            />
            {errors.stock ? <p className={form.error}>{errors.stock}</p> : null}
          </div>
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
                  <label className={form.label} htmlFor="product-currency">
                    Moeda
                  </label>
                  <select
                    id="product-currency"
                    className={form.select}
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                  >
                    <option value="BRL">BRL</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <div className={form.field}>
                  <label className={form.label}>
                    Imagens (até 5)
                  </label>
                  <div className={form.imageSlots}>
                    {images.map((file, index) => (
                      <div key={`product-image-slot-${index}`} className={form.imageSlotItem}>
                        <label className={form.imageSlotTrigger} htmlFor={`product-image-slot-${index}`}>
                          <input
                            id={`product-image-slot-${index}`}
                            type="file"
                            accept="image/*"
                            className={form.imageSlotInput}
                            onChange={(event) => {
                              setImageAt(index, event.target.files?.[0] || null);
                              event.currentTarget.value = "";
                            }}
                          />
                          {file && imagePreviews[index] ? (
                            <img src={imagePreviews[index] || ""} alt={`Foto ${index + 1}`} className={form.imageSlotPreview} />
                          ) : (
                            <span className={form.imageSlotEmpty}>
                              <Plus size={18} />
                            </span>
                          )}
                        </label>
                        {file ? (
                          <button
                            type="button"
                            className={form.imageRemoveBtn}
                            onClick={() => setImageAt(index, null)}
                            aria-label={`Remover foto ${index + 1}`}
                          >
                            <X size={12} />
                          </button>
                        ) : null}
                        <span className={form.imageSlotCaption}>Foto {index + 1}</span>
                      </div>
                    ))}
                  </div>
                  <p className={form.imageHint}>A primeira imagem será usada como foto principal</p>
                  {errors.image ? <p className={form.error}>{errors.image}</p> : null}
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

              <div className={form.field}>
                <span className={form.label}>Tamanhos</span>
                <div className={form.checks}>
                  {SIZE_OPTIONS.map((size) => (
                    <label key={size} className={form.check}>
                      <input type="checkbox" checked={sizes.includes(size)} onChange={() => toggleSize(size)} />
                      {size}
                    </label>
                  ))}
                </div>
              </div>

              <div className={form.field}>
                <label className={form.label} htmlFor="product-color-input">
                  Cores
                </label>
                <input
                  id="product-color-input"
                  className={form.input}
                  value={colorInput}
                  onChange={(event) => setColorInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addColorTag();
                    }
                  }}
                  placeholder="Digite e pressione Enter"
                />
                <div className={form.tagWrap}>
                  {colors.map((color) => (
                    <span key={color} className={form.tag}>
                      {color}
                      <button type="button" onClick={() => setColors((current) => current.filter((item) => item !== color))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {variants.length ? (
                <div className={form.field}>
                  <span className={form.label}>Estoque por variante</span>
                  <div className={form.variantGrid}>
                    {variants.map((row) => (
                      <div key={row.key} className={form.variantRow}>
                        <span className={form.variantName}>{row.label}</span>
                        <input
                          className={form.variantInput}
                          type="number"
                          min={0}
                          value={String(variantStock[row.key] ?? 0)}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            setVariantStock((current) => ({
                              ...current,
                              [row.key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </Drawer>
  );
}

