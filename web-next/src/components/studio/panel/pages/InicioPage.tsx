import { Search } from "lucide-react";
import type { ActivityItem, GlobalSearchTarget, KpiData, RecentOrder } from "../types";
import { ActivityFeed } from "../ActivityFeed";
import { KpiCard } from "../KpiCard";
import { RecentOrders } from "../RecentOrders";
import styles from "./InicioPage.module.css";

type InicioSearchResult = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  target: GlobalSearchTarget;
};

type InicioSearchGroup = {
  label: string;
  items: InicioSearchResult[];
};

type InicioPageProps = {
  kpis: KpiData[];
  recentOrders: RecentOrder[];
  activities: ActivityItem[];
  loading: boolean;
  errorMessage: string;
  searchQuery: string;
  searchLoading: boolean;
  searchGroups: InicioSearchGroup[];
  onSearchQueryChange: (value: string) => void;
  onSearchSelect: (target: GlobalSearchTarget) => void;
  onViewAllOrders: () => void;
};

export function InicioPage({
  kpis,
  recentOrders,
  activities,
  loading,
  errorMessage,
  searchQuery,
  searchLoading,
  searchGroups,
  onSearchQueryChange,
  onSearchSelect,
  onViewAllOrders,
}: InicioPageProps) {
  const hasSearchQuery = String(searchQuery || "").trim().length >= 2;
  const hasResults = searchGroups.some((group) => group.items.length > 0);

  return (
    <div>
      {errorMessage ? <p className={styles.warning}>{errorMessage}</p> : null}
      {loading ? <p className={styles.loading}>Carregando dados reais do painel...</p> : null}

      <section className={styles.searchCard}>
        <div className={styles.searchHeader}>
          <div>
            <p className={styles.searchEyebrow}>Busca Global</p>
            <h2 className={styles.searchTitle}>Encontre qualquer informação do admin</h2>
            <p className={styles.searchDescription}>
              Pesquise pedido, cliente, nota fiscal, gift card, admin ou solicitação de saldo sem sair da tela inicial.
            </p>
          </div>
        </div>

        <div className={styles.searchInputWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            className={styles.searchInput}
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Buscar pedido, cliente, nota, gift card, admin ou solicitação..."
          />
        </div>

        {hasSearchQuery ? (
          <div className={styles.searchResults}>
            {searchLoading ? <p className={styles.searchEmpty}>Buscando em todo o admin...</p> : null}
            {!searchLoading && hasResults
              ? searchGroups.map((group) => (
                  <section key={group.label} className={styles.resultGroup}>
                    <p className={styles.resultGroupLabel}>{group.label}</p>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.resultItem}
                        onClick={() => onSearchSelect(item.target)}
                      >
                        <span className={styles.resultItemContent}>
                          <strong className={styles.resultItemMain}>{item.title}</strong>
                          <small className={styles.resultItemSub}>{item.subtitle}</small>
                        </span>
                        <span className={styles.resultItemMeta}>{item.meta}</span>
                      </button>
                    ))}
                  </section>
                ))
              : null}
            {!searchLoading && !hasResults ? (
              <p className={styles.searchEmpty}>Nenhum resultado encontrado para essa busca.</p>
            ) : null}
          </div>
        ) : (
          <p className={styles.searchHint}>Digite pelo menos 2 caracteres para começar.</p>
        )}
      </section>

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
