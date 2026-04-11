"use client";

import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bootstrapAdminCsrfToken, getProductAdmin, updateProductAdmin } from "@/services/admin";
import type { Product, ProductAvailabilityStatus } from "@/types";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";
import styles from "./DrawerEditarProduto.module.css";

type DrawerEditarProdutoProps = {
  isOpen: boolean;
  product: Product | null;
  categoryOptions?: string[];
  collectionOptions?: string[];
  onClose: () => void;
  onSaved: (product: Product) => void;
};

type SizeRow = {
  label: string;
  checked: boolean;
  stock: number;
};

type VariantRow = {
  key: string;
  label: string;
};

type PhotoSlot = {
  id: string;
  file: File | null;
  url: string;
  persistedUrl: string;
};

type ValidationErrors = Record<string, string>;

const SIZE_LABELS = ["PP", "P", "M", "G", "GG", "XG", "Unico"];
const AVAILABILITY_OPTIONS: Array<{ value: ProductAvailabilityStatus; label: string }> = [
  { value: "disponivel", label: "Disponivel" },
  { value: "esgotando", label: "Esgotando" },
  { value: "esgotado", label: "Esgotado" },
];

const COLOR_MAP: Record<string, string> = {
  preto: "#111111",
  branco: "#f6f6f6",
  caramelo: "#ad6f3b",
  verde: "#4f7f5f",
  azul: "#5d7ea8",
  vermelho: "#a3262f",
  bege: "#ccb998",
  cinza: "#9ca3af",
  marrom: "#7a5230",
  vinho: "#6d1d2b",
};

