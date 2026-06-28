import { describe, expect, it } from 'vitest'
import {
  computeGoalProgress,
  currentMonthKey,
  expandGoalTarget,
  formatMonthKey,
  goalsForEmployee,
  monthRangeMs,
} from '../lib/goals'
import type { Employee, FreshAward, Goal, Opportunity } from '../types'

const employees: Employee[] = [
  { id: 'mgr',    name: 'Manager A',    email: 'mgr@ces.com',    role: 'BD_MANAGER', managerId: null,  avatar: 'MA', team: 'BD' },
  { id: 'tl',     name: 'Team Lead A',  email: 'tl@ces.com',     role: 'TEAM_LEAD',  managerId: 'mgr', avatar: 'TA', team: 'BD' },
  { id: 'assoc1', name: 'Associate 1',  email: 'assoc1@ces.com', role: 'ASSOCIATE',  managerId: 'tl',  avatar: 'A1', team: 'BD' },
  { id: 'assoc2', name: 'Associate 2',  email: 'assoc2@ces.com', role: 'ASSOCIATE',  managerId: 'tl',  avatar: 'A2', team: 'BD' },
  // Separate manager / team — should not bleed into team A's goals.
  { id: 'mgr2',   name: 'Manager B',    email: 'mgr2@ces.com',   role: 'BD_MANAGER', managerId: null,  avatar: 'MB', team: 'BD' },
  { id: 'tl2',    name: 'Team Lead B',  email: 'tl2@ces.com',    role: 'TEAM_LEAD',  managerId: 'mgr2', avatar: 'TB', team: 'BD' },
  { id: 'assoc3', name: 'Associate 3',  email: 'assoc3@ces.com', role: 'ASSOCIATE',  managerId: 'tl2', avatar: 'A3', team: 'BD' },
]

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp',
    solicitation: 'Test Opp',
    solicitationId: 'SOL-1',
    client: 'Agency',
    type: 'OTJ',
    naicsCode: '238220',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    dueDate: '2026-06-15',
    localTime: '2:00 PM',
    location: 'MD',
    pop: '',
    bdm: '',
    bds: '',
    comments: [],
    period: 'JUN 2026',
    capturedOn: 'Jun 1, 2026',
    ...overrides,
  }
}

function makeAward(overrides: Partial<FreshAward> = {}): FreshAward {
  return {
    id: 'fa-1',
    opportunityId: 'opp',
    solicitation: 'Test Opp',
    solicitationId: 'SOL-1',
    client: 'Agency',
    type: 'OTJ',
    setAside: 'SB',
    naicsCode: '238220',
    awardedDate: '2026-06-20',
    status: 'PENDING_ASSIGNMENT',
    ...overrides,
  }
}

describe('goals · month key helpers', () => {
  it('currentMonthKey returns YYYY-MM in local time', () => {
    expect(currentMonthKey(new Date(2026, 5, 28))).toBe('2026-06')
    expect(currentMonthKey(new Date(2026, 0, 1))).toBe('2026-01')
    expect(currentMonthKey(new Date(2026, 11, 31))).toBe('2026-12')
  })

  it('formatMonthKey renders a human label', () => {
    expect(formatMonthKey('2026-06')).toBe('June 2026')
    expect(formatMonthKey('2026-12')).toBe('December 2026')
  })

  it('monthRangeMs spans first ms of month to first ms of next month', () => {
    const { startMs, endMs } = monthRangeMs('2026-06')
    expect(new Date(startMs)).toEqual(new Date(2026, 5, 1))
    expect(new Date(endMs)).toEqual(new Date(2026, 6, 1))
  })
})

describe('goals · expandGoalTarget', () => {
  it('returns just the employee id for employee scope', () => {
    expect([...expandGoalTarget(employees, 'employee', 'assoc1')]).toEqual(['assoc1'])
  })

  it('returns the full manager sub-tree for team scope', () => {
    const ids = expandGoalTarget(employees, 'team', 'mgr')
    expect(ids.has('mgr')).toBe(true)
    expect(ids.has('tl')).toBe(true)
    expect(ids.has('assoc1')).toBe(true)
    expect(ids.has('assoc2')).toBe(true)
    // Other manager's tree must not be included.
    expect(ids.has('mgr2')).toBe(false)
    expect(ids.has('tl2')).toBe(false)
    expect(ids.has('assoc3')).toBe(false)
  })

  it('returns an empty set when the target id does not exist', () => {
    expect([...expandGoalTarget(employees, 'employee', 'missing')]).toEqual([])
    expect([...expandGoalTarget(employees, 'team', 'missing')]).toEqual([])
  })
})

