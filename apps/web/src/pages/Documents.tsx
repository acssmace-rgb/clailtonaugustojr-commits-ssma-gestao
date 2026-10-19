import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { download, get, patch, post, qs, upload, type Page } from '../api';
import { useAuth } from '../auth';
import { ResourceForm, useRefOptions, type FieldDef } from '../components/ResourcePage';
import { REF } from '../components/refs';
import { Badge, Drawer, Empty, ErrorNotice, Field, PageHead, Pager, Select, Spinner, fmtBytes, fmtDate, fmtDateTime, label, options, useToast } from '../components/ui';

type R = Record<string, unknown>;
interface Doc {
  id: string;
  type: string;
  title: string;
  code: string | null;
  status: string;
  companyId: string;
  unitId: string | null;
  responsibleId: string | null;
  technicalResponsible: string | null;
  technicalRegistry: string | null;
  validFrom: string | null;
  validUntil: string | null;
  currentVersion: number;
  notes: string | null;
  expiryStatus: string;
}
interface Version {
  id: string;
  version: number;
  status: string;
  fileName: string;
  size: number;
  sha256: string;
  changeNotes: string | null;
  uploadedByName: string;
  createdAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  approverRegistry: string | null;
}

const docFields: FieldDef[] = [
  { name: 'type', label: 'Tipo', type: 'select', options: options('docType'), required: true },
  { name: 'code', label: 'Código interno', type: 'text' },
  { name: 'title', label: 'Título', type: 'text', required: true, full: true },
  { name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies, required: true },
  { name: 'unitId', label: 'Unidade', type: 'ref', ref: REF.units },
  { name: 'responsibleId', label: 'Responsável no sistema', type: 'ref', ref: REF.users },
  { name: 'technicalResponsible', label: 'Profissional responsável técnico', type: 'text' },
  { name: 'technicalRegistry', label: 'Registro profissional (CREA, CRM…)', type: 'text' },
  { name: 'validFrom', label: 'Vigência a partir de', type: 'date' },
  { name: 'validUntil', label: 'Válido até', type: 'date' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];

function DocForm({ initial, defaults, onDone }: { initial?: Doc; defaults?: R; onDone: (id: string) => void }) {
  const [values, setValues] = useState<R>(() =>
    initial ? Object.fromEntries(docFields.map((f) => [f.name, f.type === 'date' ? ((initial as unknown as R)[f.name] as string | null)?.slice(0, 10) ?? '' : ((initial as unknown as R)[f.name] ?? '')])) : { ...defaults },
  );
  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]));
      if (!initial) for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
      return initial ? patch<Doc>(`/documents/${initial.id}`, body) : post<Doc>('/documents', body);
    },
    onSuccess: (d) => onDone(d.id),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <ResourceForm fields={docFields} values={values} set={(n, v) => setValues((x) => ({ ...x, [n]: v }))} editing={Boolean(initial)} />
      {save.error ? <div style={{ marginTop: 12 }}><ErrorNotice error={save.error} /></div> : null}
      <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}><button className="btn primary" disabled={save.isPending}>Salvar</button></div>
    </form>
  );
}

