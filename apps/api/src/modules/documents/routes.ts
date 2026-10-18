import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Document, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { assertRefs, assertHierarchy } from '../../lib/refs.js';
import { scopedWhere } from '../../lib/tenant.js';
import { notify } from '../../lib/notify.js';
import { readSettings } from '../../lib/settings.js';
import { expiryStatus } from '../../lib/expiry.js';
import { storage, newStorageKey } from '../../lib/storage.js';
import { readUpload, contentDisposition } from '../../lib/files.js';
import { zDateOpt, zId, zIdOpt, zPage, zText, zTextOpt } from '../../lib/zod.js';

const TAG = 'Documentos';
const SCOPE = { company: 'companyId', unit: 'unitId' };
const DOC_TYPES = ['PGR', 'PCMSO', 'LTCAT', 'PPP', 'ORDEM_SERVICO', 'FICHA_EPI', 'PROCEDIMENTO', 'LAUDO', 'LICENCA_AMBIENTAL', 'CERTIFICADO', 'OUTRO'] as const;

const docBody = z.object({
  companyId: zId,
  unitId: zIdOpt,
  type: z.enum(DOC_TYPES),
  title: zText(300).min(3),
  code: zTextOpt(60),
  responsibleId: zIdOpt,
  technicalResponsible: zTextOpt(200),
  technicalRegistry: zTextOpt(60),
  validFrom: zDateOpt,
  validUntil: zDateOpt,
  notes: zTextOpt(4000),
});

