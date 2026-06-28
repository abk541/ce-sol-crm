import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, Target, Send, FileCheck2,
  Clock, AlertTriangle, Flame, Trophy, Activity,
  TrendingUp, TrendingDown, BarChart2, Percent,
  X, ExternalLink, ChevronRight, Users, Zap,
  MoreHorizontal, Building2, CheckCircle2,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, BarChart, Bar, Legend,
  RadialBarChart, RadialBar, LineChart, Line, ComposedChart,
} from 'recharts'
import { useStore } from '../store/useStore'
import AnimatedNumber from '../components/shared/AnimatedNumber'
import PeriodFilter, { type Period, filterByPeriod } from '../components/shared/PeriodFilter'
import TeamStatisticsPanel from '../components/shared/TeamStatisticsPanel'
import { formatCurrency, avatarColor } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { getAssignmentChain, isOpsAgent } from '../lib/team'
import { hasAnyPermission, hasPermission, ROLE_LABELS } from '../lib/permissions'
import { chartColorsForTheme, useAppearance } from '../lib/appearance'
import { NAICS_CODES } from '../data/naics'
import type { BDSubmission, Contract, Employee, EmployeeTeam, FreshAward, Goal, HierarchyRole, NonSubmissionReport, Opportunity, User } from '../types'
import {
  GOAL_METRIC_LABELS,
  computeGoalProgress,
  currentMonthKey,
  formatGoalValue,
  goalsForEmployee,
} from '../lib/goals'

const stagger = { animate: { transition: { staggerChildren: 0.05 } } }
const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } },
}

