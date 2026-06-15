import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import BottomNav from './components/BottomNav';
import Loading from './components/Loading';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Assessment from './pages/Assessment';
import Chat from './pages/Chat';
import SimultaneousTranslate from './pages/SimultaneousTranslate';
import Translate from './pages/Translate';
import WordBank from './pages/WordBank';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import ImportMaterials from './pages/ImportMaterials';
import SnapPage from './pages/SnapPage';
import Onboarding from './pages/Onboarding';
import PWAInstallBanner from './components/PWAInstallBanner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <Loading />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const { token } = useAuth();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/onboarding';

  return (
    <div className="max-w-lg mx-auto min-h-[100dvh] relative bg-ink-950">
      <PWAInstallBanner />
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={token ? <Navigate to="/" replace /> : <Register />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/simul" element={<ProtectedRoute><SimultaneousTranslate /></ProtectedRoute>} />
        <Route path="/translate" element={<ProtectedRoute><Translate /></ProtectedRoute>} />
        <Route path="/import" element={<ProtectedRoute><ImportMaterials /></ProtectedRoute>} />
        <Route path="/snap" element={<ProtectedRoute><SnapPage /></ProtectedRoute>} />
        <Route path="/words" element={<ProtectedRoute><WordBank /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      </Routes>
      {token && !isAuthPage && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/demo">
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  );
}