export function DocumentsPage({ fixedType, title, description }: { fixedType?: string; title?: string; description?: string }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const [f, setF] = useState<R>(fixedType ? { type: fixedType } : {});
  const [creating, setCreating] = useState(false);
  const companies = useRefOptions(REF.companies);
  const params = { page, pageSize: 25, ...(f as Record<string, string>) };
  const q = useQuery({ queryKey: ['documents', params], queryFn: () => get<Page<Doc>>(`/documents${qs(params)}`) });
  const set = (k: string, v: unknown) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const companyName = new Map(companies.map((c) => [c.value, c.label]));
  return (
    <>
      <PageHead
        title={title ?? 'Documentos'}
        description={description ?? 'PGR, PCMSO, LTCAT, PPP, ordens de serviço, fichas de EPI, procedimentos e outros, com versões, revisão, aprovação por profissional responsável e controle de validade.'}
      >
        {can('documents.write') && <button className="btn primary" onClick={() => setCreating(true)}>+ Novo documento</button>}
      </PageHead>
      <div className="notice info" style={{ marginBottom: 14 }}>
        O sistema organiza e controla documentos; ele não elabora nem aprova conteúdo técnico automaticamente. A situação "Aprovado" indica aprovação registrada por usuário com registro profissional declarado.
      </div>
      <div className="toolbar">
        <Field label="Buscar"><input className="input" value={String(f.q ?? '')} onChange={(e) => set('q', e.target.value)} placeholder="Título ou código" /></Field>
        {!fixedType && <Field label="Tipo"><Select value={String(f.type ?? '')} onChange={(v) => set('type', v)} placeholder="Todos" options={options('docType')} /></Field>}
        <Field label="Status"><Select value={String(f.status ?? '')} onChange={(v) => set('status', v)} placeholder="Todos" options={options('docStatus')} /></Field>
        <Field label="Validade"><Select value={String(f.expiry ?? '')} onChange={(v) => set('expiry', v)} placeholder="Todas" options={options('expiry')} /></Field>
        <Field label="Empresa"><Select value={String(f.companyId ?? '')} onChange={(v) => set('companyId', v)} placeholder="Todas" options={companies} /></Field>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNotice error={q.error} /> : !q.data?.items.length ? <div className="card"><Empty>Nenhum documento.</Empty></div> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tipo</th><th>Documento</th><th>Empresa</th><th>Status</th><th>Versão aprovada</th><th>Validade</th></tr></thead>
              <tbody>
                {q.data.items.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => nav(`/documentos/${d.id}`)}>
                    <td>{label('docType', d.type)}</td>
                    <td><strong>{d.title}</strong>{d.code ? <div className="muted small">{d.code}</div> : null}</td>
                    <td>{companyName.get(d.companyId) ?? '—'}</td>
                    <td><Badge v={d.status} group="docStatus" /></td>
                    <td>{d.currentVersion ? `v${d.currentVersion}` : '—'}</td>
                    <td>{fmtDate(d.validUntil)} <Badge v={d.expiryStatus} group="expiry" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={25} total={q.data.total} onPage={setPage} />
        </>
      )}
      {creating && (
        <Drawer title="Novo documento" onClose={() => setCreating(false)}>
          <DocForm defaults={fixedType ? { type: fixedType } : undefined} onDone={(id) => nav(`/documentos/${id}`)} />
        </Drawer>
      )}
    </>
  );
}

