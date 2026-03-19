import type { Metadata } from "next";
import { BodyClassName } from "@/components/BodyClassName";
import { FaqPageSections } from "@/components/faq/FaqPageSections";
import { LegacyFooter } from "@/components/home-legacy/LegacyFooter";
import styles from "./page.module.css";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "FAQ",
  description: "Perguntas frequentes sobre pedidos, pagamentos, entregas e atendimento da Tsebi.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "FAQ | Tsebi Brasil",
    description: "Perguntas frequentes sobre pedidos, pagamentos, entregas e atendimento da Tsebi.",
    url: "/faq",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ | Tsebi Brasil",
    description: "Perguntas frequentes sobre pedidos, pagamentos, entregas e atendimento da Tsebi.",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "O que é a Tsebi?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A Tsebi é uma marca brasileira de moda com posicionamento de luxo contemporâneo. Desenvolvemos coleções com foco em forma, matéria-prima, acabamento e proporção, guiados pelo conceito: Forma, princípio e excelência.",
      },
    },
    {
      "@type": "Question",
      name: "A Tsebi tem loja física?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Não. A operação da Tsebi é exclusivamente online, com entregas para todo o Brasil. Esse formato concentra nossos esforços em produto, atendimento e experiência digital.",
      },
    },
    {
      "@type": "Question",
      name: "Como faço um pedido na Tsebi?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Acesse a página do produto, selecione tamanho e cor, adicione ao carrinho e prossiga para o checkout. Com a confirmação do pagamento, você recebe e-mail com o resumo da compra e número do pedido.",
      },
    },
    {
      "@type": "Question",
      name: "Posso cancelar ou alterar meu pedido?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim, em até 24 horas após a confirmação, desde que o pedido ainda não tenha sido despachado. Entre em contato imediatamente com nossa equipe para alteração de item, tamanho, endereço ou cancelamento.",
      },
    },
    {
      "@type": "Question",
      name: "A Tsebi entrega para todo o Brasil?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim. A Tsebi realiza entregas em todo o território nacional. Prazos e valores variam conforme CEP, modalidade escolhida e condições logísticas da região.",
      },
    },
    {
      "@type": "Question",
      name: "Qual o prazo de entrega?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "O prazo varia por região e modalidade de frete. A estimativa é exibida no checkout após inserir o CEP. Além do transporte, considere o tempo de preparação do pedido.",
      },
    },
    {
      "@type": "Question",
      name: "Como é calculado o frete?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "O frete é calculado automaticamente com base no CEP, peso total, dimensões do pacote e modalidade escolhida. O valor final aparece no checkout antes da confirmação do pagamento.",
      },
    },
    {
      "@type": "Question",
      name: "Qual o prazo para troca ou devolução?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "O prazo é de 7 dias corridos após o recebimento, conforme o Código de Defesa do Consumidor. Após o registro, você recebe por e-mail todas as instruções de continuidade.",
      },
    },
    {
      "@type": "Question",
      name: "Como solicito uma troca ou devolução?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Acesse Minha Conta > Meus Pedidos > Solicitar Troca/Devolução e informe o motivo da solicitação. Em seguida, enviamos orientações de postagem e prazos de análise.",
      },
    },
    {
      "@type": "Question",
      name: "Em quanto tempo recebo o reembolso?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Após aprovação da devolução, o reembolso é processado em até 5 dias úteis. Em compras no cartão, o crédito pode aparecer em até 2 faturas, conforme a administradora.",
      },
    },
    {
      "@type": "Question",
      name: "Quais formas de pagamento são aceitas?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Aceitamos cartão de crédito (Visa, Mastercard, American Express e Elo), cartão de débito e boleto bancário. Todas as transações são processadas em ambiente seguro.",
      },
    },
    {
      "@type": "Question",
      name: "O cartão aceita parcelamento?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim. O parcelamento sem juros está disponível conforme o valor do pedido: a partir de R$500 em até 3x, chegando a até 10x sem juros em compras acima de R$5.000.",
      },
    },
  ],
};

export default async function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <BodyClassName className="faq-page-body" />
      <main className={styles.page}>
        <FaqPageSections />
      </main>
      <LegacyFooter />
    </>
  );
}
