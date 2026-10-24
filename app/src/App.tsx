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
import { Charges } from './pages/Charges';
import { Dashboard } from './pages/Dashboard';
import { FiscalNotes, FiscalSettings } from './pages/Fiscal';
import { ImportPage } from './pages/Import';
import { Login } from './pages/Login';
import { MyProfile } from './pages/MyProfile';
import { NextStage } from './pages/NextStage';
import { Parties } from './pages/Parties';
import { SetPassword } from './pages/SetPassword';

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile } = useAuth();
  return profile && roles.includes(profile.role) ? <>{children}</> : <Navigate to="/" replace />;
}

function Shell() {
  const { profile, loading, passwordSetupRequired } = useAuth();
  if (loading) return <Loading />;
  if (!profile) return <Login />;
  // convite ou recuperação de senha: nada do sistema fica acessível antes de definir a senha
  if (passwordSetupRequired) return <SetPassword />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="receber" element={<Accounts key="receber" kind="receber" />} />
        <Route path="pagar" element={<Accounts key="pagar" kind="pagar" />} />
        <Route path="cobrancas" element={<Charges />} />
        <Route path="meu-perfil" element={<MyProfile />} />
        <Route path="cadastros/pessoas" element={<Parties />} />
        <Route path="cadastros/categorias" element={<Categories />} />
        <Route path="cadastros/servicos" element={<Services />} />
        <Route path="fiscal/notas" element={<FiscalNotes />} />
        <Route path="fiscal/configuracao" element={<RequireRole roles={['admin', 'fiscal', 'financeiro']}><FiscalSettings /></RequireRole>} />
        <Route path="relatorios" element={<NextStage page="relatorios" />} />
        <Route path="importacao" element={<RequireRole roles={['admin', 'financeiro']}><ImportPage /></RequireRole>} />
        <Route path="admin/usuarios" element={<RequireRole roles={['admin']}><Users /></RequireRole>} />
        <Route path="admin/auditoria" element={<RequireRole roles={['admin']}><Audit /></RequireRole>} />
        <Route path="definir-senha" element={<Navigate to="/" replace />} />
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
