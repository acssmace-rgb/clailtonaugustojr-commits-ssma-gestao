/**
 * Processo de segundo plano: alertas diários, relatórios agendados e fila do eSocial.
 * Executar separadamente da API:  pnpm worker
 */
import { prisma } from './lib/prisma.js';
import { getBoss, QUEUES } from './lib/queue.js';
import { notify } from './lib/notify.js';
import { emailEnabled, sendEmail } from './lib/mailer.js';
import { config } from './lib/config.js';
import { computeAlerts } from './modules/alerts/service.js';
import { canRun, getReport, type ReportCtx } from './modules/reports/definitions.js';
import { renderReport } from './modules/reports/routes.js';
import { esocialLog } from './modules/esocial/service.js';
import { getTransmitter } from './modules/esocial/transmitter.js';
import { getLeiauteAdapter } from './modules/esocial/leiaute.js';

const log = (...a: unknown[]) => console.log(new Date().toISOString(), '[worker]', ...a);

async function ctxFor(tenantId: string, userId: string): Promise<ReportCtx | null> {
  const m = await prisma.membership.findUnique({ where: { userId_tenantId: { userId, tenantId } }, include: { role: true, tenant: true, user: true } });
  if (!m || !m.user.active || !m.tenant.active) return null;
  return { tenantId, settings: m.tenant.settings, permissions: new Set(m.role.permissions), companyIds: m.companyIds, unitIds: m.unitIds };
}

/** Gera notificações de vencimento para cada usuário, respeitando permissões e escopo dele. */
async function runDailyAlerts() {
  const memberships = await prisma.membership.findMany({ where: { tenant: { active: true }, user: { active: true } }, include: { role: true, tenant: true } });
  let created = 0;
  for (const m of memberships) {
    const alerts = await computeAlerts({ tenantId: m.tenantId, settings: m.tenant.settings, permissions: new Set(m.role.permissions), companyIds: m.companyIds, unitIds: m.unitIds });
    const isManager = m.role.permissions.includes('admin.settings') || m.role.permissions.includes('tasks.approve');
    for (const a of alerts) {
      // Responsável direto sempre recebe; gestores recebem os vencidos
      if (!a.responsibleIds.includes(m.userId) && !(isManager && a.severity === 'vencido')) continue;
      await notify(m.tenantId, [m.userId], {
        kind: `alerta_${a.kind}`,
        title: `${a.severity === 'vencido' ? 'Vencido' : a.severity === 'a_vencer' ? 'A vencer' : 'Pendência'}: ${a.title}`,
        body: a.dueDate ? `Data: ${a.dueDate.split('-').reverse().join('/')}` : undefined,
        link: a.link,
        dedupeKey: a.key,
      });
      created++;
    }
  }
  if (emailEnabled()) {
    const pending = await prisma.notification.findMany({ where: { emailedAt: null, readAt: null, createdAt: { gte: new Date(Date.now() - 86400_000) } }, take: 500 });
    const byUser = new Map<string, typeof pending>();
    for (const n of pending) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
    for (const [userId, list] of byUser) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.active) continue;
      await sendEmail({
        to: user.email,
        subject: `SSMA Gestão — ${list.length} notificação(ões)`,
        text: list.map((n) => `• ${n.title}${n.link ? ` — ${config.APP_ORIGIN}${n.link}` : ''}`).join('\n'),
      });
      await prisma.notification.updateMany({ where: { id: { in: list.map((n) => n.id) } }, data: { emailedAt: new Date() } });
    }
  }
  log(`alertas diários processados (${created} verificações de notificação)`);
}

function isDue(frequency: string, last: Date | null, now = new Date()) {
  if (!last) return true;
  const diffDays = (now.getTime() - last.getTime()) / 86400_000;
  return frequency === 'diario' ? diffDays >= 0.95 : frequency === 'semanal' ? diffDays >= 6.95 : diffDays >= 27.95 && now.getUTCMonth() !== last.getUTCMonth();
}

/** Envia relatórios agendados. Cada destinatário recebe somente o que suas permissões permitem. */
async function runScheduledReports() {
  const schedules = await prisma.reportSchedule.findMany({ where: { active: true } });
  for (const s of schedules) {
    if (!isDue(s.frequency, s.lastRunAt)) continue;
    const def = getReport(s.reportKey);
    const tenant = await prisma.tenant.findUnique({ where: { id: s.tenantId } });
    if (!def || !tenant) continue;
    for (const userId of s.recipientIds) {
      const ctx = await ctxFor(s.tenantId, userId);
      if (!ctx || !canRun(ctx, def)) continue; // permissão revogada: não envia
      const out = await renderReport(def, ctx, s.filters as object, s.format as 'csv' | 'xlsx' | 'pdf', tenant.name);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const emailed =
        'body' in out &&
        (await sendEmail({
          to: user.email,
          subject: `SSMA Gestão — ${s.name}`,
          text: `Relatório agendado "${s.name}" (${def.title}) em anexo.\nOrigem dos dados e fórmulas: aba/rodapé "Metodologia".`,
          attachments: [{ filename: out.file!, content: out.body! }],
        }));
      await notify(s.tenantId, [userId], {
        kind: 'relatorio_agendado',
        title: `Relatório disponível: ${s.name}`,
        body: emailed ? 'Enviado por e-mail.' : 'Acesse Relatórios para gerar a versão atual.',
        link: `/relatorios?key=${def.key}`,
      });
    }
    await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastRunAt: new Date() } });
    log(`relatório agendado ${s.id} processado`);
  }
}

/** Transmissão ao eSocial. Só altera status com base na resposta do serviço oficial. */
async function transmitEvent(data: { eventId: string; tenantId: string; version: number }) {
  const ev = await prisma.esocialEvent.findFirst({ where: { id: data.eventId, tenantId: data.tenantId } });
  if (!ev) return;
  const transmitter = getTransmitter();
  const adapter = getLeiauteAdapter(ev.type);
  if (!transmitter.enabled || !adapter) {
    await prisma.esocialEvent.update({ where: { id: ev.id }, data: { status: 'erro_transmissao' } });
    await esocialLog(ev, 'error', 'transmissao_indisponivel', 'Transmissão oficial não configurada; evento não foi enviado');
    return;
  }
  // Implementação futura: gerar XML via adaptador, assinar com certificado, enviar lote,
  // registrar EsocialSubmission com protocolo e consultar retorno (fila esocial-consultar).
  await esocialLog(ev, 'error', 'nao_implementado', 'Fluxo de transmissão oficial ainda não implementado');
  await prisma.esocialEvent.update({ where: { id: ev.id }, data: { status: 'erro_transmissao' } });
}

const boss = await getBoss();
await boss.work<{ eventId: string; tenantId: string; version: number }>(QUEUES.esocialTransmit, async (jobs) => {
  for (const j of jobs) await transmitEvent(j.data);
});
await boss.work(QUEUES.alertsDaily, async () => runDailyAlerts());
await boss.work(QUEUES.reportsScheduled, async () => runScheduledReports());
// Horários em UTC: 10:00 UTC = 07:00 em Brasília
await boss.schedule(QUEUES.alertsDaily, '0 10 * * *');
await boss.schedule(QUEUES.reportsScheduled, '15 * * * *');
log('worker iniciado (filas: eSocial, alertas diários, relatórios agendados)');

if (process.argv.includes('--run-now')) {
  await runDailyAlerts();
  await runScheduledReports();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await boss.stop();
    await prisma.$disconnect();
    process.exit(0);
  });
}