function getTier(score: number) {
  if (score >= 85) return { label: 'ELITE',    color: '#6366F1', glow: 'rgba(99,102,241,0.2)',  bg: 'rgba(99,102,241,0.08)',  msg: 'Outstanding performance. Maintain momentum.' }
  if (score >= 70) return { label: 'STRONG',   color: '#22C55E', glow: 'rgba(34,197,94,0.2)',   bg: 'rgba(34,197,94,0.08)',   msg: 'Strong output. Push for elite standing.' }
  if (score >= 55) return { label: 'AVERAGE',  color: '#F59E0B', glow: 'rgba(245,158,11,0.2)',  bg: 'rgba(245,158,11,0.08)',  msg: 'Below target. Increase submission velocity.' }
  if (score >= 40) return { label: 'AT RISK',  color: '#F97316', glow: 'rgba(249,115,22,0.25)', bg: 'rgba(249,115,22,0.08)',  msg: 'Performance at risk. Immediate action required.' }
  return               { label: 'CRITICAL', color: '#EF4444', glow: 'rgba(239,68,68,0.28)',  bg: 'rgba(239,68,68,0.08)',   msg: 'Performance is below target. Please review with your manager.' }
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#6366F1', SUBMITTED: '#06B6D4', WON: '#22C55E', LOST: '#EF4444',
  DISCUSSION: '#F59E0B', NOT_SUBMITTED: '#94A3B8', DROPPED: '#F97316',
  CANCELED: '#CBD5E1', NEW_ASSIGNMENT: '#8B5CF6', TERMINATED: '#DC2626',
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl px-3 py-2.5 shadow-lg border border-slate-200 text-xs pointer-events-none">
      <p className="text-slate-500 font-semibold mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill || p.stroke || p.color }} />
          <span className="text-slate-600">{p.name || p.dataKey}:</span>
          <span className="font-bold text-slate-900">
            {p.dataKey === 'revenue' ? formatCurrency(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const PieTip = ({ active, payload }: any) => {
  if (!active || !payload?.[0]) return null
  const d = payload[0]
  const total = d.payload?.payload?.total ?? 1
  const pct = Math.round((d.value / total) * 100)
  return (
    <div className="bg-white rounded-xl px-3 py-2 shadow-lg border border-slate-200 text-xs pointer-events-none">
      <p className="font-bold text-slate-800">{d.name}</p>
      <p className="text-slate-500">{d.value} opps <span className="text-slate-700 font-semibold">({pct}%)</span></p>
    </div>
  )
}

// Score Gauge
function ScoreGauge({ score }: { score: number }) {
  const R = 72
  const C = 2 * Math.PI * R
  const track = C * 0.75
  const fill = track * (score / 100)
  const t = getTier(score)
  return (
    <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
      <div className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${t.glow} 0%, transparent 65%)`, filter: 'blur(20px)' }} />
      <svg width={180} height={180} viewBox="0 0 180 180" className="relative z-10">
        {score < 55 && (
          <motion.circle cx={90} cy={90} r={84} fill="none" stroke={t.color} strokeWidth={0.7}
            animate={{ opacity: [0.1, 0.45, 0.1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <circle cx={90} cy={90} r={R} fill="none" stroke="rgba(99,102,241,0.08)"
          strokeWidth={12} strokeLinecap="round"
          strokeDasharray={`${track} ${C - track}`}
          transform="rotate(-135 90 90)"
        />
        <motion.circle cx={90} cy={90} r={R} fill="none" stroke={t.color}
          strokeWidth={12} strokeLinecap="round"
          transform="rotate(-135 90 90)"
          style={{ filter: `drop-shadow(0 0 8px ${t.color})` }}
          initial={{ strokeDasharray: `0 ${C}` }}
          animate={{ strokeDasharray: `${fill} ${C - fill}` }}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
        />
      </svg>
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
        <motion.div className="text-4xl font-black leading-none" style={{ color: t.color }}
          initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: 'spring', stiffness: 220, damping: 14 }}>
          <AnimatedNumber value={score} duration={1800} />
        </motion.div>
        <motion.div className="text-[10px] font-black tracking-[0.18em] mt-1" style={{ color: t.color }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
          {t.label}
        </motion.div>
        <div className="text-[9px] text-slate-400 tracking-widest mt-0.5">PERFORMANCE</div>
      </div>
    </div>
  )
}

// KPI Detail Drawer
interface KpiDetail { key: string; label: string; color: string }

function KpiDetailDrawer({
  kpi, opportunities, nonSubReports, deletionRequests, onClose,
}: {
  kpi: KpiDetail
  opportunities: any[]
  nonSubReports: any[]
  deletionRequests: any[]
  onClose: () => void
}) {
  const navigate = useNavigate()

  const content = useMemo(() => {
    if (kpi.key === 'revenue') {
      const revenueByMonth = Array.from({ length: 6 }, (_, offset) => {
        const d = new Date()
        d.setMonth(d.getMonth() - (5 - offset))
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const month = d.toLocaleDateString('en-US', { month: 'short' })
        const revenue = opportunities
          .filter(o => ['SUBMITTED', 'WON'].includes(o.status) && ((o.submittedAt || o.dueDate || '').startsWith(key)))
          .reduce((sum, o) => sum + Number(o.contractAmount || o.value || 0), 0)
        return { month, revenue }
      })
      const maxRevenue = Math.max(1, ...revenueByMonth.map(d => d.revenue))
      return (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Revenue breakdown by month (current period)</p>
          <div className="space-y-2">
            {revenueByMonth.map(d => (
              <div key={d.month} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-8">{d.month}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ background: kpi.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.revenue / maxRevenue) * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-700 w-20 text-right">{formatCurrency(d.revenue)}</span>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-600 mb-2">Top contracts by value</p>
            {opportunities.filter(o => o.status === 'WON' || o.status === 'SUBMITTED').slice(0, 5).map(o => (
              <div key={o.id} className="flex items-center gap-2 py-2 border-b border-slate-50 cursor-pointer hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors"
                onClick={() => { navigate('/pipeline'); onClose() }}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: kpi.color }} />
                <p className="text-xs text-slate-700 flex-1 truncate">{o.solicitation}</p>
                <span className="text-xs font-bold text-emerald-600">{formatCurrency(o.contractAmount || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    if (kpi.key === 'pipeline') {
      const active = opportunities.filter(o => o.status === 'ACTIVE')
      return (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{active.length} active opportunities</p>
          {active.map(o => (
            <div key={o.id}
              className="p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all cursor-pointer"
              onClick={() => { navigate('/pipeline'); onClose() }}>
              <p className="text-xs font-semibold text-slate-800 truncate">{o.solicitation}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500">{o.bds}</span>
                <span className="text-[10px] text-slate-400">-</span>
                <span className="text-[10px] text-slate-500">{o.dueDate}</span>
                <span className="ml-auto text-[10px] font-bold text-emerald-600">{formatCurrency(o.contractAmount || 0)}</span>
              </div>
            </div>
          ))}
        </div>
      )
    }
    if (kpi.key === 'submissions') {
      const byAgent = Object.values(opportunities.filter(o => ['SUBMITTED', 'WON', 'LOST', 'DROPPED', 'CANCELED'].includes(o.status)).reduce((acc: Record<string, any>, o) => {
        const key = o.supportAgent || o.bds || o.bdm || 'Unassigned'
        acc[key] ??= { username: key, name: key, avatar: key.slice(0, 2).toUpperCase(), submissions: 0 }
        acc[key].submissions += 1
        return acc
      }, {})).sort((a: any, b: any) => b.submissions - a.submissions)
      const maxSubmissions = Math.max(1, ...(byAgent as any[]).map(a => a.submissions))
      return (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Submissions breakdown by associate</p>
          {(byAgent as any[]).map((a, i) => (
            <div key={a.username} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
              <span className="text-xs text-slate-400 w-4">#{i + 1}</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black text-white bg-gradient-to-br ${avatarColor(a.avatar)}`}>
                {a.avatar.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{a.name}</p>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <motion.div className="h-full rounded-full" style={{ background: kpi.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(a.submissions / maxSubmissions) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                  />
                </div>
              </div>
              <span className="text-sm font-black text-slate-800">{a.submissions}</span>
            </div>
          ))}
        </div>
      )
    }
    if (kpi.key === 'winrate') {
      const byAgent = Object.values(opportunities.filter(o => ['SUBMITTED', 'WON', 'LOST', 'DROPPED', 'CANCELED'].includes(o.status)).reduce((acc: Record<string, any>, o) => {
        const key = o.supportAgent || o.bds || o.bdm || 'Unassigned'
        acc[key] ??= { username: key, name: key, avatar: key.slice(0, 2).toUpperCase(), submissions: 0, wins: 0, losses: 0, nonSubs: 0, winRate: 0 }
        acc[key].submissions += 1
        if (o.status === 'WON') acc[key].wins += 1
        if (['LOST', 'DROPPED', 'CANCELED'].includes(o.status)) acc[key].losses += 1
        if (o.status === 'NOT_SUBMITTED') acc[key].nonSubs += 1
        acc[key].winRate = acc[key].submissions ? Math.round((acc[key].wins / acc[key].submissions) * 100) : 0
        return acc
      }, {})).sort((a: any, b: any) => b.winRate - a.winRate)
      return (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Win/loss breakdown by associate</p>
          {(byAgent as any[]).map((a) => (
            <div key={a.username} className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black text-white bg-gradient-to-br ${avatarColor(a.avatar)}`}>
                  {a.avatar.slice(0, 2)}
                </div>
                <span className="text-xs font-semibold text-slate-700">{a.name}</span>
                <span className="ml-auto text-sm font-black" style={{ color: a.winRate >= 50 ? '#22C55E' : a.winRate >= 30 ? '#F59E0B' : '#EF4444' }}>
                  {a.winRate}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="bg-emerald-50 rounded-lg py-1"><p className="font-black text-emerald-700">{a.wins}</p><p className="text-emerald-600">Wins</p></div>
                <div className="bg-red-50 rounded-lg py-1"><p className="font-black text-red-600">{a.losses}</p><p className="text-red-500">Losses</p></div>
                <div className="bg-slate-50 rounded-lg py-1"><p className="font-black text-slate-700">{a.nonSubs}</p><p className="text-slate-500">Non-Sub</p></div>
              </div>
            </div>
          ))}
        </div>
      )
    }
    if (kpi.key === 'won') {
      const won = opportunities.filter(o => o.status === 'WON')
      return (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{won.length} won contracts</p>
          {won.map(o => (
            <div key={o.id}
              className="p-3 rounded-xl border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
              onClick={() => { navigate('/tracker'); onClose() }}>
              <p className="text-xs font-semibold text-slate-800 truncate">{o.solicitation}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500">{o.client}</span>
                <span className="ml-auto text-xs font-bold text-emerald-700">{formatCurrency(o.contractAmount || 0)}</span>
              </div>
            </div>
          ))}
          {won.length === 0 && <p className="text-center py-8 text-slate-400 text-sm">No won contracts in this period.</p>}
        </div>
      )
    }
    if (kpi.key === 'reviews') {
      const pendingDels = deletionRequests.filter(r => r.status === 'PENDING')
      const pendingReports = nonSubReports.filter(r => r.status === 'PENDING')
      return (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
              <Zap size={11} className="text-red-500" /> Deletion Requests ({pendingDels.length})
            </p>
            {pendingDels.map(d => (
              <div key={d.id} className="p-3 rounded-xl border border-red-100 bg-red-50 mb-2 cursor-pointer hover:bg-red-100 transition-colors"
                onClick={() => { navigate('/pipeline'); onClose() }}>
                <p className="text-xs font-semibold text-red-800 truncate">{d.reason}</p>
                <p className="text-[10px] text-red-600 mt-0.5">Requested by {d.requestedBy} - {new Date(d.requestedAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-amber-500" /> Non-Sub Reports ({pendingReports.length})
            </p>
            {pendingReports.map(r => (
              <div key={r.id} className="p-3 rounded-xl border border-amber-100 bg-amber-50 mb-2 cursor-pointer hover:bg-amber-100 transition-colors"
                onClick={() => { navigate('/non-submissions'); onClose() }}>
                <p className="text-xs font-semibold text-amber-800 truncate">{r.reason}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Submitted by {r.agentUsername} - {new Date(r.submittedAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
          {pendingDels.length === 0 && pendingReports.length === 0 && (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                <Trophy size={18} className="text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-slate-700">All clear</p>
              <p className="text-xs text-slate-400">No pending reviews</p>
            </div>
          )}
        </div>
      )
    }
    return null
  }, [kpi, opportunities, nonSubReports, deletionRequests])

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      className="fixed right-0 top-0 h-screen w-full max-w-sm z-50 flex flex-col"
      style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-default)', boxShadow: '0 0 80px rgba(0,0,0,0.15)' }}
    >
      <div className="flex-shrink-0 flex items-center gap-3 p-5" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-default)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: kpi.color + '15' }}>
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: kpi.color }} />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-black text-slate-800">{kpi.label}</h2>
          <p className="text-[10px] text-slate-400">Detailed breakdown</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {content}
      </div>
    </motion.div>
  )
}

const GOAL_WIDGET_STATUS: Record<'achieved' | 'ahead' | 'on-track' | 'behind', { label: string; bg: string; fg: string; bar: string }> = {
  achieved: { label: 'Achieved',     bg: 'rgba(16,185,129,0.10)', fg: '#10B981', bar: '#10B981' },
  ahead:    { label: 'Ahead',        bg: 'rgba(6,182,212,0.10)',  fg: '#06B6D4', bar: '#06B6D4' },
  'on-track':{ label: 'On track',    bg: 'rgba(245,158,11,0.10)', fg: '#F59E0B', bar: '#F59E0B' },
  behind:   { label: 'Behind',       bg: 'rgba(239,68,68,0.10)',  fg: '#EF4444', bar: '#EF4444' },
}

function MyGoalsWidget({
  goals,
  employees,
  opportunities,
  freshAwards,
  myEmployeeId,
}: {
  goals: Goal[]
  employees: Employee[]
  opportunities: Opportunity[]
  freshAwards: FreshAward[]
  myEmployeeId: string | undefined
}) {
  if (!goals.length) return null
  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate"
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-amber-500" />
          <h3 className="text-sm font-bold text-slate-800">My Goals</h3>
        </div>
        <span className="text-[10px] font-bold text-slate-400 tracking-wider">
          {goals.length} ACTIVE THIS MONTH
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {goals.map(g => {
          const progress = computeGoalProgress(g, opportunities, freshAwards, employees)
          const palette = GOAL_WIDGET_STATUS[progress.status]
          const barPct = Math.min(100, progress.pct)
          const isPersonal = g.scope === 'employee' && g.targetId === myEmployeeId
          return (
            <div
              key={g.id}
              className="rounded-xl border p-3"
              style={{ borderColor: 'rgba(148,163,184,0.20)', background: 'rgba(248,250,252,0.7)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-700 truncate">
                    {GOAL_METRIC_LABELS[g.metric]}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {isPersonal ? 'Personal' : 'Team goal'}
                  </p>
                </div>
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{ background: palette.bg, color: palette.fg }}
                >
                  {palette.label}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.15)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: palette.bar }}
                  initial={{ width: 0 }}
                  animate={{ width: `${barPct}%` }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-slate-500 tabular-nums">
                  {formatGoalValue(g.metric, progress.current)} / {formatGoalValue(g.metric, g.targetValue)}
                </span>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: palette.fg }}>
                  {Math.round(progress.pct)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

// Agent Dashboard
function AgentDashboard() {
  const { currentUser, opportunities, nonSubReports, bdSubmissions, employees, goals, freshAwards } = useStore()
  const navigate = useNavigate()

  const monthKey = currentMonthKey()
  const myEmployee = useMemo(
    () => employees.find(e => e.email === currentUser?.email || e.name === currentUser?.name),
    [employees, currentUser],
  )
  const myGoals = useMemo(
    () => goalsForEmployee(goals, myEmployee?.id, employees, monthKey),
    [goals, myEmployee, employees, monthKey],
  )

  const myOpps = useMemo(() => {
    const me = employees.find(e => e.email === currentUser?.email || e.name === currentUser?.name)
    const un = (currentUser?.username ?? '').toLowerCase()
    const fn = (currentUser?.name ?? '').toLowerCase()
    return opportunities.filter(o => {
      if (o.isDeleted) return false
      const b = `${o.bds} ${o.bdm} ${o.supportAgent}`.toLowerCase()
      return o.assignedTo === me?.id || b.includes(un) || b.includes(fn)
    })
  }, [opportunities, currentUser, employees])

  const activeOpps = myOpps.filter(o => o.status === 'ACTIVE')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  const overdueCount = activeOpps.filter(o => new Date(o.dueDate) < new Date()).length
  const pendingReport = nonSubReports.find(r => r.agentUsername === currentUser?.username && r.status === 'PENDING')
  const mySubmissionRows = bdSubmissions.filter(s => {
    const q = `${s.supportAgent || ''} ${s.bdm} ${s.bds}`.toLowerCase()
    return q.includes((currentUser?.name || '').toLowerCase()) || q.includes((currentUser?.username || '').toLowerCase())
  })
  const myStats = {
    username: currentUser?.username ?? '',
    name: currentUser?.name ?? '',
    avatar: currentUser?.avatar ?? '',
    role: currentUser?.role ?? 'ASSOCIATE',
    submissions: mySubmissionRows.length,
    wins: mySubmissionRows.filter(s => s.status === 'AWARDED').length,
    losses: mySubmissionRows.filter(s => ['LOST', 'DROPPED', 'CANCELED', 'NOT_SUBMITTED'].includes(s.status)).length,
    nonSubs: nonSubReports.filter(r => r.agentUsername === currentUser?.username).length,
    active: activeOpps.length,
    winRate: mySubmissionRows.length ? Math.round((mySubmissionRows.filter(s => s.status === 'AWARDED').length / mySubmissionRows.length) * 100) : 0,
    submissionRate: myOpps.length ? Math.round((mySubmissionRows.length / myOpps.length) * 100) : 0,
    score: Math.min(100, Math.round((mySubmissionRows.length * 10) + (mySubmissionRows.filter(s => s.status === 'AWARDED').length * 18) - (nonSubReports.filter(r => r.agentUsername === currentUser?.username).length * 6))),
    rank: 1,
    goal: myGoals.find(g => g.scope === 'employee' && g.targetId === myEmployee?.id && g.metric === 'submissions_count')?.targetValue ?? 5,
    streak: mySubmissionRows.length ? 1 : 0,
  }
  const tier = getTier(myStats.score)
  const goalPct = Math.min(100, myStats.goal ? (myStats.submissions / myStats.goal) * 100 : 0)
  const daysLeft = 31 - new Date().getDate()

  const personalChart = Array.from({ length: 6 }, (_, offset) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - offset))
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return {
      name: month,
      s: mySubmissionRows.filter(row => (row.submittedOn || '').startsWith(key)).length,
    }
  })

  const RANK_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32', '#6366F1', '#475569', '#475569', '#475569']

  return (
    <div className="p-6 space-y-4 page-enter">
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES - PERFORMANCE COMMAND</p>
            <h1 className="text-2xl font-black text-slate-900">
              {currentUser?.name.split(' ')[0]}'s Command Center
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">{currentUser ? ROLE_LABELS[currentUser.role] : 'User'} - current workload and submission activity</p>
          </div>
          <motion.div
            className="px-3 py-1.5 rounded-lg text-xs font-black tracking-wider"
            style={{ background: tier.bg, border: `1px solid ${tier.color}35`, color: tier.color }}
            animate={myStats.score < 55 ? { opacity: [1, 0.6, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            Status: {tier.label}
          </motion.div>
        </div>
        <motion.div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: tier.bg, border: `1px solid ${tier.color}20` }}>
          <AlertTriangle size={13} style={{ color: tier.color, flexShrink: 0 }} />
          <p className="text-xs font-medium" style={{ color: tier.color }}>
            {myStats.score > 0 ? tier.msg : 'Welcome. Your performance metrics will appear once you start submitting.'}
          </p>
        </motion.div>
      </motion.div>

      <motion.div variants={stagger} initial="initial" animate="animate"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gauge card */}
        <motion.div variants={fadeUp}
          className="rounded-xl p-6 flex flex-col items-center justify-center gap-4"
          style={{
            background: 'linear-gradient(135deg,#0F172A 0%,#1E293B 100%)',
            border: `1px solid ${tier.color}20`,
            boxShadow: `0 0 48px ${tier.glow}`,
          }}>
          <ScoreGauge score={myStats.score} />
          <div className="w-full">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] text-slate-500 font-medium tracking-wider">MONTHLY GOAL</span>
              <span className="text-[10px] font-bold" style={{ color: tier.color }}>
                {myStats.submissions}/{myStats.goal} submissions
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div className="h-full rounded-full"
                style={{ background: tier.color, boxShadow: `0 0 6px ${tier.color}` }}
                initial={{ width: 0 }}
                animate={{ width: `${goalPct}%` }}
                transition={{ delay: 1.0, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <p className="text-[10px] text-slate-600 mt-1">{daysLeft} days remaining</p>
          </div>
        </motion.div>

        {/* Rank + streak */}
        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.15em]">OPERATOR STATUS</p>
          <div className="flex items-center gap-4">
            <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}>
              <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center"
                style={{
                  background: `${RANK_COLORS[myStats.rank - 1] || '#CBD5E1'}12`,
                  border: `1.5px solid ${RANK_COLORS[myStats.rank - 1] || '#CBD5E1'}40`,
                }}>
                <span className="text-2xl font-black" style={{ color: RANK_COLORS[myStats.rank - 1] || '#94A3B8' }}>
                  {myStats.rank > 0 ? `#${myStats.rank}` : '-'}
                </span>
                {myStats.rank > 0 && (
                  <span className="text-[9px] font-bold" style={{ color: RANK_COLORS[myStats.rank - 1] || '#94A3B8' }}>
                    RANK {myStats.rank}
                  </span>
                )}
              </div>
            </motion.div>
            <div>
              <p className="text-slate-800 font-bold text-sm">{currentUser?.name}</p>
              <p className="text-slate-500 text-xs">{currentUser ? ROLE_LABELS[currentUser.role] : myStats.role}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <motion.div animate={myStats.streak > 5 ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 1.2, repeat: Infinity }}>
                  <Flame size={14} className="text-amber-500" />
                </motion.div>
                <span className="text-amber-500 font-black text-xl leading-none">
                  <AnimatedNumber value={myStats.streak} />
                </span>
                <span className="text-slate-500 text-[10px]">day streak</span>
              </div>
            </div>
          </div>
          <div className="space-y-2.5 pt-3 border-t border-slate-100">
            {[
              { label: 'Win Rate',        value: `${myStats.winRate}%`,        good: myStats.winRate >= 50, warn: myStats.winRate >= 30 },
              { label: 'Submission Rate', value: `${myStats.submissionRate}%`, good: myStats.submissionRate >= 60, warn: myStats.submissionRate >= 40 },
              { label: 'Total Wins',      value: myStats.wins.toString(),       good: true, warn: false },
              { label: 'Non-Submissions', value: myStats.nonSubs.toString(),    good: myStats.nonSubs <= 2, warn: myStats.nonSubs <= 5 },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{r.label}</span>
                <span className="text-xs font-bold" style={{ color: r.good ? '#22C55E' : r.warn ? '#F59E0B' : '#EF4444' }}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Intel grid */}
        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
          <p className="text-[10px] font-bold text-slate-400 tracking-[0.15em]">MISSION INTEL</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { label: 'ACTIVE',    value: myStats.active,      color: '#6366F1', icon: Target, nav: '/pipeline' },
              { label: 'SUBMITTED', value: myStats.submissions,  color: '#06B6D4', icon: Send,   nav: '/bd-tracker' },
              { label: 'WINS',      value: myStats.wins,         color: '#22C55E', icon: Trophy, nav: '/bd-tracker' },
              { label: 'NON-SUBS',  value: myStats.nonSubs,      color: myStats.nonSubs > 5 ? '#EF4444' : '#F97316', icon: AlertTriangle, nav: '/non-submissions' },
            ] as const).map(stat => (
              <motion.div key={stat.label}
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(stat.nav)}
                className="rounded-xl p-3 flex flex-col gap-1.5 cursor-pointer transition-all"
                style={{ background: `${stat.color}08`, border: `1px solid ${stat.color}18` }}>
                <stat.icon size={13} style={{ color: stat.color }} />
                <p className="text-2xl font-black text-slate-900 leading-none">
                  <AnimatedNumber value={stat.value} duration={1400} />
                </p>
                <p className="text-[9px] font-bold tracking-wider" style={{ color: stat.color }}>{stat.label}</p>
              </motion.div>
            ))}
          </div>
          {pendingReport && (
            <motion.div
              className="rounded-xl p-3 border border-amber-400/30 bg-amber-50 flex items-center gap-2 cursor-pointer"
              animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 2, repeat: Infinity }}
              onClick={() => navigate('/non-submissions')}>
              <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
              <p className="text-[11px] text-amber-700 font-medium flex-1">Non-submission report pending review</p>
              <ChevronRight size={12} className="text-amber-400" />
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      <MyGoalsWidget
        goals={myGoals}
        employees={employees}
        opportunities={opportunities}
        freshAwards={freshAwards}
        myEmployeeId={myEmployee?.id}
      />

      {/* Personal trend chart */}
      <motion.div variants={fadeUp} initial="initial" animate="animate"
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">My Submission Activity</h3>
            <p className="text-xs text-slate-500">Monthly submissions</p>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ color: tier.color, background: tier.bg }}>
            {myStats.submissions > 0 ? `${myStats.submissions} submissions recorded` : 'No submissions recorded yet'}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={personalChart} style={{ cursor: 'pointer' }}>
            <defs>
              <linearGradient id="agentGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tier.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={tier.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="s" name="Submissions" stroke={tier.color} strokeWidth={2}
              fill="url(#agentGrad)" dot={{ fill: tier.color, r: 3 }}
              activeDot={{ r: 5, fill: tier.color, cursor: 'pointer' }} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Active Assignments */}
      <motion.div variants={fadeUp} initial="initial" animate="animate"
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Activity size={14} className="text-indigo-500" />
            Active Assignments
            <span className="text-[10px] text-slate-400 font-normal">({activeOpps.length})</span>
          </h3>
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <motion.span
                className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-200 flex items-center gap-1"
                animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                <AlertTriangle size={9} /> {overdueCount} OVERDUE
              </motion.span>
            )}
            <button onClick={() => navigate('/pipeline')}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors">
              View all <ChevronRight size={11} />
            </button>
          </div>
        </div>
        {activeOpps.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">No active assignments</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {activeOpps.slice(0, 8).map((o, i) => {
              const isOverdue = new Date(o.dueDate) < new Date()
              const daysUntil = Math.ceil((new Date(o.dueDate).getTime() - Date.now()) / 86400000)
              return (
                <motion.div key={o.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 + i * 0.05 }}
                  whileHover={{ x: 3 }}
                  onClick={() => navigate('/pipeline')}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-all cursor-pointer"
                  style={isOverdue ? { borderLeft: '2px solid #EF4444' } : {}}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-500' : daysUntil <= 2 ? 'bg-amber-400' : 'bg-indigo-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{o.solicitation}</p>
                    <p className="text-[10px] text-slate-500">{o.solicitationId} - {o.type} - {o.client}</p>
                  </div>
                  <div className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    isOverdue ? 'text-red-600 bg-red-50 border border-red-200' :
                    daysUntil <= 2 ? 'text-amber-600 bg-amber-50 border border-amber-200' :
                    'text-slate-500 bg-slate-100'}`}>
                    {isOverdue ? `${Math.abs(daysUntil)}d OVERDUE` : daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : `${daysUntil}d left`}
                  </div>
                  <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

      <TeamStatisticsPanel />
    </div>
  )
}

type ExecutiveDashboardTab = 'bd' | 'team' | 'ops' | 'activity'

type TeamView =
  | { mode: 'teams' }
  | { mode: 'team'; managerId: string }
  | { mode: 'member'; employeeId: string }

const EXECUTIVE_TABS: Array<{ id: ExecutiveDashboardTab; label: string; icon: any; subtitle: string }> = [
  { id: 'bd', label: 'Business Development', icon: Target, subtitle: 'Pipeline, submissions, capture and agency return' },
  { id: 'team', label: 'Team Performance', icon: Users, subtitle: 'Associate output, conversion and active users' },
  { id: 'ops', label: 'Operations', icon: FileCheck2, subtitle: 'Awarded value, archive value and gross profit' },
  { id: 'activity', label: 'Live Activity', icon: Activity, subtitle: 'Only the latest live activities' },
]

const EXEC_PANEL_STYLE = {
  background: 'var(--exec-panel)',
  borderColor: 'var(--exec-border)',
  boxShadow: 'var(--exec-shadow)',
}

function numberValue(...values: Array<number | string | undefined | null>) {
  for (const value of values) {
    const next = Number(value)
    if (Number.isFinite(next) && next !== 0) return next
  }
  return 0
}

function pct(value: number, total: number) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

const NAICS_TITLE_BY_CODE = new Map(NAICS_CODES.map(item => [item.code, item.title]))

function naicsDisplay(code?: string) {
  const clean = (code || '').trim()
  if (!clean) return 'Unspecified'
  const title = NAICS_TITLE_BY_CODE.get(clean)
  return title ? `${clean} - ${title}` : clean
}

function monthKey(value?: string) {
  return (value || '').slice(0, 7)
}

function monthLabelFromKey(key: string) {
  const [year, month] = key.split('-').map(Number)
  if (!year || !month) return key || 'Unscheduled'
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' })
}

function lastMonths(count = 6) {
  return Array.from({ length: count }, (_, offset) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (count - 1 - offset))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { key, month: monthLabelFromKey(key) }
  })
}

function opportunityValue(opp?: Opportunity) {
  if (!opp) return 0
  return numberValue(opp.contractAmount, opp.value, opp.baseAmount, opp.monthlyPayment)
}

function submissionOpportunity(submission: BDSubmission, opportunities: Opportunity[]) {
  return opportunities.find(opp =>
    opp.solicitationId === submission.solicitationId ||
    opp.solicitation === submission.solicitation,
  )
}

function submissionValue(submission: BDSubmission, opportunities: Opportunity[]) {
  return numberValue(submission.value, opportunityValue(submissionOpportunity(submission, opportunities)))
}

function groupRows<T>(
  rows: T[],
  keyFor: (row: T) => string,
  valueFor: (row: T) => number = () => 1,
) {
  const map = new Map<string, { name: string; value: number; count: number }>()
  rows.forEach(row => {
    const name = keyFor(row) || 'Unspecified'
    const current = map.get(name) || { name, value: 0, count: 0 }
    current.value += valueFor(row)
    current.count += 1
    map.set(name, current)
  })
  return Array.from(map.values()).sort((a, b) => b.value - a.value || b.count - a.count)
}

function lockedSubkSpend(contract: Contract) {
  return (contract.lockedSubcontractors || []).reduce((sum, sub) => sum + numberValue(sub.paymentRate), 0)
}

function baseYearTotal(contract: Contract) {
  const lineTotal = (contract.lineItems || [])
    .filter(line => line.year === 'base')
    .reduce((sum, line) => sum + numberValue(line.amount, line.quantity * line.rate), 0)
  return lineTotal || numberValue(contract.baseAmount)
}

function grossProfitForContract(contract: Contract) {
  const contractTotal = numberValue(contract.value, contract.baseAmount, contract.monthlyPayment)
  const subkQuote = lockedSubkSpend(contract)
  if (contract.type === 'RECURRING') return contractTotal - baseYearTotal(contract) - subkQuote
  return contractTotal - subkQuote
}

function isActiveContract(contract: Contract) {
  return !['ARCHIVED', 'TERMINATED', 'CANCELED'].includes(contract.status)
}

function matchesEmployee(employee: Employee, submission: BDSubmission, opportunities: Opportunity[], employees: Employee[]) {
  const opp = submissionOpportunity(submission, opportunities)
  const chain = getAssignmentChain(employees, opp?.assignedTo)
  const lowerName = employee.name.toLowerCase()
  return chain.manager?.id === employee.id ||
    chain.teamLead?.id === employee.id ||
    chain.associate?.id === employee.id ||
    [submission.bdm, submission.bds, submission.supportAgent].some(name => (name || '').toLowerCase() === lowerName)
}

function DashboardStat({
  icon: Icon,
  label,
  value,
  detail,
  accent,
  onClick,
}: {
  icon: any
  label: string
  value: string | number
  detail: string
  accent: string
  onClick?: () => void
}) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick?.() } } : undefined}
      className={`exec-stat rounded-2xl border p-4 ${clickable ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent' : ''}`}
      style={EXEC_PANEL_STYLE}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border" style={{ color: accent, background: `${accent}1A`, borderColor: `${accent}55` }}>
          <Icon size={18} />
        </div>
        <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: accent, background: `${accent}18` }}>
          Live
        </span>
      </div>
      <div className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <p className="mt-1 text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{detail}</p>
      {clickable && (
        <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide" style={{ color: accent }}>
          View details <ChevronRight size={11} />
        </p>
      )}
    </div>
  )
}

