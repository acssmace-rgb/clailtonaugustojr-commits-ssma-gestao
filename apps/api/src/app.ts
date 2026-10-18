import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform, hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { Prisma } from '@prisma/client';
import { config, isProd } from './lib/config.js';
import { HttpError } from './lib/errors.js';
import context from './auth/context.js';
import { authRoutes } from './auth/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { orgRoutes } from './modules/org/routes.js';
import { sstRoutes } from './modules/sst/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { documentRoutes } from './modules/documents/routes.js';
import { alertRoutes } from './modules/alerts/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { esocialRoutes } from './modules/esocial/routes.js';
import { lgpdRoutes } from './modules/lgpd/routes.js';

export async function buildApp() {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 1024 * 1024,
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: isProd ? 'info' : 'debug',
            // Nunca registrar cookies, cabeçalhos de autenticação ou corpo das requisições
            redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: isProd,
  });
  await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: 'limite',
      message: `Muitas tentativas. Aguarde ${ctx.after} e tente novamente.`,
    }),
  });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'SSMA Gestão — API',
        version: '0.1.0',
        description:
          'API do sistema de gestão de SSMA. Autenticação por cookie de sessão (httpOnly). ' +
          'Requisições de escrita exigem o cabeçalho `x-requested-with: ssma`. O cliente ativo é indicado por `x-tenant-id`.',
      },
      components: {
        securitySchemes: {
          sessao: { type: 'apiKey', in: 'cookie', name: 'ssma_sid' },
          cliente: { type: 'apiKey', in: 'header', name: 'x-tenant-id' },
        },
      },
      security: [{ sessao: [], cliente: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: 'validacao',
        message: 'Dados inválidos',
        details: err.validation.map((v) => ({ campo: v.instancePath.replace(/^\//, '').replace(/\//g, '.'), mensagem: v.message })),
      });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code ?? 'erro', message: err.message, details: err.details });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'duplicado', message: 'Já existe um registro com esses dados' });
      if (err.code === 'P2025') return reply.code(404).send({ error: 'not_found', message: 'Registro não encontrado' });
      if (err.code === 'P2003') return reply.code(409).send({ error: 'em_uso', message: 'Registro vinculado a outros dados; não pode ser removido' });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? 'erro', message: err.message });
    }
    req.log.error({ err }, 'erro interno');
    return reply.code(500).send({ error: 'interno', message: 'Erro interno. Tente novamente ou contate o suporte.' });
  });

  await app.register(context);
  app.get('/api/health', { schema: { tags: ['Sistema'], summary: 'Verificação de saúde' } }, async () => ({ ok: true }));
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(adminRoutes, { prefix: '/api' });
  await app.register(orgRoutes, { prefix: '/api' });
  await app.register(sstRoutes, { prefix: '/api' });
  await app.register(taskRoutes, { prefix: '/api' });
  await app.register(documentRoutes, { prefix: '/api' });
  await app.register(alertRoutes, { prefix: '/api' });
  await app.register(reportRoutes, { prefix: '/api' });
  await app.register(esocialRoutes, { prefix: '/api/esocial' });
  await app.register(lgpdRoutes, { prefix: '/api/lgpd' });

  return app;
}
