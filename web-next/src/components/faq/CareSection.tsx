"use client";

import { ChevronLeft, Heart, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { getMe } from "@/services/auth";
import styles from "./CareSection.module.css";

type CareView = null | "reparos" | "cuidados";

export function CareSection() {
  const [activeView, setActiveView] = useState<CareView>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const user = await getMe({ cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      setIsAuthenticated(Boolean(user));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.section} id="servicos-e-reparos" aria-label="Serviços e cuidados">
      <span id="servicos-de-cuidado" />
      <div className={styles.inner}>
        <h2 className={styles.title}>Serviços e cuidados</h2>
        <div className={styles.layout}>
          {activeView === null ? (
            <div className={styles.grid} role="group" aria-label="Ações de serviços e cuidados">
              <button type="button" className={styles.cell} onClick={() => setActiveView("reparos")}>
                <Wrench size={34} strokeWidth={1.5} aria-hidden="true" />
                <span>REPAROS</span>
              </button>

              <button type="button" className={styles.cell} onClick={() => setActiveView("cuidados")}>
                <Heart size={34} strokeWidth={1.5} aria-hidden="true" />
                <span>CUIDADOS</span>
              </button>
            </div>
          ) : (
            <article className={styles.content} aria-live="polite">
              <button type="button" className={styles.backButton} onClick={() => setActiveView(null)}>
                <ChevronLeft size={18} aria-hidden="true" />
                <span>Voltar</span>
              </button>
              {activeView === "reparos" ? (
                <div className={styles.careContent}>
                  <h3 className={styles.placeholder}>REPAROS</h3>
                  <p className={styles.careText}>
                    Todas as peças Tsebi passam por rigoroso controle de qualidade antes do envio. Em até 7 dias após o
                    recebimento, realizamos a troca da peça sem custo. Após esse prazo, oferecemos 1 ano de serviço de
                    reparos mediante avaliação prévia da nossa equipe.
                  </p>
                  <h4 className={styles.subTitle}>Casos atendidos pelo reparo:</h4>
                  <ul className={styles.careList}>
                    <li>Defeitos de costura ou acabamento</li>
                    <li>Problemas com zíperes, botões ou fechos</li>
                    <li>Desgaste natural do tecido em uso normal</li>
                    <li>Danos no forro ou estrutura interna da peça</li>
                    <li>Desfiamentos ou aberturas nas emendas</li>
                  </ul>

                  <h4 className={styles.subTitle}>Casos não atendidos:</h4>
                  <ul className={styles.careList}>
                    <li>Danos causados por mau uso ou negligência</li>
                    <li>Rasgos, manchas ou queimaduras por descuido</li>
                    <li>Danos causados por lavagem inadequada (contrário à etiqueta)</li>
                    <li>Alterações feitas por terceiros fora da Tsebi</li>
                    <li>Peças com sinais evidentes de uso excessivo fora do padrão normal</li>
                  </ul>
                </div>
              ) : (
                <div className={styles.careContent}>
                  <h3 className={styles.placeholder}>CUIDADOS</h3>
                  <p className={styles.careText}>
                    Para preservar a qualidade e o caimento das suas peças Tsebi por mais tempo, siga as orientações
                    abaixo de acordo com cada tipo de peça.
                  </p>
                  <ul className={styles.careList}>
                    <li>Lavar sempre de acordo com a etiqueta - prefira lavar à mão ou ciclo delicado</li>
                    <li>Lavar peças de cores escuras separadas das claras</li>
                    <li>Evitar secadora - secar à sombra em local arejado</li>
                    <li>Guardar em local seco, longe de luz solar direta</li>
                    <li>Peças de malha guardar dobradas, não penduradas</li>
                    <li>Passar com ferro na temperatura indicada - usar pano úmido em tecidos delicados</li>
                    <li>Não usar alvejantes ou produtos abrasivos</li>
                  </ul>
                </div>
              )}
            </article>
          )}

          <div className={styles.sideColumn}>
            <aside className={styles.contactCard} aria-label="Contate-nos">
              <h3 className={styles.contactTitle}>CONTATE-NOS</h3>
              <div className={styles.contactBody}>
                <p>Entre em contato com o nosso Client Services.</p>
                <a href="/faq" className={styles.contactButton}>
                  CONTATE-NOS
                </a>
              </div>
            </aside>

            {activeView === "reparos" ? (
              <aside className={styles.contactCard} aria-label={isAuthenticated ? "Ir para minha conta" : "Faça login"}>
                <h3 className={styles.contactTitle}>{isAuthenticated ? "Ir para minha conta" : "Faça Login"}</h3>
                <div className={styles.contactBody}>
                  <p>
                    {isAuthenticated
                      ? "Caso você precise agendar um reparo, agende agora mesmo uma avaliação na tela de conta."
                      : "Caso você precise agendar um reparo, efetue login e agende agora mesmo uma avaliação."}
                  </p>
                  <a href={isAuthenticated ? "/account" : "/login"} className={styles.contactButton}>
                    {isAuthenticated ? "AGENDAR" : "FAZER LOGIN"}
                  </a>
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