function normalizeText(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoneyInput(cents: number): string {
  const amount = (Number(cents || 0) || 0) / 100;
  return amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoneyToCents(value: string): number {
  const digits = String(value || "").replace(/\D/g, "");
  return Number(digits || 0);
}

function asTitleCase(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function parseVariantKey(rawKey: string): { color: string; size: string } | null {
  const key = String(rawKey || "").trim();
  if (!key) return null;
  if (key.includes("__")) {
    const [color, size] = key.split("__");
    if (!String(color || "").trim() || !String(size || "").trim()) return null;
    return { color: String(color).trim(), size: String(size).trim() };
  }
  if (key.includes("|")) {
    const [color, size] = key.split("|");
    if (!String(color || "").trim() || !String(size || "").trim()) return null;
    return { color: String(color).trim(), size: String(size).trim() };
  }
  return null;
}

function resolveSizeLabel(value: string): string {
  const normalized = normalizeText(value);
  const known = SIZE_LABELS.find((label) => normalizeText(label) === normalized);
  return known || String(value || "").trim();
}

function buildVariantRows(sizes: string[], colors: string[]): VariantRow[] {
  const cleanSizes = sizes.map((value) => String(value || "").trim()).filter(Boolean);
  const cleanColors = colors.map((value) => String(value || "").trim()).filter(Boolean);
  if (!cleanSizes.length || !cleanColors.length) return [];

  const rows: VariantRow[] = [];
  for (const size of cleanSizes) {
    for (const color of cleanColors) {
      rows.push({
        key: `${color}__${size}`,
        label: `${size} / ${color}`,
      });
    }
  }
  return rows;
}

function buildSelectorOptions(options: string[], selectedValue: string): string[] {
  const next: string[] = [];
  const seen = new Set<string>();

  options.forEach((option) => {
    const raw = String(option || "").trim();
    const key = normalizeText(raw);
    if (!raw || !key || seen.has(key)) return;
    seen.add(key);
    next.push(raw);
  });

  const selected = String(selectedValue || "").trim();
  const selectedKey = normalizeText(selected);
  if (selected && selectedKey && !seen.has(selectedKey)) {
    next.unshift(selected);
  }

  return next;
}

function buildInitialSizeRows(product: Product): SizeRow[] {
  const selected = new Set((Array.isArray(product.sizes) ? product.sizes : []).map((size) => normalizeText(size)));
  const stockBySize: Record<string, number> = {};

  if (product.variantStock && typeof product.variantStock === "object") {
    Object.entries(product.variantStock).forEach(([key, qty]) => {
      const parts = String(key || "").split(/__|\|/);
      const size = parts.length > 1 ? normalizeText(parts[1]) : "";
      if (!size) return;
      stockBySize[size] = (stockBySize[size] || 0) + Math.max(0, Number(qty || 0));
    });
  }

  const explicitStockTotal = Object.values(stockBySize).reduce((sum, qty) => sum + Math.max(0, Number(qty || 0)), 0);
  const fallbackTotal = Math.max(0, Number(product.stock || 0));
  const selectedKnownSizes = SIZE_LABELS.filter((label) => selected.has(normalizeText(label)));

  // Fallback: quando variantStock vier vazio/zerado, usa stock total do produto.
  if (explicitStockTotal <= 0 && fallbackTotal > 0 && selectedKnownSizes.length > 0) {
    let remaining = fallbackTotal;
    let pointer = 0;
    while (remaining > 0) {
      const key = normalizeText(selectedKnownSizes[pointer % selectedKnownSizes.length]);
      stockBySize[key] = (stockBySize[key] || 0) + 1;
      remaining -= 1;
      pointer += 1;
    }
  }

  return SIZE_LABELS.map((label) => {
    const normalized = normalizeText(label);
    const stock = Math.max(0, Number(stockBySize[normalized] || 0));
    const checked = selected.has(normalized) || stock > 0;
    return {
      label,
      checked,
      stock: checked ? stock : 0,
    };
  });
}

function buildInitialVariantStock(product: Product, sizeRows: SizeRow[], colors: string[]): Record<string, number> {
  const seeded: Record<string, number> = {};
  let hasExplicitMatrix = false;

  if (product.variantStock && typeof product.variantStock === "object") {
    Object.entries(product.variantStock).forEach(([rawKey, rawQty]) => {
      const parts = parseVariantKey(rawKey);
      if (!parts) return;
      const color = asTitleCase(parts.color);
      const size = resolveSizeLabel(parts.size);
      if (!color || !size) return;
      hasExplicitMatrix = true;
      seeded[`${color}__${size}`] = Math.max(0, Number(rawQty || 0));
    });
  }

  if (hasExplicitMatrix) return seeded;

  const defaultColor = asTitleCase(colors[0] || "Unico") || "Unico";
  sizeRows
    .filter((size) => size.checked)
    .forEach((size) => {
      const qty = Math.max(0, Number(size.stock || 0));
      if (qty < 1) return;
      seeded[`${defaultColor}__${size.label}`] = qty;
    });

  return seeded;
}

function buildInitialPhotos(product: Product): PhotoSlot[] {
  const gallery = Array.isArray(product.galleryImages) ? product.galleryImages : [];
  const urls = [String(product.image || ""), String(product.secondaryImage || ""), ...gallery]
    .map((value) => String(value || "").trim())
    .slice(0, 5);

  while (urls.length < 5) urls.push("");

  return urls.map((url, index) => ({
    id: `slot-${index + 1}`,
    file: null,
    url,
    persistedUrl: url,
  }));
}

export function DrawerEditarProduto({
  isOpen,
  product,
  categoryOptions = [],
  collectionOptions = [],
  onClose,
  onSaved,
}: DrawerEditarProdutoProps) {
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [active, setActive] = useState(true);
  const [availabilityStatus, setAvailabilityStatus] = useState<ProductAvailabilityStatus>("disponivel");
  const [sizes, setSizes] = useState<SizeRow[]>(SIZE_LABELS.map((label) => ({ label, checked: false, stock: 0 })));
  const [colorInput, setColorInput] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [variantStockInput, setVariantStockInput] = useState<Record<string, number>>({});
  const [modelInfo, setModelInfo] = useState("");
  const [fitType, setFitType] = useState("");
  const [sizeRecommendation, setSizeRecommendation] = useState("");
  const [category, setCategory] = useState("");
  const [collection, setCollection] = useState("");
  const [gender, setGender] = useState("Unissex");
  const [detailedModeling, setDetailedModeling] = useState("");
  const [materialMain, setMaterialMain] = useState("");
  const [cleaningRecommendation, setCleaningRecommendation] = useState("");
  const [careInput, setCareInput] = useState("");
  const [careList, setCareList] = useState<string[]>([]);
  const [colorImages, setColorImages] = useState<Record<string, string[]>>({});
  const [uploadingColor, setUploadingColor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const previewUrlRegistryRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isOpen || !product) return;
    let cancelled = false;
    const baseProduct: Product = product;

    async function hydrate(): Promise<void> {
      const identifier = String(baseProduct.dbId || baseProduct.id || baseProduct.sku || "").trim();
      let source: Product = baseProduct;
      if (identifier) {
        try {
          const fresh = await getProductAdmin(identifier);
          if (fresh) source = fresh;
        } catch {
          // fallback para os dados ja carregados em lista
        }
      }
      if (cancelled) return;

      setPhotos(buildInitialPhotos(source));
      setSku(String(source.sku || ""));
      setName(String(source.name || ""));
      setPrice(formatMoneyInput(Number(source.unitAmount || 0)));
      setCurrency(String(source.currency || "BRL").toUpperCase() || "BRL");
      setActive(Boolean(source.active));
      const normalizedAvailability = String(source.availabilityStatus || "").trim().toLowerCase();
      if (normalizedAvailability === "esgotando" || normalizedAvailability === "esgotado" || normalizedAvailability === "disponivel") {
        setAvailabilityStatus(normalizedAvailability);
      } else {
        setAvailabilityStatus(Number(source.stock || 0) <= 0 ? "esgotado" : "disponivel");
      }
      const initialSizes = buildInitialSizeRows(source);
      const initialColors = (Array.isArray(source.colors) ? source.colors : []).map((item) => asTitleCase(item)).filter(Boolean);

      setSizes(initialSizes);
      setColors(initialColors);
      setVariantStockInput(buildInitialVariantStock(source, initialSizes, initialColors));
      setModelInfo(String(source.modelInfo || ""));
      setFitType(String(source.fitType || ""));
      setSizeRecommendation(String(source.sizeRecommendation || ""));
      setCategory(String(source.category || ""));
      setCollection(String(source.collection || ""));
      setGender(String(source.gender || "Unissex") || "Unissex");
      setDetailedModeling(String(source.detailedModeling || ""));
      setMaterialMain(String(source.materialMain || source.material || ""));
      setCleaningRecommendation(String(source.cleaningRecommendation || ""));
      setCareList((Array.isArray(source.careList) ? source.careList : []).map((item) => String(item || "").trim()).filter(Boolean));

      // Inicializa fotos por cor
      const seededColorImages: Record<string, string[]> = {};
      if (source.colorImages && typeof source.colorImages === "object") {
        Object.entries(source.colorImages).forEach(([color, urls]) => {
          if (Array.isArray(urls) && urls.length > 0) {
            seededColorImages[String(color).trim()] = urls.map((u) => String(u || "").trim()).filter(Boolean);
          }
        });
      }
      setColorImages(seededColorImages);

      setColorInput("");
      setCareInput("");
      setError("");
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [isOpen, product]);

  const checkedSizes = useMemo(() => sizes.filter((size) => size.checked).map((size) => size.label), [sizes]);

  const resolvedColors = useMemo(() => {
    const deduped: string[] = [];
    const seen = new Set<string>();
    const source = (colors.length > 0 ? colors : ["Unico"]).map((color) => asTitleCase(color)).filter(Boolean);
    source.forEach((color) => {
      const key = normalizeText(color);
      if (!key || seen.has(key)) return;
      seen.add(key);
      deduped.push(color);
    });
    return deduped.length > 0 ? deduped : ["Unico"];
  }, [colors]);

  const variantRows = useMemo(() => buildVariantRows(checkedSizes, resolvedColors), [checkedSizes, resolvedColors]);

  const resolvedCategoryOptions = useMemo(
    () => buildSelectorOptions(categoryOptions, category),
    [category, categoryOptions]
  );
  const resolvedCollectionOptions = useMemo(
    () => buildSelectorOptions(collectionOptions, collection),
    [collection, collectionOptions]
  );

  useEffect(() => {
    setVariantStockInput((current) => {
      const next: Record<string, number> = {};
      for (const row of variantRows) {
        const qty = Number(current[row.key] ?? 0);
        next[row.key] = Number.isFinite(qty) && qty >= 0 ? Math.floor(qty) : 0;
      }
      return next;
    });
  }, [variantRows]);

  useEffect(() => {
    return () => {
      previewUrlRegistryRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlRegistryRef.current = [];
    };
  }, []);

  const validationErrors = useMemo(() => {
    const next: ValidationErrors = {};

    if (!String(sku || "").trim()) next.sku = "SKU obrigatório.";
    if (!String(name || "").trim()) next.name = "Nome obrigatório.";
    if (parseMoneyToCents(price) <= 0) next.price = "Preço inválido.";

    if (checkedSizes.length === 0) {
      next.sizes = "Selecione pelo menos um tamanho.";
    }

    if (variantRows.length === 0) {
      next.variantStock = "Preencha pelo menos uma variante para controlar estoque.";
    } else {
      const totalVariantStock = variantRows.reduce((sum, row) => sum + Math.max(0, Number(variantStockInput[row.key] || 0)), 0);
      if (totalVariantStock < 1) {
        next.variantStock = "Informe estoque maior que 0 em pelo menos uma combinacao.";
      }
    }

    return next;
  }, [checkedSizes.length, name, price, sku, variantRows, variantStockInput]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  function openFilePicker(index: number) {
    const ref = inputRefs.current[index];
    if (ref) ref.click();
  }

  function setFileAt(index: number, file: File) {
    setPhotos((current) => {
      const next = [...current];
      const previous = next[index];
      if (previous?.url && String(previous.url).startsWith("blob:")) {
        URL.revokeObjectURL(previous.url);
      }
      const nextUrl = file ? URL.createObjectURL(file) : "";
      if (nextUrl) previewUrlRegistryRef.current.push(nextUrl);
      next[index] = {
        ...previous,
        file,
        url: nextUrl,
        persistedUrl: String(previous?.persistedUrl || "").trim(),
      };
      return next;
    });
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const next = [...current];
      const previous = next[index];
      if (previous?.url && String(previous.url).startsWith("blob:")) {
        URL.revokeObjectURL(previous.url);
      }
      next[index] = { ...previous, file: null, url: "", persistedUrl: "" };
      return next;
    });
  }

  function reorderPhotos(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setPhotos((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function updateSizeChecked(index: number, checked: boolean) {
    setSizes((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        return {
          ...row,
          checked,
          stock: checked ? Math.max(1, Number(row.stock || 0)) : row.stock,
        };
      })
    );
  }

  function updateVariantStock(variantKey: string, value: string) {
    const parsed = Number(value);
    setVariantStockInput((current) => ({
      ...current,
      [variantKey]: Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0,
    }));
  }

  function tryAddColor(rawValue: string) {
    const normalized = asTitleCase(rawValue);
    if (!normalized) return;

    setColors((current) => {
      if (current.some((item) => normalizeText(item) === normalizeText(normalized))) return current;
      return [...current, normalized];
    });
  }

  function handleColorInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    tryAddColor(colorInput);
    setColorInput("");
  }

  function removeColor(index: number) {
    setColors((current) => current.filter((_item, itemIndex) => itemIndex !== index));
  }

  function addCareItem() {
    const normalized = String(careInput || "").trim();
    if (!normalized) return;
    setCareList((current) => [...current, normalized]);
    setCareInput("");
  }

  function removeCare(index: number) {
    setCareList((current) => current.filter((_item, itemIndex) => itemIndex !== index));
  }

  function handleColorImageChange(color: string, index: number, value: string) {
    setColorImages((current) => {
      const urls = [...(current[color] || [])];
      urls[index] = value;
      return { ...current, [color]: urls };
    });
  }

  function handleColorImageAdd(color: string) {
    setColorImages((current) => {
      const urls = [...(current[color] || [])];
      if (urls.length >= 6) return current;
      return { ...current, [color]: [...urls, ""] };
    });
  }

  function handleColorImageRemove(color: string, index: number) {
    setColorImages((current) => {
      const urls = [...(current[color] || [])].filter((_u, i) => i !== index);
      return { ...current, [color]: urls };
    });
  }

  async function handleColorImageUpload(color: string, file: File) {
    if (!product) return;
    const identifier = String(product.dbId || product.id || product.sku || "").trim();
    if (!identifier) return;
    setUploadingColor(color);
    try {
      const csrfToken = await bootstrapAdminCsrfToken();
      const currentUrls = colorImages[color] || [];
      const slot = currentUrls.filter(Boolean).length + 1;
      const bytes = await file.arrayBuffer();
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(identifier)}/image?slot=${slot}&color=${encodeURIComponent(color)}`,
        {
          method: "POST",
          body: bytes,
          headers: { "content-type": file.type, "x-csrf-token": csrfToken },
        }
      );
      if (!response.ok) throw new Error("Falha ao enviar imagem.");
      const payload = await response.json().catch(() => ({}));
      const uploadedUrl = String(payload?.image?.url || "").trim();
      if (!uploadedUrl) throw new Error("URL não retornada.");
      setColorImages((current) => ({
        ...current,
        [color]: [...(current[color] || []).filter(Boolean), uploadedUrl],
      }));
    } catch {
      // silencioso — usuário pode tentar novamente
    } finally {
      setUploadingColor(null);
    }
  }

  async function uploadImage(productId: string, slotIndex: number, file: File): Promise<string> {
    const csrfToken = await bootstrapAdminCsrfToken();
    const bytes = await file.arrayBuffer();
    const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/image?slot=${slotIndex + 1}`, {
      method: "POST",
      body: bytes,
      headers: {
        "content-type": file.type,
        "x-csrf-token": csrfToken,
      },
    });
    if (!response.ok) throw new Error("Falha ao enviar imagem.");
    const payload = await response.json().catch(() => ({}));
    const uploadedUrl = String(payload?.image?.url || "").trim();
    if (!uploadedUrl) throw new Error("Falha ao enviar imagem.");
    return uploadedUrl;
  }

  async function handleSave() {
    if (!product) return;
    if (hasErrors) {
      setError("Revise os campos obrigatórios.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const identifier = String(product.dbId || product.id || product.sku || "").trim();
      if (!identifier) throw new Error("Produto inválido.");

      const sizeLabels = checkedSizes;
      const normalizedColors = resolvedColors;
      const variantStock: Record<string, number> = {};

      variantRows.forEach((row) => {
        const stock = Math.max(0, Number(variantStockInput[row.key] || 0));
        variantStock[row.key] = stock;
      });

      const stockQty = Object.values(variantStock).reduce((sum, qty) => sum + Math.max(0, Number(qty || 0)), 0);

      // Deriva imageUrl e secondaryImage da primeira cor com fotos
      const cleanColorImages = Object.fromEntries(
        Object.entries(colorImages)
          .map(([color, urls]) => [color, urls.filter((u) => String(u || "").trim())])
          .filter(([, urls]) => (urls as string[]).length > 0)
      );
      const firstColorUrls = cleanColorImages[normalizedColors[0] ?? ""] ?? [];
      const derivedImageUrl = String(firstColorUrls[0] || product?.image || "").trim();
      const derivedSecondary = String(firstColorUrls[1] || "").trim();

      const saveResponse = await updateProductAdmin(identifier, {
        name: String(name || "").trim(),
        priceCents: parseMoneyToCents(price),
        stockQty,
        currency: String(currency || "BRL").trim().toUpperCase(),
        active,
        availabilityStatus,
        sizes: sizeLabels,
        colors: normalizedColors,
        variantStock,
        category: String(category || "").trim(),
        collection: String(collection || "").trim(),
        gender: String(gender || "Unissex").trim(),
        material: String(materialMain || "").trim(),
        imageUrl: derivedImageUrl,
        secondaryImage: derivedSecondary,
        galleryImages: firstColorUrls.slice(2),
        modelInfo: String(modelInfo || "").trim(),
        fitType: String(fitType || "").trim(),
        sizeRecommendation: String(sizeRecommendation || "").trim(),
        detailedModeling: String(detailedModeling || "").trim(),
        materialMain: String(materialMain || "").trim(),
        cleaningRecommendation: String(cleaningRecommendation || "").trim(),
        careList: careList.map((item) => String(item || "").trim()).filter(Boolean),
        colorImages: cleanColorImages,
      });

      const refreshed = await getProductAdmin(identifier);
      onSaved(refreshed || saveResponse.product);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao atualizar produto.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Editar Produto"
      subtitle="Personalizacao completa do catalogo"
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
          <h4 className={styles.sectionTitle}>Informacoes basicas</h4>
          <div className={form.row2}>
            <div className={form.field}>
              <label htmlFor="edit-product-sku" className={form.label}>
                SKU
              </label>
              <input id="edit-product-sku" className={`${form.input} ${validationErrors.sku ? styles.inputError : ""}`} value={sku} readOnly />
              {validationErrors.sku ? <p className={styles.fieldError}>{validationErrors.sku}</p> : null}
            </div>
            <div className={form.field}>
              <label htmlFor="edit-product-name" className={form.label}>
                Nome
              </label>
              <input
                id="edit-product-name"
                className={`${form.input} ${validationErrors.name ? styles.inputError : ""}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {validationErrors.name ? <p className={styles.fieldError}>{validationErrors.name}</p> : null}
            </div>
          </div>
          <div className={form.row2}>
            <div className={form.field}>
              <label htmlFor="edit-product-price" className={form.label}>
                Preco (R$)
              </label>
              <input
                id="edit-product-price"
                className={`${form.input} ${validationErrors.price ? styles.inputError : ""}`}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
              />
              {validationErrors.price ? <p className={styles.fieldError}>{validationErrors.price}</p> : null}
            </div>
            <div className={form.field}>
              <label htmlFor="edit-product-currency" className={form.label}>
                Moeda
              </label>
              <select id="edit-product-currency" className={form.select} value={currency} onChange={(event) => setCurrency(event.target.value)}>
                <option value="BRL">BRL</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Status e Estoque</h4>
          <div className={styles.switchRow}>
            <span className={styles.switchLabel}>Ativo / Inativo - quando inativo o produto não aparece no site.</span>
            <button
              type="button"
              className={`${styles.switchBtn} ${active ? styles.switchBtnOn : ""}`}
              onClick={() => setActive((value) => !value)}
              aria-label="Alternar status"
            />
          </div>

          <div className={form.field}>
            <label className={form.label}>Disponibilidade no site</label>
            <select className={form.select} value={availabilityStatus} onChange={(event) => setAvailabilityStatus(event.target.value as ProductAvailabilityStatus)}>
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.sizesList}>
            {sizes.map((size, index) => (
              <div key={size.label} className={styles.sizeRow}>
                <input
                  id={`size-${size.label}`}
                  type="checkbox"
                  checked={size.checked}
                  onChange={(event) => updateSizeChecked(index, event.target.checked)}
                />
                <label htmlFor={`size-${size.label}`} className={styles.sizeLabel}>
                  {size.label}
                </label>
              </div>
            ))}
          </div>
          {validationErrors.sizes ? <p className={styles.fieldError}>{validationErrors.sizes}</p> : null}
          {variantRows.length > 0 ? (
            <div className={styles.variantStockBlock}>
              <h5 className={styles.variantStockTitle}>Estoque por cor e tamanho</h5>
              <div className={form.variantGrid}>
                {variantRows.map((row) => (
                  <div key={row.key} className={form.variantRow}>
                    <span className={form.variantName}>{row.label}</span>
                    <input
                      className={form.variantInput}
                      type="number"
                      min={0}
                      value={String(variantStockInput[row.key] ?? 0)}
                      onChange={(event) => updateVariantStock(row.key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {validationErrors.variantStock ? <p className={styles.fieldError}>{validationErrors.variantStock}</p> : null}
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Cores</h4>
          <input
            className={form.input}
            value={colorInput}
            placeholder="Digite uma cor e pressione Enter"
            onChange={(event) => setColorInput(event.target.value)}
            onKeyDown={handleColorInputKeyDown}
          />
          <div className={styles.colorTags}>
            {colors.map((color, index) => {
              const colorHex = COLOR_MAP[normalizeText(color)] || "";
              return (
                <span key={`${color}-${index}`} className={styles.colorTag}>
                  {colorHex ? <span className={styles.colorDot} style={{ background: colorHex }} /> : null}
                  {color}
                  <button type="button" onClick={() => removeColor(index)} aria-label={`Remover ${color}`}>
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        </section>

        {colors.length > 0 && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>Fotos por cor</h4>
            <p className={styles.sectionHint}>Até 6 fotos por cor. Quando cadastradas, substituem as fotos gerais no card e na galeria do app.</p>
            {colors.map((color) => {
              const urls = colorImages[color] || [];
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
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <div className={styles.colorImageActions}>
                    {urls.length < 6 && (
                      <button type="button" className={styles.colorImageAdd} onClick={() => handleColorImageAdd(color)}>
                        + URL
                      </button>
                    )}
                    {urls.length < 6 && (
                      <label className={styles.colorImageUpload}>
                        {isUploading ? "Enviando..." : "↑ Upload"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleColorImageUpload(color, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Detalhes do produto</h4>
          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Modelo</label>
              <input className={form.input} value={modelInfo} onChange={(event) => setModelInfo(event.target.value)} />
            </div>
            <div className={form.field}>
              <label className={form.label}>Modelagem</label>
              <input className={form.input} value={fitType} onChange={(event) => setFitType(event.target.value)} />
            </div>
          </div>

          <div className={form.field}>
            <label className={form.label}>Recomendacao</label>
            <input className={form.input} value={sizeRecommendation} onChange={(event) => setSizeRecommendation(event.target.value)} />
          </div>

          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Categoria</label>
              <select className={form.select} value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Selecione</option>
                {resolvedCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className={form.field}>
              <label className={form.label}>Colecao</label>
              <select className={form.select} value={collection} onChange={(event) => setCollection(event.target.value)}>
                <option value="">Selecione</option>
                {resolvedCollectionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={form.row2}>
            <div className={form.field}>
              <label className={form.label}>Genero</label>
              <select className={form.select} value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="Masculino">Masculino</option>
                <option value="Feminino">Feminino</option>
                <option value="Unissex">Unissex</option>
              </select>
            </div>
            <div className={form.field}>
              <label className={form.label}>Codigo SKU</label>
              <input className={form.input} value={sku} readOnly />
            </div>
          </div>

          <div className={form.field}>
            <label className={form.label}>Modelagem detalhada</label>
            <textarea className={form.textarea} value={detailedModeling} onChange={(event) => setDetailedModeling(event.target.value)} />
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Materiais e cuidados</h4>
          <div className={form.field}>
            <label className={form.label}>Material principal</label>
            <input className={form.input} value={materialMain} onChange={(event) => setMaterialMain(event.target.value)} />
          </div>

          <div className={form.field}>
            <label className={form.label}>Recomendacao de limpeza</label>
            <textarea
              className={form.textarea}
              value={cleaningRecommendation}
              onChange={(event) => setCleaningRecommendation(event.target.value)}
            />
          </div>

          <div className={styles.careAddRow}>
            <input
              className={form.input}
              value={careInput}
              onChange={(event) => setCareInput(event.target.value)}
              placeholder="Digite um cuidado"
            />
            <button type="button" className={styles.careAddBtn} onClick={addCareItem}>
              + Adicionar
            </button>
          </div>

          <ul className={styles.careList}>
            {careList.map((care, index) => (
              <li key={`${care}-${index}`} className={styles.careItem}>
                <span>{care}</span>
                <button type="button" onClick={() => removeCare(index)} aria-label={`Remover ${care}`}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}
