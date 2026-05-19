import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Calendar,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  DollarSign,
  ExternalLink,
  FileBarChart,
  FileCheck2,
  Info,
  Search,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Trophy,
  UserPlus,
  UserRound,
  X,
  Zap,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { avatarColor, formatCurrency } from '../../lib/utils'
import { getAssignmentChain, ROLE_DISPLAY_LABELS } from '../../lib/team'
import type { Contract, Employee, NotifType, Notification as AppNotification, Opportunity } from '../../types'

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/pipeline':         'General Pipeline',
  '/proposals':        'Assign Opportunities',
  '/bd-tracker':       'BD Tracker',
  '/tracker':          'Deletion Requests',
  '/non-submissions':  'Non-Submissions Report',
  '/contracts':        'Contract Admin',
  '/fresh-award':      'Fresh Awards',
  '/notifications':    'Notifications',
  '/database':         'INT-Database',
  '/admin':            'Admin',
  '/hr':               'HR',
  '/settings':         'Settings',
  '/past-performances':'Past Performances',
  '/subk-database':    'Subk Database',
}

const TYPE_CONFIG: Record<NotifType, { icon: typeof Bell; color: string; label: string }> = {
  ASSIGNMENT:          { icon: UserPlus,       color: '#7DD3FC', label: 'Assignment' },
  DEADLINE:            { icon: Clock,          color: '#FBBF24', label: 'Deadline' },
  STATUS_CHANGE:       { icon: TrendingUp,     color: '#22D3EE', label: 'Status Change' },
  CONTRACT_CREATED:    { icon: FileCheck2,     color: '#34D399', label: 'Contract' },
  SYSTEM:              { icon: Info,           color: '#A78BFA', label: 'System' },
  MONTHLY_REPORT:      { icon: BarChart3,      color: '#FB923C', label: 'Monthly Report' },
  POP_EXPIRING:        { icon: Calendar,       color: '#F87171', label: 'PoP Expiring' },
  BILLING_DUE:         { icon: DollarSign,     color: '#FBBF24', label: 'Billing Due' },
  REPORT_REMINDER:     { icon: ClipboardList,  color: '#CBD5E1', label: 'Reminder' },
  CONTRACT_SUBMITTED:  { icon: Zap,            color: '#22D3EE', label: 'Submitted' },
  FOLLOW_UP:           { icon: Bell,           color: '#A78BFA', label: 'Follow-Up' },
  DELETION_REQUEST:    { icon: Trash2,         color: '#F87171', label: 'Deletion Request' },
  NON_SUB_REVIEW:      { icon: AlertTriangle,  color: '#FB923C', label: 'Non-Sub Review' },
  FRESH_AWARD:         { icon: Trophy,         color: '#34D399', label: 'Fresh Award' },
  GOVERNMENT_WARNING:  { icon: ShieldAlert,    color: '#F87171', label: 'Gov. Warning' },
  ERP_REPORT_DUE:      { icon: FileBarChart,   color: '#FB923C', label: 'ERP Report' },
  OPTION_YEAR_EXPIRING:{ icon: Calendar,       color: '#FBBF24', label: 'Option Year' },
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function resolveNotificationContext(
  notification: AppNotification,
  contracts: Contract[],
  opportunities: Opportunity[],
  employees: Employee[],
) {
  const relatedId = notification.relatedId
  let contract = relatedId
    ? contracts.find(c => c.id === relatedId || c.contractId === relatedId)
    : undefined

  let opportunity = relatedId
    ? opportunities.find(o => o.id === relatedId || o.solicitationId === relatedId)
    : undefined

  if (contract && !opportunity && contract.opportunityId) {
    opportunity = opportunities.find(o => o.id === contract!.opportunityId || o.solicitationId === contract!.contractId)
  }

  if (opportunity && !contract) {
    contract = contracts.find(c => c.opportunityId === opportunity!.id || c.contractId === opportunity!.solicitationId)
  }

  const assignedTo = contract?.assignedTo || opportunity?.assignedTo
  const chain = getAssignmentChain(employees, assignedTo)

  return { contract, opportunity, chain }
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className="max-w-[66%] text-right text-xs font-semibold text-slate-100 break-words">{value || '-'}</span>
    </div>
  )
}

