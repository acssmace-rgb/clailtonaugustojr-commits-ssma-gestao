import { isValidCnpj, isValidCpf, UFS } from '../../lib/br.js';
import type { Issue, Payload, PayloadS2210, PayloadS2220, PayloadS2240, Profissional, Vinculo } from './domain.js';

/**
 * REGRAS INTERNAS DE CONSISTÊNCIA.
 *
 * Verificam completude e coerência dos dados que o sistema possui, para que o profissional
 * corrija pendências antes de gerar/conferir o evento. Não substituem a validação oficial:
 * estrutura (XSD) e regras de negócio do eSocial são aplicadas pelo adaptador de leiaute e
 * pelo próprio ambiente do eSocial na recepção do evento.
 *
 * Os nomes de tabela abaixo são chaves internas; o número/versão oficial de cada tabela
 * deve ser conferido na documentação vigente ao importá-la (ver docs/ESOCIAL.md).
 */
export const TABLE_KEYS = {
  parteAtingida: 'parte_atingida',
  agenteCausador: 'agente_causador',
  situacaoGeradora: 'situacao_geradora',
  naturezaLesao: 'natureza_lesao',
  agentesNocivos: 'agentes_nocivos',
  procedimentos: 'procedimentos_diagnosticos',
  categorias: 'categorias_trabalhador',
} as const;

/** Retorna true/false se a tabela está importada, ou null quando a tabela não foi importada. */
export type TableLookup = (table: string, code: string) => Promise<boolean | null>;

const today = () => new Date().toISOString().slice(0, 10);

class Checker {
  issues: Issue[] = [];
  constructor(private lookup: TableLookup) {}
  erro(campo: string, mensagem: string) {
    this.issues.push({ campo, mensagem, severidade: 'erro' });
  }
  aviso(campo: string, mensagem: string) {
    this.issues.push({ campo, mensagem, severidade: 'aviso' });
  }
  required(campo: string, v: unknown, label: string) {
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) this.erro(campo, `${label} não informado(a)`);
  }
  async code(campo: string, table: string, code: string | null | undefined, label: string) {
    if (!code) return this.erro(campo, `${label}: código não informado`);
    const found = await this.lookup(table, code);
    if (found === null) this.aviso(campo, `${label}: tabela "${table}" não importada — código ${code} não pôde ser conferido`);
    else if (!found) this.erro(campo, `${label}: código ${code} não encontrado na tabela "${table}" importada`);
  }
  professional(campo: string, p: Profissional, label: string) {
    this.required(`${campo}.nome`, p.nome, `Nome do ${label}`);
    this.required(`${campo}.registro`, p.registro, `Registro profissional do ${label}`);
    if (!p.uf) this.erro(`${campo}.uf`, `UF do registro do ${label} não informada`);
    else if (!(UFS as readonly string[]).includes(p.uf)) this.erro(`${campo}.uf`, `UF inválida: ${p.uf}`);
  }
}

function checkEmployerAndLink(c: Checker, p: { empregador: Payload['empregador']; vinculo: Vinculo | null }) {
  if (!isValidCnpj(p.empregador.numeroInscricao)) c.erro('empregador.numeroInscricao', 'CNPJ do empregador inválido');
  if (!p.vinculo) return c.erro('vinculo', 'Trabalhador não vinculado ao registro');
  if (!isValidCpf(p.vinculo.cpf)) c.erro('vinculo.cpf', 'CPF do trabalhador inválido');
  if (!p.vinculo.matricula && !p.vinculo.codigoCategoria)
    c.erro('vinculo', 'Informe a matrícula do trabalhador ou o código de categoria (trabalhador sem vínculo de emprego)');
}

async function checkS2220(c: Checker, p: PayloadS2220) {
  checkEmployerAndLink(c, p);
  if (p.exame.data > today()) c.erro('exame.data', 'Data do exame no futuro');
  if (!p.exame.resultado) c.erro('exame.resultado', 'Resultado do ASO (apto/inapto) não informado');
  c.professional('exame.medicoEmitente', p.exame.medicoEmitente, 'médico emitente do ASO');
  c.professional('responsavelMonitoramento', p.responsavelMonitoramento, 'médico responsável pelo PCMSO');
  if (!p.exame.procedimentos.length) c.erro('exame.procedimentos', 'Nenhum procedimento/exame realizado informado');
  for (const [i, proc] of p.exame.procedimentos.entries()) {
    await c.code(`exame.procedimentos[${i + 1}].codigo`, TABLE_KEYS.procedimentos, proc.codigo, `Procedimento ${i + 1}`);
    if (proc.data > today()) c.erro(`exame.procedimentos[${i + 1}].data`, `Procedimento ${i + 1}: data no futuro`);
  }
  if (p.vinculo.codigoCategoria) await c.code('vinculo.codigoCategoria', TABLE_KEYS.categorias, p.vinculo.codigoCategoria, 'Categoria do trabalhador');
}

