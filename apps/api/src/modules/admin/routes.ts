import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { hashPassword, passwordSchema } from '../../lib/password.js';
import { ALL_PERMISSIONS, PERMISSIONS } from '../../lib/permissions.js';
import { readSettings, settingsSchema } from '../../lib/settings.js';
import { createTenant } from '../../lib/tenants.js';
import { zId, zPage } from '../../lib/zod.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { config } from '../../lib/config.js';
import { sendEmail } from '../../lib/mailer.js';

const TAG = 'Administração';

export async function adminRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ---------- Clientes (somente superadministrador) ----------
  r.get('/tenants', { preValidation: app.authenticate, schema: { tags: [TAG], summary: 'Listar clientes (superadmin)' } }, async (req) => {
    if (!req.user!.isSuperAdmin) throw forbidden();
    return prisma.tenant.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { companies: true, memberships: true } } } });
  });

  r.post(
    '/tenants',
    {
      preValidation: app.authenticate,
      schema: {
        tags: [TAG],
        summary: 'Criar cliente (superadmin)',
        body: z.object({ name: z.string().trim().min(2).max(200), slug: z.string().regex(/^[a-z0-9-]{2,60}$/, 'Use letras minúsculas, números e hífen') }),
      },
    },
    async (req, reply) => {
      if (!req.user!.isSuperAdmin) throw forbidden();
      const tenant = await createTenant(req.body);
      await audit(req, 'criar', 'tenant', tenant.id, req.body, tenant.id);
      reply.code(201);
      return tenant;
    },
  );

  // ---------- Configurações do cliente ----------
  r.get('/settings', { preValidation: app.requirePerm('org.read'), schema: { tags: [TAG], summary: 'Configurações do cliente' } }, async (req) =>
    readSettings(req.tenant!.settings),
  );

  r.put(
    '/settings',
    { preValidation: app.requirePerm('admin.settings'), schema: { tags: [TAG], summary: 'Atualizar configurações', body: settingsSchema } },
    async (req) => {
      const before = readSettings(req.tenant!.settings);
      await prisma.tenant.update({ where: { id: req.tenant!.id }, data: { settings: req.body } });
      await audit(req, 'atualizar', 'settings', req.tenant!.id, diff(before, req.body));
      return req.body;
    },
  );

  // ---------- Permissões e papéis ----------
  r.get('/permissions', { preValidation: app.authenticate, schema: { tags: [TAG], summary: 'Catálogo de permissões' } }, async () =>
    Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description, module: key.split('.')[0] })),
  );

  r.get('/roles', { preValidation: app.requirePerm('admin.users'), schema: { tags: [TAG], summary: 'Papéis do cliente' } }, async (req) =>
    prisma.role.findMany({ where: { tenantId: req.tenant!.id }, orderBy: [{ system: 'desc' }, { name: 'asc' }] }),
  );

  const roleBody = z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(300).optional(),
    permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).min(1),
  });

  r.post('/roles', { preValidation: app.requirePerm('admin.users'), schema: { tags: [TAG], summary: 'Criar papel personalizado', body: roleBody } }, async (req, reply) => {
    const role = await prisma.role.create({
      data: { ...req.body, tenantId: req.tenant!.id, key: `custom_${randomToken(6).toLowerCase()}`, system: false },
    });
    await audit(req, 'criar', 'role', role.id, req.body);
    reply.code(201);
    return role;
  });

  r.patch(
    '/roles/:id',
    { preValidation: app.requirePerm('admin.users'), schema: { tags: [TAG], summary: 'Atualizar papel personalizado', params: z.object({ id: zId }), body: roleBody.partial() } },
    async (req) => {
      const role = await prisma.role.findFirst({ where: { id: req.params.id, tenantId: req.tenant!.id } });
      if (!role) throw notFound('Papel');
      if (role.system) throw badRequest('Papéis padrão não podem ser alterados; crie um papel personalizado');
      const updated = await prisma.role.update({ where: { id: role.id }, data: req.body });
      await audit(req, 'atualizar', 'role', role.id, diff(role, updated));
      return updated;
    },
  );

  // ---------- Usuários do cliente ----------
  r.get('/users', { preValidation: app.requirePerm('tasks.read'), schema: { tags: [TAG], summary: 'Usuários do cliente' } }, async (req) => {
    const full = req.membership!.permissions.has('admin.users');
    const ms = await prisma.membership.findMany({
      where: { tenantId: req.tenant!.id },
      include: { user: true, role: true },
      orderBy: { user: { name: 'asc' } },
    });
    return ms.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: full ? m.user.email : undefined,
      active: m.user.active,
      mfaEnabled: full ? m.user.mfaEnabled : undefined,
      lastLoginAt: full ? m.user.lastLoginAt : undefined,
      role: { id: m.role.id, name: m.role.name, key: m.role.key },
      companyIds: m.companyIds,
      unitIds: m.unitIds,
    }));
  });

  const scopeShape = { companyIds: z.array(zId).default([]), unitIds: z.array(zId).default([]) };

  async function validateScope(tenantId: string, companyIds: string[], unitIds: string[]) {
    const [c, u] = await Promise.all([
      prisma.company.count({ where: { tenantId, id: { in: companyIds } } }),
      prisma.unit.count({ where: { tenantId, id: { in: unitIds } } }),
    ]);
    if (c !== companyIds.length || u !== unitIds.length) throw badRequest('Empresa ou unidade inválida no escopo');
  }

  r.post(
    '/users',
    {
      preValidation: app.requirePerm('admin.users'),
      schema: {
        tags: [TAG],
        summary: 'Adicionar usuário ao cliente (cria a conta se não existir)',
        body: z.object({
          name: z.string().trim().min(2).max(200),
          email: z.string().email().max(200),
          roleId: zId,
          password: passwordSchema.optional(),
          ...scopeShape,
        }),
      },
    },
    async (req, reply) => {
      const tenantId = req.tenant!.id;
      const role = await prisma.role.findFirst({ where: { id: req.body.roleId, tenantId } });
      if (!role) throw badRequest('Papel inválido');
      await validateScope(tenantId, req.body.companyIds, req.body.unitIds);
      const email = req.body.email.trim().toLowerCase();
      let user = await prisma.user.findUnique({ where: { email } });
      let invited = false;
      if (!user) {
        user = await prisma.user.create({
          data: { email, name: req.body.name, passwordHash: await hashPassword(req.body.password ?? randomToken(24)) },
        });
        if (!req.body.password) {
          // Envia link para o próprio usuário definir a senha
          const token = randomToken();
          await prisma.passwordResetToken.create({
            data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 72 * 3600_000) },
          });
          invited = await sendEmail({
            to: email,
            subject: 'SSMA Gestão — convite de acesso',
            text: `Olá, ${req.body.name}.\n\nVocê recebeu acesso ao SSMA Gestão (${req.tenant!.name}). Defina sua senha em até 72 horas:\n${config.APP_ORIGIN}/redefinir-senha?token=${token}`,
          });
        }
      }
      const exists = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId } } });
      if (exists) throw conflict('Usuário já vinculado a este cliente');
      await prisma.membership.create({
        data: { userId: user.id, tenantId, roleId: role.id, companyIds: req.body.companyIds, unitIds: req.body.unitIds },
      });
      await audit(req, 'vincular_usuario', 'user', user.id, { role: role.key, companyIds: req.body.companyIds, unitIds: req.body.unitIds });
      reply.code(201);
      return { id: user.id, invitedByEmail: invited };
    },
  );

  r.patch(
    '/users/:id',
    {
      preValidation: app.requirePerm('admin.users'),
      schema: {
        tags: [TAG],
        summary: 'Alterar papel/escopo do usuário no cliente',
        params: z.object({ id: zId }),
        body: z.object({ roleId: zId.optional(), companyIds: z.array(zId).optional(), unitIds: z.array(zId).optional() }),
      },
    },
    async (req) => {
      const tenantId = req.tenant!.id;
      const m = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: req.params.id, tenantId } } });
      if (!m) throw notFound('Usuário');
      if (req.body.roleId && !(await prisma.role.findFirst({ where: { id: req.body.roleId, tenantId } }))) throw badRequest('Papel inválido');
      await validateScope(tenantId, req.body.companyIds ?? [], req.body.unitIds ?? []);
      if (req.params.id === req.user!.id && req.body.roleId && req.body.roleId !== m.roleId)
        throw badRequest('Você não pode alterar o próprio papel');
      const updated = await prisma.membership.update({ where: { id: m.id }, data: req.body });
      await audit(req, 'alterar_acesso', 'user', req.params.id, diff(m, updated));
      return { ok: true };
    },
  );

  r.delete(
    '/users/:id',
    { preValidation: app.requirePerm('admin.users'), schema: { tags: [TAG], summary: 'Remover acesso do usuário ao cliente', params: z.object({ id: zId }) } },
    async (req) => {
      if (req.params.id === req.user!.id) throw badRequest('Você não pode remover o próprio acesso');
      const m = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: req.params.id, tenantId: req.tenant!.id } } });
      if (!m) throw notFound('Usuário');
      await prisma.membership.delete({ where: { id: m.id } });
      await audit(req, 'remover_acesso', 'user', req.params.id);
      return { ok: true };
    },
  );

  // ---------- Auditoria ----------
  r.get(
    '/audit',
    {
      preValidation: app.requirePerm('audit.read'),
      schema: {
        tags: [TAG],
        summary: 'Trilha de auditoria do cliente',
        querystring: zPage.extend({
          entity: z.string().max(50).optional(),
          entityId: z.string().max(60).optional(),
          userId: z.string().max(60).optional(),
          from: z.string().date().optional(),
          to: z.string().date().optional(),
        }),
      },
    },
    async (req) => {
      const { page, pageSize, entity, entityId, userId, from, to } = req.query;
      const where = {
        tenantId: req.tenant!.id,
        entity: entity || undefined,
        entityId: entityId || undefined,
        userId: userId || undefined,
        createdAt: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(`${to}T23:59:59Z`) : undefined } : undefined,
      };
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.auditLog.count({ where }),
      ]);
      const users = await prisma.user.findMany({ where: { id: { in: items.map((i) => i.userId!).filter(Boolean) } }, select: { id: true, name: true } });
      const names = new Map(users.map((u) => [u.id, u.name]));
      return { items: items.map((i) => ({ ...i, userName: i.userId ? names.get(i.userId) : null })), total, page, pageSize };
    },
  );
}
