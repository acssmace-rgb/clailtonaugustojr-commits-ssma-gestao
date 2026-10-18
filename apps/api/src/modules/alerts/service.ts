import { prisma } from '../../lib/prisma.js';
import { readSettings } from '../../lib/settings.js';

export interface AlertScope {
  tenantId: string;
  settings: unknown;
  permissions: Set<string>;
  companyIds: string[];
  unitIds: string[];
  filter?: { companyId?: string; unitId?: string };
}

export interface Alert {
  key: string;
  kind: 'documento' | 'tarefa' | 'exame' | 'treinamento' | 'epi' | 'ca_epi' | 'esocial';
  severity: 'vencido' | 'a_vencer' | 'pendencia';
  title: string;
  dueDate: string | null;
  link: string;
  /** Usuários diretamente responsáveis (para notificação) */
  responsibleIds: string[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

function scopeFor(s: AlertScope, company: string, unit?: string) {
  const w: Record<string, unknown> = { tenantId: s.tenantId };
  const set = (path: string, v: unknown) => {
    const parts = path.split('.');
    let cur = w;
    for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
    cur[parts.at(-1)!] = v;
  };
  if (s.companyIds.length) set(company, { in: s.companyIds });
  if (s.unitIds.length && unit) set(unit, { in: s.unitIds });
  if (s.filter?.companyId) set(company, s.filter.companyId);
  if (s.filter?.unitId && unit) set(unit, s.filter.unitId);
  return w;
}

/**
 * Calcula alertas de vencimento/pendência a partir dos dados.
 * Antecedências vêm das configurações do cliente (não são exigências legais fixas).
 */
export async function computeAlerts(s: AlertScope): Promise<Alert[]> {
  const cfg = readSettings(s.settings).alertDays;
  const today = new Date(day(new Date()));
  const alerts: Alert[] = [];
  const sev = (d: Date) => (d < today ? 'vencido' : 'a_vencer') as Alert['severity'];

  if (s.permissions.has('documents.read')) {
    const docs = await prisma.document.findMany({
      where: { ...scopeFor(s, 'companyId', 'unitId'), status: { not: 'obsoleto' }, validUntil: { lte: addDays(today, cfg.documents) } },
      orderBy: { validUntil: 'asc' },
    });
    for (const d of docs)
      alerts.push({
        key: `doc:${d.id}:${sev(d.validUntil!)}`,
        kind: 'documento',
        severity: sev(d.validUntil!),
        title: `${d.type} — ${d.title}`,
        dueDate: day(d.validUntil!),
        link: `/documentos/${d.id}`,
        responsibleIds: d.responsibleId ? [d.responsibleId] : [],
      });
  }

  if (s.permissions.has('tasks.read')) {
    const tasks = await prisma.task.findMany({
      where: { ...scopeFor(s, 'companyId', 'unitId'), status: { in: ['aberta', 'em_andamento'] }, dueDate: { lte: addDays(today, cfg.tasks) } },
      orderBy: { dueDate: 'asc' },
    });
    for (const t of tasks)
      alerts.push({
        key: `task:${t.id}:${sev(t.dueDate!)}`,
        kind: 'tarefa',
        severity: sev(t.dueDate!),
        title: t.title,
        dueDate: day(t.dueDate!),
        link: `/atividades/${t.id}`,
        responsibleIds: [t.assigneeId ?? t.createdById],
      });
  }

  if (s.permissions.has('health.read')) {
    // Considera apenas o exame mais recente de cada trabalhador ativo
    const exams = await prisma.exam.findMany({
      where: { ...scopeFor(s, 'worker.companyId', 'worker.unitId'), worker: { ...(scopeFor(s, 'companyId', 'unitId') as object), status: { not: 'desligado' } }, nextDueDate: { not: null } },
      orderBy: { examDate: 'desc' },
      include: { worker: { select: { id: true, name: true } } },
    });
    const seen = new Set<string>();
    for (const e of exams) {
      if (seen.has(e.workerId)) continue;
      seen.add(e.workerId);
      if (e.nextDueDate! > addDays(today, cfg.exams)) continue;
      alerts.push({
        key: `exam:${e.id}:${sev(e.nextDueDate!)}`,
        kind: 'exame',
        severity: sev(e.nextDueDate!),
        title: `Exame periódico — ${e.worker.name}`,
        dueDate: day(e.nextDueDate!),
        link: `/sst/exames?workerId=${e.workerId}`,
        responsibleIds: [],
      });
    }
  }

  if (s.permissions.has('trainings.read')) {
    const recs = await prisma.trainingRecord.findMany({
      where: { ...scopeFor(s, 'worker.companyId', 'worker.unitId'), validUntil: { lte: addDays(today, cfg.trainings) }, worker: { status: { not: 'desligado' } } },
      orderBy: { validUntil: 'desc' },
      include: { worker: { select: { name: true } }, training: { select: { name: true } } },
    });
    // Ignora registros já renovados (há outro mais recente do mesmo treinamento)
    const latest = await prisma.trainingRecord.groupBy({
      by: ['workerId', 'trainingId'],
      where: { tenantId: s.tenantId },
      _max: { completedAt: true },
    });
    const latestMap = new Map(latest.map((l) => [`${l.workerId}:${l.trainingId}`, l._max.completedAt?.getTime()]));
    for (const t of recs) {
      if (latestMap.get(`${t.workerId}:${t.trainingId}`) !== t.completedAt.getTime()) continue;
      alerts.push({
        key: `training:${t.id}:${sev(t.validUntil!)}`,
        kind: 'treinamento',
        severity: sev(t.validUntil!),
        title: `${t.training.name} — ${t.worker.name}`,
        dueDate: day(t.validUntil!),
        link: `/sst/treinamentos`,
        responsibleIds: [],
      });
    }
  }

  if (s.permissions.has('ppe.read')) {
    const deliveries = await prisma.ppeDelivery.findMany({
      where: { ...scopeFor(s, 'worker.companyId', 'worker.unitId'), replaceBy: { lte: addDays(today, cfg.ppe) }, worker: { status: { not: 'desligado' } } },
      include: { worker: { select: { name: true } }, ppe: { select: { name: true } } },
    });
    const latest = await prisma.ppeDelivery.groupBy({ by: ['workerId', 'ppeId'], where: { tenantId: s.tenantId }, _max: { deliveredAt: true } });
    const latestMap = new Map(latest.map((l) => [`${l.workerId}:${l.ppeId}`, l._max.deliveredAt?.getTime()]));
    for (const d of deliveries) {
      if (latestMap.get(`${d.workerId}:${d.ppeId}`) !== d.deliveredAt.getTime()) continue;
      alerts.push({
        key: `ppe:${d.id}:${sev(d.replaceBy!)}`,
        kind: 'epi',
        severity: sev(d.replaceBy!),
        title: `Troca de EPI: ${d.ppe.name} — ${d.worker.name}`,
        dueDate: day(d.replaceBy!),
        link: `/sst/epis`,
        responsibleIds: [],
      });
    }
    const cas = await prisma.ppe.findMany({ where: { tenantId: s.tenantId, active: true, caValidUntil: { lte: addDays(today, cfg.ppe) } } });
    for (const p of cas)
      alerts.push({
        key: `ca:${p.id}:${sev(p.caValidUntil!)}`,
        kind: 'ca_epi',
        severity: sev(p.caValidUntil!),
        title: `Validade do CA ${p.ca ?? ''} — ${p.name}`,
        dueDate: day(p.caValidUntil!),
        link: `/sst/epis`,
        responsibleIds: [],
      });
  }

  if (s.permissions.has('esocial.read')) {
    const evs = await prisma.esocialEvent.findMany({
      where: { ...scopeFor(s, 'companyId'), status: { in: ['com_pendencias', 'rejeitado', 'erro_transmissao'] } },
    });
    for (const e of evs)
      alerts.push({
        key: `esocial:${e.id}:${e.status}`,
        kind: 'esocial',
        severity: 'pendencia',
        title: `Evento ${e.type.replace('S', 'S-')} — ${e.status.replace('_', ' ')}`,
        dueDate: null,
        link: `/esocial/${e.id}`,
        responsibleIds: [e.createdById],
      });
  }

  const order = { vencido: 0, pendencia: 1, a_vencer: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity] || (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
}
