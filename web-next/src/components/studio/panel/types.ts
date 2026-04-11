export type AdminPageKey =
  | "inicio"
  | "pedidos"
  | "produtos"
  | "usuarios"
  | "atendimentos"
  | "reparos"
  | "lista_vip"
  | "newsletter"
  | "cupons"
  | "gift_cards"
  | "saldo_clientes"
  | "status"
  | "diretoria"
  | "auditoria"
  | "notificacoes";

export type KpiTone = "positive" | "negative";

export type KpiData = {
  id: string;
  label: string;
  value: string;
  delta: string;
  tone: KpiTone;
};

export type OrderStatus = "Pago" | "Pendente" | "Enviado" | "Cancelado";

export type RecentOrder = {
  id: string;
  cliente: string;
  produto: string;
  valor: string;
  status: OrderStatus;
};

export type ActivityItem = {
  id: string;
  text: string;
  time: string;
  important: boolean;
};

export type GlobalSearchPageKey =
  | Extract<AdminPageKey, "pedidos" | "produtos" | "usuarios" | "cupons" | "gift_cards" | "diretoria">
  | "nfse";

export type GlobalSearchTargetKind =
  | "order"
  | "product"
  | "user"
  | "coupon"
  | "gift_card"
  | "admin"
  | "balance_request"
  | "nfse";

export type GlobalSearchTarget = {
  page: GlobalSearchPageKey;
  kind: GlobalSearchTargetKind;
  id: string;
  query?: string | null;
};
