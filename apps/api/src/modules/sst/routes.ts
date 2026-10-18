import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';
import { assertHierarchy } from '../../lib/refs.js';
import { decryptJson, encryptJson, encrypt, decrypt } from '../../lib/crypto.js';
import { can } from '../../lib/tenant.js';
import { UFS } from '../../lib/br.js';
import { zDate, zDateOpt, zDateTime, zId, zIdOpt, zText, zTextOpt } from '../../lib/zod.js';

const TAG = 'SST';

const procedureSchema = z.object({
  code: zText(10).min(1),
  date: z.string().date(),
  description: zTextOpt(200),
});

const medicalSchema = z
  .object({
    cid: zTextOpt(10),
    physicianName: zTextOpt(200),
    physicianCrm: zTextOpt(20),
    physicianUf: z.enum(UFS).nullish(),
    date: z.string().date().nullish(),
    leaveDays: z.number().int().min(0).max(3650).nullish(),
    diagnosis: zTextOpt(1000),
  })
  .nullish();

export async function sstRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: '/risks',
    model: 'risk',
    entity: 'risk',
    label: 'Risco',
    tag: TAG,
    read: 'risks.read',
    write: 'risks.write',
    scope: { company: 'sector.unit.companyId', unit: 'sector.unitId' },
    searchFields: ['hazard', 'description', 'agentCode'],
    filters: ['sectorId', 'type', 'active'],
    include: { sector: { select: { id: true, name: true, unit: { select: { id: true, name: true } } } } },
    orderBy: [{ level: 'desc' }, { hazard: 'asc' }],
    softDelete: true,
    createSchema: z.object({
      sectorId: zId,
      type: z.enum(['fisico', 'quimico', 'biologico', 'ergonomico', 'acidente', 'psicossocial']),
      hazard: zText(300).min(2),
      description: zTextOpt(2000),
      source: zTextOpt(500),
      agentCode: zTextOpt(20),
      intensity: zTextOpt(30),
      unit: zTextOpt(20),
      technique: zTextOpt(200),
      probability: z.number().int().min(1).max(5),
      severity: z.number().int().min(1).max(5),
      controls: zTextOpt(4000),
      epcEfficient: z.boolean().nullish(),
      epiEfficient: z.boolean().nullish(),
      epiCas: zTextOpt(200),
      assessedAt: zDateOpt,
      assessedBy: zTextOpt(200),
      active: z.boolean().optional(),
    }),
    beforeWrite: async (_req, data, existing) => {
      const p = Number(data.probability ?? existing?.probability);
      const s = Number(data.severity ?? existing?.severity);
      return { ...data, level: p * s };
    },
  });

  // Exames ocupacionais / ASO — dados de saúde (permissões health.*), campos clínicos criptografados
  registerCrud(app, {
    path: '/exams',
    model: 'exam',
    entity: 'exam',
    label: 'Exame',
    tag: TAG,
    read: 'health.read',
    write: 'health.write',
    scope: { company: 'worker.companyId', unit: 'worker.unitId' },
    filters: ['workerId', 'type', 'result'],
    include: { worker: { select: { id: true, name: true, companyId: true, unitId: true } } },
    orderBy: { examDate: 'desc' },
    createSchema: z.object({
      workerId: zId,
      type: z.enum(['admissional', 'periodico', 'retorno_trabalho', 'mudanca_risco', 'monitoracao_pontual', 'demissional']),
      examDate: zDate,
      result: z.enum(['apto', 'inapto']).nullish(),
      physicianName: zTextOpt(200),
      physicianCrm: zTextOpt(20),
      physicianUf: z.enum(UFS).nullish(),
      pcmsoResponsibleName: zTextOpt(200),
      pcmsoResponsibleCrm: zTextOpt(20),
      pcmsoResponsibleUf: z.enum(UFS).nullish(),
      procedures: z.array(procedureSchema).max(100).optional(),
      notes: zTextOpt(4000),
      nextDueDate: zDateOpt,
    }),
    beforeWrite: async (_req, data) => {
      const { procedures, notes, ...rest } = data;
      const out: Record<string, unknown> = { ...rest };
      if (procedures !== undefined) out.proceduresEnc = encryptJson(procedures);
      if (notes !== undefined) out.notesEnc = notes ? encrypt(String(notes)) : null;
      return out;
    },
    toOutput: (row) => {
      const { proceduresEnc, notesEnc, ...rest } = row;
      return {
        ...rest,
        procedures: decryptJson(proceduresEnc as string | null) ?? [],
        notes: notesEnc ? decrypt(String(notesEnc)) : null,
      };
    },
  });

  registerCrud(app, {
    path: '/accidents',
    model: 'accident',
    entity: 'accident',
    label: 'Ocorrência',
    tag: TAG,
    read: 'accidents.read',
    write: 'accidents.write',
    scope: { company: 'companyId', unit: 'unitId' },
    searchFields: ['description', 'location', 'catNumber'],
    filters: ['companyId', 'unitId', 'workerId', 'type', 'status'],
    include: { worker: { select: { id: true, name: true } } },
    orderBy: { occurredAt: 'desc' },
    createSchema: z.object({
      companyId: zId,
      unitId: zId,
      workerId: zIdOpt,
      type: z.enum(['tipico', 'trajeto', 'doenca', 'incidente', 'quase_acidente']),
      status: z.enum(['registrado', 'em_investigacao', 'concluido']).optional(),
      occurredAt: zDateTime,
      hoursWorked: zTextOpt(5).refine((v) => !v || /^\d{2}:?\d{2}$/.test(v), 'Use HH:MM'),
      description: zText(4000).min(5),
      location: zTextOpt(500),
      bodyPartCode: zTextOpt(20),
      laterality: z.enum(['nao_aplicavel', 'esquerda', 'direita', 'ambas']).nullish(),
      causingAgentCode: zTextOpt(20),
      situationCode: zTextOpt(20),
      injuryNatureCode: zTextOpt(20),
      death: z.boolean().optional(),
      deathDate: zDateOpt,
      policeReport: z.boolean().optional(),
      hospitalized: z.boolean().optional(),
      medicalLeave: z.boolean().optional(),
      medical: medicalSchema,
      rootCause: zTextOpt(4000),
      investigation: zTextOpt(8000),
      witnesses: zTextOpt(2000),
      catNumber: zTextOpt(40),
    }),
    beforeWrite: async (req, data, existing) => {
      await assertHierarchy(req.tenant!.id, { ...existing, ...data } as Record<string, string>);
      const { medical, ...rest } = data;
      const out: Record<string, unknown> = { ...rest };
      // Dados de atestado só podem ser gravados por quem tem acesso a saúde
      if (medical !== undefined && can(req, 'health.write')) out.medicalEnc = medical ? encryptJson(medical) : null;
      return out;
    },
    toOutput: (row, req) => {
      const { medicalEnc, ...rest } = row;
      return {
        ...rest,
        hasMedical: Boolean(medicalEnc),
        medical: can(req, 'health.read') ? decryptJson(medicalEnc as string | null) : undefined,
      };
    },
  });

  registerCrud(app, {
    path: '/ppe',
    model: 'ppe',
    entity: 'ppe',
    label: 'EPI',
    tag: TAG,
    read: 'ppe.read',
    write: 'ppe.write',
    searchFields: ['name', 'ca'],
    filters: ['active'],
    orderBy: { name: 'asc' },
    softDelete: true,
    createSchema: z.object({
      name: zText(200).min(2),
      ca: zTextOpt(20),
      caValidUntil: zDateOpt,
      replaceDays: z.number().int().min(1).max(3650).nullish(),
      active: z.boolean().optional(),
    }),
  });

  registerCrud(app, {
    path: '/ppe-deliveries',
    model: 'ppeDelivery',
    entity: 'ppe_delivery',
    label: 'Entrega de EPI',
    tag: TAG,
    read: 'ppe.read',
    write: 'ppe.write',
    scope: { company: 'worker.companyId', unit: 'worker.unitId' },
    filters: ['workerId', 'ppeId'],
    include: { worker: { select: { id: true, name: true } }, ppe: { select: { id: true, name: true, ca: true } } },
    orderBy: { deliveredAt: 'desc' },
    createSchema: z.object({
      workerId: zId,
      ppeId: zId,
      quantity: z.number().int().min(1).max(1000).default(1),
      deliveredAt: zDate,
      replaceBy: zDateOpt,
      reason: zTextOpt(300),
    }),
  });

  registerCrud(app, {
    path: '/trainings',
    model: 'training',
    entity: 'training',
    label: 'Treinamento',
    tag: TAG,
    read: 'trainings.read',
    write: 'trainings.write',
    searchFields: ['name', 'reference'],
    filters: ['active'],
    orderBy: { name: 'asc' },
    softDelete: true,
    createSchema: z.object({
      name: zText(200).min(2),
      reference: zTextOpt(200),
      workloadHours: z.number().int().min(0).max(2000).nullish(),
      validityMonths: z.number().int().min(1).max(240).nullish(),
      active: z.boolean().optional(),
    }),
  });

  registerCrud(app, {
    path: '/training-records',
    model: 'trainingRecord',
    entity: 'training_record',
    label: 'Registro de treinamento',
    tag: TAG,
    read: 'trainings.read',
    write: 'trainings.write',
    scope: { company: 'worker.companyId', unit: 'worker.unitId' },
    filters: ['workerId', 'trainingId'],
    include: { worker: { select: { id: true, name: true } }, training: { select: { id: true, name: true } } },
    orderBy: { completedAt: 'desc' },
    createSchema: z.object({
      trainingId: zId,
      workerId: zId,
      completedAt: zDate,
      validUntil: zDateOpt,
      instructor: zTextOpt(200),
      attended: z.boolean().optional(),
    }),
  });
}
