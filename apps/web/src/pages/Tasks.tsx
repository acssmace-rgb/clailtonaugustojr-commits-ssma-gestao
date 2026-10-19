import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post, qs, type Page } from '../api';
import { useAuth } from '../auth';
import { Attachments } from '../components/Attachments';
import { ResourceForm, ResourcePage, useRefOptions, type FieldDef, type ResourceConfig } from '../components/ResourcePage';
import { REF } from '../components/refs';
import { Badge, Drawer, Empty, ErrorNotice, Field, PageHead, Pager, Select, Spinner, fmtDate, fmtDateTime, label, options, useToast } from '../components/ui';

type R = Record<string, unknown>;
interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
  approverId: string | null;
  createdById: string;
  requiresApproval: boolean;
  recurrence: string;
  actionPlan?: { id: string; title: string } | null;
  actionPlanId: string | null;
  companyId: string | null;
  unitId: string | null;
  origin: string;
  rejectionReason: string | null;
  completedAt: string | null;
  _count?: { comments: number };
}

const taskFields: FieldDef[] = [
  { name: 'title', label: 'Título', type: 'text', required: true, full: true },
  { name: 'description', label: 'Descrição', type: 'textarea' },
  { name: 'assigneeId', label: 'Responsável', type: 'ref', ref: REF.users },
  { name: 'priority', label: 'Prioridade', type: 'select', options: options('priority') },
  { name: 'dueDate', label: 'Prazo', type: 'date' },
  { name: 'recurrence', label: 'Recorrência', type: 'select', options: options('recurrence'), help: 'Ao concluir, a próxima ocorrência é criada automaticamente.' },
  { name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies },
  { name: 'unitId', label: 'Unidade', type: 'ref', ref: REF.units },
  { name: 'actionPlanId', label: 'Plano de ação', type: 'ref', ref: REF.actionPlans },
  { name: 'origin', label: 'Origem', type: 'select', options: ['manual', 'inspecao', 'acidente', 'documento', 'risco', 'exame', 'esocial', 'ambiental'].map((v) => ({ value: v, label: v })) },
  { name: 'requiresApproval', label: 'Exige aprovação na conclusão', type: 'checkbox' },
  { name: 'approverId', label: 'Aprovador', type: 'ref', ref: REF.users, showIf: (v) => Boolean(v.requiresApproval) },
];

const overdue = (t: Task) => t.dueDate && t.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10) && ['aberta', 'em_andamento'].includes(t.status);

function TaskForm({ initial, onDone }: { initial?: Task; onDone: (id: string) => void }) {
  const toast = useToast();
  const [values, setValues] = useState<R>(() =>
    initial
      ? Object.fromEntries(taskFields.map((f) => [f.name, f.type === 'date' ? (initial[f.name as keyof Task] as string | null)?.slice(0, 10) ?? '' : (initial[f.name as keyof Task] ?? (f.type === 'checkbox' ? false : ''))]))
      : { priority: 'media', recurrence: 'nenhuma', origin: 'manual', requiresApproval: false },
  );
  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]));
      if (!initial) for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
      return initial ? patch<Task>(`/tasks/${initial.id}`, body) : post<Task>('/tasks', body);
    },
    onSuccess: (t) => {
      toast('Tarefa salva');
      onDone(t.id);
    },
  });
  return (
    <form id="task-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <ResourceForm fields={taskFields} values={values} set={(n, v) => setValues((x) => ({ ...x, [n]: v }))} editing={Boolean(initial)} />
      {save.error ? <div style={{ marginTop: 12 }}><ErrorNotice error={save.error} /></div> : null}
      <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar tarefa'}</button>
      </div>
    </form>
  );
}

