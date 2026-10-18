import { prisma } from '../../lib/prisma.js';
import { maskCpf } from '../../lib/br.js';
import { readSettings } from '../../lib/settings.js';
import { expiryStatus } from '../../lib/expiry.js';
import type { PdfColumn } from '../../lib/pdf.js';

/** Contexto de acesso usado para montar relatórios (usuário logado ou destinatário agendado). */
export interface ReportCtx {
  tenantId: string;
  settings: unknown;
  permissions: Set<string>;
  companyIds: string[];
  unitIds: string[];
}

export interface ReportFilters {
  companyId?: string;
  unitId?: string;
  from?: string;
  to?: string;
}

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  permissions: string[];
  /** Tabelas/registros de origem */
  source: string;
  /** Regras de cálculo dos campos derivados */
  formulas: string[];
  columns: PdfColumn[];
  rows: (ctx: ReportCtx, f: ReportFilters) => Promise<Record<string, unknown>[]>;
}

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : '');
const today = () => new Date(new Date().toISOString().slice(0, 10));
const LABEL_EXPIRY: Record<string, string> = { vencido: 'Vencido', a_vencer: 'A vencer', vigente: 'Vigente', sem_validade: 'Sem validade' };

/** Filtro de cliente + escopo do usuário + filtros do relatório. */
function scope(ctx: ReportCtx, f: ReportFilters, company?: string, unit?: string) {
  const w: Record<string, unknown> = { tenantId: ctx.tenantId };
  const set = (path: string, v: unknown) => {
    const parts = path.split('.');
    let cur = w;
    for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
    const last = parts.at(-1)!;
    // Combina filtro escolhido com o escopo permitido
    const prev = cur[last] as { in?: string[] } | undefined;
    if (typeof v === 'string' && prev?.in && !prev.in.includes(v)) cur[last] = { in: [] };
    else cur[last] = v;
  };
  if (company && ctx.companyIds.length) set(company, { in: ctx.companyIds });
  if (unit && ctx.unitIds.length) set(unit, { in: ctx.unitIds });
  if (company && f.companyId) set(company, f.companyId);
  if (unit && f.unitId) set(unit, f.unitId);
  return w;
}

function period(f: ReportFilters) {
  if (!f.from && !f.to) return undefined;
  return { gte: f.from ? new Date(`${f.from}T00:00:00Z`) : undefined, lte: f.to ? new Date(`${f.to}T23:59:59Z`) : undefined };
}

export function riskClass(level: number, settings: unknown) {
  const m = readSettings(settings).riskMatrix;
  if (level >= m.critico) return 'Crítico';
  if (level >= m.alto) return 'Alto';
  if (level >= m.moderado) return 'Moderado';
  return 'Baixo';
}

