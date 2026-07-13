import { motion, AnimatePresence } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { avatarColor } from '../../lib/utils'
import { cn } from '../../lib/utils'
import CompanyLogo from '../shared/CompanyLogo'
import { DEFAULT_EXPANDED_NAV_GROUPS, NAV_GROUPS } from '../../config/navigation'
import { hasAnyPermission, hasPermission, ROLE_LABELS } from '../../lib/permissions'
import { isOpsAgent } from '../../lib/team'
import { isNotificationVisibleTo } from '../../lib/notifications'
import { useAppearance } from '../../lib/appearance'
import {
  GOAL_METRIC_LABELS,
  computeGoalProgress,
  currentMonthKey,
  formatGoalValue,
  goalsForEmployee,
} from '../../lib/goals'

function canSeeNavItem(user: ReturnType<typeof useStore.getState>['currentUser'], to: string) {
  // OPS Team Lead / Associate only see Contract Admin + Databases + HR.
  if (isOpsAgent(user)) {
    if (to === '/dashboard') return false
    if (to === '/pipeline' || to === '/proposals' || to === '/bd-tracker' || to === '/tracker' || to === '/non-submissions') return false
    if (to === '/finance-projections' || to === '/fresh-award') return false
    if (to === '/contracts') return true
    if (to === '/subk-database' || to === '/past-performances' || to === '/certifications') return true
    if (to === '/hr' || to === '/notifications' || to === '/settings') return true
    return false
  }
  if (to === '/pipeline') return hasPermission(user, 'opportunity:read')
  if (to === '/proposals') return hasPermission(user, 'opportunity:assign')
  if (to === '/bd-tracker') return hasAnyPermission(user, ['admin:manageUsers', 'opportunity:assign', 'opportunity:submitProposal'])
  if (to === '/tracker') return hasPermission(user, 'opportunity:deleteApprove')
  if (to === '/non-submissions') return hasAnyPermission(user, ['nonSubmission:viewAll', 'nonSubmission:submit'])
  if (to === '/contracts') return hasPermission(user, 'contract:read')
  if (to === '/fresh-award' || to === '/finance-projections') return hasPermission(user, 'operations:manage')
  if (to === '/subk-database') return hasAnyPermission(user, ['sourcing:read', 'operations:manage'])
  if (to === '/past-performances') return hasPermission(user, 'contract:read')
  if (to === '/admin') return hasPermission(user, 'admin:manageUsers')
  if (to === '/hr') return hasPermission(user, 'hr:viewCertifications')
  return true
}

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, currentUser, logout, notifications, employees, contracts, goals, opportunities, freshAwards } = useStore()
  const { prefs } = useAppearance()
  const location = useLocation()
  const [expanded, setExpanded] = useState<Record<string, boolean>>(DEFAULT_EXPANDED_NAV_GROUPS)
  const unread = notifications.filter(n => !n.read && isNotificationVisibleTo(n, { user: currentUser, employees, contracts })).length
  const expandedWidth = prefs.theme === 'noir' ? 276 : prefs.theme === 'prism' ? 232 : prefs.theme === 'daylight' ? 246 : 256
  const collapsedWidth = prefs.theme === 'noir' ? 76 : 66

  const toggleGroup = (label: string) =>
    setExpanded(p => ({ ...p, [label]: !p[label] }))

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? collapsedWidth : expandedWidth }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`app-sidebar app-sidebar--${prefs.theme} flex-shrink-0 flex flex-col h-screen sticky top-0 z-40 overflow-hidden`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4"
           style={{ minHeight: 65, borderBottom: '1px solid var(--sidebar-border)' }}>
        {sidebarCollapsed ? (
          <CompanyLogo variant="icon" />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key="logo-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0"
            >
              <CompanyLogo variant="full" height={36} />
            </motion.div>
          </AnimatePresence>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center',
            'transition-all',
            sidebarCollapsed ? 'mx-auto' : 'ml-auto'
          )}
          style={{ background: 'var(--sidebar-control-bg)', color: 'var(--sidebar-text)' }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_GROUPS.map(group => {
          const visibleItems = group.items.filter(item => canSeeNavItem(currentUser, item.to))
          if (visibleItems.length === 0) return null
          return (
          <div key={group.label} className="mb-1">
            {!sidebarCollapsed && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex items-center gap-1.5 w-full px-2 py-1 mb-0.5 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors"
                style={{ color: 'var(--sidebar-muted)' }}
              >
                {group.label}
                <ChevronDown
                  size={10}
                  className={cn('ml-auto transition-transform', !expanded[group.label] && '-rotate-90')}
                />
              </button>
            )}
            {sidebarCollapsed && (
              <div className="my-2 mx-2 border-t border-white/10" />
            )}
            <AnimatePresence initial={false}>
              {(sidebarCollapsed || expanded[group.label]) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-0.5 overflow-hidden"
                >
                  {visibleItems.map(item => {
                    const isActive = location.pathname === item.to
                    return (
                      <NavLink key={item.to} to={item.to}>
                        <motion.div
                          whileHover={{ x: sidebarCollapsed ? 0 : 2 }}
                          whileTap={{ scale: 0.98 }}
                          className={cn(
                            'nav-item relative',
                            isActive && 'active',
                            sidebarCollapsed && 'justify-center px-0 py-2.5 !border-l-0 !pl-0'
                          )}
                          title={sidebarCollapsed ? item.label : undefined}
                        >
                          <item.icon
                            size={15}
                            className={cn(
                              'flex-shrink-0 nav-icon',
                              isActive ? 'nav-icon-active' : 'nav-icon-idle'
                            )}
                          />
                          {!sidebarCollapsed && (
                            <span className="truncate text-[13px]">{item.label}</span>
                          )}
                          {'badge' in item && item.badge && unread > 0 && (
                            <span className={cn(
                              'flex-shrink-0 min-w-[18px] h-[18px] rounded-full text-[9px] font-bold flex items-center justify-center',
                              sidebarCollapsed ? 'absolute -top-1 -right-1 w-4 h-4 text-[8px]' : 'ml-auto'
                            )}>
                              {unread > 9 ? '9+' : unread}
                            </span>
                          )}
                        </motion.div>
                      </NavLink>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )
        })}
      </nav>

      {currentUser && (
        <SidebarGoalBadge
          collapsed={sidebarCollapsed}
          currentUser={currentUser}
          employees={employees}
          goals={goals}
          opportunities={opportunities}
          freshAwards={freshAwards}
        />
      )}

      {/* User profile */}
      {currentUser && (
        <div
          className={cn(
            'p-3',
            sidebarCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2.5'
          )}
          style={{ borderTop: '1px solid var(--sidebar-border)' }}
        >
          <div className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br',
            avatarColor(currentUser.avatar)
          )}>
            {currentUser.avatar.slice(0, 2).toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--sidebar-text)' }}>{currentUser.name}</p>
              <p className="text-[10px] font-medium truncate" style={{ color: 'var(--sidebar-muted)' }}>{ROLE_LABELS[currentUser.role]}</p>
            </div>
          )}
          <button
            onClick={logout}
            title="Logout"
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ background: 'var(--sidebar-control-bg)', color: 'var(--sidebar-muted)' }}
          ><LogOut size={13} /></button>
        </div>
      )}
    </motion.aside>
  )
}

