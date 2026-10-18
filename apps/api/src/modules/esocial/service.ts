import type { EsocialEvent, EsocialEventType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { encryptJson, decryptJson, sha256 } from '../../lib/crypto.js';
import { conflict } from '../../lib/errors.js';
import { EVENT_INFO, type Issue, type Payload } from './domain.js';
import { buildPayload, type PrepareInput } from './prepare.js';
import { validatePayload, type TableLookup } from './validate.js';

/** Log técnico do eSocial: mensagens NUNCA devem conter CPF, nome ou dados de saúde. */
export async function esocialLog(ev: Pick<EsocialEvent, 'id' | 'tenantId'>, level: 'info' | 'warn' | 'error', code: string, message: string) {
  await prisma.esocialLog.create({ data: { tenantId: ev.tenantId, eventId: ev.id, level, code, message } });
}

export function tableLookup(): TableLookup {
  const counts = new Map<string, number>();
  return async (table, code) => {
    if (!counts.has(table)) counts.set(table, await prisma.esocialTableEntry.count({ where: { table } }));
    if (!counts.get(table)) return null;
    return Boolean(await prisma.esocialTableEntry.findUnique({ where: { table_code: { table, code } } }));
  };
}

const LOCKED_WAITING = ['na_fila', 'enviado'];
const CLOSED = ['processado', 'recibo_manual'];

export async function prepareEvent(opts: { tenantId: string; userId: string; type: EsocialEventType; sourceId: string; input?: PrepareInput }) {
  const { tenantId, userId, type, sourceId } = opts;
  const { payload, companyId, workerId } = await buildPayload(tenantId, type, sourceId, opts.input);
  const issues = await validatePayload(payload, tableLookup());
  const hash = sha256(JSON.stringify(payload));
  const status = issues.some((i) => i.severidade === 'erro') ? 'com_pendencias' : 'validado';

  const latest = await prisma.esocialEvent.findFirst({
    where: { tenantId, type, sourceType: EVENT_INFO[type].source, sourceId },
    orderBy: { createdAt: 'desc' },
  });
  if (latest && LOCKED_WAITING.includes(latest.status))
    throw conflict('Evento aguardando retorno do eSocial; não é possível alterá-lo agora', 'aguardando_retorno');

  let event = latest;
  if (!event || CLOSED.includes(event.status)) {
    event = await prisma.esocialEvent.create({
      data: {
        tenantId,
        companyId,
        workerId,
        type,
        sourceType: EVENT_INFO[type].source,
        sourceId,
        createdById: userId,
        isRetification: Boolean(latest),
        originalEventId: latest?.id,
      },
    });
    await esocialLog(event, 'info', 'criado', latest ? `Evento de retificação criado (original ${latest.id})` : 'Evento criado');
  }

  const last = await prisma.esocialEventVersion.findFirst({ where: { eventId: event.id }, orderBy: { version: 'desc' } });
  let version: number;
  if (last && last.payloadHash === hash) {
    await prisma.esocialEventVersion.update({ where: { id: last.id }, data: { issues: issues as object[] } });
    version = last.version;
  } else {
    version = (last?.version ?? 0) + 1;
    await prisma.esocialEventVersion.create({
      data: {
        tenantId,
        eventId: event.id,
        version,
        payloadEnc: encryptJson(payload),
        payloadHash: hash,
        issues: issues as object[],
        leiauteVersion: config.ESOCIAL_LEIAUTE_REFERENCIA,
        createdById: userId,
      },
    });
  }
  const erros = issues.filter((i) => i.severidade === 'erro').length;
  const avisos = issues.length - erros;
  event = await prisma.esocialEvent.update({ where: { id: event.id }, data: { status, currentVersion: version, companyId, workerId } });
  await esocialLog(event, erros ? 'warn' : 'info', 'validacao_interna', `Versão ${version}: ${erros} erro(s), ${avisos} aviso(s) nas regras internas`);
  return { event, version, issues };
}

export async function getVersionPayload(eventId: string, version: number) {
  const v = await prisma.esocialEventVersion.findUniqueOrThrow({ where: { eventId_version: { eventId, version } } });
  return { ...v, payload: decryptJson<Payload>(v.payloadEnc)!, issues: v.issues as unknown as Issue[] };
}
