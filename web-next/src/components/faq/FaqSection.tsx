"use client";

import { ChevronLeft, Search } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { FAQ_CATEGORIES, featuredQuestions, flattenQuestions } from "./faqData";
import { FAQ_QUERY_VARIANTS_BY_QUESTION_ID } from "./faqQueryVariants";
import styles from "./FaqSection.module.css";

function normalizeForSearch(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSearchRoots(token: string): string[] {
  const base = normalizeForSearch(token);
  if (!base) return [];
  const roots = new Set<string>([base]);
  if (base.length >= 6) roots.add(base.slice(0, 6));
  if (base.length >= 5) roots.add(base.slice(0, 5));
  if (base.endsWith("s") && base.length > 4) roots.add(base.slice(0, -1));
  return Array.from(roots);
}

function buildNgrams(text: string, size = 3): Set<string> {
  const source = normalizeForSearch(text).replace(/\s+/g, " ");
  const grams = new Set<string>();
  if (!source) return grams;
  if (source.length <= size) {
    grams.add(source);
    return grams;
  }
  for (let index = 0; index <= source.length - size; index += 1) {
    grams.add(source.slice(index, index + size));
  }
  return grams;
}

function diceSimilarity(left: string, right: string): number {
  const leftGrams = buildNgrams(left);
  const rightGrams = buildNgrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0;
  let intersection = 0;
  leftGrams.forEach((gram) => {
    if (rightGrams.has(gram)) intersection += 1;
  });
  return (2 * intersection) / (leftGrams.size + rightGrams.size);
}

const SEARCH_STOPWORDS = new Set([
  "a",
  "o",
  "e",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "para",
  "por",
  "com",
  "sem",
  "meu",
  "minha",
  "meus",
  "minhas",
  "quando",
  "como",
  "qual",
  "quais",
]);

const SEARCH_SYNONYMS: Record<string, string[]> = {
  chega: ["entrega", "entregue", "prazo", "rastreio"],
  entregar: ["entrega", "entregue", "prazo", "frete"],
  entrega: ["entregue", "prazo", "frete", "rastreio"],
  pedido: ["compra", "rastreio", "entrega"],
  rastrear: ["rastreio", "acompanhar", "status"],
  acompanhar: ["rastreio", "status", "pedido"],
  trocar: ["troca", "devolucao"],
  devolver: ["devolucao", "troca"],
  pagamento: ["pagar", "cartao", "boleto", "parcelamento"],
  parcelar: ["parcelamento", "parcela"],
  chat: ["atendimento", "suporte"],
};

const FAQ_SEARCH_STORAGE_KEY = "tsebi_faq_search_query_v1";

function tokenizeSearchQuery(query: string): string[] {
  const tokens = normalizeForSearch(query)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !SEARCH_STOPWORDS.has(token));

  const expanded = new Set<string>();
  tokens.forEach((token) => {
    expanded.add(token);
    toSearchRoots(token).forEach((root) => expanded.add(root));
    (SEARCH_SYNONYMS[token] || []).forEach((synonym) => {
      const normalizedSynonym = normalizeForSearch(synonym);
      if (!normalizedSynonym) return;
      expanded.add(normalizedSynonym);
      toSearchRoots(normalizedSynonym).forEach((root) => expanded.add(root));
    });
  });

  return Array.from(expanded);
}

function getSmartSearchScore(params: { query: string; questionText: string; answerText: string; categoryText: string }): number {
  const query = normalizeForSearch(params.query);
  if (!query) return 0;

  const questionText = normalizeForSearch(params.questionText);
  const answerText = normalizeForSearch(params.answerText);
  const categoryText = normalizeForSearch(params.categoryText);
  const combined = [questionText, answerText, categoryText].join(" ");

  const baseTokens = query
    .split(" ")
    .filter(Boolean)
    .filter((token) => !SEARCH_STOPWORDS.has(token))
    .flatMap((token) => toSearchRoots(token));
  const expandedTokens = tokenizeSearchQuery(query);

  let score = 0;

  if (questionText.includes(query)) score += 140;
  else if (combined.includes(query)) score += 80;

  score += diceSimilarity(query, questionText) * 100;
  score += diceSimilarity(query, combined) * 40;

  if (baseTokens.length > 0) {
    const matchedBase = baseTokens.filter((token) => questionText.includes(token) || answerText.includes(token));
    const coverage = matchedBase.length / baseTokens.length;
    score += coverage * 70;
  }

  const expandedMatches = expandedTokens.filter((token) => combined.includes(token)).length;
  score += Math.min(25, expandedMatches * 2);

  return score;
}

