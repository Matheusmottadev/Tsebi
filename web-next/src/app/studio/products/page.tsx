import type { Metadata } from "next";
import Link from "next/link";
import { Price } from "@/components/Price";
import { StudioShell } from "@/components/studio/StudioShell";
import { readStudioSession } from "@/lib/studio/server";
import { listProductsAdmin } from "@/services/admin";
import styles from "./page.module.css";

export const revalidate = 0;

type StudioProductsPageProps = {
  searchParams?: Promise<{
    query?: string;
    status?: string;
    stock?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Studio Products",
  description: "Admin product list in Studio portal.",
  robots: {
    index: false,
    follow: false,
  },
};

function pickProductIdentifier(product: { dbId?: string | null; id?: string | null; sku?: string | null }): string {
  const candidates = [product?.dbId, product?.id, product?.sku];
  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const lowered = value.toLowerCase();
    if (lowered === "undefined" || lowered === "null") continue;
    return value;
  }
  return "";
}

export default async function StudioProductsPage({ searchParams }: StudioProductsPageProps) {
  const session = await readStudioSession("/studio/products");
  const resolvedSearchParams = await searchParams;
  const query = String(resolvedSearchParams?.query || "").trim();
  const status = String(resolvedSearchParams?.status || "").trim();
  const stock = String(resolvedSearchParams?.stock || "").trim();

  const result = await listProductsAdmin(
    {
      page: 1,
      pageSize: 100,
      query: query || undefined,
      status: status || undefined,
      stock: stock || undefined,
    },
    { cookie: session.cookie, cache: "no-store" }
  );

  return (
    <StudioShell admin={session.admin} title="Products" subtitle="Atualize catálogo sem mudar APIs admin.">
      <form className={styles.filters} method="get">
        <input type="search" name="query" defaultValue={query} placeholder="Buscar por SKU, nome" />
        <select name="status" defaultValue={status}>
          <option value="">Todos status</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
        </select>
        <select name="stock" defaultValue={stock}>
          <option value="">Todo estoque</option>
          <option value="in">in</option>
          <option value="out">out</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produto</th>
              <th>Preço</th>
              <th>Estoque</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((product, index) => {
              const productIdentifier = pickProductIdentifier(product);
              const rowKey = pickProductIdentifier(product) || `row-${index}`;
              return (
              <tr key={rowKey}>
                <td>{product.sku}</td>
                <td>{product.name}</td>
                <td>
                  <Price amountCents={product.unitAmount} currency={product.currency} />
                </td>
                <td>{product.stock}</td>
                <td>{product.active ? "active" : "inactive"}</td>
                <td>
                  {productIdentifier ? (
                    <Link href={`/studio/products/${encodeURIComponent(productIdentifier)}`}>Editar</Link>
                  ) : (
                    <span>-</span>
                  )}
                </td>
              </tr>
            )})}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Nenhum produto encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </StudioShell>
  );
}

