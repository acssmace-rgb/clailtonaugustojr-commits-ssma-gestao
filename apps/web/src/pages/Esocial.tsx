import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { download, get, post, qs, type Page } from '../api';
import { useAuth } from '../auth';
import { Badge, Drawer, Empty, ErrorNotice, Field, PageHead, Pager, Select, Spinner, Tabs, fmtDateTime, options, useToast } from '../components/ui';

type R = Record<string, unknown>;
interface Status {
  leiauteReferencia: string;
  ambiente: string;
  geracaoXml: Record<string, boolean>;
  transmissao: { habilitada: boolean; motivo: string | null; requisitos: string[] };
  tabelas: { key: string; registros: number }[];
  aviso: string;
}
interface Ev { id: string; type: string; typeLabel: string; status: string; currentVersion: number; workerName: string | null; receiptNumber: string | null; receiptSource: string | null; isRetification: boolean; updatedAt: string }
interface Issue { campo: string; mensagem: string; severidade: 'erro' | 'aviso' }

const TYPES = [
  { value: 'S2210', label: 'S-2210 — Comunicação de Acidente de Trabalho' },
  { value: 'S2220', label: 'S-2220 — Monitoramento da Saúde do Trabalhador' },
  { value: 'S2240', label: 'S-2240 — Condições Ambientais do Trabalho' },
];
const TABLE_LABEL: Record<string, string> = {
  parte_atingida: 'Parte do corpo atingida',
  agente_causador: 'Agente causador',
  situacao_geradora: 'Situação geradora',
  natureza_lesao: 'Natureza da lesão',
  agentes_nocivos: 'Agentes nocivos',
  procedimentos_diagnosticos: 'Procedimentos diagnósticos',
  categorias_trabalhador: 'Categorias de trabalhadores',
};

