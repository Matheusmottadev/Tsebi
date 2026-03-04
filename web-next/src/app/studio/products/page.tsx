import type { Metadata } from "next";
import Link from "next/link";
import { Price } from "@/components/Price";
import { StudioShell } from "@/components/studio/StudioShell";
import { readStudioSession } from "@/lib/studio/server";
import { listProductsAdmin } from "@/services/admin";
import styles from "./page.module.css";

type StudioProductsPageProps = {
  searchParams?: {
    query?: string;
    status?: string;
    stock?: string;
  };
};

export const metadata: Metadata = {
  title: "Studio Products",
  description: "Admin product list in Studio portal.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioProductsPage({ searchParams }: StudioProductsPageProps) {
  const session = await readStudioSession("/studio/products");
  const query = String(searchParams?.query || "").trim();
  const status = String(searchParams?.status || "").trim();
  const stock = String(searchParams?.stock || "").trim();

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
            {result.rows.map((product) => (
              <tr key={product.id}>
                <td>{product.sku}</td>
                <td>{product.name}</td>
                <td>
                  <Price amountCents={product.unitAmount} currency={product.currency} />
                </td>
                <td>{product.stock}</td>
                <td>{product.active ? "active" : "inactive"}</td>
                <td>
                  <Link href={`/studio/products/${encodeURIComponent(product.id)}`}>Editar</Link>
                </td>
              </tr>
            ))}
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

