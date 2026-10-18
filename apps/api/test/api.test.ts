import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/lib/prisma.js';
import { randomToken, sha256 } from '../src/lib/crypto.js';
import { login, setup, validCnpj, validCpf, PASSWORD } from './helpers.js';

let app: FastifyInstance;
let ctx: Awaited<ReturnType<typeof setup>>;
let A: Awaited<ReturnType<typeof login>>;
let companyA: string;
let unitA: string;
let sectorA: string;
let workerA: string;

beforeAll(async () => {
  ctx = await setup();
  app = ctx.app;
  A = await login(app, 'admin.a@teste.example', ctx.tA.id);
  companyA = (await A.post('/companies', { name: 'Empresa A1', cnpj: validCnpj('90000011') })).json().id;
  unitA = (await A.post('/units', { companyId: companyA, name: 'Unidade A1', inscriptionType: 1, inscriptionNumber: validCnpj('90000011') })).json().id;
  sectorA = (await A.post('/sectors', { unitId: unitA, name: 'Produção', environmentDescription: 'Galpão' })).json().id;
  const job = (await A.post('/job-roles', { companyId: companyA, name: 'Operador', cbo: '784205', activities: 'Opera máquinas' })).json().id;
  workerA = (
    await A.post('/workers', { companyId: companyA, unitId: unitA, sectorId: sectorA, jobRoleId: job, name: 'Fulano Teste', cpf: validCpf('111444777'), registration: 'M1', admissionDate: '2025-01-10' })
  ).json().id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('autenticação', () => {
  it('exige cabeçalho anti-CSRF e origem correta em escritas', async () => {
    const noHeader = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@y.example', password: 'a' } });
    expect(noHeader.statusCode).toBe(403);
    const badOrigin = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-requested-with': 'ssma', origin: 'https://malicioso.example' }, payload: { email: 'x@y.example', password: 'a' } });
    expect(badOrigin.statusCode).toBe(403);
  });

  it('não revela se o e-mail existe e bloqueia após tentativas inválidas', async () => {
    const tryLogin = (email: string) => app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-requested-with': 'ssma' }, payload: { email, password: 'errada' } });
    const r1 = await tryLogin('naoexiste@teste.example');
    const r2 = await tryLogin('gestor.a@teste.example');
    expect(r1.statusCode).toBe(401);
    expect(r1.json().message).toBe(r2.json().message);
    for (let i = 0; i < 4; i++) await tryLogin('gestor.a@teste.example');
    const locked = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-requested-with': 'ssma' }, payload: { email: 'gestor.a@teste.example', password: PASSWORD } });
    expect(locked.statusCode).toBe(423);
    await prisma.user.update({ where: { email: 'gestor.a@teste.example' }, data: { lockedUntil: null, failedLogins: 0 } });
  });

  it('rotas protegidas exigem sessão', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/companies', headers: { 'x-tenant-id': ctx.tA.id } });
    expect(r.statusCode).toBe(401);
  });

  it('MFA TOTP: ativação e login em duas etapas', async () => {
    const c = await login(app, 'tec.a@teste.example', ctx.tA.id);
    const setupRes = await c.post('/auth/mfa/setup');
    const { secret } = setupRes.json();
    expect((await c.post('/auth/mfa/enable', { code: '000000' })).statusCode).toBe(400);
    expect((await c.post('/auth/mfa/enable', { code: authenticator.generate(secret) })).statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-requested-with': 'ssma' }, payload: { email: 'tec.a@teste.example', password: PASSWORD } });
    expect(res.json().mfaRequired).toBe(true);
    const cookie = `ssma_sid=${res.cookies.find((k) => k.name === 'ssma_sid')!.value}`;
    const h = { cookie, 'x-tenant-id': ctx.tA.id, 'x-requested-with': 'ssma' };
    expect((await app.inject({ method: 'GET', url: '/api/companies', headers: h })).statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/auth/mfa/verify', headers: h, payload: { code: authenticator.generate(secret) } });
    expect(ok.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/companies', headers: h })).statusCode).toBe(200);
    await prisma.user.update({ where: { email: 'tec.a@teste.example' }, data: { mfaEnabled: false, mfaSecretEnc: null } });
  });

  it('redefinição de senha com token de uso único', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'colab.a@teste.example' } });
    const forgot = await app.inject({ method: 'POST', url: '/api/auth/password/forgot', headers: { 'x-requested-with': 'ssma' }, payload: { email: user.email } });
    expect(forgot.statusCode).toBe(200);
    const token = randomToken();
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60_000) } });
    const reset = (password: string) => app.inject({ method: 'POST', url: '/api/auth/password/reset', headers: { 'x-requested-with': 'ssma' }, payload: { token, password } });
    expect((await reset('curta')).statusCode).toBe(400);
    expect((await reset('NovaSenha2026')).statusCode).toBe(200);
    expect((await reset('OutraSenha2026')).statusCode).toBe(400);
    await login(app, user.email, ctx.tA.id, 'NovaSenha2026');
  });
});

