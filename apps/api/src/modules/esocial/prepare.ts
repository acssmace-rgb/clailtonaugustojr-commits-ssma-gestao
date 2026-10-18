import { prisma } from '../../lib/prisma.js';
import { decryptJson } from '../../lib/crypto.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { onlyDigits } from '../../lib/br.js';
import type { Empregador, Payload, PayloadS2210, PayloadS2220, PayloadS2240, Profissional, Vinculo } from './domain.js';

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

type WorkerWithCompany = { name: string; cpf: string; registration: string | null; categoryCode: string | null; company: { name: string; cnpj: string } };

const empregador = (c: { name: string; cnpj: string }): Empregador => ({ razaoSocial: c.name, tipoInscricao: 'CNPJ', numeroInscricao: onlyDigits(c.cnpj) });
const vinculo = (w: WorkerWithCompany): Vinculo => ({ nome: w.name, cpf: onlyDigits(w.cpf), matricula: w.registration, codigoCategoria: w.categoryCode });

export interface PrepareInput {
  /** S-2240: data de início das condições informadas */
  startDate?: string;
  /** S-2240: responsáveis pelos registros ambientais */
  responsibles?: { nome: string; conselho?: string | null; registro?: string | null; uf?: string | null }[];
  observacoes?: string;
}

/** Monta os dados do evento a partir dos registros do sistema (somente leitura). */
export async function buildPayload(tenantId: string, type: string, sourceId: string, input: PrepareInput = {}): Promise<{ payload: Payload; companyId: string; workerId: string | null }> {
  if (type === 'S2220') {
    const exam = await prisma.exam.findFirst({ where: { id: sourceId, tenantId }, include: { worker: { include: { company: true } } } });
    if (!exam) throw notFound('Exame');
    const procedures = decryptJson<{ code: string; date: string; description?: string | null }[]>(exam.proceduresEnc) ?? [];
    const p: PayloadS2220 = {
      tipo: 'S2220',
      empregador: empregador(exam.worker.company),
      vinculo: vinculo(exam.worker),
      exame: {
        tipo: exam.type,
        data: day(exam.examDate)!,
        resultado: exam.result,
        medicoEmitente: { nome: exam.physicianName, registro: exam.physicianCrm, uf: exam.physicianUf },
        procedimentos: procedures.map((x) => ({ codigo: x.code, data: x.date, descricao: x.description ?? null })),
      },
      responsavelMonitoramento: { nome: exam.pcmsoResponsibleName, registro: exam.pcmsoResponsibleCrm, uf: exam.pcmsoResponsibleUf },
    };
    return { payload: p, companyId: exam.worker.companyId, workerId: exam.workerId };
  }

  if (type === 'S2210') {
    const a = await prisma.accident.findFirst({ where: { id: sourceId, tenantId }, include: { worker: { include: { company: true } } } });
    if (!a) throw notFound('Acidente');
    if (a.type === 'incidente' || a.type === 'quase_acidente') throw badRequest('Incidentes e quase acidentes não geram CAT; registre-os apenas internamente');
    const company = await prisma.company.findFirstOrThrow({ where: { id: a.companyId, tenantId } });
    const unit = await prisma.unit.findFirst({ where: { id: a.unitId, tenantId } });
    const med = decryptJson<{ cid?: string; physicianName?: string; physicianCrm?: string; physicianUf?: string; date?: string; leaveDays?: number; diagnosis?: string }>(a.medicalEnc);
    const p: PayloadS2210 = {
      tipo: 'S2210',
      empregador: empregador(company),
      vinculo: a.worker ? vinculo(a.worker) : null,
      acidente: {
        tipoRegistro: a.type,
        dataHora: a.occurredAt.toISOString(),
        horasTrabalhadas: a.hoursWorked,
        houveObito: a.death,
        dataObito: day(a.deathDate),
        comunicacaoPolicia: a.policeReport,
        descricao: a.description,
        local: { descricao: a.location, estabelecimento: { tipoInscricao: unit?.inscriptionType ?? null, numero: unit?.inscriptionNumber ?? null } },
        parteAtingida: { codigo: a.bodyPartCode, lateralidade: a.laterality },
        agenteCausador: { codigo: a.causingAgentCode },
        situacaoGeradora: { codigo: a.situationCode },
        naturezaLesao: { codigo: a.injuryNatureCode },
        numeroCatOrigem: null,
      },
      atestado: med
        ? {
            houveAfastamento: a.medicalLeave,
            internacao: a.hospitalized,
            data: med.date ?? null,
            diasAfastamento: med.leaveDays ?? null,
            cid: med.cid ?? null,
            diagnostico: med.diagnosis ?? null,
            medico: { nome: med.physicianName ?? null, registro: med.physicianCrm ?? null, uf: med.physicianUf ?? null } satisfies Profissional,
          }
        : null,
    };
    return { payload: p, companyId: a.companyId, workerId: a.workerId };
  }

  if (type === 'S2240') {
    const w = await prisma.worker.findFirst({
      where: { id: sourceId, tenantId },
      include: { company: true, unit: true, jobRole: true, sector: { include: { risks: { where: { active: true } } } } },
    });
    if (!w) throw notFound('Trabalhador');
    let responsibles: PayloadS2240['responsaveisRegistros'] = (input.responsibles ?? []).map((r) => ({ nome: r.nome, conselho: r.conselho ?? null, registro: r.registro ?? null, uf: r.uf ?? null }));
    if (!responsibles.length) {
      // Sugestão: responsável técnico do LTCAT/PGR aprovado mais recente da empresa (conferir antes de usar)
      const doc = await prisma.document.findFirst({
        where: { tenantId, companyId: w.companyId, type: { in: ['LTCAT', 'PGR'] }, status: 'aprovado', technicalResponsible: { not: null } },
        orderBy: { validFrom: 'desc' },
      });
      responsibles = doc ? [{ nome: doc.technicalResponsible, conselho: null, registro: doc.technicalRegistry, uf: null }] : [];
    }
    const p: PayloadS2240 = {
      tipo: 'S2240',
      empregador: empregador(w.company),
      vinculo: vinculo(w),
      dataInicio: input.startDate ?? day(w.admissionDate),
      ambiente: {
        estabelecimento: { tipoInscricao: w.unit.inscriptionType, numero: w.unit.inscriptionNumber, nome: w.unit.name },
        setor: w.sector?.name ?? '',
        descricao: w.sector?.environmentDescription ?? null,
      },
      atividades: { cargo: w.jobRole?.name ?? null, descricao: w.jobRole?.activities ?? null },
      agentes: (w.sector?.risks ?? [])
        // Riscos com código de agente informado pelo profissional, e riscos físicos/químicos/biológicos
        // ainda sem código (aparecem como pendência para avaliação técnica)
        .filter((r) => Boolean(r.agentCode) || ['fisico', 'quimico', 'biologico'].includes(r.type))
        .map((r) => ({
          riscoId: r.id,
          perigo: r.hazard,
          codigoAgente: r.agentCode,
          tipoAvaliacao: r.intensity ? 'quantitativa' : 'qualitativa',
          intensidade: r.intensity,
          unidade: r.unit,
          tecnica: r.technique,
          epcEficaz: r.epcEfficient,
          epiEficaz: r.epiEfficient,
          cas: (r.epiCas ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        })),
      responsaveisRegistros: responsibles,
      observacoes: input.observacoes ?? null,
    };
    return { payload: p, companyId: w.companyId, workerId: w.id };
  }

  throw badRequest('Tipo de evento não suportado');
}
