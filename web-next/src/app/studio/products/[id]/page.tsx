import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Price } from "@/components/Price";
import { ProductEditorForm } from "@/components/studio/ProductEditorForm";
import { StudioShell } from "@/components/studio/StudioShell";
import { HttpError } from "@/lib/http";
import { readStudioSession } from "@/lib/studio/server";
import { getProductAdmin } from "@/services/admin";
import styles from "./page.module.css";

type StudioProductDetailPageProps = {
  params: {
    id: string;
  };
};

export const metadata: Metadata = {
  title: "Studio Product Detail",
  description: "Admin product details and update form in Studio portal.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioProductDetailPage({ params }: StudioProductDetailPageProps) {
  const productId = decodeURIComponent(params.id);
  const session = await readStudioSession(`/studio/products/${encodeURIComponent(productId)}`);
  let product;
  try {
    product = await getProductAdmin(productId, { cookie: session.cookie, cache: "no-store" });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  if (!product) {
    notFound();
  }

  const editProductId = String(product.dbId || product.id || "").trim() || productId;

  return (
    <StudioShell admin={session.admin} title={`Product ${product.sku}`} subtitle="Edição segura com CSRF obrigatório.">
      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.imageWrap}>
            {product.image ? (
              <Image src={product.image} alt={product.name} width={420} height={420} className={styles.image} />
            ) : (
              <div className={styles.imageFallback}>Sem imagem</div>
            )}
          </div>

          <div className={styles.meta}>
            <h3>{product.name}</h3>
            <p>SKU: {product.sku}</p>
            <p>Status: {product.active ? "active" : "inactive"}</p>
            <p>Estoque atual: {product.stock}</p>
            <p>
              Preço atual: <Price amountCents={product.unitAmount} currency={product.currency} />
            </p>
            <Link href={`/product/${encodeURIComponent(product.id)}`} target="_blank" rel="noreferrer">
              Abrir página pública do produto
            </Link>
          </div>
        </section>

        <section className={styles.card}>
          <h3>Editar produto</h3>
          <ProductEditorForm productId={editProductId} product={product} csrfToken={session.csrfToken} />
        </section>
      </div>
    </StudioShell>
  );
}

