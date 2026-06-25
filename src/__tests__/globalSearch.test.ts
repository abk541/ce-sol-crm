import { describe, expect, it } from 'vitest'
import { buildGlobalSearchResults, routeForOpportunity, type GlobalSearchData } from '../lib/globalSearch'
import type { BDSubmission, Contract, Employee, FreshAward, NonSubmissionReport, Opportunity, PastPerformance } from '../types'

const employees: Employee[] = [
  { id: 'manager-1', name: 'James Harrington', email: 'manager@example.com', role: 'BD_MANAGER', managerId: null, avatar: 'JH' },
  { id: 'lead-1', name: 'Marcus Webb', email: 'lead@example.com', role: 'TEAM_LEAD', managerId: 'manager-1', avatar: 'MW' },
  { id: 'associate-1', name: 'Kevin Patel', email: 'associate@example.com', role: 'ASSOCIATE', managerId: 'lead-1', avatar: 'KP' },
]

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp-1',
    solicitation: 'Cooling Tower Pump Repair',
    solicitationId: 'FA930226Q0062',
    client: 'Veterans Affairs',
    type: 'OTJ',
    naicsCode: '238220',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    dueDate: '2026-06-08',
    localTime: '17:00',
    timezone: 'EDT',
    location: 'Bloomingdale, GA',
    pop: '',
    bdm: '',
    bds: '',
    comments: [],
    period: 'JUN 2026',
    capturedOn: 'May 26, 2026',
    ...overrides,
  }
}

function makeData(overrides: Partial<GlobalSearchData> = {}): GlobalSearchData {
  return {
    opportunities: [],
    contracts: [],
    freshAwards: [],
    bdSubmissions: [],
    nonSubReports: [],
    pastPerformances: [],
    employees,
    requireAssociateForActivePipeline: true,
    ...overrides,
  }
}

describe('global search routing', () => {
  it('routes manager-only active opportunities to Assign Opportunities', () => {
    const opportunity = makeOpportunity({ assignedTo: 'manager-1' })
    const data = makeData({ opportunities: [opportunity] })

    expect(routeForOpportunity(opportunity, data)).toBe('/proposals?record=opp-1')
  })

  it('routes associate-assigned active opportunities to Contract Opportunities', () => {
    const opportunity = makeOpportunity({ assignedTo: 'associate-1' })
    const data = makeData({ opportunities: [opportunity] })

    expect(routeForOpportunity(opportunity, data)).toBe('/pipeline?record=opp-1')
  })

  it('routes submitted opportunities to their BD Tracker tab', () => {
    const opportunity = makeOpportunity({ status: 'SUBMITTED' })
    const bdSubmission: BDSubmission = {
      id: 42,
      submittedOn: '2026-05-26',
      solicitationId: opportunity.solicitationId,
      setAside: 'SB',
      type: 'OTJ',
      solicitation: opportunity.solicitation,
      status: 'SUBMITTED',
      dueDate: opportunity.dueDate,
      localTime: opportunity.localTime,
      location: opportunity.location,
      bdm: '',
      bds: '',
      value: 50000,
    }

    expect(routeForOpportunity(opportunity, makeData({ opportunities: [opportunity], bdSubmissions: [bdSubmission] })))
      .toBe('/bd-tracker?record=42&tab=SUBMITTED')
  })

  it('routes awarded opportunities to Fresh Awards until moved active', () => {
    const opportunity = makeOpportunity({ status: 'WON' })
    const freshAward: FreshAward = {
      id: 'fa-1',
      opportunityId: opportunity.id,
      solicitation: opportunity.solicitation,
      solicitationId: opportunity.solicitationId,
      client: opportunity.client,
      type: opportunity.type,
      setAside: opportunity.setAside,
      naicsCode: opportunity.naicsCode,
      awardedDate: '2026-05-26',
      status: 'PENDING_ASSIGNMENT',
    }

    expect(routeForOpportunity(opportunity, makeData({ opportunities: [opportunity], freshAwards: [freshAward] })))
      .toBe('/fresh-award?record=fa-1&tab=PENDING_ASSIGNMENT')
  })

  it('routes opportunities with active contracts to Contract Admin', () => {
    const opportunity = makeOpportunity({ status: 'WON' })
    const contract: Contract = {
      id: 'contract-1',
      contractId: opportunity.solicitationId,
      title: opportunity.solicitation,
      type: opportunity.type,
      naicsCode: opportunity.naicsCode,
      status: 'KICK_OFF',
      location: opportunity.location,
      popStart: '',
      popEnd: '',
      value: 50000,
      spm: '',
      pm: '',
      opportunityId: opportunity.id,
    }

    expect(routeForOpportunity(opportunity, makeData({ opportunities: [opportunity], contracts: [contract] })))
      .toBe('/contracts?record=contract-1')
  })

  it('routes deleted opportunities to Deletion Requests', () => {
    const opportunity = makeOpportunity({ isDeleted: true })

    expect(routeForOpportunity(opportunity, makeData({ opportunities: [opportunity] })))
      .toBe('/tracker?record=opp-1&tab=deleted')
  })

  it('builds searchable results from all tracked record types', () => {
    const opportunity = makeOpportunity({ assignedTo: 'associate-1' })
    const nonSubmissionOpportunity = makeOpportunity({
      id: 'opp-report',
      solicitation: 'Cooling Tower Non Submission Review',
      solicitationId: 'FA930226Q0099',
      status: 'NOT_SUBMITTED',
    })
    const report: NonSubmissionReport = {
      id: 'report-1',
      opportunityId: nonSubmissionOpportunity.id,
      agentUsername: 'Kevin Patel',
      reason: 'No submission after deadline',
      status: 'PENDING',
      submittedAt: '2026-05-26T12:00:00.000Z',
    }
    const pastPerformance: PastPerformance = {
      id: 'pp-1',
      contractId: 'contract-1',
      contractNumber: 'CN-001',
      title: 'Cooling Tower Pump Repair',
      client: 'Veterans Affairs',
      type: 'OTJ',
      naicsCode: '238220',
      setAside: 'SB',
      value: 50000,
      popStart: '2026-06-01',
      popEnd: '2026-06-30',
      description: '',
      relevance: '',
      bdm: '',
      bds: '',
      createdAt: '2026-05-26T12:00:00.000Z',
      createdBy: 'system',
    }

    const results = buildGlobalSearchResults('cooling', makeData({
      opportunities: [opportunity, nonSubmissionOpportunity],
      nonSubReports: [report],
      pastPerformances: [pastPerformance],
    }))

    expect(results.map(result => result.route)).toContain('/pipeline?record=opp-1')
    expect(results.map(result => result.route)).toContain('/non-submissions?record=opp-report&tab=reports')
    expect(results.map(result => result.route)).toContain('/past-performances?record=contract-1')
  })
})