describe('isolamento entre clientes', () => {
  it('usuário do cliente B não vê nem altera dados do cliente A', async () => {
    const B = await login(app, 'admin.b@teste.example', ctx.tB.id);
    expect((await B.get(`/companies/${companyA}`)).statusCode).toBe(404);
    expect((await B.patch(`/companies/${companyA}`, { name: 'Invadido' })).statusCode).toBe(404);
    expect((await B.get('/workers')).json().total).toBe(0);
    // Não pode referenciar empresa de outro cliente
    expect((await B.post('/units', { companyId: companyA, name: 'X' })).statusCode).toBe(400);
  });

  it('não acessa cliente sem vínculo, mesmo informando o cabeçalho', async () => {
    const B = await login(app, 'admin.b@teste.example', ctx.tA.id);
    expect((await B.get('/companies')).statusCode).toBe(400);
  });

  it('escopo por empresa restringe a listagem', async () => {
    const other = (await A.post('/companies', { name: 'Empresa A2', cnpj: validCnpj('90000012') })).json().id;
    await prisma.membership.updateMany({ where: { userId: ctx.users.gestorA.id }, data: { companyIds: [other] } });
    const G = await login(app, 'gestor.a@teste.example', ctx.tA.id);
    const list = (await G.get('/companies')).json();
    expect(list.items.map((c: { id: string }) => c.id)).toEqual([other]);
    expect((await G.get(`/workers/${workerA}`)).statusCode).toBe(404);
    await prisma.membership.updateMany({ where: { userId: ctx.users.gestorA.id }, data: { companyIds: [] } });
  });
});

describe('permissões', () => {
  it('colaborador não cadastra empresa; técnico não vê dados de saúde', async () => {
    const C = await login(app, 'colab.a@teste.example', ctx.tA.id, 'NovaSenha2026');
    expect((await C.post('/companies', { name: 'X', cnpj: validCnpj('90000013') })).statusCode).toBe(403);
    const T = await login(app, 'tec.a@teste.example', ctx.tA.id);
    expect((await T.get('/exams')).statusCode).toBe(403);
    expect((await T.get('/reports/exames')).statusCode).toBe(403);
  });

  it('CPF é mascarado para quem não edita trabalhadores', async () => {
    const G = await login(app, 'gestor.a@teste.example', ctx.tA.id);
    const w = (await G.get(`/workers/${workerA}`)).json();
    expect(w.cpf).toMatch(/^\*\*\*\./);
  });

  it('valida CPF e CNPJ na entrada', async () => {
    expect((await A.post('/companies', { name: 'Inválida', cnpj: '12345678000100' })).statusCode).toBe(400);
    expect((await A.post('/workers', { companyId: companyA, unitId: unitA, name: 'Sem CPF válido', cpf: '12345678900' })).statusCode).toBe(400);
  });
});

describe('dados de saúde', () => {
  it('campos clínicos são gravados criptografados e lidos por quem tem permissão', async () => {
    const S = await login(app, 'saude.a@teste.example', ctx.tA.id);
    const res = await S.post('/exams', {
      workerId: workerA, type: 'periodico', examDate: '2026-01-15', result: 'apto', physicianName: 'Dr X', physicianCrm: '123', physicianUf: 'CE',
      pcmsoResponsibleName: 'Dra Y', pcmsoResponsibleCrm: '456', pcmsoResponsibleUf: 'CE',
      procedures: [{ code: '0295', date: '2026-01-15' }], notes: 'observação confidencial', nextDueDate: '2027-01-15',
    });
    expect(res.statusCode).toBe(201);
    const raw = await prisma.exam.findUniqueOrThrow({ where: { id: res.json().id } });
    expect(raw.notesEnc).not.toContain('confidencial');
    expect((await S.get(`/exams/${raw.id}`)).json().notes).toBe('observação confidencial');
    const logs = await prisma.auditLog.findMany({ where: { entity: 'exam', entityId: raw.id } });
    expect(JSON.stringify(logs)).not.toContain('confidencial');
  });
});

