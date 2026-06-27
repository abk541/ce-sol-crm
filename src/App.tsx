import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store/useStore'
import toast from 'react-hot-toast'
import Layout from './components/layout/Layout'
import AccessNoticePage from './pages/auth/AccessNoticePage'
import LoginPage from './pages/auth/LoginPage'
import FirstLoginPage from './pages/auth/FirstLoginPage'
import DashboardPage from './pages/DashboardPage'
import PipelinePage from './pages/PipelinePage'
import ProposalsPage from './pages/ProposalsPage'
import BDTrackerPage from './pages/BDTrackerPage'
import ContractsPage from './pages/ContractsPage'
import FinanceProjectionsPage from './pages/FinanceProjectionsPage'
import NotificationsPage from './pages/NotificationsPage'
import AdminPage from './pages/AdminPage'
import HRPage from './pages/HRPage'
import TrackerPage from './pages/TrackerPage'
import NonSubmissionsPage from './pages/NonSubmissionsPage'
import PastPerformancesPage from './pages/PastPerformancesPage'
import FreshAwardPage from './pages/FreshAwardPage'
import SubkDatabasePage from './pages/SubkDatabasePage'
import CertificationsPage from './pages/CertificationsPage'
import PlaceholderPage from './pages/PlaceholderPage'
import { hasAnyPermission, hasPermission, type Permission } from './lib/permissions'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, needsFirstLogin } = useStore()
  if (needsFirstLogin) return <Navigate to="/first-login" replace />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AccessNoticeGuard({ children }: { children: React.ReactNode }) {
  const { accessNoticeAccepted, isAuthenticated, needsFirstLogin, currentUser } = useStore()
  const hasValidatedCredentials = isAuthenticated || needsFirstLogin || !!currentUser
  if (!hasValidatedCredentials) return <Navigate to="/login" replace />
  if (!accessNoticeAccepted) return <Navigate to="/access-notice" replace />
  return <>{children}</>
}

function PermissionGuard({
  children,
  permission,
  anyOf,
}: {
  children: React.ReactNode
  permission?: Permission
  anyOf?: Permission[]
}) {
  const currentUser = useStore(s => s.currentUser)
  const allowed = permission
    ? hasPermission(currentUser, permission)
    : hasAnyPermission(currentUser, anyOf ?? [])
  if (!allowed) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const { isAuthenticated, accessNoticeAccepted, needsFirstLogin, currentUser } = useStore()
  const initializeStore = useStore(s => s.initializeStore)
  const syncUsersFromDb = useStore(s => s.syncUsersFromDb)

  // Sync the user roster from Supabase as soon as the app boots — before any
  // login — so credentials and firstLogin flags are correct across browsers.
  // Without this the local Zustand persist (which is browser-scoped) is the
  // only source of truth and admins on different browsers see different user
  // lists.
  useEffect(() => {
    void syncUsersFromDb()
  }, [syncUsersFromDb])

  // Re-run every time the user logs in so Supabase data always wins over stale localStorage
  useEffect(() => {
    if (isAuthenticated) initializeStore()
  }, [isAuthenticated])

  useEffect(() => {
    const checkSession = () => {
      const state = useStore.getState()
      if (state.isAuthenticated && state.loginTimestamp) {
        if (state.dbReady) {
          state.syncDueOpportunities()
          state.scanDeadlineReminders()
          state.scanNonSubReminders()
          state.scanGoalProgress()
        }
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
          element={
            !isAuthenticated && !needsFirstLogin && !currentUser
              ? <Navigate to="/login" replace />
              : accessNoticeAccepted
                ? <Navigate to={needsFirstLogin ? "/first-login" : isAuthenticated ? "/dashboard" : "/login"} replace />
                : <AccessNoticePage />
          }
        />
        <Route path="/login"       element={isAuthenticated ? <Navigate to={accessNoticeAccepted ? "/dashboard" : "/access-notice"} replace /> : <LoginPage />} />
        <Route path="/first-login" element={<AccessNoticeGuard><FirstLoginPage /></AccessNoticeGuard>} />

        <Route path="/" element={<AccessNoticeGuard><AuthGuard><Layout /></AuthGuard></AccessNoticeGuard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"     element={<DashboardPage />} />
          <Route path="pipeline"      element={<PermissionGuard permission="opportunity:read"><PipelinePage /></PermissionGuard>} />
          <Route path="proposals"     element={<PermissionGuard permission="opportunity:assign"><ProposalsPage /></PermissionGuard>} />
          <Route path="bd-tracker"    element={<PermissionGuard anyOf={['admin:manageUsers', 'opportunity:assign', 'opportunity:submitProposal']}><BDTrackerPage /></PermissionGuard>} />
          <Route path="contracts"     element={<PermissionGuard permission="contract:read"><ContractsPage /></PermissionGuard>} />
          <Route path="finance-projections" element={<PermissionGuard permission="operations:manage"><FinanceProjectionsPage /></PermissionGuard>} />
          <Route path="idiq"          element={<Navigate to="/contracts" replace />} />
          <Route path="bpas"          element={<Navigate to="/contracts" replace />} />
          <Route path="tracker"             element={<PermissionGuard permission="opportunity:deleteApprove"><TrackerPage /></PermissionGuard>} />
          <Route path="non-submissions"   element={<PermissionGuard anyOf={['nonSubmission:viewAll', 'nonSubmission:submit']}><NonSubmissionsPage /></PermissionGuard>} />
          <Route path="past-performances" element={<PermissionGuard permission="contract:read"><PastPerformancesPage /></PermissionGuard>} />
          <Route path="fresh-award"       element={<PermissionGuard permission="operations:manage"><FreshAwardPage /></PermissionGuard>} />
          <Route path="subk-database"     element={<PermissionGuard anyOf={['sourcing:read', 'operations:manage']}><SubkDatabasePage /></PermissionGuard>} />
          <Route path="certifications"    element={<PermissionGuard permission="hr:viewCertifications"><CertificationsPage /></PermissionGuard>} />
          <Route path="notifications"     element={<NotificationsPage />} />
          <Route path="admin"             element={<PermissionGuard permission="admin:manageUsers"><AdminPage /></PermissionGuard>} />
          <Route path="hr"                element={<PermissionGuard permission="hr:viewCertifications"><HRPage /></PermissionGuard>} />
          <Route path="settings"          element={<PlaceholderPage title="Settings" />} />
        </Route>

        <Route path="*" element={<Navigate to={isAuthenticated ? (accessNoticeAccepted ? "/dashboard" : "/access-notice") : "/login"} replace />} />
      </Routes>
    </HashRouter>
  )
}