describe('goals · computeGoalProgress', () => {
  const monthKey = '2026-06'
  const now = new Date(2026, 5, 28, 12, 0, 0) // ~93% through June

  it('counts submissions assigned to the goal target', () => {
    const opps: Opportunity[] = [
      makeOpp({ id: 'o1', assignedTo: 'assoc1', status: 'SUBMITTED', submittedAt: '2026-06-05T10:00:00Z' }),
      makeOpp({ id: 'o2', assignedTo: 'assoc1', status: 'SUBMITTED', submittedAt: '2026-06-10T10:00:00Z' }),
      makeOpp({ id: 'o3', assignedTo: 'assoc1', status: 'SUBMITTED', submittedAt: '2026-05-30T10:00:00Z' }), // prev month
      makeOpp({ id: 'o4', assignedTo: 'assoc3', status: 'SUBMITTED', submittedAt: '2026-06-12T10:00:00Z' }), // other team
    ]
    const goal: Goal = {
      id: 'g1', scope: 'employee', targetId: 'assoc1', metric: 'submissions_count',
      targetValue: 5, period: 'monthly', monthKey,
      createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
    }
    const p = computeGoalProgress(goal, opps, [], employees, now)
    expect(p.current).toBe(2)
    expect(p.target).toBe(5)
    expect(p.pct).toBe(40)
    expect(p.status).toBe('behind')
  })

  it('rolls up to the team manager via the assignment chain', () => {
    const opps: Opportunity[] = [
      makeOpp({ id: 'o1', assignedTo: 'assoc1', status: 'SUBMITTED', submittedAt: '2026-06-05T10:00:00Z' }),
      makeOpp({ id: 'o2', assignedTo: 'assoc2', status: 'SUBMITTED', submittedAt: '2026-06-10T10:00:00Z' }),
      makeOpp({ id: 'o3', assignedTo: 'tl',     status: 'SUBMITTED', submittedAt: '2026-06-12T10:00:00Z' }),
      makeOpp({ id: 'o4', assignedTo: 'assoc3', status: 'SUBMITTED', submittedAt: '2026-06-12T10:00:00Z' }), // other team
    ]
    const teamGoal: Goal = {
      id: 'g2', scope: 'team', targetId: 'mgr', metric: 'submissions_count',
      targetValue: 10, period: 'monthly', monthKey,
      createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
    }
    const p = computeGoalProgress(teamGoal, opps, [], employees, now)
    expect(p.current).toBe(3)
  })

  it('counts wins via linked FreshAward.awardedDate when present', () => {
    const opps: Opportunity[] = [
      makeOpp({ id: 'o1', assignedTo: 'assoc1', status: 'WON', submittedAt: '2026-05-20T10:00:00Z' }),
      makeOpp({ id: 'o2', assignedTo: 'assoc1', status: 'WON', submittedAt: '2026-06-02T10:00:00Z' }),
      makeOpp({ id: 'o3', assignedTo: 'assoc1', status: 'WON', submittedAt: '2026-06-05T10:00:00Z' }),
    ]
    const awards: FreshAward[] = [
      makeAward({ id: 'fa-1', opportunityId: 'o1', awardedDate: '2026-06-10' }), // counts (June)
      makeAward({ id: 'fa-2', opportunityId: 'o2', awardedDate: '2026-07-02' }), // out (July)
      // o3 has no FreshAward → falls back to submittedAt (June 5) → counts
    ]
    const goal: Goal = {
      id: 'g3', scope: 'employee', targetId: 'assoc1', metric: 'wins_count',
      targetValue: 3, period: 'monthly', monthKey,
      createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
    }
    const p = computeGoalProgress(goal, opps, awards, employees, now)
    expect(p.wins).toBe(2)
    expect(p.current).toBe(2)
  })

  it('computes win_rate_pct as wins / submissions in the same month', () => {
    const opps: Opportunity[] = [
      makeOpp({ id: 'o1', assignedTo: 'assoc1', status: 'WON',       submittedAt: '2026-06-02T10:00:00Z' }),
      makeOpp({ id: 'o2', assignedTo: 'assoc1', status: 'WON',       submittedAt: '2026-06-10T10:00:00Z' }),
      makeOpp({ id: 'o3', assignedTo: 'assoc1', status: 'SUBMITTED', submittedAt: '2026-06-15T10:00:00Z' }),
      makeOpp({ id: 'o4', assignedTo: 'assoc1', status: 'SUBMITTED', submittedAt: '2026-06-20T10:00:00Z' }),
    ]
    const awards: FreshAward[] = [
      makeAward({ id: 'fa-1', opportunityId: 'o1', awardedDate: '2026-06-12' }),
      makeAward({ id: 'fa-2', opportunityId: 'o2', awardedDate: '2026-06-20' }),
    ]
    const goal: Goal = {
      id: 'g4', scope: 'employee', targetId: 'assoc1', metric: 'win_rate_pct',
      targetValue: 50, period: 'monthly', monthKey,
      createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
    }
    const p = computeGoalProgress(goal, opps, awards, employees, now)
    expect(p.submissions).toBe(4)
    expect(p.wins).toBe(2)
    expect(p.current).toBe(50) // 2 / 4 = 50%
    expect(p.status).toBe('achieved')
  })

  it('marks status as achieved when the target is met or exceeded', () => {
    const opps: Opportunity[] = Array.from({ length: 6 }, (_, i) =>
      makeOpp({ id: `o${i}`, assignedTo: 'assoc1', status: 'SUBMITTED', submittedAt: `2026-06-${String(i + 1).padStart(2, '0')}T10:00:00Z` }),
    )
    const goal: Goal = {
      id: 'g5', scope: 'employee', targetId: 'assoc1', metric: 'submissions_count',
      targetValue: 5, period: 'monthly', monthKey,
      createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
    }
    const p = computeGoalProgress(goal, opps, [], employees, now)
    expect(p.current).toBe(6)
    expect(p.pct).toBe(120)
    expect(p.status).toBe('achieved')
  })

  it('returns 0% pct when target is non-positive', () => {
    const goal: Goal = {
      id: 'g6', scope: 'employee', targetId: 'assoc1', metric: 'submissions_count',
      targetValue: 0, period: 'monthly', monthKey,
      createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
    }
    const p = computeGoalProgress(goal, [], [], employees, now)
    expect(p.pct).toBe(0)
  })

  it('ignores opportunities outside the assignment chain entirely', () => {
    const opps: Opportunity[] = [
      makeOpp({ id: 'o1', assignedTo: undefined, status: 'SUBMITTED', submittedAt: '2026-06-05T10:00:00Z' }),
      makeOpp({ id: 'o2', assignedTo: 'assoc3',  status: 'SUBMITTED', submittedAt: '2026-06-05T10:00:00Z' }), // team B
    ]
    const goal: Goal = {
      id: 'g7', scope: 'team', targetId: 'mgr', metric: 'submissions_count',
      targetValue: 5, period: 'monthly', monthKey,
      createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
    }
    const p = computeGoalProgress(goal, opps, [], employees, now)
    expect(p.current).toBe(0)
  })
})

