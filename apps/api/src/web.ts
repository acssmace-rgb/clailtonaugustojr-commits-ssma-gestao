import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

/**
 * Em produção, serve a aplicação web compilada (apps/web/dist) no mesmo domínio da API.
 * Em desenvolvimento o Vite serve a interface e faz proxy de /api.
 */
export async function serveWeb(app: FastifyInstance) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = process.env.WEB_DIST_DIR ?? path.resolve(here, '../../web/dist');
  if (!existsSync(path.join(dist, 'index.html'))) return;
  const { default: fastifyStatic } = await import('@fastify/static');
  await app.register(fastifyStatic, { root: dist, wildcard: false });
  const index = await readFile(path.join(dist, 'index.html'));
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found', message: 'Rota não encontrada' });
    return reply.type('text/html').send(index);
  });
}
