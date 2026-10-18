import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Prisma, Task } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { assertRefs } from '../../lib/refs.js';
import { can, scopedWhere } from '../../lib/tenant.js';
import { notify } from '../../lib/notify.js';
import { registerCrud } from '../../lib/crud.js';
import { storage, newStorageKey } from '../../lib/storage.js';
import { readUpload, contentDisposition } from '../../lib/files.js';
import { zDateOpt, zId, zIdOpt, zPage, zText, zTextOpt } from '../../lib/zod.js';

const TAG = 'Atividades';

/** Próximo prazo da recorrência; meses curtos usam o último dia (31/01 → 28/02). */
export function nextDueDate(from: Date, recurrence: Task['recurrence']): Date | null {
  const addMonths = (n: number) => {
    const y = from.getUTCFullYear();
    const m = from.getUTCMonth() + n;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(from.getUTCDate(), lastDay)));
  };
  const addDays = (n: number) => new Date(from.getTime() + n * 86400_000);
  switch (recurrence) {
    case 'diaria': return addDays(1);
    case 'semanal': return addDays(7);
    case 'mensal': return addMonths(1);
    case 'trimestral': return addMonths(3);
    case 'semestral': return addMonths(6);
    case 'anual': return addMonths(12);
    default: return null;
  }
}

const taskBody = z.object({
  title: zText(300).min(3),
  description: zTextOpt(8000),
  companyId: zIdOpt,
  unitId: zIdOpt,
  actionPlanId: zIdOpt,
  assigneeId: zIdOpt,
  priority: z.enum(['baixa', 'media', 'alta', 'critica']).optional(),
  dueDate: zDateOpt,
  recurrence: z.enum(['nenhuma', 'diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual']).optional(),
  requiresApproval: z.boolean().optional(),
  approverId: zIdOpt,
  origin: z.enum(['manual', 'inspecao', 'acidente', 'documento', 'risco', 'exame', 'esocial', 'ambiental']).optional(),
  originId: z.string().max(60).nullish(),
});

/** Entidades que aceitam anexos/evidências e as permissões exigidas. */
const ATTACH: Record<string, { model: string; read: string; write: string; scope?: { company?: string; unit?: string } }> = {
  task: { model: 'task', read: 'tasks.read', write: 'tasks.write', scope: { company: 'companyId', unit: 'unitId' } },
  action_plan: { model: 'actionPlan', read: 'tasks.read', write: 'tasks.write', scope: { company: 'companyId', unit: 'unitId' } },
  accident: { model: 'accident', read: 'accidents.read', write: 'accidents.write', scope: { company: 'companyId', unit: 'unitId' } },
  ppe_delivery: { model: 'ppeDelivery', read: 'ppe.read', write: 'ppe.write', scope: { company: 'worker.companyId', unit: 'worker.unitId' } },
  training_record: { model: 'trainingRecord', read: 'trainings.read', write: 'trainings.write', scope: { company: 'worker.companyId', unit: 'worker.unitId' } },
};

