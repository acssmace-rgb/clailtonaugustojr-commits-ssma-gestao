import type { RefSource } from './ResourcePage';

type R = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export const REF = {
  companies: { endpoint: '/companies', label: (r: R) => s(r.name) } as RefSource,
  units: { endpoint: '/units', label: (r: R) => s(r.name), dependsOn: { field: 'companyId', param: 'companyId' } } as RefSource,
  unitsAll: { endpoint: '/units', label: (r: R) => `${s(r.name)} — ${s((r.company as R | undefined)?.name)}` } as RefSource,
  sectors: { endpoint: '/sectors', label: (r: R) => s(r.name), dependsOn: { field: 'unitId', param: 'unitId' } } as RefSource,
  sectorsAll: { endpoint: '/sectors', label: (r: R) => `${s(r.name)} — ${s((r.unit as R | undefined)?.name)}` } as RefSource,
  jobRoles: { endpoint: '/job-roles', label: (r: R) => `${s(r.name)}${r.cbo ? ` (CBO ${s(r.cbo)})` : ''}`, dependsOn: { field: 'companyId', param: 'companyId' } } as RefSource,
  workers: { endpoint: '/workers', label: (r: R) => s(r.name), params: { status: 'ativo' } } as RefSource,
  workersAll: { endpoint: '/workers', label: (r: R) => s(r.name) } as RefSource,
  workersByUnit: { endpoint: '/workers', label: (r: R) => s(r.name), dependsOn: { field: 'unitId', param: 'unitId' } } as RefSource,
  users: { endpoint: '/users', label: (r: R) => s(r.name) } as RefSource,
  ppe: { endpoint: '/ppe', label: (r: R) => `${s(r.name)}${r.ca ? ` — ${s(r.ca)}` : ''}`, params: { active: 'true' } } as RefSource,
  trainings: { endpoint: '/trainings', label: (r: R) => s(r.name), params: { active: 'true' } } as RefSource,
  actionPlans: { endpoint: '/action-plans', label: (r: R) => s(r.title) } as RefSource,
};