export function FaqSection() {
  const allQuestions = useMemo(() => flattenQuestions(FAQ_CATEGORIES), []);

  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = window.sessionStorage.getItem(FAQ_SEARCH_STORAGE_KEY);
    if (!persisted) return;
    setSearchValue(persisted);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(FAQ_SEARCH_STORAGE_KEY, searchValue);
  }, [searchValue]);

  const selectedQuestion = useMemo(() => {
    if (!selectedQuestionId) return null;
    return allQuestions.find((question) => question.id === selectedQuestionId) || null;
  }, [allQuestions, selectedQuestionId]);

  const visibleQuestions = useMemo(() => {
    const featuredBase = activeTopicId
      ? allQuestions.filter((question) => question.categoryId === activeTopicId)
      : (() => {
          const featuredSet = new Set<string>(featuredQuestions as readonly string[]);
          const featuredOrdered = featuredQuestions
            .map((featured) => allQuestions.find((question) => question.question === featured))
            .filter((question): question is (typeof allQuestions)[number] => Boolean(question));
          const remaining = allQuestions.filter((question) => !featuredSet.has(question.question));
          return [...featuredOrdered, ...remaining].slice(0, 11);
        })();

    const query = searchValue.trim();
    if (!query) return featuredBase;

    // Busca global com ranking forte por frase e variacoes derivadas por questionId.
    const scored = allQuestions
      .map((question) => {
        const category = FAQ_CATEGORIES.find((entry) => entry.id === question.categoryId);
        const baseScore = getSmartSearchScore({
          query,
          questionText: question.question,
          answerText: (question.answer || []).join(" "),
          categoryText: [question.categoryName, category?.name || ""].join(" "),
        });
        const variants = FAQ_QUERY_VARIANTS_BY_QUESTION_ID[question.id] || [];
        const variantScore = variants.reduce((best, variant) => {
          const score = getSmartSearchScore({
            query,
            questionText: variant,
            answerText: "",
            categoryText: [question.categoryName, category?.name || ""].join(" "),
          });
          return Math.max(best, score);
        }, 0);

        return { question, score: baseScore + variantScore * 0.9 };
      })
      .sort((a, b) => b.score - a.score);

    const positive = scored.filter((entry) => entry.score >= 22).slice(0, 6);
    if (positive.length >= 6) return positive.map((entry) => entry.question);
    return scored.slice(0, 6).map((entry) => entry.question);
  }, [activeTopicId, allQuestions, searchValue]);

  const handleTopicClick = (topicId: string) => {
    setActiveTopicId((current) => (current === topicId ? null : topicId));
    setSelectedQuestionId(null);
    setSearchValue("");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(FAQ_SEARCH_STORAGE_KEY);
    }
  };

  const handleQuestionClick = (questionId: string) => {
    const question = allQuestions.find((item) => item.id === questionId);
    if (!question) return;
    setActiveTopicId(question.categoryId);
    setSelectedQuestionId(question.id);
  };

  const handleBackToGrid = () => {
    setSelectedQuestionId(null);
  };

  const renderAnswerContent = (answer: string[]) => {
    const nodes: ReactNode[] = [];
    let bulletItems: string[] = [];

    const flushBullets = () => {
      if (bulletItems.length === 0) return;
      nodes.push(
        <ul key={`answer-list-${nodes.length}`} className={styles.answerList}>
          {bulletItems.map((item) => (
            <li key={item} className={styles.answerListItem}>
              {item}
            </li>
          ))}
        </ul>
      );
      bulletItems = [];
    };

    answer.forEach((line, index) => {
      const trimmed = String(line || "").trim();
      const isBullet = /^[-•]\s+/.test(trimmed);
      if (isBullet) {
        bulletItems.push(trimmed.replace(/^[-•]\s+/, ""));
        return;
      }
      flushBullets();
      nodes.push(<p key={`answer-p-${index}`}>{line}</p>);
    });

    flushBullets();
    return nodes;
  };

  return (
    <section className={styles.section} id="perguntas-frequentes" aria-label="Perguntas frequentes">
      <div className={styles.inner}>
        <label className={styles.searchWrap} htmlFor="faqSearchInput">
          <Search size={18} aria-hidden="true" />
          <input
            id="faqSearchInput"
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Como podemos ajudar?"
            aria-label="Como podemos ajudar?"
          />
        </label>

        <div className={styles.columns}>
          <article className={styles.panel}>
            {selectedQuestion ? (
              <>
                <button type="button" className={styles.backButton} onClick={handleBackToGrid}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  <span>Voltar</span>
                </button>
                <h2 className={styles.panelTitleNormal}>{selectedQuestion.question}</h2>
                <div className={styles.answerContent}>
                  {renderAnswerContent(selectedQuestion.answer)}
                </div>
              </>
            ) : (
              <>
                <h2 className={styles.panelTitle}>TEMAS</h2>
                <div className={styles.topicGrid}>
                {FAQ_CATEGORIES.map((topic) => {
                  const active = activeTopicId === topic.id;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      className={`${styles.topicCard} ${active ? styles.topicCardActive : ""}`}
                      onClick={() => handleTopicClick(topic.id)}
                    >
                      {topic.icon === "gazela" ? (
                        <img className={styles.topicLogoIcon} src="/images/logo-tsebi.png" alt="" aria-hidden="true" />
                      ) : (
                        <topic.icon size={24} strokeWidth={1.4} aria-hidden="true" />
                      )}
                      <span>{topic.name}</span>
                    </button>
                  );
                })}
                </div>
              </>
            )}
          </article>

          <article className={styles.panel}>
            <h2 className={styles.panelTitleNormal}>Perguntas Frequentes</h2>
            <div className={styles.faqList}>
              {visibleQuestions.map((item) => {
                const selected = selectedQuestionId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.faqQuestion} ${selected ? styles.faqQuestionActive : ""}`}
                    onClick={() => handleQuestionClick(item.id)}
                  >
                    {item.question}
                  </button>
                );
              })}
              {visibleQuestions.length === 0 ? <p className={styles.emptyState}>Nenhuma pergunta encontrada.</p> : null}
            </div>
          </article>
        </div>

        <section className={styles.contactBlock} aria-label="Contate-nos">
          <h3 className={styles.contactTitle}>NÃO ENCONTROU O QUE PROCURAVA? NOSSA EQUIPE ESTÁ PRONTA PARA TE ATENDER.</h3>
          <p className={styles.contactText}>Se preferir, fale com nossos consultores e receba orientação personalizada sobre pedidos, prazos, produtos e serviços.</p>
          <div className={styles.contactActions}>
            <a href="/faq" className={styles.contactButton}>
              PRECISA DE AJUDA?
            </a>
            <a href="mailto:contato@tsebi.com.br" className={styles.contactButton}>
              ENVIE SUA PERGUNTA
            </a>
          </div>
        </section>
      </div>
    </section>
  );
}


