import type { FastifyRequest } from 'fastify';
import { forbidden } from './errors.js';

/** Filtro obrigatório de cliente. Toda consulta a dados de cliente deve usá-lo. */
export function tenantWhere(req: FastifyRequest) {
  if (!req.tenant) throw forbidden('Selecione um cliente');
  return { tenantId: req.tenant.id };
}

/**
 * Filtro de cliente + restrição por empresa/unidade do vínculo do usuário.
 * `fields` indica o nome dos campos de empresa/unidade no modelo consultado.
 */
export function scopedWhere(req: FastifyRequest, fields: { company?: string; unit?: string } = {}) {
  const where: Record<string, unknown> = tenantWhere(req);
  const m = req.membership;
  if (m && fields.company && m.companyIds.length) setPath(where, fields.company, { in: m.companyIds });
  if (m && fields.unit && m.unitIds.length) setPath(where, fields.unit, { in: m.unitIds });
  return where;
}

/** Suporta caminhos aninhados ("unit.companyId" vira { unit: { companyId: ... } }). */
function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = target;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
  cur[parts[parts.length - 1]] = value;
}

export function assertInScope(req: FastifyRequest, ids: { companyId?: string | null; unitId?: string | null }) {
  const m = req.membership;
  if (!m) return;
  if (ids.companyId && m.companyIds.length && !m.companyIds.includes(ids.companyId))
    throw forbidden('Empresa fora do seu escopo de acesso');
  if (ids.unitId && m.unitIds.length && !m.unitIds.includes(ids.unitId))
    throw forbidden('Unidade fora do seu escopo de acesso');
}

export const can = (req: FastifyRequest, perm: string) => Boolean(req.membership?.permissions.has(perm));
