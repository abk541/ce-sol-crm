import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell, CheckCheck, AlertTriangle, UserPlus, FileCheck2,
  Info, Clock, BarChart3, Zap, DollarSign, ClipboardList,
  Trash2, TrendingUp, Calendar, Trophy, ShieldAlert, FileBarChart,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { NotifType } from '../types'

const TYPE_CONFIG: Record<NotifType, { icon: typeof Bell; color: string; bg: string; label: string }> = {
  ASSIGNMENT:         { icon: UserPlus,       color: '#6366F1', bg: '#EEF2FF', label: 'Assignment' },
  DEADLINE:           { icon: Clock,          color: '#F59E0B', bg: '#FFFBEB', label: 'Deadline' },
  STATUS_CHANGE:      { icon: TrendingUp,     color: '#06B6D4', bg: '#ECFEFF', label: 'Status Change' },
  CONTRACT_CREATED:   { icon: FileCheck2,     color: '#22C55E', bg: '#ECFDF5', label: 'Contract' },
  SYSTEM:             { icon: Info,           color: '#8B5CF6', bg: '#F5F3FF', label: 'System' },
  MONTHLY_REPORT:     { icon: BarChart3,      color: '#F97316', bg: '#FFF7ED', label: 'Monthly Report' },
  POP_EXPIRING:       { icon: Calendar,       color: '#EF4444', bg: '#FFF1F2', label: 'PoP Expiring' },
  BILLING_DUE:        { icon: DollarSign,     color: '#F59E0B', bg: '#FFFBEB', label: 'Billing Due' },
  REPORT_REMINDER:    { icon: ClipboardList,  color: '#64748B', bg: '#F8FAFC', label: 'Reminder' },
  CONTRACT_SUBMITTED: { icon: Zap,            color: '#06B6D4', bg: '#ECFEFF', label: 'Submitted' },
  FOLLOW_UP:          { icon: Bell,           color: '#8B5CF6', bg: '#F5F3FF', label: 'Follow-Up' },
  DELETION_REQUEST:   { icon: Trash2,         color: '#EF4444', bg: '#FFF1F2', label: 'Deletion Req' },
  NON_SUB_REVIEW:     { icon: AlertTriangle,  color: '#F97316', bg: '#FFF7ED', label: 'Non-Sub Review' },
  FRESH_AWARD:        { icon: Trophy,         color: '#10B981', bg: '#ECFDF5', label: 'Fresh Award' },
  GOVERNMENT_WARNING: { icon: ShieldAlert,    color: '#EF4444', bg: '#FFF1F2', label: 'Gov. Warning' },
  ERP_REPORT_DUE:     { icon: FileBarChart,   color: '#F97316', bg: '#FFF7ED', label: 'ERP Report' },
  OPTION_YEAR_EXPIRING:{ icon: Calendar,      color: '#F59E0B', bg: '#FFFBEB', label: 'Option Year' },
}

const FILTER_GROUPS = [
  { id: 'all',           label: 'All' },
  { id: 'unread',        label: 'Unread' },
  {
    id: 'erp_reports',
    label: 'Monthly Reports',
    types: ['MONTHLY_REPORT', 'ERP_REPORT_DUE'],
  },
  {
    id: 'deadlines',
    label: 'Deadlines',
    types: ['DEADLINE', 'POP_EXPIRING', 'OPTION_YEAR_EXPIRING'],
  },
  {
    id: 'contract_admin',
    label: 'Contract Admin',
    types: ['FOLLOW_UP', 'BILLING_DUE', 'GOVERNMENT_WARNING', 'CONTRACT_CREATED'],
  },
  {
    id: 'reminders',
    label: 'Reminders',
    types: ['REPORT_REMINDER', 'NON_SUB_REVIEW'],
  },
  {
    id: 'submissions',
    label: 'Submissions',
    types: ['CONTRACT_SUBMITTED', 'ASSIGNMENT', 'FRESH_AWARD', 'STATUS_CHANGE'],
  },
  {
    id: 'system',
    label: 'System',
    types: ['SYSTEM', 'DELETION_REQUEST'],
  },
] as const

export default function NotificationsPage() {
  const { notifications, markNotificationRead, markAllRead, currentUser } = useStore()
  const [filter, setFilter] = useState<string>('all')

  const visible = notifications.filter(n => {
    if (n.targetRole && n.targetRole !== 'ALL' && n.targetRole !== currentUser?.role) return false
    if (filter === 'unread') return !n.read
    const group = FILTER_GROUPS.find(g => g.id === filter)
    if (group && 'types' in group) return (group.types as readonly string[]).includes(n.type)
    return true
  })

  const unread = visible.filter(n => !n.read).length

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES · NOTIFICATIONS</p>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <Bell size={20} className="text-indigo-500" /> Notifications
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        {notifications.some(n => !n.read) && (
          <button onClick={markAllRead} className="btn-secondary text-xs gap-1.5">
            <CheckCheck size={12} /> Mark all as read
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5 flex-wrap border border-slate-200">
        {FILTER_GROUPS.map(g => {
          const cnt = notifications.filter(n => {
            if (n.targetRole && n.targetRole !== 'ALL' && n.targetRole !== currentUser?.role) return false
            if (g.id === 'unread') return !n.read
            if ('types' in g) return (g.types as readonly string[]).includes(n.type)
            return true
          }).length
          return (
            <button key={g.id} onClick={() => setFilter(g.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filter === g.id
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {g.label}
              {cnt > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  filter === g.id ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {cnt}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Notification list */}
      <div className="max-w-2xl space-y-2">
        {visible.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400 text-sm">
            No notifications in this category
          </div>
        )}
        {visible.map((n, i) => {
          const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.SYSTEM
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => markNotificationRead(n.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-all border ${
                n.read
                  ? 'bg-white border-slate-100 opacity-60 hover:opacity-80'
                  : 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
              }`}
              style={!n.read ? { borderLeftWidth: 3, borderLeftColor: cfg.color } : {}}
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: cfg.bg, border: `1px solid ${cfg.color}20` }}>
                <cfg.icon size={15} style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </span>
                  {!n.read && (
                    <span className="ml-auto w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: cfg.color }} />
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {new Date(n.createdAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
