import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { createTenant } from '../src/lib/tenants.js';

export const PASSWORD = 'SenhaTeste123';

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

export async function setup() {
  await resetDb();
  const app = await buildApp();
  const hash = await hashPassword(PASSWORD);
  const tA = await createTenant({ name: 'Cliente A', slug: 'cliente-a' });
  const tB = await createTenant({ name: 'Cliente B', slug: 'cliente-b' });
  const role = async (tenantId: string, key: string) => prisma.role.findFirstOrThrow({ where: { tenantId, key } });
  const mkUser = async (email: string, tenantId: string, roleKey: string, extra: { companyIds?: string[] } = {}) => {
    const u = await prisma.user.create({ data: { email, name: email.split('@')[0], passwordHash: hash } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, roleId: (await role(tenantId, roleKey)).id, companyIds: extra.companyIds ?? [] } });
    return u;
  };
  const users = {
    adminA: await mkUser('admin.a@teste.example', tA.id, 'admin'),
    tecA: await mkUser('tec.a@teste.example', tA.id, 'tecnico_sst'),
    saudeA: await mkUser('saude.a@teste.example', tA.id, 'saude'),
    colabA: await mkUser('colab.a@teste.example', tA.id, 'colaborador'),
    gestorA: await mkUser('gestor.a@teste.example', tA.id, 'gestor'),
    adminB: await mkUser('admin.b@teste.example', tB.id, 'admin'),
  };
  return { app, tA, tB, users };
}

/** Cliente HTTP de teste com cookie de sessão e cabeçalhos padrão. */
export async function login(app: FastifyInstance, email: string, tenantId: string, password = PASSWORD) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-requested-with': 'ssma' }, payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login falhou: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'ssma_sid')!;
  const headers = { cookie: `ssma_sid=${cookie.value}`, 'x-tenant-id': tenantId, 'x-requested-with': 'ssma' };
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api${url}`, headers, payload: payload as object });
  return {
    headers,
    get: (url: string) => call('GET', url),
    post: (url: string, body?: unknown) => call('POST', url, body ?? {}),
    patch: (url: string, body: unknown) => call('PATCH', url, body),
    put: (url: string, body: unknown) => call('PUT', url, body),
    del: (url: string) => call('DELETE', url),
  };
}

export const validCnpj = (base8: string) => {
  const n = (base8 + '0001').split('').map(Number);
  for (const w of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const r = w.reduce((a, x, i) => a + n[i] * x, 0) % 11;
    n.push(r < 2 ? 0 : 11 - r);
  }
  return n.join('');
};

export const validCpf = (base9: string) => {
  const n = base9.split('').map(Number);
  for (const len of [9, 10]) {
    const sum = n.slice(0, len).reduce((a, d, i) => a + d * (len + 1 - i), 0);
    const r = (sum * 10) % 11;
    n.push(r === 10 ? 0 : r);
  }
  return n.join('');
};