async function checkS2210(c: Checker, p: PayloadS2210) {
  checkEmployerAndLink(c, p);
  const a = p.acidente;
  if (a.dataHora.slice(0, 10) > today()) c.erro('acidente.dataHora', 'Data do acidente no futuro');
  if (a.descricao.trim().length < 10) c.aviso('acidente.descricao', 'Descrição muito curta — detalhe as circunstâncias');
  if (!a.local.descricao) c.erro('acidente.local', 'Local do acidente não informado');
  if (a.houveObito && !a.dataObito) c.erro('acidente.dataObito', 'Óbito informado sem data do óbito');
  await c.code('acidente.parteAtingida', TABLE_KEYS.parteAtingida, a.parteAtingida.codigo, 'Parte do corpo atingida');
  if (!a.parteAtingida.lateralidade) c.erro('acidente.parteAtingida.lateralidade', 'Lateralidade da parte atingida não informada');
  await c.code('acidente.agenteCausador', TABLE_KEYS.agenteCausador, a.agenteCausador.codigo, 'Agente causador');
  await c.code('acidente.situacaoGeradora', TABLE_KEYS.situacaoGeradora, a.situacaoGeradora.codigo, 'Situação geradora');
  await c.code('acidente.naturezaLesao', TABLE_KEYS.naturezaLesao, a.naturezaLesao.codigo, 'Natureza da lesão');
  if (!p.atestado) {
    c.aviso('atestado', 'Dados do atendimento/atestado médico não informados (registro restrito à equipe de saúde)');
  } else {
    if (p.atestado.data && p.atestado.data < a.dataHora.slice(0, 10)) c.erro('atestado.data', 'Data do atendimento anterior ao acidente');
    if (!p.atestado.cid) c.aviso('atestado.cid', 'CID não informado');
    c.professional('atestado.medico', p.atestado.medico, 'médico do atendimento');
  }
}

async function checkS2240(c: Checker, p: PayloadS2240) {
  checkEmployerAndLink(c, p);
  if (!p.dataInicio) c.erro('dataInicio', 'Data de início das condições ambientais não informada');
  else if (p.dataInicio > today()) c.aviso('dataInicio', 'Data de início no futuro');
  if (!p.ambiente.setor) c.erro('ambiente.setor', 'Trabalhador sem setor/ambiente de trabalho');
  if (!p.ambiente.descricao) c.erro('ambiente.descricao', 'Descrição do ambiente de trabalho não preenchida no setor');
  if (!p.ambiente.estabelecimento.numero) c.erro('ambiente.estabelecimento', 'Inscrição (CNPJ/CAEPF/CNO) do estabelecimento não informada na unidade');
  if (!p.atividades.descricao) c.erro('atividades.descricao', 'Descrição das atividades não preenchida no cargo');
  if (!p.agentes.length)
    c.erro('agentes', 'Nenhum agente informado. Se não houver exposição a agentes nocivos, cadastre no setor o código correspondente da tabela oficial de agentes nocivos, conforme orientação vigente');
  for (const [i, ag] of p.agentes.entries()) {
    await c.code(`agentes[${i + 1}].codigoAgente`, TABLE_KEYS.agentesNocivos, ag.codigoAgente, `Agente "${ag.perigo}"`);
    if (ag.tipoAvaliacao === 'quantitativa' && !ag.unidade) c.erro(`agentes[${i + 1}].unidade`, `Agente "${ag.perigo}": unidade de medida não informada`);
    if (ag.tipoAvaliacao === 'quantitativa' && !ag.tecnica) c.aviso(`agentes[${i + 1}].tecnica`, `Agente "${ag.perigo}": técnica de medição não informada`);
    if (ag.epiEficaz && !ag.cas.length) c.aviso(`agentes[${i + 1}].cas`, `Agente "${ag.perigo}": EPI eficaz informado sem CA`);
  }
  if (!p.responsaveisRegistros.length) c.erro('responsaveisRegistros', 'Responsável pelos registros ambientais não informado');
  for (const [i, r] of p.responsaveisRegistros.entries()) {
    if (!r.nome) c.erro(`responsaveisRegistros[${i + 1}].nome`, 'Nome do responsável não informado');
    if (!r.registro) c.erro(`responsaveisRegistros[${i + 1}].registro`, 'Registro no conselho de classe do responsável não informado');
  }
}

export async function validatePayload(p: Payload, lookup: TableLookup): Promise<Issue[]> {
  const c = new Checker(lookup);
  if (p.tipo === 'S2220') await checkS2220(c, p);
  if (p.tipo === 'S2210') await checkS2210(c, p);
  if (p.tipo === 'S2240') await checkS2240(c, p);
  return c.issues;
}
