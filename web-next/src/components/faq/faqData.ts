import {
  CreditCard,
  Gift,
  Package,
  type LucideIcon,
  RefreshCw,
  ShoppingBag,
  Tag,
  Truck,
  Wrench,
} from "lucide-react";

export type FaqQuestion = {
  id: string;
  question: string;
  answer: string[];
  relatedIds?: string[];
};

export type FaqCategory = {
  id: string;
  name: string;
  icon: LucideIcon | "gazela";
  questions: FaqQuestion[];
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "informacoes-da-tsebi",
    name: "Informações da Tsebi",
    icon: "gazela",
    questions: [
      {
        id: "o-que-e-a-tsebi",
        question: "O que é a Tsebi?",
        answer: [
          "A Tsebi é uma marca brasileira de moda com posicionamento de luxo contemporâneo. Desenvolvemos coleções com foco em forma, matéria-prima, acabamento e proporção.",
          "Nossa direção criativa dialoga com referências internacionais e é guiada pelo conceito da marca: Forma, princípio e excelência.",
          "Em cada lançamento, priorizamos peças versáteis, elegantes e com padrão elevado de construção.",
        ],
      },
      {
        id: "onde-a-tsebi-esta-localizada",
        question: "Onde a Tsebi está localizada?",
        answer: [
          "A Tsebi é uma marca digital e opera exclusivamente pelo e-commerce. Toda a experiência, da compra ao pós-venda, acontece em ambiente online.",
          "Esse modelo permite atendimento nacional, comunicação centralizada e atualização frequente de coleções.",
          "Com isso, garantimos uma jornada prática, consistente e alinhada ao padrão da marca.",
        ],
      },
      {
        id: "como-entro-em-contato-com-a-tsebi",
        question: "Como entro em contato com a Tsebi?",
        answer: [
          "Oferecemos atendimento via:",
          "-> WhatsApp",
          "-> Direct",
          "-> e-mail",
          "-> formulário de contato.",
          "Atendimento privativo com um especialista Tsebi por mensagem, ligação ou video chamada.",
          "Nossos canais dão suporte a dúvidas sobre produtos, pedidos, entregas, trocas e orientações gerais de compra.",
          "O prazo de resposta é de até 24 horas úteis, com acompanhamento até a conclusão da solicitação.",
        ],
      },
      {
        id: "a-tsebi-tem-loja-fisica",
        question: "A Tsebi tem loja física?",
        answer: [
          "Não. A operação da Tsebi é exclusivamente online, com entregas para todo o Brasil.",
          "Esse formato concentra nossos esforços em produto, atendimento e experiência digital.",
          "Sempre que houver novidades de canais de venda, comunicaremos oficialmente em nossos canais.",
        ],
      },
      {
        id: "como-fico-sabendo-dos-lancamentos",
        question: "Como fico sabendo dos lançamentos?",
        answer: [
          "A forma mais rápida é se cadastrar na newsletter da Tsebi e acompanhar nossas redes oficiais.",
          "Por esses canais, divulgamos lançamentos, reposições e edições especiais com antecedência.",
          "Para itens de alta procura, manter notificações ativas aumenta sua chance de compra no timing ideal.",
        ],
      },
    ],
  },
  {
    id: "pedidos",
    name: "Pedidos",
    icon: Package,
    questions: [
      {
        id: "como-faco-um-pedido-na-tsebi",
        question: "Como faço um pedido na Tsebi?",
        answer: [
          "Acesse a página do produto, selecione tamanho e cor, adicione ao carrinho e prossiga para o checkout.",
          "Antes de concluir, revise endereço, contato e forma de pagamento para evitar ajustes posteriores.",
          "Com a confirmação do pagamento, você recebe e-mail com o resumo da compra e número do pedido.",
        ],
      },
      {
        id: "posso-cancelar-ou-alterar-meu-pedido",
        question: "Posso cancelar ou alterar meu pedido?",
        answer: [
          "Sim, em até 24 horas após a confirmação, desde que o pedido ainda não tenha sido despachado.",
          "Para alteração de item, tamanho, endereço ou cancelamento, entre em contato imediatamente com nossa equipe.",
          "Solicitações feitas com rapidez têm maior chance de ajuste sem impacto no prazo final.",
        ],
      },
      {
        id: "como-acompanho-meu-pedido",
        question: "Como acompanho meu pedido?",
        answer: [
          "Você pode acompanhar em Minha Conta > Meus Pedidos, com atualização de status em cada etapa.",
          "Após o envio, o rastreio é disponibilizado para acompanhamento da rota de entrega.",
          "Caso exista qualquer divergência, nosso atendimento valida manualmente e orienta o próximo passo.",
        ],
      },
      {
        id: "vou-receber-confirmacao-do-meu-pedido",
        question: "Vou receber confirmação do meu pedido?",
        answer: [
          "Sim. Assim que o pedido é aprovado, enviamos um e-mail com resumo da compra, número do pedido e status inicial.",
          "Durante o fluxo logístico, você pode receber novas mensagens de atualização sobre preparação e envio.",
          "Se não encontrar o e-mail, verifique spam, promoções e lixeira. Se necessário, nossa equipe confirma os dados do pedido com você.",
        ],
      },
      {
        id: "o-que-faco-se-meu-pedido-nao-chegar-no-prazo",
        question: "O que faço se meu pedido não chegar no prazo?",
        answer: [
          "Entre em contato com nosso atendimento informando o número do pedido para análise imediata.",
          "Fazemos a verificação completa com a transportadora e retornamos em até 24 horas úteis com posicionamento atualizado.",
          "Quando necessário, abrimos tratativa prioritária até a conclusão da entrega.",
        ],
      },
    ],
  },
  {
    id: "entregas",
    name: "Entregas",
    icon: Truck,
    questions: [
      {
        id: "a-tsebi-entrega-para-todo-o-brasil",
        question: "A Tsebi entrega para todo o Brasil?",
        answer: [
          "Sim. A Tsebi realiza entregas em todo o território nacional.",
          "Prazos e valores variam conforme CEP, modalidade escolhida e condições logísticas da região.",
          "No checkout, você visualiza com clareza as opções disponíveis para o seu endereço.",
        ],
      },
      {
        id: "qual-o-prazo-de-entrega",
        question: "Qual o prazo de entrega?",
        answer: [
          "O prazo varia por região e modalidade de frete. A estimativa é exibida no checkout após inserir o CEP.",
          "Além do transporte, considere o tempo de preparação do pedido, que pode variar conforme volume operacional.",
          "Em períodos promocionais, feriados ou eventos climáticos, o prazo pode sofrer ajuste.",
          "Sempre que desejar, nosso time pode orientar a melhor opção de envio antes da finalização da compra.",
        ],
      },
      {
        id: "como-e-calculado-o-frete",
        question: "Como é calculado o frete?",
        answer: [
          "O frete é calculado automaticamente com base no CEP, peso total, dimensões do pacote e modalidade escolhida.",
          "O valor final aparece no checkout antes da confirmação do pagamento, com transparência total.",
          "Em campanhas específicas, condições promocionais de frete podem ser aplicadas conforme regras vigentes.",
        ],
      },
      {
        id: "posso-alterar-o-endereco-apos-o-pedido",
        question: "Posso alterar o endereço após o pedido?",
        answer: [
          "Sim, em até 24 horas após a confirmação, desde que o pedido não tenha sido despachado.",
          "Após o envio, alterações dependem da política da transportadora e da etapa logística em curso.",
          "Para aumentar a chance de ajuste, informe rapidamente o endereço completo e telefone atualizado.",
        ],
      },
      {
        id: "o-que-acontece-se-eu-nao-estiver-em-casa",
        question: "O que acontece se eu não estiver em casa?",
        answer: [
          "A transportadora realiza novas tentativas de entrega conforme o procedimento da rota.",
          "Em alguns casos, o pedido pode ser direcionado para ponto de retirada ou retornar ao centro logístico.",
          "Se houver ocorrência, nosso atendimento acompanha o caso e indica a melhor solução para conclusão da entrega.",
        ],
      },
    ],
  },
  {
    id: "trocas-e-devolucoes",
    name: "Trocas e Devoluções",
    icon: RefreshCw,
    questions: [
      {
        id: "qual-o-prazo-para-troca-ou-devolucao",
        question: "Qual o prazo para troca ou devolução?",
        answer: [
          "O prazo é de 7 dias corridos após o recebimento, conforme o Código de Defesa do Consumidor.",
          "Recomendamos abrir a solicitação o quanto antes para agilizar conferência e tratativa.",
          "Após o registro, você recebe por e-mail todas as instruções de continuidade.",
        ],
      },
      {
        id: "como-solicito-uma-troca-ou-devolucao",
        question: "Como solicito uma troca ou devolução?",
        answer: [
          "Acesse Minha Conta > Meus Pedidos > Solicitar Troca/Devolução e informe o motivo da solicitação.",
          "Em seguida, enviamos orientações de postagem e prazos de análise.",
          "Se precisar, nosso atendimento também pode conduzir o processo de forma assistida.",
        ],
      },
      {
        id: "em-qual-condicao-o-produto-precisa-estar",
        question: "Em qual condição o produto precisa estar?",
        answer: [
          "O produto deve estar sem uso, com etiquetas originais e na embalagem original, incluindo acessórios enviados.",
          "Itens com sinais de uso, alteração ou ausência de componentes podem ser recusados na conferência.",
          "Esse critério preserva controle de qualidade e segurança para toda a operação.",
        ],
      },
      {
        id: "quem-paga-o-frete-da-devolucao",
        question: "Quem paga o frete da devolução?",
        answer: [
          "Em caso de defeito de fabricação ou divergência de envio, a Tsebi cobre o frete de devolução.",
          "Em trocas por preferência pessoal, o custo logístico pode ser do cliente, conforme a política vigente.",
          "As condições exatas são informadas no momento da abertura da solicitação.",
        ],
      },
      {
        id: "em-quanto-tempo-recebo-o-reembolso",
        question: "Em quanto tempo recebo o reembolso?",
        answer: [
          "Após aprovação da devolução, o reembolso é processado em até 5 dias úteis.",
          "Em compras no cartão, o crédito pode aparecer em até 2 faturas, conforme a administradora.",
          "Você recebe confirmação por e-mail em cada etapa até a finalização do processo.",
        ],
      },
    ],
  },
  {
    id: "presentear",
    name: "Presentear",
    icon: Gift,
    questions: [
      {
        id: "a-tsebi-oferece-embrulho-para-presente",
        question: "A Tsebi oferece embrulho para presente?",
        answer: [
          "Sim. A opção de embalagem para presente está disponível no checkout.",
          "Você pode incluir uma mensagem personalizada para acompanhar o envio.",
          "A apresentação é preparada para valorizar a experiência de quem recebe.",
        ],
      },
      {
        id: "posso-enviar-o-pedido-direto-para-outra-pessoa",
        question: "Posso enviar o pedido direto para outra pessoa?",
        answer: [
          "Sim. Basta informar o endereço do destinatário no momento da compra.",
          "A nota fiscal é enviada por e-mail e não acompanha valores na embalagem física.",
          "Assim, o presente chega com discrição e acabamento alinhado à proposta da marca.",
        ],
      },
      {
        id: "como-funciona-a-opcao-de-presentear",
        question: "Como funciona a opção de presentear?",
        answer: [
          "No checkout, selecione a opção É um presente, escolha a embalagem disponível e escreva sua mensagem.",
          "O envio é preparado sem exposição de valores na caixa.",
          "Se quiser garantir a data ideal, considere o prazo estimado da região antes de concluir o pedido.",
        ],
      },
      {
        id: "posso-incluir-um-cartao-escrito-a-mao",
        question: "Posso incluir um cartão escrito à mão?",
        answer: [
          "No momento, não oferecemos cartão manuscrito.",
          "Como alternativa, disponibilizamos mensagem personalizada impressa dentro da embalagem.",
          "Se esse serviço for atualizado, comunicaremos oficialmente em nossos canais.",
        ],
      },
    ],
  },
  {
    id: "pagamentos",
    name: "Pagamentos",
    icon: CreditCard,
    questions: [
      {
        id: "quais-formas-de-pagamento-sao-aceitas",
        question: "Quais formas de pagamento são aceitas?",
        answer: [
          "Aceitamos cartão de crédito, cartão de débito e boleto bancário.",
          "Todas as transações são processadas em ambiente seguro e com critérios de proteção de dados.",
          "No checkout, você visualiza as opções disponíveis e o resumo financeiro completo antes da confirmação.",
        ],
      },
      {
        id: "o-cartao-aceita-parcelamento",
        question: "O cartão aceita parcelamento?",
        answer: [
          "Sim. O parcelamento sem juros segue a faixa de valor do pedido e as opções aparecem automaticamente no checkout quando elegíveis.",
          "Faixas vigentes:",
          "- R$ 500 a R$ 799: até 3x sem juros",
          "- R$ 800 a R$ 1.099: até 4x sem juros",
          "- R$ 1.100 a R$ 1.499: até 5x sem juros",
          "- R$ 1.500 a R$ 1.999: até 6x sem juros",
          "- R$ 2.000 a R$ 2.799: até 7x sem juros",
          "- R$ 2.800 a R$ 3.799: até 8x sem juros",
          "- R$ 3.800 a R$ 4.999: até 9x sem juros",
          "- Acima de R$ 5.000: até 10x sem juros",
        ],
      },
      {
        id: "quais-bandeiras-sao-aceitas",
        question: "Quais bandeiras são aceitas?",
        answer: [
          "As bandeiras aceitas incluem Visa, Mastercard, American Express e Elo.",
          "A aprovação depende também das políticas da emissora e da validação de segurança da transação.",
          "Se houver recusa, recomendamos conferir os dados e tentar outra forma de pagamento disponível.",
        ],
      },
      {
        id: "o-boleto-tem-prazo-de-vencimento",
        question: "O boleto tem prazo de vencimento?",
        answer: [
          "Sim. O boleto vence em 3 dias úteis após a emissão.",
          "A confirmação bancária pode levar até 2 dias úteis, e o pedido segue para processamento após a compensação.",
          "Se o prazo expirar sem pagamento, o boleto é cancelado automaticamente e um novo pedido deve ser realizado.",
        ],
      },
      {
        id: "meus-dados-sao-seguros",
        question: "Meus dados são seguros?",
        answer: [
          "Sim. Seus dados de pagamento são tratados em ambiente protegido, com protocolos atuais de segurança.",
          "A Tsebi não armazena dados completos de cartão em seus próprios servidores.",
          "Também mantemos rotinas de monitoramento para reduzir riscos e reforçar a integridade da operação.",
        ],
      },
    ],
  },
  {
    id: "produtos",
    name: "Produtos",
    icon: ShoppingBag,
    questions: [
      {
        id: "como-sei-qual-tamanho-escolher",
        question: "Como sei qual tamanho escolher?",
        answer: [
          "Cada produto possui tabela de medidas na página de detalhes.",
          "Compare essas medidas com uma peça sua de referência e observe a descrição de modelagem.",
          "Se estiver entre dois tamanhos, nosso atendimento pode orientar a melhor escolha para o seu perfil.",
        ],
      },
      {
        id: "as-cores-sao-fieis-as-fotos",
        question: "As cores são fiéis às fotos?",
        answer: [
          "Trabalhamos para representar as cores com alta fidelidade nas imagens de produto.",
          "Mesmo assim, pode ocorrer variação por iluminação da foto e calibração de tela do dispositivo.",
          "Para decisão mais segura, consulte também as descrições técnicas e fotos complementares do item.",
        ],
      },
      {
        id: "os-produtos-tem-garantia",
        question: "Os produtos têm garantia?",
        answer: [
          "Sim. Nossos produtos têm garantia contra defeitos de fabricação.",
          "Se identificar qualquer inconformidade, fale conosco com fotos e dados do pedido para análise técnica.",
          "Após validação, indicamos a solução adequada conforme o caso.",
        ],
      },
      {
        id: "um-produto-esgotado-pode-voltar",
        question: "Um produto esgotado pode voltar?",
        answer: [
          "Sim. Alguns itens podem retornar ao estoque conforme planejamento de coleção e disponibilidade de produção.",
          "Recomendamos cadastrar seu e-mail na página do produto para receber aviso de reposição.",
          "Em reposições de volume limitado, o aviso antecipado faz diferença para garantir o item.",
        ],
      },
      {
        id: "como-escolher-o-tamanho-e-conferir-detalhes-do-produto",
        question: "Como escolher o tamanho e conferir detalhes do produto?",
        answer: [
          "Na página do produto, você encontra tabela de medidas e descrição técnica completa.",
          "Ali são apresentados tecido, composição, modelagem, acabamento e orientações de cuidado.",
          "Para uma escolha mais precisa, combine essas informações com sua referência pessoal de caimento.",
        ],
      },
    ],
  },
  {
    id: "cuidados-das-pecas",
    name: "Cuidados das Peças",
    icon: Tag,
    questions: [
      {
        id: "como-lavar-as-pecas-tsebi",
        question: "Como lavar as peças Tsebi?",
        answer: [
          "Siga sempre as instruções da etiqueta da peça.",
          "De forma geral, recomendamos lavagem suave, com água fria e produtos neutros, evitando alvejantes.",
          "Esse cuidado preserva cor, textura e durabilidade do material por mais tempo.",
        ],
      },
      {
        id: "posso-usar-secadora",
        question: "Posso usar secadora?",
        answer: [
          "Não recomendamos o uso de secadora para a maioria das peças.",
          "O calor intenso pode provocar encolhimento, deformação e desgaste precoce das fibras.",
          "Prefira secagem natural à sombra, em ambiente ventilado.",
        ],
      },
      {
        id: "como-guardar-corretamente",
        question: "Como guardar corretamente?",
        answer: [
          "Guarde as peças em local seco, arejado e sem incidência direta de sol.",
          "Use cabides apropriados para itens estruturados e dobras suaves para peças delicadas.",
          "Uma boa armazenagem reduz vincos permanentes, mofo e perda de forma.",
        ],
      },
      {
        id: "como-passar-sem-danificar",
        question: "Como passar sem danificar?",
        answer: [
          "Utilize a temperatura indicada na etiqueta e evite pressão excessiva.",
          "Em tecidos sensíveis, prefira vaporizador ou ferro com pano de proteção.",
          "Esse procedimento ajuda a preservar acabamento, textura e aparência original da peça.",
        ],
      },
    ],
  },
  {
    id: "servicos",
    name: "Serviços",
    icon: Wrench,
    questions: [
      {
        id: "quais-servicos-de-atendimento-estao-disponiveis",
        question: "Quais serviços de atendimento estão disponíveis?",
        answer: [
          "Oferecemos atendimento via:",
          "-> WhatsApp",
          "-> Direct",
          "-> e-mail",
          "-> formulário de contato.",
          "Atendimento privativo com um especialista Tsebi por mensagem, ligação ou video chamada.",
          "Nossos canais dão suporte a dúvidas sobre produtos, pedidos, entregas, trocas e orientações gerais de compra.",
          "O prazo de resposta é de até 24 horas úteis, com acompanhamento até a conclusão da solicitação.",
        ],
      },
      {
        id: "a-tsebi-oferece-embrulho-para-presente-servicos",
        question: "A Tsebi oferece embrulho para presente?",
        answer: [
          "Sim, o serviço está disponível no checkout.",
          "Também é possível incluir mensagem personalizada para complementar a experiência de presente.",
          "A apresentação segue o padrão estético e de cuidado da marca.",
        ],
      },
      {
        id: "posso-enviar-direto-para-outra-pessoa-servicos",
        question: "Posso enviar direto para outra pessoa?",
        answer: [
          "Sim. Você pode informar o endereço do destinatário diretamente no checkout.",
          "A nota fiscal é enviada por e-mail e não acompanha valores na embalagem física.",
          "Esse fluxo foi pensado para oferecer praticidade e discrição em compras para presente.",
        ],
      },
      {
        id: "a-tsebi-tem-programa-de-fidelidade",
        question: "A Tsebi tem programa de fidelidade?",
        answer: [
          "No momento, o programa de fidelidade está em desenvolvimento.",
          "As atualizações serão comunicadas nos canais oficiais e na newsletter da marca.",
          "Recomendamos manter seu cadastro ativo para receber novidades em primeira mão.",
        ],
      },
    ],
  },
];

export const featuredQuestions = [
  "Onde encontro mais informações sobre a Tsebi?",
  "Como realizar ou cancelar um pedido?",
  "Como rastrear meu pedido?",
  "Quando meu pedido será entregue?",
  "Como trocar ou devolver meu pedido?",
  "Como funciona a opção de presentear?",
  "Quais as formas de pagamento?",
  "Como escolher o tamanho e conferir detalhes do produto?",
  "Como cuidar das minhas peças?",
  "Quais serviços de atendimento estão disponíveis?",
] as const;

export function flattenQuestions(categories: FaqCategory[]): Array<FaqQuestion & { categoryId: string; categoryName: string }> {
  return categories.flatMap((category) =>
    category.questions.map((question) => ({
      ...question,
      categoryId: category.id,
      categoryName: category.name,
    }))
  );
}
