/**
 * Modelo de DOMÍNIO dos eventos SST (S-2210, S-2220, S-2240).
 *
 * Importante: esta estrutura organiza os dados que o sistema possui para cada evento.
 * Ela NÃO é o leiaute oficial. A conversão para o XML oficial é feita por um
 * adaptador de leiaute (ver leiaute.ts), que deve ser implementado conforme a
 * documentação técnica vigente publicada em gov.br/esocial.
 */

export type EventType = 'S2210' | 'S2220' | 'S2240';

export const EVENT_INFO: Record<EventType, { code: string; name: string; source: 'accident' | 'exam' | 'worker' }> = {
  S2210: { code: 'S-2210', name: 'Comunicação de Acidente de Trabalho', source: 'accident' },
  S2220: { code: 'S-2220', name: 'Monitoramento da Saúde do Trabalhador', source: 'exam' },
  S2240: { code: 'S-2240', name: 'Condições Ambientais do Trabalho — Agentes Nocivos', source: 'worker' },
};

export interface Empregador {
  razaoSocial: string;
  tipoInscricao: 'CNPJ';
  numeroInscricao: string;
}

export interface Vinculo {
  nome: string;
  cpf: string;
  matricula: string | null;
  codigoCategoria: string | null;
}

export interface Profissional {
  nome: string | null;
  registro: string | null;
  uf: string | null;
}

export interface PayloadS2220 {
  tipo: 'S2220';
  empregador: Empregador;
  vinculo: Vinculo;
  exame: {
    tipo: string;
    data: string;
    resultado: string | null;
    medicoEmitente: Profissional;
    procedimentos: { codigo: string; data: string; descricao: string | null }[];
  };
  responsavelMonitoramento: Profissional;
}

export interface PayloadS2210 {
  tipo: 'S2210';
  empregador: Empregador;
  vinculo: Vinculo | null;
  acidente: {
    tipoRegistro: string;
    dataHora: string;
    horasTrabalhadas: string | null;
    houveObito: boolean;
    dataObito: string | null;
    comunicacaoPolicia: boolean;
    descricao: string;
    local: { descricao: string | null; estabelecimento: { tipoInscricao: number | null; numero: string | null } };
    parteAtingida: { codigo: string | null; lateralidade: string | null };
    agenteCausador: { codigo: string | null };
    situacaoGeradora: { codigo: string | null };
    naturezaLesao: { codigo: string | null };
    numeroCatOrigem: string | null;
  };
  atestado: {
    houveAfastamento: boolean;
    internacao: boolean;
    data: string | null;
    diasAfastamento: number | null;
    cid: string | null;
    diagnostico: string | null;
    medico: Profissional;
  } | null;
}

export interface PayloadS2240 {
  tipo: 'S2240';
  empregador: Empregador;
  vinculo: Vinculo;
  dataInicio: string | null;
  ambiente: {
    estabelecimento: { tipoInscricao: number | null; numero: string | null; nome: string };
    setor: string;
    descricao: string | null;
  };
  atividades: { cargo: string | null; descricao: string | null };
  agentes: {
    riscoId: string;
    perigo: string;
    codigoAgente: string | null;
    tipoAvaliacao: 'quantitativa' | 'qualitativa';
    intensidade: string | null;
    unidade: string | null;
    tecnica: string | null;
    epcEficaz: boolean | null;
    epiEficaz: boolean | null;
    cas: string[];
  }[];
  responsaveisRegistros: { nome: string | null; conselho: string | null; registro: string | null; uf: string | null }[];
  observacoes: string | null;
}

export type Payload = PayloadS2210 | PayloadS2220 | PayloadS2240;

export interface Issue {
  campo: string;
  mensagem: string;
  /** erro: impede marcar como validado; aviso: requer conferência humana */
  severidade: 'erro' | 'aviso';
}
