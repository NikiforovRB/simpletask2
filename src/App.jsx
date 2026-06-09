import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SuperAdmin from './pages/SuperAdmin';

function AppLoader() {
  return (
    <div className="app-loading" role="status" aria-label="Загрузка">
      <div className="app-loading__spinner" aria-hidden>
        <span className="app-loading__ring app-loading__ring--outer" />
        <span className="app-loading__ring app-loading__ring--inner" />
        <span className="app-loading__dot" />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoader />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function SuperAdminRoute({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();
  if (loading) return <AppLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/superadmin"
        element={
          <SuperAdminRoute>
            <SuperAdmin />
          </SuperAdminRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
