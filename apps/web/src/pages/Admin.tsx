import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, download, get, patch, post, put, qs, type Page } from '../api';
import { useAuth } from '../auth';
import { useRefOptions } from '../components/ResourcePage';
import { REF } from '../components/refs';
import { Badge, Drawer, ErrorNotice, Field, PageHead, Pager, Select, Spinner, Tabs, fmtDate, fmtDateTime, useToast } from '../components/ui';
import { DocumentsPage } from './Documents';

type R = Record<string, unknown>;
interface Role { id: string; key: string; name: string; description: string | null; permissions: string[]; system: boolean }
interface UserRow { id: string; name: string; email?: string; active: boolean; mfaEnabled?: boolean; lastLoginAt?: string | null; role: { id: string; name: string; key: string }; companyIds: string[]; unitIds: string[] }

// ---------------- Usuários e papéis ----------------
function UserDrawer({ user, roles, onClose }: { user: UserRow | 'new'; roles: Role[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const companies = useRefOptions(REF.companies);
  const units = useRefOptions(REF.unitsAll);
  const [v, setV] = useState(() =>
    user === 'new' ? { name: '', email: '', roleId: '', companyIds: [] as string[], unitIds: [] as string[] } : { name: user.name, email: user.email ?? '', roleId: user.role.id, companyIds: user.companyIds, unitIds: user.unitIds },
  );
  const save = useMutation({
    mutationFn: () => (user === 'new' ? post<{ invitedByEmail: boolean }>('/users', v) : patch(`/users/${user.id}`, { roleId: v.roleId, companyIds: v.companyIds, unitIds: v.unitIds })),
    onSuccess: (r) => {
      toast(user === 'new' ? ((r as { invitedByEmail?: boolean }).invitedByEmail ? 'Usuário convidado por e-mail' : 'Usuário criado. Sem SMTP: peça que use "Esqueci minha senha" após configurar o e-mail, ou defina uma senha inicial pela API.') : 'Acesso atualizado');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/users/${(user as UserRow).id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const toggle = (k: 'companyIds' | 'unitIds', id: string) => setV({ ...v, [k]: v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id] });
  return (
    <Drawer
      title={user === 'new' ? 'Adicionar usuário' : `Acesso de ${user.name}`}
      onClose={onClose}
      footer={
        <>
          {user !== 'new' && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Remover o acesso deste usuário a este cliente?') && remove.mutate()}>Remover acesso</button>}
          <button className="btn primary" onClick={() => save.mutate()} disabled={save.isPending}>Salvar</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nome *"><input className="input" disabled={user !== 'new'} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="E-mail *"><input className="input" type="email" disabled={user !== 'new'} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="Papel *" full><Select value={v.roleId} onChange={(roleId) => setV({ ...v, roleId })} options={roles.map((r) => ({ value: r.id, label: r.name }))} /></Field>
        <Field label="Restringir a empresas" full help="Nenhuma marcada = acesso a todas as empresas do cliente.">
          <div style={{ display: 'grid', gap: 4 }}>{companies.map((c) => <label key={c.value} className="check"><input type="checkbox" checked={v.companyIds.includes(c.value)} onChange={() => toggle('companyIds', c.value)} />{c.label}</label>)}</div>
        </Field>
        <Field label="Restringir a unidades" full help="Nenhuma marcada = todas as unidades das empresas permitidas.">
          <div style={{ display: 'grid', gap: 4 }}>{units.map((u) => <label key={u.value} className="check"><input type="checkbox" checked={v.unitIds.includes(u.value)} onChange={() => toggle('unitIds', u.value)} />{u.label}</label>)}</div>
        </Field>
      </div>
      {save.error ? <div style={{ marginTop: 12 }}><ErrorNotice error={save.error} /></div> : null}
    </Drawer>
  );
}

function RoleDrawer({ role, onClose }: { role: Role | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => get<{ key: string; description: string; module: string }[]>('/permissions') });
  const readOnly = role !== 'new' && role.system;
  const [v, setV] = useState(() => (role === 'new' ? { name: '', description: '', permissions: [] as string[] } : { name: role.name, description: role.description ?? '', permissions: role.permissions }));
  const save = useMutation({
    mutationFn: () => (role === 'new' ? post('/roles', v) : patch(`/roles/${role.id}`, v)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); onClose(); },
  });
  const groups = (perms.data ?? []).reduce<Record<string, { key: string; description: string }[]>>((acc, p) => ({ ...acc, [p.module]: [...(acc[p.module] ?? []), p] }), {});
  return (
    <Drawer title={role === 'new' ? 'Novo papel' : role.name} onClose={onClose} footer={!readOnly ? <button className="btn primary" onClick={() => save.mutate()}>Salvar</button> : undefined}>
      {readOnly && <div className="notice info" style={{ marginBottom: 12 }}>Papel padrão do sistema (somente leitura). Para ajustar, crie um papel personalizado.</div>}
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Nome *"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Descrição"><input className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        </div>
        {Object.entries(groups).map(([mod, list]) => (
          <div key={mod} style={{ marginTop: 14 }}>
            <h3 style={{ textTransform: 'capitalize' }}>{mod}</h3>
            {list.map((p) => (
              <label key={p.key} className="check" style={{ padding: '3px 0' }}>
                <input type="checkbox" checked={v.permissions.includes(p.key)} onChange={(e) => setV({ ...v, permissions: e.target.checked ? [...v.permissions, p.key] : v.permissions.filter((x) => x !== p.key) })} />
                <span>{p.description} <code className="muted small">{p.key}</code></span>
              </label>
            ))}
          </div>
        ))}
      </fieldset>
      {save.error ? <div style={{ marginTop: 12 }}><ErrorNotice error={save.error} /></div> : null}
    </Drawer>
  );
}

export function UsersPage() {
  const [tab, setTab] = useState<'u' | 'r'>('u');
  const users = useQuery({ queryKey: ['users'], queryFn: () => get<UserRow[]>('/users') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => get<Role[]>('/roles') });
  const [editUser, setEditUser] = useState<UserRow | 'new' | null>(null);
  const [editRole, setEditRole] = useState<Role | 'new' | null>(null);
  return (
    <>
      <PageHead title="Usuários e papéis" description="Controle de acesso por cliente, empresa, unidade e módulo.">
        {tab === 'u' ? <button className="btn primary" onClick={() => setEditUser('new')}>+ Adicionar usuário</button> : <button className="btn primary" onClick={() => setEditRole('new')}>+ Novo papel</button>}
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'u', label: 'Usuários' }, { value: 'r', label: 'Papéis e permissões' }]} />
      {tab === 'u' ? (
        users.isLoading ? <Spinner /> : users.error ? <ErrorNotice error={users.error} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Escopo</th><th>MFA</th><th>Último acesso</th></tr></thead>
              <tbody>
                {users.data!.map((u) => (
                  <tr key={u.id} className="clickable" onClick={() => setEditUser(u)}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role.name}</td>
                    <td className="small">{u.companyIds.length || u.unitIds.length ? `${u.companyIds.length} empresa(s), ${u.unitIds.length} unidade(s)` : 'Todo o cliente'}</td>
                    <td>{u.mfaEnabled ? <Badge v="vigente">Ativo</Badge> : <Badge v="aviso">Inativo</Badge>}</td>
                    <td className="small">{fmtDateTime(u.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : roles.isLoading ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Papel</th><th>Descrição</th><th>Permissões</th><th>Tipo</th></tr></thead>
            <tbody>
              {roles.data?.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setEditRole(r)}>
                  <td>{r.name}</td><td className="small">{r.description}</td><td>{r.permissions.length}</td><td>{r.system ? 'Padrão' : 'Personalizado'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editUser && roles.data && <UserDrawer user={editUser} roles={roles.data} onClose={() => setEditUser(null)} />}
      {editRole && <RoleDrawer role={editRole} onClose={() => setEditRole(null)} />}
    </>
  );
}

// ---------------- Configurações ----------------
interface Settings {
  alertDays: { documents: number; exams: number; trainings: number; ppe: number; tasks: number };
  riskMatrix: { moderado: number; alto: number; critico: number };
  esocialDeadlines: { S2210: string | null; S2220: string | null; S2240: string | null };
  retentionReviewMonths: number | null;
}

export function SettingsPage() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => get<Settings>('/settings') });
  const [v, setV] = useState<Settings | null>(null);
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const save = useMutation({ mutationFn: () => put('/settings', v), onSuccess: () => toast('Configurações salvas') });
  if (!v) return <Spinner />;
  const num = (path: (s: Settings) => number, setter: (s: Settings, n: number) => Settings) => (
    <input className="input" type="number" min={0} value={path(v)} onChange={(e) => setV(setter(structuredClone(v), Number(e.target.value)))} />
  );
  return (
    <>
      <PageHead title="Configurações do cliente" description="Parâmetros usados em alertas, matriz de risco e acompanhamento. Defina-os com o responsável técnico; o sistema não impõe prazos legais pré-definidos.">
        <button className="btn primary" onClick={() => save.mutate()} disabled={save.isPending}>Salvar</button>
      </PageHead>
      {save.error ? <ErrorNotice error={save.error} /> : null}
      <div className="grid two">
        <div className="card">
          <h2>Antecedência dos alertas (dias)</h2>
          <div className="form-grid">
            <Field label="Documentos">{num((s) => s.alertDays.documents, (s, n) => ((s.alertDays.documents = n), s))}</Field>
            <Field label="Exames">{num((s) => s.alertDays.exams, (s, n) => ((s.alertDays.exams = n), s))}</Field>
            <Field label="Treinamentos">{num((s) => s.alertDays.trainings, (s, n) => ((s.alertDays.trainings = n), s))}</Field>
            <Field label="EPI (troca e CA)">{num((s) => s.alertDays.ppe, (s, n) => ((s.alertDays.ppe = n), s))}</Field>
            <Field label="Tarefas">{num((s) => s.alertDays.tasks, (s, n) => ((s.alertDays.tasks = n), s))}</Field>
          </div>
        </div>
        <div className="card">
          <h2>Matriz de risco</h2>
          <p className="small muted">Nível = probabilidade (1–5) × severidade (1–5). Defina o nível mínimo de cada classe.</p>
          <div className="form-grid">
            <Field label="Moderado a partir de">{num((s) => s.riskMatrix.moderado, (s, n) => ((s.riskMatrix.moderado = n), s))}</Field>
            <Field label="Alto a partir de">{num((s) => s.riskMatrix.alto, (s, n) => ((s.riskMatrix.alto = n), s))}</Field>
            <Field label="Crítico a partir de">{num((s) => s.riskMatrix.critico, (s, n) => ((s.riskMatrix.critico = n), s))}</Field>
          </div>
        </div>
        <div className="card">
          <h2>Prazos de envio do eSocial (referência)</h2>
          <p className="small muted">Registre os prazos conforme o Manual de Orientação do eSocial vigente, com a fonte. Campo informativo exibido na tela do eSocial.</p>
          {(['S2210', 'S2220', 'S2240'] as const).map((k) => (
            <Field key={k} label={k.replace('S', 'S-')}>
              <input className="input" value={v.esocialDeadlines[k] ?? ''} onChange={(e) => setV({ ...v, esocialDeadlines: { ...v.esocialDeadlines, [k]: e.target.value || null } })} placeholder="Ex.: prazo + referência do MOS vigente" />
            </Field>
          ))}
        </div>
        <div className="card">
          <h2>Retenção de dados (LGPD)</h2>
          <Field label="Sinalizar titulares desligados há mais de (meses)" help="Apenas sinaliza para revisão humana. Verifique os prazos legais de guarda antes de anonimizar.">
            <input className="input" type="number" min={1} value={v.retentionReviewMonths ?? ''} onChange={(e) => setV({ ...v, retentionReviewMonths: e.target.value ? Number(e.target.value) : null })} placeholder="Não sinalizar" />
          </Field>
        </div>
      </div>
    </>
  );
}

// ---------------- Auditoria ----------------
export function AuditPage() {
  const [page, setPage] = useState(1);
  const [f, setF] = useState<{ entity?: string; from?: string; to?: string }>({});
  const q = useQuery({ queryKey: ['audit', page, f], queryFn: () => get<Page<{ id: string; action: string; entity: string; entityId: string | null; userName: string | null; ip: string | null; createdAt: string; data: R | null }>>(`/audit${qs({ page, pageSize: 50, ...f })}`) });
  return (
    <>
      <PageHead title="Trilha de auditoria" description="Registro das ações importantes. Dados sensíveis (senhas, CPF, dados de saúde, conteúdo de eventos) são mascarados." />
      <div className="toolbar">
        <Field label="Entidade"><Select value={f.entity ?? ''} onChange={(v) => setF({ ...f, entity: v || undefined })} placeholder="Todas" options={['user', 'company', 'unit', 'sector', 'worker', 'risk', 'exam', 'accident', 'task', 'document', 'esocial_event', 'report', 'settings', 'role'].map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="De"><input className="input" type="date" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} /></Field>
        <Field label="Até"><input className="input" type="date" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} /></Field>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNotice error={q.error} /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhes</th><th>IP</th></tr></thead>
              <tbody>
                {q.data!.items.map((a) => (
                  <tr key={a.id}>
                    <td className="small">{fmtDateTime(a.createdAt)}</td>
                    <td>{a.userName ?? '—'}</td>
                    <td>{a.action.replace(/_/g, ' ')}</td>
                    <td className="small">{a.entity}<br /><code className="muted">{a.entityId?.slice(0, 8)}</code></td>
                    <td className="small"><code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.data ? JSON.stringify(a.data).slice(0, 220) : ''}</code></td>
                    <td className="small">{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={50} total={q.data!.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

// ---------------- Minha conta ----------------
export function AccountPage() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [mfa, setMfa] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [disable, setDisable] = useState({ password: '', code: '' });
  const change = useMutation({ mutationFn: () => post('/auth/password/change', pw), onSuccess: () => { toast('Senha alterada. Outras sessões foram encerradas.'); setPw({ currentPassword: '', newPassword: '' }); } });
  const setup = useMutation({ mutationFn: () => post<{ qrCodeDataUrl: string; secret: string }>('/auth/mfa/setup'), onSuccess: setMfa });
  const enable = useMutation({ mutationFn: () => post('/auth/mfa/enable', { code }), onSuccess: () => { toast('Verificação em duas etapas ativada'); setMfa(null); refresh(); } });
  const off = useMutation({ mutationFn: () => post('/auth/mfa/disable', disable), onSuccess: () => { toast('Verificação em duas etapas desativada'); refresh(); } });
  return (
    <>
      <PageHead title="Minha conta" description={`${me?.user.name} · ${me?.user.email}`} />
      <div className="grid two">
        <form className="card" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
          <h2>Alterar senha</h2>
          <div className="grid" style={{ gap: 12 }}>
            <Field label="Senha atual"><input className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="Nova senha" help="Mínimo de 10 caracteres, com letras e números."><input className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          </div>
          {change.error ? <div style={{ marginTop: 10 }}><ErrorNotice error={change.error} /></div> : null}
          <button className="btn primary" style={{ marginTop: 12 }}>Salvar nova senha</button>
        </form>
        <div className="card">
          <h2>Verificação em duas etapas (MFA)</h2>
          {me?.user.mfaEnabled ? (
            <>
              <div className="notice ok">Ativa. Um código do aplicativo autenticador é solicitado a cada login.</div>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <Field label="Senha"><input className="input" type="password" value={disable.password} onChange={(e) => setDisable({ ...disable, password: e.target.value })} /></Field>
                <Field label="Código atual"><input className="input" inputMode="numeric" maxLength={6} value={disable.code} onChange={(e) => setDisable({ ...disable, code: e.target.value })} /></Field>
              </div>
              {off.error ? <div style={{ marginTop: 10 }}><ErrorNotice error={off.error} /></div> : null}
              <button className="btn danger" style={{ marginTop: 12 }} onClick={() => off.mutate()}>Desativar MFA</button>
            </>
          ) : mfa ? (
            <>
              <p className="small">Escaneie o QR code no aplicativo autenticador e digite o código gerado.</p>
              <img src={mfa.qrCodeDataUrl} alt="QR code para configurar o autenticador" width={180} height={180} />
              <p className="small muted">Chave manual: <code>{mfa.secret}</code></p>
              <Field label="Código de 6 dígitos"><input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
              {enable.error ? <div style={{ marginTop: 10 }}><ErrorNotice error={enable.error} /></div> : null}
              <button className="btn primary" style={{ marginTop: 12 }} onClick={() => enable.mutate()}>Ativar</button>
            </>
          ) : (
            <>
              <p className="small">Recomendado para todos os usuários, e especialmente para quem acessa dados de saúde.</p>
              <button className="btn primary" onClick={() => setup.mutate()}>Configurar MFA</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- LGPD ----------------
export function LgpdPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ confirmName: '', reason: '', retentionChecked: false });
  const workers = useQuery({ queryKey: ['lgpd-workers', q], queryFn: () => get<Page<{ id: string; name: string; cpf: string; status: string; anonymizedAt: string | null }>>(`/workers${qs({ q, pageSize: 20 })}`), enabled: q.length >= 2 });
  const review = useQuery({ queryKey: ['retention'], queryFn: () => get<{ configured: boolean; months?: number; aviso?: string; items: { id: string; name: string; terminationDate: string }[] }>('/lgpd/retention-review') });
  const anon = useMutation({
    mutationFn: () => post(`/lgpd/workers/${target!.id}/anonymize`, form),
    onSuccess: () => { toast('Titular anonimizado'); setTarget(null); qc.invalidateQueries({ queryKey: ['lgpd-workers'] }); qc.invalidateQueries({ queryKey: ['retention'] }); },
  });
  return (
    <>
      <PageHead title="Privacidade e LGPD" description="Atendimento a solicitações de titulares: exportação dos dados (acesso/portabilidade) e anonimização. Todas as ações ficam na auditoria." />
      <div className="grid two">
        <div className="card">
          <h2>Buscar titular</h2>
          <Field label="Nome, CPF ou matrícula"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite ao menos 2 caracteres" /></Field>
          <table className="table" style={{ marginTop: 10 }}>
            <tbody>
              {workers.data?.items.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}<div className="muted small">{w.status}{w.anonymizedAt ? ' · anonimizado' : ''}</div></td>
                  <td>
                    <div className="actions">
                      <button className="btn sm" onClick={() => download(`/lgpd/workers/${w.id}/export`, 'dados_titular.json')}>Exportar dados</button>
                      {!w.anonymizedAt && <button className="btn sm danger" onClick={() => { setForm({ confirmName: '', reason: '', retentionChecked: false }); setTarget(w); }}>Anonimizar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Revisão de retenção</h2>
          {!review.data?.configured ? <p className="muted small">Período de revisão não configurado (Configurações → Retenção).</p> : (
            <>
              <p className="small muted">{review.data.aviso}</p>
              <table className="table"><tbody>{review.data.items.map((w) => <tr key={w.id}><td>{w.name}</td><td>Desligado em {fmtDate(w.terminationDate)}</td></tr>)}</tbody></table>
              {!review.data.items.length && <p className="muted small">Nenhum titular a revisar.</p>}
            </>
          )}
        </div>
      </div>
      {target && (
        <Drawer title={`Anonimizar: ${target.name}`} onClose={() => setTarget(null)} footer={<button className="btn danger" disabled={!form.retentionChecked} onClick={() => anon.mutate()}>Anonimizar definitivamente</button>}>
          <div className="notice bad">Ação irreversível. Nome, CPF, nascimento, e-mail e matrícula serão substituídos; dados clínicos e conteúdo dos eventos eSocial serão removidos. Registros de SST podem ter prazos legais de guarda — confirme antes de prosseguir.</div>
          <div className="grid" style={{ gap: 12, marginTop: 14 }}>
            <Field label={`Digite o nome do titular para confirmar (${target.name})`}><input className="input" value={form.confirmName} onChange={(e) => setForm({ ...form, confirmName: e.target.value })} /></Field>
            <Field label="Motivo / base da solicitação"><textarea className="textarea" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={form.retentionChecked} onChange={(e) => setForm({ ...form, retentionChecked: e.target.checked })} /> Verifiquei as obrigações legais de guarda aplicáveis a estes registros.</label>
          </div>
          {anon.error ? <div style={{ marginTop: 12 }}><ErrorNotice error={anon.error} /></div> : null}
        </Drawer>
      )}
    </>
  );
}

// ---------------- Plataforma (superadministrador) ----------------
export function PlatformPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: () => get<{ id: string; name: string; slug: string; isDemo: boolean; createdAt: string; _count: { companies: number; memberships: number } }[]>('/tenants') });
  const tables = useQuery({ queryKey: ['esocial-tables'], queryFn: () => get<{ key: string; registros: number }[]>('/esocial/tables') });
  const [nt, setNt] = useState({ name: '', slug: '' });
  const [imp, setImp] = useState({ table: '', csv: '', sourceNote: '' });
  const create = useMutation({ mutationFn: () => post('/tenants', nt), onSuccess: () => { toast('Cliente criado'); setNt({ name: '', slug: '' }); qc.invalidateQueries({ queryKey: ['tenants'] }); qc.invalidateQueries({ queryKey: ['me'] }); } });
  const importT = useMutation({
    mutationFn: () => post<{ imported: number }>(`/esocial/tables/${imp.table}/import`, { csv: imp.csv, replace: true, sourceNote: imp.sourceNote }),
    onSuccess: (r) => { toast(`${r.imported} códigos importados`); qc.invalidateQueries({ queryKey: ['esocial-tables'] }); },
  });
  return (
    <>
      <PageHead title="Plataforma" description="Gestão de clientes (separação de dados) e importação das tabelas oficiais do eSocial." />
      <div className="grid two">
        <div className="card">
          <h2>Clientes</h2>
          <table className="table"><tbody>{tenants.data?.map((t) => <tr key={t.id}><td>{t.name} {t.isDemo && <Badge v="aviso">Demonstração</Badge>}<div className="muted small">{t.slug}</div></td><td className="small">{t._count.companies} empresa(s) · {t._count.memberships} usuário(s)</td></tr>)}</tbody></table>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="form-grid" style={{ marginTop: 12 }}>
            <Field label="Nome do cliente"><input className="input" value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} /></Field>
            <Field label="Identificador (slug)"><input className="input" value={nt.slug} onChange={(e) => setNt({ ...nt, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></Field>
            <div className="full">{create.error ? <ErrorNotice error={create.error} /> : null}<button className="btn primary">Criar cliente</button></div>
          </form>
        </div>
        <div className="card">
          <h2>Tabelas oficiais do eSocial</h2>
          <p className="small muted">Baixe as tabelas no portal oficial (gov.br/esocial — documentação técnica vigente), converta para CSV com "código;descrição" e importe. A importação substitui a tabela anterior.</p>
          <table className="table"><tbody>{tables.data?.map((t) => <tr key={t.key}><td><code>{t.key}</code></td><td>{t.registros} códigos</td></tr>)}</tbody></table>
          <div className="grid" style={{ gap: 10, marginTop: 12 }}>
            <Field label="Tabela"><Select value={imp.table} onChange={(table) => setImp({ ...imp, table })} options={(tables.data ?? []).map((t) => ({ value: t.key, label: t.key }))} /></Field>
            <Field label="Fonte (versão/NT e data de download)"><input className="input" value={imp.sourceNote} onChange={(e) => setImp({ ...imp, sourceNote: e.target.value })} /></Field>
            <Field label="Arquivo CSV"><input type="file" accept=".csv,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImp({ ...imp, csv: await f.text() }); }} /></Field>
            {importT.error ? <ErrorNotice error={importT.error} /> : null}
            <button className="btn primary" disabled={!imp.table || !imp.csv || !imp.sourceNote} onClick={() => importT.mutate()}>Importar</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------- Meio ambiente (MVP parcial) ----------------
export function EnvironmentPage() {
  return (
    <>
      <div className="notice info" style={{ marginBottom: 16 }}>
        Nesta versão (MVP), licenças ambientais e condicionantes são controladas como documentos com validade e alertas, e as ações como tarefas de origem "ambiental".
        O módulo completo (aspectos e impactos, resíduos/MTR, condicionantes com prazos próprios e indicadores configuráveis) está no backlog — ver docs/BACKLOG.md.
      </div>
      <DocumentsPage fixedType="LICENCA_AMBIENTAL" title="Meio ambiente — licenças" description="Licenças ambientais com validade, versões e alertas de vencimento." />
    </>
  );
}
