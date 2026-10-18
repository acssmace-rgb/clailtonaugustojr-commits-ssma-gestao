import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { can, scopedWhere } from '../../lib/tenant.js';
import { decrypt, decryptJson, encryptJson, randomToken } from '../../lib/crypto.js';
import { readSettings } from '../../lib/settings.js';
import { zId } from '../../lib/zod.js';

const TAG = 'LGPD';

export async function lgpdRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  async function loadWorker(req: Parameters<typeof scopedWhere>[0], id: string) {
    const w = await prisma.worker.findFirst({
      where: { ...scopedWhere(req, { company: 'companyId', unit: 'unitId' }), id },
      include: { company: true, unit: true, sector: true, jobRole: true },
    });
    if (!w) throw notFound('Trabalhador');
    return w;
  }

  r.get(
    '/workers/:id/export',
    { preValidation: app.requirePerm('lgpd.manage', 'workers.read'), schema: { tags: [TAG], summary: 'Exportar dados pessoais do titular (direito de acesso/portabilidade)', params: z.object({ id: zId }) } },
    async (req, reply) => {
      const w = await loadWorker(req, req.params.id);
      const health = can(req, 'health.read');
      const [exams, accidents, ppe, trainings, events] = await Promise.all([
        health ? prisma.exam.findMany({ where: { tenantId: w.tenantId, workerId: w.id } }) : Promise.resolve([]),
        prisma.accident.findMany({ where: { tenantId: w.tenantId, workerId: w.id } }),
        prisma.ppeDelivery.findMany({ where: { tenantId: w.tenantId, workerId: w.id }, include: { ppe: true } }),
        prisma.trainingRecord.findMany({ where: { tenantId: w.tenantId, workerId: w.id }, include: { training: true } }),
        prisma.esocialEvent.findMany({ where: { tenantId: w.tenantId, workerId: w.id }, select: { type: true, status: true, receiptNumber: true, createdAt: true } }),
      ]);
      await audit(req, 'lgpd_exportar', 'worker', w.id, { inclui_saude: health });
      const data = {
        geradoEm: new Date().toISOString(),
        controlador: w.company.name,
        observacao: health ? undefined : 'Dados de saúde não incluídos: o operador não possui permissão de acesso a dados de saúde.',
        titular: {
          nome: w.name,
          cpf: w.cpf,
          nascimento: w.birthDate,
          email: w.email,
          matricula: w.registration,
          empresa: w.company.name,
          unidade: w.unit.name,
          setor: w.sector?.name,
          cargo: w.jobRole?.name,
          funcao: w.function,
          admissao: w.admissionDate,
          desligamento: w.terminationDate,
        },
        exames: exams.map(({ proceduresEnc, notesEnc, ...e }) => ({ ...e, procedimentos: decryptJson(proceduresEnc), observacoes: notesEnc ? decrypt(notesEnc) : null })),
        ocorrencias: accidents.map(({ medicalEnc, ...a }) => ({ ...a, atestado: health ? decryptJson(medicalEnc) : undefined })),
        entregasEpi: ppe,
        treinamentos: trainings,
        eventosEsocial: events,
      };
      return reply.header('content-disposition', `attachment; filename="dados_titular_${w.id.slice(0, 8)}.json"`).send(data);
    },
  );

  r.post(
    '/workers/:id/anonymize',
    {
      preValidation: app.requirePerm('lgpd.manage', 'workers.write'),
      schema: {
        tags: [TAG],
        summary: 'Anonimizar trabalhador (irreversível)',
        params: z.object({ id: zId }),
        body: z.object({
          confirmName: z.string().min(2),
          reason: z.string().trim().min(10).max(1000),
          retentionChecked: z.literal(true, { message: 'Confirme que verificou as obrigações legais de guarda dos registros' }),
        }),
      },
    },
    async (req) => {
      const w = await loadWorker(req, req.params.id);
      if (w.anonymizedAt) throw badRequest('Titular já anonimizado');
      if (req.body.confirmName.trim().toLowerCase() !== w.name.trim().toLowerCase()) throw badRequest('Nome de confirmação não confere');
      const tag = randomToken(6);
      await prisma.$transaction(async (tx) => {
        await tx.worker.update({
          where: { id: w.id },
          data: { name: `Titular anonimizado ${tag}`, cpf: `ANON-${tag}`, birthDate: null, email: null, registration: null, gender: null, anonymizedAt: new Date() },
        });
        await tx.exam.updateMany({ where: { workerId: w.id }, data: { proceduresEnc: null, notesEnc: null, physicianName: null, physicianCrm: null } });
        await tx.accident.updateMany({ where: { workerId: w.id }, data: { medicalEnc: null, witnesses: null } });
        const events = await tx.esocialEvent.findMany({ where: { workerId: w.id }, select: { id: true } });
        await tx.esocialEventVersion.updateMany({
          where: { eventId: { in: events.map((e) => e.id) } },
          data: { payloadEnc: encryptJson({ anonimizado: true }), xmlEnc: null },
        });
      });
      await audit(req, 'lgpd_anonimizar', 'worker', w.id, { motivo: req.body.reason });
      return { ok: true };
    },
  );

  r.get('/retention-review', { preValidation: app.requirePerm('lgpd.manage'), schema: { tags: [TAG], summary: 'Titulares desligados há mais tempo que o período de revisão configurado' } }, async (req) => {
    const months = readSettings(req.tenant!.settings).retentionReviewMonths;
    if (!months) return { configured: false, items: [] };
    const limit = new Date();
    limit.setUTCMonth(limit.getUTCMonth() - months);
    const items = await prisma.worker.findMany({
      where: { ...scopedWhere(req, { company: 'companyId', unit: 'unitId' }), status: 'desligado', terminationDate: { lt: limit }, anonymizedAt: null },
      select: { id: true, name: true, terminationDate: true, companyId: true },
      orderBy: { terminationDate: 'asc' },
    });
    return {
      configured: true,
      months,
      aviso: 'Lista para revisão humana. Antes de anonimizar, verifique os prazos legais de guarda de registros de SST aplicáveis.',
      items,
    };
  });
}
