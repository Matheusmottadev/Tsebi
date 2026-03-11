import type { Metadata } from "next";
import { BodyClassName } from "@/components/BodyClassName";
import styles from "@/app/products/page.module.css";

export const revalidate = 3600;

type FilterLink = {
  href: string;
  label: string;
  color?: string;
};

const MAIN_CATEGORY_LINKS: FilterLink[] = [
  { href: "/products?n=e", label: "Todos" },
  { href: "/products?n=e&c=rtw", label: "Ready-to-Wear" },
  { href: "/products?n=e&c=ow", label: "Outerwear" },
  { href: "/products?n=e&c=le", label: "Leather" },
  { href: "/products?n=e&c=acc", label: "Accessories" },
];

const SORT_LINKS: FilterLink[] = [
  { href: "/products?n=e", label: "Ordenação" },
  { href: "/products?n=e&sort=best_sellers", label: "Mais vendidos" },
  { href: "/products?n=e&sort=newest", label: "Mais recentes" },
  { href: "/products?n=e&sort=price_asc", label: "Preço crescente" },
  { href: "/products?n=e&sort=price_desc", label: "Preço decrescente" },
];

const COLLECTION_LINKS: FilterLink[] = [
  { href: "/products?n=e&collection=Alicerce&fp=1", label: "Alicerce" },
  { href: "/products?n=e&collection=G%C3%AAnesis&fp=1", label: "Gênesis" },
];

const VISIBLE_COLOR_LINKS: FilterLink[] = [
  { href: "/products?n=e&co=Areia&fp=1", label: "Areia", color: "#d9d9d9" },
  { href: "/products?n=e&co=Azul&fp=1", label: "Azul", color: "#1f61d1" },
  { href: "/products?n=e&co=Bege&fp=1", label: "Bege", color: "#d2b48c" },
  { href: "/products?n=e&co=Branco&fp=1", label: "Branco", color: "#f5f5f5" },
];

const EXTRA_COLOR_LINKS: FilterLink[] = [
  { href: "/products?n=e&co=Caramelo&fp=1", label: "Caramelo", color: "#b56a3b" },
  { href: "/products?n=e&co=Cinza&fp=1", label: "Cinza", color: "#a8a8a8" },
  { href: "/products?n=e&co=Grafite&fp=1", label: "Grafite", color: "#d9d9d9" },
  { href: "/products?n=e&co=Marrom&fp=1", label: "Marrom", color: "#7a4b2a" },
  { href: "/products?n=e&co=Off+white&fp=1", label: "Off white", color: "#d9d9d9" },
  { href: "/products?n=e&co=Oliva&fp=1", label: "Oliva", color: "#5c6f3a" },
  { href: "/products?n=e&co=Preto&fp=1", label: "Preto", color: "#111111" },
  { href: "/products?n=e&co=Vinho&fp=1", label: "Vinho", color: "#722F37" },
];

const VISIBLE_MATERIAL_LINKS: FilterLink[] = [
  { href: "/products?n=e&mt=Algodao&fp=1", label: "Algodao" },
  { href: "/products?n=e&mt=Algod%C3%A3o+eg%C3%ADpcio&fp=1", label: "Algodão egípcio" },
  { href: "/products?n=e&mt=Couro&fp=1", label: "Couro" },
  { href: "/products?n=e&mt=Couro+envernizado&fp=1", label: "Couro envernizado" },
];

const EXTRA_MATERIAL_LINKS: FilterLink[] = [
  { href: "/products?n=e&mt=Couro+natural&fp=1", label: "Couro natural" },
  { href: "/products?n=e&mt=Denim&fp=1", label: "Denim" },
  { href: "/products?n=e&mt=Gabardine&fp=1", label: "Gabardine" },
  { href: "/products?n=e&mt=La+merino&fp=1", label: "La merino" },
  { href: "/products?n=e&mt=Linho&fp=1", label: "Linho" },
  { href: "/products?n=e&mt=Nylon&fp=1", label: "Nylon" },
  { href: "/products?n=e&mt=Nylon+t%C3%A9cnico&fp=1", label: "Nylon técnico" },
  { href: "/products?n=e&mt=Sarja&fp=1", label: "Sarja" },
];