function DashboardPanel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="exec-panel rounded-2xl border" style={EXEC_PANEL_STYLE}>
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border-default)' }}>
        <div>
          <h3 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          {subtitle && <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function EmptyDashboardState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm font-semibold" style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)', color: 'var(--text-tertiary)' }}>
      {label}
    </div>
  )
}

function ExecutiveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="pointer-events-none rounded-xl border px-3 py-2 text-xs shadow-xl" style={{ borderColor: 'var(--exec-border-strong)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <p className="mb-1.5 font-bold">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey || p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.fill || p.stroke || p.color }} />
          <span style={{ color: 'var(--text-tertiary)' }}>{p.name || p.dataKey}</span>
          <span className="font-black" style={{ color: 'var(--text-primary)' }}>
            {String(p.dataKey || '').toLowerCase().includes('value') || String(p.name || '').toLowerCase().includes('value')
              ? formatCurrency(Number(p.value || 0))
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

type BdPieRow = { name: string; value: number; count: number }

function BdPiePanel({
  title,
  subtitle,
  data,
  chartColors,
  total,
  onSlice,
  colorOverride,
}: {
  title: string
  subtitle: string
  data: BdPieRow[]
  chartColors: string[]
  total: number
  onSlice: (row: BdPieRow) => void
  colorOverride?: (name: string) => string | undefined
}) {
  const colorFor = (name: string, index: number) =>
    colorOverride?.(name) ?? chartColors[index % chartColors.length]
  return (
    <DashboardPanel title={title} subtitle={subtitle}>
      {data.length === 0 ? (
        <EmptyDashboardState label="No data in range." />
      ) : (
        <div className="flex h-[260px] flex-col gap-3">
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="name"
                innerRadius={42}
                outerRadius={64}
                paddingAngle={3}
                stroke="transparent"
                strokeWidth={0}
                isAnimationActive={false}
                onClick={(entry: any) => entry?.payload && onSlice(entry.payload)}
                cursor="pointer"
              >
                {data.map((row, index) => (
                  <Cell key={row.name} fill={colorFor(row.name, index)} stroke="transparent" strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip content={<ExecutiveTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
            {data.slice(0, 6).map((row, index) => {
              const color = colorFor(row.name, index)
              const ratio = pct(row.count, Math.max(1, total))
              return (
                <button
                  key={row.name}
                  type="button"
                  onClick={() => onSlice(row)}
                  className="block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5 truncate font-bold" style={{ color: 'var(--text-secondary)' }}>
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="flex-shrink-0 font-black" style={{ color: 'var(--text-primary)' }}>{row.count} <span className="font-bold opacity-60">({ratio}%)</span></span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${ratio}%`, background: color }} />
                  </div>
                </button>
              )
            })}
            {data.length > 6 && (
              <p className="px-2 pt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>+{data.length - 6} more</p>
            )}
          </div>
        </div>
      )}
    </DashboardPanel>
  )
}

type ChartGroupRow = { name: string; value: number; count: number }
type MonthCount = { month: string; submitted: number; awarded: number }
type MonthValue = { month: string; value: number; awarded: number }

type MemberRollup = {
  employee: Employee
  subs: BDSubmission[]
  assignedOpps: Opportunity[]
  awarded: BDSubmission[]
  lost: BDSubmission[]
  dropped: BDSubmission[]
  value: number
  awardedValue: number
  winRate: number
  captureRate: number
  byStatus: ChartGroupRow[]
  byType: ChartGroupRow[]
  byNaics: ChartGroupRow[]
  bySetAside: ChartGroupRow[]
  byPriority: ChartGroupRow[]
  byAgency: ChartGroupRow[]
  assignedByStatus: ChartGroupRow[]
  monthsData: MonthCount[]
  valueByMonth: MonthValue[]
  recent: BDSubmission[]
}

type TeamRollup = {
  manager: Employee
  members: Employee[]
  all: Employee[]
  subs: BDSubmission[]
  assignedOpps: Opportunity[]
  awarded: BDSubmission[]
  lost: BDSubmission[]
  dropped: BDSubmission[]
  notSubmitted: unknown[]
  value: number
  awardedValue: number
  winRate: number
  captureRate: number
  memberStats: MemberRollup[]
  monthsData: MonthCount[]
  valueByMonth: MonthValue[]
  byStatus: ChartGroupRow[]
  bySetAside: ChartGroupRow[]
  byPriority: ChartGroupRow[]
  byAgency: ChartGroupRow[]
  byMember: Array<{ name: string; submitted: number; awarded: number; value: number }>
  byRole: ChartGroupRow[]
}

function ROLE_BADGE_LABEL(role: string) {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] || role
}

function MetricTile({ label, value, accent, hint }: { label: string; value: string | number; accent: string; hint?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="mt-0.5 text-lg font-black" style={{ color: accent }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  )
}

function TeamsOverview({
  teamRollups,
  activeUsers,
  chartColors,
  accent,
  secondaryAccent,
  tertiaryAccent,
  onPickTeam,
  onPickMember,
  emptyLabel,
  kpiLabel,
}: {
  teamRollups: TeamRollup[]
  activeUsers: User[]
  chartColors: string[]
  accent: string
  secondaryAccent: string
  tertiaryAccent: string
  onPickTeam: (managerId: string) => void
  onPickMember: (employeeId: string) => void
  emptyLabel?: string
  kpiLabel?: string
}) {
  const totalMembers = teamRollups.reduce((sum, t) => sum + t.members.length, 0)
  const totalSubs = teamRollups.reduce((sum, t) => sum + t.subs.length, 0)
  const totalAwards = teamRollups.reduce((sum, t) => sum + t.awarded.length, 0)
  const totalValue = teamRollups.reduce((sum, t) => sum + t.value, 0)
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <DashboardStat icon={Users} label={kpiLabel || 'Active Teams'} value={teamRollups.length} detail="Teams led by a manager" accent={accent} />
        <DashboardStat icon={Users} label="Team Members" value={totalMembers} detail="People assigned to a team" accent={tertiaryAccent} />
        <DashboardStat icon={Send} label="Total Submissions" value={totalSubs} detail="Submissions across all teams" accent={secondaryAccent} />
        <DashboardStat icon={Trophy} label="Total Awards" value={totalAwards} detail="Awarded submissions" accent={accent} />
        <DashboardStat icon={Zap} label="Active Users" value={activeUsers.length} detail="Currently active accounts" accent={chartColors[3]} />
      </div>

      {teamRollups.length === 0 ? (
        <DashboardPanel title="No teams yet" subtitle="Create employees and assign managers to form teams.">
          <EmptyDashboardState label={emptyLabel || 'No team data to display.'} />
        </DashboardPanel>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {teamRollups.map((team, teamIndex) => {
            const color = chartColors[teamIndex % chartColors.length]
            const topMembers = team.memberStats.slice(0, 6)
            return (
              <div
                key={team.manager.id}
                className="exec-panel flex flex-col gap-4 rounded-2xl border p-5"
                style={{ ...EXEC_PANEL_STYLE, borderColor: 'var(--exec-border)' }}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarColor(team.manager.avatar)} text-sm font-black text-white`}>
                    {team.manager.avatar.slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-black" style={{ color: 'var(--text-primary)' }}>{team.manager.name}'s Team</p>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: `${color}1F`, color }}>
                        {(team.manager.team ?? 'BD')}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {ROLE_BADGE_LABEL(team.manager.role)} · {team.members.length} member{team.members.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPickTeam(team.manager.id)}
                    className="rounded-xl border px-3 py-1.5 text-xs font-black transition-all hover:-translate-y-px"
                    style={{ borderColor: 'var(--exec-border-strong)', color: accent, background: 'var(--exec-panel-soft)' }}
                  >
                    View team <ChevronRight size={12} className="-mr-0.5 ml-0.5 inline" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricTile label="Submitted" value={team.subs.length} accent={secondaryAccent} />
                  <MetricTile label="Awarded" value={team.awarded.length} accent={accent} />
                  <MetricTile label="Win rate" value={`${team.winRate}%`} accent={tertiaryAccent} />
                  <MetricTile label="Value" value={formatCurrency(team.value)} accent={chartColors[3]} hint={`${formatCurrency(team.awardedValue)} awarded`} />
                </div>

                {team.byMember.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={team.byMember} onClick={() => onPickTeam(team.manager.id)} style={{ cursor: 'pointer' }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ExecutiveTooltip />} />
                        <Bar dataKey="submitted" name="Submitted" fill={secondaryAccent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        <Bar dataKey="awarded" name="Awarded" fill={accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                    {team.byStatus.length > 0 && (
                      <ResponsiveContainer width="100%" height={150}>
                        <PieChart>
                          <Pie data={team.byStatus} dataKey="count" nameKey="name" innerRadius={36} outerRadius={58} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                            {team.byStatus.map((row, idx) => (
                              <Cell key={row.name} fill={STATUS_COLORS[row.name] || chartColors[idx % chartColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<ExecutiveTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                ) : (
                  <EmptyDashboardState label="No submissions yet for this team." />
                )}

                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>Top contributors</p>
                  {topMembers.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No member activity yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {topMembers.map((member) => (
                        <button
                          key={member.employee.id}
                          type="button"
                          onClick={() => onPickMember(member.employee.id)}
                          className="flex items-center gap-2 rounded-lg border p-2 text-left transition-all hover:-translate-y-px"
                          style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}
                        >
                          <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${avatarColor(member.employee.avatar)} text-[10px] font-black text-white`}>
                            {member.employee.avatar.slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-black" style={{ color: 'var(--text-primary)' }}>{member.employee.name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{member.subs.length} sub · {member.awarded.length} awd · {member.winRate}%</p>
                          </div>
                          <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function TeamDetailView({
  rollup,
  chartColors,
  accent,
  secondaryAccent,
  tertiaryAccent,
  onBack,
  onPickMember,
}: {
  rollup: TeamRollup
  chartColors: string[]
  accent: string
  secondaryAccent: string
  tertiaryAccent: string
  onBack: () => void
  onPickMember: (employeeId: string) => void
}) {
  const teamLabel = rollup.manager.team ?? 'BD'
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all hover:-translate-y-px"
          style={{ borderColor: 'var(--exec-border-strong)', color: 'var(--text-primary)', background: 'var(--exec-panel-soft)' }}
        >
          <ChevronRight size={12} style={{ transform: 'rotate(180deg)' }} />
          Teams
        </button>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          Teams / <span style={{ color: 'var(--text-primary)' }}>{rollup.manager.name}'s Team</span>
        </p>
      </div>

      <div className="exec-panel rounded-2xl border p-5" style={EXEC_PANEL_STYLE}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarColor(rollup.manager.avatar)} text-base font-black text-white`}>
            {rollup.manager.avatar.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>{rollup.manager.name}'s Team</h2>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: `${accent}1F`, color: accent }}>{teamLabel}</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {ROLE_BADGE_LABEL(rollup.manager.role)} · {rollup.members.length} member{rollup.members.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile label="Members" value={rollup.members.length} accent={tertiaryAccent} />
          <MetricTile label="Submitted" value={rollup.subs.length} accent={secondaryAccent} />
          <MetricTile label="Awarded" value={rollup.awarded.length} accent={accent} />
          <MetricTile label="Lost" value={rollup.lost.length} accent={chartColors[5]} />
          <MetricTile label="Win rate" value={`${rollup.winRate}%`} accent={chartColors[4]} />
          <MetricTile label="Value" value={formatCurrency(rollup.value)} accent={chartColors[3]} hint={`${formatCurrency(rollup.awardedValue)} awarded`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardPanel title="Submission Trend" subtitle="Past 6 months">
          {rollup.monthsData.every(m => m.submitted === 0 && m.awarded === 0) ? (
            <EmptyDashboardState label="No submissions in the last 6 months." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={rollup.monthsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#9FB2AD', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ExecutiveTooltip />} />
                <Bar dataKey="submitted" name="Submitted" fill={secondaryAccent} radius={[5, 5, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="awarded" name="Awarded" fill={accent} radius={[5, 5, 0, 0]} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>

        <DashboardPanel title="By Status" subtitle="Submitted records by current status">
          {rollup.byStatus.length === 0 ? (
            <EmptyDashboardState label="No submissions." />
          ) : (
            <div className="flex h-[220px] items-center gap-3">
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie data={rollup.byStatus} dataKey="count" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                    {rollup.byStatus.map((row, idx) => (
                      <Cell key={row.name} fill={STATUS_COLORS[row.name] || chartColors[idx % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ExecutiveTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {rollup.byStatus.map((row, idx) => {
                  const color = STATUS_COLORS[row.name] || chartColors[idx % chartColors.length]
                  return (
                    <div key={row.name} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex min-w-0 items-center gap-1.5 truncate font-bold" style={{ color: 'var(--text-secondary)' }}>
                        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
                        <span className="truncate">{row.name}</span>
                      </span>
                      <span className="flex-shrink-0 font-black" style={{ color: 'var(--text-primary)' }}>{row.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel title="Submissions by Member" subtitle="Per-member output">
          {rollup.byMember.length === 0 ? (
            <EmptyDashboardState label="No member output yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rollup.byMember}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#9FB2AD', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ExecutiveTooltip />} />
                <Bar dataKey="submitted" name="Submitted" fill={secondaryAccent} radius={[5, 5, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="awarded" name="Awarded" fill={accent} radius={[5, 5, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardPanel title="By Set-Aside" subtitle="Assigned opportunities by set-aside">
          {rollup.bySetAside.length === 0 ? (
            <EmptyDashboardState label="No assigned opportunities." />
          ) : (
            <div className="flex h-[220px] items-center gap-3">
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie data={rollup.bySetAside} dataKey="count" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                    {rollup.bySetAside.map((row, idx) => (
                      <Cell key={row.name} fill={chartColors[idx % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ExecutiveTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {rollup.bySetAside.map((row, idx) => {
                  const color = chartColors[idx % chartColors.length]
                  return (
                    <div key={row.name} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex min-w-0 items-center gap-1.5 truncate font-bold" style={{ color: 'var(--text-secondary)' }}>
                        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
                        <span className="truncate">{row.name}</span>
                      </span>
                      <span className="flex-shrink-0 font-black" style={{ color: 'var(--text-primary)' }}>{row.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel title="By Priority" subtitle="Assigned opportunities by priority">
          {rollup.byPriority.length === 0 ? (
            <EmptyDashboardState label="No assigned opportunities." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={rollup.byPriority} dataKey="count" nameKey="name" innerRadius={42} outerRadius={78} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                  {rollup.byPriority.map((row, idx) => (
                    <Cell key={row.name} fill={chartColors[(idx + 2) % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ExecutiveTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#C7D7D3' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>

        <DashboardPanel title="Top Agencies" subtitle="By number of assigned opportunities">
          {rollup.byAgency.length === 0 ? (
            <EmptyDashboardState label="No assigned opportunities." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rollup.byAgency} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} width={88} />
                <Tooltip content={<ExecutiveTooltip />} />
                <Bar dataKey="count" name="Opportunities" fill={tertiaryAccent} radius={[0, 5, 5, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel title="Submitted Value Trend" subtitle="Total vs. awarded submitted value, past 6 months">
        {rollup.valueByMonth.every(m => m.value === 0 && m.awarded === 0) ? (
          <EmptyDashboardState label="No submitted value in the last 6 months." />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={rollup.valueByMonth}>
              <defs>
                <linearGradient id="teamValueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={secondaryAccent} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={secondaryAccent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="teamAwardedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#9FB2AD', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round(v / 1000)}K`} />
              <Tooltip content={<ExecutiveTooltip />} formatter={(v: number) => formatCurrency(v)} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#C7D7D3' }} />
              <Area type="monotone" dataKey="value" name="Submitted Value" stroke={secondaryAccent} fill="url(#teamValueGradient)" strokeWidth={2} isAnimationActive={false} />
              <Area type="monotone" dataKey="awarded" name="Awarded Value" stroke={accent} fill="url(#teamAwardedGradient)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </DashboardPanel>

      <DashboardPanel title="Team Members" subtitle="Click any member to drill into their personal scorecard">
        {rollup.memberStats.length === 0 ? (
          <EmptyDashboardState label="This team has no members yet." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rollup.memberStats.map((member) => (
              <button
                key={member.employee.id}
                type="button"
                onClick={() => onPickMember(member.employee.id)}
                className="flex items-start gap-3 rounded-xl border p-3 text-left transition-all hover:-translate-y-px"
                style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}
              >
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarColor(member.employee.avatar)} text-xs font-black text-white`}>
                  {member.employee.avatar.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black" style={{ color: 'var(--text-primary)' }}>{member.employee.name}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{ROLE_BADGE_LABEL(member.employee.role)}</p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <div>
                      <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Sub</p>
                      <p className="text-sm font-black" style={{ color: secondaryAccent }}>{member.subs.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Awd</p>
                      <p className="text-sm font-black" style={{ color: accent }}>{member.awarded.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Win</p>
                      <p className="text-sm font-black" style={{ color: tertiaryAccent }}>{member.winRate}%</p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(member.value)}</p>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        )}
      </DashboardPanel>
    </>
  )
}

function MemberDetailView({
  rollup,
  employees,
  chartColors,
  accent,
  secondaryAccent,
  tertiaryAccent,
  onBack,
  onBackToTeam,
  onOpenOpportunity,
}: {
  rollup: MemberRollup
  employees: Employee[]
  chartColors: string[]
  accent: string
  secondaryAccent: string
  tertiaryAccent: string
  onBack: () => void
  onBackToTeam: (managerId: string) => void
  onOpenOpportunity: (id: string) => void
}) {
  // Find this person's team head (walk up manager chain to the team lead role).
  const teamHead = (() => {
    const idMap = new Map(employees.map(e => [e.id, e]))
    let current: Employee | undefined = rollup.employee
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      if (current.role === 'BD_MANAGER') return current
      if (!current.managerId) return current
      current = idMap.get(current.managerId)
    }
    return current ?? rollup.employee
  })()
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all hover:-translate-y-px"
            style={{ borderColor: 'var(--exec-border-strong)', color: 'var(--text-primary)', background: 'var(--exec-panel-soft)' }}
          >
            <ChevronRight size={12} style={{ transform: 'rotate(180deg)' }} />
            Teams
          </button>
          {teamHead && teamHead.id !== rollup.employee.id && (
            <button
              type="button"
              onClick={() => onBackToTeam(teamHead.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all hover:-translate-y-px"
              style={{ borderColor: 'var(--exec-border-strong)', color: 'var(--text-primary)', background: 'var(--exec-panel-soft)' }}
            >
              <ChevronRight size={12} style={{ transform: 'rotate(180deg)' }} />
              {teamHead.name}'s team
            </button>
          )}
        </div>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          Teams / {teamHead?.name ?? '—'} / <span style={{ color: 'var(--text-primary)' }}>{rollup.employee.name}</span>
        </p>
      </div>

      <div className="exec-panel rounded-2xl border p-5" style={EXEC_PANEL_STYLE}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className={`flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br ${avatarColor(rollup.employee.avatar)} text-lg font-black text-white`}>
            {rollup.employee.avatar.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{rollup.employee.name}</h2>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {ROLE_BADGE_LABEL(rollup.employee.role)} · {rollup.employee.email}
            </p>
            {rollup.employee.department && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{rollup.employee.department}</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile label="Assigned" value={rollup.assignedOpps.length} accent={tertiaryAccent} />
          <MetricTile label="Submitted" value={rollup.subs.length} accent={secondaryAccent} />
          <MetricTile label="Awarded" value={rollup.awarded.length} accent={accent} />
          <MetricTile label="Lost / Dropped" value={rollup.lost.length + rollup.dropped.length} accent={chartColors[5]} />
          <MetricTile label="Win rate" value={`${rollup.winRate}%`} accent={chartColors[4]} />
          <MetricTile label="Value" value={formatCurrency(rollup.value)} accent={chartColors[3]} hint={`${formatCurrency(rollup.awardedValue)} awarded`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardPanel title="By Status" subtitle="Their submissions by current status">
          {rollup.byStatus.length === 0 ? (
            <EmptyDashboardState label="No submissions." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={rollup.byStatus} dataKey="count" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                  {rollup.byStatus.map((row, idx) => (
                    <Cell key={row.name} fill={STATUS_COLORS[row.name] || chartColors[idx % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ExecutiveTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>

        <DashboardPanel title="By Type" subtitle="Type of opportunities submitted">
          {rollup.byType.length === 0 ? (
            <EmptyDashboardState label="No submissions." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={rollup.byType} dataKey="count" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                  {rollup.byType.map((row, idx) => (
                    <Cell key={row.name} fill={chartColors[idx % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ExecutiveTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>

        <DashboardPanel title="Trend" subtitle="Last 6 months">
          {rollup.monthsData.every(m => m.submitted === 0 && m.awarded === 0) ? (
            <EmptyDashboardState label="No activity in the last 6 months." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={rollup.monthsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#9FB2AD', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ExecutiveTooltip />} />
                <Bar dataKey="submitted" name="Submitted" fill={secondaryAccent} radius={[5, 5, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="awarded" name="Awarded" fill={accent} radius={[5, 5, 0, 0]} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardPanel title="Assigned by Set-Aside" subtitle="Their assigned opportunities by set-aside">
          {rollup.bySetAside.length === 0 ? (
            <EmptyDashboardState label="No assigned opportunities." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={rollup.bySetAside} dataKey="count" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                  {rollup.bySetAside.map((row, idx) => (
                    <Cell key={row.name} fill={chartColors[idx % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ExecutiveTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>

        <DashboardPanel title="Assigned by Priority" subtitle="Their assigned opportunities by priority">
          {rollup.byPriority.length === 0 ? (
            <EmptyDashboardState label="No assigned opportunities." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={rollup.byPriority} dataKey="count" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                  {rollup.byPriority.map((row, idx) => (
                    <Cell key={row.name} fill={chartColors[(idx + 2) % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ExecutiveTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>

        <DashboardPanel title="Pipeline Status" subtitle="Currently assigned opportunities by status">
          {rollup.assignedByStatus.length === 0 ? (
            <EmptyDashboardState label="No assigned opportunities." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={rollup.assignedByStatus} dataKey="count" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={3} stroke="transparent" isAnimationActive={false}>
                  {rollup.assignedByStatus.map((row, idx) => (
                    <Cell key={row.name} fill={STATUS_COLORS[row.name] || chartColors[idx % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ExecutiveTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DashboardPanel title="Top Agencies" subtitle="Their assigned opportunities by client">
          {rollup.byAgency.length === 0 ? (
            <EmptyDashboardState label="No assigned opportunities." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rollup.byAgency} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} width={88} />
                <Tooltip content={<ExecutiveTooltip />} />
                <Bar dataKey="count" name="Opportunities" fill={tertiaryAccent} radius={[0, 5, 5, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>

        <DashboardPanel title="NAICS Mix" subtitle="Submitted by NAICS category">
          {rollup.byNaics.length === 0 ? (
            <EmptyDashboardState label="No submissions." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rollup.byNaics.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} width={88} />
                <Tooltip content={<ExecutiveTooltip />} />
                <Bar dataKey="count" name="Submissions" fill={secondaryAccent} radius={[0, 5, 5, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>

        <DashboardPanel title="Value Trend" subtitle="Submitted vs awarded value (last 6 months)">
          {rollup.valueByMonth.every(m => m.value === 0 && m.awarded === 0) ? (
            <EmptyDashboardState label="No submitted value in the last 6 months." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={rollup.valueByMonth}>
                <defs>
                  <linearGradient id={`memberValue-${rollup.employee.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={secondaryAccent} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={secondaryAccent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`memberAwarded-${rollup.employee.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accent} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#9FB2AD', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round(v / 1000)}K`} />
                <Tooltip content={<ExecutiveTooltip />} formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="value" name="Submitted Value" stroke={secondaryAccent} fill={`url(#memberValue-${rollup.employee.id})`} strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="awarded" name="Awarded Value" stroke={accent} fill={`url(#memberAwarded-${rollup.employee.id})`} strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </DashboardPanel>
      </div>

      <div className="exec-section-grid">
        <DashboardPanel title="Recent Submissions" subtitle="Most recent activity">
          {rollup.recent.length === 0 ? (
            <EmptyDashboardState label="No recent submissions." />
          ) : (
            <div className="space-y-2">
              {rollup.recent.map((submission) => {
                const color = STATUS_COLORS[submission.status] || accent
                return (
                  <div
                    key={submission.id}
                    className="flex items-center gap-3 rounded-xl border p-3"
                    style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black" style={{ color: 'var(--text-primary)' }}>{submission.solicitation || submission.solicitationId || 'Untitled'}</p>
                      <p className="truncate text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{submission.submittedOn || 'No date'} · {submission.type || 'No type'}</p>
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: `${color}1F`, color }}>{submission.status}</span>
                    <p className="text-sm font-black" style={{ color: accent }}>{formatCurrency(Number(submission.value) || 0)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel title="Assigned Opportunities" subtitle="Click to open in pipeline">
          {rollup.assignedOpps.length === 0 ? (
            <EmptyDashboardState label="No opportunities assigned." />
          ) : (
            <div className="space-y-2">
              {rollup.assignedOpps.slice(0, 10).map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => onOpenOpportunity(opp.id)}
                  className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all hover:-translate-y-px"
                  style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black" style={{ color: 'var(--text-primary)' }}>{opp.solicitation || opp.solicitationId || 'Untitled opportunity'}</p>
                    <p className="truncate text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{opp.client || 'No agency'} · {opp.status}</p>
                  </div>
                  <p className="flex-shrink-0 text-sm font-black" style={{ color: accent }}>{formatCurrency(opportunityValue(opp))}</p>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}
              {rollup.assignedOpps.length > 10 && (
                <p className="px-2 pt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>+{rollup.assignedOpps.length - 10} more</p>
              )}
            </div>
          )}
        </DashboardPanel>
      </div>
    </>
  )
}

const BD_GOAL_BY_ROLE: Record<HierarchyRole, number> = {
  BD_MANAGER: 20,
  TEAM_LEAD: 15,
  ASSOCIATE: 10,
}

type PiePersonMetric = 'status' | 'type' | 'setAside' | 'subsVsNon' | 'winsVsLosses'

const PIE_METRIC_OPTIONS: Array<{ id: PiePersonMetric; label: string }> = [
  { id: 'status', label: 'Status' },
  { id: 'type', label: 'Type' },
  { id: 'setAside', label: 'Set-aside' },
  { id: 'subsVsNon', label: 'Sub vs Non-sub' },
  { id: 'winsVsLosses', label: 'Wins vs Losses' },
]

function BdPeopleGrid({
  bdEmployees,
  users,
  submissions,
  nonSubs,
  visibleOpps,
  employees,
  chartColors,
  accent,
  secondaryAccent,
  tertiaryAccent,
  onPickMember,
}: {
  bdEmployees: Employee[]
  users: User[]
  submissions: BDSubmission[]
  nonSubs: NonSubmissionReport[]
  visibleOpps: Opportunity[]
  employees: Employee[]
  chartColors: string[]
  accent: string
  secondaryAccent: string
  tertiaryAccent: string
  onPickMember: (employeeId: string) => void
}) {
  const sorted = useMemo(() => {
    const order: Record<HierarchyRole, number> = { BD_MANAGER: 0, TEAM_LEAD: 1, ASSOCIATE: 2 }
    return [...bdEmployees].sort((a, b) => (order[a.role] - order[b.role]) || a.name.localeCompare(b.name))
  }, [bdEmployees])

  return (
    <DashboardPanel
      title="Business Development Team"
      subtitle="Per-person stats plus a switchable pie chart per card. Click the avatar to drill down."
    >
      {sorted.length === 0 ? (
        <EmptyDashboardState label="No Business Development people yet." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sorted.map(employee => (
            <BdPersonCard
              key={employee.id}
              employee={employee}
              users={users}
              submissions={submissions}
              nonSubs={nonSubs}
              visibleOpps={visibleOpps}
              employees={employees}
              chartColors={chartColors}
              accent={accent}
              secondaryAccent={secondaryAccent}
              tertiaryAccent={tertiaryAccent}
              onPick={() => onPickMember(employee.id)}
            />
          ))}
        </div>
      )}
    </DashboardPanel>
  )
}

function BdPersonCard({
  employee,
  users,
  submissions,
  nonSubs,
  visibleOpps,
  employees,
  chartColors,
  accent,
  secondaryAccent,
  tertiaryAccent,
  onPick,
}: {
  employee: Employee
  users: User[]
  submissions: BDSubmission[]
  nonSubs: NonSubmissionReport[]
  visibleOpps: Opportunity[]
  employees: Employee[]
  chartColors: string[]
  accent: string
  secondaryAccent: string
  tertiaryAccent: string
  onPick: () => void
}) {
  const [metric, setMetric] = useState<PiePersonMetric>('status')

  const userRecord = users.find(u => (u.email || '').toLowerCase() === (employee.email || '').toLowerCase())
  const userName = (userRecord?.username || '').trim().toLowerCase()

  const personalSubs = useMemo(
    () => submissions.filter(sub => matchesEmployee(employee, sub, visibleOpps, employees)),
    [submissions, employee, visibleOpps, employees],
  )
  const personalNonSubs = useMemo(
    () => nonSubs.filter(report => report.status !== 'DECLINED' && report.agentUsername.toLowerCase() === userName),
    [nonSubs, userName],
  )

  const wins = personalSubs.filter(s => s.status === 'AWARDED').length
  const losses = personalSubs.filter(s => ['LOST', 'DROPPED', 'CANCELED'].includes(s.status)).length
  const submissionsCount = personalSubs.length
  const nonSubsCount = personalNonSubs.length
  const total = submissionsCount + nonSubsCount
  const successRate = total ? Math.round((submissionsCount / total) * 100) : 0
  const winRate = submissionsCount ? Math.round((wins / submissionsCount) * 100) : 0
  const goal = BD_GOAL_BY_ROLE[employee.role]
  const goalPct = goal ? Math.min(100, Math.round((submissionsCount / goal) * 100)) : 0
  const goalAchieved = submissionsCount >= goal && goal > 0

  const pieData = useMemo(() => {
    if (metric === 'status') return groupRows(personalSubs, s => s.status || 'Unspecified')
    if (metric === 'type') return groupRows(personalSubs, s => s.type || 'Unspecified')
    if (metric === 'setAside') return groupRows(personalSubs, s => submissionOpportunity(s, visibleOpps)?.setAside || 'Unspecified')
    if (metric === 'subsVsNon') return [
      { name: 'Submissions', value: submissionsCount, count: submissionsCount },
      { name: 'Non-Submissions', value: nonSubsCount, count: nonSubsCount },
    ]
    if (metric === 'winsVsLosses') return [
      { name: 'Wins', value: wins, count: wins },
      { name: 'Losses', value: losses, count: losses },
      { name: 'Pending', value: Math.max(0, submissionsCount - wins - losses), count: Math.max(0, submissionsCount - wins - losses) },
    ]
    return []
  }, [metric, personalSubs, visibleOpps, submissionsCount, nonSubsCount, wins, losses])

  const pieColorFor = (name: string, idx: number): string => {
    if (metric === 'status') return STATUS_COLORS[name] || chartColors[idx % chartColors.length]
    if (metric === 'subsVsNon') return name === 'Submissions' ? secondaryAccent : '#F87171'
    if (metric === 'winsVsLosses') {
      if (name === 'Wins') return accent
      if (name === 'Losses') return '#F87171'
      return chartColors[5] || tertiaryAccent
    }
    return chartColors[idx % chartColors.length]
  }

  const hasPieData = pieData.some(row => (row.count ?? 0) > 0)
  const statusColor = goalAchieved ? '#10B981' : tertiaryAccent
  const StatusIcon = goalAchieved ? CheckCircle2 : Clock

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-2xl border overflow-hidden flex flex-col"
      style={{ background: 'var(--exec-panel-soft)', borderColor: 'var(--exec-border)' }}
    >
      {/* Header */}
      <div className="px-3.5 pt-3.5 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onPick}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left transition-opacity hover:opacity-80"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black text-white bg-gradient-to-br ${avatarColor(employee.avatar)} flex-shrink-0`}>
              {employee.avatar.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-black" style={{ color: 'var(--text-primary)' }}>{employee.name}</p>
              <div className="mt-0.5 flex items-center gap-1">
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-black tracking-wider"
                  style={{ background: `${accent}1A`, color: accent }}
                >
                  {ROLE_BADGE_LABEL(employee.role)}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-black tracking-wider"
                  style={{ background: 'rgba(99,102,241,0.10)', color: '#A5B4FC' }}
                >
                  BD
                </span>
              </div>
            </div>
          </button>
          <div className="flex-shrink-0 text-right">
            <p className="text-2xl font-black leading-none" style={{ color: 'var(--text-primary)' }}>
              <AnimatedNumber value={total} />
            </p>
            <p className="mt-0.5 text-[9px] font-bold tracking-wider" style={{ color: 'var(--text-tertiary)' }}>TOTAL</p>
          </div>
        </div>
      </div>

      {/* Stats rows */}
      <div className="px-3.5 pb-2 space-y-1.5">
        <BdStatRow label="Submissions" value={submissionsCount} color={secondaryAccent} />
        <BdStatRow label="Non-Submissions" value={nonSubsCount} color="#F87171" />
        <BdStatRow label="Success Rate" value={`${successRate}%`} color={successRate >= 60 ? '#10B981' : successRate >= 40 ? '#F59E0B' : '#F87171'} />
        {wins > 0 && <BdStatRow label="Win Rate" value={`${winRate}%`} color="#10B981" sub={`${wins} wins`} />}
      </div>

      {/* Goal progress */}
      <div className="px-3.5 pb-3">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Target size={9} style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-[9px] font-bold tracking-wider" style={{ color: 'var(--text-tertiary)' }}>GOAL</span>
          </div>
          <span className="text-[10px] font-black" style={{ color: statusColor }}>{submissionsCount}/{goal}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}80` }}
            initial={{ width: 0 }}
            animate={{ width: `${goalPct}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {/* Metric selector pills */}
      <div className="px-3.5 pb-2">
        <div className="flex flex-wrap gap-1">
          {PIE_METRIC_OPTIONS.map(opt => {
            const active = metric === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMetric(opt.id)}
                className="rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors"
                style={{
                  borderColor: active ? accent : 'var(--exec-border)',
                  background: active ? `${accent}22` : 'transparent',
                  color: active ? accent : 'var(--text-tertiary)',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pie chart */}
      <div className="px-2 pb-3">
        {!hasPieData ? (
          <div className="flex h-[140px] items-center justify-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
            No data for this metric
          </div>
        ) : (
          <div className="flex h-[140px] items-center gap-2">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="count" nameKey="name" innerRadius={28} outerRadius={50} paddingAngle={2} stroke="transparent" isAnimationActive={false}>
                  {pieData.map((row, idx) => (
                    <Cell key={row.name} fill={pieColorFor(row.name, idx)} />
                  ))}
                </Pie>
                <Tooltip content={<ExecutiveTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1 pr-1">
              {pieData.map((row, idx) => {
                const color = pieColorFor(row.name, idx)
                return (
                  <div key={row.name} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="flex min-w-0 items-center gap-1.5 truncate font-bold" style={{ color: 'var(--text-secondary)' }}>
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="flex-shrink-0 font-black" style={{ color: 'var(--text-primary)' }}>{row.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Status badge */}
      <div
        className="flex items-center justify-center gap-1.5 border-t px-3.5 py-1.5"
        style={{ background: `${statusColor}14`, borderColor: `${statusColor}28` }}
      >
        <StatusIcon size={12} style={{ color: statusColor }} />
        <span className="text-[10px] font-black tracking-wider" style={{ color: statusColor }}>
          {goalAchieved ? 'GOAL ACHIEVED' : 'IN PROGRESS'}
        </span>
      </div>
    </motion.div>
  )
}

function BdStatRow({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <div className="flex items-baseline gap-1.5">
        {sub && <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{sub}</span>}
        <span className="text-[12px] font-black" style={{ color }}>{value}</span>
      </div>
    </div>
  )
}

function ExecutiveDashboard() {
  const { opportunities, nonSubReports, activityLogs, currentUser, bdSubmissions, contracts, employees, users } = useStore()
  const { prefs } = useAppearance()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period | null>(null)
  const [tab, setTab] = useState<ExecutiveDashboardTab>('bd')
  const [bdTeamView, setBdTeamView] = useState<TeamView>({ mode: 'teams' })
  const [opsTeamView, setOpsTeamView] = useState<TeamView>({ mode: 'teams' })
  // BD Team Leads don't see the Operations tab.
  const visibleTabs = useMemo(
    () => currentUser?.role === 'TEAM_LEAD' && (currentUser?.team ?? 'BD') === 'BD'
      ? EXECUTIVE_TABS.filter(t => t.id !== 'ops')
      : EXECUTIVE_TABS,
    [currentUser],
  )
  useEffect(() => {
    if (!visibleTabs.some(t => t.id === tab)) setTab(visibleTabs[0]?.id ?? 'bd')
  }, [visibleTabs, tab])
  const chartColors = chartColorsForTheme(prefs.theme)
  const accent = chartColors[0]
  const secondaryAccent = chartColors[1]
  const tertiaryAccent = chartColors[2]

  const visibleOpps = useMemo(() => opportunities.filter(opp => !opp.isDeleted), [opportunities])
  const periodOpps = useMemo(
    () => visibleOpps.filter(opp => filterByPeriod(opp.submittedAt || opp.capturedOn || opp.dueDate, period)),
    [visibleOpps, period],
  )
  const periodSubmissions = useMemo(
    () => bdSubmissions.filter(submission => filterByPeriod(submission.submittedOn || submission.dueDate, period)),
    [bdSubmissions, period],
  )
  const periodContracts = useMemo(
    () => contracts.filter(contract => filterByPeriod(contract.popStart || contract.popEnd, period)),
    [contracts, period],
  )

  // ── BD vs OPS scoping (so each tab shows only its own people's data) ─────
  const employeeTeamMap = useMemo(() => {
    const map = new Map<string, EmployeeTeam>()
    for (const employee of employees) map.set(employee.id, employee.team ?? 'BD')
    return map
  }, [employees])
  const opportunityTeam = useMemo(() => (opp: Opportunity): EmployeeTeam | null => {
    const chain = getAssignmentChain(employees, opp.assignedTo)
    const topId = chain.manager?.id ?? chain.teamLead?.id ?? chain.associate?.id
    if (!topId) return null
    return employeeTeamMap.get(topId) ?? 'BD'
  }, [employees, employeeTeamMap])
  const submissionTeam = useMemo(() => (submission: BDSubmission): EmployeeTeam | null => {
    const opp = submissionOpportunity(submission, visibleOpps)
    if (opp) {
      const team = opportunityTeam(opp)
      if (team) return team
    }
    const candidateIds = [submission.bdm, ...(submission.bds || []), submission.supportAgent].filter(Boolean) as string[]
    for (const id of candidateIds) {
      const team = employeeTeamMap.get(id)
      if (team) return team
    }
    return null
  }, [opportunityTeam, employeeTeamMap, visibleOpps])

  const bdPeriodOpps = useMemo(
    () => periodOpps.filter(opp => {
      const team = opportunityTeam(opp)
      return team === null || team === 'BD'
    }),
    [periodOpps, opportunityTeam],
  )
  const opsPeriodOpps = useMemo(
    () => periodOpps.filter(opp => opportunityTeam(opp) === 'OPS'),
    [periodOpps, opportunityTeam],
  )
  const bdPeriodSubs = useMemo(
    () => periodSubmissions.filter(submission => {
      const team = submissionTeam(submission)
      return team === null || team === 'BD'
    }),
    [periodSubmissions, submissionTeam],
  )
  const opsPeriodSubs = useMemo(
    () => periodSubmissions.filter(submission => submissionTeam(submission) === 'OPS'),
    [periodSubmissions, submissionTeam],
  )

  const bdEmployees = useMemo(
    () => employees.filter(e => (e.team ?? 'BD') === 'BD'),
    [employees],
  )
  const periodNonSubs = useMemo(
    () => nonSubReports.filter(r => r.status !== 'DECLINED' && filterByPeriod(r.submittedAt, period)),
    [nonSubReports, period],
  )

  const activeOpportunities = bdPeriodOpps.filter(opp => ['ACTIVE', 'DISCUSSION'].includes(opp.status))
  const capturedContracts = bdPeriodOpps.filter(opp => !!opp.capturedOn || ['ACTIVE', 'DISCUSSION', 'SUBMITTED', 'WON'].includes(opp.status))
  const awardedSubmissions = bdPeriodSubs.filter(submission => submission.status === 'AWARDED')
  const submittedValue = bdPeriodSubs.reduce((sum, submission) => sum + submissionValue(submission, visibleOpps), 0)
  const captureRate = pct(capturedContracts.length, bdPeriodSubs.length)
  const winRate = pct(awardedSubmissions.length, bdPeriodSubs.length)

  const submittedByNaics = groupRows(
    bdPeriodSubs,
    submission => naicsDisplay(submissionOpportunity(submission, visibleOpps)?.naicsCode),
  ).slice(0, 8)
  const submittedByType = groupRows(bdPeriodSubs, submission => submission.type || 'Unspecified').slice(0, 6)
  const agencyPerformance = groupRows(
    bdPeriodSubs,
    submission => submissionOpportunity(submission, visibleOpps)?.client || 'Unspecified agency',
    submission => submission.status === 'AWARDED' ? submissionValue(submission, visibleOpps) : 0,
  ).slice(0, 8)

  const months = lastMonths(6)
  const submissionTrend = months.map(month => ({
    month: month.month,
    submitted: bdPeriodSubs.filter(submission => monthKey(submission.submittedOn) === month.key).length,
    awarded: bdPeriodSubs.filter(submission => monthKey(submission.submittedOn) === month.key && submission.status === 'AWARDED').length,
    value: bdPeriodSubs
      .filter(submission => monthKey(submission.submittedOn) === month.key)
      .reduce((sum, submission) => sum + submissionValue(submission, visibleOpps), 0),
  }))

  const recentActivity = [...activityLogs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 16)

  const activeUsers = users.filter(user => user.status === 'active')
  const activeContracts = periodContracts.filter(isActiveContract)
  const archivedContracts = periodContracts.filter(contract => contract.status === 'ARCHIVED')
  const awardedValue = activeContracts.reduce((sum, contract) => sum + numberValue(contract.value, contract.baseAmount), 0)
  const archivedValue = archivedContracts.reduce((sum, contract) => sum + numberValue(contract.value, contract.baseAmount), 0)
  const currentYear = new Date().getFullYear().toString()
  const ytdContracts = contracts.filter(contract => {
    const date = contract.popStart || contract.popEnd || ''
    return !date || date.startsWith(currentYear)
  })
  const grossProfitYtd = ytdContracts.reduce((sum, contract) => sum + grossProfitForContract(contract), 0)

  const contractStatusRows = groupRows(activeContracts, contract => contract.status).slice(0, 7)
  const contractTypeProfitRows = groupRows(
    ytdContracts,
    contract => contract.type || 'Unspecified',
    contract => grossProfitForContract(contract),
  ).slice(0, 7)

  // ── Business Development distributions ────────────────────────────────────
  const oppsByStatus = useMemo(
    () => groupRows(bdPeriodOpps, opp => opp.status || 'Unspecified'),
    [bdPeriodOpps],
  )
  const oppsBySetAside = useMemo(
    () => groupRows(bdPeriodOpps, opp => opp.setAside || 'Unspecified'),
    [bdPeriodOpps],
  )
  const oppsByPriority = useMemo(
    () => groupRows(bdPeriodOpps, opp => opp.priority || 'Unspecified'),
    [bdPeriodOpps],
  )
  const oppsByType = useMemo(
    () => groupRows(bdPeriodOpps, opp => opp.type || 'Unspecified'),
    [bdPeriodOpps],
  )
  const conversionFunnel = useMemo(() => {
    const total = bdPeriodOpps.length
    const submitted = bdPeriodSubs.length
    const awarded = awardedSubmissions.length
    return [
      { name: 'Opportunities', value: total, fill: chartColors[2] },
      { name: 'Submitted', value: submitted, fill: chartColors[1] },
      { name: 'Awarded', value: awarded, fill: chartColors[0] },
    ]
  }, [bdPeriodOpps.length, bdPeriodSubs.length, awardedSubmissions.length, chartColors])
  const topOpenOpps = useMemo(
    () => [...bdPeriodOpps]
      .filter(opp => ['ACTIVE', 'DISCUSSION', 'NEW_ASSIGNMENT'].includes(opp.status))
      .sort((a, b) => opportunityValue(b) - opportunityValue(a))
      .slice(0, 10),
    [bdPeriodOpps],
  )

  // ── Team rollups ──────────────────────────────────────────────────────────
  const employeesById = useMemo(
    () => new Map(employees.map(employee => [employee.id, employee])),
    [employees],
  )
  const reportsByManager = useMemo(() => {
    const map = new Map<string | null, Employee[]>()
    for (const employee of employees) {
      const key = employee.managerId
      const list = map.get(key) ?? []
      list.push(employee)
      map.set(key, list)
    }
    return map
  }, [employees])
  const collectReports = useMemo(() => (rootId: string): Employee[] => {
    const out: Employee[] = []
    const stack = [rootId]
    while (stack.length) {
      const id = stack.pop()!
      for (const child of reportsByManager.get(id) ?? []) {
        out.push(child)
        stack.push(child.id)
      }
    }
    return out
  }, [reportsByManager])

  const computeMemberRollup = useMemo(() => (employeeId: string) => {
    const employee = employeesById.get(employeeId)
    if (!employee) return null
    const subs = periodSubmissions.filter(submission =>
      matchesEmployee(employee, submission, visibleOpps, employees))
    const assignedOpps = visibleOpps.filter(opp => {
      const chain = getAssignmentChain(employees, opp.assignedTo)
      return chain.associate?.id === employee.id ||
        chain.teamLead?.id === employee.id ||
        chain.manager?.id === employee.id
    })
    const awarded = subs.filter(submission => submission.status === 'AWARDED')
    const lost = subs.filter(submission => submission.status === 'LOST')
    const dropped = subs.filter(submission => submission.status === 'DROPPED' || submission.status === 'CANCELED')
    const value = subs.reduce((sum, submission) => sum + submissionValue(submission, visibleOpps), 0)
    const awardedValue = awarded.reduce((sum, submission) => sum + submissionValue(submission, visibleOpps), 0)
    const byStatus = groupRows(subs, submission => submission.status || 'Unspecified')
    const byType = groupRows(subs, submission => submission.type || 'Unspecified')
    const byNaics = groupRows(subs, submission => naicsDisplay(submissionOpportunity(submission, visibleOpps)?.naicsCode))
    const bySetAside = groupRows(assignedOpps, opp => opp.setAside || 'Unspecified')
    const byPriority = groupRows(assignedOpps, opp => opp.priority || 'Unspecified')
    const byAgency = groupRows(assignedOpps, opp => opp.client || 'Unspecified agency').slice(0, 6)
    const assignedByStatus = groupRows(assignedOpps, opp => opp.status || 'Unspecified')
    const monthsData = lastMonths(6).map(month => ({
      month: month.month,
      submitted: subs.filter(s => monthKey(s.submittedOn) === month.key).length,
      awarded: subs.filter(s => monthKey(s.submittedOn) === month.key && s.status === 'AWARDED').length,
    }))
    const valueByMonth = lastMonths(6).map(month => {
      const monthSubs = subs.filter(s => monthKey(s.submittedOn) === month.key)
      return {
        month: month.month,
        value: monthSubs.reduce((sum, s) => sum + submissionValue(s, visibleOpps), 0),
        awarded: monthSubs
          .filter(s => s.status === 'AWARDED')
          .reduce((sum, s) => sum + submissionValue(s, visibleOpps), 0),
      }
    })
    const recent = [...subs]
      .sort((a, b) => new Date(b.submittedOn || 0).getTime() - new Date(a.submittedOn || 0).getTime())
      .slice(0, 8)
    return {
      employee,
      subs, assignedOpps, awarded, lost, dropped,
      value, awardedValue,
      winRate: pct(awarded.length, subs.length),
      captureRate: pct(subs.length, assignedOpps.length),
      byStatus, byType, byNaics, bySetAside, byPriority, byAgency, assignedByStatus,
      monthsData,
      valueByMonth,
      recent,
    }
  }, [employeesById, periodSubmissions, visibleOpps, employees])

  const computeTeamRollup = useMemo(() => (managerId: string) => {
    const manager = employeesById.get(managerId)
    if (!manager) return null
    const members = collectReports(managerId)
    const all = [manager, ...members]
    const subs = periodSubmissions.filter(submission =>
      all.some(employee => matchesEmployee(employee, submission, visibleOpps, employees)))
    const assignedOpps = visibleOpps.filter(opp => {
      const chain = getAssignmentChain(employees, opp.assignedTo)
      return all.some(employee =>
        employee.id === chain.manager?.id ||
        employee.id === chain.teamLead?.id ||
        employee.id === chain.associate?.id)
    })
    const awarded = subs.filter(submission => submission.status === 'AWARDED')
    const lost = subs.filter(submission => submission.status === 'LOST')
    const dropped = subs.filter(submission => submission.status === 'DROPPED' || submission.status === 'CANCELED')
    const notSubmitted = nonSubReports.filter(report => {
      if (report.status !== 'APPROVED') return false
      if (!filterByPeriod(report.reviewedAt || report.submittedAt, period)) return false
      const opp = visibleOpps.find(item => item.id === report.opportunityId)
      const chain = getAssignmentChain(employees, opp?.assignedTo)
      return all.some(employee =>
        employee.id === chain.associate?.id ||
        employee.id === chain.teamLead?.id ||
        employee.id === chain.manager?.id)
    })
    const value = subs.reduce((sum, submission) => sum + submissionValue(submission, visibleOpps), 0)
    const awardedValue = awarded.reduce((sum, submission) => sum + submissionValue(submission, visibleOpps), 0)
    const memberStats = members
      .map(employee => computeMemberRollup(employee.id)!)
      .filter(Boolean)
      .sort((a, b) => b.subs.length - a.subs.length || b.value - a.value)
    const monthsData = lastMonths(6).map(month => ({
      month: month.month,
      submitted: subs.filter(s => monthKey(s.submittedOn) === month.key).length,
      awarded: subs.filter(s => monthKey(s.submittedOn) === month.key && s.status === 'AWARDED').length,
    }))
    const valueByMonth = lastMonths(6).map(month => {
      const monthSubs = subs.filter(s => monthKey(s.submittedOn) === month.key)
      return {
        month: month.month,
        value: monthSubs.reduce((sum, s) => sum + submissionValue(s, visibleOpps), 0),
        awarded: monthSubs
          .filter(s => s.status === 'AWARDED')
          .reduce((sum, s) => sum + submissionValue(s, visibleOpps), 0),
      }
    })
    return {
      manager,
      members,
      all,
      subs, assignedOpps, awarded, lost, dropped, notSubmitted,
      value, awardedValue,
      winRate: pct(awarded.length, subs.length),
      captureRate: pct(subs.length, assignedOpps.length),
      memberStats,
      monthsData,
      valueByMonth,
      byStatus: groupRows(subs, submission => submission.status || 'Unspecified'),
      bySetAside: groupRows(assignedOpps, opp => opp.setAside || 'Unspecified'),
      byPriority: groupRows(assignedOpps, opp => opp.priority || 'Unspecified'),
      byAgency: groupRows(assignedOpps, opp => opp.client || 'Unspecified agency').slice(0, 6),
      byMember: memberStats.map(m => ({
        name: m.employee.name.split(' ')[0],
        submitted: m.subs.length,
        awarded: m.awarded.length,
        value: m.value,
      })),
      byRole: groupRows(all, employee => ROLE_LABELS[employee.role] ?? employee.role),
    }
  }, [employeesById, collectReports, periodSubmissions, visibleOpps, employees, nonSubReports, period, computeMemberRollup])

  // BD managers head their own teams; the OPS lead is mirrored as a BD_MANAGER with team='OPS'.
  const bdTeamHeads = useMemo(
    () => employees.filter(e => e.role === 'BD_MANAGER' && (e.team ?? 'BD') === 'BD'),
    [employees],
  )
  const opsTeamHeads = useMemo(
    () => employees.filter(e => e.role === 'BD_MANAGER' && e.team === 'OPS'),
    [employees],
  )
  const bdTeamRollups = useMemo(
    () => bdTeamHeads.map(head => computeTeamRollup(head.id)!).filter(Boolean),
    [bdTeamHeads, computeTeamRollup],
  )
  const opsTeamRollups = useMemo(
    () => opsTeamHeads.map(head => computeTeamRollup(head.id)!).filter(Boolean),
    [opsTeamHeads, computeTeamRollup],
  )
  const activeBdTeamRollup = useMemo(
    () => bdTeamView.mode === 'team' ? computeTeamRollup(bdTeamView.managerId) : null,
    [bdTeamView, computeTeamRollup],
  )
  const activeBdMemberRollup = useMemo(
    () => bdTeamView.mode === 'member' ? computeMemberRollup(bdTeamView.employeeId) : null,
    [bdTeamView, computeMemberRollup],
  )
  const activeOpsTeamRollup = useMemo(
    () => opsTeamView.mode === 'team' ? computeTeamRollup(opsTeamView.managerId) : null,
    [opsTeamView, computeTeamRollup],
  )
  const activeOpsMemberRollup = useMemo(
    () => opsTeamView.mode === 'member' ? computeMemberRollup(opsTeamView.employeeId) : null,
    [opsTeamView, computeMemberRollup],
  )

  // Smooth-scroll to top of dashboard when drilling into a team or member.
  useEffect(() => {
    if (bdTeamView.mode !== 'teams') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [bdTeamView])
  useEffect(() => {
    if (opsTeamView.mode !== 'teams') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [opsTeamView])

  const goToPipeline = (recordId?: string) => {
    if (recordId) navigate(`/pipeline?record=${encodeURIComponent(recordId)}`)
    else navigate('/pipeline')
  }
  const goToContracts = () => navigate('/contracts')

  const bdStats = [
    { icon: Target, label: 'Active Opportunities', value: activeOpportunities.length, detail: 'Currently in Contract Opportunities', accent: tertiaryAccent },
    { icon: FileCheck2, label: 'Total Captured Contracts', value: capturedContracts.length, detail: 'Captured opportunity records', accent },
    { icon: Send, label: 'Submitted Opportunities', value: bdPeriodSubs.length, detail: 'Submitted from Contract Opportunities', accent: secondaryAccent },
    { icon: DollarSign, label: 'Submitted Value', value: formatCurrency(submittedValue), detail: 'Dollar value submitted', accent: chartColors[3] },
    { icon: Percent, label: 'Capture Rate', value: `${captureRate}%`, detail: 'Captured opportunities / submitted', accent: chartColors[4] },
    { icon: Trophy, label: 'Win Rate', value: `${winRate}%`, detail: 'Awarded from submitted opportunities', accent },
  ]

  const opsStats = [
    { icon: DollarSign, label: 'Awarded Value', value: formatCurrency(awardedValue), detail: 'Active Contract Admin value', accent },
    { icon: FileCheck2, label: 'Awarded Contracts', value: activeContracts.length, detail: 'Active contracts in Contract Admin', accent: secondaryAccent },
    { icon: Clock, label: 'Archived Value', value: formatCurrency(archivedValue), detail: `${archivedContracts.length} archived contracts`, accent: chartColors[3] },
    { icon: TrendingUp, label: 'Gross Profit YTD', value: formatCurrency(grossProfitYtd), detail: 'Contract value minus base/subk costs', accent: grossProfitYtd >= 0 ? accent : chartColors[5] },
  ]

  return (
    <div className={`exec-dashboard exec-dashboard--${prefs.theme} page-enter space-y-5 p-6`}>
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="exec-hero rounded-[1.75rem] px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.30em]" style={{ color: 'var(--accent)' }}>CES - Executive Dashboard</p>
            <h1 className="text-4xl font-black leading-tight md:text-5xl" style={{ color: 'var(--text-primary)' }}>Company Command Center</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              A polished executive cockpit for {currentUser ? ROLE_LABELS[currentUser.role] : 'managers'} across Business Development, team output and Operations performance.
            </p>
          </div>
          <div className="min-w-[200px]">
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>Period</p>
              <div className="mt-2">
                <PeriodFilter value={period} onChange={setPeriod} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={stagger} initial="initial" animate="animate" className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        {visibleTabs.map(item => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <motion.button
              key={item.id}
              variants={fadeUp}
              type="button"
              onClick={() => setTab(item.id)}
              className={`exec-tab-card rounded-2xl border p-4 text-left transition-all ${active ? 'is-active' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 13%, transparent)', color: 'var(--accent)' }}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.subtitle}</p>
                </div>
              </div>
            </motion.button>
          )
        })}
      </motion.div>

      {tab === 'bd' && (
        <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {bdStats.map(stat => (
              <DashboardStat key={stat.label} {...stat} onClick={() => goToPipeline()} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <BdPiePanel
              title="By Status"
              subtitle="Pipeline distribution across statuses"
              data={oppsByStatus}
              chartColors={chartColors}
              total={bdPeriodOpps.length}
              onSlice={() => goToPipeline()}
              colorOverride={(name) => STATUS_COLORS[name]}
            />
            <BdPiePanel
              title="By Set-Aside"
              subtitle="Active socio-economic designations"
              data={oppsBySetAside}
              chartColors={chartColors}
              total={bdPeriodOpps.length}
              onSlice={() => goToPipeline()}
            />
            <BdPiePanel
              title="By Priority"
              subtitle="Priority mix in the current period"
              data={oppsByPriority}
              chartColors={chartColors}
              total={bdPeriodOpps.length}
              onSlice={() => goToPipeline()}
            />
            <BdPiePanel
              title="By Type"
              subtitle="OTJ, recurring and other vehicles"
              data={oppsByType}
              chartColors={chartColors}
              total={bdPeriodOpps.length}
              onSlice={() => goToPipeline()}
            />
          </div>

          <BdPeopleGrid
            bdEmployees={bdEmployees}
            users={users}
            submissions={bdPeriodSubs}
            nonSubs={periodNonSubs}
            visibleOpps={visibleOpps}
            employees={employees}
            chartColors={chartColors}
            accent={accent}
            secondaryAccent={secondaryAccent}
            tertiaryAccent={tertiaryAccent}
            onPickMember={(employeeId) => { setTab('team'); setBdTeamView({ mode: 'member', employeeId }) }}
          />

          <div className="exec-section-grid">
            <DashboardPanel title="Submission Trend" subtitle="Submissions, awards and dollar value by month">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={submissionTrend} onClick={() => goToPipeline()} style={{ cursor: 'pointer' }}>
                  <defs>
                    <linearGradient id="submittedValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={secondaryAccent} stopOpacity={0.34} />
                      <stop offset="100%" stopColor={secondaryAccent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#9FB2AD', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="count" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="value" orientation="right" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round(v / 1000)}K`} />
                  <Tooltip content={<ExecutiveTooltip />} />
                  <Area yAxisId="value" type="monotone" dataKey="value" name="Submitted Value" stroke={secondaryAccent} strokeWidth={2.5} fill="url(#submittedValue)" isAnimationActive={false} />
                  <Bar yAxisId="count" dataKey="submitted" name="Submitted" fill={tertiaryAccent} radius={[5, 5, 0, 0]} isAnimationActive={false} />
                  <Bar yAxisId="count" dataKey="awarded" name="Awarded" fill={accent} radius={[5, 5, 0, 0]} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </DashboardPanel>

            <DashboardPanel title="Conversion Funnel" subtitle="Opportunities → Submitted → Awarded">
              {periodOpps.length === 0 ? (
                <EmptyDashboardState label="No opportunities in range." />
              ) : (
                <div className="flex h-[260px] flex-col gap-3">
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={conversionFunnel} layout="vertical" margin={{ left: 8, right: 12 }} onClick={() => goToPipeline()} style={{ cursor: 'pointer' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#C7D7D3', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ExecutiveTooltip />} />
                      <Bar dataKey="value" name="Records" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                        {conversionFunnel.map(entry => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-3 gap-2 px-1">
                    {conversionFunnel.map((stage, idx) => {
                      const prev = idx === 0 ? stage.value : conversionFunnel[idx - 1].value
                      const conv = pct(stage.value, prev || 1)
                      return (
                        <div key={stage.name} className="rounded-xl border p-2 text-center" style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{stage.name}</p>
                          <p className="mt-0.5 text-base font-black" style={{ color: 'var(--text-primary)' }}>{stage.value}</p>
                          {idx > 0 && (
                            <p className="text-[10px] font-bold" style={{ color: stage.fill }}>{conv}% of prior</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </DashboardPanel>
          </div>

          <div className="exec-section-grid">
            <DashboardPanel title="Submitted by NAICS" subtitle="Submitted opportunities per NAICS code">
              {submittedByNaics.length === 0 ? (
                <EmptyDashboardState label="No submitted NAICS data yet." />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={submittedByNaics} layout="vertical" margin={{ left: 16, right: 12 }} onClick={() => goToPipeline()} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" width={170} tick={{ fill: '#C7D7D3', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ExecutiveTooltip />} />
                    <Bar dataKey="count" name="Submissions" fill={tertiaryAccent} radius={[0, 6, 6, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DashboardPanel>

            <DashboardPanel
              title="Top Open Opportunities"
              subtitle="Highest value records open in pipeline"
              action={topOpenOpps.length > 0 ? (
                <button onClick={() => goToPipeline()} className="rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-colors" style={{ borderColor: 'var(--exec-border-strong)', color: 'var(--accent)', background: 'var(--exec-panel-soft)' }}>
                  Open pipeline
                </button>
              ) : undefined}
            >
              {topOpenOpps.length === 0 ? (
                <EmptyDashboardState label="No open opportunities yet." />
              ) : (
                <div className="space-y-2">
                  {topOpenOpps.map((opp, index) => (
                    <button
                      key={opp.id}
                      type="button"
                      onClick={() => goToPipeline(opp.id)}
                      className="group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all hover:-translate-y-px"
                      style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}
                    >
                      <div className="w-6 flex-shrink-0 text-center text-xs font-black" style={{ color: 'var(--accent)' }}>#{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black" style={{ color: 'var(--text-primary)' }}>{opp.solicitation || opp.solicitationId || 'Untitled opportunity'}</p>
                        <p className="truncate text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                          {opp.client || 'No agency'} · {opp.status || 'No status'}{opp.setAside ? ` · ${opp.setAside}` : ''}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-black" style={{ color: 'var(--accent)' }}>{formatCurrency(opportunityValue(opp))}</p>
                        <p className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                          <span className="inline-flex items-center gap-0.5 opacity-70 group-hover:opacity-100">Open <ChevronRight size={11} /></span>
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </DashboardPanel>
          </div>

          <DashboardPanel title="Agency Performance" subtitle="Agencies ranked by awarded value from submitted opportunities">
            {agencyPerformance.length === 0 ? (
              <EmptyDashboardState label="No agency performance yet." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agencyPerformance} layout="vertical" margin={{ left: 16, right: 20 }} onClick={() => goToPipeline()} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={value => `$${Math.round(Number(value) / 1000)}K`} />
                    <YAxis dataKey="name" type="category" width={170} tick={{ fill: '#C7D7D3', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ExecutiveTooltip />} />
                    <Bar dataKey="value" name="Awarded Value" fill={accent} radius={[0, 6, 6, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {agencyPerformance.map((agency, index) => (
                    <button
                      key={agency.name}
                      type="button"
                      onClick={() => goToPipeline()}
                      className="block w-full rounded-xl border p-3 text-left transition-all hover:-translate-y-px"
                      style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black" style={{ color: 'var(--text-primary)' }}>{agency.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{agency.count} records</p>
                        </div>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors[index % chartColors.length] }} />
                      </div>
                      <p className="mt-2 text-sm font-black" style={{ color: 'var(--accent)' }}>{formatCurrency(agency.value)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </DashboardPanel>
        </motion.div>
      )}

      {tab === 'team' && (
        <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
          {bdTeamView.mode === 'teams' && (
            <TeamsOverview
              teamRollups={bdTeamRollups}
              activeUsers={activeUsers}
              chartColors={chartColors}
              accent={accent}
              secondaryAccent={secondaryAccent}
              tertiaryAccent={tertiaryAccent}
              emptyLabel="No Business Development teams yet."
              kpiLabel="Business Development Teams"
              onPickTeam={(managerId) => setBdTeamView({ mode: 'team', managerId })}
              onPickMember={(employeeId) => setBdTeamView({ mode: 'member', employeeId })}
            />
          )}

          {bdTeamView.mode === 'team' && activeBdTeamRollup && (
            <TeamDetailView
              rollup={activeBdTeamRollup}
              chartColors={chartColors}
              accent={accent}
              secondaryAccent={secondaryAccent}
              tertiaryAccent={tertiaryAccent}
              onBack={() => setBdTeamView({ mode: 'teams' })}
              onPickMember={(employeeId) => setBdTeamView({ mode: 'member', employeeId })}
            />
          )}

          {bdTeamView.mode === 'team' && !activeBdTeamRollup && (
            <DashboardPanel title="Team not found" subtitle="">
              <div className="flex items-center justify-between gap-3">
                <EmptyDashboardState label="This team is no longer available." />
                <button onClick={() => setBdTeamView({ mode: 'teams' })} className="rounded-xl border px-3 py-1.5 text-xs font-black" style={{ borderColor: 'var(--exec-border-strong)', color: 'var(--text-primary)', background: 'var(--exec-panel-soft)' }}>
                  Back to teams
                </button>
              </div>
            </DashboardPanel>
          )}

          {bdTeamView.mode === 'member' && activeBdMemberRollup && (
            <MemberDetailView
              rollup={activeBdMemberRollup}
              employees={employees}
              chartColors={chartColors}
              accent={accent}
              secondaryAccent={secondaryAccent}
              tertiaryAccent={tertiaryAccent}
              onBack={() => setBdTeamView({ mode: 'teams' })}
              onBackToTeam={(managerId) => setBdTeamView({ mode: 'team', managerId })}
              onOpenOpportunity={(id) => goToPipeline(id)}
            />
          )}

          {bdTeamView.mode === 'member' && !activeBdMemberRollup && (
            <DashboardPanel title="Member not found" subtitle="">
              <div className="flex items-center justify-between gap-3">
                <EmptyDashboardState label="This member is no longer available." />
                <button onClick={() => setBdTeamView({ mode: 'teams' })} className="rounded-xl border px-3 py-1.5 text-xs font-black" style={{ borderColor: 'var(--exec-border-strong)', color: 'var(--text-primary)', background: 'var(--exec-panel-soft)' }}>
                  Back to teams
                </button>
              </div>
            </DashboardPanel>
          )}
        </motion.div>
      )}

      {tab === 'activity' && (
        <div className="space-y-5">
          <DashboardPanel
            title="Live Activity Log"
            subtitle="Latest app activity only"
            action={<span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-300">Live</span>}
          >
            {!hasPermission(currentUser, 'admin:manageUsers') ? (
              <EmptyDashboardState label="You do not have access to the live activity log." />
            ) : recentActivity.length === 0 ? (
              <EmptyDashboardState label="No activity recorded yet." />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {recentActivity.map(log => (
                  <div key={log.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black" style={{ background: `${secondaryAccent}24`, color: secondaryAccent }}>
                        {log.user.split(' ').map(part => part[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{log.action}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                          {log.user} | {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardPanel>
        </div>
      )}

      {tab === 'ops' && (
        <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            {opsStats.map(stat => <DashboardStat key={stat.label} {...stat} />)}
          </div>

          <div className="exec-section-grid">
            <DashboardPanel title="Contract Status" subtitle="Active Contract Admin records by status">
              {contractStatusRows.length === 0 ? (
                <EmptyDashboardState label="No active contract status data yet." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={contractStatusRows} dataKey="count" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} stroke="transparent" strokeWidth={0} isAnimationActive={false}>
                      {contractStatusRows.map((_, index) => (
                        <Cell key={index} fill={chartColors[index % chartColors.length]} stroke="transparent" strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip content={<ExecutiveTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#C7D7D3' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </DashboardPanel>

            <DashboardPanel title="Gross Profit by Type" subtitle="YTD contract value minus base/subk costs">
              {contractTypeProfitRows.length === 0 ? (
                <EmptyDashboardState label="No gross profit data yet." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={contractTypeProfitRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--exec-grid)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#9FB2AD', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9FB2AD', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round(v / 1000)}K`} />
                    <Tooltip content={<ExecutiveTooltip />} />
                    <Bar dataKey="value" name="Gross Profit Value" fill={accent} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DashboardPanel>

            <DashboardPanel title="Operations Portfolio" subtitle="Top active contracts by awarded value">
              {activeContracts.length === 0 ? (
                <EmptyDashboardState label="No active contracts yet." />
              ) : (
                <div className="space-y-3">
                  {activeContracts
                    .sort((a, b) => numberValue(b.value) - numberValue(a.value))
                    .slice(0, 8)
                    .map(contract => (
                      <div key={contract.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--exec-border)', background: 'var(--exec-panel-soft)' }}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black" style={{ color: 'var(--text-primary)' }}>{contract.title}</p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{contract.contractId} | {contract.status}</p>
                          </div>
                          <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-black text-emerald-300">{formatCurrency(numberValue(contract.value))}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          <span>Subk: <b style={{ color: 'var(--text-secondary)' }}>{formatCurrency(lockedSubkSpend(contract))}</b></span>
                          <span>Profit: <b style={{ color: 'var(--text-secondary)' }}>{formatCurrency(grossProfitForContract(contract))}</b></span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </DashboardPanel>
          </div>

          <div className="exec-panel rounded-2xl border p-5" style={EXEC_PANEL_STYLE}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: `${tertiaryAccent}1F`, color: tertiaryAccent }}>
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>Operations Team Performance</h2>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Operations teams, members, and individual scorecards</p>
              </div>
            </div>

            {opsTeamView.mode === 'teams' && (
              <TeamsOverview
                teamRollups={opsTeamRollups}
                activeUsers={activeUsers}
                chartColors={chartColors}
                accent={accent}
                secondaryAccent={secondaryAccent}
                tertiaryAccent={tertiaryAccent}
                kpiLabel="Operations Teams"
                emptyLabel="No Operations teams yet. Create employees with team='OPS' and assign a manager."
                onPickTeam={(managerId) => setOpsTeamView({ mode: 'team', managerId })}
                onPickMember={(employeeId) => setOpsTeamView({ mode: 'member', employeeId })}
              />
            )}

            {opsTeamView.mode === 'team' && activeOpsTeamRollup && (
              <TeamDetailView
                rollup={activeOpsTeamRollup}
                chartColors={chartColors}
                accent={accent}
                secondaryAccent={secondaryAccent}
                tertiaryAccent={tertiaryAccent}
                onBack={() => setOpsTeamView({ mode: 'teams' })}
                onPickMember={(employeeId) => setOpsTeamView({ mode: 'member', employeeId })}
              />
            )}

            {opsTeamView.mode === 'team' && !activeOpsTeamRollup && (
              <DashboardPanel title="Team not found" subtitle="">
                <div className="flex items-center justify-between gap-3">
                  <EmptyDashboardState label="This team is no longer available." />
                  <button onClick={() => setOpsTeamView({ mode: 'teams' })} className="rounded-xl border px-3 py-1.5 text-xs font-black" style={{ borderColor: 'var(--exec-border-strong)', color: 'var(--text-primary)', background: 'var(--exec-panel-soft)' }}>
                    Back to teams
                  </button>
                </div>
              </DashboardPanel>
            )}

            {opsTeamView.mode === 'member' && activeOpsMemberRollup && (
              <MemberDetailView
                rollup={activeOpsMemberRollup}
                employees={employees}
                chartColors={chartColors}
                accent={accent}
                secondaryAccent={secondaryAccent}
                tertiaryAccent={tertiaryAccent}
                onBack={() => setOpsTeamView({ mode: 'teams' })}
                onBackToTeam={(managerId) => setOpsTeamView({ mode: 'team', managerId })}
                onOpenOpportunity={(id) => goToPipeline(id)}
              />
            )}

            {opsTeamView.mode === 'member' && !activeOpsMemberRollup && (
              <DashboardPanel title="Member not found" subtitle="">
                <div className="flex items-center justify-between gap-3">
                  <EmptyDashboardState label="This member is no longer available." />
                  <button onClick={() => setOpsTeamView({ mode: 'teams' })} className="rounded-xl border px-3 py-1.5 text-xs font-black" style={{ borderColor: 'var(--exec-border-strong)', color: 'var(--text-primary)', background: 'var(--exec-panel-soft)' }}>
                    Back to teams
                  </button>
                </div>
              </DashboardPanel>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Admin / Manager Dashboard
function AdminDashboard() {
  const { opportunities, nonSubReports, deletionRequests, activityLogs, currentUser, bdSubmissions, contracts, employees } = useStore()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period | null>(null)
  const [leaderRole, setLeaderRole] = useState<'ALL' | 'BD_MANAGER' | 'TEAM_LEAD' | 'ASSOCIATE'>('ALL')
  const [activeKpi, setActiveKpi] = useState<KpiDetail | null>(null)

  const opps = opportunities.filter(o => !o.isDeleted)
  const filteredOpps = opps.filter(o => filterByPeriod(o.submittedAt || o.dueDate, period))
  const filteredSubmissions = bdSubmissions.filter(s =>
    filterByPeriod(s.submittedOn || s.dueDate, period)
  )

  const monthSeries = Array.from({ length: 6 }, (_, offset) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - offset))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { key, month: d.toLocaleDateString('en-US', { month: 'short' }) }
  })

  const revData = monthSeries.map(m => ({
    month: m.month,
    revenue: filteredSubmissions
      .filter(s => (s.submittedOn || '').startsWith(m.key))
      .reduce((sum, s) => sum + Number(s.value || 0), 0),
  }))

  const subData = monthSeries.map(m => ({
    month: m.month,
    submissions: filteredSubmissions.filter(s => (s.submittedOn || '').startsWith(m.key)).length,
    wins: filteredSubmissions.filter(s => (s.submittedOn || '').startsWith(m.key) && s.status === 'AWARDED').length,
  }))

  const active    = filteredOpps.filter(o => o.status === 'ACTIVE').length
  const submitted = filteredSubmissions.length
  const won       = filteredSubmissions.filter(o => o.status === 'AWARDED').length
  const totalSubs = filteredSubmissions.length
  const totalWins = filteredSubmissions.filter(s => s.status === 'AWARDED').length
  const winRate   = totalSubs > 0 ? Math.round((totalWins / totalSubs) * 100) : 0
  const revenue   = filteredSubmissions.reduce((s, d) => s + Number(d.value || 0), 0)
  const archivedRevenue = contracts
    .filter(c => c.status === 'ARCHIVED' && filterByPeriod(c.popEnd || c.popStart, period))
    .reduce((sum, c) => sum + Number(c.value || 0), 0)

  const pipelineData = useMemo(() => {
    const counts: Record<string, number> = {}
    opps.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1 })
    const total = opps.length
    return Object.entries(counts).map(([name, value]) => ({ name, value, total })).sort((a, b) => b.value - a.value)
  }, [opps])

  const typeData = useMemo(() => {
    const counts: Record<string, number> = {}
    opps.forEach(o => { counts[o.type] = (counts[o.type] || 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [opps])

  const naicsData = useMemo(() => {
    const counts: Record<string, number> = {}
    opps.forEach(o => { counts[o.naicsCode || 'Unspecified'] = (counts[o.naicsCode || 'Unspecified'] || 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [opps])

  const TYPE_COLORS = ['#6366F1', '#22C55E', '#F59E0B', '#06B6D4', '#8B5CF6', '#F97316']

  const agents = employees
    .filter(e => leaderRole === 'ALL' || e.role === leaderRole)
    .map(e => {
      const submissions = filteredSubmissions.filter(s => {
        const opp = opportunities.find(o => o.solicitationId === s.solicitationId)
        const chain = getAssignmentChain(employees, opp?.assignedTo)
        return chain.manager?.id === e.id || chain.teamLead?.id === e.id || chain.associate?.id === e.id ||
          [s.bdm, s.bds, s.supportAgent].some(name => (name || '').toLowerCase() === e.name.toLowerCase())
      })
      const wins = submissions.filter(s => s.status === 'AWARDED').length
      const losses = submissions.filter(s => ['LOST', 'DROPPED', 'CANCELED', 'NOT_SUBMITTED'].includes(s.status)).length
      const winRate = submissions.length ? Math.round((wins / submissions.length) * 100) : 0
      const score = Math.min(100, Math.round(submissions.length * 10 + wins * 18 - losses * 5))
      return {
        username: e.email,
        name: e.name,
        avatar: e.avatar,
        role: e.role,
        submissions: submissions.length,
        wins,
        losses,
        nonSubs: submissions.filter(s => s.status === 'NOT_SUBMITTED').length,
        active: opportunities.filter(o => o.assignedTo === e.id && o.status === 'ACTIVE').length,
        winRate,
        submissionRate: opportunities.length ? Math.round((submissions.length / opportunities.length) * 100) : 0,
        score,
        rank: 0,
        goal: 5,
        streak: submissions.length ? 1 : 0,
      }
    })
    .sort((a, b) => b.score - a.score)

  const winRateData = agents.slice(0, 5).map(a => ({
    name: a.name.split(' ')[0], winRate: a.winRate, fill: STATUS_COLORS.ACTIVE,
  }))

  const upcoming = opps
    .filter(o => o.status === 'ACTIVE')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5)

  const kpis = [
    { key: 'revenue',  icon: DollarSign,   label: 'Period Revenue',    value: revenue,                     display: formatCurrency(revenue), color: '#6366F1', change: `${filteredOpps.length} records`, up: revenue > 0 },
    { key: 'net',      icon: TrendingUp,    label: 'Net Revenue',       value: archivedRevenue,             display: formatCurrency(archivedRevenue), color: '#0F766E', change: 'archived only', up: archivedRevenue > 0 },
    { key: 'pipeline', icon: Target,        label: 'Active Pipeline',   value: active,                      display: null, color: '#06B6D4', change: `${submitted} submitted`, up: true },
    { key: 'submissions', icon: Send,       label: 'Total Submissions', value: totalSubs,                   display: null, color: '#22C55E', change: `${totalWins} wins`, up: totalSubs > 0 },
    { key: 'winrate',  icon: Percent,       label: 'Submission Conversion', value: winRate,                 display: `${winRate}%`, color: '#F59E0B', change: `${totalWins} awarded`, up: winRate > 30 },
    { key: 'won',      icon: FileCheck2,    label: 'Won Contracts',     value: won,                         display: null, color: '#8B5CF6', change: `${filteredOpps.length} tracked`, up: true },
  ]

  return (
    <div className="p-6 space-y-5 page-enter">
      {/* Header */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] mb-1">CES - COMMAND CENTER</p>
            <h1 className="text-2xl font-black text-slate-900">Company Overview</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Metrics from current opportunity and contract data.
            </p>
          </div>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={stagger} initial="initial" animate="animate"
        className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(k => (
          <motion.div key={k.label} variants={fadeUp}>
            <div
              className="kpi-card group"
              style={{ '--kpi-color': k.color } as any}
              onClick={() => setActiveKpi({ key: k.key, label: k.label, color: k.color })}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: k.color + '15' }}>
                  <k.icon size={16} style={{ color: k.color }} />
                </div>
                <div className="flex items-center gap-0.5 text-[10px] font-bold"
                  style={{ color: k.up ? '#22C55E' : k.value > 0 ? '#EF4444' : '#94A3B8' }}>
                  {k.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {k.change}
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mb-0.5">
                {k.display ?? <AnimatedNumber value={k.value} />}
              </p>
              <p className="text-xs font-medium text-slate-500">{k.label}</p>
              <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-indigo-500 transition-colors">
                <span>Details</span> <ChevronRight size={9} />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts row 1 */}
      <motion.div variants={stagger} initial="initial" animate="animate"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <BarChart2 size={14} className="text-indigo-500" /> Revenue Trend
              </h3>
              <p className="text-xs text-slate-500">Captured revenue by month</p>
            </div>
            <span className="text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md cursor-pointer hover:bg-emerald-100 transition-colors"
              onClick={() => setActiveKpi({ key: 'revenue', label: 'Period Revenue', color: '#6366F1' })}>
              {revData.length > 0 ? 'Live data' : 'No trend'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={revData} style={{ cursor: 'pointer' }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="#6366F1" strokeWidth={2.5} fill="url(#revGrad)"
                dot={{ fill: '#6366F1', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#6366F1', cursor: 'pointer' }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-0.5">Pipeline Status</h3>
          <p className="text-xs text-slate-500 mb-3 cursor-pointer hover:text-indigo-600 transition-colors"
            onClick={() => navigate('/pipeline')}>
            {opps.length > 0 ? `${opps.length} pipeline records - open pipeline` : 'No pipeline records yet'}
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart style={{ cursor: 'pointer' }}>
              <Pie data={pipelineData} cx="50%" cy="50%"
                innerRadius={40} outerRadius={58} paddingAngle={2} dataKey="value"
                stroke="transparent" strokeWidth={0}
                onClick={() => setActiveKpi({ key: 'pipeline', label: 'Active Pipeline', color: '#06B6D4' })}>
                {pipelineData.map(entry => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#CBD5E1'} stroke="transparent" strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip content={<PieTip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
            {pipelineData.slice(0, 6).map(d => (
              <div key={d.name} className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => navigate('/pipeline')}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[d.name] || '#CBD5E1' }} />
                <span className="text-[10px] text-slate-500 truncate">{d.name}</span>
                <span className="text-[10px] font-bold text-slate-700 ml-auto">{d.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Charts row 2 */}
      <motion.div variants={stagger} initial="initial" animate="animate"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Submissions vs Wins</h3>
              <p className="text-xs text-slate-500">Monthly breakdown</p>
            </div>
            <button onClick={() => setActiveKpi({ key: 'submissions', label: 'Total Submissions', color: '#22C55E' })}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
              Submission details
            </button>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={subData} barGap={2} barCategoryGap="30%" style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#64748B' }} />
              <Bar dataKey="submissions" name="Submissions" fill="#6366F1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="wins" name="Wins" fill="#22C55E" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Contract Type Mix</h3>
              <p className="text-xs text-slate-500">Distribution across pipeline</p>
            </div>
          </div>
          <div className="flex gap-5 items-center">
            <ResponsiveContainer width={130} height={130}>
              <PieChart style={{ cursor: 'pointer' }}>
                <Pie data={typeData} cx="50%" cy="50%"
                  innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value"
                  stroke="transparent" strokeWidth={0}>
                  {typeData.map((_, idx) => <Cell key={idx} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} stroke="transparent" strokeWidth={0} />)}
                </Pie>
                <Tooltip content={<PieTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {typeData.map((d, idx) => {
                const pct = Math.round((d.value / opps.length) * 100)
                return (
                  <div key={d.name}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-semibold text-slate-600">{d.name}</span>
                      <span className="text-xs font-bold text-slate-800">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div className="h-full rounded-full" style={{ background: TYPE_COLORS[idx % TYPE_COLORS.length] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.2 + idx * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Leaderboard + Actions */}
      <motion.div variants={stagger} initial="initial" animate="animate"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Leaderboard */}
        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden lg:col-span-2">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Trophy size={14} className="text-amber-500" /> Agent Leaderboard
            </h3>
            <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
              {(['ALL', 'BD_MANAGER', 'TEAM_LEAD', 'ASSOCIATE'] as const).map(r => (
                <button key={r} onClick={() => setLeaderRole(r)}
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                    leaderRole === r ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {agents.map((a, i) => {
              const t = getTier(a.score)
              return (
                <motion.div key={a.username}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + i * 0.06 }}
                  whileHover={{ x: 3, backgroundColor: '#F9FAFB' }}
                  onClick={() => setActiveKpi({ key: 'winrate', label: 'Win Rates Breakdown', color: '#F59E0B' })}
                  className="px-5 py-3 flex items-center gap-3 transition-all cursor-pointer">
                  <div className="w-6 text-center flex-shrink-0">
                    <span className="text-[11px] text-slate-400 font-bold">#{i + 1}</span>
                  </div>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white bg-gradient-to-br ${avatarColor(a.avatar)}`}>
                    {a.avatar.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{a.name}</p>
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{a.role}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div className="h-full rounded-full" style={{ background: t.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${a.score}%` }}
                          transition={{ delay: 0.2 + i * 0.06, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                      <span className="text-[10px] font-bold flex-shrink-0" style={{ color: t.color }}>{a.score}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[11px] font-bold text-slate-700">{a.wins}W / {a.losses}L</p>
                    <p className="text-[10px] text-slate-500">{a.winRate}% WR</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                    <Flame size={11} className="text-amber-500" />
                    <span className="text-[10px] text-amber-600 font-bold">{a.streak}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* Right column */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4">
          {/* NAICS distribution */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <BarChart2 size={13} className="text-indigo-500" /> NAICS Distribution
            </h3>
            <div className="space-y-2">
              {naicsData.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No NAICS data yet.</p>}
              {naicsData.map((item, idx) => {
                const pct = Math.round((item.value / Math.max(1, opps.length)) * 100)
                return (
                <div key={item.name} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-700">{item.name}</p>
                    <p className="text-xs font-black text-slate-900">{item.value}</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: TYPE_COLORS[idx % TYPE_COLORS.length] }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )})}
            </div>
          </div>

          {/* Upcoming deadlines */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Clock size={13} className="text-indigo-500" /> Upcoming Deadlines
            </h3>
            <div className="space-y-2">
              {upcoming.map((o, i) => {
                const daysUntil = Math.ceil((new Date(o.dueDate).getTime() - Date.now()) / 86400000)
                const isUrgent = daysUntil <= 2
                return (
                  <motion.div key={o.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.08 + i * 0.05 }}
                    whileHover={{ x: 2 }}
                    onClick={() => navigate('/pipeline')}
                    className="flex items-start gap-2 cursor-pointer hover:bg-slate-50 rounded-lg p-1.5 -mx-1.5 transition-all">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isUrgent ? 'bg-red-500' : 'bg-indigo-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-slate-700 truncate">{o.solicitation}</p>
                      <p className="text-[10px] text-slate-400">{o.bds} - {o.type}</p>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isUrgent ? 'text-red-600 bg-red-50' : 'text-slate-500 bg-slate-100'}`}>
                      {daysUntil <= 0 ? 'PAST' : `${daysUntil}d`}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Top win rates */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <TrendingUp size={13} className="text-emerald-500" /> Top Win Rates
            </h3>
            <ResponsiveContainer width="100%" height={110}>
              <RadialBarChart cx="50%" cy="50%" innerRadius={18} outerRadius={52}
                data={winRateData} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="winRate" cornerRadius={4} background={{ fill: 'rgba(215,190,122,0.12)' }}>
                  {winRateData.map((_, idx) => (
                    <Cell key={idx} fill={['#6366F1', '#22C55E', '#F59E0B', '#06B6D4', '#8B5CF6'][idx]} stroke="transparent" strokeWidth={0} />
                  ))}
                </RadialBar>
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null
                  return (
                    <div className="bg-white rounded-lg px-2 py-1.5 shadow border border-slate-200 text-xs pointer-events-none">
                      <p className="font-bold text-slate-800">{payload[0].payload.name}</p>
                      <p className="text-slate-500">{payload[0].value}% WR</p>
                    </div>
                  )
                }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-1">
              {winRateData.map((d, idx) => (
                <div key={d.name} className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setActiveKpi({ key: 'winrate', label: 'Win Rates Breakdown', color: '#F59E0B' })}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: ['#6366F1', '#22C55E', '#F59E0B', '#06B6D4', '#8B5CF6'][idx] }} />
                    <span className="text-[10px] text-slate-600">{d.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-700">{d.winRate}%</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Agent performance bar + Activity logs */}
      <motion.div variants={stagger} initial="initial" animate="animate"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Agent Performance Breakdown</h3>
              <p className="text-xs text-slate-500">Submissions, wins, and non-submissions per agent</p>
            </div>
            <button onClick={() => setActiveKpi({ key: 'submissions', label: 'Submissions Detail', color: '#6366F1' })}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
              {agents.length > 0 ? `${agents.length} team members` : 'No team stats yet'}
            </button>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={agents} barGap={2} barCategoryGap="25%"
              style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tickFormatter={v => v.split(' ')[0]}
                tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#64748B' }} />
              <Bar dataKey="submissions" name="Submissions" fill="#6366F1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="wins" name="Wins" fill="#22C55E" radius={[3, 3, 0, 0]} />
              <Bar dataKey="nonSubs" name="Non-Subs" fill="#F59E0B" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Activity Log (admin only) */}
        {hasPermission(currentUser, 'admin:manageUsers') && (
          <motion.div variants={fadeUp} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Activity size={13} className="text-indigo-500" /> Activity Log
              </h3>
              <span className="text-[10px] text-slate-400">Live</span>
            </div>
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {activityLogs.slice(0, 15).map((log, i) => (
                <motion.div key={log.id}
                  initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[9px] font-black text-indigo-600">
                        {log.user.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-700 leading-snug">{log.action}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-slate-400">{log.user}</span>
                        <span className="text-[9px] text-slate-300">-</span>
                        <span className="text-[9px] text-slate-400">
                          {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* KPI detail drawer — portaled to <body> because framer-motion `transform` ancestors
          break `position: fixed` and would otherwise anchor the drawer to the dashboard subtree. */}
      {createPortal(
        <AnimatePresence>
          {activeKpi && (
            <>
              <motion.div key="kpi-drawer-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/20" onClick={() => setActiveKpi(null)} />
              <KpiDetailDrawer
                key="kpi-drawer-panel"
                kpi={activeKpi}
                opportunities={opps}
                nonSubReports={nonSubReports}
                deletionRequests={deletionRequests}
                onClose={() => setActiveKpi(null)}
              />
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { currentUser } = useStore()
  const navigate = useNavigate()
  useEffect(() => {
    if (isOpsAgent(currentUser)) navigate('/contracts', { replace: true })
  }, [currentUser, navigate])
  if (isOpsAgent(currentUser)) return null
  const seesCompanyDashboard = hasAnyPermission(currentUser, ['admin:manageUsers', 'opportunity:assign', 'operations:manage'])
  return seesCompanyDashboard ? <ExecutiveDashboard /> : <AgentDashboard />
}
