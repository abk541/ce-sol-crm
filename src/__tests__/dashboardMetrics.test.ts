import { describe, expect, it } from 'vitest'
import type { BDSubmission, Contract, Employee, Opportunity, User } from '../types'
import {
  calculateBdDashboardSummary,
  contractOpportunityRows,
  dashboardContractGrossProfit,
  dashboardMonthBuckets,
  isActiveContractAdminRecord,
  submittedLifecycleRows,
  uniqueBDSubmissionRows,
} from '../lib/dashboardMetrics'
import { isBDSubmissionAssociatedToUser, isBDSubmissionAttributedToEmployee } from '../lib/team'

const manager: Employee = {
  id: 'manager-1', name: 'Manager', email: 'manager@example.test', role: 'BD_MANAGER',
  managerId: null, avatar: 'MA', team: 'BD',
}
const lead: Employee = {
  id: 'lead-1', name: 'Team Lead', email: 'lead@example.test', role: 'TEAM_LEAD',
  managerId: manager.id, avatar: 'TL', team: 'BD',
}
const associate: Employee = {
  id: 'associate-1', name: 'Associate', email: 'associate@example.test', role: 'ASSOCIATE',
  managerId: lead.id, avatar: 'AS', team: 'BD',
}
const employees = [manager, lead, associate]

function opportunity(id: string, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id,
    solicitation: `Opportunity ${id}`,
    solicitationId: `SOL-${id}`,
    client: 'Agency',
    type: 'OTJ',
    naicsCode: '541611',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    dueDate: '2026-07-31',
    localTime: '17:00',
    location: 'Remote',
    pop: '',
    bdm: '',
    bds: '',
    comments: [],
    period: 'JUL 2026',
    capturedOn: '2026-07-01',
    assignedTo: associate.id,
    ...overrides,
  }
}

function submission(id: number, status: BDSubmission['status'], value = 100): BDSubmission {
  return {
    id,
    submittedOn: '2026-07-10',
    solicitationId: `SOL-${id}`,
    setAside: 'SB',
    type: 'OTJ',
    solicitation: `Submission ${id}`,
    status,
    dueDate: '2026-07-31',
    localTime: '17:00',
    location: 'Remote',
    bdm: '',
    bds: '',
    value,
  }
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    contractId: 'CON-1',
    title: 'Contract',
    type: 'OTJ',
    naicsCode: '541611',
    status: 'KICK_OFF',
    location: 'Remote',
    popStart: '2026-01-01',
    popEnd: '2026-12-31',
    value: 100_000,
    spm: '',
    pm: '',
    ...overrides,
  }
}

describe('dashboard submission definitions', () => {
  it('counts only genuine submissions across the tracker lifecycle', () => {
    const rows = [
      ...Array.from({ length: 27 }, (_, index) => submission(index + 1, 'SUBMITTED')),
      submission(28, 'AWARDED'),
      submission(29, 'LOST'),
      ...Array.from({ length: 30 }, (_, index) => submission(index + 30, 'NOT_SUBMITTED')),
    ]

    expect(submittedLifecycleRows(rows)).toHaveLength(29)
  })

  it('includes discussion but excludes canceled, dropped, and not-submitted outcomes', () => {
    const rows = [
      submission(1, 'DISCUSSING'),
      submission(2, 'CANCELED'),
      submission(3, 'DROPPED'),
      submission(4, 'NOT_SUBMITTED'),
    ]

    expect(submittedLifecycleRows(rows).map(row => row.status)).toEqual(['DISCUSSING'])
  })

  it('does not double-count a repeated tracker row id', () => {
    expect(submittedLifecycleRows([
      submission(1, 'SUBMITTED'),
      submission(1, 'AWARDED'),
    ])).toHaveLength(1)
  })

  it('does not double-count two rows for the same solicitation', () => {
    const first = submission(1, 'SUBMITTED')
    const latest = submission(2, 'AWARDED')
    latest.solicitationId = first.solicitationId
    latest.submittedOn = '2026-07-11'

    expect(uniqueBDSubmissionRows([first, latest])).toEqual([latest])
    expect(submittedLifecycleRows([first, latest])).toHaveLength(1)
  })
})

describe('Contract Opportunities visibility', () => {
  it('matches the associate-required Contract Opportunities rules', () => {
    const rows = [
      opportunity('visible'),
      opportunity('manager-only', { assignedTo: manager.id }),
      opportunity('unassigned', { assignedTo: undefined }),
      opportunity('reported', { nonSubmissionReportId: 'report-1' }),
      opportunity('deleted', { isDeleted: true }),
      opportunity('submitted', { status: 'SUBMITTED' }),
      opportunity('new', { status: 'NEW_ASSIGNMENT' }),
      opportunity('discussion', { status: 'DISCUSSION' }),
    ]

    expect(contractOpportunityRows(rows, employees, true).map(row => row.id)).toEqual([
      'visible', 'new', 'discussion',
    ])
  })

  it('allows manager-only assignments when the admin setting disables the associate requirement', () => {
    expect(contractOpportunityRows([
      opportunity('manager-only', { assignedTo: manager.id }),
    ], employees, false)).toHaveLength(1)
  })
})

