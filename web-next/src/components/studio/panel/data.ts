import type { ActivityItem, AdminPageKey, KpiData, RecentOrder } from "./types";

export const PAGE_TITLES: Record<AdminPageKey, string> = {
  inicio: "Início",
  pedidos: "Pedidos",
  produtos: "Produtos",
  usuarios: "Usuários",
  atendimentos: "Atendimentos",
  lista_vip: "Lista VIP",
  newsletter: "Newsletter",
  cupons: "Cupons",
  auditoria: "Auditoria",
};

export const KPI_ITEMS: KpiData[] = [
  { id: "receita", label: "RECEITA DO MÊS", value: "R$ 48.2k", delta: "? 12%", tone: "positive" },
  { id: "pedidos", label: "PEDIDOS", value: "134", delta: "? 8%", tone: "positive" },
  { id: "ticket", label: "TICKET MÉDIO", value: "R$ 960", delta: "? 3%", tone: "negative" },
  { id: "clientes", label: "NOVOS CLIENTES", value: "47", delta: "? 21%", tone: "positive" },
];

export const RECENT_ORDERS: RecentOrder[] = [
  {
    id: "#00412",
    cliente: "Ana Souza",
    produto: "Calça Reta — Preto",
    valor: "R$ 800",
    status: "Enviado",
  },
  {
    id: "#00411",
    cliente: "Mariana Lima",
    produto: "Blusa Oversized — Off White",
    valor: "R$ 900",
    status: "Pago",
  },
  {
    id: "#00410",
    cliente: "Carlos Mendes",
    produto: "Bolsa Estruturada — Caramelo",
    valor: "R$ 1.500",
    status: "Pendente",
  },
  {
    id: "#00409",
    cliente: "Fernanda Costa",
    produto: "Calça Reta — Creme",
    valor: "R$ 800",
    status: "Pago",
  },
  {
    id: "#00408",
    cliente: "Rafael Torres",
    produto: "Blusa Linho — Branco",
    valor: "R$ 900",
    status: "Cancelado",
  },
];

export const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: "a1",
    text: "Novo pedido #00412 recebido de Ana Souza",
    time: "Há 12 minutos",
    important: true,
  },
  {
    id: "a2",
    text: "Estoque da Blusa Oversized Off White chegou a 2 unidades",
    time: "Há 1 hora",
    important: true,
  },
  {
    id: "a3",
    text: "Cupom TSEBI10 utilizado por Mariana Lima",
    time: "Há 2 horas",
    important: false,
  },
  {
    id: "a4",
    text: "3 novos cadastros na newsletter",
    time: "Hoje, 09:14",
    important: false,
  },
  {
    id: "a5",
    text: "Pedido #00408 cancelado por Rafael Torres",
    time: "Hoje, 08:32",
    important: false,
  },
];