export async function documentRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const withExpiry = (req: FastifyRequest, d: Document) => ({
    ...d,
    expiryStatus: expiryStatus(d.validUntil, readSettings(req.tenant!.settings).alertDays.documents),
  });

  async function loadDoc(req: FastifyRequest, id: string) {
    const d = await prisma.document.findFirst({ where: { ...scopedWhere(req, SCOPE), id } });
    if (!d) throw notFound('Documento');
    return d;
  }

  r.get(
    '/documents',
    {
      preValidation: app.requirePerm('documents.read'),
      schema: {
        tags: [TAG],
        summary: 'Listar documentos',
        querystring: zPage.extend({
          type: z.enum(DOC_TYPES).optional(),
          status: z.enum(['rascunho', 'em_revisao', 'aprovado', 'obsoleto']).optional(),
          companyId: z.string().optional(),
          unitId: z.string().optional(),
          expiry: z.enum(['vencido', 'a_vencer', 'vigente', 'sem_validade']).optional(),
        }),
      },
    },
    async (req) => {
      const { page, pageSize, q, expiry, ...f } = req.query;
      const where: Prisma.DocumentWhereInput = scopedWhere(req, SCOPE);
      if (f.type) where.type = f.type;
      if (f.status) where.status = f.status;
      if (f.companyId) where.companyId = f.companyId;
      if (f.unitId) where.unitId = f.unitId;
      if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }];
      if (expiry) {
        const today = new Date(new Date().toISOString().slice(0, 10));
        const limit = new Date(today);
        limit.setUTCDate(limit.getUTCDate() + readSettings(req.tenant!.settings).alertDays.documents);
        if (expiry === 'vencido') where.validUntil = { lt: today };
        if (expiry === 'a_vencer') where.validUntil = { gte: today, lte: limit };
        if (expiry === 'vigente') where.validUntil = { gt: limit };
        if (expiry === 'sem_validade') where.validUntil = null;
      }
      const [items, total] = await Promise.all([
        prisma.document.findMany({ where, orderBy: [{ validUntil: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
        prisma.document.count({ where }),
      ]);
      return { items: items.map((d) => withExpiry(req, d)), total, page, pageSize };
    },
  );

  r.get('/documents/:id', { preValidation: app.requirePerm('documents.read'), schema: { tags: [TAG], summary: 'Detalhe do documento com versões e histórico', params: z.object({ id: zId }) } }, async (req) => {
    const d = await loadDoc(req, req.params.id);
    const [versions, history] = await Promise.all([
      prisma.documentVersion.findMany({ where: { documentId: d.id }, orderBy: { version: 'desc' } }),
      prisma.auditLog.findMany({ where: { tenantId: d.tenantId, entity: 'document', entityId: d.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const ids = [...versions.flatMap((v) => [v.uploadedById, v.reviewedById, v.approvedById]), ...history.map((h) => h.userId)].filter(Boolean) as string[];
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const name = new Map(users.map((u) => [u.id, u.name]));
    return {
      ...withExpiry(req, d),
      versions: versions.map((v) => ({
        ...v,
        storageKey: undefined,
        uploadedByName: name.get(v.uploadedById),
        reviewedByName: v.reviewedById ? name.get(v.reviewedById) : null,
        approvedByName: v.approvedById ? name.get(v.approvedById) : null,
      })),
      history: history.map((h) => ({ ...h, userName: h.userId ? name.get(h.userId) : null })),
    };
  });

  r.post('/documents', { preValidation: app.requirePerm('documents.write'), schema: { tags: [TAG], summary: 'Cadastrar documento', body: docBody } }, async (req, reply) => {
    await assertRefs(req, req.body);
    await assertHierarchy(req.tenant!.id, req.body);
    const d = await prisma.document.create({ data: { ...req.body, tenantId: req.tenant!.id } });
    await audit(req, 'criar', 'document', d.id, req.body);
    reply.code(201);
    return withExpiry(req, d);
  });

  r.patch(
    '/documents/:id',
    {
      preValidation: app.requirePerm('documents.write'),
      schema: {
        tags: [TAG],
        summary: 'Atualizar metadados do documento (ou marcar como obsoleto)',
        params: z.object({ id: zId }),
        body: docBody.partial().extend({ status: z.literal('obsoleto').optional() }),
      },
    },
    async (req) => {
      const d = await loadDoc(req, req.params.id);
      await assertRefs(req, req.body);
      await assertHierarchy(req.tenant!.id, { ...d, ...req.body });
      const updated = await prisma.document.update({ where: { id: d.id }, data: req.body });
      await audit(req, 'atualizar', 'document', d.id, diff(d, updated));
      return withExpiry(req, updated);
    },
  );

  r.post(
    '/documents/:id/versions',
    {
      preValidation: app.requirePerm('documents.write'),
      schema: { tags: [TAG], summary: 'Enviar nova versão (multipart: file, changeNotes)', params: z.object({ id: zId }), consumes: ['multipart/form-data'] },
    },
    async (req, reply) => {
      const d = await loadDoc(req, req.params.id);
      if (d.status === 'obsoleto') throw badRequest('Documento obsoleto não recebe novas versões');
      const part = await req.file();
      const f = await readUpload(part);
      const notesField = part?.fields.changeNotes as { value?: string } | undefined;
      const changeNotes = typeof notesField?.value === 'string' ? notesField.value.slice(0, 2000) : null;
      const last = await prisma.documentVersion.findFirst({ where: { documentId: d.id }, orderBy: { version: 'desc' } });
      const storageKey = newStorageKey(d.tenantId, 'documentos');
      await storage.put(storageKey, f.buffer, f.mimeType);
      const v = await prisma.documentVersion.create({
        data: {
          tenantId: d.tenantId,
          documentId: d.id,
          version: (last?.version ?? 0) + 1,
          fileName: f.fileName,
          mimeType: f.mimeType,
          size: f.size,
          sha256: f.sha256,
          storageKey,
          changeNotes,
          uploadedById: req.user!.id,
        },
      });
      await audit(req, 'nova_versao', 'document', d.id, { versao: v.version, arquivo: f.fileName, sha256: f.sha256 });
      reply.code(201);
      return { ...v, storageKey: undefined };
    },
  );

  async function loadVersion(req: FastifyRequest, id: string, version: number) {
    const d = await loadDoc(req, id);
    const v = await prisma.documentVersion.findUnique({ where: { documentId_version: { documentId: d.id, version } } });
    if (!v) throw notFound('Versão');
    return { d, v };
  }

  const verParams = z.object({ id: zId, version: z.coerce.number().int().min(1) });

  r.post('/documents/:id/versions/:version/submit', { preValidation: app.requirePerm('documents.write'), schema: { tags: [TAG], summary: 'Enviar versão para revisão', params: verParams } }, async (req) => {
    const { d, v } = await loadVersion(req, req.params.id, req.params.version);
    if (v.status !== 'rascunho' && v.status !== 'reprovada') throw badRequest('Somente rascunhos ou versões reprovadas podem ir para revisão');
    await prisma.documentVersion.update({ where: { id: v.id }, data: { status: 'em_revisao' } });
    if (d.status !== 'aprovado') await prisma.document.update({ where: { id: d.id }, data: { status: 'em_revisao' } });
    await audit(req, 'enviar_revisao', 'document', d.id, { versao: v.version });
    const approvers = await prisma.membership.findMany({ where: { tenantId: d.tenantId, role: { permissions: { has: 'documents.approve' } } }, select: { userId: true } });
    await notify(d.tenantId, approvers.map((a) => a.userId).filter((u) => u !== req.user!.id), {
      kind: 'documento_revisao',
      title: `Documento para revisão: ${d.title} (v${v.version})`,
      link: `/documentos/${d.id}`,
    });
    return { ok: true };
  });

  r.post(
    '/documents/:id/versions/:version/review',
    {
      preValidation: app.requirePerm('documents.approve'),
      schema: {
        tags: [TAG],
        summary: 'Aprovar ou reprovar versão (exige declaração e registro profissional para aprovar)',
        params: verParams,
        body: z.object({
          approve: z.boolean(),
          notes: zTextOpt(4000),
          approverRegistry: zTextOpt(60),
          declaration: z.boolean().optional(),
        }),
      },
    },
    async (req) => {
      const { d, v } = await loadVersion(req, req.params.id, req.params.version);
      if (v.status !== 'em_revisao') throw badRequest('A versão não está em revisão');
      const now = new Date();
      if (req.body.approve) {
        if (!req.body.declaration) throw badRequest('Para aprovar, confirme a declaração de revisão técnica');
        if (!req.body.approverRegistry) throw badRequest('Informe seu registro profissional (ex.: CREA, CRM, MTE)');
        await prisma.$transaction([
          prisma.documentVersion.update({
            where: { id: v.id },
            data: { status: 'aprovada', reviewedById: req.user!.id, reviewedAt: now, reviewNotes: req.body.notes, approvedById: req.user!.id, approvedAt: now, approverRegistry: req.body.approverRegistry },
          }),
          prisma.document.update({ where: { id: d.id }, data: { status: 'aprovado', currentVersion: v.version } }),
        ]);
      } else {
        if (!req.body.notes) throw badRequest('Informe o motivo da reprovação');
        await prisma.documentVersion.update({ where: { id: v.id }, data: { status: 'reprovada', reviewedById: req.user!.id, reviewedAt: now, reviewNotes: req.body.notes } });
        if (d.currentVersion === 0) await prisma.document.update({ where: { id: d.id }, data: { status: 'rascunho' } });
      }
      await audit(req, req.body.approve ? 'aprovar_versao' : 'reprovar_versao', 'document', d.id, { versao: v.version, registro: req.body.approverRegistry, observacoes: req.body.notes });
      await notify(d.tenantId, [v.uploadedById, d.responsibleId].filter((u) => u !== req.user!.id), {
        kind: 'documento_avaliado',
        title: `${req.body.approve ? 'Aprovada' : 'Reprovada'}: ${d.title} v${v.version}`,
        link: `/documentos/${d.id}`,
      });
      return { ok: true };
    },
  );

  r.get('/documents/:id/versions/:version/download', { preValidation: app.requirePerm('documents.read'), schema: { tags: [TAG], summary: 'Baixar arquivo da versão', params: verParams } }, async (req, reply) => {
    const { d, v } = await loadVersion(req, req.params.id, req.params.version);
    await audit(req, 'baixar_versao', 'document', d.id, { versao: v.version });
    return reply.header('content-type', v.mimeType).header('content-disposition', contentDisposition(v.fileName)).send(await storage.get(v.storageKey));
  });
}
