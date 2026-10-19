import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ResourcePage, type ResourceConfig } from '../components/ResourcePage';
import { Attachments } from '../components/Attachments';
import { REF } from '../components/refs';
import { Badge, Tabs, fmtDate, fmtDateTime, label, options } from '../components/ui';

type R = Record<string, unknown>;
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map((u) => ({ value: u, label: u }));
const scale = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
const yesNo = (v: unknown) => (v === true ? 'Sim' : v === false ? 'Não' : '—');

const riskLevelBadge = (level: number) => {
  // Classificação visual simples; a classe oficial do cliente usa a matriz configurada (ver Relatórios)
  const tone = level >= 17 ? 'vencido' : level >= 10 ? 'a_vencer' : level >= 5 ? 'aviso' : 'vigente';
  return <Badge v={tone}>{level}</Badge>;
};

const risksConfig: ResourceConfig = {
  title: 'Perigos e riscos ocupacionais',
  singular: 'Risco',
  description: 'Inventário por setor: perigo, avaliação (probabilidade × severidade) e medidas de controle. É a base do PGR e da preparação do S-2240.',
  endpoint: '/risks',
  readPerm: 'risks.read',
  writePerm: 'risks.write',
  deleteLabel: 'Inativar',
  searchPlaceholder: 'Perigo, descrição ou código do agente',
  filters: [
    { name: 'sectorId', label: 'Setor', type: 'ref', ref: REF.sectorsAll },
    { name: 'type', label: 'Tipo', type: 'select', options: options('riskType') },
  ],
  fields: [
    { name: 'sectorId', label: 'Setor', type: 'ref', ref: REF.sectorsAll, required: true },
    { name: 'type', label: 'Tipo de risco', type: 'select', options: options('riskType'), required: true },
    { name: 'hazard', label: 'Perigo / fator de risco', type: 'text', required: true, full: true },
    { name: 'description', label: 'Descrição / possíveis danos', type: 'textarea' },
    { name: 'source', label: 'Fonte geradora', type: 'text' },
    { name: 'agentCode', label: 'Código do agente nocivo (tabela oficial)', type: 'text', help: 'Preencha conforme a tabela de agentes nocivos vigente do eSocial, quando aplicável.' },
    { name: 'intensity', label: 'Intensidade/concentração', type: 'text' },
    { name: 'unit', label: 'Unidade de medida', type: 'text' },
    { name: 'technique', label: 'Técnica de avaliação', type: 'text' },
    { name: 'probability', label: 'Probabilidade (1–5)', type: 'select', options: scale, required: true },
    { name: 'severity', label: 'Severidade (1–5)', type: 'select', options: scale, required: true },
    { name: 'controls', label: 'Medidas de controle', type: 'textarea' },
    { name: 'epcEfficient', label: 'EPC eficaz?', type: 'checkbox' },
    { name: 'epiEfficient', label: 'EPI eficaz?', type: 'checkbox' },
    { name: 'epiCas', label: 'CA dos EPIs (separados por vírgula)', type: 'text' },
    { name: 'assessedAt', label: 'Data da avaliação', type: 'date' },
    { name: 'assessedBy', label: 'Avaliado por', type: 'text' },
  ],
  toBody: (b) => ({ ...b, probability: b.probability ? Number(b.probability) : undefined, severity: b.severity ? Number(b.severity) : undefined }),
  columns: [
    { key: 'hazard', label: 'Perigo' },
    { key: 'type', label: 'Tipo', render: (r) => label('riskType', r.type as string) },
    { key: 'sector', label: 'Setor', render: (r) => `${String((r.sector as R)?.name ?? '')} — ${String(((r.sector as R)?.unit as R)?.name ?? '')}` },
    { key: 'agentCode', label: 'Cód. agente', render: (r) => (r.agentCode ? String(r.agentCode) : <span className="muted">—</span>) },
    { key: 'level', label: 'Nível (P×S)', render: (r) => riskLevelBadge(Number(r.level)) },
    { key: 'controls', label: 'Controles', render: (r) => <span className="small">{String(r.controls ?? '—').slice(0, 80)}</span> },
  ],
};

