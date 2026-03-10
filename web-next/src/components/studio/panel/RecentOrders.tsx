import type { RecentOrder } from "./types";
import styles from "./RecentOrders.module.css";

type RecentOrdersProps = {
  rows: RecentOrder[];
  onViewAll?: () => void;
};

export function RecentOrders({ rows, onViewAll }: RecentOrdersProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h3>PEDIDOS RECENTES</h3>
        <button type="button" className={styles.linkBtn} onClick={onViewAll}>
          Ver todos
        </button>
      </header>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Produto</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.cliente}</td>
              <td>{row.produto}</td>
              <td>{row.valor}</td>
              <td>
                <span className={`${styles.status} ${styles[`status${row.status}`]}`}>{row.status}</span>
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td className={styles.empty} colSpan={5}>
                Nenhum pedido recente encontrado.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