export function TasksPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search] = useSearchParams();
  const plan = search.get('plano');
  const [f, setF] = useState<R>(plan ? { actionPlanId: plan } : { status: 'aberta,em_andamento,aguardando_aprovacao' });
  const [creating, setCreating] = useState(false);
  const users = useRefOptions(REF.users);
  const userName = new Map(users.map((u) => [u.value, u.label]));
  const params = { page, pageSize: 25, ...(f as Record<string, string>) };
  const q = useQuery({ queryKey: ['tasks', params], queryFn: () => get<Page<Task>>(`/tasks${qs(params)}`) });
  const set = (k: string, v: unknown) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  return (
    <>
      <PageHead title="Atividades" description="Tarefas com responsável, prioridade, prazo, recorrência, evidências e aprovação.">
        {can('tasks.write') && <button className="btn primary" onClick={() => setCreating(true)}>+ Nova tarefa</button>}
      </PageHead>
      <div className="toolbar">
        <Field label="Buscar"><input className="input" value={String(f.q ?? '')} onChange={(e) => set('q', e.target.value)} placeholder="Título ou descrição" /></Field>
        <Field label="Status">
          <Select value={String(f.status ?? '')} onChange={(v) => set('status', v)} placeholder="Todos" options={[{ value: 'aberta,em_andamento,aguardando_aprovacao', label: 'Em aberto' }, ...options('taskStatus')]} />
        </Field>
        <Field label="Prioridade"><Select value={String(f.priority ?? '')} onChange={(v) => set('priority', v)} placeholder="Todas" options={options('priority')} /></Field>
        <Field label="Responsável"><Select value={String(f.assigneeId ?? '')} onChange={(v) => set('assigneeId', v)} placeholder="Todos" options={users} /></Field>
        {f.actionPlanId ? <button className="btn sm" style={{ marginBottom: 6 }} onClick={() => set('actionPlanId', '')}>Filtrando por plano ✕</button> : null}
        <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={f.mine === 'true'} onChange={(e) => set('mine', e.target.checked ? 'true' : '')} /> Minhas</label>
        <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={f.overdue === 'true'} onChange={(e) => set('overdue', e.target.checked ? 'true' : '')} /> Atrasadas</label>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNotice error={q.error} /> : !q.data?.items.length ? <div className="card"><Empty>Nenhuma tarefa encontrada.</Empty></div> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Tarefa</th><th>Responsável</th><th>Prioridade</th><th>Prazo</th><th>Status</th></tr></thead>
              <tbody>
                {q.data.items.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => nav(`/atividades/${t.id}`)}>
                    <td>
                      <strong>{t.title}</strong>
                      <div className="muted small">
                        {t.actionPlan ? `Plano: ${t.actionPlan.title} · ` : ''}{t.recurrence !== 'nenhuma' ? `${label('recurrence', t.recurrence)} · ` : ''}{t._count?.comments ? `${t._count.comments} comentário(s)` : ''}
                      </div>
                    </td>
                    <td>{t.assigneeId ? userName.get(t.assigneeId) ?? '—' : '—'}</td>
                    <td><Badge v={t.priority} group="priority" /></td>
                    <td>{fmtDate(t.dueDate)} {overdue(t) ? <Badge v="vencido">Atrasada</Badge> : null}</td>
                    <td><Badge v={t.status} group="taskStatus" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={25} total={q.data.total} onPage={setPage} />
        </>
      )}
      {creating && (
        <Drawer title="Nova tarefa" onClose={() => setCreating(false)}>
          <TaskForm onDone={(id) => { setCreating(false); qc.invalidateQueries({ queryKey: ['tasks'] }); nav(`/atividades/${id}`); }} />
        </Drawer>
      )}
    </>
  );
}

interface TaskDetail extends Task {
  comments: { id: string; body: string; userName: string; createdAt: string }[];
  history: { id: string; action: string; userName: string | null; createdAt: string; data: R | null }[];
}

