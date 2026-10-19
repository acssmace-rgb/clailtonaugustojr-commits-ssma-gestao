import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { tablePdf } from '../../lib/pdf.js';
import { toCsv, toXlsx } from '../../lib/export.js';
import { readSettings } from '../../lib/settings.js';
import { zId } from '../../lib/zod.js';
import { REPORTS, canRun, getReport, riskClass, type ReportCtx, type ReportDef, type ReportFilters } from './definitions.js';

const TAG = 'Relatórios';

export const filtersSchema = z.object({
  companyId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

const ctxFromReq = (req: FastifyRequest): ReportCtx => ({
  tenantId: req.tenant!.id,
  settings: req.tenant!.settings,
  permissions: req.membership!.permissions,
  companyIds: req.membership!.companyIds,
  unitIds: req.membership!.unitIds,
});

export async function renderReport(def: ReportDef, ctx: ReportCtx, filters: ReportFilters, format: 'json' | 'csv' | 'xlsx' | 'pdf', tenantName: string) {
  const rows = await def.rows(ctx, filters);
  const notes = [`Origem: ${def.source}`, ...def.formulas.map((f) => `Fórmula/regra: ${f}`)];
  const subtitle = [
    tenantName,
    filters.from || filters.to ? `Período: ${filters.from ?? '…'} a ${filters.to ?? '…'}` : null,
    `${rows.length} registro(s)`,
  ]
    .filter(Boolean)
    .join(' · ');
  const base = `${def.key}_${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') return { body: toCsv(def.columns, rows), type: 'text/csv; charset=utf-8', file: `${base}.csv` };
  if (format === 'xlsx')
    return { body: await toXlsx({ title: def.title, columns: def.columns, rows, notes }), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', file: `${base}.xlsx` };
  if (format === 'pdf') return { body: await tablePdf({ title: def.title, subtitle, columns: def.columns, rows, notes }), type: 'application/pdf', file: `${base}.pdf` };
  return { json: { key: def.key, title: def.title, columns: def.columns, rows, source: def.source, formulas: def.formulas } };
}

export async function reportRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/reports', { preValidation: app.requirePerm('reports.read'), schema: { tags: [TAG], summary: 'Catálogo de relatórios disponíveis, com origem e fórmulas' } }, async (req) => {
    const ctx = ctxFromReq(req);
    return REPORTS.filter((d) => canRun(ctx, d)).map(({ rows, ...meta }) => (void rows, meta));
  });

  r.get(
    '/reports/:key',
    {
      preValidation: app.requirePerm('reports.read'),
      schema: { tags: [TAG], summary: 'Executar relatório (json, csv, xlsx ou pdf)', params: z.object({ key: z.string().max(40) }), querystring: filtersSchema.extend({ format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json') }) },
    },
    async (req, reply) => {
      const def = getReport(req.params.key);
      if (!def) throw notFound('Relatório');
      const ctx = ctxFromReq(req);
      if (!canRun(ctx, def)) throw forbidden(`Relatório exige: ${def.permissions.join(', ')}`);
      const { format, ...filters } = req.query;
      const out = await renderReport(def, ctx, filters, format, req.tenant!.name);
      if (format !== 'json') await audit(req, 'exportar_relatorio', 'report', def.key, { formato: format, filtros: filters });
      if ('json' in out) return out.json;
      return reply.header('content-type', out.type).header('content-disposition', `attachment; filename="${out.file}"`).send(out.body);
    },
  );

  // ---------- Painel ----------
  r.get('/dashboard', { preValidation: app.requirePerm('reports.read'), schema: { tags: [TAG], summary: 'Indicadores do painel (com fórmulas)', querystring: filtersSchema } }, async (req) => {
    const ctx = ctxFromReq(req);
    const f = req.query;
    const s = readSettings(req.tenant!.settings);
    const t0 = new Date(new Date().toISOString().slice(0, 10));
    const plus = (n: number) => new Date(t0.getTime() + n * 86400_000);
    const scope = (company?: string, unit?: string) => {
      const w: Record<string, unknown> = { tenantId: ctx.tenantId };
      const put = (path: string, v: unknown) => {
        const parts = path.split('.');
        let cur = w;
        for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
        cur[parts.at(-1)!] = v;
      };
      if (company) {
        if (f.companyId) put(company, ctx.companyIds.length && !ctx.companyIds.includes(f.companyId) ? { in: [] } : f.companyId);
        else if (ctx.companyIds.length) put(company, { in: ctx.companyIds });
      }
      if (unit) {
        if (f.unitId) put(unit, ctx.unitIds.length && !ctx.unitIds.includes(f.unitId) ? { in: [] } : f.unitId);
        else if (ctx.unitIds.length) put(unit, { in: ctx.unitIds });
      }
      return w;
    };
    const period = f.from || f.to ? { gte: f.from ? new Date(`${f.from}T00:00:00Z`) : undefined, lte: f.to ? new Date(`${f.to}T23:59:59Z`) : undefined } : undefined;
    const has = (p: string) => ctx.permissions.has(p);
    const kpis: { key: string; label: string; value: number | string; formula: string; tone?: 'ok' | 'warn' | 'bad' }[] = [];
    const charts: Record<string, { label: string; value: number }[]> = {};

    if (has('workers.read')) {
      const v = await prisma.worker.count({ where: { ...scope('companyId', 'unitId'), status: { not: 'desligado' } } });
      kpis.push({ key: 'trabalhadores', label: 'Trabalhadores ativos', value: v, formula: 'Contagem de trabalhadores com status diferente de "desligado".' });
    }
    if (has('tasks.read')) {
      const w = scope('companyId', 'unitId');
      const [abertas, atrasadas, concluidas] = await Promise.all([
        prisma.task.count({ where: { ...w, status: { in: ['aberta', 'em_andamento', 'aguardando_aprovacao'] } } }),
        prisma.task.count({ where: { ...w, status: { in: ['aberta', 'em_andamento'] }, dueDate: { lt: t0 } } }),
        prisma.task.findMany({ where: { ...w, status: 'concluida', completedAt: period, dueDate: { not: null } }, select: { completedAt: true, dueDate: true } }),
      ]);
      const inTime = concluidas.filter((t) => t.completedAt! <= new Date(t.dueDate!.getTime() + 86400_000 - 1)).length;
      kpis.push({ key: 'tarefas_abertas', label: 'Tarefas em aberto', value: abertas, formula: 'Tarefas com status aberta, em andamento ou aguardando aprovação.' });
      kpis.push({ key: 'tarefas_atrasadas', label: 'Tarefas atrasadas', value: atrasadas, tone: atrasadas ? 'bad' : 'ok', formula: 'Tarefas abertas/em andamento com prazo anterior a hoje.' });
      kpis.push({
        key: 'tarefas_no_prazo',
        label: 'Conclusão no prazo',
        value: concluidas.length ? `${Math.round((inTime / concluidas.length) * 100)}%` : '—',
        formula: 'Concluídas no período até o fim do dia do prazo ÷ concluídas no período que tinham prazo × 100.',
      });
      const byStatus = await prisma.task.groupBy({ by: ['status'], where: w, _count: { _all: true } });
      charts.tarefasPorStatus = byStatus.map((b) => ({ label: b.status, value: b._count._all }));
    }
    if (has('documents.read')) {
      const w = { ...scope('companyId', 'unitId'), status: { not: 'obsoleto' as const } };
      const [vencidos, aVencer] = await Promise.all([
        prisma.document.count({ where: { ...w, validUntil: { lt: t0 } } }),
        prisma.document.count({ where: { ...w, validUntil: { gte: t0, lte: plus(s.alertDays.documents) } } }),
      ]);
      kpis.push({ key: 'docs_vencidos', label: 'Documentos vencidos', value: vencidos, tone: vencidos ? 'bad' : 'ok', formula: 'Documentos não obsoletos com validade anterior a hoje.' });
      kpis.push({ key: 'docs_a_vencer', label: `Documentos a vencer (${s.alertDays.documents} dias)`, value: aVencer, tone: aVencer ? 'warn' : 'ok', formula: 'Validade entre hoje e hoje + antecedência configurada.' });
    }
    if (has('health.read')) {
      const ws = await prisma.worker.findMany({
        where: { ...scope('companyId', 'unitId'), status: { not: 'desligado' } },
        select: { exams: { orderBy: { examDate: 'desc' }, take: 1, select: { nextDueDate: true } } },
      });
      const venc = ws.filter((w) => w.exams[0]?.nextDueDate && w.exams[0].nextDueDate < t0).length;
      const semExame = ws.filter((w) => !w.exams.length).length;
      kpis.push({ key: 'exames_vencidos', label: 'Exames vencidos', value: venc, tone: venc ? 'bad' : 'ok', formula: 'Trabalhadores ativos cujo exame mais recente tem próximo vencimento anterior a hoje.' });
      kpis.push({ key: 'sem_exame', label: 'Sem exame registrado', value: semExame, tone: semExame ? 'warn' : 'ok', formula: 'Trabalhadores ativos sem nenhum exame ocupacional cadastrado.' });
    }
    if (has('trainings.read')) {
      const v = await prisma.trainingRecord.count({ where: { ...scope('worker.companyId', 'worker.unitId'), validUntil: { lt: t0 }, worker: { status: { not: 'desligado' } } } });
      kpis.push({ key: 'treinamentos_vencidos', label: 'Registros de treinamento vencidos', value: v, tone: v ? 'warn' : 'ok', formula: 'Registros com validade anterior a hoje (inclui registros já renovados por um mais recente).' });
    }
    if (has('accidents.read')) {
      const by = await prisma.accident.groupBy({ by: ['type'], where: { ...scope('companyId', 'unitId'), occurredAt: period }, _count: { _all: true } });
      const total = by.reduce((a, b) => a + b._count._all, 0);
      kpis.push({ key: 'ocorrencias', label: 'Ocorrências no período', value: total, formula: 'Acidentes, incidentes e quase acidentes com data no período filtrado (todos, se sem período).' });
      charts.ocorrenciasPorTipo = by.map((b) => ({ label: b.type, value: b._count._all }));
    }
    if (has('risks.read')) {
      const rs = await prisma.risk.findMany({ where: { ...scope('sector.unit.companyId', 'sector.unitId'), active: true }, select: { level: true } });
      const counts = new Map<string, number>();
      for (const x of rs) counts.set(riskClass(x.level, req.tenant!.settings), (counts.get(riskClass(x.level, req.tenant!.settings)) ?? 0) + 1);
      charts.riscosPorClasse = ['Baixo', 'Moderado', 'Alto', 'Crítico'].map((label) => ({ label, value: counts.get(label) ?? 0 }));
    }
    if (has('esocial.read')) {
      const by = await prisma.esocialEvent.groupBy({
        by: ['status'],
        where: { ...scope('companyId'), type: has('health.read') ? undefined : { not: 'S2220' } },
        _count: { _all: true },
      });
      charts.esocialPorStatus = by.map((b) => ({ label: b.status, value: b._count._all }));
      const pend = by.filter((b) => ['com_pendencias', 'rejeitado', 'erro_transmissao'].includes(b.status)).reduce((a, b) => a + b._count._all, 0);
      kpis.push({ key: 'esocial_pendentes', label: 'Eventos eSocial com pendência', value: pend, tone: pend ? 'warn' : 'ok', formula: 'Eventos com status com pendências, rejeitado ou erro de transmissão.' });
    }
    return { kpis, charts, generatedAt: new Date().toISOString() };
  });

  // ---------- Agendamentos ----------
  const scheduleBody = z.object({
    name: z.string().trim().min(3).max(200),
    reportKey: z.string().max(40),
    format: z.enum(['csv', 'xlsx', 'pdf']).default('xlsx'),
    frequency: z.enum(['diario', 'semanal', 'mensal']),
    filters: filtersSchema.default({}),
    recipientIds: z.array(zId).min(1).max(50),
    active: z.boolean().optional(),
  });

  async function validateSchedule(req: FastifyRequest, body: { reportKey?: string; recipientIds?: string[] }) {
    if (body.reportKey) {
      const def = getReport(body.reportKey);
      if (!def) throw badRequest('Relatório inexistente');
      if (!canRun(ctxFromReq(req), def)) throw forbidden('Você não pode agendar um relatório que não tem permissão de ver');
    }
    if (body.recipientIds) {
      const n = await prisma.membership.count({ where: { tenantId: req.tenant!.id, userId: { in: body.recipientIds } } });
      if (n !== new Set(body.recipientIds).size) throw badRequest('Todos os destinatários devem ser usuários deste cliente');
    }
  }

  r.get('/report-schedules', { preValidation: app.requirePerm('reports.schedule'), schema: { tags: [TAG], summary: 'Agendamentos de relatórios' } }, async (req) =>
    prisma.reportSchedule.findMany({ where: { tenantId: req.tenant!.id }, orderBy: { name: 'asc' } }),
  );

  r.post('/report-schedules', { preValidation: app.requirePerm('reports.schedule'), schema: { tags: [TAG], summary: 'Agendar relatório', body: scheduleBody } }, async (req, reply) => {
    await validateSchedule(req, req.body);
    const s = await prisma.reportSchedule.create({ data: { ...req.body, tenantId: req.tenant!.id, createdById: req.user!.id } });
    await audit(req, 'criar', 'report_schedule', s.id, req.body);
    reply.code(201);
    return s;
  });

  r.patch(
    '/report-schedules/:id',
    { preValidation: app.requirePerm('reports.schedule'), schema: { tags: [TAG], summary: 'Atualizar agendamento', params: z.object({ id: zId }), body: scheduleBody.partial() } },
    async (req) => {
      const s = await prisma.reportSchedule.findFirst({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!s) throw notFound('Agendamento');
      await validateSchedule(req, req.body);
      const updated = await prisma.reportSchedule.update({ where: { id: s.id }, data: req.body });
      await audit(req, 'atualizar', 'report_schedule', s.id, req.body);
      return updated;
    },
  );

  r.delete('/report-schedules/:id', { preValidation: app.requirePerm('reports.schedule'), schema: { tags: [TAG], summary: 'Excluir agendamento', params: z.object({ id: zId }) } }, async (req) => {
    const s = await prisma.reportSchedule.findFirst({ where: { id: req.params.id, tenantId: req.tenant!.id } });
    if (!s) throw notFound('Agendamento');
    await prisma.reportSchedule.delete({ where: { id: s.id } });
    await audit(req, 'excluir', 'report_schedule', s.id);
    return { ok: true };
  });
}
