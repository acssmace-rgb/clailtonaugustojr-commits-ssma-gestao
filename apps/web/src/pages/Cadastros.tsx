import { useState } from 'react';
import { ResourcePage, type ResourceConfig } from '../components/ResourcePage';
import { REF } from '../components/refs';
import { Badge, Tabs, fmtDate, label, options } from '../components/ui';

type R = Record<string, unknown>;
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map((u) => ({ value: u, label: u }));
const fmtCnpj = (v: unknown) => String(v ?? '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const fmtCpf = (v: unknown) => String(v ?? '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const active = (r: R) => (r.active === false ? <Badge v="vencido">Inativo</Badge> : <Badge v="vigente">Ativo</Badge>);

export const companiesConfig: ResourceConfig = {
  title: 'Empresas',
  singular: 'Empresa',
  description: 'Empresas (CNPJ) atendidas dentro deste cliente.',
  endpoint: '/companies',
  readPerm: 'org.read',
  writePerm: 'org.write',
  deleteLabel: 'Inativar',
  searchPlaceholder: 'Nome, fantasia ou CNPJ',
  fields: [
    { name: 'name', label: 'Razão social', type: 'text', required: true, full: true },
    { name: 'tradeName', label: 'Nome fantasia', type: 'text' },
    { name: 'cnpj', label: 'CNPJ', type: 'text', required: true, placeholder: '00.000.000/0000-00' },
    { name: 'cnae', label: 'CNAE principal', type: 'text' },
    { name: 'riskDegree', label: 'Grau de risco', type: 'select', options: [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })), help: 'Conforme enquadramento definido pelo responsável técnico.' },
    { name: 'address', label: 'Endereço', type: 'text', full: true },
    { name: 'city', label: 'Município', type: 'text' },
    { name: 'uf', label: 'UF', type: 'select', options: UFS },
    { name: 'active', label: 'Ativa', type: 'checkbox' },
  ],
  toBody: (b) => ({ ...b, riskDegree: b.riskDegree ? Number(b.riskDegree) : null }),
  columns: [
    { key: 'name', label: 'Razão social' },
    { key: 'cnpj', label: 'CNPJ', render: (r) => fmtCnpj(r.cnpj) },
    { key: 'city', label: 'Município', render: (r) => [r.city, r.uf].filter(Boolean).join('/') || '—' },
    { key: 'active', label: 'Situação', render: active },
  ],
};

const unitsConfig: ResourceConfig = {
  title: 'Unidades / estabelecimentos',
  singular: 'Unidade',
  endpoint: '/units',
  readPerm: 'org.read',
  writePerm: 'org.write',
  deleteLabel: 'Inativar',
  filters: [{ name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies }],
  fields: [
    { name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies, required: true, createOnly: false },
    { name: 'name', label: 'Nome da unidade', type: 'text', required: true },
    { name: 'inscriptionType', label: 'Tipo de inscrição', type: 'select', options: [{ value: '1', label: 'CNPJ' }, { value: '3', label: 'CAEPF' }, { value: '4', label: 'CNO' }] },
    { name: 'inscriptionNumber', label: 'Número de inscrição', type: 'text', help: 'Usado nos eventos do eSocial para identificar o estabelecimento.' },
    { name: 'address', label: 'Endereço', type: 'text', full: true },
    { name: 'city', label: 'Município', type: 'text' },
    { name: 'uf', label: 'UF', type: 'select', options: UFS },
    { name: 'active', label: 'Ativa', type: 'checkbox' },
  ],
  toBody: (b) => ({ ...b, inscriptionType: b.inscriptionType ? Number(b.inscriptionType) : null }),
  columns: [
    { key: 'name', label: 'Unidade' },
    { key: 'company', label: 'Empresa', render: (r) => String((r.company as R)?.name ?? '—') },
    { key: 'inscriptionNumber', label: 'Inscrição', render: (r) => (r.inscriptionNumber ? `${({ 1: 'CNPJ', 3: 'CAEPF', 4: 'CNO' } as R)[String(r.inscriptionType)] ?? ''} ${String(r.inscriptionNumber)}` : '—') },
    { key: 'active', label: 'Situação', render: active },
  ],
};

const sectorsConfig: ResourceConfig = {
  title: 'Setores / locais de trabalho',
  singular: 'Setor',
  endpoint: '/sectors',
  readPerm: 'org.read',
  writePerm: 'org.write',
  deleteLabel: 'Inativar',
  filters: [{ name: 'unitId', label: 'Unidade', type: 'ref', ref: REF.unitsAll }],
  fields: [
    { name: 'unitId', label: 'Unidade', type: 'ref', ref: REF.unitsAll, required: true },
    { name: 'name', label: 'Nome do setor', type: 'text', required: true },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'environmentDescription', label: 'Descrição do ambiente de trabalho', type: 'textarea', help: 'Utilizada na preparação do S-2240.' },
    { name: 'active', label: 'Ativo', type: 'checkbox' },
  ],
  columns: [
    { key: 'name', label: 'Setor' },
    { key: 'unit', label: 'Unidade', render: (r) => String((r.unit as R)?.name ?? '—') },
    { key: 'environmentDescription', label: 'Ambiente descrito?', render: (r) => (r.environmentDescription ? 'Sim' : <Badge v="aviso">Não</Badge>) },
    { key: 'active', label: 'Situação', render: active },
  ],
};