export const REPORTS: ReportDef[] = [
  {
    key: 'tarefas',
    title: 'Tarefas e planos de ação',
    description: 'Tarefas por status, responsável e prazo',
    permissions: ['tasks.read'],
    source: 'Tabela Task (tarefas) + ActionPlan (planos de ação) + usuários do cliente',
    formulas: [
      'Situação "Atrasada": prazo < data de hoje e status em (aberta, em andamento).',
      'Período: filtra pela data de criação da tarefa.',
    ],
    columns: [
      { key: 'titulo', label: 'Tarefa', width: 3 },
      { key: 'plano', label: 'Plano de ação', width: 2 },
      { key: 'responsavel', label: 'Responsável', width: 1.5 },
      { key: 'prioridade', label: 'Prioridade' },
      { key: 'status', label: 'Status' },
      { key: 'prazo', label: 'Prazo' },
      { key: 'situacao', label: 'Situação' },
      { key: 'concluidaEm', label: 'Concluída em' },
    ],
    rows: async (ctx, f) => {
      const tasks = await prisma.task.findMany({
        where: { ...scope(ctx, f, 'companyId', 'unitId'), createdAt: period(f) },
        include: { actionPlan: { select: { title: true } } },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
      });
      const users = await prisma.user.findMany({ where: { id: { in: tasks.map((t) => t.assigneeId!).filter(Boolean) } }, select: { id: true, name: true } });
      const name = new Map(users.map((u) => [u.id, u.name]));
      const t0 = today();
      return tasks.map((t) => ({
        titulo: t.title,
        plano: t.actionPlan?.title ?? '',
        responsavel: t.assigneeId ? name.get(t.assigneeId) : '',
        prioridade: t.priority,
        status: t.status.replace(/_/g, ' '),
        prazo: d(t.dueDate),
        situacao: t.dueDate && t.dueDate < t0 && ['aberta', 'em_andamento'].includes(t.status) ? 'Atrasada' : '',
        concluidaEm: d(t.completedAt),
      }));
    },
  },
  {
    key: 'documentos',
    title: 'Documentos e validade',
    description: 'Documentos de SST/ambientais com versão aprovada e situação de validade',
    permissions: ['documents.read'],
    source: 'Tabela Document + DocumentVersion (versão aprovada vigente)',
    formulas: [
      'Vencido: validade < hoje. A vencer: hoje ≤ validade ≤ hoje + antecedência configurada para documentos.',
      'Versão aprovada: número da última versão aprovada por profissional responsável (0 = nenhuma).',
    ],
    columns: [
      { key: 'tipo', label: 'Tipo' },
      { key: 'titulo', label: 'Documento', width: 3 },
      { key: 'empresa', label: 'Empresa', width: 2 },
      { key: 'status', label: 'Status' },
      { key: 'versao', label: 'Versão aprovada' },
      { key: 'responsavelTecnico', label: 'Resp. técnico', width: 1.5 },
      { key: 'validade', label: 'Validade' },
      { key: 'situacao', label: 'Situação' },
    ],
    rows: async (ctx, f) => {
      const docs = await prisma.document.findMany({ where: { ...scope(ctx, f, 'companyId', 'unitId'), status: { not: 'obsoleto' } }, orderBy: { validUntil: 'asc' } });
      const companies = await prisma.company.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true } });
      const cn = new Map(companies.map((c) => [c.id, c.name]));
      const days = readSettings(ctx.settings).alertDays.documents;
      return docs.map((x) => ({
        tipo: x.type,
        titulo: x.title,
        empresa: cn.get(x.companyId),
        status: x.status.replace('_', ' '),
        versao: x.currentVersion || '—',
        responsavelTecnico: [x.technicalResponsible, x.technicalRegistry].filter(Boolean).join(' — '),
        validade: d(x.validUntil),
        situacao: LABEL_EXPIRY[expiryStatus(x.validUntil, days)],
      }));
    },
  },
  {
    key: 'trabalhadores',
    title: 'Trabalhadores',
    description: 'Quadro de trabalhadores por empresa, unidade, setor e cargo (CPF mascarado)',
    permissions: ['workers.read'],
    source: 'Tabela Worker + Company + Unit + Sector + JobRole',
    formulas: ['CPF exibido mascarado em todos os relatórios (minimização de dados — LGPD).'],
    columns: [
      { key: 'nome', label: 'Nome', width: 2.5 },
      { key: 'cpf', label: 'CPF' },
      { key: 'matricula', label: 'Matrícula' },
      { key: 'unidade', label: 'Unidade', width: 1.5 },
      { key: 'setor', label: 'Setor', width: 1.5 },
      { key: 'cargo', label: 'Cargo', width: 1.5 },
      { key: 'admissao', label: 'Admissão' },
      { key: 'status', label: 'Status' },
    ],
    rows: async (ctx, f) => {
      const ws = await prisma.worker.findMany({
        where: scope(ctx, f, 'companyId', 'unitId'),
        include: { unit: true, sector: true, jobRole: true },
        orderBy: { name: 'asc' },
      });
      return ws.map((w) => ({
        nome: w.name,
        cpf: maskCpf(w.cpf),
        matricula: w.registration,
        unidade: w.unit.name,
        setor: w.sector?.name,
        cargo: w.jobRole?.name,
        admissao: d(w.admissionDate),
        status: w.status,
      }));
    },
  },
  {
    key: 'exames',
    title: 'Exames ocupacionais (ASO)',
    description: 'Último exame de cada trabalhador e próximo vencimento — acesso restrito à saúde',
    permissions: ['health.read'],
    source: 'Tabela Exam (último exame por trabalhador) + Worker',
    formulas: [
      'Considera o exame mais recente (maior data) de cada trabalhador não desligado.',
      'Vencido: próximo exame < hoje. A vencer: até a antecedência configurada para exames.',
      'O relatório não exibe procedimentos nem observações clínicas.',
    ],
    columns: [
      { key: 'trabalhador', label: 'Trabalhador', width: 2.5 },
      { key: 'tipo', label: 'Último exame' },
      { key: 'data', label: 'Data' },
      { key: 'resultado', label: 'Resultado' },
      { key: 'proximo', label: 'Próximo exame' },
      { key: 'situacao', label: 'Situação' },
    ],
    rows: async (ctx, f) => {
      const ws = await prisma.worker.findMany({
        where: { ...scope(ctx, f, 'companyId', 'unitId'), status: { not: 'desligado' } },
        include: { exams: { orderBy: { examDate: 'desc' }, take: 1 } },
        orderBy: { name: 'asc' },
      });
      const days = readSettings(ctx.settings).alertDays.exams;
      return ws.map((w) => {
        const e = w.exams[0];
        return {
          trabalhador: w.name,
          tipo: e?.type.replace('_', ' ') ?? 'Sem exame registrado',
          data: d(e?.examDate),
          resultado: e?.result ?? '',
          proximo: d(e?.nextDueDate),
          situacao: e ? LABEL_EXPIRY[expiryStatus(e.nextDueDate, days)] : 'Pendente',
        };
      });
    },
  },
  {
    key: 'acidentes',
    title: 'Acidentes, incidentes e quase acidentes',
    description: 'Ocorrências no período por tipo e situação da investigação',
    permissions: ['accidents.read'],
    source: 'Tabela Accident',
    formulas: [
      'Período: filtra pela data/hora da ocorrência.',
      'Taxas de frequência/gravidade não são calculadas: exigem horas-homem trabalhadas, ainda não registradas no sistema.',
    ],
    columns: [
      { key: 'data', label: 'Data' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'trabalhador', label: 'Trabalhador', width: 2 },
      { key: 'local', label: 'Local', width: 2 },
      { key: 'obito', label: 'Óbito' },
      { key: 'afastamento', label: 'Afastamento' },
      { key: 'status', label: 'Investigação' },
      { key: 'causa', label: 'Causa raiz', width: 2.5 },
    ],
    rows: async (ctx, f) => {
      const ac = await prisma.accident.findMany({
        where: { ...scope(ctx, f, 'companyId', 'unitId'), occurredAt: period(f) },
        include: { worker: { select: { name: true } } },
        orderBy: { occurredAt: 'desc' },
      });
      return ac.map((a) => ({
        data: d(a.occurredAt),
        tipo: a.type.replace('_', ' '),
        trabalhador: a.worker?.name ?? '',
        local: a.location,
        obito: a.death ? 'Sim' : 'Não',
        afastamento: a.medicalLeave ? 'Sim' : 'Não',
        status: a.status.replace('_', ' '),
        causa: a.rootCause,
      }));
    },
  },
  {
    key: 'riscos',
    title: 'Inventário de riscos',
    description: 'Perigos e riscos por setor com nível e classificação da matriz',
    permissions: ['risks.read'],
    source: 'Tabela Risk + Sector + Unit',
    formulas: [
      'Nível = probabilidade (1–5) × severidade (1–5).',
      'Classe conforme limites configurados pelo cliente (padrão: Moderado ≥ 5, Alto ≥ 10, Crítico ≥ 17). A matriz deve ser definida pelo responsável técnico.',
    ],
    columns: [
      { key: 'unidade', label: 'Unidade', width: 1.5 },
      { key: 'setor', label: 'Setor', width: 1.5 },
      { key: 'tipo', label: 'Tipo' },
      { key: 'perigo', label: 'Perigo', width: 2.5 },
      { key: 'agente', label: 'Cód. agente' },
      { key: 'p', label: 'P', width: 0.4 },
      { key: 's', label: 'S', width: 0.4 },
      { key: 'nivel', label: 'Nível', width: 0.6 },
      { key: 'classe', label: 'Classe' },
      { key: 'controles', label: 'Medidas de controle', width: 3 },
    ],
    rows: async (ctx, f) => {
      const rs = await prisma.risk.findMany({
        where: { ...scope(ctx, f, 'sector.unit.companyId', 'sector.unitId'), active: true },
        include: { sector: { include: { unit: true } } },
        orderBy: [{ level: 'desc' }],
      });
      return rs.map((x) => ({
        unidade: x.sector.unit.name,
        setor: x.sector.name,
        tipo: x.type,
        perigo: x.hazard,
        agente: x.agentCode,
        p: x.probability,
        s: x.severity,
        nivel: x.level,
        classe: riskClass(x.level, ctx.settings),
        controles: x.controls,
      }));
    },
  },
  {
    key: 'treinamentos',
    title: 'Treinamentos e validade',
    description: 'Registros de treinamento com situação de validade',
    permissions: ['trainings.read'],
    source: 'Tabela TrainingRecord + Training + Worker',
    formulas: ['Vencido: validade < hoje. A vencer: até a antecedência configurada para treinamentos.', 'Período: filtra pela data de conclusão.'],
    columns: [
      { key: 'trabalhador', label: 'Trabalhador', width: 2 },
      { key: 'treinamento', label: 'Treinamento', width: 2.5 },
      { key: 'concluido', label: 'Concluído em' },
      { key: 'validade', label: 'Validade' },
      { key: 'situacao', label: 'Situação' },
      { key: 'instrutor', label: 'Instrutor', width: 1.5 },
    ],
    rows: async (ctx, f) => {
      const rs = await prisma.trainingRecord.findMany({
        where: { ...scope(ctx, f, 'worker.companyId', 'worker.unitId'), completedAt: period(f) },
        include: { worker: { select: { name: true } }, training: { select: { name: true } } },
        orderBy: { validUntil: 'asc' },
      });
      const days = readSettings(ctx.settings).alertDays.trainings;
      return rs.map((x) => ({
        trabalhador: x.worker.name,
        treinamento: x.training.name,
        concluido: d(x.completedAt),
        validade: d(x.validUntil),
        situacao: LABEL_EXPIRY[expiryStatus(x.validUntil, days)],
        instrutor: x.instructor,
      }));
    },
  },
  {
    key: 'epis',
    title: 'Entregas de EPI',
    description: 'Entregas, CA e previsão de troca',
    permissions: ['ppe.read'],
    source: 'Tabela PpeDelivery + Ppe + Worker',
    formulas: ['Situação da troca: compara a data prevista de troca com hoje e a antecedência configurada para EPI.', 'Período: filtra pela data de entrega.'],
    columns: [
      { key: 'trabalhador', label: 'Trabalhador', width: 2 },
      { key: 'epi', label: 'EPI', width: 2 },
      { key: 'ca', label: 'CA' },
      { key: 'qtd', label: 'Qtd.', width: 0.5 },
      { key: 'entrega', label: 'Entrega' },
      { key: 'troca', label: 'Troca prevista' },
      { key: 'situacao', label: 'Situação' },
    ],
    rows: async (ctx, f) => {
      const rs = await prisma.ppeDelivery.findMany({
        where: { ...scope(ctx, f, 'worker.companyId', 'worker.unitId'), deliveredAt: period(f) },
        include: { worker: { select: { name: true } }, ppe: true },
        orderBy: { deliveredAt: 'desc' },
      });
      const days = readSettings(ctx.settings).alertDays.ppe;
      return rs.map((x) => ({
        trabalhador: x.worker.name,
        epi: x.ppe.name,
        ca: x.ppe.ca,
        qtd: x.quantity,
        entrega: d(x.deliveredAt),
        troca: d(x.replaceBy),
        situacao: LABEL_EXPIRY[expiryStatus(x.replaceBy, days)],
      }));
    },
  },
  {
    key: 'esocial',
    title: 'Eventos eSocial (SST)',
    description: 'Situação dos eventos S-2210, S-2220 e S-2240',
    permissions: ['esocial.read'],
    source: 'Tabela EsocialEvent + EsocialEventVersion (pendências da versão atual)',
    formulas: [
      'Pendências: quantidade de erros das regras internas na versão atual.',
      'Recibo "manual": informado pelo usuário a partir de outro sistema, não verificado pelo SSMA Gestão.',
      'Eventos S-2220 aparecem apenas para quem tem acesso a dados de saúde.',
    ],
    columns: [
      { key: 'evento', label: 'Evento' },
      { key: 'trabalhador', label: 'Trabalhador', width: 2 },
      { key: 'status', label: 'Status', width: 1.3 },
      { key: 'versao', label: 'Versão', width: 0.6 },
      { key: 'pendencias', label: 'Erros', width: 0.6 },
      { key: 'recibo', label: 'Recibo', width: 1.5 },
      { key: 'atualizado', label: 'Atualizado em' },
    ],
    rows: async (ctx, f) => {
      const evs = await prisma.esocialEvent.findMany({
        where: {
          ...scope(ctx, f, 'companyId'),
          type: ctx.permissions.has('health.read') ? undefined : { not: 'S2220' },
          updatedAt: period(f),
        },
        include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { issues: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      const ws = await prisma.worker.findMany({ where: { id: { in: evs.map((e) => e.workerId!).filter(Boolean) } }, select: { id: true, name: true } });
      const wn = new Map(ws.map((w) => [w.id, w.name]));
      return evs.map((e) => ({
        evento: e.type.replace('S', 'S-'),
        trabalhador: e.workerId ? wn.get(e.workerId) : '',
        status: e.status.replace(/_/g, ' '),
        versao: e.currentVersion,
        pendencias: ((e.versions[0]?.issues as { severidade: string }[]) ?? []).filter((i) => i.severidade === 'erro').length,
        recibo: e.receiptNumber ? `${e.receiptNumber}${e.receiptSource?.startsWith('informado') ? ' (manual)' : ''}` : '',
        atualizado: d(e.updatedAt),
      }));
    },
  },
];

export const getReport = (key: string) => REPORTS.find((r) => r.key === key);
export const canRun = (ctx: ReportCtx, def: ReportDef) => def.permissions.every((p) => ctx.permissions.has(p));