describe('atividades', () => {
  it('fluxo de aprovação e recorrência', async () => {
    const C = await login(app, 'colab.a@teste.example', ctx.tA.id, 'NovaSenha2026');
    const G = await login(app, 'gestor.a@teste.example', ctx.tA.id);
    const t = (
      await A.post('/tasks', { title: 'Inspeção mensal', assigneeId: ctx.users.colabA.id, requiresApproval: true, approverId: ctx.users.gestorA.id, dueDate: '2026-10-31', recurrence: 'mensal' })
    ).json();
    expect((await C.post(`/tasks/${t.id}/complete`)).json().status).toBe('aguardando_aprovacao');
    expect((await C.post(`/tasks/${t.id}/review`, { approve: true })).statusCode).toBe(403);
    expect((await G.post(`/tasks/${t.id}/review`, { approve: false })).statusCode).toBe(400);
    expect((await G.post(`/tasks/${t.id}/review`, { approve: false, reason: 'Falta evidência' })).json().status).toBe('em_andamento');
    await C.post(`/tasks/${t.id}/complete`);
    expect((await G.post(`/tasks/${t.id}/review`, { approve: true })).json().status).toBe('concluida');
    const next = await prisma.task.findFirst({ where: { previousTaskId: t.id } });
    expect(next?.dueDate?.toISOString().slice(0, 10)).toBe('2026-11-30');
    const notifs = await prisma.notification.count({ where: { userId: ctx.users.colabA.id } });
    expect(notifs).toBeGreaterThan(0);
    const history = (await A.get(`/tasks/${t.id}`)).json().history.map((h: { action: string }) => h.action);
    expect(history).toEqual(expect.arrayContaining(['criar', 'reprovar', 'aprovar']));
  });

  it('colaborador não altera tarefa de outra pessoa', async () => {
    const t = (await A.post('/tasks', { title: 'Tarefa do técnico', assigneeId: ctx.users.tecA.id })).json();
    const C = await login(app, 'colab.a@teste.example', ctx.tA.id, 'NovaSenha2026');
    expect((await C.patch(`/tasks/${t.id}`, { title: 'alterada' })).statusCode).toBe(403);
  });
});

