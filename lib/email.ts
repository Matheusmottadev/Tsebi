import { Resend } from "resend";
import NfseEmitidaEmail from "../emails/nfse-emitida";
import type { Nfse } from "../types/nfse";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function enviarEmailNfse(nfse: Nfse): Promise<string> {
  if (!nfse.tomador_email) throw new Error("Nota sem email do tomador");
  if (!nfse.numero) throw new Error("Nota sem numero");
  if (!nfse.pdf_url) throw new Error("Nota sem PDF");

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: nfse.tomador_email,
    subject: `Nota Fiscal NFS-e ${nfse.numero} - Tsebi Brasil`,
    react: NfseEmitidaEmail({
      tomador_nome: nfse.tomador_nome,
      numero: nfse.numero,
      valor_servicos: Number(nfse.valor_servicos),
      competencia: nfse.competencia,
      servico_descricao: nfse.servico_descricao,
      pdf_url: nfse.pdf_url,
    }),
  });

  if (error) throw new Error(error.message);
  return data!.id;
}