const examsConfig = (workerId?: string): ResourceConfig => ({
  title: 'Exames ocupacionais e ASO',
  singular: 'Exame',
  description: 'Dados de saúde com acesso restrito. Procedimentos e observações clínicas são armazenados criptografados.',
  notice: <div className="notice warn">Acesso restrito à equipe de saúde. Todas as consultas e alterações ficam registradas na auditoria.</div>,
  endpoint: '/exams',
  readPerm: 'health.read',
  writePerm: 'health.write',
  initialFilters: workerId ? { workerId } : undefined,
  filters: [
    { name: 'workerId', label: 'Trabalhador', type: 'ref', ref: REF.workersAll },
    { name: 'type', label: 'Tipo', type: 'select', options: options('examType') },
  ],
  fields: [
    { name: 'workerId', label: 'Trabalhador', type: 'ref', ref: REF.workersAll, required: true, full: true },
    { name: 'type', label: 'Tipo de exame', type: 'select', options: options('examType'), required: true },
    { name: 'examDate', label: 'Data do ASO', type: 'date', required: true },
    { name: 'result', label: 'Resultado', type: 'select', options: [{ value: 'apto', label: 'Apto' }, { value: 'inapto', label: 'Inapto' }] },
    { name: 'nextDueDate', label: 'Próximo exame previsto', type: 'date', help: 'Periodicidade definida pelo PCMSO.' },
    { name: 'physicianName', label: 'Médico emitente', type: 'text' },
    { name: 'physicianCrm', label: 'CRM', type: 'text' },
    { name: 'physicianUf', label: 'UF do CRM', type: 'select', options: UFS },
    { name: 'pcmsoResponsibleName', label: 'Médico responsável pelo PCMSO', type: 'text' },
    { name: 'pcmsoResponsibleCrm', label: 'CRM (PCMSO)', type: 'text' },
    { name: 'pcmsoResponsibleUf', label: 'UF (PCMSO)', type: 'select', options: UFS },
    { name: 'proceduresText', label: 'Procedimentos realizados', type: 'textarea', help: 'Um por linha: código;data (AAAA-MM-DD);descrição. Use os códigos da tabela oficial de procedimentos.' },
    { name: 'notes', label: 'Observações clínicas', type: 'textarea' },
  ],
  fromRow: (row) => ({
    proceduresText: ((row.procedures as { code: string; date: string; description?: string | null }[]) ?? [])
      .map((p) => [p.code, p.date, p.description ?? ''].join(';'))
      .join('\n'),
  }),
  toBody: (b) => {
    const { proceduresText, ...rest } = b;
    if (proceduresText === undefined) return rest;
    const procedures = String(proceduresText ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [code, date, ...d] = l.split(';').map((x) => x.trim());
        return { code, date: date || String(b.examDate ?? ''), description: d.join(';') || null };
      });
    return { ...rest, procedures };
  },
  columns: [
    { key: 'worker', label: 'Trabalhador', render: (r) => String((r.worker as R)?.name ?? '—') },
    { key: 'type', label: 'Tipo', render: (r) => label('examType', r.type as string) },
    { key: 'examDate', label: 'Data', render: (r) => fmtDate(r.examDate as string) },
    { key: 'result', label: 'Resultado', render: (r) => <Badge v={r.result as string}>{String(r.result ?? '—')}</Badge> },
    { key: 'nextDueDate', label: 'Próximo', render: (r) => fmtDate(r.nextDueDate as string) },
  ],
});

export function ExamsPage() {
  const [params] = useSearchParams();
  return <ResourcePage config={examsConfig(params.get('workerId') ?? undefined)} />;
}

