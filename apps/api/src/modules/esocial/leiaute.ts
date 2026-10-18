import type { Payload } from './domain.js';

/**
 * Adaptador de leiaute: converte os dados de domínio no XML oficial do eSocial.
 *
 * NENHUM adaptador vem habilitado. Cada adaptador deve ser escrito e testado a partir da
 * documentação técnica vigente (leiautes, tabelas e esquemas XSD publicados em
 * gov.br/esocial — versão S-1.3 e notas técnicas em vigor na data da implementação),
 * validando o XML gerado contra os XSD oficiais antes de qualquer envio.
 */
export interface LeiauteAdapter {
  /** Ex.: "S-1.3 (NT xx/aaaa)" */
  version: string;
  supports(type: Payload['tipo']): boolean;
  toXml(payload: Payload, ctx: { eventId: string; ambiente: 'producao' | 'producao_restrita' }): string;
  /** Valida o XML contra os esquemas XSD oficiais; retorna mensagens de erro */
  validateXsd(xml: string): Promise<string[]>;
}

const adapters: LeiauteAdapter[] = [];

export function registerLeiauteAdapter(a: LeiauteAdapter) {
  adapters.push(a);
}

export function getLeiauteAdapter(type: Payload['tipo']): LeiauteAdapter | null {
  return adapters.find((a) => a.supports(type)) ?? null;
}

export const LEIAUTE_INDISPONIVEL =
  'Geração do XML oficial indisponível: nenhum adaptador de leiaute foi implementado/homologado a partir da documentação técnica vigente do eSocial. ' +
  'Use a exportação para conferência (JSON/PDF).';
