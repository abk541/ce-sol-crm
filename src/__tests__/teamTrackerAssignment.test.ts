import { describe, expect, it } from 'vitest'
import {
  findBDSubmissionForOpportunity,
  findUserByExactIdentity,
  getBDSubmissionAssignmentChain,
  isOpportunityAssociatedToUser,
} from '../lib/team'
import type { BDSubmission, Employee, User } from '../types'
import type { Opportunity } from '../types'

const employees: Employee[] = [
  { id: 'manager', name: 'Morgan Manager', email: 'manager@example.com', role: 'BD_MANAGER', managerId: null, avatar: 'MM' },
  { id: 'lead', name: 'Taylor Lead', email: 'lead@example.com', role: 'TEAM_LEAD', managerId: 'manager', avatar: 'TL' },
  { id: 'associate', name: 'Alex Associate', email: 'associate@example.com', role: 'ASSOCIATE', managerId: 'lead', avatar: 'AA' },
]

const submission: BDSubmission = {
  id: 1,
  submittedOn: '2026-07-21',
  solicitationId: 'SOL-1',
  setAside: 'SB',
  type: 'OTJ',
  solicitation: 'Tracker assignment regression',
  status: 'CANCELED',
  dueDate: '2026-08-01',
  localTime: '17:00',
  location: 'Remote',
  bdm: 'Morgan Manager',
  bds: 'Taylor Lead',
  supportAgent: 'Alex Associate',
  value: 0,
}

const account: User = {
  id: 'account-1',
  authUserId: '11111111-1111-4111-8111-111111111111',
  username: 'alex.associate',
  name: 'Alex Associate',
  email: 'associate@example.com',
  role: 'ASSOCIATE',
  avatar: 'AA',
  status: 'active',
  firstLogin: false,
  createdAt: '2026-07-01T00:00:00.000Z',
}

describe('exact account identity resolution', () => {
  it('resolves immutable ids and migrated exact values', () => {
    expect(findUserByExactIdentity([account], account.id)?.id).toBe(account.id)
    expect(findUserByExactIdentity([account], ` ${account.email.toUpperCase()} `)?.id).toBe(account.id)
    expect(findUserByExactIdentity([account], account.name)?.id).toBe(account.id)
  })

  it('fails closed for ambiguous legacy names', () => {
    expect(findUserByExactIdentity([
      account,
      { ...account, id: 'account-2', username: 'alex-2', email: 'alex-2@example.com' },
    ], account.name)).toBeUndefined()
  })
})

describe('BD Tracker assignment fallback', () => {
  it('reconstructs an orphaned tracker hierarchy from its saved names', () => {
    const chain = getBDSubmissionAssignmentChain(employees, submission, [])

    expect(chain.manager?.id).toBe('manager')
    expect(chain.teamLead?.id).toBe('lead')
    expect(chain.associate?.id).toBe('associate')
    expect(chain.assigned?.id).toBe('associate')
  })

  it('matches legacy username and email references as well as display names', () => {
    const chain = getBDSubmissionAssignmentChain(employees, {
      ...submission,
      bdm: 'manager@example.com',
      bds: 'lead',
      supportAgent: 'associate',
    }, [])

    expect(chain.manager?.id).toBe('manager')
    expect(chain.teamLead?.id).toBe('lead')
    expect(chain.associate?.id).toBe('associate')
  })

  it('uses opportunityId before a legacy solicitation fallback', () => {
    const opportunities = [{
      id: 'linked-opportunity',
      solicitationId: 'DIFFERENT-SOLICITATION',
      solicitation: 'Renamed opportunity',
      assignedTo: 'associate',
    }] as Opportunity[]
    const chain = getBDSubmissionAssignmentChain(employees, {
      ...submission,
      opportunityId: 'linked-opportunity',
      solicitationId: 'STALE-SOLICITATION',
      bdm: '',
      bds: '',
      supportAgent: undefined,
    }, opportunities)

    expect(chain.associate?.id).toBe('associate')
    expect(chain.teamLead?.id).toBe('lead')
    expect(chain.manager?.id).toBe('manager')
  })

  it('does not guess an opportunity for an ambiguous legacy solicitation', () => {
    const opportunities = [
      { id: 'opp-1', solicitationId: ' SOL-1 ', assignedTo: 'manager' },
      { id: 'opp-2', solicitationId: 'sol-1', assignedTo: 'lead' },
    ] as Opportunity[]
    const chain = getBDSubmissionAssignmentChain(employees, submission, opportunities)

    expect(chain.assigned?.id).toBe('associate')
    expect(chain.manager?.id).toBe('manager')
    expect(chain.teamLead?.id).toBe('lead')
  })

  it('does not assign one unlinked legacy tracker row to duplicate opportunities', () => {
    const opportunities = [
      { id: 'opp-1', solicitationId: ' SOL-1 ' },
      { id: 'opp-2', solicitationId: 'sol-1' },
    ] as Opportunity[]

    expect(findBDSubmissionForOpportunity([submission], opportunities[0]!, opportunities)).toBeUndefined()
    expect(findBDSubmissionForOpportunity([submission], opportunities[1]!, opportunities)).toBeUndefined()
  })

  it('uses a durable tracker link even when solicitation IDs are duplicated', () => {
    const opportunities = [
      { id: 'opp-1', solicitationId: 'SOL-1' },
      { id: 'opp-2', solicitationId: 'SOL-1' },
    ] as Opportunity[]
    const linked = { ...submission, opportunityId: 'opp-2' }

    expect(findBDSubmissionForOpportunity([linked], opportunities[1]!, opportunities)).toEqual(linked)
    expect(findBDSubmissionForOpportunity([linked], opportunities[0]!, opportunities)).toBeUndefined()
  })
})

describe('legacy opportunity sourcing ownership', () => {
  const associateUser: User = {
    id: 'associate-user',
    name: 'Alex Associate',
    email: 'associate@example.com',
    username: 'associate',
    role: 'ASSOCIATE',
    avatar: 'AA',
    status: 'active',
    firstLogin: false,
    createdAt: '2026-07-01',
  }

  it('recognizes the saved support-agent reference after a migrated assignment', () => {
    expect(isOpportunityAssociatedToUser(employees, associateUser, {
      assignedTo: 'lead',
      bdm: 'Morgan Manager',
      bds: 'Taylor Lead',
      supportAgent: 'associate',
    })).toBe(true)
  })

  it('does not grant an associate access to another support agent', () => {
    expect(isOpportunityAssociatedToUser(employees, associateUser, {
      assignedTo: 'lead',
      bdm: 'Morgan Manager',
      bds: 'Taylor Lead',
      supportAgent: 'someone-else',
    })).toBe(false)
  })
})
