/**
 * DADOS DE DEMONSTRAÇÃO — TOTALMENTE FICTÍCIOS.
 * Nomes, empresas, CPFs/CNPJs (gerados apenas com dígitos verificadores válidos), exames,
 * acidentes e documentos são inventados para demonstrar o sistema. Não usar em produção.
 */
import PDFDocument from 'pdfkit';
import { prisma } from '../src/lib/prisma.js';
import { config } from '../src/lib/config.js';
import { hashPassword } from '../src/lib/password.js';
import { encryptJson, encrypt, sha256 } from '../src/lib/crypto.js';
import { createTenant } from '../src/lib/tenants.js';
import { storage, newStorageKey } from '../src/lib/storage.js';
import { prepareEvent } from '../src/modules/esocial/service.js';

if (config.NODE_ENV === 'production' && !config.ALLOW_DEMO_SEED) {
  console.error('Seed de demonstração bloqueado em produção (defina ALLOW_DEMO_SEED=true apenas em ambientes de teste).');
  process.exit(1);
}

const DEMO_PASSWORD = 'Demo@2026ssma';
const SLUG = 'demo-ficticio';

// Gerador pseudoaleatório determinístico (mesmos dados a cada execução)
let seed = 20261018;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

function cpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(rand() * 10));
  for (const len of [9, 10]) {
    const sum = n.slice(0, len).reduce((acc, d, i) => acc + d * (len + 1 - i), 0);
    const r = (sum * 10) % 11;
    n.push(r === 10 ? 0 : r);
  }
  return n.join('');
}

function cnpj(base8: string, branch = '0001'): string {
  const n = (base8 + branch).split('').map(Number);
  for (const w of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const r = w.reduce((acc, x, i) => acc + n[i] * x, 0) % 11;
    n.push(r < 2 ? 0 : 11 - r);
  }
  return n.join('');
}

const day = (offset: number) => {
  const d = new Date(new Date().toISOString().slice(0, 10));
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

function demoPdf(title: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(18).fillColor('#2C302E').text(title);
    doc.moveDown().fontSize(12).fillColor('#B00020').text('DOCUMENTO FICTÍCIO PARA DEMONSTRAÇÃO');
    doc.moveDown().fillColor('#333').fontSize(10).text(
      'Este arquivo foi gerado automaticamente pelo seed de demonstração do SSMA Gestão. ' +
        'Não possui conteúdo técnico, não foi elaborado nem aprovado por profissional habilitado e não tem validade legal.',
    );
    doc.end();
  });
}

async function wipeDemo() {
  const t = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!t) return;
  const w = { tenantId: t.id };
  await prisma.esocialEvent.deleteMany({ where: w });
  await prisma.notification.deleteMany({ where: w });
  await prisma.reportSchedule.deleteMany({ where: w });
  await prisma.attachment.deleteMany({ where: w });
  await prisma.taskComment.deleteMany({ where: w });
  await prisma.task.deleteMany({ where: w });
  await prisma.actionPlan.deleteMany({ where: w });
  await prisma.documentVersion.deleteMany({ where: w });
  await prisma.document.deleteMany({ where: w });
  await prisma.trainingRecord.deleteMany({ where: w });
  await prisma.training.deleteMany({ where: w });
  await prisma.ppeDelivery.deleteMany({ where: w });
  await prisma.ppe.deleteMany({ where: w });
  await prisma.accident.deleteMany({ where: w });
  await prisma.exam.deleteMany({ where: w });
  await prisma.risk.deleteMany({ where: w });
  await prisma.worker.deleteMany({ where: w });
  await prisma.auditLog.deleteMany({ where: w });
  await prisma.tenant.delete({ where: { id: t.id } }); // cascata: empresas, unidades, setores, cargos, papéis, vínculos
}

