import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { zId } from '../../lib/zod.js';
import { computeAlerts } from './service.js';

const TAG = 'Alertas e notificações';

export async function alertRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/alerts',
    {
      preValidation: app.requirePerm(),
      schema: { tags: [TAG], summary: 'Vencimentos e pendências visíveis ao usuário', querystring: z.object({ companyId: z.string().uuid().optional(), unitId: z.string().uuid().optional() }) },
    },
    async (req) => {
      const items = await computeAlerts({
        tenantId: req.tenant!.id,
        settings: req.tenant!.settings,
        permissions: req.membership!.permissions,
        companyIds: req.membership!.companyIds,
        unitIds: req.membership!.unitIds,
        filter: req.query,
      });
      return { items: items.map(({ responsibleIds, ...a }) => (void responsibleIds, a)), total: items.length };
    },
  );

  r.get('/notifications', { preValidation: app.requirePerm(), schema: { tags: [TAG], summary: 'Notificações do usuário no cliente atual' } }, async (req) => {
    const where = { userId: req.user!.id, tenantId: req.tenant!.id };
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items, unread };
  });

  r.post('/notifications/:id/read', { preValidation: app.requirePerm(), schema: { tags: [TAG], summary: 'Marcar como lida', params: z.object({ id: zId }) } }, async (req) => {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { readAt: new Date() } });
    return { ok: true };
  });

  r.post('/notifications/read-all', { preValidation: app.requirePerm(), schema: { tags: [TAG], summary: 'Marcar todas como lidas' } }, async (req) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, tenantId: req.tenant!.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  });
}
