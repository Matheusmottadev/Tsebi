import {
  Body, Container, Head, Heading, Hr, Html,
  Link, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface Props {
  tomador_nome: string;
  numero: string;
  valor_servicos: number;
  competencia: string;
  servico_descricao: string;
  pdf_url: string;
}

export default function NfseEmitidaEmail({
  tomador_nome, numero, valor_servicos, competencia, servico_descricao, pdf_url,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Sua nota fiscal NFS-e {numero} esta disponivel - Tsebi Brasil</Preview>
      <Body style={{ backgroundColor: "#f4f4f4", fontFamily: "sans-serif" }}>
        <Container style={{ maxWidth: "520px", margin: "40px auto", backgroundColor: "#ffffff", padding: "40px" }}>
          <Text style={{ fontSize: "22px", fontWeight: "600", letterSpacing: "3px", color: "#111", marginBottom: "4px" }}>
            TSEBI
          </Text>
          <Text style={{ fontSize: "10px", letterSpacing: "2px", color: "#888", marginTop: "0" }}>
            NOTA FISCAL DE SERVICO
          </Text>
          <Hr style={{ borderColor: "#eee", margin: "24px 0" }} />
          <Heading style={{ fontSize: "18px", fontWeight: "500", color: "#111" }}>
            Ola, {tomador_nome}
          </Heading>
          <Text style={{ color: "#555", fontSize: "14px", lineHeight: "1.6" }}>
            Sua nota fiscal eletronica de servico esta disponivel. Confira os detalhes abaixo.
          </Text>
          <Section style={{ backgroundColor: "#f9f9f9", padding: "20px", borderRadius: "8px", margin: "24px 0" }}>
            <Row>
              <Column><Text style={{ fontSize: "12px", color: "#888", margin: "0" }}>Numero da nota</Text>
              <Text style={{ fontSize: "15px", fontWeight: "500", color: "#111", margin: "4px 0 12px" }}>NFS-e {numero}</Text></Column>
            </Row>
            <Row>
              <Column><Text style={{ fontSize: "12px", color: "#888", margin: "0" }}>Servico</Text>
              <Text style={{ fontSize: "14px", color: "#333", margin: "4px 0 12px" }}>{servico_descricao}</Text></Column>
            </Row>
            <Row>
              <Column><Text style={{ fontSize: "12px", color: "#888", margin: "0" }}>Competencia</Text>
              <Text style={{ fontSize: "14px", color: "#333", margin: "4px 0 12px" }}>{competencia}</Text></Column>
              <Column><Text style={{ fontSize: "12px", color: "#888", margin: "0" }}>Valor</Text>
              <Text style={{ fontSize: "14px", color: "#333", margin: "4px 0 12px" }}>
                {valor_servicos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </Text></Column>
            </Row>
          </Section>
          <Link href={pdf_url} style={{
            display: "block", textAlign: "center", backgroundColor: "#111", color: "#fff",
            padding: "12px 24px", borderRadius: "6px", textDecoration: "none",
            fontSize: "14px", fontWeight: "500", margin: "0 0 24px",
          }}>
            Baixar PDF da Nota Fiscal
          </Link>
          <Hr style={{ borderColor: "#eee" }} />
          <Text style={{ fontSize: "11px", color: "#aaa", textAlign: "center", marginTop: "16px" }}>
            Tsebi Brasil - CNPJ {process.env.BLING_CNPJ_PRESTADOR} - tsebi.com.br
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
