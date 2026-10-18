import { PgBoss } from 'pg-boss';
import { config } from './config.js';

let boss: PgBoss | null = null;

/** Fila de tarefas em segundo plano sobre o próprio PostgreSQL (sem Redis). */
export async function getBoss() {
  if (!boss) {
    boss = new PgBoss(config.DATABASE_URL);
    boss.on('error', (err) => console.error('[fila] erro:', err.message));
    await boss.start();
    for (const q of Object.values(QUEUES)) await boss.createQueue(q).catch(() => undefined);
  }
  return boss;
}

export const QUEUES = {
  esocialTransmit: 'esocial-transmitir',
  esocialConsult: 'esocial-consultar',
  alertsDaily: 'alertas-diarios',
  reportsScheduled: 'relatorios-agendados',
} as const;