export function DocumentDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState<Version | null>(null);
  const [rv, setRv] = useState({ notes: '', approverRegistry: '', declaration: false });
  const q = useQuery({ queryKey: ['document', id], queryFn: () => get<Doc & { versions: Version[]; history: { id: string; action: string; userName: string | null; createdAt: string; data: R | null }[] }>(`/documents/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['document', id] }); qc.invalidateQueries({ queryKey: ['documents'] }); };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { refresh(); setReview(null); toast('Feito'); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNotice error={q.error} />;
  const d = q.data!;
  return (
    <>
      <p className="small"><Link to="/documentos">← Documentos</Link></p>
      <PageHead title={d.title} description={`${label('docType', d.type)}${d.code ? ` · ${d.code}` : ''}`}>
        {can('documents.write') && d.status !== 'obsoleto' && (
          <>
            <input ref={file} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.png,.jpg,.jpeg" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) act.mutate(() => upload(`/documents/${d.id}/versions`, f, { changeNotes: notes }));
              e.target.value = '';
            }} />
            <button className="btn primary" onClick={() => file.current?.click()}>Enviar nova versão</button>
            <button className="btn" onClick={() => setEditing(true)}>Editar dados</button>
            <button className="btn danger" onClick={() => confirm('Marcar documento como obsoleto?') && act.mutate(() => patch(`/documents/${d.id}`, { status: 'obsoleto' }))}>Marcar obsoleto</button>
          </>
        )}
      </PageHead>
      {can('documents.write') && d.status !== 'obsoleto' && (
        <div className="toolbar"><Field label="Descrição da alteração (para a próxima versão enviada)"><input className="input" style={{ minWidth: 380 }} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      )}
      <div className="grid two">
        <div className="card">
          <dl className="kv">
            <dt>Status</dt><dd><Badge v={d.status} group="docStatus" /></dd>
            <dt>Validade</dt><dd>{fmtDate(d.validUntil)} <Badge v={d.expiryStatus} group="expiry" /></dd>
            <dt>Vigência desde</dt><dd>{fmtDate(d.validFrom)}</dd>
            <dt>Versão aprovada vigente</dt><dd>{d.currentVersion ? `v${d.currentVersion}` : 'Nenhuma'}</dd>
            <dt>Responsável técnico</dt><dd>{[d.technicalResponsible, d.technicalRegistry].filter(Boolean).join(' — ') || '—'}</dd>
            <dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{d.notes ?? '—'}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Histórico</h3>
          <ul className="timeline">
            {d.history.slice(0, 15).map((h) => (
              <li key={h.id}><time>{fmtDateTime(h.createdAt)}</time><strong>{h.userName ?? 'Sistema'}</strong> — {h.action.replace(/_/g, ' ')}{h.data?.versao ? ` (v${String(h.data.versao)})` : ''}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Versões</h2>
        {!d.versions.length ? <p className="muted">Nenhum arquivo enviado ainda.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Versão</th><th>Arquivo</th><th>Enviado</th><th>Status</th><th>Aprovação</th><th></th></tr></thead>
              <tbody>
                {d.versions.map((v) => (
                  <tr key={v.id}>
                    <td><strong>v{v.version}</strong>{v.version === d.currentVersion ? <div><Badge v="vigente">Vigente</Badge></div> : null}</td>
                    <td>{v.fileName}<div className="muted small" title={v.sha256}>{fmtBytes(v.size)} · SHA-256 {v.sha256.slice(0, 12)}…</div>{v.changeNotes ? <div className="small">{v.changeNotes}</div> : null}</td>
                    <td className="small">{v.uploadedByName}<br />{fmtDateTime(v.createdAt)}</td>
                    <td><Badge v={v.status} group="versionStatus" />{v.reviewNotes ? <div className="small muted">{v.reviewNotes}</div> : null}</td>
                    <td className="small">{v.approvedByName ? <>{v.approvedByName}<br />{v.approverRegistry}<br />{fmtDateTime(v.approvedAt)}</> : '—'}</td>
                    <td>
                      <div className="actions">
                        <button className="btn sm" onClick={() => download(`/documents/${d.id}/versions/${v.version}/download`, v.fileName)}>Baixar</button>
                        {can('documents.write') && ['rascunho', 'reprovada'].includes(v.status) && <button className="btn sm" onClick={() => act.mutate(() => post(`/documents/${d.id}/versions/${v.version}/submit`))}>Enviar p/ revisão</button>}
                        {can('documents.approve') && v.status === 'em_revisao' && <button className="btn sm dark" onClick={() => { setRv({ notes: '', approverRegistry: '', declaration: false }); setReview(v); }}>Revisar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <Drawer title="Editar documento" onClose={() => setEditing(false)}>
          <DocForm initial={d} onDone={() => { setEditing(false); refresh(); }} />
        </Drawer>
      )}
      {review && (
        <Drawer
          title={`Revisão técnica — v${review.version}`}
          onClose={() => setReview(null)}
          footer={
            <>
              <button className="btn danger" onClick={() => act.mutate(() => post(`/documents/${d.id}/versions/${review.version}/review`, { approve: false, notes: rv.notes }))}>Reprovar</button>
              <button className="btn primary" disabled={!rv.declaration || !rv.approverRegistry} onClick={() => act.mutate(() => post(`/documents/${d.id}/versions/${review.version}/review`, { approve: true, ...rv }))}>Aprovar versão</button>
            </>
          }
        >
          <div className="notice warn">A aprovação é um ato do profissional responsável. O sistema apenas registra quem aprovou, quando, com qual registro profissional e o hash do arquivo aprovado.</div>
          <div className="grid" style={{ gap: 14, marginTop: 14 }}>
            <p className="small">Arquivo: <strong>{review.fileName}</strong> — <button className="btn sm" onClick={() => download(`/documents/${d.id}/versions/${review.version}/download`, review.fileName)}>Baixar para revisar</button></p>
            <Field label="Observações da revisão (obrigatório para reprovar)"><textarea className="textarea" value={rv.notes} onChange={(e) => setRv({ ...rv, notes: e.target.value })} /></Field>
            <Field label="Seu registro profissional *" help="Ex.: CREA-CE 000000, CRM-CE 00000, registro MTE."><input className="input" value={rv.approverRegistry} onChange={(e) => setRv({ ...rv, approverRegistry: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={rv.declaration} onChange={(e) => setRv({ ...rv, declaration: e.target.checked })} /> Declaro que revisei o conteúdo técnico deste documento e sou habilitado(a) para aprová-lo.</label>
          </div>
        </Drawer>
      )}
    </>
  );
}
