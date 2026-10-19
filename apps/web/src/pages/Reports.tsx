import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, download, get, patch, post, qs } from '../api';
import { useAuth } from '../auth';
import { useRefOptions } from '../components/ResourcePage';
import { REF } from '../components/refs';
import { ScopeFilter, type ScopeValue } from '../components/ScopeFilter';
import { Badge, Drawer, ErrorNotice, Field, PageHead, Select, Spinner, Tabs, fmtDateTime, useToast } from '../components/ui';

interface ReportMeta { key: string; title: string; description: string; source: string; formulas: string[]; permissions: string[]; columns: { key: string; label: string }[] }
interface Schedule { id: string; name: string; reportKey: string; format: string; frequency: string; recipientIds: string[]; active: boolean; lastRunAt: string | null; filters: ScopeValue }

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const cell = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v).replace(ISO, '$3/$2/$1'));

function Runner({ reports }: { reports: ReportMeta[] }) {
  const [params, setParams] = useSearchParams();
  const key = params.get('key') ?? reports[0]?.key;
  const [scope, setScope] = useState<ScopeValue>({});
  const def = reports.find((r) => r.key === key);
  const data = useQuery({
    queryKey: ['report', key, scope],
    queryFn: () => get<{ rows: Record<string, unknown>[]; columns: { key: string; label: string }[] }>(`/reports/${key}${qs({ ...scope, format: 'json' })}`),
    enabled: Boolean(def),
  });
  const exp = (format: string) => download(`/reports/${key}${qs({ ...scope, format })}`, `${key}.${format}`);
  return (
    <>
      <div className="toolbar">
        <Field label="Relatório">
          <Select value={key ?? ''} onChange={(v) => setParams({ key: v })} options={reports.map((r) => ({ value: r.key, label: r.title }))} />
        </Field>
      </div>
      <ScopeFilter value={scope} onChange={setScope} />
      {def && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="page-head" style={{ marginBottom: 6 }}>
            <div>
              <h2>{def.title}</h2>
              <p>{def.description}</p>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => exp('csv')}>CSV</button>
              <button className="btn" onClick={() => exp('xlsx')}>Planilha (XLSX)</button>
              <button className="btn primary" onClick={() => exp('pdf')}>PDF</button>
            </div>
          </div>
          <details>
            <summary className="small" style={{ cursor: 'pointer' }}>Origem dos dados e fórmulas</summary>
            <p className="small"><strong>Origem:</strong> {def.source}</p>
            <ul className="small">{def.formulas.map((f) => <li key={f}>{f}</li>)}</ul>
          </details>
        </div>
      )}
      {data.isLoading ? <Spinner /> : data.error ? <ErrorNotice error={data.error} /> : data.data ? (
        <>
          <p className="muted small">{data.data.rows.length} registro(s){data.data.rows.length > 200 ? ' — pré-visualização dos primeiros 200; exporte para ver todos' : ''}</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{data.data.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {data.data.rows.slice(0, 200).map((r, i) => (
                  <tr key={i}>{data.data!.columns.map((c) => <td key={c.key}>{cell(r[c.key])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

function Schedules({ reports }: { reports: ReportMeta[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const users = useRefOptions(REF.users);
  const list = useQuery({ queryKey: ['schedules'], queryFn: () => get<Schedule[]>('/report-schedules') });
  const [form, setForm] = useState<Partial<Schedule> | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: form!.name, reportKey: form!.reportKey, format: form!.format ?? 'xlsx', frequency: form!.frequency, recipientIds: form!.recipientIds ?? [], active: form!.active ?? true, filters: form!.filters ?? {} };
      return form!.id ? patch(`/report-schedules/${form!.id}`, body) : post('/report-schedules', body);
    },
    onSuccess: () => { toast('Agendamento salvo'); setForm(null); qc.invalidateQueries({ queryKey: ['schedules'] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/report-schedules/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }) });
  const userName = new Map(users.map((u) => [u.value, u.label]));
  return (
    <>
      <div className="notice info" style={{ marginBottom: 14 }}>
        Os relatórios agendados são gerados pelo processo de segundo plano (worker). Cada destinatário recebe apenas se ainda tiver permissão para ver o relatório. Sem SMTP configurado, o aviso fica nas notificações do sistema.
      </div>
      <div className="actions" style={{ marginBottom: 12 }}><button className="btn primary" onClick={() => setForm({ format: 'xlsx', frequency: 'semanal', recipientIds: [], active: true })}>+ Novo agendamento</button></div>
      {list.isLoading ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nome</th><th>Relatório</th><th>Frequência</th><th>Formato</th><th>Destinatários</th><th>Último envio</th><th></th></tr></thead>
            <tbody>
              {list.data?.map((s) => (
                <tr key={s.id}>
                  <td>{s.name} {!s.active && <Badge v="vencido">Inativo</Badge>}</td>
                  <td>{reports.find((r) => r.key === s.reportKey)?.title ?? s.reportKey}</td>
                  <td>{s.frequency}</td>
                  <td>{s.format.toUpperCase()}</td>
                  <td className="small">{s.recipientIds.map((id) => userName.get(id) ?? '?').join(', ')}</td>
                  <td>{fmtDateTime(s.lastRunAt)}</td>
                  <td><div className="actions"><button className="btn sm" onClick={() => setForm(s)}>Editar</button><button className="btn sm danger" onClick={() => confirm('Excluir agendamento?') && remove.mutate(s.id)}>Excluir</button></div></td>
                </tr>
              ))}
              {!list.data?.length && <tr><td colSpan={7} className="empty">Nenhum agendamento.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <Drawer title={form.id ? 'Editar agendamento' : 'Novo agendamento'} onClose={() => setForm(null)} footer={<button className="btn primary" onClick={() => save.mutate()} disabled={save.isPending}>Salvar</button>}>
          <div className="form-grid">
            <Field label="Nome *" full><input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Relatório *"><Select value={form.reportKey ?? ''} onChange={(v) => setForm({ ...form, reportKey: v })} options={reports.map((r) => ({ value: r.key, label: r.title }))} /></Field>
            <Field label="Frequência *"><Select value={form.frequency ?? ''} onChange={(v) => setForm({ ...form, frequency: v })} options={[{ value: 'diario', label: 'Diária' }, { value: 'semanal', label: 'Semanal' }, { value: 'mensal', label: 'Mensal' }]} /></Field>
            <Field label="Formato"><Select value={form.format ?? 'xlsx'} onChange={(v) => setForm({ ...form, format: v })} options={[{ value: 'xlsx', label: 'Planilha (XLSX)' }, { value: 'pdf', label: 'PDF' }, { value: 'csv', label: 'CSV' }]} /></Field>
            <Field label="Ativo"><label className="check"><input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Sim</label></Field>
            <Field label="Destinatários *" full help="Somente usuários deste cliente.">
              <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {users.map((u) => (
                  <label key={u.value} className="check">
                    <input type="checkbox" checked={form.recipientIds?.includes(u.value) ?? false} onChange={(e) => setForm({ ...form, recipientIds: e.target.checked ? [...(form.recipientIds ?? []), u.value] : (form.recipientIds ?? []).filter((x) => x !== u.value) })} />
                    {u.label}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          {save.error ? <div style={{ marginTop: 12 }}><ErrorNotice error={save.error} /></div> : null}
        </Drawer>
      )}
    </>
  );
}

export function ReportsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'run' | 'sched'>('run');
  const reports = useQuery({ queryKey: ['reports'], queryFn: () => get<ReportMeta[]>('/reports') });
  return (
    <>
      <PageHead title="Relatórios" description="Relatórios filtráveis por empresa, unidade e período, com exportação para PDF e planilha. A origem dos dados e as fórmulas de cada relatório estão documentadas." />
      {can('reports.schedule') && <Tabs value={tab} onChange={setTab} tabs={[{ value: 'run', label: 'Gerar relatório' }, { value: 'sched', label: 'Agendamentos' }]} />}
      {reports.isLoading ? <Spinner /> : reports.error ? <ErrorNotice error={reports.error} /> : tab === 'run' ? <Runner reports={reports.data!} /> : <Schedules reports={reports.data!} />}
    </>
  );
}
