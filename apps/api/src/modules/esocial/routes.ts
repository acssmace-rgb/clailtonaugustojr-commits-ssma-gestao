import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { EsocialEvent, EsocialEventType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../lib/config.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { can, scopedWhere } from '../../lib/tenant.js';
import { maskCpf } from '../../lib/br.js';
import { sectionsPdf } from '../../lib/pdf.js';
import { readSettings } from '../../lib/settings.js';
import { getBoss, QUEUES } from '../../lib/queue.js';
import { zId, zPage } from '../../lib/zod.js';
import { EVENT_INFO, type Payload } from './domain.js';
import { esocialLog, getVersionPayload, prepareEvent } from './service.js';
import { getLeiauteAdapter, LEIAUTE_INDISPONIVEL } from './leiaute.js';
import { getTransmitter, REQUISITOS_TRANSMISSAO } from './transmitter.js';
import { TABLE_KEYS } from './validate.js';

const TAG = 'eSocial';
const TYPES = ['S2210', 'S2220', 'S2240'] as const;
const AVISO_CONFERENCIA = 'DOCUMENTO PARA CONFERÊNCIA — NÃO TRANSMITIDO AO eSOCIAL. Não possui validade como envio oficial.';

/** S-2220 e o atestado do S-2210 contêm dados de saúde: exigem health.read. */
function redactPayload(req: FastifyRequest, p: Payload): Payload | { restrito: true } {
  if (can(req, 'health.read')) return p;
  if (p.tipo === 'S2220') return { restrito: true };
  if (p.tipo === 'S2210') return { ...p, atestado: null };
  return p;
}

function flatten(obj: unknown, prefix = ''): [string, string][] {
  if (obj === null || obj === undefined) return [[prefix, '']];
  if (Array.isArray(obj)) {
    if (!obj.length) return [[prefix, '(nenhum)']];
    return obj.flatMap((v, i) => flatten(v, `${prefix}[${i + 1}]`));
  }
  if (typeof obj === 'object') return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  if (typeof obj === 'boolean') return [[prefix, obj ? 'Sim' : 'Não']];
  return [[prefix, String(obj)]];
}

export async function esocialRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  async function loadEvent(req: FastifyRequest, id: string) {
    const ev = await prisma.esocialEvent.findFirst({ where: { ...scopedWhere(req, { company: 'companyId' }), id } });
    if (!ev) throw notFound('Evento');
    if (ev.type === 'S2220' && !can(req, 'health.read')) throw forbidden('Eventos S-2220 contêm dados de saúde (permissão health.read)');
    return ev;
  }

  r.get('/status', { preValidation: app.requirePerm('esocial.read'), schema: { tags: [TAG], summary: 'Situação da integração (leiaute, transmissão, tabelas)' } }, async (req) => {
    const t = getTransmitter();
    const tables = await prisma.esocialTableEntry.groupBy({ by: ['table'], _count: { _all: true } });
    return {
      leiauteReferencia: config.ESOCIAL_LEIAUTE_REFERENCIA,
      ambiente: config.ESOCIAL_AMBIENTE,
      geracaoXml: Object.fromEntries(TYPES.map((ty) => [ty, Boolean(getLeiauteAdapter(ty))])),
      transmissao: { habilitada: t.enabled, motivo: t.reasonDisabled ?? null, requisitos: REQUISITOS_TRANSMISSAO },
      tabelas: Object.values(TABLE_KEYS).map((key) => ({ key, registros: tables.find((x) => x.table === key)?._count._all ?? 0 })),
      prazosConfigurados: readSettings(req.tenant!.settings).esocialDeadlines,
      aviso:
        'O sistema prepara e confere os dados. A validação estrutural (XSD) e o envio dependem de adaptador de leiaute e de transmissor oficiais, ainda não habilitados.',
    };
  });

  r.get(
    '/events',
    {
      preValidation: app.requirePerm('esocial.read'),
      schema: {
        tags: [TAG],
        summary: 'Listar eventos',
        querystring: zPage.extend({ type: z.enum(TYPES).optional(), status: z.string().max(40).optional(), companyId: z.string().uuid().optional() }),
      },
    },
    async (req) => {
      const { page, pageSize, type, status, companyId } = req.query;
      const where: Prisma.EsocialEventWhereInput = scopedWhere(req, { company: 'companyId' });
      if (type) where.type = type;
      else if (!can(req, 'health.read')) where.type = { not: 'S2220' };
      if (status) where.status = status as EsocialEvent['status'];
      if (companyId) where.companyId = companyId;
      const [items, total] = await Promise.all([
        prisma.esocialEvent.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.esocialEvent.count({ where }),
      ]);
      const workers = await prisma.worker.findMany({ where: { id: { in: items.map((i) => i.workerId!).filter(Boolean) } }, select: { id: true, name: true } });
      const name = new Map(workers.map((w) => [w.id, w.name]));
      return { items: items.map((e) => ({ ...e, workerName: e.workerId ? name.get(e.workerId) : null, typeLabel: EVENT_INFO[e.type].code })), total, page, pageSize };
    },
  );

  r.get(
    '/sources',
    {
      preValidation: app.requirePerm('esocial.prepare'),
      schema: { tags: [TAG], summary: 'Registros de origem disponíveis para preparar eventos', querystring: z.object({ type: z.enum(TYPES), q: z.string().max(100).optional() }) },
    },
    async (req) => {
      const { type, q } = req.query;
      const contains = q ? { contains: q, mode: 'insensitive' as const } : undefined;
      let rows: { id: string; label: string; date: string | null }[] = [];
      if (type === 'S2220') {
        if (!can(req, 'health.read')) throw forbidden('Requer permissão health.read');
        const ex = await prisma.exam.findMany({
          where: { ...scopedWhere(req, { company: 'worker.companyId', unit: 'worker.unitId' }), worker: contains ? { name: contains } : undefined },
          include: { worker: { select: { name: true } } },
          orderBy: { examDate: 'desc' },
          take: 50,
        });
        rows = ex.map((e) => ({ id: e.id, label: `${e.worker.name} — exame ${e.type.replace('_', ' ')}`, date: e.examDate.toISOString().slice(0, 10) }));
      } else if (type === 'S2210') {
        const ac = await prisma.accident.findMany({
          where: { ...scopedWhere(req, { company: 'companyId', unit: 'unitId' }), type: { in: ['tipico', 'trajeto', 'doenca'] }, worker: contains ? { name: contains } : undefined },
          include: { worker: { select: { name: true } } },
          orderBy: { occurredAt: 'desc' },
          take: 50,
        });
        rows = ac.map((a) => ({ id: a.id, label: `${a.worker?.name ?? 'Sem trabalhador vinculado'} — ${a.type}`, date: a.occurredAt.toISOString().slice(0, 10) }));
      } else {
        const ws = await prisma.worker.findMany({
          where: { ...scopedWhere(req, { company: 'companyId', unit: 'unitId' }), status: { not: 'desligado' }, name: contains },
          orderBy: { name: 'asc' },
          take: 50,
        });
        rows = ws.map((w) => ({ id: w.id, label: `${w.name} (CPF ${maskCpf(w.cpf)})`, date: w.admissionDate?.toISOString().slice(0, 10) ?? null }));
      }
      const events = await prisma.esocialEvent.findMany({
        where: { tenantId: req.tenant!.id, type, sourceId: { in: rows.map((x) => x.id) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, sourceId: true, status: true },
      });
      return rows.map((x) => ({ ...x, event: events.find((e) => e.sourceId === x.id) ?? null }));
    },
  );

  const prepareBody = z.object({
    type: z.enum(TYPES),
    sourceId: zId,
    input: z
      .object({
        startDate: z.string().date().optional(),
        responsibles: z
          .array(z.object({ nome: z.string().trim().min(2).max(200), conselho: z.string().max(30).nullish(), registro: z.string().max(30).nullish(), uf: z.string().length(2).nullish() }))
          .max(10)
          .optional(),
        observacoes: z.string().max(2000).optional(),
      })
      .optional(),
  });

  r.post('/events/prepare', { preValidation: app.requirePerm('esocial.prepare'), schema: { tags: [TAG], summary: 'Preparar (ou atualizar) evento a partir do registro de origem e validar', body: prepareBody } }, async (req, reply) => {
    const { type, sourceId, input } = req.body;
    if (type === 'S2220' && !can(req, 'health.read')) throw forbidden('S-2220 exige permissão health.read');
    // Garante que o registro de origem está no escopo do usuário
    const src = EVENT_INFO[type].source;
    const scope =
      src === 'exam'
        ? await prisma.exam.findFirst({ where: { ...scopedWhere(req, { company: 'worker.companyId', unit: 'worker.unitId' }), id: sourceId } })
        : src === 'accident'
          ? await prisma.accident.findFirst({ where: { ...scopedWhere(req, { company: 'companyId', unit: 'unitId' }), id: sourceId } })
          : await prisma.worker.findFirst({ where: { ...scopedWhere(req, { company: 'companyId', unit: 'unitId' }), id: sourceId } });
    if (!scope) throw notFound('Registro de origem');
    const res = await prepareEvent({ tenantId: req.tenant!.id, userId: req.user!.id, type: type as EsocialEventType, sourceId, input });
    await audit(req, 'preparar', 'esocial_event', res.event.id, { tipo: type, versao: res.version, status: res.event.status });
    reply.code(201);
    return { id: res.event.id, status: res.event.status, version: res.version, issues: res.issues };
  });

  r.post('/events/:id/revalidate', { preValidation: app.requirePerm('esocial.prepare'), schema: { tags: [TAG], summary: 'Recarregar dados da origem e validar novamente', params: z.object({ id: zId }) } }, async (req) => {
    const ev = await loadEvent(req, req.params.id);
    const res = await prepareEvent({ tenantId: ev.tenantId, userId: req.user!.id, type: ev.type, sourceId: ev.sourceId });
    await audit(req, 'revalidar', 'esocial_event', res.event.id, { versao: res.version, status: res.event.status });
    return { id: res.event.id, status: res.event.status, version: res.version, issues: res.issues };
  });

  r.get('/events/:id', { preValidation: app.requirePerm('esocial.read'), schema: { tags: [TAG], summary: 'Detalhe do evento: versões, pendências, histórico e logs', params: z.object({ id: zId }) } }, async (req) => {
    const ev = await loadEvent(req, req.params.id);
    const [versions, logs, submissions] = await Promise.all([
      prisma.esocialEventVersion.findMany({ where: { eventId: ev.id }, orderBy: { version: 'desc' }, select: { id: true, version: true, payloadHash: true, issues: true, leiauteVersion: true, createdAt: true, createdById: true, xmlEnc: true } }),
      prisma.esocialLog.findMany({ where: { eventId: ev.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.esocialSubmission.findMany({ where: { eventId: ev.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const current = ev.currentVersion ? await getVersionPayload(ev.id, ev.currentVersion) : null;
    return {
      ...ev,
      typeLabel: EVENT_INFO[ev.type].code,
      typeName: EVENT_INFO[ev.type].name,
      payload: current ? redactPayload(req, current.payload) : null,
      issues: current?.issues ?? [],
      versions: versions.map(({ xmlEnc, ...v }) => ({ ...v, hasXml: Boolean(xmlEnc) })),
      logs,
      submissions,
      xmlDisponivel: Boolean(getLeiauteAdapter(ev.type)),
      transmissaoHabilitada: getTransmitter().enabled,
    };
  });

  r.get(
    '/events/:id/export',
    {
      preValidation: app.requirePerm('esocial.prepare'),
      schema: { tags: [TAG], summary: 'Exportar dados preparados para conferência (JSON ou PDF)', params: z.object({ id: zId }), querystring: z.object({ format: z.enum(['json', 'pdf']).default('pdf'), version: z.coerce.number().int().min(1).optional() }) },
    },
    async (req, reply) => {
      const ev = await loadEvent(req, req.params.id);
      if (!ev.currentVersion) throw badRequest('Evento sem versão preparada');
      const v = await getVersionPayload(ev.id, req.query.version ?? ev.currentVersion);
      const payload = redactPayload(req, v.payload);
      const base = `${EVENT_INFO[ev.type].code}_${ev.id.slice(0, 8)}_v${v.version}_CONFERENCIA`;
      if (ev.status === 'validado') await prisma.esocialEvent.update({ where: { id: ev.id }, data: { status: 'exportado' } });
      await esocialLog(ev, 'info', 'exportado', `Versão ${v.version} exportada para conferência (${req.query.format})`);
      await audit(req, 'exportar_conferencia', 'esocial_event', ev.id, { versao: v.version, formato: req.query.format });
      if (req.query.format === 'json') {
        return reply
          .header('content-type', 'application/json; charset=utf-8')
          .header('content-disposition', `attachment; filename="${base}.json"`)
          .send({
            aviso: AVISO_CONFERENCIA,
            evento: EVENT_INFO[ev.type],
            eventoId: ev.id,
            versao: v.version,
            leiauteReferencia: v.leiauteVersion,
            hashDados: v.payloadHash,
            pendencias: v.issues,
            dados: payload,
            observacao: 'Estrutura de domínio do SSMA Gestão; não corresponde ao XML oficial do eSocial.',
          });
      }
      const pdf = await sectionsPdf({
        title: `${EVENT_INFO[ev.type].code} — ${EVENT_INFO[ev.type].name}`,
        subtitle: `Evento ${ev.id} · versão ${v.version} · status ${ev.status} · leiaute de referência: ${v.leiauteVersion ?? '—'}`,
        warning: AVISO_CONFERENCIA,
        sections: [
          {
            title: `Pendências das regras internas (${v.issues.length})`,
            rows: v.issues.length ? v.issues.map((i) => [`${i.severidade.toUpperCase()} · ${i.campo}`, i.mensagem] as [string, string]) : [['Situação', 'Nenhuma pendência nas regras internas']],
          },
          { title: 'Dados preparados', rows: flatten(payload) },
          { title: 'Integridade', rows: [['SHA-256 dos dados', v.payloadHash]] },
        ],
      });
      return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${base}.pdf"`).send(pdf);
    },
  );

  r.get('/events/:id/xml', { preValidation: app.requirePerm('esocial.prepare'), schema: { tags: [TAG], summary: 'Gerar XML oficial (somente com adaptador de leiaute homologado)', params: z.object({ id: zId }) } }, async (req, reply) => {
    const ev = await loadEvent(req, req.params.id);
    const adapter = getLeiauteAdapter(ev.type);
    if (!adapter) throw conflict(LEIAUTE_INDISPONIVEL, 'leiaute_indisponivel');
    const v = await getVersionPayload(ev.id, ev.currentVersion);
    const xml = adapter.toXml(v.payload, { eventId: ev.id, ambiente: config.ESOCIAL_AMBIENTE });
    const errors = await adapter.validateXsd(xml);
    await esocialLog(ev, errors.length ? 'warn' : 'info', 'xsd', `Validação XSD: ${errors.length} erro(s)`);
    if (errors.length) return reply.code(422).send({ error: 'xsd', message: 'XML não passou na validação dos esquemas oficiais', details: errors });
    return reply.header('content-type', 'application/xml').send(xml);
  });

  r.post('/events/:id/transmit', { preValidation: app.requirePerm('esocial.transmit'), schema: { tags: [TAG], summary: 'Enviar ao eSocial (bloqueado até haver transmissão oficial configurada)', params: z.object({ id: zId }) } }, async (req) => {
    const ev = await loadEvent(req, req.params.id);
    const transmitter = getTransmitter();
    if (!transmitter.enabled || !getLeiauteAdapter(ev.type)) {
      await esocialLog(ev, 'warn', 'transmissao_bloqueada', 'Tentativa de envio bloqueada: transmissão oficial não configurada');
      throw conflict(
        `${transmitter.reasonDisabled ?? LEIAUTE_INDISPONIVEL} Requisitos: ${REQUISITOS_TRANSMISSAO.join('; ')}.`,
        'transmissao_indisponivel',
      );
    }
    if (!['validado', 'exportado', 'erro_transmissao', 'rejeitado'].includes(ev.status)) throw badRequest('O evento precisa estar validado e sem pendências');
    await prisma.esocialEvent.update({ where: { id: ev.id }, data: { status: 'na_fila' } });
    const boss = await getBoss();
    await boss.send(QUEUES.esocialTransmit, { eventId: ev.id, tenantId: ev.tenantId, version: ev.currentVersion });
    await esocialLog(ev, 'info', 'na_fila', `Versão ${ev.currentVersion} colocada na fila de transmissão`);
    await audit(req, 'enviar_fila', 'esocial_event', ev.id, { versao: ev.currentVersion });
    return { ok: true, status: 'na_fila' };
  });

  r.post(
    '/events/:id/receipt',
    {
      preValidation: app.requirePerm('esocial.transmit'),
      schema: {
        tags: [TAG],
        summary: 'Registrar recibo obtido em outro sistema (marcado como informado manualmente)',
        params: z.object({ id: zId }),
        body: z.object({ receiptNumber: z.string().trim().min(5).max(60), protocolNumber: z.string().trim().max(60).optional(), sourceSystem: z.string().trim().min(2).max(100) }),
      },
    },
    async (req) => {
      const ev = await loadEvent(req, req.params.id);
      if (['na_fila', 'enviado', 'processado'].includes(ev.status)) throw badRequest('Evento já em transmissão ou processado pelo sistema');
      await prisma.esocialEvent.update({
        where: { id: ev.id },
        data: {
          status: 'recibo_manual',
          receiptNumber: req.body.receiptNumber,
          protocolNumber: req.body.protocolNumber ?? null,
          receiptSource: `informado_manualmente:${req.body.sourceSystem}`,
          receiptAt: new Date(),
        },
      });
      await esocialLog(ev, 'info', 'recibo_manual', `Recibo informado manualmente (origem: ${req.body.sourceSystem}); não verificado pelo sistema`);
      await audit(req, 'recibo_manual', 'esocial_event', ev.id, { origem: req.body.sourceSystem });
      return { ok: true };
    },
  );

  // ---------- Tabelas oficiais (importadas pelo administrador) ----------
  r.get('/tables', { preValidation: app.requirePerm('esocial.read'), schema: { tags: [TAG], summary: 'Tabelas importadas e quantidade de códigos' } }, async () => {
    const tables = await prisma.esocialTableEntry.groupBy({ by: ['table'], _count: { _all: true } });
    return Object.values(TABLE_KEYS).map((key) => ({ key, registros: tables.find((t) => t.table === key)?._count._all ?? 0 }));
  });

  r.get(
    '/tables/:table',
    { preValidation: app.requirePerm('esocial.read'), schema: { tags: [TAG], summary: 'Consultar códigos de uma tabela', params: z.object({ table: z.string().regex(/^[a-z_]{3,40}$/) }), querystring: z.object({ q: z.string().max(100).optional() }) } },
    async (req) =>
      prisma.esocialTableEntry.findMany({
        where: {
          table: req.params.table,
          OR: req.query.q ? [{ code: { contains: req.query.q } }, { description: { contains: req.query.q, mode: 'insensitive' } }] : undefined,
        },
        orderBy: { code: 'asc' },
        take: 100,
      }),
  );

  r.post(
    '/tables/:table/import',
    {
      preValidation: app.authenticate,
      bodyLimit: 10 * 1024 * 1024,
      schema: {
        tags: [TAG],
        summary: 'Importar tabela oficial (CSV "codigo;descricao") — superadministrador',
        params: z.object({ table: z.enum(Object.values(TABLE_KEYS) as [string, ...string[]]) }),
        body: z.object({ csv: z.string().min(3).max(10_000_000), replace: z.boolean().default(true), sourceNote: z.string().max(300) }),
      },
    },
    async (req) => {
      if (!req.user!.isSuperAdmin) throw forbidden('Somente o superadministrador importa tabelas oficiais');
      const rows = req.body.csv
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [code, ...rest] = l.split(';');
          return { code: code.trim(), description: rest.join(';').trim() };
        })
        .filter((x) => x.code && x.description && !/^c[oó]digo$/i.test(x.code));
      if (!rows.length) throw badRequest('Nenhuma linha válida no formato codigo;descricao');
      await prisma.$transaction([
        ...(req.body.replace ? [prisma.esocialTableEntry.deleteMany({ where: { table: req.params.table } })] : []),
        prisma.esocialTableEntry.createMany({ data: rows.map((x) => ({ ...x, table: req.params.table })), skipDuplicates: true }),
      ]);
      await audit(req, 'importar_tabela', 'esocial_table', req.params.table, { linhas: rows.length, fonte: req.body.sourceNote }, null);
      return { imported: rows.length };
    },
  );
}
