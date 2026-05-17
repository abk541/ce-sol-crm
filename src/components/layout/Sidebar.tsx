import { motion, AnimatePresence } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, GitBranch, FileText, BarChart3,
  FileCheck2, Bell, Users, Settings, ChevronLeft,
  ChevronRight, Shield, Database, TrendingUp, Briefcase,
  LogOut, ChevronDown, ClipboardList, HeartPulse,
  ListChecks, Trophy, History, Building2, Award,
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
      { to: '/proposals',         icon: FileText,      label: 'Assigned Opportunities' },
      { to: '/bd-tracker',        icon: TrendingUp,    label: 'BD Tracker' },
      { to: '/tracker',           icon: ListChecks,    label: 'Tracker' },
      { to: '/non-submissions',   icon: ClipboardList, label: 'Non-Submissions' },
      { to: '/past-performances', icon: History,       label: 'Past Performances' },
      { to: '/fresh-award',       icon: Trophy,        label: 'Fresh Award' },
    ],
  },
  {
    label: 'Contract Admin',
    items: [
      { to: '/contracts', icon: FileCheck2, label: 'Active Contracts' },
      { to: '/idiq',      icon: Briefcase,  label: 'IDIQ' },
      { to: '/bpas',      icon: Shield,     label: 'BPAs' },
    ],
  },
  {
    label: 'Operations',
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
    Overview: true, 'Business Dev': true, 'Contract Admin': true, Operations: true, System: true,
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
        background: '#FFFFFF',
        borderRight: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-black/[0.07]"
           style={{ minHeight: 65 }}>
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
            'text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all',
            sidebarCollapsed ? 'mx-auto' : 'ml-auto'
          )}
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
                className="flex items-center gap-1.5 w-full px-2 py-1 mb-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 hover:text-slate-600 transition-colors"
              >
                {group.label}
                <ChevronDown
                  size={10}
                  className={cn('ml-auto transition-transform', !expanded[group.label] && '-rotate-90')}
                />
              </button>
            )}
            {sidebarCollapsed && (
              <div className="my-2 mx-2 border-t border-slate-100" />
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
                  {group.items.map(item => {
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
                              isActive ? 'text-indigo-600' : 'text-slate-400'
                            )}
                          />
                          {!sidebarCollapsed && (
                            <span className="truncate text-[13px]">{item.label}</span>
                          )}
                          {'badge' in item && item.badge && unread > 0 && (
                            <span className={cn(
                              'flex-shrink-0 min-w-[18px] h-[18px] rounded-full text-[9px] font-bold flex items-center justify-center',
                              'bg-indigo-500 text-white',
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
            'border-t border-black/[0.07] p-3',
            sidebarCollapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2.5'
          )}
        >
          <div className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br',
            avatarColor(currentUser.avatar)
          )}>
            {currentUser.avatar.slice(0, 2).toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-700 truncate">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 font-medium truncate">{currentUser.role}</p>
            </div>
          )}
          <button
            onClick={logout}
            title="Logout"
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
          >
            <LogOut size={13} />
          </button>
        </div>
      )}
    </motion.aside>
  )
}
