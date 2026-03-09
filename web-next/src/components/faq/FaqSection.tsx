"use client";

import { useMemo, useState } from "react";
import { Box, CreditCard, PenTool, RefreshCcw, Search, ShoppingBag, Tag, Truck } from "lucide-react";

const TOPICS = [
  { label: "Pedidos", icon: Box },
  { label: "Entregas", icon: Truck },
  { label: "Trocas e Devolucoes", icon: RefreshCcw },
  { label: "Pagamentos", icon: CreditCard },
  { label: "Produtos", icon: ShoppingBag },
  { label: "Cuidados das Pecas", icon: Tag },
  { label: "Servicos", icon: PenTool },
] as const;

const FAQ_ITEMS = [
  {
    question: "Quais as formas de pagamento?",
    answer: "Aceitamos cartao de credito, PIX e boleto, conforme disponibilidade no checkout.",
  },
  {
    question: "Como rastrear meu pedido?",
    answer: "Apos a expedicao, voce recebe o codigo de rastreio para acompanhar a entrega em tempo real.",
  },
  {
    question: "Quando meu pedido sera entregue?",
    answer: "O prazo varia por CEP e modalidade escolhida. A previsao aparece no checkout e no resumo do pedido.",
  },
  {
    question: "Como realizar ou cancelar um pedido?",
    answer: "Para ajustes ou cancelamento, fale com o atendimento o quanto antes com o numero do pedido.",
  },
  {
    question: "Como trocar ou devolver meu pedido?",
    answer: "A solicitacao deve ser feita dentro do prazo da politica vigente, com o produto em perfeito estado.",
  },
  {
    question: "Como cuidar das minhas pecas?",
    answer: "Siga as instrucoes da etiqueta e, em caso de duvida, consulte nosso time para orientacao de cuidado.",
  },
] as const;

export function FaqSection() {
  const [query, setQuery] = useState("");
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) => item.question.toLowerCase().includes(normalizedQuery));
  }, [query]);

  return (
    <section className="faq-section" id="perguntas-frequentes" aria-label="Perguntas frequentes">
      <div className="faq-inner">
        <label className="faq-searchWrap" htmlFor="faqSearchInput">
          <Search size={18} aria-hidden="true" />
          <input
            id="faqSearchInput"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Como podemos ajudar?"
            aria-label="Como podemos ajudar?"
          />
        </label>

        <div className="faq-columns">
          <article className="faq-panel">
            <h2 className="faq-panelTitle">TEMAS</h2>
            <div className="faq-topicGrid">
              {TOPICS.map((topic) => {
                const Icon = topic.icon;
                return (
                  <button key={topic.label} type="button" className="faq-topicCard">
                    <Icon size={24} strokeWidth={1.4} aria-hidden="true" />
                    <span>{topic.label}</span>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="faq-panel">
            <h2 className="faq-panelTitleNormal">Perguntas Frequentes</h2>
            <div className="faq-faqList">
              {filteredItems.map((item) => {
                const expanded = openQuestion === item.question;
                return (
                  <div key={item.question} className="faq-faqItem">
                    <button
                      type="button"
                      className="faq-faqQuestion"
                      onClick={() => setOpenQuestion(expanded ? null : item.question)}
                    >
                      {item.question}
                    </button>
                    {expanded ? <p className="faq-faqAnswer">{item.answer}</p> : null}
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </div>
      <style jsx>{`
        .faq-section {
          background: #f5f5f5;
          padding: 24px 0 74px;
        }

        .faq-inner {
          width: min(1300px, calc(100% - 48px));
          margin: 0 auto;
        }

        .faq-searchWrap {
          width: min(55%, 760px);
          min-height: 54px;
          border: 1px solid #cfcfcf;
          background: #fff;
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 0 14px;
        }

        .faq-searchWrap :global(svg) {
          color: #2a2a2a;
          flex: 0 0 auto;
        }

        .faq-searchWrap input {
          width: 100%;
          border: 0;
          background: transparent;
          outline: 0;
          color: #1a1a1a;
          font-size: 14px;
          font-weight: 300;
          font-family: inherit;
        }

        .faq-searchWrap input::placeholder {
          color: #999;
        }

        .faq-columns {
          margin-top: 26px;
          display: grid;
          grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr);
          gap: 24px;
        }

        .faq-panel {
          border: 1px solid #e0e0e0;
          background: #fff;
        }

        .faq-panelTitle {
          margin: 0;
          padding: 42px 34px 34px;
          font-size: 40px;
          letter-spacing: 0.08em;
          font-weight: 300;
          text-transform: uppercase;
          color: #111;
        }

        .faq-panelTitleNormal {
          margin: 0;
          padding: 42px 34px 34px;
          font-size: 44px;
          font-weight: 300;
          color: #111;
        }

        .faq-topicGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border-top: 1px solid #e0e0e0;
        }

        .faq-topicCard {
          min-height: 144px;
          border: 0;
          border-right: 1px solid #e0e0e0;
          border-bottom: 1px solid #e0e0e0;
          background: #fff;
          color: #191919;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          cursor: pointer;
          font-family: inherit;
          font-size: 16px;
          font-weight: 300;
          transition: background-color 0.2s ease;
        }

        .faq-topicCard:nth-child(3n) {
          border-right: 0;
        }

        .faq-topicCard:hover,
        .faq-topicCard:focus-visible {
          background: #f7f7f7;
        }

        .faq-faqList {
          border-top: 1px solid #e0e0e0;
          padding: 14px 34px 20px;
        }

        .faq-faqItem {
          padding: 14px 0;
        }

        .faq-faqQuestion {
          border: 0;
          background: transparent;
          padding: 0;
          margin: 0;
          color: #1d1d1d;
          text-decoration: underline;
          text-underline-offset: 2px;
          font-family: inherit;
          font-size: 15px;
          line-height: 1.45;
          font-weight: 300;
          cursor: pointer;
          text-align: left;
        }

        .faq-faqAnswer {
          margin: 10px 0 0;
          color: #3a3a3a;
          font-size: 14px;
          line-height: 1.55;
          font-weight: 300;
        }

        @media (max-width: 1080px) {
          .faq-inner {
            width: calc(100% - 24px);
          }

          .faq-searchWrap {
            width: 100%;
          }

          .faq-columns {
            grid-template-columns: 1fr;
          }

          .faq-panelTitle,
          .faq-panelTitleNormal {
            font-size: 30px;
            padding: 30px 20px 24px;
          }

          .faq-faqList {
            padding: 10px 20px 16px;
          }
        }
      `}</style>
    </section>
  );
}
