import type { FastifyRequest } from 'fastify';
import { prisma } from './prisma.js';
import { badRequest } from './errors.js';
import { assertInScope } from './tenant.js';

/**
 * Garante que chaves estrangeiras recebidas pertencem ao mesmo cliente
 * (impede referenciar registros de outro cliente) e ao escopo do usuário.
 */
const REF_MODELS: Record<string, string> = {
  companyId: 'company',
  unitId: 'unit',
  sectorId: 'sector',
  jobRoleId: 'jobRole',
  workerId: 'worker',
  actionPlanId: 'actionPlan',
  ppeId: 'ppe',
  trainingId: 'training',
  documentId: 'document',
};

export async function assertRefs(req: FastifyRequest, data: Record<string, unknown>) {
  const tenantId = req.tenant!.id;
  for (const [field, model] of Object.entries(REF_MODELS)) {
    const id = data[field];
    if (typeof id !== 'string' || !id) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any)[model].findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!row) throw badRequest(`Referência inválida: ${field}`);
  }
  for (const field of ['assigneeId', 'approverId', 'responsibleId', 'ownerId']) {
    const id = data[field];
    if (typeof id !== 'string' || !id) continue;
    const m = await prisma.membership.findFirst({ where: { userId: id, tenantId }, select: { id: true } });
    if (!m) throw badRequest(`Usuário informado em ${field} não pertence a este cliente`);
  }
  assertInScope(req, { companyId: data.companyId as string | undefined, unitId: data.unitId as string | undefined });
}

/** Confere que a unidade pertence à empresa e o setor à unidade. */
export async function assertHierarchy(tenantId: string, d: { companyId?: string | null; unitId?: string | null; sectorId?: string | null }) {
  if (d.unitId && d.companyId) {
    const u = await prisma.unit.findFirst({ where: { id: d.unitId, tenantId, companyId: d.companyId } });
    if (!u) throw badRequest('A unidade não pertence à empresa informada');
  }
  if (d.sectorId && d.unitId) {
    const s = await prisma.sector.findFirst({ where: { id: d.sectorId, tenantId, unitId: d.unitId } });
    if (!s) throw badRequest('O setor não pertence à unidade informada');
  }
}
