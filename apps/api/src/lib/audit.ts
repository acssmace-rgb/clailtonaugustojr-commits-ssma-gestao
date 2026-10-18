import type { FastifyRequest } from 'fastify';
import { prisma } from './prisma.js';

const SENSITIVE = /(password|senha|token|secret|mfa|cpf|proced|notes|medical|cid|payload|xml)/i;

/** Remove/mascara campos sensíveis antes de gravar na auditoria. */
export function redact(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(redact);
  if (data instanceof Date) return data.toISOString();
  if (typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? '[protegido]' : redact(v);
    }
    return out;
  }
  return data;
}

/** Diferença simples entre estados (somente campos alterados). */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (key === 'updatedAt') continue;
    const a = before[key] instanceof Date ? (before[key] as Date).toISOString() : before[key];
    const b = after[key] instanceof Date ? (after[key] as Date).toISOString() : after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { de: a, para: b };
  }
  return changes;
}

export async function audit(
  req: FastifyRequest | null,
  action: string,
  entity: string,
  entityId?: string | null,
  data?: unknown,
  tenantId?: string | null,
) {
  await prisma.auditLog.create({
    data: {
      tenantId: tenantId ?? req?.tenant?.id ?? null,
      userId: req?.user?.id ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      data: data === undefined ? undefined : (redact(data) as object),
      ip: req?.ip ?? null,
    },
  });
}
