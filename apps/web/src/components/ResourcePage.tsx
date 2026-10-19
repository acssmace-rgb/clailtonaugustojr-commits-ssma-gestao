import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post, qs, type Page } from '../api';
import { useAuth } from '../auth';
import { Drawer, Empty, ErrorNotice, Field, PageHead, Pager, Select, Spinner, useToast } from './ui';

type Row = Record<string, unknown> & { id: string };
type Opt = { value: string; label: string };

export interface RefSource {
  endpoint: string;
  label: (row: Row) => string;
  /** Filtra as opções pelo valor de outro campo do formulário (ex.: unidades da empresa) */
  dependsOn?: { field: string; param: string };
  params?: Record<string, string>;
}

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'datetime' | 'select' | 'checkbox' | 'ref' | 'email';
  options?: Opt[];
  ref?: RefSource;
  required?: boolean;
  help?: ReactNode;
  full?: boolean;
  placeholder?: string;
  /** Mostrar apenas se a condição for verdadeira */
  showIf?: (values: Record<string, unknown>) => boolean;
  /** Somente leitura na edição */
  createOnly?: boolean;
}

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
  className?: string;
}

export interface ResourceConfig {
  title: string;
  singular: string;
  description?: ReactNode;
  endpoint: string;
  readPerm: string;
  writePerm: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  filters?: FieldDef[];
  searchPlaceholder?: string;
  deleteLabel?: string;
  /** Valores extras do formulário derivados do registro ao editar */
  fromRow?: (row: Row) => Record<string, unknown>;
  /** Converte o formulário antes de enviar */
  toBody?: (values: Record<string, unknown>, editing: boolean) => Record<string, unknown>;
  /** Conteúdo adicional dentro da gaveta de edição (ex.: anexos) */
  extra?: (row: Row) => ReactNode;
  notice?: ReactNode;
  initialFilters?: Record<string, string>;
}

export function useRefOptions(ref: RefSource | undefined, deps: Record<string, unknown> = {}) {
  const depValue = ref?.dependsOn ? (deps[ref.dependsOn.field] as string | undefined) : undefined;
  const params = { pageSize: 200, ...(ref?.params ?? {}), ...(ref?.dependsOn && depValue ? { [ref.dependsOn.param]: depValue } : {}) };
  const q = useQuery({
    queryKey: ['ref', ref?.endpoint, params],
    queryFn: () => get<Page<Row> | Row[]>(`${ref!.endpoint}${qs(params)}`),
    enabled: Boolean(ref) && (!ref?.dependsOn || Boolean(depValue)),
    staleTime: 30_000,
  });
  const items = Array.isArray(q.data) ? q.data : (q.data?.items ?? []);
  return items.map((r) => ({ value: r.id, label: ref!.label(r) }));
}

function toFormValue(f: FieldDef, v: unknown) {
  if (v === null || v === undefined) return f.type === 'checkbox' ? false : '';
  if (f.type === 'date') return String(v).slice(0, 10);
  if (f.type === 'datetime') {
    const d = new Date(String(v));
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return v;
}

function fromFormValue(f: FieldDef, v: unknown) {
  if (f.type === 'checkbox') return Boolean(v);
  if (v === '' || v === undefined) return null;
  if (f.type === 'number') return Number(v);
  if (f.type === 'datetime') return new Date(String(v)).toISOString();
  return v;
}

export function FieldInput({ f, values, set }: { f: FieldDef; values: Record<string, unknown>; set: (name: string, v: unknown) => void }) {
  const refOpts = useRefOptions(f.ref, values);
  const v = values[f.name];
  const common = { id: `f-${f.name}`, required: f.required, placeholder: f.placeholder };
  switch (f.type) {
    case 'textarea':
      return <textarea className="textarea" {...common} value={String(v ?? '')} onChange={(e) => set(f.name, e.target.value)} />;
    case 'checkbox':
      return (
        <label className="check">
          <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(f.name, e.target.checked)} /> Sim
        </label>
      );
    case 'select':
      return <Select value={String(v ?? '')} onChange={(x) => set(f.name, x)} options={f.options ?? []} required={f.required} />;
    case 'ref':
      return (
        <Select
          value={String(v ?? '')}
          onChange={(x) => set(f.name, x)}
          options={refOpts}
          required={f.required}
          placeholder={f.ref?.dependsOn && !values[f.ref.dependsOn.field] ? 'Selecione o campo anterior' : 'Selecione…'}
        />
      );
    default:
      return (
        <input
          className="input"
          {...common}
          type={f.type === 'datetime' ? 'datetime-local' : f.type}
          value={String(v ?? '')}
          onChange={(e) => set(f.name, e.target.value)}
        />
      );
  }
}

export function ResourceForm({ fields, values, set, editing }: { fields: FieldDef[]; values: Record<string, unknown>; set: (n: string, v: unknown) => void; editing: boolean }) {
  return (
    <div className="form-grid">
      {fields
        .filter((f) => !f.showIf || f.showIf(values))
        .map((f) => (
          <Field key={f.name} label={`${f.label}${f.required ? ' *' : ''}`} help={f.help} full={f.full || f.type === 'textarea'}>
            {editing && f.createOnly ? <input className="input" disabled value={String(values[f.name] ?? '')} /> : <FieldInput f={f} values={values} set={set} />}
          </Field>
        ))}
    </div>
  );
}

