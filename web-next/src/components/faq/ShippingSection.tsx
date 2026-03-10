"use client";

import { ChevronLeft, RefreshCw, Truck } from "lucide-react";
import { useState } from "react";
import styles from "./ShippingSection.module.css";

type ShippingView = null | "entregas" | "devolucoes";

export function ShippingSection() {
  const [activeView, setActiveView] = useState<ShippingView>(null);

  return (
    <section className={styles.section} id="entrega-e-devolucoes" aria-label="Entrega e devoluções">
      <div className={styles.inner}>
        <h2 className={styles.title}>Entrega e devoluções</h2>

        <div className={styles.layout}>
          {activeView === null ? (
            <div className={styles.grid} role="group" aria-label="Ações de entrega e devolução">
              <button type="button" className={styles.cell} onClick={() => setActiveView("entregas")}>
                <Truck size={34} strokeWidth={1.5} aria-hidden="true" />
                <span>ENTREGAS</span>
              </button>

              <button type="button" className={styles.cell} onClick={() => setActiveView("devolucoes")}>
                <RefreshCw size={34} strokeWidth={1.5} aria-hidden="true" />
                <span>DEVOLUÇÕES</span>
              </button>
            </div>
          ) : (
            <article className={styles.content} aria-live="polite">
              <button type="button" className={styles.backButton} onClick={() => setActiveView(null)}>
                <ChevronLeft size={18} aria-hidden="true" />
                <span>Voltar</span>
              </button>

              {activeView === "entregas" ? (
                <div className={styles.infoContent}>
                  <h3 className={styles.infoTitle}>ENTREGAS</h3>
                  <p className={styles.infoText}>
                    A Tsebi realiza entregas para todo o Brasil. O prazo e o valor do frete são calculados no checkout
                    após inserir o CEP.
                  </p>
                  <ul className={styles.infoList}>
                    <li>O prazo estimado aparece antes de finalizar o pagamento</li>
                    <li>Você recebe atualizações de status por e-mail e pode acompanhar em Meus Pedidos</li>
                    <li>Endereço pode ser ajustado em até 24h, se o pedido ainda não tiver sido despachado</li>
                    <li>Em ausência no local, a transportadora pode realizar novas tentativas</li>
                    <li>Em casos específicos, a entrega pode ser redirecionada para ponto de retirada</li>
                  </ul>
                </div>
              ) : (
                <div className={styles.infoContent}>
                  <h3 className={styles.infoTitle}>DEVOLUÇÕES</h3>
                  <p className={styles.infoText}>
                    A Tsebi oferece solicitação de troca ou devolução em até 7 dias corridos após o recebimento.
                  </p>
                  <ul className={styles.infoList}>
                    <li>O item deve estar sem uso, com etiquetas originais e embalagem original</li>
                    <li>Em defeito de fabricação, a Tsebi cobre o frete de devolução</li>
                    <li>Trocas por preferência podem ter frete por conta do cliente</li>
                    <li>Reembolso ocorre em até 5 dias úteis após aprovação da conferência</li>
                    <li>No cartão, o estorno pode aparecer em até 2 faturas</li>
                  </ul>
                </div>
              )}
            </article>
          )}

          <aside className={styles.contactCard} aria-label="Contate-nos">
            <h3 className={styles.contactTitle}>CONTATE-NOS</h3>
            <div className={styles.contactBody}>
              <p>Entre em contato com o nosso Client Services.</p>
              <a href="/faq" className={styles.contactButton}>
                CONTATE-NOS
              </a>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