const accidentsConfig: ResourceConfig = {
  title: 'Acidentes, incidentes e quase acidentes',
  singular: 'Ocorrência',
  description: 'Registro, investigação e base para a CAT (S-2210). Dados do atestado médico são visíveis apenas para a equipe de saúde.',
  endpoint: '/accidents',
  readPerm: 'accidents.read',
  writePerm: 'accidents.write',
  searchPlaceholder: 'Descrição, local ou nº da CAT',
  filters: [
    { name: 'type', label: 'Tipo', type: 'select', options: options('accidentType') },
    { name: 'status', label: 'Investigação', type: 'select', options: options('accidentStatus') },
  ],
  fields: [
    { name: 'type', label: 'Tipo de ocorrência', type: 'select', options: options('accidentType'), required: true },
    { name: 'occurredAt', label: 'Data e hora', type: 'datetime', required: true },
    { name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies, required: true },
    { name: 'unitId', label: 'Unidade', type: 'ref', ref: REF.units, required: true },
    { name: 'workerId', label: 'Trabalhador envolvido', type: 'ref', ref: REF.workersByUnit },
    { name: 'hoursWorked', label: 'Horas trabalhadas antes (HH:MM)', type: 'text' },
    { name: 'description', label: 'Descrição da ocorrência', type: 'textarea', required: true },
    { name: 'location', label: 'Local', type: 'text', full: true },
    { name: 'bodyPartCode', label: 'Parte do corpo atingida (código)', type: 'text', showIf: (v) => !['incidente', 'quase_acidente'].includes(String(v.type)) },
    { name: 'laterality', label: 'Lateralidade', type: 'select', options: [{ value: 'nao_aplicavel', label: 'Não aplicável' }, { value: 'esquerda', label: 'Esquerda' }, { value: 'direita', label: 'Direita' }, { value: 'ambas', label: 'Ambas' }], showIf: (v) => !['incidente', 'quase_acidente'].includes(String(v.type)) },
    { name: 'causingAgentCode', label: 'Agente causador (código)', type: 'text', showIf: (v) => !['incidente', 'quase_acidente'].includes(String(v.type)) },
    { name: 'situationCode', label: 'Situação geradora (código)', type: 'text', showIf: (v) => !['incidente', 'quase_acidente'].includes(String(v.type)) },
    { name: 'injuryNatureCode', label: 'Natureza da lesão (código)', type: 'text', showIf: (v) => !['incidente', 'quase_acidente'].includes(String(v.type)) },
    { name: 'medicalLeave', label: 'Houve afastamento?', type: 'checkbox' },
    { name: 'hospitalized', label: 'Houve internação?', type: 'checkbox' },
    { name: 'death', label: 'Houve óbito?', type: 'checkbox' },
    { name: 'deathDate', label: 'Data do óbito', type: 'date', showIf: (v) => Boolean(v.death) },
    { name: 'policeReport', label: 'Comunicado à autoridade policial?', type: 'checkbox' },
    { name: 'status', label: 'Situação da investigação', type: 'select', options: options('accidentStatus') },
    { name: 'rootCause', label: 'Causa raiz', type: 'textarea' },
    { name: 'investigation', label: 'Investigação / análise', type: 'textarea' },
    { name: 'witnesses', label: 'Testemunhas', type: 'textarea' },
    { name: 'catNumber', label: 'Nº da CAT / recibo (se emitida)', type: 'text' },
  ],
  columns: [
    { key: 'occurredAt', label: 'Data', render: (r) => fmtDateTime(r.occurredAt as string) },
    { key: 'type', label: 'Tipo', render: (r) => label('accidentType', r.type as string) },
    { key: 'worker', label: 'Trabalhador', render: (r) => String((r.worker as R)?.name ?? '—') },
    { key: 'location', label: 'Local' },
    { key: 'status', label: 'Investigação', render: (r) => <Badge v={r.status === 'concluido' ? 'vigente' : 'aviso'}>{label('accidentStatus', r.status as string)}</Badge> },
  ],
  extra: (row) => (
    <>
      <Attachments entity="accident" entityId={row.id} writePerm="accidents.write" title="Evidências da investigação (fotos, relatórios)" />
      {row.hasMedical || row.medical ? (
        <div className="card">
          <h3>Atendimento médico (restrito)</h3>
          {row.medical ? <MedicalView m={row.medical as R} /> : <p className="muted small">Há dados de atendimento registrados, visíveis apenas para a equipe de saúde.</p>}
        </div>
      ) : null}
    </>
  ),
};

function MedicalView({ m }: { m: R }) {
  return (
    <dl className="kv">
      <dt>CID</dt><dd>{String(m.cid ?? '—')}</dd>
      <dt>Médico</dt><dd>{[m.physicianName, m.physicianCrm, m.physicianUf].filter(Boolean).join(' · ') || '—'}</dd>
      <dt>Data</dt><dd>{fmtDate(m.date as string)}</dd>
      <dt>Dias de afastamento</dt><dd>{String(m.leaveDays ?? '—')}</dd>
      <dt>Diagnóstico</dt><dd>{String(m.diagnosis ?? '—')}</dd>
    </dl>
  );
}

export const AccidentsPage = () => <ResourcePage config={accidentsConfig} />;
export const RisksPage = () => <ResourcePage config={risksConfig} />;

const ppeConfig: ResourceConfig = {
  title: 'Catálogo de EPIs',
  singular: 'EPI',
  endpoint: '/ppe',
  readPerm: 'ppe.read',
  writePerm: 'ppe.write',
  deleteLabel: 'Inativar',
  fields: [
    { name: 'name', label: 'EPI', type: 'text', required: true, full: true },
    { name: 'ca', label: 'Certificado de Aprovação (CA)', type: 'text' },
    { name: 'caValidUntil', label: 'Validade do CA', type: 'date' },
    { name: 'replaceDays', label: 'Troca prevista a cada (dias)', type: 'number' },
    { name: 'active', label: 'Ativo', type: 'checkbox' },
  ],
  columns: [
    { key: 'name', label: 'EPI' },
    { key: 'ca', label: 'CA' },
    { key: 'caValidUntil', label: 'Validade do CA', render: (r) => fmtDate(r.caValidUntil as string) },
    { key: 'replaceDays', label: 'Troca (dias)' },
  ],
};

