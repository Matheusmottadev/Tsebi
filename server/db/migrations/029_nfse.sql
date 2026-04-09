-- Migration 029: NFS-e module

CREATE TABLE IF NOT EXISTS nfse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES orders(id),
  bling_id VARCHAR(100),
  numero VARCHAR(20),
  serie VARCHAR(10),
  status VARCHAR(30) NOT NULL DEFAULT 'pendente',
  tomador_nome VARCHAR(255) NOT NULL,
  tomador_documento VARCHAR(20) NOT NULL,
  tomador_email VARCHAR(255),
  tomador_cep VARCHAR(10),
  tomador_logradouro VARCHAR(255),
  tomador_numero VARCHAR(20),
  tomador_bairro VARCHAR(100),
  tomador_municipio VARCHAR(100),
  tomador_uf VARCHAR(2),
  servico_descricao TEXT NOT NULL,
  servico_codigo VARCHAR(20) NOT NULL DEFAULT '01.07',
  valor_servicos NUMERIC(10, 2) NOT NULL,
  aliquota_iss NUMERIC(5, 4) NOT NULL DEFAULT 0.02,
  valor_iss NUMERIC(10, 2),
  competencia DATE NOT NULL DEFAULT CURRENT_DATE,
  pdf_url TEXT,
  xml_url TEXT,
  link_nota TEXT,
  erro_mensagem TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  bling_payload JSONB,
  email_enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfse_pedido_id ON nfse(pedido_id);
CREATE INDEX IF NOT EXISTS idx_nfse_status ON nfse(status);
CREATE INDEX IF NOT EXISTS idx_nfse_created_at ON nfse(created_at DESC);

CREATE TABLE IF NOT EXISTS nfse_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nfse_id UUID NOT NULL REFERENCES nfse(id),
  destinatario VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'enviado',
  resend_id VARCHAR(100),
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