// Picks the highest-priority goal for the current user (personal first, then team)
// and renders a compact progress badge. Returns nothing when no goals exist.
function SidebarGoalBadge({
  collapsed,
  currentUser,
  employees,
  goals,
  opportunities,
  freshAwards,
}: {
  collapsed: boolean
  currentUser: NonNullable<ReturnType<typeof useStore.getState>['currentUser']>
  employees: ReturnType<typeof useStore.getState>['employees']
  goals: ReturnType<typeof useStore.getState>['goals']
  opportunities: ReturnType<typeof useStore.getState>['opportunities']
  freshAwards: ReturnType<typeof useStore.getState>['freshAwards']
}) {
  const monthKey = currentMonthKey()
  const myEmployee = useMemo(
    () => employees.find(e => e.email === currentUser.email || e.name === currentUser.name),
    [employees, currentUser],
  )
  const myGoals = useMemo(
    () => goalsForEmployee(goals, myEmployee?.id, employees, monthKey),
    [goals, myEmployee, employees, monthKey],
  )
  const primary = useMemo(() => {
    if (!myGoals.length) return null
    const personal = myGoals.find(g => g.scope === 'employee' && g.targetId === myEmployee?.id)
    return personal ?? myGoals[0]
  }, [myGoals, myEmployee])
  if (!primary) return null
  const progress = computeGoalProgress(primary, opportunities, freshAwards, employees)
  const barPct = Math.min(100, progress.pct)
  const color = progress.status === 'achieved'
    ? '#10B981'
    : progress.status === 'ahead'
      ? '#06B6D4'
      : progress.status === 'on-track'
        ? '#F59E0B'
        : '#EF4444'

  if (collapsed) {
    return (
      <div
        className="mx-auto my-2 w-7 h-7 rounded-lg flex items-center justify-center"
        title={`${GOAL_METRIC_LABELS[primary.metric]} — ${formatGoalValue(primary.metric, progress.current)} / ${formatGoalValue(primary.metric, primary.targetValue)}`}
        style={{ background: 'var(--sidebar-control-bg)', color, border: `1px solid ${color}33` }}
      >
        <Target size={13} />
      </div>
    )
  }

  return (
    <div
      className="mx-3 mt-2 mb-1 p-2.5 rounded-lg"
      style={{ background: 'var(--sidebar-control-bg)', border: '1px solid var(--sidebar-border)' }}
      title={`${GOAL_METRIC_LABELS[primary.metric]} — ${formatGoalValue(primary.metric, progress.current)} / ${formatGoalValue(primary.metric, primary.targetValue)}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Target size={11} style={{ color }} />
          <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: 'var(--sidebar-muted)' }}>
            {primary.scope === 'team' ? 'Team goal' : 'My goal'}
          </span>
        </div>
        <span className="text-[10px] font-black tabular-nums" style={{ color }}>
          {Math.round(progress.pct)}%
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.15)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${barPct}%`, background: color }}
        />
      </div>
      <div className="mt-1 text-[10px] tabular-nums truncate" style={{ color: 'var(--sidebar-muted)' }}>
        {formatGoalValue(primary.metric, progress.current)} / {formatGoalValue(primary.metric, primary.targetValue)}
        {' · '}
        {GOAL_METRIC_LABELS[primary.metric].toLowerCase()}
      </div>
    </div>
  )
}
