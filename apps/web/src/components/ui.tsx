import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api';

// ---------- Formatação (pt-BR) ----------
export const fmtDate = (v?: string | null) => {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
export const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const human = (v?: string | null) => (v ? v.replace(/_/g, ' ') : '—');

export const LABELS: Record<string, Record<string, string>> = {
  taskStatus: { aberta: 'Aberta', em_andamento: 'Em andamento', aguardando_aprovacao: 'Aguardando aprovação', concluida: 'Concluída', cancelada: 'Cancelada' },
  priority: { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' },
  recurrence: { nenhuma: 'Não se repete', diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' },
  docStatus: { rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovado: 'Aprovado', obsoleto: 'Obsoleto' },
  versionStatus: { rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovada: 'Aprovada', reprovada: 'Reprovada' },
  expiry: { vencido: 'Vencido', a_vencer: 'A vencer', vigente: 'Vigente', sem_validade: 'Sem validade' },
  docType: {
    PGR: 'PGR', PCMSO: 'PCMSO', LTCAT: 'LTCAT', PPP: 'PPP', ORDEM_SERVICO: 'Ordem de serviço', FICHA_EPI: 'Ficha de EPI', PROCEDIMENTO: 'Procedimento',
    LAUDO: 'Laudo', LICENCA_AMBIENTAL: 'Licença ambiental', CERTIFICADO: 'Certificado', OUTRO: 'Outro',
  },
  esocialStatus: {
    rascunho: 'Rascunho', com_pendencias: 'Com pendências', validado: 'Validado (regras internas)', exportado: 'Exportado p/ conferência', na_fila: 'Na fila',
    enviado: 'Enviado', processado: 'Processado', rejeitado: 'Rejeitado', erro_transmissao: 'Erro de transmissão', recibo_manual: 'Recibo informado manualmente',
  },
  riskType: { fisico: 'Físico', quimico: 'Químico', biologico: 'Biológico', ergonomico: 'Ergonômico', acidente: 'Acidente/mecânico', psicossocial: 'Psicossocial' },
  examType: { admissional: 'Admissional', periodico: 'Periódico', retorno_trabalho: 'Retorno ao trabalho', mudanca_risco: 'Mudança de risco', monitoracao_pontual: 'Monitoração pontual', demissional: 'Demissional' },
  accidentType: { tipico: 'Acidente típico', trajeto: 'Acidente de trajeto', doenca: 'Doença do trabalho', incidente: 'Incidente', quase_acidente: 'Quase acidente' },
  accidentStatus: { registrado: 'Registrado', em_investigacao: 'Em investigação', concluido: 'Investigação concluída' },
  workerStatus: { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' },
};
export const label = (group: string, v?: string | null) => (v ? (LABELS[group]?.[v] ?? human(v)) : '—');
export const options = (group: string) => Object.entries(LABELS[group]).map(([value, l]) => ({ value, label: l }));

const TONES: Record<string, string> = {
  vencido: 'bad', a_vencer: 'warn', vigente: 'ok', concluida: 'ok', aprovado: 'ok', aprovada: 'ok', processado: 'ok', validado: 'ok', exportado: 'brand',
  com_pendencias: 'warn', aguardando_aprovacao: 'warn', em_revisao: 'warn', rejeitado: 'bad', reprovada: 'bad', erro_transmissao: 'bad', critica: 'bad', alta: 'warn',
  recibo_manual: 'brand', apto: 'ok', inapto: 'bad', erro: 'bad', aviso: 'warn', pendencia: 'warn',
};
export function Badge({ v, group, children }: { v?: string | null; group?: string; children?: ReactNode }) {
  if (!v && !children) return <span className="muted">—</span>;
  return <span className={`badge ${TONES[v ?? ''] ?? ''}`}>{children ?? (group ? label(group, v) : human(v))}</span>;
}

// ---------- Feedback ----------
export const Spinner = () => <div className="spinner" role="status" aria-label="Carregando" />;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as ApiError;
  return (
    <div className="notice bad" role="alert">
      <strong>{e.message ?? 'Erro'}</strong>
      {e.details?.length ? (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {e.details.map((d, i) => (
            <li key={i}>{d.campo ? `${d.campo}: ` : ''}{d.mensagem}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'error') => void>(() => undefined);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-area" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Estrutura ----------
export function PageHead({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="actions">{children}</div> : null}
    </div>
  );
}

export function Drawer({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true">
        <header>
          <h2>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>{total} registro(s)</span>
      <div className="actions">
        <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span>Página {page} de {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button>
      </div>
    </div>
  );
}

export function Bars({ data, dark }: { data: { label: string; value: number }[]; dark?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <Empty>Sem dados</Empty>;
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span>{d.label}</span>
          <div className="bar-track" aria-hidden>
            <div className={`bar-fill ${dark ? 'dark' : ''}`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <strong>{d.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ---------- Campos ----------
export function Field({ label: l, help, error, children, full }: { label: string; help?: ReactNode; error?: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{l}</label>
      {children}
      {help ? <span className="help">{help}</span> : null}
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}

export function Select({ value, onChange, options: opts, placeholder = 'Selecione…', ...rest }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; required?: boolean; disabled?: boolean; 'aria-label'?: string }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
