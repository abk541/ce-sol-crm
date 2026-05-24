import { motion, AnimatePresence } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, GitBranch, FileText, BarChart3,
  FileCheck2, Bell, Users, Settings, ChevronLeft,
  ChevronRight, Database, TrendingUp, Trophy,
  LogOut, ChevronDown, ClipboardList, HeartPulse,
  ListChecks, History, Building2, DollarSign,
} from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { avatarColor } from '../../lib/utils'
import { cn } from '../../lib/utils'
import CompanyLogo from '../shared/CompanyLogo'

const NAV = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Business Dev',
    items: [
      { to: '/pipeline',          icon: GitBranch,     label: 'Contract Opportunities' },
      { to: '/proposals',         icon: FileText,      label: 'Assign Opportunities' },
      { to: '/bd-tracker',        icon: TrendingUp,    label: 'BD Tracker' },
      { to: '/tracker',           icon: ListChecks,    label: 'Deletion Requests' },
      { to: '/non-submissions',   icon: ClipboardList, label: 'Non-Submissions Report' },
      { to: '/past-performances', icon: History,       label: 'Past Performances' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/contracts',   icon: FileCheck2, label: 'Contract Admin' },
      { to: '/fresh-award', icon: Trophy,     label: 'Fresh Awards' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/finance-projections', icon: DollarSign, label: 'Finance Projections' },
    ],
  },
  {
    label: 'Databases',
    items: [
      { to: '/subk-database', icon: Building2, label: 'Subk Database' },
      { to: '/database',      icon: Database,  label: 'INT-Database' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/notifications', icon: Bell,       label: 'Notifications', badge: true },
      { to: '/admin',         icon: Users,      label: 'Admin' },
      { to: '/hr',            icon: HeartPulse, label: 'HR' },
      { to: '/settings',      icon: Settings,   label: 'Settings' },
    ],
  },
]

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, currentUser, logout, notifications } = useStore()
  const location = useLocation()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Overview: true, 'Business Dev': true, Operations: true, Finance: true, Databases: true, System: true,
  })
  const unread = notifications.filter(n => !n.read).length

  const toggleGroup = (label: string) =>
    setExpanded(p => ({ ...p, [label]: !p[label] }))

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 68 : 256 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex-shrink-0 flex flex-col h-screen sticky top-0 z-40 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #07131F 0%, #0A1D2B 54%, #102820 100%)',
        borderRight: '1px solid rgba(215,190,122,0.20)',
        boxShadow: '10px 0 34px rgba(7,19,31,0.18)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4"
           style={{ minHeight: 65, borderBottom: '1px solid rgba(215,190,122,0.16)' }}>
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
            'text-stone-300 hover:text-white transition-all',
            sidebarCollapsed ? 'mx-auto' : 'ml-auto'
          )}
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map(group => (
          <div key={group.label} className="mb-1">
            {!sidebarCollapsed && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex items-center gap-1.5 w-full px-2 py-1 mb-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400 hover:text-stone-200 transition-colors"
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
                  {group.items
                    .filter(item => currentUser?.role !== 'ASSOCIATE' || item.to !== '/proposals')
                    .map(item => {
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
                              isActive ? 'text-[#D7BE7A]' : 'text-stone-400'
                            )}
                          />
                          {!sidebarCollapsed && (
                            <span className="truncate text-[13px]">{item.label}</span>
                          )}
                          {'badge' in item && item.badge && unread > 0 && (
                            <span className={cn(
                              'flex-shrink-0 min-w-[18px] h-[18px] rounded-full text-[9px] font-bold flex items-center justify-center',
                              'bg-[#B8914E] text-white',
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
        ))}
      </nav>

      {/* User profile */}
      {currentUser && (
        <div
          className={cn(
            'p-3',
            sidebarCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2.5'
          )}
          style={{ borderTop: '1px solid rgba(215,190,122,0.16)' }}
        >
          <div className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br',
            avatarColor(currentUser.avatar)
          )}>
            {currentUser.avatar.slice(0, 2).toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-stone-100 truncate">{currentUser.name}</p>
              <p className="text-[10px] text-stone-400 font-medium truncate">{currentUser.role}</p>
            </div>
          )}
          <button
            onClick={logout}
            title="Logout"
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-stone-400 hover:text-white transition-all"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <LogOut size={13} />
          </button>
        </div>
      )}
    </motion.aside>
  )
}