const ACTIONS: Record<string, string> = {
  criar: 'Criou a tarefa', atualizar: 'Atualizou', concluir: 'Concluiu', enviar_aprovacao: 'Enviou para aprovação', aprovar: 'Aprovou', reprovar: 'Reprovou',
  comentar: 'Comentou', anexar: 'Anexou evidência', remover_anexo: 'Removeu anexo', baixar_anexo: 'Baixou anexo',
};

export function TaskDetailPage() {
  const { id } = useParams();
  const { me, can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const users = useRefOptions(REF.users);
  const userName = new Map(users.map((u) => [u.value, u.label]));
  const q = useQuery({ queryKey: ['task', id], queryFn: () => get<TaskDetail>(`/tasks/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['task', id] }); qc.invalidateQueries({ queryKey: ['tasks'] }); };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { refresh(); setComment(''); setReason(''); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNotice error={q.error} />;
  const t = q.data!;
  const mineOrManager = can('tasks.approve') || t.assigneeId === me?.user.id || t.createdById === me?.user.id;
  const open = ['aberta', 'em_andamento'].includes(t.status);
  const canReview = t.status === 'aguardando_aprovacao' && can('tasks.approve') && (!t.approverId || t.approverId === me?.user.id);

  return (
    <>
      <p className="small"><Link to="/atividades">← Atividades</Link></p>
      <PageHead title={t.title}>
        {open && can('tasks.write') && mineOrManager && (
          <>
            {t.status === 'aberta' && <button className="btn" onClick={() => act.mutate(() => patch(`/tasks/${t.id}`, { status: 'em_andamento' }))}>Iniciar</button>}
            <button className="btn primary" onClick={() => act.mutate(() => post(`/tasks/${t.id}/complete`))}>{t.requiresApproval ? 'Concluir e enviar para aprovação' : 'Concluir'}</button>
            <button className="btn" onClick={() => setEditing(true)}>Editar</button>
          </>
        )}
      </PageHead>
      {t.rejectionReason && t.status !== 'concluida' && <div className="notice bad" style={{ marginBottom: 12 }}><strong>Reprovada:</strong> {t.rejectionReason}</div>}
      {canReview && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Avaliar conclusão</h3>
          <Field label="Observação (obrigatória para reprovar)"><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => act.mutate(() => post(`/tasks/${t.id}/review`, { approve: true, reason: reason || null }))}>Aprovar</button>
            <button className="btn danger" onClick={() => act.mutate(() => post(`/tasks/${t.id}/review`, { approve: false, reason }))}>Reprovar</button>
          </div>
        </div>
      )}
      <div className="grid two">
        <div className="card">
          <dl className="kv">
            <dt>Status</dt><dd><Badge v={t.status} group="taskStatus" /></dd>
            <dt>Prioridade</dt><dd><Badge v={t.priority} group="priority" /></dd>
            <dt>Prazo</dt><dd>{fmtDate(t.dueDate)} {overdue(t) ? <Badge v="vencido">Atrasada</Badge> : null}</dd>
            <dt>Responsável</dt><dd>{t.assigneeId ? userName.get(t.assigneeId) ?? '—' : '—'}</dd>
            <dt>Recorrência</dt><dd>{label('recurrence', t.recurrence)}</dd>
            <dt>Aprovação</dt><dd>{t.requiresApproval ? `Exigida${t.approverId ? ` — ${userName.get(t.approverId) ?? ''}` : ''}` : 'Não exigida'}</dd>
            <dt>Plano de ação</dt><dd>{t.actionPlan?.title ?? '—'}</dd>
            <dt>Origem</dt><dd>{t.origin}</dd>
            <dt>Concluída em</dt><dd>{fmtDateTime(t.completedAt)}</dd>
          </dl>
          {t.description && <p style={{ whiteSpace: 'pre-wrap', marginTop: 14 }}>{t.description}</p>}
        </div>
        <Attachments entity="task" entityId={t.id} writePerm="tasks.write" />
      </div>
      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Comentários</h3>
          {!t.comments.length && <p className="muted small">Nenhum comentário.</p>}
          {t.comments.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #eef0ef' }}>
              <div className="small"><strong>{c.userName}</strong> <span className="muted">· {fmtDateTime(c.createdAt)}</span></div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); if (comment.trim()) act.mutate(() => post(`/tasks/${t.id}/comments`, { body: comment })); }} style={{ marginTop: 10 }}>
            <textarea className="textarea" placeholder="Escreva um comentário…" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn sm" style={{ marginTop: 6 }}>Comentar</button>
          </form>
        </div>
        <div className="card">
          <h3>Histórico de alterações</h3>
          <ul className="timeline">
            {t.history.map((h) => (
              <li key={h.id}>
                <time>{fmtDateTime(h.createdAt)}</time>
                <strong>{h.userName ?? 'Sistema'}</strong> — {ACTIONS[h.action] ?? h.action}
                {h.action === 'atualizar' && h.data ? <div className="muted small">Campos: {Object.keys(h.data).join(', ')}</div> : null}
                {h.action === 'reprovar' && h.data?.motivo ? <div className="muted small">Motivo: {String(h.data.motivo)}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {editing && (
        <Drawer title="Editar tarefa" onClose={() => setEditing(false)}>
          <TaskForm initial={t} onDone={() => { setEditing(false); refresh(); }} />
        </Drawer>
      )}
    </>
  );
}

const plansConfig: ResourceConfig = {
  title: 'Planos de ação',
  singular: 'Plano de ação',
  description: 'Agrupe tarefas corretivas e preventivas (ex.: após inspeções, acidentes ou avaliação de riscos) e acompanhe o progresso.',
  endpoint: '/action-plans',
  readPerm: 'tasks.read',
  writePerm: 'tasks.write',
  fields: [
    { name: 'title', label: 'Título', type: 'text', required: true, full: true },
    { name: 'objective', label: 'Objetivo', type: 'textarea' },
    { name: 'companyId', label: 'Empresa', type: 'ref', ref: REF.companies },
    { name: 'unitId', label: 'Unidade', type: 'ref', ref: REF.units },
    { name: 'ownerId', label: 'Responsável', type: 'ref', ref: REF.users },
    { name: 'origin', label: 'Origem', type: 'text', placeholder: 'inspeção, acidente, auditoria…' },
    { name: 'status', label: 'Status', type: 'select', options: [{ value: 'aberto', label: 'Aberto' }, { value: 'em_andamento', label: 'Em andamento' }, { value: 'concluido', label: 'Concluído' }, { value: 'cancelado', label: 'Cancelado' }] },
    { name: 'dueDate', label: 'Prazo', type: 'date' },
  ],
  columns: [
    { key: 'title', label: 'Plano' },
    { key: 'status', label: 'Status', render: (r) => <Badge v={r.status === 'concluido' ? 'concluida' : undefined}>{String(r.status).replace('_', ' ')}</Badge> },
    { key: 'dueDate', label: 'Prazo', render: (r) => fmtDate(r.dueDate as string) },
    {
      key: 'progress',
      label: 'Progresso',
      render: (r) => {
        const p = r.progress as { total: number; done: number; percent: number };
        return (
          <div style={{ minWidth: 140 }}>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${p.percent}%` }} /></div>
            <span className="small muted">{p.done}/{p.total} tarefas ({p.percent}%)</span>
          </div>
        );
      },
    },
  ],
  extra: (row) => (
    <div className="card">
      <h3>Tarefas do plano</h3>
      <p className="small"><Link to={`/atividades?plano=${row.id}`}>Abrir atividades</Link> — crie tarefas e selecione este plano no campo "Plano de ação".</p>
      <Attachments entity="action_plan" entityId={row.id} writePerm="tasks.write" title="Anexos do plano" />
    </div>
  ),
};

export const ActionPlansPage = () => <ResourcePage config={plansConfig} />;
