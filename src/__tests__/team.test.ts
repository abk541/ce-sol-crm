import { describe, expect, it } from 'vitest'
import {
  assignmentWorkloadByEmployee,
  getAssignmentChain,
  isAssignedToAssociate,
  teamMemberIdsForWorkload,
} from '../lib/team'
import type { Contract, Employee, Opportunity } from '../types'

const employees: Employee[] = [
  { id: 'mgr', name: 'Manager', email: 'manager@ces.com', role: 'BD_MANAGER', managerId: null, avatar: 'MG' },
  { id: 'tl', name: 'Team Lead', email: 'lead@ces.com', role: 'TEAM_LEAD', managerId: 'mgr', avatar: 'TL' },
  { id: 'assoc', name: 'Associate', email: 'associate@ces.com', role: 'ASSOCIATE', managerId: 'tl', avatar: 'AS' },
]

describe('assignment hierarchy helpers', () => {
  it('treats only associate assignments as ready for Contract Opportunities', () => {
    expect(isAssignedToAssociate(employees, undefined)).toBe(false)
    expect(isAssignedToAssociate(employees, 'mgr')).toBe(false)
    expect(isAssignedToAssociate(employees, 'tl')).toBe(false)
    expect(isAssignedToAssociate(employees, 'assoc')).toBe(true)
  })

  it('keeps manager and team lead in the assignment chain without marking an associate', () => {
    expect(getAssignmentChain(employees, 'mgr').associate).toBeUndefined()
    expect(getAssignmentChain(employees, 'tl').associate).toBeUndefined()
    expect(getAssignmentChain(employees, 'assoc').associate?.id).toBe('assoc')
  })

  it('aggregates assignment workload for managers and team leads by team responsibility', () => {
    const opportunities: Opportunity[] = [
      makeOpportunity({ id: 'current', assignedTo: 'assoc', dueDate: '2026-07-10' }),
      makeOpportunity({ id: 'opp-assoc', assignedTo: 'assoc', dueDate: '2026-07-10' }),
      makeOpportunity({ id: 'opp-lead', assignedTo: 'tl', dueDate: '2026-07-11', status: 'NEW_ASSIGNMENT' }),
      makeOpportunity({ id: 'opp-manager', assignedTo: 'mgr', dueDate: '2026-07-10', status: 'DISCUSSION' }),
      makeOpportunity({ id: 'opp-submitted', assignedTo: 'assoc', dueDate: '2026-07-10', status: 'SUBMITTED' }),
    ]
    const contracts: Contract[] = [
      makeContract({ id: 'contract-assoc', assignedTo: 'assoc', popEnd: '2026-07-10', status: 'ACTIVE' }),
      makeContract({ id: 'contract-lead', assignedTo: 'tl', popEnd: '2026-07-12', status: 'KICK_OFF' }),
      makeContract({ id: 'contract-archived', assignedTo: 'assoc', popEnd: '2026-07-10', status: 'ARCHIVED' }),
    ]

    const workloads = assignmentWorkloadByEmployee({
      employees,
      opportunities,
      contracts,
      selectedDueDay: '2026-07-10',
      excludeOpportunityId: 'current',
    })

    expect(teamMemberIdsForWorkload(employees, 'mgr')).toEqual(['mgr', 'tl', 'assoc'])
    expect(teamMemberIdsForWorkload(employees, 'tl')).toEqual(['tl', 'assoc'])
    expect(teamMemberIdsForWorkload(employees, 'assoc')).toEqual(['assoc'])

    expect(workloads.assoc).toEqual({ activeTotal: 2, sameDueDay: 2 })
    expect(workloads.tl).toEqual({ activeTotal: 4, sameDueDay: 2 })
    expect(workloads.mgr).toEqual({ activeTotal: 5, sameDueDay: 3 })
  })
})

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp',
    solicitation: 'Test Opportunity',
    solicitationId: 'SOL-1',
    client: 'Agency',
    type: 'OTJ',
    naicsCode: '238220',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    dueDate: '2026-07-10',
    localTime: '2:00 PM',
    location: 'MD',
    pop: '',
    bdm: '',
    bds: '',
    comments: [],
    period: 'JUL 2026',
    capturedOn: 'Jul 1, 2026',
    ...overrides,
  }
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract',
    contractId: 'CON-1',
    title: 'Test Contract',
    type: 'OTJ',
    naicsCode: '238220',
    setAside: 'SB',
    status: 'ACTIVE',
    location: 'MD',
    client: 'Agency',
    popStart: '2026-07-01',
    popEnd: '2026-07-10',
    value: 0,
    spm: '',
    pm: '',
    ...overrides,
  }
}