export async function taskRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  async function loadTask(req: FastifyRequest, id: string) {
    const t = await prisma.task.findFirst({ where: { ...scopedWhere(req, { company: 'companyId', unit: 'unitId' }), id } });
    if (!t) throw notFound('Tarefa');
    return t;
  }

  /** Sem `tasks.approve`, o usuário só altera tarefas que criou ou que estão atribuídas a ele. */
  function assertCanEdit(req: FastifyRequest, t: Task) {
    if (can(req, 'tasks.approve')) return;
    if (t.assigneeId !== req.user!.id && t.createdById !== req.user!.id) throw forbidden('Você só pode alterar tarefas atribuídas a você');
  }

  async function completeTask(req: FastifyRequest, t: Task) {
    if (t.requiresApproval) {
      const updated = await prisma.task.update({ where: { id: t.id }, data: { status: 'aguardando_aprovacao' } });
      await notify(t.tenantId, [t.approverId ?? t.createdById], {
        kind: 'tarefa_aprovacao',
        title: `Tarefa aguardando aprovação: ${t.title}`,
        link: `/atividades/${t.id}`,
      });
      return updated;
    }
    const updated = await prisma.task.update({ where: { id: t.id }, data: { status: 'concluida', completedAt: new Date() } });
    await spawnRecurrence(t);
    return updated;
  }

  async function spawnRecurrence(t: Task) {
    if (t.recurrence === 'nenhuma' || !t.dueDate) return;
    const due = nextDueDate(t.dueDate, t.recurrence);
    if (!due) return;
    const { id, createdAt, updatedAt, completedAt, approvedAt, approvedById, rejectionReason, status, ...copy } = t;
    void [createdAt, updatedAt, completedAt, approvedAt, approvedById, rejectionReason, status];
    await prisma.task.create({ data: { ...copy, dueDate: due, previousTaskId: id, status: 'aberta' } });
  }

  r.get(
    '/tasks',
    {
      preValidation: app.requirePerm('tasks.read'),
      schema: {
        tags: [TAG],
        summary: 'Listar tarefas',
        querystring: zPage.extend({
          status: z.string().optional(),
          priority: z.string().optional(),
          assigneeId: z.string().optional(),
          actionPlanId: z.string().optional(),
          companyId: z.string().optional(),
          unitId: z.string().optional(),
          mine: z.enum(['true', 'false']).optional(),
          overdue: z.enum(['true', 'false']).optional(),
        }),
      },
    },
    async (req) => {
      const { page, pageSize, q, mine, overdue, status, ...f } = req.query;
      const where: Prisma.TaskWhereInput = scopedWhere(req, { company: 'companyId', unit: 'unitId' });
      if (status) where.status = { in: status.split(',') as Task['status'][] };
      if (f.priority) where.priority = f.priority as Task['priority'];
      if (f.assigneeId) where.assigneeId = f.assigneeId;
      if (f.actionPlanId) where.actionPlanId = f.actionPlanId;
      if (f.companyId) where.companyId = f.companyId;
      if (f.unitId) where.unitId = f.unitId;
      if (mine === 'true') where.OR = [{ assigneeId: req.user!.id }, { approverId: req.user!.id, status: 'aguardando_aprovacao' }];
      if (overdue === 'true') {
        where.dueDate = { lt: new Date(new Date().toISOString().slice(0, 10)) };
        where.status = { in: ['aberta', 'em_andamento'] };
      }
      if (q) where.AND = [{ OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] }];
      const [items, total] = await Promise.all([
        prisma.task.findMany({
          where,
          orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { actionPlan: { select: { id: true, title: true } }, _count: { select: { comments: true } } },
        }),
        prisma.task.count({ where }),
      ]);
      return { items, total, page, pageSize };
    },
  );

  r.get('/tasks/:id', { preValidation: app.requirePerm('tasks.read'), schema: { tags: [TAG], summary: 'Detalhe da tarefa com comentários, evidências e histórico', params: z.object({ id: zId }) } }, async (req) => {
    const t = await loadTask(req, req.params.id);
    const [comments, attachments, history] = await Promise.all([
      prisma.taskComment.findMany({ where: { taskId: t.id }, orderBy: { createdAt: 'asc' } }),
      prisma.attachment.findMany({ where: { tenantId: t.tenantId, entity: 'task', entityId: t.id }, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.findMany({ where: { tenantId: t.tenantId, entity: 'task', entityId: t.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const userIds = [...comments.map((c) => c.userId), ...history.map((h) => h.userId), ...attachments.map((a) => a.uploadedById)].filter(Boolean) as string[];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    return {
      ...t,
      comments: comments.map((c) => ({ ...c, userName: name.get(c.userId) })),
      attachments: attachments.map((a) => ({ ...a, storageKey: undefined, uploadedByName: name.get(a.uploadedById) })),
      history: history.map((h) => ({ ...h, userName: h.userId ? name.get(h.userId) : null })),
    };
  });

  r.post('/tasks', { preValidation: app.requirePerm('tasks.write'), schema: { tags: [TAG], summary: 'Criar tarefa', body: taskBody } }, async (req, reply) => {
    await assertRefs(req, req.body);
    const t = await prisma.task.create({ data: { ...req.body, tenantId: req.tenant!.id, createdById: req.user!.id } });
    await audit(req, 'criar', 'task', t.id, req.body);
    if (t.assigneeId && t.assigneeId !== req.user!.id)
      await notify(t.tenantId, [t.assigneeId], { kind: 'tarefa_atribuida', title: `Nova tarefa: ${t.title}`, link: `/atividades/${t.id}` });
    reply.code(201);
    return t;
  });

  r.patch(
    '/tasks/:id',
    {
      preValidation: app.requirePerm('tasks.write'),
      schema: {
        tags: [TAG],
        summary: 'Atualizar tarefa',
        params: z.object({ id: zId }),
        body: taskBody.partial().extend({ status: z.enum(['aberta', 'em_andamento', 'cancelada']).optional() }),
      },
    },
    async (req) => {
      const t = await loadTask(req, req.params.id);
      assertCanEdit(req, t);
      if (t.status === 'concluida') throw badRequest('Tarefa concluída não pode ser alterada');
      await assertRefs(req, req.body);
      const updated = await prisma.task.update({ where: { id: t.id }, data: req.body });
      await audit(req, 'atualizar', 'task', t.id, diff(t, updated));
      if (req.body.assigneeId && req.body.assigneeId !== t.assigneeId)
        await notify(t.tenantId, [req.body.assigneeId], { kind: 'tarefa_atribuida', title: `Tarefa atribuída a você: ${t.title}`, link: `/atividades/${t.id}` });
      return updated;
    },
  );

  r.post('/tasks/:id/complete', { preValidation: app.requirePerm('tasks.write'), schema: { tags: [TAG], summary: 'Concluir tarefa (vai para aprovação se exigida)', params: z.object({ id: zId }) } }, async (req) => {
    const t = await loadTask(req, req.params.id);
    assertCanEdit(req, t);
    if (!['aberta', 'em_andamento'].includes(t.status)) throw badRequest('A tarefa não está em andamento');
    const updated = await completeTask(req, t);
    await audit(req, updated.status === 'concluida' ? 'concluir' : 'enviar_aprovacao', 'task', t.id);
    return updated;
  });

  r.post(
    '/tasks/:id/review',
    {
      preValidation: app.requirePerm('tasks.approve'),
      schema: {
        tags: [TAG],
        summary: 'Aprovar ou reprovar conclusão da tarefa',
        params: z.object({ id: zId }),
        body: z.object({ approve: z.boolean(), reason: zTextOpt(2000) }),
      },
    },
    async (req) => {
      const t = await loadTask(req, req.params.id);
      if (t.status !== 'aguardando_aprovacao') throw badRequest('A tarefa não está aguardando aprovação');
      if (t.approverId && t.approverId !== req.user!.id && !req.user!.isSuperAdmin) throw forbidden('Somente o aprovador designado pode avaliar');
      if (!req.body.approve && !req.body.reason) throw badRequest('Informe o motivo da reprovação');
      const updated = req.body.approve
        ? await prisma.task.update({
            where: { id: t.id },
            data: { status: 'concluida', completedAt: new Date(), approvedAt: new Date(), approvedById: req.user!.id, rejectionReason: null },
          })
        : await prisma.task.update({ where: { id: t.id }, data: { status: 'em_andamento', rejectionReason: req.body.reason } });
      if (req.body.approve) await spawnRecurrence(t);
      await audit(req, req.body.approve ? 'aprovar' : 'reprovar', 'task', t.id, { motivo: req.body.reason });
      await notify(t.tenantId, [t.assigneeId], {
        kind: 'tarefa_avaliada',
        title: `${req.body.approve ? 'Aprovada' : 'Reprovada'}: ${t.title}`,
        body: req.body.reason ?? undefined,
        link: `/atividades/${t.id}`,
      });
      return updated;
    },
  );

  r.post(
    '/tasks/:id/comments',
    { preValidation: app.requirePerm('tasks.read'), schema: { tags: [TAG], summary: 'Comentar na tarefa', params: z.object({ id: zId }), body: z.object({ body: zText(4000).min(1) }) } },
    async (req, reply) => {
      const t = await loadTask(req, req.params.id);
      const c = await prisma.taskComment.create({ data: { tenantId: t.tenantId, taskId: t.id, userId: req.user!.id, body: req.body.body } });
      await audit(req, 'comentar', 'task', t.id);
      await notify(t.tenantId, [t.assigneeId, t.createdById].filter((u) => u !== req.user!.id), {
        kind: 'tarefa_comentario',
        title: `Novo comentário em: ${t.title}`,
        link: `/atividades/${t.id}`,
      });
      reply.code(201);
      return c;
    },
  );

  registerCrud(app, {
    path: '/action-plans',
    model: 'actionPlan',
    entity: 'action_plan',
    label: 'Plano de ação',
    tag: TAG,
    read: 'tasks.read',
    write: 'tasks.write',
    scope: { company: 'companyId', unit: 'unitId' },
    searchFields: ['title', 'objective'],
    filters: ['companyId', 'unitId', 'status'],
    include: { tasks: { select: { id: true, status: true, dueDate: true } } },
    createSchema: z.object({
      title: zText(300).min(3),
      objective: zTextOpt(4000),
      companyId: zIdOpt,
      unitId: zIdOpt,
      ownerId: zIdOpt,
      origin: zTextOpt(100),
      status: z.enum(['aberto', 'em_andamento', 'concluido', 'cancelado']).optional(),
      dueDate: zDateOpt,
    }),
    toOutput: (row) => {
      const tasks = (row.tasks as { status: string }[]) ?? [];
      const done = tasks.filter((t) => t.status === 'concluida').length;
      return { ...row, progress: { total: tasks.length, done, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 } };
    },
  });

  // ---------- Anexos / evidências ----------
  async function assertAttachTarget(req: FastifyRequest, entity: string, entityId: string, mode: 'read' | 'write') {
    const cfg = ATTACH[entity];
    if (!cfg) throw badRequest('Tipo de registro não aceita anexos');
    if (!can(req, cfg[mode])) throw forbidden();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any)[cfg.model].findFirst({ where: { ...scopedWhere(req, cfg.scope), id: entityId }, select: { id: true } });
    if (!row) throw notFound('Registro');
  }

  r.get(
    '/attachments',
    { preValidation: app.requirePerm(), schema: { tags: [TAG], summary: 'Listar anexos de um registro', querystring: z.object({ entity: z.string().max(40), entityId: zId }) } },
    async (req) => {
      await assertAttachTarget(req, req.query.entity, req.query.entityId, 'read');
      const items = await prisma.attachment.findMany({
        where: { tenantId: req.tenant!.id, entity: req.query.entity, entityId: req.query.entityId },
        orderBy: { createdAt: 'desc' },
      });
      return items.map((a) => ({ ...a, storageKey: undefined }));
    },
  );

  r.post(
    '/attachments/:entity/:entityId',
    { preValidation: app.requirePerm(), schema: { tags: [TAG], summary: 'Enviar anexo/evidência (multipart, campo "file")', params: z.object({ entity: z.string().max(40), entityId: zId }), consumes: ['multipart/form-data'] } },
    async (req, reply) => {
      await assertAttachTarget(req, req.params.entity, req.params.entityId, 'write');
      const f = await readUpload(await req.file());
      const storageKey = newStorageKey(req.tenant!.id, 'anexos');
      await storage.put(storageKey, f.buffer, f.mimeType);
      const a = await prisma.attachment.create({
        data: {
          tenantId: req.tenant!.id,
          entity: req.params.entity,
          entityId: req.params.entityId,
          fileName: f.fileName,
          mimeType: f.mimeType,
          size: f.size,
          sha256: f.sha256,
          storageKey,
          uploadedById: req.user!.id,
        },
      });
      await audit(req, 'anexar', req.params.entity, req.params.entityId, { arquivo: f.fileName, sha256: f.sha256 });
      reply.code(201);
      return { ...a, storageKey: undefined };
    },
  );

  r.get('/attachments/:id/download', { preValidation: app.requirePerm(), schema: { tags: [TAG], summary: 'Baixar anexo', params: z.object({ id: zId }) } }, async (req, reply) => {
    const a = await prisma.attachment.findFirst({ where: { id: req.params.id, tenantId: req.tenant!.id } });
    if (!a) throw notFound('Anexo');
    await assertAttachTarget(req, a.entity, a.entityId, 'read');
    await audit(req, 'baixar_anexo', a.entity, a.entityId, { anexo: a.id });
    return reply.header('content-type', a.mimeType).header('content-disposition', contentDisposition(a.fileName)).send(await storage.get(a.storageKey));
  });

  r.delete('/attachments/:id', { preValidation: app.requirePerm(), schema: { tags: [TAG], summary: 'Remover anexo', params: z.object({ id: zId }) } }, async (req) => {
    const a = await prisma.attachment.findFirst({ where: { id: req.params.id, tenantId: req.tenant!.id } });
    if (!a) throw notFound('Anexo');
    await assertAttachTarget(req, a.entity, a.entityId, 'write');
    await prisma.attachment.delete({ where: { id: a.id } });
    await storage.remove(a.storageKey);
    await audit(req, 'remover_anexo', a.entity, a.entityId, { arquivo: a.fileName });
    return { ok: true };
  });
}
