import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store/useStore'
import Layout from './components/layout/Layout'
import LoginPage from './pages/auth/LoginPage'
import FirstLoginPage from './pages/auth/FirstLoginPage'
import MFASetupPage from './pages/auth/MFASetupPage'
import DashboardPage from './pages/DashboardPage'
import PipelinePage from './pages/PipelinePage'
import ProposalsPage from './pages/ProposalsPage'
import BDTrackerPage from './pages/BDTrackerPage'
import ContractsPage from './pages/ContractsPage'
import NotificationsPage from './pages/NotificationsPage'
import AdminPage from './pages/AdminPage'
import TrackerPage from './pages/TrackerPage'
import NonSubmissionsPage from './pages/NonSubmissionsPage'
import PastPerformancesPage from './pages/PastPerformancesPage'
import FreshAwardPage from './pages/FreshAwardPage'
import SubkDatabasePage from './pages/SubkDatabasePage'
import PlaceholderPage from './pages/PlaceholderPage'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, needsFirstLogin, needsMFASetup } = useStore()
  if (needsFirstLogin) return <Navigate to="/first-login" replace />
  if (needsMFASetup) return <Navigate to="/mfa-setup" replace />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { isAuthenticated } = useStore()

  return (
    <HashRouter>
      <Routes>
        <Route path="/login"       element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/first-login" element={<FirstLoginPage />} />
        <Route path="/mfa-setup"   element={<MFASetupPage />} />

        <Route path="/" element={<AuthGuard><Layout /></AuthGuard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"     element={<DashboardPage />} />
          <Route path="pipeline"      element={<PipelinePage />} />
          <Route path="proposals"     element={<ProposalsPage />} />
          <Route path="bd-tracker"    element={<BDTrackerPage />} />
          <Route path="contracts"     element={<ContractsPage />} />
          <Route path="idiq"          element={<PlaceholderPage title="IDIQ" />} />
          <Route path="bpas"          element={<PlaceholderPage title="BPAs" />} />
          <Route path="tracker"             element={<TrackerPage />} />
          <Route path="non-submissions"   element={<NonSubmissionsPage />} />
          <Route path="past-performances" element={<PastPerformancesPage />} />
          <Route path="fresh-award"       element={<FreshAwardPage />} />
          <Route path="subk-database"     element={<SubkDatabasePage />} />
          <Route path="notifications"     element={<NotificationsPage />} />
          <Route path="database"          element={<PlaceholderPage title="INT-Database" />} />
          <Route path="admin"             element={<AdminPage />} />
          <Route path="hr"                element={<PlaceholderPage title="HR" />} />
          <Route path="settings"          element={<PlaceholderPage title="Settings" />} />
        </Route>

        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </HashRouter>
  )
}
