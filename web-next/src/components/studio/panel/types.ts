export type AdminPageKey =
  | "inicio"
  | "pedidos"
  | "produtos"
  | "usuarios"
  | "atendimentos"
  | "lista_vip"
  | "newsletter"
  | "cupons"
  | "auditoria";

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

