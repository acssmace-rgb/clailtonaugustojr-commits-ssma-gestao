import { prisma } from './prisma.js';

export async function notify(
  tenantId: string,
  userIds: (string | null | undefined)[],
  n: { kind: string; title: string; body?: string; link?: string; dedupeKey?: string },
) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  for (const userId of ids) {
    if (n.dedupeKey) {
      await prisma.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: n.dedupeKey } },
        create: { tenantId, userId, ...n },
        update: {},
      });
    } else {
      await prisma.notification.create({ data: { tenantId, userId, ...n } });
    }
  }
}