describe('documentos', () => {
  it('versão, revisão e aprovação com declaração e registro', async () => {
    const doc = (await A.post('/documents', { companyId: companyA, type: 'PGR', title: 'PGR Teste', validUntil: '2027-01-01' })).json();
    const boundary = '----ssma';
    const pdf = Buffer.from('%PDF-1.4\n%teste\n');
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="changeNotes"\r\n\r\nPrimeira\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pgr.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({ method: 'POST', url: `/api/documents/${doc.id}/versions`, headers: { ...A.headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(up.statusCode).toBe(201);
    expect(up.json().sha256).toHaveLength(64);

    // Conteúdo que não corresponde ao tipo declarado é recusado
    const fake = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      Buffer.from('MZ executável'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const bad = await app.inject({ method: 'POST', url: `/api/documents/${doc.id}/versions`, headers: { ...A.headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: fake });
    expect(bad.statusCode).toBe(400);

    expect((await A.post(`/documents/${doc.id}/versions/1/submit`)).statusCode).toBe(200);
    expect((await A.post(`/documents/${doc.id}/versions/1/review`, { approve: true })).statusCode).toBe(400);
    expect((await A.post(`/documents/${doc.id}/versions/1/review`, { approve: true, declaration: true, approverRegistry: 'CREA-CE 000' })).statusCode).toBe(200);
    const d = (await A.get(`/documents/${doc.id}`)).json();
    expect(d.status).toBe('aprovado');
    expect(d.currentVersion).toBe(1);
    const dl = await A.get(`/documents/${doc.id}/versions/1/download`);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
  });
});

describe('eSocial', () => {
  it('prepara S-2240 com pendências, versiona e nunca simula transmissão', async () => {
    await A.post('/risks', { sectorId: sectorA, type: 'fisico', hazard: 'Ruído', probability: 3, severity: 3 });
    const prep = await A.post('/esocial/events/prepare', { type: 'S2240', sourceId: workerA });
    expect(prep.statusCode).toBe(201);
    const ev = prep.json();
    expect(ev.status).toBe('com_pendencias');
    expect(ev.issues.some((i: { campo: string }) => i.campo.startsWith('agentes'))).toBe(true);

    // Mesmo dado → mesma versão; dado alterado → nova versão
    expect((await A.post(`/esocial/events/${ev.id}/revalidate`)).json().version).toBe(1);
    await A.post('/esocial/events/prepare', { type: 'S2240', sourceId: workerA, input: { responsibles: [{ nome: 'Eng. Z', registro: 'CREA 1', uf: 'CE' }] } });
    const detail = (await A.get(`/esocial/events/${ev.id}`)).json();
    expect(detail.versions).toHaveLength(2);

    const tx = await A.post(`/esocial/events/${ev.id}/transmit`);
    expect(tx.statusCode).toBe(409);
    const after = await prisma.esocialEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(['enviado', 'processado']).not.toContain(after.status);
    expect((await A.get(`/esocial/events/${ev.id}/xml`)).statusCode).toBe(409);

    const exp = await A.get(`/esocial/events/${ev.id}/export?format=json`);
    expect(exp.json().aviso).toContain('NÃO TRANSMITIDO');

    // Logs técnicos não contêm CPF nem nome
    const logs = await prisma.esocialLog.findMany({ where: { eventId: ev.id } });
    const text = JSON.stringify(logs);
    expect(text).not.toContain(validCpf('111444777'));
    expect(text).not.toContain('Fulano');
    // Payload criptografado no banco
    const v = await prisma.esocialEventVersion.findFirstOrThrow({ where: { eventId: ev.id } });
    expect(v.payloadEnc).not.toContain('Fulano');
  });

  it('recibo informado manualmente fica identificado como tal', async () => {
    const ev = (await A.get('/esocial/events')).json().items[0];
    expect((await A.post(`/esocial/events/${ev.id}/receipt`, { receiptNumber: '1.2.0000000000000000001', sourceSystem: 'Portal Web eSocial' })).statusCode).toBe(200);
    const e = await prisma.esocialEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(e.status).toBe('recibo_manual');
    expect(e.receiptSource).toContain('informado_manualmente');
    // Nova preparação após recibo gera evento de retificação
    const again = (await A.post('/esocial/events/prepare', { type: 'S2240', sourceId: workerA })).json();
    expect(again.id).not.toBe(ev.id);
    expect((await prisma.esocialEvent.findUniqueOrThrow({ where: { id: again.id } })).isRetification).toBe(true);
  });

  it('S-2220 exige permissão de saúde', async () => {
    const T = await login(app, 'tec.a@teste.example', ctx.tA.id);
    const exam = await prisma.exam.findFirstOrThrow({ where: { workerId: workerA } });
    expect((await T.post('/esocial/events/prepare', { type: 'S2220', sourceId: exam.id })).statusCode).toBe(403);
  });
});

describe('relatórios e LGPD', () => {
  it('exporta relatório em CSV com proteção contra fórmulas', async () => {
    await A.post('/tasks', { title: '=HYPERLINK("http://x")' });
    const r = await A.get('/reports/tarefas?format=csv');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("'=HYPERLINK");
  });

  it('painel traz fórmula de cada indicador', async () => {
    const d = (await A.get('/dashboard')).json();
    expect(d.kpis.length).toBeGreaterThan(3);
    expect(d.kpis.every((k: { formula: string }) => k.formula.length > 10)).toBe(true);
  });

  it('agendamento só aceita destinatários do próprio cliente', async () => {
    const bad = await A.post('/report-schedules', { name: 'Semanal', reportKey: 'tarefas', frequency: 'semanal', recipientIds: [ctx.users.adminB.id] });
    expect(bad.statusCode).toBe(400);
    const ok = await A.post('/report-schedules', { name: 'Semanal', reportKey: 'tarefas', frequency: 'semanal', recipientIds: [ctx.users.gestorA.id] });
    expect(ok.statusCode).toBe(201);
  });

  it('exporta e anonimiza dados do titular', async () => {
    const w = (await A.post('/workers', { companyId: companyA, unitId: unitA, name: 'Titular LGPD', cpf: validCpf('222555888') })).json();
    const exp = await A.get(`/lgpd/workers/${w.id}/export`);
    expect(exp.json().titular.nome).toBe('Titular LGPD');
    expect((await A.post(`/lgpd/workers/${w.id}/anonymize`, { confirmName: 'Outro', reason: 'Solicitação do titular', retentionChecked: true })).statusCode).toBe(400);
    expect((await A.post(`/lgpd/workers/${w.id}/anonymize`, { confirmName: 'Titular LGPD', reason: 'Solicitação do titular', retentionChecked: true })).statusCode).toBe(200);
    const after = await prisma.worker.findUniqueOrThrow({ where: { id: w.id } });
    expect(after.name).toMatch(/^Titular anonimizado/);
    expect(after.cpf).toMatch(/^ANON-/);
  });
});
