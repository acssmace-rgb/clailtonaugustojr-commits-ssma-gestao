import { config } from '../../lib/config.js';

/**
 * Transmissor oficial (webservice do eSocial). Requer certificado digital ICP-Brasil,
 * procuração eletrônica quando o envio for feito por terceiros, XML assinado gerado por
 * adaptador de leiaute homologado e testes em produção restrita.
 *
 * O sistema NUNCA simula envio: um evento só fica "enviado"/"processado" quando
 * `send`/`consult` retornam protocolo/recibo vindos do serviço oficial.
 */
export interface OfficialResponse {
  protocolNumber?: string;
  receiptNumber?: string;
  status: 'aceito_em_processamento' | 'processado' | 'rejeitado';
  responseCode?: string;
  /** Mensagem do serviço oficial, sem dados pessoais */
  responseMessage?: string;
}

export interface Transmitter {
  readonly enabled: boolean;
  readonly reasonDisabled?: string;
  send(input: { signedXml: string; ambiente: string }): Promise<OfficialResponse>;
  consult(protocolNumber: string): Promise<OfficialResponse>;
}

export const REQUISITOS_TRANSMISSAO = [
  'Adaptador de leiaute implementado e validado contra os XSD oficiais vigentes',
  'Certificado digital ICP-Brasil (A1/A3) do empregador ou do procurador',
  'Procuração eletrônica no e-CAC quando a transmissão for feita por terceiro (ex.: consultoria)',
  'Assinatura XML (XMLDSig) e cliente do webservice com TLS mútuo',
  'Testes concluídos no ambiente de produção restrita',
];

class DisabledTransmitter implements Transmitter {
  readonly enabled = false;
  readonly reasonDisabled = 'Transmissão oficial não configurada neste ambiente.';
  async send(): Promise<OfficialResponse> {
    throw new Error(this.reasonDisabled);
  }
  async consult(): Promise<OfficialResponse> {
    throw new Error(this.reasonDisabled);
  }
}

export function getTransmitter(): Transmitter {
  switch (config.ESOCIAL_TRANSMITTER) {
    default:
      return new DisabledTransmitter();
  }
}
