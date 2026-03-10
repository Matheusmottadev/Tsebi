import { ACTIVITY_ITEMS, KPI_ITEMS, RECENT_ORDERS } from "../data";
import { ActivityFeed } from "../ActivityFeed";
import { KpiCard } from "../KpiCard";
import { RecentOrders } from "../RecentOrders";
import styles from "./InicioPage.module.css";

export function InicioPage() {
  return (
    <div>
      <section className={styles.kpiGrid}>
        {KPI_ITEMS.map((kpi) => (
          <KpiCard key={kpi.id} label={kpi.label} value={kpi.value} delta={kpi.delta} tone={kpi.tone} />
        ))}
      </section>

      <section className={styles.lowerGrid}>
        <RecentOrders rows={RECENT_ORDERS} />
        <ActivityFeed items={ACTIVITY_ITEMS} />
      </section>
    </div>
  );
}

