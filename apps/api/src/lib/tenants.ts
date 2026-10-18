import { prisma } from './prisma.js';
import { SYSTEM_ROLES } from './permissions.js';

export async function createTenant(data: { name: string; slug: string; isDemo?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: data.name, slug: data.slug, isDemo: data.isDemo ?? false } });
    for (const r of SYSTEM_ROLES) {
      await tx.role.create({
        data: { tenantId: tenant.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions, system: true },
      });
    }
    return tenant;
  });
}