async function main() {
  await wipeDemo();
  const pass = await hashPassword(DEMO_PASSWORD);
  const tenant = await createTenant({ name: 'Cliente Demonstração (DADOS FICTÍCIOS)', slug: SLUG, isDemo: true });
  const roles = Object.fromEntries((await prisma.role.findMany({ where: { tenantId: tenant.id } })).map((r) => [r.key, r]));

  const people = [
    { key: 'super', email: 'super@demo.ssma.example', name: 'Superadministrador (fictício)', isSuperAdmin: true },
    { key: 'admin', email: 'admin@demo.ssma.example', name: 'Ana Administradora (fictícia)' },
    { key: 'tecnico_sst', email: 'tecnico@demo.ssma.example', name: 'Tiago Técnico de Segurança (fictício)' },
    { key: 'saude', email: 'medica@demo.ssma.example', name: 'Dra. Marta Saúde Ocupacional (fictícia)' },
    { key: 'gestor', email: 'gestor@demo.ssma.example', name: 'Gustavo Gestor (fictício)' },
    { key: 'colaborador', email: 'colaborador@demo.ssma.example', name: 'Carla Colaboradora (fictícia)' },
  ];
  const users: Record<string, string> = {};
  for (const p of people) {
    const u = await prisma.user.upsert({
      where: { email: p.email },
      update: { name: p.name, passwordHash: pass, active: true, mfaEnabled: false, mfaSecretEnc: null, failedLogins: 0, lockedUntil: null },
      create: { email: p.email, name: p.name, passwordHash: pass, isSuperAdmin: Boolean(p.isSuperAdmin) },
    });
    users[p.key] = u.id;
    if (p.key !== 'super') await prisma.membership.create({ data: { userId: u.id, tenantId: tenant.id, roleId: roles[p.key].id } });
  }
  const T = tenant.id;

  // ---------- Empresas, unidades, setores, cargos ----------
  const metal = await prisma.company.create({
    data: { tenantId: T, isDemo: true, name: 'Metalúrgica Exemplo Ltda. (FICTÍCIA)', tradeName: 'Metal Exemplo', cnpj: cnpj('90000001'), cnae: '2599399', riskDegree: 3, city: 'Fortaleza', uf: 'CE', address: 'Rua Fictícia, 100' },
  });
  const constr = await prisma.company.create({
    data: { tenantId: T, isDemo: true, name: 'Construtora Modelo S.A. (FICTÍCIA)', tradeName: 'Modelo Obras', cnpj: cnpj('90000002'), cnae: '4120400', riskDegree: 3, city: 'Maracanaú', uf: 'CE', address: 'Av. Inventada, 2000' },
  });
  const mMatriz = await prisma.unit.create({ data: { tenantId: T, companyId: metal.id, name: 'Matriz — Fábrica', inscriptionType: 1, inscriptionNumber: metal.cnpj, city: 'Fortaleza', uf: 'CE' } });
  const mFilial = await prisma.unit.create({ data: { tenantId: T, companyId: metal.id, name: 'Filial — Centro de distribuição', inscriptionType: 1, inscriptionNumber: cnpj('90000001', '0002'), city: 'Caucaia', uf: 'CE' } });
  const cObra = await prisma.unit.create({ data: { tenantId: T, companyId: constr.id, name: 'Obra Residencial Horizonte (fictícia)', inscriptionType: 4, inscriptionNumber: null, city: 'Maracanaú', uf: 'CE' } });

  const sec = async (unitId: string, name: string, env: string | null) =>
    prisma.sector.create({ data: { tenantId: T, unitId, name, environmentDescription: env } });
  const sUsinagem = await sec(mMatriz.id, 'Usinagem', 'Galpão industrial com tornos e fresadoras, piso de concreto, ventilação natural e exaustão localizada (descrição fictícia).');
  const sSolda = await sec(mMatriz.id, 'Solda', 'Área de soldagem MIG/MAG com biombos e exaustão (descrição fictícia).');
  const sAdm = await sec(mMatriz.id, 'Administrativo', 'Escritório climatizado (descrição fictícia).');
  const sAlmox = await sec(mFilial.id, 'Almoxarifado', null);
  const sCanteiro = await sec(cObra.id, 'Canteiro de obras', 'Canteiro a céu aberto com estrutura em execução (descrição fictícia).');

  const job = async (companyId: string, name: string, cbo: string, activities: string | null) =>
    prisma.jobRole.create({ data: { tenantId: T, companyId, name, cbo, activities } });
  const jTorneiro = await job(metal.id, 'Torneiro mecânico', '721215', 'Opera torno convencional e CNC; ajusta peças (descrição fictícia).');
  const jSoldador = await job(metal.id, 'Soldador', '724315', 'Executa soldagem MIG/MAG em estruturas metálicas (descrição fictícia).');
  const jAux = await job(metal.id, 'Auxiliar administrativo', '411005', 'Atividades administrativas (descrição fictícia).');
  const jAlmox = await job(metal.id, 'Almoxarife', '414105', null);
  const jPedreiro = await job(constr.id, 'Pedreiro', '715210', 'Execução de alvenaria e concreto (descrição fictícia).');

  const first = ['Ana', 'Bruno', 'Carlos', 'Daniela', 'Eduardo', 'Fernanda', 'Gabriel', 'Helena', 'Igor', 'Juliana', 'Lucas', 'Mariana', 'Nelson', 'Olívia', 'Paulo', 'Renata', 'Sérgio', 'Talita', 'Vitor', 'Yara'];
  const last = ['Fictício', 'Exemplo', 'Demonstração', 'Modelo', 'Teste', 'Simulado'];
  const plan: [string, string, string, string][] = [
    [metal.id, mMatriz.id, sUsinagem.id, jTorneiro.id], [metal.id, mMatriz.id, sUsinagem.id, jTorneiro.id], [metal.id, mMatriz.id, sUsinagem.id, jTorneiro.id],
    [metal.id, mMatriz.id, sSolda.id, jSoldador.id], [metal.id, mMatriz.id, sSolda.id, jSoldador.id], [metal.id, mMatriz.id, sSolda.id, jSoldador.id],
    [metal.id, mMatriz.id, sAdm.id, jAux.id], [metal.id, mMatriz.id, sAdm.id, jAux.id],
    [metal.id, mFilial.id, sAlmox.id, jAlmox.id], [metal.id, mFilial.id, sAlmox.id, jAlmox.id],
    [constr.id, cObra.id, sCanteiro.id, jPedreiro.id], [constr.id, cObra.id, sCanteiro.id, jPedreiro.id], [constr.id, cObra.id, sCanteiro.id, jPedreiro.id],
    [constr.id, cObra.id, sCanteiro.id, jPedreiro.id], [constr.id, cObra.id, sCanteiro.id, jPedreiro.id], [metal.id, mMatriz.id, sSolda.id, jSoldador.id],
  ];
  const workers = [];
  for (const [i, [companyId, unitId, sectorId, jobRoleId]] of plan.entries()) {
    workers.push(
      await prisma.worker.create({
        data: {
          tenantId: T, isDemo: true, companyId, unitId, sectorId, jobRoleId,
          name: `${first[i]} ${pick(last)} ${pick(last)}`,
          cpf: cpf(),
          birthDate: day(-365 * (22 + Math.floor(rand() * 30))),
          gender: i % 2 ? 'F' : 'M',
          registration: `DEMO${String(1000 + i)}`,
          categoryCode: i === 3 ? null : '101',
          admissionDate: day(-30 - Math.floor(rand() * 2000)),
          status: i === 15 ? 'desligado' : i === 9 ? 'afastado' : 'ativo',
          terminationDate: i === 15 ? day(-400) : null,
        },
      }),
    );
  }

  // ---------- Riscos (inventário fictício; códigos de agente propositalmente em branco) ----------
  const risk = (sectorId: string, type: 'fisico' | 'quimico' | 'biologico' | 'ergonomico' | 'acidente' | 'psicossocial', hazard: string, p: number, s: number, extra: Record<string, unknown> = {}) =>
    prisma.risk.create({ data: { tenantId: T, sectorId, type, hazard, probability: p, severity: s, level: p * s, assessedAt: day(-120), assessedBy: 'Tiago Técnico (fictício)', ...extra } });
  await risk(sUsinagem.id, 'fisico', 'Ruído contínuo de máquinas', 4, 3, { intensity: '88', unit: 'dB(A)', technique: 'Dosimetria (exemplo fictício)', controls: 'Enclausuramento parcial; protetor auricular; PCA', epiEfficient: true, epiCas: 'CA-DEMO-001' });
  await risk(sUsinagem.id, 'acidente', 'Partes móveis de máquinas (prensamento)', 3, 5, { controls: 'Proteções fixas e intertravamento; capacitação' });
  await risk(sSolda.id, 'quimico', 'Fumos metálicos de soldagem', 4, 4, { controls: 'Exaustão localizada; respirador PFF2', epiEfficient: true, epiCas: 'CA-DEMO-002' });
  await risk(sSolda.id, 'fisico', 'Radiação não ionizante (arco elétrico)', 4, 3, { controls: 'Máscara de solda com filtro; biombos' });
  await risk(sAdm.id, 'ergonomico', 'Postura sentada prolongada', 3, 2, { controls: 'Mobiliário ajustável; pausas' });
  await risk(sAlmox.id, 'ergonomico', 'Levantamento manual de cargas', 3, 3, { controls: 'Carrinhos e paleteiras; treinamento' });
  await risk(sCanteiro.id, 'acidente', 'Trabalho em altura', 3, 5, { controls: 'Linha de vida; cinto paraquedista; permissão de trabalho' });
  await risk(sCanteiro.id, 'quimico', 'Poeira de cimento e sílica', 3, 4, { controls: 'Umidificação; respirador' });
  await risk(sAdm.id, 'psicossocial', 'Sobrecarga e pressão por prazos', 2, 3, { controls: 'Avaliação psicossocial; plano de ação' });

  // ---------- Exames (ASO) — dados de saúde fictícios ----------
  const medico = { physicianName: 'Dr. Médico Examinador (fictício)', physicianCrm: '00000', physicianUf: 'CE' as const, pcmsoResponsibleName: 'Dra. Marta Saúde Ocupacional (fictícia)', pcmsoResponsibleCrm: '11111', pcmsoResponsibleUf: 'CE' as const };
  const exams = [];
  for (const [i, w] of workers.entries()) {
    if (i === 12) continue; // um trabalhador sem exame registrado
    const examDate = day(-Math.floor(rand() * 400) - 10);
    const next = new Date(examDate);
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    exams.push(
      await prisma.exam.create({
        data: {
          tenantId: T, workerId: w.id, type: i < 3 ? 'admissional' : 'periodico', examDate, result: 'apto', ...medico,
          proceduresEnc: encryptJson([{ code: 'DEMO-01', date: examDate.toISOString().slice(0, 10), description: 'Exame clínico (exemplo)' }]),
          notesEnc: encrypt('Observação clínica fictícia para demonstração.'),
          nextDueDate: next,
        },
      }),
    );
  }

  // ---------- Ocorrências ----------
  const acc = await prisma.accident.create({
    data: {
      tenantId: T, companyId: metal.id, unitId: mMatriz.id, workerId: workers[4].id, type: 'tipico', status: 'em_investigacao',
      occurredAt: new Date(day(-12).getTime() + 14.5 * 3600_000), hoursWorked: '05:30',
      description: 'Corte superficial na mão esquerda durante manuseio de chapa metálica sem luva adequada (ocorrência fictícia).',
      location: 'Setor de solda — bancada 2', laterality: 'esquerda', medicalLeave: true,
      medicalEnc: encryptJson({ cid: 'DEMO', physicianName: 'Dr. Plantonista (fictício)', physicianCrm: '22222', physicianUf: 'CE', date: day(-12).toISOString().slice(0, 10), leaveDays: 2, diagnosis: 'Diagnóstico fictício' }),
      rootCause: 'Luva inadequada para a tarefa; ausência de procedimento de manuseio de chapas.',
      investigation: 'Análise pelo método dos 5 porquês em andamento (fictício).',
    },
  });
  await prisma.accident.create({ data: { tenantId: T, companyId: metal.id, unitId: mMatriz.id, type: 'quase_acidente', status: 'concluido', occurredAt: new Date(day(-30).getTime() + 9 * 3600_000), description: 'Peça caiu de prateleira próxima a trabalhador, sem lesão (fictício).', location: 'Usinagem', rootCause: 'Prateleira sem batente.' } });
  await prisma.accident.create({ data: { tenantId: T, companyId: constr.id, unitId: cObra.id, type: 'incidente', status: 'registrado', occurredAt: new Date(day(-5).getTime() + 16 * 3600_000), description: 'Rompimento de mangueira de concreto, sem vítimas (fictício).', location: 'Pavimento 3' } });

  // ---------- EPI e treinamentos ----------
  const prot = await prisma.ppe.create({ data: { tenantId: T, name: 'Protetor auricular tipo plug (exemplo)', ca: 'CA-DEMO-001', caValidUntil: day(200), replaceDays: 90 } });
  const resp = await prisma.ppe.create({ data: { tenantId: T, name: 'Respirador PFF2 (exemplo)', ca: 'CA-DEMO-002', caValidUntil: day(10), replaceDays: 15 } });
  for (const w of workers.slice(0, 6)) {
    const deliveredAt = day(-Math.floor(rand() * 100));
    await prisma.ppeDelivery.create({ data: { tenantId: T, workerId: w.id, ppeId: w.sectorId === sSolda.id ? resp.id : prot.id, deliveredAt, replaceBy: new Date(deliveredAt.getTime() + (w.sectorId === sSolda.id ? 15 : 90) * 86400_000), reason: 'Entrega inicial (fictícia)' } });
  }
  const tAltura = await prisma.training.create({ data: { tenantId: T, name: 'Trabalho em altura (demonstração)', reference: 'Conteúdo e periodicidade a definir pelo responsável técnico', workloadHours: 8, validityMonths: 24 } });
  const tInteg = await prisma.training.create({ data: { tenantId: T, name: 'Integração de segurança (demonstração)', workloadHours: 4, validityMonths: 12 } });
  for (const w of workers.slice(10, 15)) {
    const completedAt = day(-Math.floor(rand() * 800));
    await prisma.trainingRecord.create({ data: { tenantId: T, trainingId: tAltura.id, workerId: w.id, completedAt, validUntil: new Date(completedAt.getTime() + 730 * 86400_000), instructor: 'Instrutor fictício' } });
  }
  for (const w of workers.slice(0, 8)) {
    const completedAt = day(-Math.floor(rand() * 420));
    await prisma.trainingRecord.create({ data: { tenantId: T, trainingId: tInteg.id, workerId: w.id, completedAt, validUntil: new Date(completedAt.getTime() + 365 * 86400_000), instructor: 'Instrutor fictício' } });
  }

  // ---------- Documentos (arquivos fictícios) ----------
  const addDoc = async (data: Record<string, unknown>, versions: { status: 'rascunho' | 'em_revisao' | 'aprovada' }[]) => {
    const doc = await prisma.document.create({ data: { tenantId: T, ...(data as { companyId: string; type: 'PGR'; title: string }) } });
    let approved = 0;
    for (const [i, v] of versions.entries()) {
      const buf = await demoPdf(`${String(data.title)} — versão ${i + 1}`);
      const key = newStorageKey(T, 'documentos');
      await storage.put(key, buf, 'application/pdf');
      await prisma.documentVersion.create({
        data: {
          tenantId: T, documentId: doc.id, version: i + 1, status: v.status, fileName: `documento-ficticio-v${i + 1}.pdf`, mimeType: 'application/pdf', size: buf.length, storageKey: key, sha256: sha256(buf),
          changeNotes: i === 0 ? 'Versão inicial (fictícia)' : 'Revisão anual (fictícia)', uploadedById: users.tecnico_sst,
          ...(v.status === 'aprovada' ? { approvedById: users.tecnico_sst, approvedAt: day(-100), reviewedById: users.tecnico_sst, reviewedAt: day(-100), approverRegistry: 'Registro fictício 000000' } : {}),
        },
      });
      if (v.status === 'aprovada') approved = i + 1;
    }
    await prisma.document.update({ where: { id: doc.id }, data: { currentVersion: approved } });
    return doc;
  };
  await addDoc({ companyId: metal.id, unitId: mMatriz.id, type: 'PGR', title: 'PGR — Matriz (FICTÍCIO)', code: 'PGR-001', status: 'aprovado', responsibleId: users.tecnico_sst, technicalResponsible: 'Eng. Responsável Fictício', technicalRegistry: 'Registro fictício 000000', validFrom: day(-100), validUntil: day(265) }, [{ status: 'aprovada' }]);
  await addDoc({ companyId: metal.id, type: 'PCMSO', title: 'PCMSO — Metalúrgica Exemplo (FICTÍCIO)', code: 'PCMSO-001', status: 'em_revisao', responsibleId: users.saude, technicalResponsible: 'Dra. Marta Saúde Ocupacional (fictícia)', technicalRegistry: 'CRM fictício 11111', validUntil: day(20) }, [{ status: 'aprovada' }, { status: 'em_revisao' }]);
  await addDoc({ companyId: metal.id, type: 'LTCAT', title: 'LTCAT — Matriz (FICTÍCIO)', status: 'aprovado', responsibleId: users.tecnico_sst, technicalResponsible: 'Eng. Responsável Fictício', technicalRegistry: 'Registro fictício 000000', validUntil: day(-15) }, [{ status: 'aprovada' }]);
  await addDoc({ companyId: constr.id, unitId: cObra.id, type: 'ORDEM_SERVICO', title: 'Ordem de serviço — Pedreiro (FICTÍCIA)', status: 'rascunho', responsibleId: users.tecnico_sst, validUntil: day(45) }, [{ status: 'rascunho' }]);
  await prisma.document.create({ data: { tenantId: T, companyId: constr.id, type: 'LICENCA_AMBIENTAL', title: 'Licença de operação — canteiro (FICTÍCIA)', status: 'aprovado', validUntil: day(25), notes: 'Registro fictício para demonstrar alerta de vencimento.' } });

  // ---------- Atividades ----------
  const plan1 = await prisma.actionPlan.create({ data: { tenantId: T, companyId: metal.id, unitId: mMatriz.id, title: 'Plano de ação — acidente na solda (fictício)', objective: 'Eliminar causas do corte na mão', origin: 'acidente', ownerId: users.tecnico_sst, dueDate: day(30), status: 'em_andamento' } });
  const mk = (d: Record<string, unknown>) => prisma.task.create({ data: { tenantId: T, createdById: users.tecnico_sst, ...(d as { title: string }) } });
  await mk({ title: 'Especificar luva anticorte adequada', actionPlanId: plan1.id, companyId: metal.id, unitId: mMatriz.id, assigneeId: users.tecnico_sst, priority: 'alta', dueDate: day(-2), status: 'em_andamento', origin: 'acidente', originId: acc.id });
  await mk({ title: 'Elaborar procedimento de manuseio de chapas', actionPlanId: plan1.id, companyId: metal.id, unitId: mMatriz.id, assigneeId: users.colaborador, priority: 'media', dueDate: day(10), requiresApproval: true, approverId: users.gestor });
  await mk({ title: 'Treinar soldadores no novo procedimento', actionPlanId: plan1.id, companyId: metal.id, unitId: mMatriz.id, assigneeId: users.tecnico_sst, priority: 'media', dueDate: day(25) });
  await mk({ title: 'Inspeção mensal de extintores — Matriz', companyId: metal.id, unitId: mMatriz.id, assigneeId: users.colaborador, priority: 'media', dueDate: day(2), recurrence: 'mensal', origin: 'inspecao', requiresApproval: true, approverId: users.tecnico_sst });
  await mk({ title: 'Revisar inventário de riscos do canteiro', companyId: constr.id, unitId: cObra.id, assigneeId: users.tecnico_sst, priority: 'critica', dueDate: day(-6), origin: 'risco' });
  await mk({ title: 'Conferir pendências do S-2240 dos pedreiros', companyId: constr.id, assigneeId: users.tecnico_sst, priority: 'alta', dueDate: day(7), origin: 'esocial' });
  const done = await mk({ title: 'Atualizar quadro de avisos de SST', companyId: metal.id, assigneeId: users.colaborador, priority: 'baixa', dueDate: day(-20), status: 'concluida', completedAt: day(-21) });
  await prisma.taskComment.create({ data: { tenantId: T, taskId: done.id, userId: users.colaborador, body: 'Quadro atualizado com cartazes da campanha (comentário fictício).' } });

  // ---------- Configurações do cliente ----------
  await prisma.tenant.update({
    where: { id: T },
    data: { settings: { alertDays: { documents: 30, exams: 30, trainings: 30, ppe: 15, tasks: 3 }, riskMatrix: { moderado: 5, alto: 10, critico: 17 }, esocialDeadlines: { S2210: null, S2220: null, S2240: null }, retentionReviewMonths: null } },
  });

  // ---------- eSocial: preparação de exemplos (mostra pendências das regras internas) ----------
  await prepareEvent({ tenantId: T, userId: users.saude, type: 'S2220', sourceId: exams[0].id });
  await prepareEvent({ tenantId: T, userId: users.tecnico_sst, type: 'S2240', sourceId: workers[0].id });
  await prepareEvent({ tenantId: T, userId: users.tecnico_sst, type: 'S2240', sourceId: workers[10].id });
  await prepareEvent({ tenantId: T, userId: users.tecnico_sst, type: 'S2210', sourceId: acc.id });

  console.log('\nDados de demonstração (FICTÍCIOS) criados.');
  console.log(`Senha de todos os usuários de demonstração: ${DEMO_PASSWORD}`);
  for (const p of people) console.log(`  ${p.email.padEnd(34)} ${p.key}`);
}

await main();
await prisma.$disconnect();