function StatusCard() {
  const q = useQuery({ queryKey: ['esocial-status'], queryFn: () => get<Status>('/esocial/status') });
  if (!q.data) return null;
  const s = q.data;
  return (
    <div className="grid two" style={{ marginBottom: 16 }}>
      <div className="card">
        <h3>Situação da integração</h3>
        <dl className="kv">
          <dt>Leiaute de referência</dt><dd>{s.leiauteReferencia}</dd>
          <dt>Ambiente configurado</dt><dd>{s.ambiente === 'producao' ? 'Produção' : 'Produção restrita'}</dd>
          <dt>Geração de XML oficial</dt><dd>{Object.values(s.geracaoXml).some(Boolean) ? 'Disponível' : <Badge v="aviso">Indisponível — adaptador de leiaute não homologado</Badge>}</dd>
          <dt>Transmissão</dt><dd>{s.transmissao.habilitada ? <Badge v="vigente">Habilitada</Badge> : <Badge v="aviso">Desabilitada</Badge>}</dd>
        </dl>
        {!s.transmissao.habilitada && (
          <details style={{ marginTop: 10 }}>
            <summary className="small" style={{ cursor: 'pointer' }}>O que falta para transmitir</summary>
            <ul className="small">{s.transmissao.requisitos.map((r) => <li key={r}>{r}</li>)}</ul>
          </details>
        )}
        <p className="small muted" style={{ marginTop: 10 }}>{s.aviso}</p>
      </div>
      <div className="card">
        <h3>Tabelas oficiais importadas</h3>
        <p className="small muted">Sem as tabelas, os códigos (parte atingida, agentes, procedimentos…) não podem ser conferidos e aparecem como aviso.</p>
        <table className="table">
          <tbody>
            {s.tabelas.map((t) => (
              <tr key={t.key}><td>{TABLE_LABEL[t.key] ?? t.key}</td><td>{t.registros ? <Badge v="vigente">{t.registros} códigos</Badge> : <Badge v="aviso">Não importada</Badge>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PrepareDrawer({ onClose }: { onClose: () => void }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const [type, setType] = useState('S2240');
  const [q, setQ] = useState('');
  const [startDate, setStartDate] = useState('');
  const [resp, setResp] = useState({ nome: '', conselho: '', registro: '', uf: '' });
  const sources = useQuery({ queryKey: ['esocial-sources', type, q], queryFn: () => get<{ id: string; label: string; date: string | null; event: { id: string; status: string } | null }[]>(`/esocial/sources${qs({ type, q })}`) });
  const prep = useMutation({
    mutationFn: (sourceId: string) =>
      post<{ id: string }>('/esocial/events/prepare', {
        type,
        sourceId,
        input: type === 'S2240' ? { startDate: startDate || undefined, responsibles: resp.nome ? [{ nome: resp.nome, conselho: resp.conselho || null, registro: resp.registro || null, uf: resp.uf || null }] : undefined } : undefined,
      }),
    onSuccess: (r) => nav(`/esocial/${r.id}`),
  });
  const types = TYPES.filter((t) => t.value !== 'S2220' || can('health.read'));
  return (
    <Drawer title="Preparar evento" onClose={onClose}>
      <div className="grid" style={{ gap: 14 }}>
        <Field label="Tipo de evento"><Select value={type} onChange={setType} options={types} /></Field>
        {type === 'S2240' && (
          <div className="card">
            <h3>Dados complementares (S-2240)</h3>
            <div className="form-grid">
              <Field label="Data de início das condições" help="Se vazio, usa a data de admissão."><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
              <Field label="Responsável pelos registros ambientais" help="Se vazio, sugere o responsável do LTCAT/PGR aprovado."><input className="input" value={resp.nome} onChange={(e) => setResp({ ...resp, nome: e.target.value })} /></Field>
              <Field label="Conselho (ex.: CREA)"><input className="input" value={resp.conselho} onChange={(e) => setResp({ ...resp, conselho: e.target.value })} /></Field>
              <Field label="Registro"><input className="input" value={resp.registro} onChange={(e) => setResp({ ...resp, registro: e.target.value })} /></Field>
              <Field label="UF"><input className="input" maxLength={2} value={resp.uf} onChange={(e) => setResp({ ...resp, uf: e.target.value.toUpperCase() })} /></Field>
            </div>
          </div>
        )}
        <Field label={type === 'S2240' ? 'Trabalhador' : type === 'S2220' ? 'Exame (ASO)' : 'Acidente'}><input className="input" placeholder="Buscar por nome do trabalhador" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        {prep.error ? <ErrorNotice error={prep.error} /> : null}
        {sources.isLoading ? <Spinner /> : sources.error ? <ErrorNotice error={sources.error} /> : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {sources.data?.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}<div className="muted small">{s.date ? s.date.split('-').reverse().join('/') : ''}</div></td>
                    <td>{s.event ? <Badge v={s.event.status} group="esocialStatus" /> : <span className="muted small">Sem evento</span>}</td>
                    <td><button className="btn sm primary" disabled={prep.isPending} onClick={() => prep.mutate(s.id)}>{s.event ? 'Atualizar' : 'Preparar'}</button></td>
                  </tr>
                ))}
                {!sources.data?.length && <tr><td className="empty">Nenhum registro de origem encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Drawer>
  );
}

export function EsocialPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const [f, setF] = useState<{ type?: string; status?: string }>({});
  const [preparing, setPreparing] = useState(false);
  const params = { page, pageSize: 25, ...f };
  const q = useQuery({ queryKey: ['esocial-events', params], queryFn: () => get<Page<Ev>>(`/esocial/events${qs(params)}`) });
  return (
    <>
      <PageHead title="eSocial — eventos de SST" description="Preparação, validação e acompanhamento dos eventos S-2210, S-2220 e S-2240. Nenhum evento é marcado como transmitido sem retorno do serviço oficial.">
        {can('esocial.prepare') && <button className="btn primary" onClick={() => setPreparing(true)}>+ Preparar evento</button>}
      </PageHead>
      <StatusCard />
      <div className="toolbar">
        <Field label="Evento"><Select value={f.type ?? ''} onChange={(v) => { setF({ ...f, type: v || undefined }); setPage(1); }} placeholder="Todos" options={TYPES} /></Field>
        <Field label="Status"><Select value={f.status ?? ''} onChange={(v) => { setF({ ...f, status: v || undefined }); setPage(1); }} placeholder="Todos" options={options('esocialStatus')} /></Field>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNotice error={q.error} /> : !q.data?.items.length ? <div className="card"><Empty>Nenhum evento preparado.</Empty></div> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Evento</th><th>Trabalhador</th><th>Status</th><th>Versão</th><th>Recibo</th><th>Atualizado</th></tr></thead>
              <tbody>
                {q.data.items.map((e) => (
                  <tr key={e.id} className="clickable" onClick={() => nav(`/esocial/${e.id}`)}>
                    <td><strong>{e.typeLabel}</strong>{e.isRetification ? <div className="muted small">Retificação</div> : null}</td>
                    <td>{e.workerName ?? '—'}</td>
                    <td><Badge v={e.status} group="esocialStatus" /></td>
                    <td>v{e.currentVersion}</td>
                    <td className="small">{e.receiptNumber ? `${e.receiptNumber}${e.receiptSource?.startsWith('informado') ? ' (manual)' : ''}` : '—'}</td>
                    <td className="small">{fmtDateTime(e.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={25} total={q.data.total} onPage={setPage} />
        </>
      )}
      {preparing && <PrepareDrawer onClose={() => setPreparing(false)} />}
    </>
  );
}

function flatten(obj: unknown, prefix = ''): [string, string][] {
  if (obj === null || obj === undefined) return [[prefix, '—']];
  if (Array.isArray(obj)) return obj.length ? obj.flatMap((v, i) => flatten(v, `${prefix}[${i + 1}]`)) : [[prefix, '(nenhum)']];
  if (typeof obj === 'object') return Object.entries(obj as R).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  if (typeof obj === 'boolean') return [[prefix, obj ? 'Sim' : 'Não']];
  return [[prefix, String(obj)]];
}

export function EsocialDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'pend' | 'dados' | 'versoes' | 'logs'>('pend');
  const [receipt, setReceipt] = useState<{ receiptNumber: string; protocolNumber: string; sourceSystem: string } | null>(null);
  const q = useQuery({
    queryKey: ['esocial-event', id],
    queryFn: () =>
      get<Ev & {
        typeName: string;
        payload: R | null;
        issues: Issue[];
        versions: { id: string; version: number; payloadHash: string; issues: Issue[]; leiauteVersion: string; createdAt: string }[];
        logs: { id: string; level: string; code: string; message: string; createdAt: string }[];
        submissions: R[];
        xmlDisponivel: boolean;
        transmissaoHabilitada: boolean;
        protocolNumber: string | null;
        receiptAt: string | null;
      }>(`/esocial/events/${id}`),
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['esocial-event', id] }); qc.invalidateQueries({ queryKey: ['esocial-events'] }); };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => { refresh(); setReceipt(null); toast('Feito'); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNotice error={q.error} />;
  const e = q.data!;
  const erros = e.issues.filter((i) => i.severidade === 'erro');
  const avisos = e.issues.filter((i) => i.severidade === 'aviso');
  return (
    <>
      <p className="small"><Link to="/esocial">← eSocial</Link></p>
      <PageHead title={`${e.typeLabel} — ${e.typeName}`} description={`${e.workerName ?? ''} · versão ${e.currentVersion}${e.isRetification ? ' · retificação' : ''}`}>
        {can('esocial.prepare') && (
          <>
            <button className="btn" onClick={() => act.mutate(() => post(`/esocial/events/${e.id}/revalidate`))}>Recarregar dados e validar</button>
            <button className="btn" onClick={() => download(`/esocial/events/${e.id}/export?format=json`)}>Exportar JSON</button>
            <button className="btn primary" onClick={() => download(`/esocial/events/${e.id}/export?format=pdf`)}>Exportar PDF p/ conferência</button>
            <button className="btn" disabled={!e.xmlDisponivel} title={e.xmlDisponivel ? '' : 'Adaptador de leiaute oficial não disponível'} onClick={() => download(`/esocial/events/${e.id}/xml`)}>XML oficial</button>
          </>
        )}
        {can('esocial.transmit') && (
          <>
            <button className="btn dark" disabled={!e.transmissaoHabilitada} title={e.transmissaoHabilitada ? '' : 'Transmissão oficial não configurada'} onClick={() => act.mutate(() => post(`/esocial/events/${e.id}/transmit`))}>Transmitir</button>
            <button className="btn" onClick={() => setReceipt({ receiptNumber: '', protocolNumber: '', sourceSystem: '' })}>Informar recibo</button>
          </>
        )}
      </PageHead>
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="label">Status</div><div style={{ marginTop: 8 }}><Badge v={e.status} group="esocialStatus" /></div></div>
        <div className={`kpi ${erros.length ? 'bad' : 'ok'}`}><div className="label">Erros (regras internas)</div><div className="value">{erros.length}</div></div>
        <div className={`kpi ${avisos.length ? 'warn' : 'ok'}`}><div className="label">Avisos para conferência</div><div className="value">{avisos.length}</div></div>
        <div className="kpi"><div className="label">Recibo</div><div style={{ marginTop: 8 }}>{e.receiptNumber ?? '—'}{e.receiptSource?.startsWith('informado') ? <div className="muted small">Informado manualmente — não verificado pelo sistema</div> : null}</div></div>
      </div>
      {!e.transmissaoHabilitada && <div className="notice warn" style={{ marginBottom: 16 }}>Transmissão oficial desabilitada neste ambiente. Use a exportação para conferência e, se o envio for feito por outro sistema, registre o recibo manualmente.</div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pend', label: `Pendências (${e.issues.length})` }, { value: 'dados', label: 'Dados preparados' }, { value: 'versoes', label: `Versões (${e.versions.length})` }, { value: 'logs', label: 'Histórico técnico' }]} />
      {tab === 'pend' && (
        <div className="card">
          {!e.issues.length ? <div className="notice ok">Nenhuma pendência nas regras internas. A validação estrutural (XSD) e de negócio oficial ocorre na geração do XML e no próprio eSocial.</div> : (
            <table className="table">
              <thead><tr><th>Tipo</th><th>Campo</th><th>Pendência</th></tr></thead>
              <tbody>{e.issues.map((i, n) => <tr key={n}><td><Badge v={i.severidade}>{i.severidade === 'erro' ? 'Erro' : 'Aviso'}</Badge></td><td className="small"><code>{i.campo}</code></td><td>{i.mensagem}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
      {tab === 'dados' && (
        <div className="card">
          {e.payload && 'restrito' in e.payload ? <div className="notice warn">Conteúdo restrito a usuários com acesso a dados de saúde.</div> : (
            <>
              <p className="small muted">Estrutura de domínio do SSMA Gestão, organizada para conferência. Não corresponde ao XML oficial.</p>
              <dl className="kv">{flatten(e.payload).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
            </>
          )}
        </div>
      )}
      {tab === 'versoes' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Versão</th><th>Gerada em</th><th>Erros</th><th>Leiaute de referência</th><th>Hash dos dados</th><th></th></tr></thead>
            <tbody>
              {e.versions.map((v) => (
                <tr key={v.id}>
                  <td>v{v.version}</td>
                  <td>{fmtDateTime(v.createdAt)}</td>
                  <td>{v.issues.filter((i) => i.severidade === 'erro').length}</td>
                  <td className="small">{v.leiauteVersion}</td>
                  <td className="small"><code>{v.payloadHash.slice(0, 16)}…</code></td>
                  <td>{can('esocial.prepare') && <button className="btn sm" onClick={() => download(`/esocial/events/${e.id}/export?format=pdf&version=${v.version}`)}>PDF</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'logs' && (
        <div className="card">
          <p className="small muted">Registros técnicos sem dados pessoais.</p>
          <ul className="timeline">{e.logs.map((l) => <li key={l.id}><time>{fmtDateTime(l.createdAt)}</time><Badge v={l.level === 'error' ? 'erro' : l.level === 'warn' ? 'aviso' : undefined}>{l.code}</Badge> {l.message}</li>)}</ul>
        </div>
      )}
      {receipt && (
        <Drawer title="Informar recibo obtido em outro sistema" onClose={() => setReceipt(null)} footer={<button className="btn primary" onClick={() => act.mutate(() => post(`/esocial/events/${e.id}/receipt`, { ...receipt, protocolNumber: receipt.protocolNumber || undefined }))}>Registrar</button>}>
          <div className="notice warn">Use apenas quando o evento foi transmitido por outro sistema (ex.: folha de pagamento ou portal web do eSocial). O registro fica identificado como "informado manualmente" e não é verificado pelo SSMA Gestão.</div>
          <div className="grid" style={{ gap: 14, marginTop: 14 }}>
            <Field label="Número do recibo *"><input className="input" value={receipt.receiptNumber} onChange={(ev) => setReceipt({ ...receipt, receiptNumber: ev.target.value })} /></Field>
            <Field label="Número do protocolo"><input className="input" value={receipt.protocolNumber} onChange={(ev) => setReceipt({ ...receipt, protocolNumber: ev.target.value })} /></Field>
            <Field label="Sistema de origem *"><input className="input" placeholder="Ex.: sistema de folha, portal eSocial" value={receipt.sourceSystem} onChange={(ev) => setReceipt({ ...receipt, sourceSystem: ev.target.value })} /></Field>
          </div>
        </Drawer>
      )}
    </>
  );
}

