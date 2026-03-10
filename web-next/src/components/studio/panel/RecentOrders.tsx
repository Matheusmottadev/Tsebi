import type { RecentOrder } from "./types";
import styles from "./RecentOrders.module.css";

type RecentOrdersProps = {
  rows: RecentOrder[];
};

export function RecentOrders({ rows }: RecentOrdersProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h3>PEDIDOS RECENTES</h3>
        <button type="button" className={styles.linkBtn}>
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
        </tbody>
      </table>
    </section>
  );
}

