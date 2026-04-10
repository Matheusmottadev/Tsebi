export type NfseStatus = "pendente" | "processando" | "autorizada" | "cancelada" | "erro";

export interface Nfse {
  id: string;
  row_kind?: "nfse" | "pedido_pendente";
  pedido_id: string;
  bling_id: string | null;
  numero: string | null;
  serie: string | null;
  status: NfseStatus;
  tomador_nome: string;
  tomador_documento: string;
  tomador_email: string | null;
  tomador_cep: string | null;
  tomador_logradouro: string | null;
  tomador_numero: string | null;
  tomador_bairro: string | null;
  tomador_municipio: string | null;
  tomador_uf: string | null;
  servico_descricao: string;
  servico_codigo: string;
  valor_servicos: number;
  aliquota_iss: number;
  valor_iss: number | null;
  competencia: string;
  pdf_url: string | null;
  xml_url: string | null;
  link_nota: string | null;
  erro_mensagem: string | null;
  tentativas: number;
  bling_payload: Record<string, unknown> | null;
  email_enviado_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface NfseEmailLog {
  id: string;
  nfse_id: string;
  destinatario: string;
  status: "enviado" | "falhou";
  resend_id: string | null;
  erro: string | null;
  created_at: string;
}

export interface EmitirNfsePayload {
  pedido_id: string;
  tomador_nome: string;
  tomador_documento: string;
  tomador_email?: string;
  tomador_cep: string;
  tomador_logradouro: string;
  tomador_numero: string;
  tomador_bairro: string;
  tomador_municipio: string;
  tomador_uf: string;
  servico_descricao: string;
  servico_codigo: string;
  valor_servicos: number;
  aliquota_iss: number;
  competencia: string;
  enviar_email: boolean;
}

export interface NfseStats {
  emitidas_mes: number;
  total_faturado: number;
  pendentes: number;
  erros: number;
}

export interface NfseListResponse {
  notas: Nfse[];
  total: number;
  pagina: number;
  por_pagina: number;
}
