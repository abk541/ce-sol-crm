import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Users, Send, AlertTriangle, CheckCircle2, Clock, ChevronDown,
  TrendingUp, Activity, Filter, Award, Target,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { avatarColor } from '../../lib/utils'
import PeriodFilter, { type Period, filterByPeriod } from './PeriodFilter'
import AnimatedNumber from './AnimatedNumber'
import type { Employee, EmployeeTeam, HierarchyRole } from '../../types'

const ROLE_BADGE: Record<HierarchyRole, { label: string; color: string; bg: string }> = {
  BD_MANAGER: { label: 'BDM',          color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  TEAM_LEAD:  { label: 'Team Lead',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  ASSOCIATE:  { label: 'BDS',          color: '#22D3EE', bg: 'rgba(34,211,238,0.12)' },
}

const GOAL_BY_ROLE: Record<HierarchyRole, number> = {
  BD_MANAGER: 20,
  TEAM_LEAD: 15,
  ASSOCIATE: 10,
}

function normalize(value: string | undefined | null) {
  return (value ?? '').trim().toLowerCase()
}

// All employee ids the current user is allowed to see (themselves + everyone below them in the hierarchy).
function visibleEmployeeIds(employees: Employee[], userRole: string, currentEmployee: Employee | undefined): Set<string> {
  if (userRole === 'CAPTURE_MANAGER') return new Set(employees.map(e => e.id))
  if (!currentEmployee) return new Set()

  const ids = new Set<string>([currentEmployee.id])
  const stack: string[] = [currentEmployee.id]
  while (stack.length) {
    const head = stack.pop()
    employees
      .filter(e => e.managerId === head)
      .forEach(report => {
        if (!ids.has(report.id)) {
          ids.add(report.id)
          stack.push(report.id)
        }
      })
  }
  return ids
}

export default function TeamStatisticsPanel({ defaultPeriod = null as Period | null }: { defaultPeriod?: Period | null }) {
  const { currentUser, employees, users, bdSubmissions, nonSubReports } = useStore()
  const [period, setPeriod] = useState<Period | null>(defaultPeriod)
  const [teamFilter, setTeamFilter] = useState<'ALL' | EmployeeTeam>('ALL')
  const [personFilter, setPersonFilter] = useState<string>('ALL')

  const currentEmployee = useMemo(() => {
    if (!currentUser) return undefined
    const email = normalize(currentUser.email)
    const name = normalize(currentUser.name)
    return employees.find(e => normalize(e.email) === email || normalize(e.name) === name)
  }, [employees, currentUser])

  const allowedIds = useMemo(
    () => visibleEmployeeIds(employees, currentUser?.role ?? 'ASSOCIATE', currentEmployee),
    [employees, currentUser, currentEmployee],
  )

  const isCaptureManager = currentUser?.role === 'CAPTURE_MANAGER'
  const canFilterByTeam = isCaptureManager
  const canFilterByPerson = currentUser?.role !== 'ASSOCIATE'

  const scopedEmployees = useMemo(() => {
    let list = employees.filter(e => allowedIds.has(e.id))
    if (teamFilter !== 'ALL') list = list.filter(e => (e.team ?? 'BD') === teamFilter)
    if (personFilter !== 'ALL') list = list.filter(e => e.id === personFilter)
    // Sort: managers > team leads > associates, then alphabetical
    const order: Record<HierarchyRole, number> = { BD_MANAGER: 0, TEAM_LEAD: 1, ASSOCIATE: 2 }
    return list.sort((a, b) => (order[a.role] - order[b.role]) || a.name.localeCompare(b.name))
  }, [employees, allowedIds, teamFilter, personFilter])

  const personOptions = useMemo(() => {
    return employees
      .filter(e => allowedIds.has(e.id) && (teamFilter === 'ALL' || (e.team ?? 'BD') === teamFilter))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, allowedIds, teamFilter])

  // Pre-compute submission and non-sub buckets filtered by period.
  const periodSubmissions = useMemo(
    () => bdSubmissions.filter(s => filterByPeriod(s.submittedOn, period)),
    [bdSubmissions, period],
  )
  const periodNonSubs = useMemo(
    () => nonSubReports.filter(r => r.status !== 'DECLINED' && filterByPeriod(r.submittedAt, period)),
    [nonSubReports, period],
  )

  type EmployeeStat = {
    employee: Employee
    submissions: number
    nonSubmissions: number
    wins: number
    losses: number
    total: number
    successRate: number
    winRate: number
    goal: number
    goalPct: number
    goalAchieved: boolean
  }

  const stats: EmployeeStat[] = useMemo(() => {
    return scopedEmployees.map(employee => {
      const empName = normalize(employee.name)
      const userRecord = users.find(u => normalize(u.email) === normalize(employee.email))
      const userName = normalize(userRecord?.username)

      const personalSubs = periodSubmissions.filter(s => {
        const haystack = `${normalize(s.supportAgent)} ${normalize(s.bdm)} ${normalize(s.bds)}`
        return empName && haystack.includes(empName)
      })
      const submissions = personalSubs.length
      const wins = personalSubs.filter(s => s.status === 'AWARDED').length
      const losses = personalSubs.filter(s => ['LOST', 'DROPPED', 'CANCELED'].includes(s.status)).length
      const nonSubmissions = periodNonSubs.filter(r => normalize(r.agentUsername) === userName).length
      const total = submissions + nonSubmissions
      const successRate = total ? Math.round((submissions / total) * 100) : 0
      const winRate = submissions ? Math.round((wins / submissions) * 100) : 0
      const goal = GOAL_BY_ROLE[employee.role]
      const goalPct = goal ? Math.min(100, Math.round((submissions / goal) * 100)) : 0
      const goalAchieved = submissions >= goal

      return {
        employee, submissions, nonSubmissions, wins, losses,
        total, successRate, winRate, goal, goalPct, goalAchieved,
      }
    })
  }, [scopedEmployees, users, periodSubmissions, periodNonSubs])

  const totals = useMemo(() => {
    const submissions = stats.reduce((s, r) => s + r.submissions, 0)
    const nonSubmissions = stats.reduce((s, r) => s + r.nonSubmissions, 0)
    const goalsAchieved = stats.filter(r => r.goalAchieved).length
    return { submissions, nonSubmissions, goalsAchieved, users: stats.length }
  }, [stats])

  const periodLabel = period
    ? `${period.from} - ${period.to}`
    : 'All time'

  // Hide entirely for users with no visible employees (e.g. orphaned account).
  if (stats.length === 0 && !period && teamFilter === 'ALL' && personFilter === 'ALL') {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-default)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
            <TrendingUp size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
              {isCaptureManager ? 'Team Statistics' : currentUser?.role === 'ASSOCIATE' ? 'My Performance' : 'Team Performance'}
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {periodLabel} - {totals.users} {totals.users === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canFilterByTeam && (
            <div className="relative">
              <select
                value={teamFilter}
                onChange={e => { setTeamFilter(e.target.value as 'ALL' | EmployeeTeam); setPersonFilter('ALL') }}
                className="appearance-none text-[11px] font-bold px-3 pr-7 py-1.5 rounded-lg border outline-none"
                style={{
                  background: 'var(--bg-raised)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="ALL">All Teams</option>
                <option value="BD">Business Dev</option>
                <option value="OPS">Operations</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          )}

          {canFilterByPerson && personOptions.length > 1 && (
            <div className="relative">
              <select
                value={personFilter}
                onChange={e => setPersonFilter(e.target.value)}
                className="appearance-none text-[11px] font-bold px-3 pr-7 py-1.5 rounded-lg border outline-none max-w-[180px] truncate"
                style={{
                  background: 'var(--bg-raised)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="ALL">All People</option>
                {personOptions.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          )}

          <PeriodFilter value={period} onChange={setPeriod} placeholder="All time" />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3" style={{ background: 'var(--bg-app, transparent)' }}>
        <SummaryCard icon={Users} label="Total Users" value={totals.users} color="#A78BFA" />
        <SummaryCard icon={Send} label="Submissions" value={totals.submissions} color="#22D3EE" />
        <SummaryCard icon={AlertTriangle} label="Non-Submissions" value={totals.nonSubmissions} color="#F87171" />
        <SummaryCard
          icon={Award}
          label="Goals Achieved"
          value={totals.goalsAchieved}
          suffix={`/${totals.users}`}
          color="#34D399"
        />
      </div>

      {/* Performance grid */}
      <div className="px-3 pb-3">
        <p className="px-2 pt-2 pb-1.5 text-[10px] font-black tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
          {isCaptureManager ? 'TEAM PERFORMANCE' : 'PERFORMANCE'}
        </p>

        {stats.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm rounded-xl border border-dashed" style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)' }}>
            <Filter size={14} className="mr-2" /> No people match the current filters
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {stats.map((stat, index) => (
              <EmployeeCard key={stat.employee.id} stat={stat} index={index} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function SummaryCard({ icon: Icon, label, value, suffix, color }: { icon: any; label: string; value: number; suffix?: string; color: string }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-xl px-4 py-3 flex items-center gap-3 border"
      style={{
        background: `linear-gradient(135deg, ${color}14, transparent)`,
        borderColor: `${color}28`,
      }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1f` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
        <p className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>
          <AnimatedNumber value={value} />{suffix && <span className="text-sm opacity-70">{suffix}</span>}
        </p>
      </div>
    </motion.div>
  )
}

function EmployeeCard({ stat, index }: { stat: any; index: number }) {
  const { employee, submissions, nonSubmissions, total, successRate, winRate, wins, goal, goalPct, goalAchieved } = stat
  const badge = ROLE_BADGE[employee.role as HierarchyRole]
  const statusColor = goalAchieved ? '#10B981' : '#3B82F6'
  const StatusIcon = goalAchieved ? CheckCircle2 : Clock
  const team = employee.team ?? 'BD'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.04, 0.4), ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3, boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{
        background: 'var(--bg-raised)',
        borderColor: 'var(--border-default)',
      }}
    >
      {/* Top: avatar + name + role + total */}
      <div className="px-3.5 pt-3.5 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-black text-white bg-gradient-to-br ${avatarColor(employee.avatar)} flex-shrink-0`}>
              {employee.avatar.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-black truncate" style={{ color: 'var(--text-primary)' }}>{employee.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className="text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: badge.bg, color: badge.color }}
                >
                  {badge.label}
                </span>
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{
                  background: team === 'BD' ? 'rgba(99,102,241,0.10)' : 'rgba(245,158,11,0.10)',
                  color: team === 'BD' ? '#A5B4FC' : '#FCD34D',
                }}>
                  {team}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-black leading-none" style={{ color: 'var(--text-primary)' }}>
              <AnimatedNumber value={total} />
            </p>
            <p className="text-[9px] font-bold tracking-wider mt-0.5" style={{ color: 'var(--text-tertiary)' }}>TOTAL</p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="px-3.5 pb-3 space-y-1.5">
        <StatRow label="Submissions" value={submissions} color="#22D3EE" />
        <StatRow label="Non-Submissions" value={nonSubmissions} color="#F87171" />
        <StatRow label="Success Rate" value={`${successRate}%`} color={successRate >= 60 ? '#10B981' : successRate >= 40 ? '#F59E0B' : '#F87171'} />
        {wins > 0 && (
          <StatRow label="Win Rate" value={`${winRate}%`} color="#10B981" sub={`${wins} wins`} />
        )}
      </div>

      {/* Goal progress bar */}
      <div className="px-3.5 pb-2.5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Target size={9} style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-[9px] font-bold tracking-wider" style={{ color: 'var(--text-tertiary)' }}>GOAL</span>
          </div>
          <span className="text-[10px] font-black" style={{ color: statusColor }}>{submissions}/{goal}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}80` }}
            initial={{ width: 0 }}
            animate={{ width: `${goalPct}%` }}
            transition={{ duration: 0.9, delay: 0.2 + Math.min(index * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {/* Status badge */}
      <div
        className="px-3.5 py-2 flex items-center justify-center gap-1.5 border-t"
        style={{
          background: `${statusColor}14`,
          borderColor: `${statusColor}28`,
        }}
      >
        <StatusIcon size={12} style={{ color: statusColor }} />
        <span className="text-[10px] font-black tracking-wider" style={{ color: statusColor }}>
          {goalAchieved ? 'GOAL ACHIEVED' : 'IN PROGRESS'}
        </span>
      </div>
    </motion.div>
  )
}

function StatRow({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
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
