import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../api';
import { useAuth } from '../auth';
import { Icons } from './icons';
import { fmtDateTime } from './ui';

interface NavItem { to: string; label: string; icon: keyof typeof Icons; perm?: string; any?: string[] }

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Visão geral', items: [
    { to: '/', label: 'Painel', icon: 'dashboard', perm: 'reports.read' },
    { to: '/alertas', label: 'Alertas e vencimentos', icon: 'alert' },
  ] },
  { group: 'Cadastros', items: [
    { to: '/cadastros/empresas', label: 'Empresas e unidades', icon: 'building', perm: 'org.read' },
    { to: '/cadastros/trabalhadores', label: 'Trabalhadores', icon: 'users', perm: 'workers.read' },
  ] },
  { group: 'SST', items: [
    { to: '/sst/riscos', label: 'Perigos e riscos', icon: 'shield', perm: 'risks.read' },
    { to: '/sst/exames', label: 'Exames e ASO', icon: 'heart', perm: 'health.read' },
    { to: '/sst/ocorrencias', label: 'Acidentes e ocorrências', icon: 'bolt', perm: 'accidents.read' },
    { to: '/sst/epis', label: 'EPIs', icon: 'hardhat', perm: 'ppe.read' },
    { to: '/sst/treinamentos', label: 'Treinamentos', icon: 'book', perm: 'trainings.read' },
  ] },
  { group: 'Gestão', items: [
    { to: '/atividades', label: 'Atividades', icon: 'check', perm: 'tasks.read' },
    { to: '/planos-de-acao', label: 'Planos de ação', icon: 'check', perm: 'tasks.read' },
    { to: '/documentos', label: 'Documentos', icon: 'file', perm: 'documents.read' },
    { to: '/relatorios', label: 'Relatórios', icon: 'chart', perm: 'reports.read' },
    { to: '/esocial', label: 'eSocial (SST)', icon: 'send', perm: 'esocial.read' },
    { to: '/meio-ambiente', label: 'Meio ambiente', icon: 'leaf', perm: 'documents.read' },
  ] },
  { group: 'Administração', items: [
    { to: '/admin/usuarios', label: 'Usuários e papéis', icon: 'users', perm: 'admin.users' },
    { to: '/admin/configuracoes', label: 'Configurações', icon: 'settings', perm: 'admin.settings' },
    { to: '/admin/auditoria', label: 'Auditoria', icon: 'eye', perm: 'audit.read' },
    { to: '/lgpd', label: 'Privacidade (LGPD)', icon: 'lock', perm: 'lgpd.manage' },
  ] },
];

function Notifications() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<{ items: { id: string; title: string; body?: string; link?: string; readAt: string | null; createdAt: string }[]; unread: number }>('/notifications'),
    refetchInterval: 60_000,
  });
  const read = useMutation({ mutationFn: (id: string) => post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readAll = useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-label="Notificações" style={{ position: 'relative' }}>
        <span style={{ width: 20, height: 20, display: 'inline-flex' }}><Icons.bell /></span>
        {q.data?.unread ? <span className="dot" style={{ position: 'absolute', top: 2, right: 2 }}>{q.data.unread}</span> : null}
      </button>
      {open && (
        <div className="notif-panel" onMouseLeave={() => setOpen(false)}>
          <div style={{ display: 'flex', padding: '10px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <strong style={{ flex: 1 }}>Notificações</strong>
            <button className="btn sm ghost" onClick={() => readAll.mutate()}>Marcar todas como lidas</button>
          </div>
          {!q.data?.items.length ? <p className="muted small" style={{ padding: 14 }}>Nenhuma notificação.</p> : null}
          {q.data?.items.map((n) => (
            <Link key={n.id} to={n.link ?? '#'} className={`item ${n.readAt ? '' : 'unread'}`} onClick={() => { read.mutate(n.id); setOpen(false); }}>
              <div style={{ fontWeight: n.readAt ? 400 : 700 }}>{n.title}</div>
              {n.body ? <div className="muted small">{n.body}</div> : null}
              <div className="muted small">{fmtDateTime(n.createdAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout({ children }: { children?: ReactNode }) {
  const { me, can, brand, switchTenant, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  if (!me) return null;
  const tenant = me.tenants.find((t) => t.id === me.currentTenant?.id);

  return (
    <div className="app">
      <aside className={`sidebar ${menu ? 'open' : ''}`} aria-label="Menu principal">
        <div className="logo">
          {brand.logos.darkBackground ? <img src={brand.logos.darkBackground} alt={brand.name} /> : <strong>{brand.productName}</strong>}
          <small>Gestão de SSMA</small>
        </div>
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <nav className="nav-group" key={g.group}>
              <span>{g.group}</span>
              {items.map((i) => {
                const Icon = Icons[i.icon];
                return (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <Icon /> {i.label}
                  </NavLink>
                );
              })}
            </nav>
          );
        })}
        <div style={{ flex: 1 }} />
        {me.user.isSuperAdmin && (
          <nav className="nav-group">
            <span>Plataforma</span>
            <NavLink to="/plataforma" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icons.settings /> Clientes e tabelas</NavLink>
          </nav>
        )}
        <div style={{ padding: 16, fontSize: '0.75rem', color: 'var(--brand-neutral)' }}>{brand.tagline}</div>
      </aside>
      {menu && <div className="drawer-backdrop" style={{ zIndex: 40 }} onClick={() => setMenu(false)} />}
      <div className="main">
        {tenant?.isDemo && <div className="demo-banner">AMBIENTE DE DEMONSTRAÇÃO — TODOS OS DADOS SÃO FICTÍCIOS</div>}
        <header className="topbar">
          <button className="btn ghost menu-btn" onClick={() => setMenu(true)} aria-label="Abrir menu"><span style={{ width: 22, height: 22, display: 'inline-flex' }}><Icons.menu /></span></button>
          {me.tenants.length > 1 ? (
            <select className="select" style={{ maxWidth: 320 }} value={me.currentTenant?.id ?? ''} onChange={(e) => switchTenant(e.target.value)} aria-label="Cliente">
              {me.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <strong>{tenant?.name}</strong>
          )}
          <div className="spacer" />
          <Notifications />
          <Link to="/conta" className="btn ghost hide-mobile" title={me.user.email}>{me.user.name}</Link>
          <button className="btn sm" onClick={logout}>Sair</button>
        </header>
        <main className="content">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
