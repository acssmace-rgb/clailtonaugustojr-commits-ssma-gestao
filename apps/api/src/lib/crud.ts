import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z, type ZodObject, type ZodRawShape } from 'zod';
import { prisma } from './prisma.js';
import { audit, diff } from './audit.js';
import { notFound } from './errors.js';
import { assertRefs } from './refs.js';
import { scopedWhere } from './tenant.js';
import { zId, zPage } from './zod.js';
import type { Permission } from './permissions.js';

type Row = Record<string, unknown> & { id: string };

export interface CrudOptions {
  path: string;
  /** Nome do delegate do Prisma (ex.: "company") */
  model: string;
  entity: string;
  label: string;
  tag: string;
  read: Permission;
  write: Permission;
  createSchema: ZodObject<ZodRawShape>;
  updateSchema?: ZodObject<ZodRawShape>;
  /** Campos do modelo que representam empresa/unidade, para aplicar o escopo do usuário */
  scope?: { company?: string; unit?: string };
  searchFields?: string[];
  /** Parâmetros de query aceitos como filtro de igualdade */
  filters?: string[];
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  /** Exclusão lógica (active=false) em vez de remoção */
  softDelete?: boolean;
  beforeWrite?: (req: FastifyRequest, data: Record<string, unknown>, existing?: Row) => Promise<Record<string, unknown>>;
  toOutput?: (row: Row, req: FastifyRequest) => unknown;
}

/**
 * Gera rotas REST padronizadas (listar, obter, criar, atualizar, excluir)
 * sempre filtradas pelo cliente e com auditoria.
 */
export function registerCrud(app: FastifyInstance, o: CrudOptions) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = () => (prisma as any)[o.model];
  const out = (row: Row, req: FastifyRequest) => (o.toOutput ? o.toOutput(row, req) : row);
  const filterShape = Object.fromEntries((o.filters ?? []).map((f) => [f, z.string().max(100).optional()]));
  const updateSchema = o.updateSchema ?? o.createSchema.partial();

  async function findOwned(req: FastifyRequest, id: string): Promise<Row> {
    const row = await delegate().findFirst({ where: { ...scopedWhere(req, o.scope), id }, include: o.include });
    if (!row) throw notFound(o.label);
    return row;
  }

  r.get(
    o.path,
    {
      preValidation: app.requirePerm(o.read),
      schema: { tags: [o.tag], summary: `Listar ${o.label.toLowerCase()}`, querystring: zPage.extend(filterShape) },
    },
    async (req) => {
      const { page, pageSize, q, ...filters } = req.query as { page: number; pageSize: number; q?: string } & Record<string, string | undefined>;
      const where: Record<string, unknown> = scopedWhere(req, o.scope);
      for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === '') continue;
        where[k] = v === 'true' ? true : v === 'false' ? false : v;
      }
      if (q && o.searchFields?.length) where.OR = o.searchFields.map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }));
      const [items, total] = await Promise.all([
        delegate().findMany({ where, include: o.include, orderBy: o.orderBy ?? { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        delegate().count({ where }),
      ]);
      return { items: items.map((row: Row) => out(row, req)), total, page, pageSize };
    },
  );

  r.get(
    `${o.path}/:id`,
    { preValidation: app.requirePerm(o.read), schema: { tags: [o.tag], summary: `Obter ${o.label.toLowerCase()}`, params: z.object({ id: zId }) } },
    async (req) => out(await findOwned(req, req.params.id), req),
  );

  r.post(
    o.path,
    { preValidation: app.requirePerm(o.write), schema: { tags: [o.tag], summary: `Criar ${o.label.toLowerCase()}`, body: o.createSchema } },
    async (req, reply) => {
      let data = { ...(req.body as Record<string, unknown>) };
      await assertRefs(req, data);
      if (o.beforeWrite) data = await o.beforeWrite(req, data);
      const row = await delegate().create({ data: { ...data, tenantId: req.tenant!.id }, include: o.include });
      await audit(req, 'criar', o.entity, row.id, data);
      reply.code(201);
      return out(row, req);
    },
  );

  r.patch(
    `${o.path}/:id`,
    {
      preValidation: app.requirePerm(o.write),
      schema: { tags: [o.tag], summary: `Atualizar ${o.label.toLowerCase()}`, params: z.object({ id: zId }), body: updateSchema },
    },
    async (req) => {
      const existing = await findOwned(req, req.params.id);
      let data = { ...(req.body as Record<string, unknown>) };
      await assertRefs(req, data);
      if (o.beforeWrite) data = await o.beforeWrite(req, data, existing);
      const row = await delegate().update({ where: { id: existing.id }, data, include: o.include });
      await audit(req, 'atualizar', o.entity, row.id, diff(existing, row));
      return out(row, req);
    },
  );

  r.delete(
    `${o.path}/:id`,
    { preValidation: app.requirePerm(o.write), schema: { tags: [o.tag], summary: `Excluir ${o.label.toLowerCase()}`, params: z.object({ id: zId }) } },
    async (req) => {
      const existing = await findOwned(req, req.params.id);
      if (o.softDelete) await delegate().update({ where: { id: existing.id }, data: { active: false } });
      else await delegate().delete({ where: { id: existing.id } });
      await audit(req, o.softDelete ? 'inativar' : 'excluir', o.entity, existing.id);
      return { ok: true };
    },
  );
}