export default function TopBar() {
  const {
    currentUser,
    notifications,
    markNotificationRead,
    markAllRead,
    contracts,
    opportunities,
    employees,
  } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [showNotifications, setShowNotifications] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null)

  const label = ROUTE_LABELS[location.pathname] ?? 'NEXUS ERP'
  const visibleNotifications = useMemo(() => notifications.filter(n => {
    if (n.targetRole && n.targetRole !== 'ALL' && n.targetRole !== currentUser?.role) return false
    return true
  }), [notifications, currentUser?.role])

  const unread = visibleNotifications.filter(n => !n.read).length
  const previewNotifications = visibleNotifications.slice(0, 8)
  const selectedContext = selectedNotification
    ? resolveNotificationContext(selectedNotification, contracts, opportunities, employees)
    : null

  const openRelatedRecord = () => {
    if (!selectedContext) return
    if (selectedContext.contract) navigate('/contracts')
    else if (selectedContext.opportunity) navigate('/pipeline')
    setSelectedNotification(null)
  }

  return (
    <motion.header
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-30 flex items-center gap-4 px-6 h-16 flex-shrink-0"
      style={{
        background: 'linear-gradient(90deg, rgba(7,19,31,0.96) 0%, rgba(10,29,43,0.94) 52%, rgba(16,40,32,0.96) 100%)',
        borderBottom: '1px solid rgba(215,190,122,0.18)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
      }}
    >
      <div className="flex items-center gap-2 text-sm select-none">
        <span className="flex items-center gap-1.5 text-slate-400 font-medium">
          <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: '#B8914E' }}>CES</span>
        </span>
        <ChevronRight size={12} className="text-stone-500" />
        <span className="font-semibold" style={{ color: '#F8FBF7' }}>{label}</span>
      </div>

      <div className="flex-1 max-w-sm ml-4">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9 py-2 text-xs"
            placeholder="Search opportunities, contracts... (Ctrl+K)"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(v => !v)}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center text-stone-300 transition-all hover:text-white hover:bg-white/10"
            aria-label="Open notifications"
          >
            <Bell size={16} />
            {unread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-black text-[#07131F] ring-2 ring-[#07131F] flex items-center justify-center"
                style={{ background: '#D7BE7A' }}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="absolute right-0 top-11 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl"
                  style={{
                    background: 'linear-gradient(180deg, rgba(16,40,32,0.98), rgba(7,19,31,0.98))',
                    borderColor: 'rgba(215,190,122,0.24)',
                    boxShadow: '0 24px 70px rgba(0,0,0,0.44)',
                  }}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-slate-100">Notifications</p>
                      <p className="text-[11px] text-slate-400">{unread ? `${unread} unread` : 'All caught up'}</p>
                    </div>
                    {visibleNotifications.some(n => !n.read) && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-white/10"
                      >
                        <CheckCheck size={12} /> Read all
                      </button>
                    )}
                  </div>

                  <div className="max-h-[26rem] overflow-y-auto p-2">
                    {previewNotifications.length === 0 && (
                      <div className="px-4 py-8 text-center">
                        <Bell size={20} className="mx-auto mb-2 text-slate-500" />
                        <p className="text-sm font-semibold text-slate-300">No notifications yet.</p>
                      </div>
                    )}

                    {previewNotifications.map(notification => {
                      const meta = TYPE_CONFIG[notification.type]
                      const Icon = meta.icon
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => {
                            markNotificationRead(notification.id)
                            setSelectedNotification(notification)
                            setShowNotifications(false)
                          }}
                          className="group w-full rounded-xl border border-transparent px-3 py-3 text-left transition-all hover:border-slate-200 hover:bg-white/5"
                        >
                          <div className="flex gap-3">
                            <div
                              className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border"
                              style={{ color: meta.color, background: 'rgba(255,255,255,0.055)', borderColor: 'rgba(215,190,122,0.18)' }}
                            >
                              <Icon size={15} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-black text-slate-100">{notification.title}</p>
                                {!notification.read && <span className="mt-1 h-2 w-2 rounded-full bg-[#D7BE7A]" />}
                              </div>
                              <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{notification.message}</p>
                              <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                <span style={{ color: meta.color }}>{meta.label}</span>
                                <span>{formatDateTime(notification.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifications(false)
                      navigate('/notifications')
                    }}
                    className="flex w-full items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/5"
                  >
                    Open notification center <ExternalLink size={12} />
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="w-px h-6 mx-1" style={{ background: 'rgba(215,190,122,0.18)' }} />

        {currentUser && (
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-stone-100 leading-none group-hover:text-[#D7BE7A] transition-colors">{currentUser.name}</p>
              <p className="text-[10px] text-stone-400 mt-0.5 font-medium">{currentUser.role}</p>
            </div>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br ${avatarColor(currentUser.avatar)} ring-2 ring-white shadow-sm`}>
              {currentUser.avatar.slice(0, 2)}
            </div>
          </div>
        )}
      </div>

      {createPortal(
      <AnimatePresence>
        {selectedNotification && selectedContext && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              style={{ background: 'rgba(2,8,14,0.72)', backdropFilter: 'blur(8px)' }}
              onClick={() => setSelectedNotification(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border"
              style={{
                background: 'linear-gradient(180deg, rgba(16,40,32,0.98), rgba(7,19,31,0.98))',
                borderColor: 'rgba(215,190,122,0.26)',
                boxShadow: '0 32px 90px rgba(0,0,0,0.50)',
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">
                    {TYPE_CONFIG[selectedNotification.type].label}
                  </div>
                  <h2 className="text-lg font-black text-slate-100">{selectedNotification.title}</h2>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(selectedNotification.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNotification(null)}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                <div className="rounded-xl border border-slate-100 bg-white/5 p-4">
                  <p className="text-sm leading-6 text-slate-200">{selectedNotification.message}</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <section className="rounded-xl border border-slate-100 bg-white/5 p-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Contract</p>
                    {selectedContext.contract ? (
                      <>
                        <DetailRow label="Title" value={selectedContext.contract.title} />
                        <DetailRow label="Contract ID" value={selectedContext.contract.contractId} />
                        <DetailRow label="Client" value={selectedContext.contract.client} />
                        <DetailRow label="Type" value={selectedContext.contract.type === 'S&D' ? 'Delivery' : selectedContext.contract.type} />
                        <DetailRow label="Status" value={selectedContext.contract.status.replace(/_/g, ' ')} />
                        <DetailRow label="Value" value={formatCurrency(selectedContext.contract.value || 0)} />
                      </>
                    ) : (
                      <p className="text-xs leading-5 text-slate-400">No active contract is linked to this notification yet.</p>
                    )}
                  </section>

                  <section className="rounded-xl border border-slate-100 bg-white/5 p-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Assigned Person</p>
                    {selectedContext.chain.assigned ? (
                      <>
                        <div className="mb-3 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/5 text-xs font-black text-slate-100">
                            {selectedContext.chain.assigned.avatar}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-100">{selectedContext.chain.assigned.name}</p>
                            <p className="text-xs text-slate-400">{ROLE_DISPLAY_LABELS[selectedContext.chain.assigned.role]}</p>
                          </div>
                        </div>
                        <DetailRow label="Email" value={selectedContext.chain.assigned.email} />
                        <DetailRow label="Manager" value={selectedContext.chain.manager?.name} />
                        <DetailRow label="Team Lead" value={selectedContext.chain.teamLead?.name} />
                        <DetailRow label="Associate" value={selectedContext.chain.associate?.name} />
                      </>
                    ) : (
                      <div className="flex items-start gap-3 text-xs leading-5 text-slate-400">
                        <UserRound size={15} className="mt-0.5 flex-shrink-0 text-slate-500" />
                        <span>No person is assigned to the related record yet.</span>
                      </div>
                    )}
                  </section>
                </div>

                {selectedContext.opportunity && (
                  <section className="mt-4 rounded-xl border border-slate-100 bg-white/5 p-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Opportunity</p>
                    <div className="grid gap-x-6 md:grid-cols-2">
                      <DetailRow label="Solicitation" value={selectedContext.opportunity.solicitation} />
                      <DetailRow label="ID" value={selectedContext.opportunity.solicitationId} />
                      <DetailRow label="Agency" value={selectedContext.opportunity.client} />
                      <DetailRow label="Due Date" value={selectedContext.opportunity.dueDate} />
                    </div>
                  </section>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
                <button type="button" onClick={() => setSelectedNotification(null)} className="btn-secondary text-xs">
                  Close
                </button>
                {(selectedContext.contract || selectedContext.opportunity) && (
                  <button type="button" onClick={openRelatedRecord} className="btn-primary text-xs">
                    Open Related Record <ExternalLink size={12} />
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </motion.header>
  )
}
