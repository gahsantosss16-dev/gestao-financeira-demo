import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { FeedbackProvider } from './components/Feedback';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { DataProvider } from './data/DataContext';
import type { Role } from './lib/types';
import { Accounts } from './pages/Accounts';
import { Audit, Users } from './pages/Admin';
import { Categories, Services } from './pages/Catalog';
import { Dashboard } from './pages/Dashboard';
import { FiscalNotes, FiscalSettings } from './pages/Fiscal';
import { Login } from './pages/Login';
import { NextStage } from './pages/NextStage';
import { Parties } from './pages/Parties';

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile } = useAuth();
  return profile && roles.includes(profile.role) ? <>{children}</> : <Navigate to="/" replace />;
}

function Shell() {
  const { profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!profile) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="receber" element={<Accounts key="receber" kind="receber" />} />
        <Route path="pagar" element={<Accounts key="pagar" kind="pagar" />} />
        <Route path="cadastros/pessoas" element={<Parties />} />
        <Route path="cadastros/categorias" element={<Categories />} />
        <Route path="cadastros/servicos" element={<Services />} />
        <Route path="fiscal/notas" element={<FiscalNotes />} />
        <Route path="fiscal/configuracao" element={<RequireRole roles={['admin', 'fiscal', 'financeiro']}><FiscalSettings /></RequireRole>} />
        <Route path="relatorios" element={<NextStage page="relatorios" />} />
        <Route path="importacao" element={<NextStage page="importacao" />} />
        <Route path="admin/usuarios" element={<RequireRole roles={['admin']}><Users /></RequireRole>} />
        <Route path="admin/auditoria" element={<RequireRole roles={['admin']}><Audit /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <FeedbackProvider>
      <AuthProvider>
        <DataProvider>
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Shell /></HashRouter>
        </DataProvider>
      </AuthProvider>
    </FeedbackProvider>
  );
}