const APPAREL_SIZES: FilterLink[] = [
  { href: "/products?n=e&sz=P&fp=1", label: "P" },
  { href: "/products?n=e&sz=M&fp=1", label: "M" },
  { href: "/products?n=e&sz=G&fp=1", label: "G" },
  { href: "/products?n=e&sz=GG&fp=1", label: "GG" },
];

const NUMERIC_SIZES: FilterLink[] = [
  { href: "/products?n=e&sz=35&fp=1", label: "35" },
  { href: "/products?n=e&sz=36&fp=1", label: "36" },
  { href: "/products?n=e&sz=37&fp=1", label: "37" },
  { href: "/products?n=e&sz=38&fp=1", label: "38" },
  { href: "/products?n=e&sz=39&fp=1", label: "39" },
  { href: "/products?n=e&sz=40&fp=1", label: "40" },
  { href: "/products?n=e&sz=41&fp=1", label: "41" },
  { href: "/products?n=e&sz=42&fp=1", label: "42" },
  { href: "/products?n=e&sz=44&fp=1", label: "44" },
  { href: "/products?n=e&sz=Unico&fp=1", label: "Unico" },
];

export const metadata: Metadata = {
  title: "Pagina em branco",
  robots: {
    index: false,
    follow: false,
  },
};

export default function BlankPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "#ffffff" }} aria-label="Pagina em branco">
      <BodyClassName className="products-novidades-view" />

      <section className={styles.novidadesToolbarSection} aria-label="Filtros de novidades">
        <div className={styles.novidadesToolbarInner}>
          <div className={styles.novidadesFiltersLeft}>
            <div className={styles.novidadesCategoriesRow}>
              {MAIN_CATEGORY_LINKS.map((link, index) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`${styles.novidadesMainCategoryLink} ${index === 0 ? styles.novidadesMainCategoryLinkActive : ""}`}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div className={styles.novidadesActionsRight}>
            <details className={styles.novidadesSortGroup}>
              <summary className={styles.novidadesSortToggle}>
                <span>Ordenação</span>
                <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.novidadesSortActionIcon}>
                  <path d="M8 6h8"></path>
                  <path d="M10 3l-2 3 2 3"></path>
                  <path d="M16 18H8"></path>
                  <path d="M14 15l2 3-2 3"></path>
                </svg>
              </summary>
              <div className={styles.novidadesSortMenu}>
                {SORT_LINKS.map((link, index) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className={`${styles.novidadesFilterItem} ${index === 0 ? styles.novidadesFilterItemActive : ""}`}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </details>
            <div className={styles.novidadesFiltersPopupGroup}>
              <input
                id="blank-novidades-filtros-toggle"
                type="checkbox"
                className={styles.novidadesFiltersPopupCheckbox}
                aria-label="Abrir filtros"
              />
              <label
                htmlFor="blank-novidades-filtros-toggle"
                className={`${styles.novidadesActionButton} ${styles.novidadesFiltersPopupToggle}`}
              >
                <span className={styles.novidadesFiltersLabel}>Filtros</span>
                <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.novidadesFilterActionIcon}>
                  <path d="M4 7h16"></path>
                  <circle cx="9" cy="7" r="1.8"></circle>
                  <path d="M4 12h16"></path>
                  <circle cx="15" cy="12" r="1.8"></circle>
                  <path d="M4 17h16"></path>
                  <circle cx="11.5" cy="17" r="1.8"></circle>
                </svg>
              </label>
              <div className={styles.novidadesFiltersPopupPanel} role="dialog" aria-label="Filtros">
                <a href="/products?n=e&fp=1" className={styles.novidadesFiltersClear}>
                  Limpar filtros
                </a>
                <label
                  htmlFor="blank-novidades-filtros-toggle"
                  className={styles.novidadesFiltersPopupClose}
                  aria-label="Fechar filtros"
                >
                  X
                </label>
                <div className={styles.novidadesFiltersPopupBody}>
                  <section className={styles.novidadesFiltersSection}>
                    <h3 className={styles.novidadesFiltersSectionTitle}>Coleção</h3>
                    <div className={styles.novidadesFiltersTwoColumns}>
                      {COLLECTION_LINKS.map((link) => (
                        <a key={link.href} href={link.href} className={styles.novidadesFiltersOption}>
                          <span className={styles.novidadesFiltersOptionLabel}>{link.label}</span>
                        </a>
                      ))}
                    </div>
                  </section>
                  <section className={styles.novidadesFiltersSection}>
                    <h3 className={styles.novidadesFiltersSectionTitle}>Cor</h3>
                    <div className={styles.novidadesFiltersExpandableBlock}>
                      <div className={styles.novidadesFiltersTwoColumns}>
                        {VISIBLE_COLOR_LINKS.map((link) => (
                          <a key={link.href} href={link.href} className={styles.novidadesFiltersOption}>
                            <span className={styles.novidadesFiltersColorDot} aria-hidden="true" style={{ backgroundColor: link.color }}></span>
                            <span className={styles.novidadesFiltersOptionLabel}>{link.label}</span>
                          </a>
                        ))}
                      </div>
                      <details className={styles.novidadesFiltersMoreGroup}>
                        <summary className={styles.novidadesFiltersMoreToggle}>
                          <span className={styles.novidadesFiltersMoreTextMore}>Exibir mais</span>
                          <span className={styles.novidadesFiltersMoreTextLess}>Exibir menos</span>
                        </summary>
                        <div className={`${styles.novidadesFiltersTwoColumns} ${styles.novidadesFiltersCollapsibleGrid}`}>
                          {EXTRA_COLOR_LINKS.map((link) => (
                            <a key={link.href} href={link.href} className={styles.novidadesFiltersOption}>
                              <span className={styles.novidadesFiltersColorDot} aria-hidden="true" style={{ backgroundColor: link.color }}></span>
                              <span className={styles.novidadesFiltersOptionLabel}>{link.label}</span>
                            </a>
                          ))}
                        </div>
                      </details>
                    </div>
                  </section>
                  <section className={styles.novidadesFiltersSection}>
                    <h3 className={styles.novidadesFiltersSectionTitle}>Material</h3>
                    <div className={styles.novidadesFiltersExpandableBlock}>
                      <div className={styles.novidadesFiltersTwoColumns}>
                        {VISIBLE_MATERIAL_LINKS.map((link) => (
                          <a key={link.href} href={link.href} className={styles.novidadesFiltersOption}>
                            <span className={styles.novidadesFiltersOptionLabel}>{link.label}</span>
                          </a>
                        ))}
                      </div>
                      <details className={styles.novidadesFiltersMoreGroup}>
                        <summary className={styles.novidadesFiltersMoreToggle}>
                          <span className={styles.novidadesFiltersMoreTextMore}>Exibir mais</span>
                          <span className={styles.novidadesFiltersMoreTextLess}>Exibir menos</span>
                        </summary>
                        <div className={`${styles.novidadesFiltersTwoColumns} ${styles.novidadesFiltersCollapsibleGrid}`}>
                          {EXTRA_MATERIAL_LINKS.map((link) => (
                            <a key={link.href} href={link.href} className={styles.novidadesFiltersOption}>
                              <span className={styles.novidadesFiltersOptionLabel}>{link.label}</span>
                            </a>
                          ))}
                        </div>
                      </details>
                    </div>
                  </section>
                  <section className={styles.novidadesFiltersSection}>
                    <h3 className={styles.novidadesFiltersSectionTitle}>Tamanho</h3>
                    <div className={styles.novidadesFiltersSizesWrap}>
                      {APPAREL_SIZES.map((link) => (
                        <a key={link.href} href={link.href} className={styles.novidadesFiltersSizeChip}>
                          {link.label}
                        </a>
                      ))}
                      <span className={styles.novidadesFiltersSizeDivider}>|</span>
                      {NUMERIC_SIZES.map((link) => (
                        <a key={link.href} href={link.href} className={styles.novidadesFiltersSizeChip}>
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          width: "100vw",
          minHeight: "100dvh",
          marginLeft: "calc(50% - 50vw)",
          marginTop: "calc(var(--top-bar-height, 38px) + var(--header-height, 84px) + var(--novidades-toolbar-height, 40px))",
          background: "#fff",
        }}
      />
    </main>
  );
}
