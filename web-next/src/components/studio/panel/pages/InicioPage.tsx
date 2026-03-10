import type { ActivityItem, KpiData, RecentOrder } from "../types";
import { ActivityFeed } from "../ActivityFeed";
import { KpiCard } from "../KpiCard";
import { RecentOrders } from "../RecentOrders";
import styles from "./InicioPage.module.css";

type InicioPageProps = {
  kpis: KpiData[];
  recentOrders: RecentOrder[];
  activities: ActivityItem[];
  loading: boolean;
  errorMessage: string;
  onViewAllOrders: () => void;
};

export function InicioPage({
  kpis,
  recentOrders,
  activities,
  loading,
  errorMessage,
  onViewAllOrders,
}: InicioPageProps) {
  return (
    <div>
      {errorMessage ? <p className={styles.warning}>{errorMessage}</p> : null}
      {loading ? <p className={styles.loading}>Carregando dados reais do painel...</p> : null}

      <section className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} label={kpi.label} value={kpi.value} delta={kpi.delta} tone={kpi.tone} />
        ))}
      </section>

      <section className={styles.lowerGrid}>
        <RecentOrders rows={recentOrders} onViewAll={onViewAllOrders} />
        <ActivityFeed items={activities} />
      </section>
    </div>
  );
}
