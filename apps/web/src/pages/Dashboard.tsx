import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, qs } from '../api';
import { useAuth } from '../auth';
import { ScopeFilter, type ScopeValue } from '../components/ScopeFilter';
import { Badge, Bars, ErrorNotice, PageHead, Spinner, fmtDate, fmtDateTime, label } from '../components/ui';

const SEVERITY: Record<string, string> = { vencido: 'Vencido', a_vencer: 'A vencer', pendencia: 'Pendência' };

interface Dash {
  kpis: { key: string; label: string; value: number | string; formula: string; tone?: string }[];
  charts: Record<string, { label: string; value: number }[]>;
  generatedAt: string;
}

/** Grupo de rótulos usado para traduzir os valores de cada gráfico */
const CHART_LABELS: Record<string, string> = { tarefasPorStatus: 'taskStatus', ocorrenciasPorTipo: 'accidentType', esocialPorStatus: 'esocialStatus' };

const CHARTS: Record<string, string> = {
  tarefasPorStatus: 'Tarefas por status',
  ocorrenciasPorTipo: 'Ocorrências por tipo',
  riscosPorClasse: 'Riscos por classe (matriz configurada)',
  esocialPorStatus: 'Eventos eSocial por status',
};

export function DashboardPage() {
  const { me } = useAuth();
  const [scope, setScope] = useState<ScopeValue>({});
  const q = useQuery({ queryKey: ['dashboard', scope], queryFn: () => get<Dash>(`/dashboard${qs({ ...scope })}`) });
  const alerts = useQuery({
    queryKey: ['alerts', scope.companyId, scope.unitId],
    queryFn: () => get<{ items: { key: string; kind: string; severity: string; title: string; dueDate: string | null; link: string }[] }>(`/alerts${qs({ companyId: scope.companyId, unitId: scope.unitId })}`),
  });
  return (
    <>
      <PageHead title={`Olá, ${me?.user.name.split(' ')[0]}`} description="Indicadores de SST, documentos, atividades e eSocial. Passe o mouse sobre um indicador para ver como é calculado." />
      <ScopeFilter value={scope} onChange={setScope} />
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNotice error={q.error} /> : (
        <>
          <div className="grid kpis">
            {q.data!.kpis.map((k) => (
              <div key={k.key} className={`kpi ${k.tone ?? ''}`} title={k.formula}>
                <div className="label">{k.label}</div>
                <div className="value">{k.value}</div>
                <div className="formula">{k.formula}</div>
              </div>
            ))}
          </div>
          <div className="grid two" style={{ marginTop: 16 }}>
            <div className="card span-all">
              <div className="page-head" style={{ marginBottom: 8 }}>
                <h2>Próximos vencimentos e pendências</h2>
                <Link to="/alertas" className="btn sm">Ver todos</Link>
              </div>
              {!alerts.data?.items.length ? <p className="muted">Nenhum vencimento no horizonte configurado.</p> : (
                <table className="table">
                  <tbody>
                    {alerts.data.items.slice(0, 8).map((a) => (
                      <tr key={a.key}>
                        <td><Badge v={a.severity}>{SEVERITY[a.severity]}</Badge></td>
                        <td><Link to={a.link}>{a.title}</Link></td>
                        <td className="muted small">{fmtDate(a.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {Object.entries(q.data!.charts).map(([key, data]) => (
              <div className="card" key={key}>
                <h2>{CHARTS[key] ?? key}</h2>
                <Bars data={data.map((d) => ({ ...d, label: CHART_LABELS[key] ? label(CHART_LABELS[key], d.label) : d.label }))} dark={key === 'esocialPorStatus'} />
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>Atualizado em {fmtDateTime(q.data!.generatedAt)}. Origem e fórmulas detalhadas em Relatórios.</p>
        </>
      )}
    </>
  );
}

export function AlertsPage() {
  const [scope, setScope] = useState<ScopeValue>({});
  const q = useQuery({
    queryKey: ['alerts', scope.companyId, scope.unitId],
    queryFn: () => get<{ items: { key: string; kind: string; severity: string; title: string; dueDate: string | null; link: string }[] }>(`/alerts${qs({ companyId: scope.companyId, unitId: scope.unitId })}`),
  });
  const KIND: Record<string, string> = { documento: 'Documento', tarefa: 'Tarefa', exame: 'Exame', treinamento: 'Treinamento', epi: 'Troca de EPI', ca_epi: 'CA de EPI', esocial: 'eSocial' };
  return (
    <>
      <PageHead title="Alertas e vencimentos" description="Itens vencidos ou dentro da antecedência configurada em Configurações. Você vê apenas o que suas permissões permitem." />
      <ScopeFilter value={scope} onChange={setScope} period={false} />
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNotice error={q.error} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Situação</th><th>Tipo</th><th>Item</th><th>Data</th></tr></thead>
            <tbody>
              {q.data!.items.map((a) => (
                <tr key={a.key}>
                  <td><Badge v={a.severity}>{SEVERITY[a.severity]}</Badge></td>
                  <td>{KIND[a.kind] ?? a.kind}</td>
                  <td><Link to={a.link}>{a.title}</Link></td>
                  <td>{fmtDate(a.dueDate)}</td>
                </tr>
              ))}
              {!q.data!.items.length && <tr><td colSpan={4} className="empty">Nenhum alerta no momento.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
