import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';
import { assertHierarchy } from '../../lib/refs.js';
import { badRequest } from '../../lib/errors.js';
import { maskCpf, onlyDigits, isValidCnpj, isValidCpf, UFS } from '../../lib/br.js';
import { can } from '../../lib/tenant.js';
import { zCnpj, zCpf, zDateOpt, zId, zIdOpt, zText, zTextOpt } from '../../lib/zod.js';

const TAG = 'Cadastros';
const zUf = z.enum(UFS).nullish();

export async function orgRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: '/companies',
    model: 'company',
    entity: 'company',
    label: 'Empresa',
    tag: TAG,
    read: 'org.read',
    write: 'org.write',
    scope: { company: 'id' },
    searchFields: ['name', 'tradeName', 'cnpj'],
    filters: ['active'],
    orderBy: { name: 'asc' },
    softDelete: true,
    createSchema: z.object({
      name: zText(200).min(2),
      tradeName: zTextOpt(200),
      cnpj: zCnpj,
      cnae: zTextOpt(10),
      riskDegree: z.number().int().min(1).max(4).nullish(),
      address: zTextOpt(300),
      city: zTextOpt(100),
      uf: zUf,
      active: z.boolean().optional(),
    }),
  });

  registerCrud(app, {
    path: '/units',
    model: 'unit',
    entity: 'unit',
    label: 'Unidade',
    tag: TAG,
    read: 'org.read',
    write: 'org.write',
    scope: { company: 'companyId', unit: 'id' },
    searchFields: ['name', 'inscriptionNumber', 'city'],
    filters: ['companyId', 'active'],
    include: { company: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
    softDelete: true,
    createSchema: z.object({
      companyId: zId,
      name: zText(200).min(2),
      inscriptionType: z.union([z.literal(1), z.literal(3), z.literal(4)]).nullish(),
      inscriptionNumber: zTextOpt(20).transform((v) => (v ? onlyDigits(v) : v)),
      address: zTextOpt(300),
      city: zTextOpt(100),
      uf: zUf,
      active: z.boolean().optional(),
    }),
    beforeWrite: async (_req, data) => {
      if (data.inscriptionType === 1 && data.inscriptionNumber && !isValidCnpj(String(data.inscriptionNumber)))
        throw badRequest('CNPJ do estabelecimento inválido');
      return data;
    },
  });

  registerCrud(app, {
    path: '/sectors',
    model: 'sector',
    entity: 'sector',
    label: 'Setor',
    tag: TAG,
    read: 'org.read',
    write: 'org.write',
    scope: { company: 'unit.companyId', unit: 'unitId' },
    searchFields: ['name'],
    filters: ['unitId', 'active'],
    include: { unit: { select: { id: true, name: true, companyId: true } } },
    orderBy: { name: 'asc' },
    softDelete: true,
    createSchema: z.object({
      unitId: zId,
      name: zText(200).min(2),
      description: zTextOpt(1000),
      environmentDescription: zTextOpt(4000),
      active: z.boolean().optional(),
    }),
  });

  registerCrud(app, {
    path: '/job-roles',
    model: 'jobRole',
    entity: 'job_role',
    label: 'Cargo',
    tag: TAG,
    read: 'org.read',
    write: 'org.write',
    scope: { company: 'companyId' },
    searchFields: ['name', 'cbo'],
    filters: ['companyId', 'active'],
    include: { company: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
    softDelete: true,
    createSchema: z.object({
      companyId: zId,
      name: zText(200).min(2),
      cbo: zTextOpt(6).refine((v) => !v || /^\d{6}$/.test(v), 'CBO deve ter 6 dígitos'),
      description: zTextOpt(1000),
      activities: zTextOpt(4000),
      active: z.boolean().optional(),
    }),
  });

  registerCrud(app, {
    path: '/workers',
    model: 'worker',
    entity: 'worker',
    label: 'Trabalhador',
    tag: TAG,
    read: 'workers.read',
    write: 'workers.write',
    scope: { company: 'companyId', unit: 'unitId' },
    searchFields: ['name', 'cpf', 'registration'],
    filters: ['companyId', 'unitId', 'sectorId', 'jobRoleId', 'status'],
    include: {
      company: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
      sector: { select: { id: true, name: true } },
      jobRole: { select: { id: true, name: true, cbo: true } },
    },
    orderBy: { name: 'asc' },
    createSchema: z.object({
      companyId: zId,
      unitId: zId,
      sectorId: zIdOpt,
      jobRoleId: zIdOpt,
      name: zText(200).min(2),
      cpf: zCpf,
      birthDate: zDateOpt,
      gender: z.enum(['M', 'F', 'outro', 'nao_informado']).nullish(),
      registration: zTextOpt(30),
      categoryCode: zTextOpt(3).refine((v) => !v || /^\d{3}$/.test(v), 'Código de categoria deve ter 3 dígitos'),
      function: zTextOpt(200),
      admissionDate: zDateOpt,
      terminationDate: zDateOpt,
      status: z.enum(['ativo', 'afastado', 'desligado']).optional(),
      email: z.string().email().max(200).nullish().or(z.literal('').transform(() => null)),
    }),
    beforeWrite: async (req, data, existing) => {
      const merged = { ...existing, ...data } as Record<string, string | null | undefined>;
      await assertHierarchy(req.tenant!.id, merged);
      if (data.cpf && !isValidCpf(String(data.cpf))) throw badRequest('CPF inválido');
      return data;
    },
    // Minimização (LGPD): CPF completo só para quem pode editar trabalhadores
    toOutput: (row, req) => (can(req, 'workers.write') ? row : { ...row, cpf: maskCpf(String(row.cpf)) }),
  });
}
