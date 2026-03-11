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

      <section
        className={styles.kpiGrid}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 32,
          width: "100%",
          minWidth: 0,
        }}
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} label={kpi.label} value={kpi.value} delta={kpi.delta} tone={kpi.tone} />
        ))}
      </section>

      <section
        className={styles.lowerGrid}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <RecentOrders rows={recentOrders} onViewAll={onViewAllOrders} />
        <ActivityFeed items={activities} />
      </section>
    </div>
  );
}
