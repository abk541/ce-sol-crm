import { Bell, Search, ChevronRight } from 'lucide-react'
import { useLocation, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { avatarColor } from '../../lib/utils'
import CompanyLogo from '../shared/CompanyLogo'

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/pipeline':         'General Pipeline',
  '/proposals':        'Assign Opportunities',
  '/bd-tracker':       'BD Tracker',
  '/tracker':          'Tracker',
  '/non-submissions':  'Non-Submissions Report',
  '/contracts':        'Active Contracts',
  '/idiq':             'IDIQ',
  '/bpas':             'BPAs',
  '/notifications':    'Notifications',
  '/database':         'INT-Database',
  '/admin':            'Admin',
  '/hr':               'HR',
  '/settings':         'Settings',
  '/past-performances':'Past Performances',
  '/fresh-award':      'Fresh Award',
  '/subk-database':    'Subk Database',
}

export default function TopBar() {
  const { currentUser, notifications } = useStore()
  const location = useLocation()
  const label = ROUTE_LABELS[location.pathname] ?? 'NEXUS ERP'
  const unread = notifications.filter(n => !n.read).length

  return (
    <motion.header
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-30 flex items-center gap-4 px-6 h-16 flex-shrink-0"
      style={{
        background: 'rgba(251,252,248,0.86)',
        borderBottom: '1px solid rgba(31,53,66,0.12)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        boxShadow: '0 10px 28px rgba(7,19,31,0.06)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm select-none">
        <span className="flex items-center gap-1.5 text-slate-400 font-medium">
          <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: '#B8914E' }}>CES</span>
        </span>
        <ChevronRight size={12} className="text-stone-300" />
        <span className="font-semibold" style={{ color: '#10202A' }}>{label}</span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-sm ml-4">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9 py-2 text-xs"
            placeholder="Search opportunities, contracts… (⌘K)"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Notification bell */}
        <Link to="/notifications">
          <button className="relative w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 transition-all hover:text-[#0F4F59] hover:bg-[#E7F2EF]">
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white" style={{ background: '#B8914E' }} />
            )}
          </button>
        </Link>

        {/* Divider */}
        <div className="w-px h-6 mx-1" style={{ background: 'rgba(31,53,66,0.14)' }} />

        {/* User */}
        {currentUser && (
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-700 leading-none group-hover:text-[#0F4F59] transition-colors">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{currentUser.role}</p>
            </div>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br ${avatarColor(currentUser.avatar)} ring-2 ring-white shadow-sm`}>
              {currentUser.avatar.slice(0, 2)}
            </div>
          </div>
        )}
      </div>
    </motion.header>
  )
}
