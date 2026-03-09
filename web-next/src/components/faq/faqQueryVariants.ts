import { FAQ_CATEGORIES } from "./faqData";

const TARGET_TOTAL_VARIANTS = 1000;

export type FaqQueryVariantsMap = Record<string, string[]>;

function normalizeVariant(value: string): string {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function stripQuestionPrefix(value: string): string {
  const text = normalizeVariant(value).replace(/\?+$/, "");
  return text.replace(
    /^(como|qual|quais|o que|onde|quando|posso|vou|a tsebi|meus dados)\s+/i,
    ""
  );
}

function buildCandidates(question: string): string[] {
  const q = normalizeVariant(question).replace(/\?+$/, "");
  const core = stripQuestionPrefix(question);
  const candidates = [
    q,
    `${q}?`,
    core,
    `duvida sobre ${core}`,
    `tenho duvida sobre ${core}`,
    `preciso de ajuda com ${core}`,
    `me ajuda com ${core}`,
    `me explica ${core}`,
    `pode explicar ${core}`,
    `quero saber ${core}`,
    `informacoes sobre ${core}`,
    `detalhes sobre ${core}`,
    `faq ${core}`,
    `tsebi ${core}`,
    `como funciona ${core}`,
    `qual e o processo de ${core}`,
    `passo a passo de ${core}`,
    `resumo de ${core}`,
    `nao entendi ${core}`,
    `como resolver ${core}`,
    `orientacao sobre ${core}`,
    `suporte para ${core}`,
    `atendimento sobre ${core}`,
    `posso ${core}`,
    `tem como ${core}`,
    `em quanto tempo ${core}`,
    `qual o prazo de ${core}`,
    `quando chega ${core}`,
    `previsao de ${core}`,
    `status de ${core}`,
    `acompanhar ${core}`,
    `rastrear ${core}`,
    `trocar ${core}`,
    `devolver ${core}`,
    `cancelar ${core}`,
    `alterar ${core}`,
    `pagamento ${core}`,
    `parcelamento ${core}`,
    `cartao ${core}`,
    `boleto ${core}`,
    `entrega ${core}`,
    `frete ${core}`,
    `pedido ${core}`,
    `produto ${core}`,
    `cuidados com ${core}`,
    `servicos sobre ${core}`,
  ];
  return candidates.map(normalizeVariant).filter(Boolean);
}

function generateVariantsForQuestion(question: string, targetCount: number): string[] {
  const unique = new Set<string>();
  const baseCandidates = buildCandidates(question);
  baseCandidates.forEach((candidate) => unique.add(candidate));

  // Expansao deterministica para garantir cobertura e total alvo.
  let index = 1;
  const core = stripQuestionPrefix(question);
  while (unique.size < targetCount) {
    unique.add(`${core} tsebi ${index}`);
    if (unique.size >= targetCount) break;
    unique.add(`duvida ${index} sobre ${core}`);
    if (unique.size >= targetCount) break;
    unique.add(`quero entender ${core} ${index}`);
    index += 1;
  }

  return Array.from(unique).slice(0, targetCount);
}

function buildVariantMap(): FaqQueryVariantsMap {
  const questions = FAQ_CATEGORIES.flatMap((category) => category.questions);
  const totalQuestions = Math.max(1, questions.length);
  const baseCount = Math.floor(TARGET_TOTAL_VARIANTS / totalQuestions);
  const remainder = TARGET_TOTAL_VARIANTS % totalQuestions;

  const map: FaqQueryVariantsMap = {};
  questions.forEach((question, index) => {
    const perQuestionCount = baseCount + (index < remainder ? 1 : 0);
    map[question.id] = generateVariantsForQuestion(question.question, perQuestionCount);
  });

  return map;
}

export const FAQ_QUERY_VARIANTS_BY_QUESTION_ID: FaqQueryVariantsMap = buildVariantMap();

export const FAQ_QUERY_VARIANTS_TOTAL = Object.values(
  FAQ_QUERY_VARIANTS_BY_QUESTION_ID
).reduce((sum, list) => sum + list.length, 0);