const jobRolesConfig: ResourceConfig = {
  title: 'Cargos',
  singular: 'Cargo',
  endpoint: '/job-roles',
  readPerm: 'org.read',
  writePerm: 'org.write',
  deleteLabel: 'Inativar',
  filters: [{ name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies }],
  fields: [
    { name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies, required: true },
    { name: 'name', label: 'Cargo', type: 'text', required: true },
    { name: 'cbo', label: 'CBO', type: 'text', placeholder: '6 dígitos' },
    { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'activities', label: 'Descrição das atividades', type: 'textarea', help: 'Utilizada na preparação do S-2240.' },
    { name: 'active', label: 'Ativo', type: 'checkbox' },
  ],
  columns: [
    { key: 'name', label: 'Cargo' },
    { key: 'cbo', label: 'CBO' },
    { key: 'company', label: 'Empresa', render: (r) => String((r.company as R)?.name ?? '—') },
    { key: 'active', label: 'Situação', render: active },
  ],
};

export function CompaniesPage() {
  const [tab, setTab] = useState<'c' | 'u' | 's' | 'j'>('c');
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'c', label: 'Empresas' }, { value: 'u', label: 'Unidades' }, { value: 's', label: 'Setores' }, { value: 'j', label: 'Cargos' }]} />
      {tab === 'c' && <ResourcePage key="c" config={companiesConfig} />}
      {tab === 'u' && <ResourcePage key="u" config={unitsConfig} />}
      {tab === 's' && <ResourcePage key="s" config={sectorsConfig} />}
      {tab === 'j' && <ResourcePage key="j" config={jobRolesConfig} />}
    </>
  );
}

export const workersConfig: ResourceConfig = {
  title: 'Trabalhadores',
  singular: 'Trabalhador',
  description: 'Cadastro de trabalhadores por empresa, unidade, setor e cargo. O CPF completo aparece somente para quem pode editar trabalhadores.',
  endpoint: '/workers',
  readPerm: 'workers.read',
  writePerm: 'workers.write',
  searchPlaceholder: 'Nome, CPF ou matrícula',
  filters: [
    { name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies },
    { name: 'status', label: 'Situação', type: 'select', options: options('workerStatus') },
  ],
  fields: [
    { name: 'name', label: 'Nome completo', type: 'text', required: true, full: true },
    { name: 'cpf', label: 'CPF', type: 'text', required: true },
    { name: 'birthDate', label: 'Data de nascimento', type: 'date' },
    { name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies, required: true },
    { name: 'unitId', label: 'Unidade', type: 'ref', ref: REF.units, required: true },
    { name: 'sectorId', label: 'Setor', type: 'ref', ref: REF.sectors },
    { name: 'jobRoleId', label: 'Cargo', type: 'ref', ref: REF.jobRoles },
    { name: 'function', label: 'Função', type: 'text' },
    { name: 'registration', label: 'Matrícula (eSocial)', type: 'text' },
    { name: 'categoryCode', label: 'Código de categoria', type: 'text', help: '3 dígitos, conforme tabela de categorias do eSocial.' },
    { name: 'admissionDate', label: 'Admissão', type: 'date' },
    { name: 'status', label: 'Situação', type: 'select', options: options('workerStatus') },
    { name: 'terminationDate', label: 'Desligamento', type: 'date', showIf: (v) => v.status === 'desligado' },
    { name: 'gender', label: 'Sexo', type: 'select', options: [{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Feminino' }, { value: 'outro', label: 'Outro' }, { value: 'nao_informado', label: 'Não informado' }] },
    { name: 'email', label: 'E-mail', type: 'email' },
  ],
  columns: [
    { key: 'name', label: 'Nome' },
    { key: 'cpf', label: 'CPF', render: (r) => fmtCpf(r.cpf) },
    { key: 'unit', label: 'Unidade', render: (r) => String((r.unit as R)?.name ?? '—') },
    { key: 'sector', label: 'Setor', render: (r) => String((r.sector as R)?.name ?? '—') },
    { key: 'jobRole', label: 'Cargo', render: (r) => String((r.jobRole as R)?.name ?? '—') },
    { key: 'admissionDate', label: 'Admissão', render: (r) => fmtDate(r.admissionDate as string) },
    { key: 'status', label: 'Situação', render: (r) => <Badge v={r.status === 'ativo' ? 'vigente' : r.status === 'desligado' ? 'vencido' : 'a_vencer'}>{label('workerStatus', r.status as string)}</Badge> },
  ],
};

export const WorkersPage = () => <ResourcePage config={workersConfig} />;
