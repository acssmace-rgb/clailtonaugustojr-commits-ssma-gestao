import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma.js';
import { config, isProd } from '../lib/config.js';
import { decrypt, encrypt, randomToken, sha256 } from '../lib/crypto.js';
import { hashPassword, passwordSchema, verifyPassword } from '../lib/password.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { emailEnabled, sendEmail } from '../lib/mailer.js';
import { SESSION_COOKIE } from './context.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MINUTES = 60;

authenticator.options = { window: 1 };

// Hash fictício para igualar o tempo de resposta quando o e-mail não existe
const dummyHash = hashPassword(randomToken());

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: config.SESSION_TTL_HOURS * 3600,
  });
}

async function createSession(req: FastifyRequest, reply: FastifyReply, userId: string, mfaPending: boolean) {
  const token = randomToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      mfaPending,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 250),
      expiresAt: new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000),
    },
  });
  setSessionCookie(reply, token);
}

export async function authRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const loginLimit = { rateLimit: { max: config.LOGIN_RATE_LIMIT, timeWindow: '15 minutes' } };

  r.post(
    '/login',
    {
      config: loginLimit,
      schema: {
        tags: ['Autenticação'],
        summary: 'Login com e-mail e senha',
        body: z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }),
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      const invalid = new HttpError(401, 'E-mail ou senha inválidos', 'invalid_credentials');
      if (!user || !user.active) {
        await verifyPassword(await dummyHash, req.body.password);
        throw invalid;
      }
      if (user.lockedUntil && user.lockedUntil > new Date())
        throw new HttpError(423, 'Conta temporariamente bloqueada por tentativas inválidas. Tente mais tarde.', 'locked');

      if (!(await verifyPassword(user.passwordHash, req.body.password))) {
        const failed = user.failedLogins + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLogins: failed >= MAX_FAILED ? 0 : failed,
            lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
          },
        });
        await audit(req, 'login_falhou', 'user', user.id, undefined, null);
        throw invalid;
      }

      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
      await createSession(req, reply, user.id, user.mfaEnabled);
      await audit(req, 'login', 'user', user.id, { mfa: user.mfaEnabled }, null);
      return { mfaRequired: user.mfaEnabled };
    },
  );

  r.post(
    '/mfa/verify',
    {
      config: loginLimit,
      preValidation: app.authenticate,
      schema: { tags: ['Autenticação'], summary: 'Confirma o código TOTP após o login', body: z.object({ code: z.string().regex(/^\d{6}$/) }) },
    },
    async (req) => {
      if (!req.mfaPending) return { ok: true };
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!user.mfaSecretEnc || !authenticator.check(req.body.code, decrypt(user.mfaSecretEnc))) {
        await audit(req, 'mfa_falhou', 'user', user.id, undefined, null);
        throw new HttpError(401, 'Código inválido', 'invalid_code');
      }
      await prisma.session.update({ where: { id: req.sessionId }, data: { mfaPending: false } });
      return { ok: true };
    },
  );

  r.post('/logout', { schema: { tags: ['Autenticação'], summary: 'Encerra a sessão' } }, async (req, reply) => {
    if (req.sessionId) await prisma.session.delete({ where: { id: req.sessionId } }).catch(() => undefined);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  r.get(
    '/me',
    { preValidation: app.authenticate, schema: { tags: ['Autenticação'], summary: 'Usuário atual, clientes e permissões' } },
    async (req) => {
      const memberships = await prisma.membership.findMany({
        where: { userId: req.user!.id, tenant: { active: true } },
        include: { tenant: true, role: true },
        orderBy: { tenant: { name: 'asc' } },
      });
      let tenants = memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, isDemo: m.tenant.isDemo, role: m.role.name }));
      if (req.user!.isSuperAdmin) {
        const all = await prisma.tenant.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
        const known = new Set(tenants.map((t) => t.id));
        tenants = tenants.concat(
          all.filter((t) => !known.has(t.id)).map((t) => ({ id: t.id, name: t.name, isDemo: t.isDemo, role: 'Superadministrador' })),
        );
      }
      return {
        user: req.user,
        mfaPending: Boolean(req.mfaPending),
        tenants,
        currentTenant: req.tenant ? { ...req.tenant, settings: undefined } : null,
        permissions: req.membership ? [...req.membership.permissions] : [],
        scope: req.membership ? { companyIds: req.membership.companyIds, unitIds: req.membership.unitIds } : null,
      };
    },
  );

  r.post(
    '/password/forgot',
    {
      config: { rateLimit: { max: Math.max(1, Math.ceil(config.LOGIN_RATE_LIMIT / 2)), timeWindow: '15 minutes' } },
      schema: { tags: ['Autenticação'], summary: 'Solicita link de redefinição de senha', body: z.object({ email: z.string().email().max(200) }) },
    },
    async (req) => {
      const user = await prisma.user.findUnique({ where: { email: req.body.email.trim().toLowerCase() } });
      if (user?.active) {
        const token = randomToken();
        await prisma.passwordResetToken.create({
          data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
        });
        const link = `${config.APP_ORIGIN}/redefinir-senha?token=${token}`;
        const sent = await sendEmail({
          to: user.email,
          subject: 'SSMA Gestão — redefinição de senha',
          text: `Olá, ${user.name}.\n\nPara definir uma nova senha, acesse (válido por ${RESET_TTL_MINUTES} minutos):\n${link}\n\nSe você não solicitou, ignore este e-mail.`,
        });
        if (!sent && config.NODE_ENV === 'development') {
          req.log.warn(`[DEV] SMTP não configurado. Link de redefinição: ${link}`);
        }
        await audit(req, 'senha_reset_solicitado', 'user', user.id, { email_enviado: sent }, null);
      }
      // Resposta idêntica exista ou não o e-mail (evita enumeração de usuários)
      return { ok: true, emailConfigured: emailEnabled() };
    },
  );

  r.post(
    '/password/reset',
    {
      config: loginLimit,
      schema: { tags: ['Autenticação'], summary: 'Define nova senha com o token recebido', body: z.object({ token: z.string().min(20).max(200), password: passwordSchema }) },
    },
    async (req) => {
      const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(req.body.token) } });
      if (!record || record.usedAt || record.expiresAt < new Date()) throw badRequest('Link inválido ou expirado');
      await prisma.$transaction([
        prisma.user.update({
          where: { id: record.userId },
          data: { passwordHash: await hashPassword(req.body.password), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
        }),
        prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
        prisma.session.deleteMany({ where: { userId: record.userId } }),
      ]);
      await audit(req, 'senha_redefinida', 'user', record.userId, undefined, null);
      return { ok: true };
    },
  );

  r.post(
    '/password/change',
    {
      preValidation: app.authenticate,
      schema: { tags: ['Autenticação'], summary: 'Troca a senha do usuário logado', body: z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }) },
    },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!(await verifyPassword(user.passwordHash, req.body.currentPassword))) throw badRequest('Senha atual incorreta');
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(req.body.newPassword), passwordChangedAt: new Date() } }),
        prisma.session.deleteMany({ where: { userId: user.id, NOT: { id: req.sessionId } } }),
      ]);
      await audit(req, 'senha_alterada', 'user', user.id, undefined, null);
      return { ok: true };
    },
  );

  // ---------------- MFA (TOTP) ----------------
  r.post('/mfa/setup', { preValidation: app.authenticate, schema: { tags: ['Autenticação'], summary: 'Gera segredo TOTP (ainda não ativa)' } }, async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (user.mfaEnabled) throw badRequest('A verificação em duas etapas já está ativa');
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecretEnc: encrypt(secret) } });
    const otpauth = authenticator.keyuri(user.email, 'SSMA Gestão', secret);
    return { otpauth, qrCodeDataUrl: await QRCode.toDataURL(otpauth), secret };
  });

  r.post(
    '/mfa/enable',
    { preValidation: app.authenticate, schema: { tags: ['Autenticação'], summary: 'Ativa MFA após confirmar um código', body: z.object({ code: z.string().regex(/^\d{6}$/) }) } },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!user.mfaSecretEnc || !authenticator.check(req.body.code, decrypt(user.mfaSecretEnc))) throw badRequest('Código inválido');
      await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
      await audit(req, 'mfa_ativado', 'user', user.id, undefined, null);
      return { ok: true };
    },
  );

  r.post(
    '/mfa/disable',
    {
      preValidation: app.authenticate,
      schema: { tags: ['Autenticação'], summary: 'Desativa MFA (exige senha e código)', body: z.object({ password: z.string().min(1), code: z.string().regex(/^\d{6}$/) }) },
    },
    async (req) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      const okPass = await verifyPassword(user.passwordHash, req.body.password);
      const okCode = user.mfaSecretEnc && authenticator.check(req.body.code, decrypt(user.mfaSecretEnc));
      if (!okPass || !okCode) throw badRequest('Senha ou código inválidos');
      await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEnc: null } });
      await audit(req, 'mfa_desativado', 'user', user.id, undefined, null);
      return { ok: true };
    },
  );
}
