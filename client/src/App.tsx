import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WorkerPage from './pages/WorkerPage';
import InventoryPage from './pages/InventoryPage';
import GanttPage from './pages/GanttPage';
import CertificatesPage from './pages/CertificatesPage';
import EquipmentPage from './pages/EquipmentPage';
import SuppliersPage from './pages/SuppliersPage';
import BudgetPage from './pages/BudgetPage';
import TeamPage from './pages/TeamPage';
import EngineHoursPage from './pages/EngineHoursPage';
import TanksPage from './pages/TanksPage';
import SettingsPage from './pages/SettingsPage';
import './index.css';

function ProtectedRoute({ children, allowedRoles }: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate home page
    return <Navigate to={user.role === 'admin' ? '/dashboard' : '/worker'} replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) {
    return <Navigate to={user.role === 'admin' ? '/dashboard' : '/worker'} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/dashboard' : '/worker'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={
        <PublicRoute><LoginPage /></PublicRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardPage />
        </ProtectedRoute>
      } />
      <Route path="/worker" element={
        <ProtectedRoute allowedRoles={['worker']}>
          <WorkerPage />
        </ProtectedRoute>
      } />
      <Route path="/inventory" element={
        <ProtectedRoute>
          <InventoryPage />
        </ProtectedRoute>
      } />
      <Route path="/gantt" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <GanttPage />
        </ProtectedRoute>
      } />
      <Route path="/certificates" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <CertificatesPage />
        </ProtectedRoute>
      } />
      <Route path="/equipment" element={
        <ProtectedRoute>
          <EquipmentPage />
        </ProtectedRoute>
      } />
      <Route path="/equipment/:id" element={
        <ProtectedRoute>
          <EquipmentPage />
        </ProtectedRoute>
      } />
      <Route path="/suppliers" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <SuppliersPage />
        </ProtectedRoute>
      } />
      <Route path="/budget" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <BudgetPage />
        </ProtectedRoute>
      } />
      <Route path="/team" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <TeamPage />
        </ProtectedRoute>
      } />
      <Route path="/engine-hours" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <EngineHoursPage />
        </ProtectedRoute>
      } />
      <Route path="/tanks" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <TanksPage />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <SettingsPage />
        </ProtectedRoute>
      } />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