describe('BD Tracker ownership and team attribution', () => {
  const associateUser = {
    id: 'user-associate',
    name: associate.name,
    email: associate.email,
    username: 'associate',
    role: 'ASSOCIATE',
    avatar: associate.avatar,
    status: 'active',
    firstLogin: false,
    createdAt: '2026-01-01',
  } as User

  it('attributes a submitted row to the associate and their responsible team', () => {
    const opp = opportunity('owned')
    const row = submission(1, 'SUBMITTED')
    row.solicitationId = opp.solicitationId

    expect(isBDSubmissionAttributedToEmployee(employees, associate, row, [opp])).toBe(true)
    expect(isBDSubmissionAttributedToEmployee(employees, lead, row, [opp])).toBe(true)
    expect(isBDSubmissionAttributedToEmployee(employees, manager, row, [opp])).toBe(true)
    expect(isBDSubmissionAssociatedToUser(employees, associateUser, row, [opp])).toBe(true)
  })

  it('uses the saved associate on canceled rows whose opportunity was removed', () => {
    const row = submission(2, 'CANCELED')
    row.bdm = manager.name
    row.bds = lead.name
    row.supportAgent = associate.name

    expect(isBDSubmissionAssociatedToUser(employees, associateUser, row, [])).toBe(true)
  })
})

describe('dashboard KPI calculations', () => {
  it('keeps counts, value, capture rate, and win rate on genuine submissions only', () => {
    const captured = Array.from({ length: 10 }, (_, index) => opportunity(String(index + 1)))
    const active = captured.slice(0, 4)
    const trackerRows = [
      submission(1, 'SUBMITTED', 1_000),
      submission(2, 'AWARDED', 2_000),
      submission(3, 'LOST', 3_000),
      submission(4, 'NOT_SUBMITTED', 90_000),
      submission(5, 'DROPPED', 90_000),
    ]

    const result = calculateBdDashboardSummary({
      activeOpportunities: active,
      capturedOpportunities: captured,
      trackerRows,
      valueForSubmission: row => row.value,
    })

    expect(result.activeOpportunities).toHaveLength(4)
    expect(result.capturedOpportunities).toHaveLength(10)
    expect(result.capturedCount).toBe(10)
    expect(result.submittedOpportunities).toHaveLength(3)
    expect(result.submittedValue).toBe(6_000)
    expect(result.captureRate).toBe(30)
    expect(result.winRate).toBe(33)
  })

  it('counts captured work from active opportunities plus every distinct tracker outcome', () => {
    const result = calculateBdDashboardSummary({
      activeOpportunities: [opportunity('active-1'), opportunity('active-2')],
      capturedOpportunities: [],
      trackerRows: [
        submission(1, 'SUBMITTED'),
        submission(2, 'AWARDED'),
        submission(3, 'LOST'),
        submission(4, 'CANCELED'),
        submission(5, 'DROPPED'),
        submission(6, 'NOT_SUBMITTED'),
      ],
      valueForSubmission: row => row.value,
    })

    expect(result.capturedCount).toBe(8)
    expect(result.submittedOpportunities).toHaveLength(3)
  })
})

describe('dashboard period buckets', () => {
  it('builds chart months from the selected range', () => {
    expect(dashboardMonthBuckets({ from: '2026-02-10', to: '2026-05-19' })).toEqual([
      { key: '2026-02', month: 'Feb' },
      { key: '2026-03', month: 'Mar' },
      { key: '2026-04', month: 'Apr' },
      { key: '2026-05', month: 'May' },
    ])
  })

  it('uses year labels when a range crosses a year boundary', () => {
    expect(dashboardMonthBuckets({ from: '2025-12-10', to: '2026-01-05' }).map(item => item.month)).toEqual([
      'Dec 25',
      'Jan 26',
    ])
  })
})

describe('operations dashboard calculations', () => {
  it('uses the same active group boundary as Contract Admin', () => {
    expect(isActiveContractAdminRecord(contract({ status: 'PENDING_PAYMENT' }))).toBe(true)
    expect(isActiveContractAdminRecord(contract({ status: 'CANCELED' }))).toBe(true)
    expect(isActiveContractAdminRecord(contract({ status: 'ARCHIVED' }))).toBe(false)
    expect(isActiveContractAdminRecord(contract({ status: 'TERMINATED' }))).toBe(false)
  })

  it('calculates OTJ and recurring gross profit with the documented cost rules', () => {
    const lockedSubcontractors = [{
      id: 'sub-1', contractId: 'contract-1', companyName: 'Vendor', contactName: '',
      paymentRate: 20_000, createdAt: '2026-01-01', createdBy: 'admin',
    }]

    expect(dashboardContractGrossProfit(contract({ lockedSubcontractors }))).toBe(80_000)
    expect(dashboardContractGrossProfit(contract({
      type: 'RECURRING',
      value: 120_000,
      baseAmount: 30_000,
      lockedSubcontractors,
    }))).toBe(70_000)
  })
})
