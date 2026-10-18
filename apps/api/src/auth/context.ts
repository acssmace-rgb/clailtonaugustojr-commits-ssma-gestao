import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';
import { sha256 } from '../lib/crypto.js';
import { HttpError, forbidden } from '../lib/errors.js';
import { ALL_PERMISSIONS } from '../lib/permissions.js';
import { config } from '../lib/config.js';

export const SESSION_COOKIE = 'ssma_sid';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email: string; name: string; isSuperAdmin: boolean; mfaEnabled: boolean };
    sessionId?: string;
    mfaPending?: boolean;
    tenant?: { id: string; name: string; isDemo: boolean; settings: Record<string, unknown> };
    membership?: { roleKey: string; roleName: string; permissions: Set<string>; companyIds: string[]; unitIds: string[] };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    requirePerm: (...perms: string[]) => (req: FastifyRequest) => Promise<void>;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MFA_PENDING_ALLOWED = new Set(['/api/auth/mfa/verify', '/api/auth/logout', '/api/auth/me']);

async function contextPlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    // Proteção CSRF: requisições que alteram estado precisam do cabeçalho customizado
    // (bloqueado entre origens pelo CORS) e, se houver Origin, ela deve ser a da aplicação.
    if (!SAFE_METHODS.has(req.method) && req.url.startsWith('/api/')) {
      const origin = req.headers.origin;
      if (origin && origin !== config.APP_ORIGIN) throw new HttpError(403, 'Origem não permitida', 'csrf');
      if (req.headers['x-requested-with'] !== 'ssma') throw new HttpError(403, 'Requisição inválida', 'csrf');
    }

    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session || session.expiresAt < new Date() || !session.user.active) return;
    req.sessionId = session.id;
    req.mfaPending = session.mfaPending;
    const u = session.user;
    req.user = { id: u.id, email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin, mfaEnabled: u.mfaEnabled };

    const tenantId = req.headers['x-tenant-id'];
    if (typeof tenantId !== 'string' || !tenantId || session.mfaPending) return;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.active) return;
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: u.id, tenantId } },
      include: { role: true },
    });
    if (!membership && !u.isSuperAdmin) return;
    req.tenant = { id: tenant.id, name: tenant.name, isDemo: tenant.isDemo, settings: (tenant.settings ?? {}) as Record<string, unknown> };
    req.membership = membership
      ? {
          roleKey: membership.role.key,
          roleName: membership.role.name,
          permissions: new Set(membership.role.permissions),
          companyIds: membership.companyIds,
          unitIds: membership.unitIds,
        }
      : { roleKey: 'superadmin', roleName: 'Superadministrador', permissions: new Set(ALL_PERMISSIONS), companyIds: [], unitIds: [] };
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (!req.user) throw new HttpError(401, 'Sessão expirada ou inexistente. Faça login.', 'unauthenticated');
    if (req.mfaPending && !MFA_PENDING_ALLOWED.has(req.routeOptions.url ?? ''))
      throw new HttpError(401, 'Confirme o código de verificação (MFA)', 'mfa_required');
  });

  app.decorate('requirePerm', (...perms: string[]) => async (req: FastifyRequest) => {
    await app.authenticate(req);
    if (!req.tenant || !req.membership) throw new HttpError(400, 'Selecione um cliente (cabeçalho x-tenant-id)', 'tenant_required');
    const missing = perms.filter((p) => !req.membership!.permissions.has(p));
    if (missing.length) throw forbidden(`Permissão necessária: ${missing.join(', ')}`);
  });
}

export default fp(contextPlugin, { name: 'context' });