const deliveriesConfig: ResourceConfig = {
  title: 'Entregas e trocas de EPI',
  singular: 'Entrega',
  description: 'Anexe o comprovante assinado (ficha de EPI) em cada entrega.',
  endpoint: '/ppe-deliveries',
  readPerm: 'ppe.read',
  writePerm: 'ppe.write',
  filters: [{ name: 'workerId', label: 'Trabalhador', type: 'ref', ref: REF.workersAll }],
  fields: [
    { name: 'workerId', label: 'Trabalhador', type: 'ref', ref: REF.workers, required: true, full: true },
    { name: 'ppeId', label: 'EPI', type: 'ref', ref: REF.ppe, required: true, full: true },
    { name: 'quantity', label: 'Quantidade', type: 'number' },
    { name: 'deliveredAt', label: 'Data da entrega', type: 'date', required: true },
    { name: 'replaceBy', label: 'Troca prevista', type: 'date' },
    { name: 'reason', label: 'Motivo', type: 'text' },
  ],
  columns: [
    { key: 'worker', label: 'Trabalhador', render: (r) => String((r.worker as R)?.name ?? '') },
    { key: 'ppe', label: 'EPI', render: (r) => `${String((r.ppe as R)?.name ?? '')}${(r.ppe as R)?.ca ? ` (${String((r.ppe as R).ca)})` : ''}` },
    { key: 'quantity', label: 'Qtd.' },
    { key: 'deliveredAt', label: 'Entrega', render: (r) => fmtDate(r.deliveredAt as string) },
    { key: 'replaceBy', label: 'Troca prevista', render: (r) => fmtDate(r.replaceBy as string) },
  ],
  extra: (row) => <Attachments entity="ppe_delivery" entityId={row.id} writePerm="ppe.write" title="Comprovante de entrega" />,
};

export function PpePage() {
  const [tab, setTab] = useState<'d' | 'c'>('d');
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'd', label: 'Entregas' }, { value: 'c', label: 'Catálogo e CA' }]} />
      {tab === 'd' ? <ResourcePage key="d" config={deliveriesConfig} /> : <ResourcePage key="c" config={ppeConfig} />}
    </>
  );
}

const trainingsConfig: ResourceConfig = {
  title: 'Catálogo de treinamentos',
  singular: 'Treinamento',
  endpoint: '/trainings',
  readPerm: 'trainings.read',
  writePerm: 'trainings.write',
  deleteLabel: 'Inativar',
  fields: [
    { name: 'name', label: 'Treinamento', type: 'text', required: true, full: true },
    { name: 'reference', label: 'Referência normativa / conteúdo', type: 'text', full: true },
    { name: 'workloadHours', label: 'Carga horária (h)', type: 'number' },
    { name: 'validityMonths', label: 'Validade (meses)', type: 'number', help: 'Definida pelo responsável técnico conforme a norma aplicável.' },
    { name: 'active', label: 'Ativo', type: 'checkbox' },
  ],
  columns: [
    { key: 'name', label: 'Treinamento' },
    { key: 'workloadHours', label: 'Carga (h)' },
    { key: 'validityMonths', label: 'Validade (meses)' },
  ],
};

const recordsConfig: ResourceConfig = {
  title: 'Presenças, certificados e vencimentos',
  singular: 'Registro de treinamento',
  description: 'Anexe lista de presença e certificado em cada registro.',
  endpoint: '/training-records',
  readPerm: 'trainings.read',
  writePerm: 'trainings.write',
  filters: [{ name: 'trainingId', label: 'Treinamento', type: 'ref', ref: REF.trainings }],
  fields: [
    { name: 'trainingId', label: 'Treinamento', type: 'ref', ref: REF.trainings, required: true, full: true },
    { name: 'workerId', label: 'Trabalhador', type: 'ref', ref: REF.workers, required: true, full: true },
    { name: 'completedAt', label: 'Concluído em', type: 'date', required: true },
    { name: 'validUntil', label: 'Válido até', type: 'date' },
    { name: 'instructor', label: 'Instrutor', type: 'text' },
    { name: 'attended', label: 'Presença confirmada', type: 'checkbox' },
  ],
  columns: [
    { key: 'worker', label: 'Trabalhador', render: (r) => String((r.worker as R)?.name ?? '') },
    { key: 'training', label: 'Treinamento', render: (r) => String((r.training as R)?.name ?? '') },
    { key: 'completedAt', label: 'Concluído', render: (r) => fmtDate(r.completedAt as string) },
    { key: 'validUntil', label: 'Validade', render: (r) => fmtDate(r.validUntil as string) },
    { key: 'attended', label: 'Presença', render: (r) => yesNo(r.attended) },
  ],
  extra: (row) => <Attachments entity="training_record" entityId={row.id} writePerm="trainings.write" title="Certificado e lista de presença" />,
};

export function TrainingsPage() {
  const [tab, setTab] = useState<'r' | 'c'>('r');
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'r', label: 'Registros' }, { value: 'c', label: 'Catálogo' }]} />
      {tab === 'r' ? <ResourcePage key="r" config={recordsConfig} /> : <ResourcePage key="c" config={trainingsConfig} />}
    </>
  );
}
