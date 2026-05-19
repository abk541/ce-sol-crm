import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store/useStore'
import toast from 'react-hot-toast'
import Layout from './components/layout/Layout'
import AccessNoticePage from './pages/auth/AccessNoticePage'
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

function AccessNoticeGuard({ children }: { children: React.ReactNode }) {
  const accepted = useStore(s => s.accessNoticeAccepted)
  if (!accepted) return <Navigate to="/access-notice" replace />
  return <>{children}</>
}

export default function App() {
  const { isAuthenticated, accessNoticeAccepted } = useStore()
  const initializeStore = useStore(s => s.initializeStore)

  // Re-run every time the user logs in so Supabase data always wins over stale localStorage
  useEffect(() => {
    if (isAuthenticated) initializeStore()
  }, [isAuthenticated])

  useEffect(() => {
    const checkSession = () => {
      const state = useStore.getState()
      if (state.isAuthenticated && state.loginTimestamp) {
        if (state.dbReady) state.syncDueOpportunities()
        const elapsed = Date.now() - state.loginTimestamp
        if (elapsed > 24 * 60 * 60 * 1000) {
          state.logout()
          toast.error('Session expired. Please log in again.')
        }
      }
    }
    checkSession()
    const timer = setInterval(checkSession, 60_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/access-notice"
          element={accessNoticeAccepted ? <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace /> : <AccessNoticePage />}
        />
        <Route path="/login"       element={<AccessNoticeGuard>{isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}</AccessNoticeGuard>} />
        <Route path="/first-login" element={<AccessNoticeGuard><FirstLoginPage /></AccessNoticeGuard>} />
        <Route path="/mfa-setup"   element={<AccessNoticeGuard><MFASetupPage /></AccessNoticeGuard>} />

        <Route path="/" element={<AccessNoticeGuard><AuthGuard><Layout /></AuthGuard></AccessNoticeGuard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"     element={<DashboardPage />} />
          <Route path="pipeline"      element={<PipelinePage />} />
          <Route path="proposals"     element={<ProposalsPage />} />
          <Route path="bd-tracker"    element={<BDTrackerPage />} />
          <Route path="contracts"     element={<ContractsPage />} />
          <Route path="idiq"          element={<Navigate to="/contracts" replace />} />
          <Route path="bpas"          element={<Navigate to="/contracts" replace />} />
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

        <Route path="*" element={<Navigate to={accessNoticeAccepted ? (isAuthenticated ? "/dashboard" : "/login") : "/access-notice"} replace />} />
      </Routes>
    </HashRouter>
  )
}
