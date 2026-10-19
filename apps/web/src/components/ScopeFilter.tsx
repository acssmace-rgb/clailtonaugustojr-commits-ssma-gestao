import { useRefOptions } from './ResourcePage';
import { REF } from './refs';
import { Field, Select } from './ui';

export interface ScopeValue { companyId?: string; unitId?: string; from?: string; to?: string }

/** Filtros padrão de empresa, unidade e período. */
export function ScopeFilter({ value, onChange, period = true }: { value: ScopeValue; onChange: (v: ScopeValue) => void; period?: boolean }) {
  const companies = useRefOptions(REF.companies);
  const units = useRefOptions(REF.units, { ...value });
  return (
    <div className="toolbar">
      <Field label="Empresa"><Select value={value.companyId ?? ''} onChange={(companyId) => onChange({ ...value, companyId: companyId || undefined, unitId: undefined })} options={companies} placeholder="Todas" /></Field>
      <Field label="Unidade"><Select value={value.unitId ?? ''} onChange={(unitId) => onChange({ ...value, unitId: unitId || undefined })} options={units} placeholder={value.companyId ? 'Todas' : 'Escolha a empresa'} disabled={!value.companyId} /></Field>
      {period && (
        <>
          <Field label="De"><input className="input" type="date" value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} /></Field>
          <Field label="Até"><input className="input" type="date" value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} /></Field>
        </>
      )}
    </div>
  );
}
