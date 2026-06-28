import type { Employee, FreshAward, Goal, GoalMetric, GoalScope, Opportunity } from '../types'
import { getAssignmentChain } from './team'

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  submissions_count: 'Submissions',
  wins_count:        'Wins',
  win_rate_pct:      'Win rate %',
}

export const GOAL_METRIC_UNIT: Record<GoalMetric, string> = {
  submissions_count: '',
  wins_count:        '',
  win_rate_pct:      '%',
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function monthRangeMs(monthKey: string): { startMs: number; endMs: number } {
  const [y, m] = monthKey.split('-').map(Number)
  const start = new Date(y, m - 1, 1).getTime()
  const end = new Date(y, m, 1).getTime()
  return { startMs: start, endMs: end }
}

// True when an ISO timestamp or YYYY-MM-DD string falls inside a calendar month.
// YYYY-MM-DD is parsed as local midnight to avoid UTC rollback.
function isInMonth(dateStr: string | undefined, monthKey: string): boolean {
  if (!dateStr) return false
  const { startMs, endMs } = monthRangeMs(monthKey)
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  const t = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])).getTime()
    : new Date(dateStr).getTime()
  if (!Number.isFinite(t)) return false
  return t >= startMs && t < endMs
}

// Expand a goal's target to the set of employee ids it covers.
// 'employee' → just that one id. 'team' → the manager + every TL + every associate underneath.
export function expandGoalTarget(
  employees: Employee[],
  scope: GoalScope,
  targetId: string,
): Set<string> {
  const ids = new Set<string>()
  if (scope === 'employee') {
    if (employees.some(e => e.id === targetId)) ids.add(targetId)
    return ids
  }
  const manager = employees.find(e => e.id === targetId)
  if (!manager) return ids
  ids.add(manager.id)
  for (const tl of employees.filter(e => e.managerId === manager.id)) {
    ids.add(tl.id)
    for (const assoc of employees.filter(e => e.managerId === tl.id)) {
      ids.add(assoc.id)
    }
  }
  return ids
}

// True if any of `ids` appears in the opportunity's assignment chain.
function oppMatches(opp: Opportunity, ids: Set<string>, employees: Employee[]): boolean {
  if (!opp.assignedTo) return false
  if (ids.has(opp.assignedTo)) return true
  const chain = getAssignmentChain(employees, opp.assignedTo)
  return Boolean(
    (chain.manager   && ids.has(chain.manager.id))   ||
    (chain.teamLead  && ids.has(chain.teamLead.id))  ||
    (chain.associate && ids.has(chain.associate.id)),
  )
}

export interface GoalProgress {
  current: number
  target: number
  pct: number // can exceed 100 (capped at 200 for UI sanity)
  status: 'achieved' | 'ahead' | 'on-track' | 'behind'
  submissions: number
  wins: number
}

export function computeGoalProgress(
  goal: Goal,
  opportunities: Opportunity[],
  freshAwards: FreshAward[],
  employees: Employee[],
  now: Date = new Date(),
): GoalProgress {
  const ids = expandGoalTarget(employees, goal.scope, goal.targetId)
  const matchingOpps = opportunities.filter(o => oppMatches(o, ids, employees))

  const submissions = matchingOpps.filter(o => isInMonth(o.submittedAt, goal.monthKey)).length

  const wins = matchingOpps.filter(o => {
    if (o.status !== 'WON') return false
    const fa = freshAwards.find(f => f.opportunityId === o.id)
    if (fa?.awardedDate) return isInMonth(fa.awardedDate, goal.monthKey)
    return isInMonth(o.submittedAt, goal.monthKey)
  }).length

  let current: number
  switch (goal.metric) {
    case 'submissions_count': current = submissions; break
    case 'wins_count':        current = wins; break
    case 'win_rate_pct':      current = submissions === 0 ? 0 : Math.round((wins / submissions) * 100); break
  }

  const pct = goal.targetValue <= 0
    ? 0
    : Math.min(200, Math.round((current / goal.targetValue) * 100))

  let status: GoalProgress['status']
  if (current >= goal.targetValue) {
    status = 'achieved'
  } else {
    const { startMs, endMs } = monthRangeMs(goal.monthKey)
    const totalMs = endMs - startMs
    const elapsedMs = Math.max(0, Math.min(totalMs, now.getTime() - startMs))
    const expectedPct = totalMs === 0 ? 100 : (elapsedMs / totalMs) * 100
    if (now.getTime() < startMs)       status = 'on-track' // future month: neutral
    else if (pct >= expectedPct + 10)  status = 'ahead'
    else if (pct >= expectedPct - 10)  status = 'on-track'
    else                               status = 'behind'
  }

  return { current, target: goal.targetValue, pct, status, submissions, wins }
}

// All goals that apply to a given user's employee record (either directly,
// or via a team goal whose tree contains them).
export function goalsForEmployee(
  goals: Goal[],
  employeeId: string | undefined,
  employees: Employee[],
  monthKey?: string,
): Goal[] {
  if (!employeeId) return []
  return goals.filter(g => {
    if (monthKey && g.monthKey !== monthKey) return false
    const ids = expandGoalTarget(employees, g.scope, g.targetId)
    return ids.has(employeeId)
  })
}

export function formatGoalValue(metric: GoalMetric, value: number): string {
  if (metric === 'win_rate_pct') return `${value}%`
  return String(value)
}
