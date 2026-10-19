import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Empty, Spinner } from './components/ui';
import { ForgotPage, LoginPage, ResetPage } from './pages/Auth';
import { AlertsPage, DashboardPage } from './pages/Dashboard';
import { CompaniesPage, WorkersPage } from './pages/Cadastros';
import { AccidentsPage, ExamsPage, PpePage, RisksPage, TrainingsPage } from './pages/Sst';
import { ActionPlansPage, TaskDetailPage, TasksPage } from './pages/Tasks';
import { DocumentDetailPage, DocumentsPage } from './pages/Documents';
import { ReportsPage } from './pages/Reports';
import { EsocialDetailPage, EsocialPage } from './pages/Esocial';
import { AccountPage, AuditPage, EnvironmentPage, LgpdPage, PlatformPage, SettingsPage, UsersPage } from './pages/Admin';

function Protected({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!me || me.mfaPending) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!me.tenants.length)
    return <Empty>Seu usuário ainda não está vinculado a nenhum cliente. Solicite acesso ao administrador.</Empty>;
  if (!me.currentTenant) return <Spinner />;
  return <>{children}</>;
}

function Perm({ p, children }: { p: string; children: ReactNode }) {
  const { can } = useAuth();
  return can(p) ? <>{children}</> : <div className="card"><Empty>Você não tem permissão para acessar esta área ({p}).</Empty></div>;
}

function Home() {
  const { can } = useAuth();
  return can('reports.read') ? <DashboardPage /> : can('tasks.read') ? <Navigate to="/atividades" replace /> : <AlertsPage />;
}

export function App() {
  const { me } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={me && !me.mfaPending ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPage />} />
      <Route path="/redefinir-senha" element={<ResetPage />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Home />} />
        <Route path="alertas" element={<AlertsPage />} />
        <Route path="cadastros/empresas" element={<Perm p="org.read"><CompaniesPage /></Perm>} />
        <Route path="cadastros/trabalhadores" element={<Perm p="workers.read"><WorkersPage /></Perm>} />
        <Route path="sst/riscos" element={<Perm p="risks.read"><RisksPage /></Perm>} />
        <Route path="sst/exames" element={<Perm p="health.read"><ExamsPage /></Perm>} />
        <Route path="sst/ocorrencias" element={<Perm p="accidents.read"><AccidentsPage /></Perm>} />
        <Route path="sst/epis" element={<Perm p="ppe.read"><PpePage /></Perm>} />
        <Route path="sst/treinamentos" element={<Perm p="trainings.read"><TrainingsPage /></Perm>} />
        <Route path="atividades" element={<Perm p="tasks.read"><TasksPage /></Perm>} />
        <Route path="atividades/:id" element={<Perm p="tasks.read"><TaskDetailPage /></Perm>} />
        <Route path="planos-de-acao" element={<Perm p="tasks.read"><ActionPlansPage /></Perm>} />
        <Route path="documentos" element={<Perm p="documents.read"><DocumentsPage /></Perm>} />
        <Route path="documentos/:id" element={<Perm p="documents.read"><DocumentDetailPage /></Perm>} />
        <Route path="relatorios" element={<Perm p="reports.read"><ReportsPage /></Perm>} />
        <Route path="esocial" element={<Perm p="esocial.read"><EsocialPage /></Perm>} />
        <Route path="esocial/:id" element={<Perm p="esocial.read"><EsocialDetailPage /></Perm>} />
        <Route path="meio-ambiente" element={<Perm p="documents.read"><EnvironmentPage /></Perm>} />
        <Route path="admin/usuarios" element={<Perm p="admin.users"><UsersPage /></Perm>} />
        <Route path="admin/configuracoes" element={<Perm p="admin.settings"><SettingsPage /></Perm>} />
        <Route path="admin/auditoria" element={<Perm p="audit.read"><AuditPage /></Perm>} />
        <Route path="lgpd" element={<Perm p="lgpd.manage"><LgpdPage /></Perm>} />
        <Route path="plataforma" element={<PlatformPage />} />
        <Route path="conta" element={<AccountPage />} />
        <Route path="*" element={<Empty>Página não encontrada.</Empty>} />
      </Route>
    </Routes>
  );
}