export function ResourcePage({ config: c }: { config: ResourceConfig }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, unknown>>(c.initialFilters ?? {});
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const canWrite = can(c.writePerm);

  useEffect(() => setPage(1), [q, filters]);

  const params = { page, pageSize: 25, q, ...(filters as Record<string, string>) };
  const list = useQuery({ queryKey: [c.endpoint, params], queryFn: () => get<Page<Row>>(`${c.endpoint}${qs(params)}`) });

  const openNew = () => {
    setValues(Object.fromEntries(c.fields.map((f) => [f.name, f.type === 'checkbox' ? false : (filters[f.name] ?? '')])));
    setEditing('new');
  };
  const openEdit = (row: Row) => {
    setValues({ ...Object.fromEntries(c.fields.map((f) => [f.name, toFormValue(f, row[f.name])])), ...(c.fromRow?.(row) ?? {}) });
    setEditing(row);
  };

  const save = useMutation({
    mutationFn: async () => {
      const isEdit = editing !== 'new';
      const visible = c.fields.filter((f) => (!f.showIf || f.showIf(values)) && !(isEdit && f.createOnly));
      let body: Record<string, unknown> = Object.fromEntries(visible.map((f) => [f.name, fromFormValue(f, values[f.name])]));
      // Campos opcionais vazios na criação não são enviados
      if (!isEdit) body = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null));
      if (c.toBody) body = c.toBody(body, isEdit);
      return isEdit ? patch(`${c.endpoint}/${(editing as Row).id}`, body) : post(c.endpoint, body);
    },
    onSuccess: () => {
      toast(`${c.singular} salvo(a)`);
      setEditing(null);
      qc.invalidateQueries({ queryKey: [c.endpoint] });
      qc.invalidateQueries({ queryKey: ['ref'] });
    },
  });

  const remove = useMutation({
    mutationFn: (row: Row) => del(`${c.endpoint}/${row.id}`),
    onSuccess: () => {
      toast(`${c.singular} ${c.deleteLabel === 'Inativar' ? 'inativado(a)' : 'excluído(a)'}`);
      setEditing(null);
      qc.invalidateQueries({ queryKey: [c.endpoint] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const set = (name: string, v: unknown) => setValues((x) => ({ ...x, [name]: v }));
  const filterDefs = useMemo(() => c.filters ?? [], [c.filters]);

  return (
    <>
      <PageHead title={c.title} description={c.description}>
        {canWrite ? <button className="btn primary" onClick={openNew}>+ Novo(a) {c.singular.toLowerCase()}</button> : null}
      </PageHead>
      {c.notice}
      <div className="toolbar" style={{ marginTop: c.notice ? 14 : 0 }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="busca">Buscar</label>
          <input id="busca" className="input" placeholder={c.searchPlaceholder ?? 'Digite para buscar…'} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filterDefs.map((f) => (
          <div className="field" key={f.name}>
            <label>{f.label}</label>
            <FieldInput f={f} values={filters} set={(n, v) => setFilters((x) => ({ ...x, [n]: v }))} />
          </div>
        ))}
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNotice error={list.error} />
      ) : !list.data?.items.length ? (
        <div className="card"><Empty>Nenhum registro encontrado.</Empty></div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>{c.columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
              </thead>
              <tbody>
                {list.data.items.map((row) => (
                  <tr key={row.id} className="clickable" onClick={() => openEdit(row)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openEdit(row)}>
                    {c.columns.map((col) => (
                      <td key={col.key} className={col.className}>{col.render ? col.render(row) : String(row[col.key] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={25} total={list.data.total} onPage={setPage} />
        </>
      )}

      {editing ? (
        <Drawer
          title={editing === 'new' ? `Novo(a) ${c.singular.toLowerCase()}` : canWrite ? `Editar ${c.singular.toLowerCase()}` : c.singular}
          onClose={() => setEditing(null)}
          footer={
            canWrite ? (
              <>
                {editing !== 'new' && (
                  <button className="btn danger" style={{ marginRight: 'auto' }} disabled={remove.isPending} onClick={() => confirm(`Confirma ${(c.deleteLabel ?? 'Excluir').toLowerCase()}?`) && remove.mutate(editing)}>
                    {c.deleteLabel ?? 'Excluir'}
                  </button>
                )}
                <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
                <button className="btn primary" form="resource-form" type="submit" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
              </>
            ) : undefined
          }
        >
          <form
            id="resource-form"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0 }}>
              <ResourceForm fields={c.fields} values={values} set={set} editing={editing !== 'new'} />
            </fieldset>
            {save.error ? <div style={{ marginTop: 14 }}><ErrorNotice error={save.error} /></div> : null}
          </form>
          {editing !== 'new' && c.extra ? <div style={{ marginTop: 20 }}>{c.extra(editing)}</div> : null}
        </Drawer>
      ) : null}
    </>
  );
}
