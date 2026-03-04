import type { Metadata } from "next";
import { readStudioSession } from "@/lib/studio/server";
import { StudioShell } from "@/components/studio/StudioShell";
import { listNewsletterAdmin, listVipAdmin } from "@/services/admin";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Studio WhatsApp",
  description: "Studio WhatsApp management.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioWhatsAppPage() {
  const session = await readStudioSession("/studio/whatsapp");
  const [vip, newsletter] = await Promise.all([
    listVipAdmin({ page: 1, pageSize: 8 }, { cookie: session.cookie, cache: "no-store" }).catch(() => ({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 8,
    })),
    listNewsletterAdmin({ page: 1, pageSize: 8 }, { cookie: session.cookie, cache: "no-store" }).catch(() => ({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 8,
    })),
  ]);

  return (
    <StudioShell admin={session.admin} title="WhatsApp" subtitle="Canal de disparos e contatos VIP.">
      <section className={styles.stats} aria-label="Resumo WhatsApp">
        <article className={styles.statCard}>
          <h3>Leads VIP</h3>
          <strong>{vip.total}</strong>
          <p>Inscritos na lista VIP prontos para contato.</p>
        </article>
        <article className={styles.statCard}>
          <h3>Newsletter</h3>
          <strong>{newsletter.total}</strong>
          <p>Base ativa para campanhas de WhatsApp.</p>
        </article>
      </section>

      <section className={styles.card}>
        <h3>Próximos passos</h3>
        <ul className={styles.checklist}>
          <li>Definir template oficial para contato inicial.</li>
          <li>Conectar provedor de WhatsApp no backend admin.</li>
          <li>Habilitar disparo por segmento (VIP e Newsletter).</li>
        </ul>
      </section>

      <section className={styles.card}>
        <h3>Últimos contatos capturados</h3>
        <div className={styles.listGrid}>
          <div>
            <h4>VIP</h4>
            <ul>
              {vip.rows.slice(0, 5).map((row) => (
                <li key={row.id}>
                  <span>{row.name || "Sem nome"}</span>
                  <small>{row.email || "-"}</small>
                </li>
              ))}
              {vip.rows.length === 0 ? <li className={styles.empty}>Sem dados.</li> : null}
            </ul>
          </div>
          <div>
            <h4>Newsletter</h4>
            <ul>
              {newsletter.rows.slice(0, 5).map((row) => (
                <li key={row.id}>
                  <span>{row.email || "Sem email"}</span>
                  <small>{row.phone || "-"}</small>
                </li>
              ))}
              {newsletter.rows.length === 0 ? <li className={styles.empty}>Sem dados.</li> : null}
            </ul>
          </div>
        </div>
      </section>
    </StudioShell>
  );
}