describe('goals · goalsForEmployee', () => {
  const employeeGoal: Goal = {
    id: 'g-emp', scope: 'employee', targetId: 'assoc1', metric: 'submissions_count',
    targetValue: 5, period: 'monthly', monthKey: '2026-06',
    createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
  }
  const teamGoal: Goal = {
    id: 'g-team', scope: 'team', targetId: 'mgr', metric: 'wins_count',
    targetValue: 3, period: 'monthly', monthKey: '2026-06',
    createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
  }
  const otherTeamGoal: Goal = {
    id: 'g-team2', scope: 'team', targetId: 'mgr2', metric: 'wins_count',
    targetValue: 3, period: 'monthly', monthKey: '2026-06',
    createdAt: '2026-06-01T00:00:00Z', createdBy: 'admin',
  }
  const goals = [employeeGoal, teamGoal, otherTeamGoal]

  it('returns the employee goal and the team goal whose tree contains the employee', () => {
    const out = goalsForEmployee(goals, 'assoc1', employees)
    const ids = out.map(g => g.id).sort()
    expect(ids).toEqual(['g-emp', 'g-team'])
  })

  it('returns only the team goal for a teammate without an explicit employee goal', () => {
    const out = goalsForEmployee(goals, 'assoc2', employees).map(g => g.id)
    expect(out).toEqual(['g-team'])
  })

  it('returns nothing when there is no employee id', () => {
    expect(goalsForEmployee(goals, undefined, employees)).toEqual([])
  })

  it('honours monthKey filter when supplied', () => {
    const out = goalsForEmployee(goals, 'assoc1', employees, '2026-07')
    expect(out).toEqual([])
  })
})
