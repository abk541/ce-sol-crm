import type {
  BDSubmission,
  Contract,
  Employee,
  FreshAward,
  NonSubmissionReport,
  Opportunity,
  PastPerformance,
} from '../types'
import { getAssignmentChain, isAssignedToAssociate } from './team'

const PRE_SUBMISSION_STATUSES: Opportunity['status'][] = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION']

export type GlobalSearchResult = {
  id: string
  kind: 'opportunity' | 'contract' | 'fresh_award' | 'bd_submission' | 'non_submission' | 'past_performance'
  title: string
  subtitle: string
  meta: string
  route: string
  rank: number
}

export type GlobalSearchData = {
  opportunities: Opportunity[]
  contracts: Contract[]
  freshAwards: FreshAward[]
  bdSubmissions: BDSubmission[]
  nonSubReports: NonSubmissionReport[]
  pastPerformances: PastPerformance[]
  employees: Employee[]
  requireAssociateForActivePipeline: boolean
}

function route(path: string, params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value))
  })
  const query = qs.toString()
  return query ? `${path}?${query}` : path
}

function haystack(values: Array<string | number | undefined | null>) {
  return values.filter(v => v !== undefined && v !== null).map(String).join(' ').toLowerCase()
}

function score(query: string, values: Array<string | number | undefined | null>) {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const text = haystack(values)
  if (!text.includes(q)) return 0

  const exact = values.some(value => String(value ?? '').toLowerCase() === q)
  const starts = values.some(value => String(value ?? '').toLowerCase().startsWith(q))
  if (exact) return 100
  if (starts) return 70
  return 40
}

function typeLabel(value: string | undefined) {
  return value === 'S&D' || value === 'SUPPLY' ? 'S&D' : value || '-'
}

function bdTabForOpportunity(opp: Opportunity, bdSubmissions: BDSubmission[]) {
  return bdSubmissions.find(row =>
    row.solicitationId === opp.solicitationId ||
    row.solicitation === opp.solicitation
  )
}

export function routeForOpportunity(opp: Opportunity, data: GlobalSearchData) {
  const contract = data.contracts.find(c =>
    c.opportunityId === opp.id ||
    c.contractId === opp.solicitationId
  )
  if (contract) return route('/contracts', { record: contract.id })

  if (opp.isDeleted) return route('/tracker', { record: opp.id, tab: 'deleted' })

  const freshAward = data.freshAwards.find(fa =>
    fa.status !== 'MOVED_TO_ACTIVE' &&
    (fa.opportunityId === opp.id || fa.solicitationId === opp.solicitationId)
  )
  if (freshAward) return route('/fresh-award', { record: freshAward.id, tab: freshAward.status })

  const bdRow = bdTabForOpportunity(opp, data.bdSubmissions)
  if (bdRow) return route('/bd-tracker', { record: bdRow.id, tab: bdRow.status })

  const nonSubReport = data.nonSubReports.find(report => report.opportunityId === opp.id)
  if (nonSubReport || opp.status === 'DROPPED' || opp.status === 'NOT_SUBMITTED') {
    return route('/non-submissions', {
      record: opp.id,
      tab: opp.status === 'DROPPED' ? 'dropped' : 'reports',
    })
  }

  if (PRE_SUBMISSION_STATUSES.includes(opp.status)) {
    // Mode A sends opps without an Associate to /proposals; Mode B only sends
    // completely unassigned opps there since any assignee makes the opp ACTIVE.
    const liveInPipeline = data.requireAssociateForActivePipeline
      ? isAssignedToAssociate(data.employees, opp.assignedTo)
      : !!opp.assignedTo
    return route(liveInPipeline ? '/pipeline' : '/proposals', {
      record: opp.id,
    })
  }

  return route('/pipeline', { record: opp.id })
}

export function buildGlobalSearchResults(query: string, data: GlobalSearchData): GlobalSearchResult[] {
  const q = query.trim()
  if (q.length < 2) return []

  const results: GlobalSearchResult[] = []

  data.opportunities.forEach(opp => {
    const chain = getAssignmentChain(data.employees, opp.assignedTo)
    const rank = score(q, [
      opp.solicitation,
      opp.solicitationId,
      opp.client,
      opp.location,
      opp.naicsCode,
      opp.status,
      opp.type,
      chain.manager?.name,
      chain.teamLead?.name,
      chain.associate?.name,
    ])
    if (!rank) return

    results.push({
      id: `opp-${opp.id}`,
      kind: 'opportunity',
      title: opp.solicitation || 'Untitled opportunity',
      subtitle: `${opp.solicitationId || 'No ID'} - ${opp.client || 'No agency'}`,
      meta: `${typeLabel(opp.type)} - ${opp.status.replace(/_/g, ' ')}`,
      route: routeForOpportunity(opp, data),
      rank: rank + 20,
    })
  })

  data.contracts.forEach(contract => {
    const chain = getAssignmentChain(data.employees, contract.assignedTo)
    const rank = score(q, [
      contract.title,
      contract.contractId,
      contract.contractNumber,
      contract.client,
      contract.location,
      contract.naicsCode,
      contract.status,
      contract.type,
      chain.assigned?.name,
      contract.bdm,
      contract.bds,
      contract.supportAgent,
    ])
    if (!rank) return

    results.push({
      id: `contract-${contract.id}`,
      kind: 'contract',
      title: contract.title || 'Untitled contract',
      subtitle: `${contract.contractId || 'No ID'} - ${contract.client || 'No client'}`,
      meta: `Contract Admin - ${contract.status.replace(/_/g, ' ')}`,
      route: route('/contracts', { record: contract.id }),
      rank,
    })
  })

  data.freshAwards
    .filter(fa => fa.status !== 'MOVED_TO_ACTIVE')
    .forEach(fa => {
      const rank = score(q, [
        fa.solicitation,
        fa.solicitationId,
        fa.client,
        fa.location,
        fa.naicsCode,
        fa.status,
        fa.type,
        fa.assignedBDM,
        fa.assignedBDS,
        fa.assignedSupportAgent,
      ])
      if (!rank) return

      results.push({
        id: `fresh-${fa.id}`,
        kind: 'fresh_award',
        title: fa.solicitation || 'Untitled fresh award',
        subtitle: `${fa.solicitationId || 'No ID'} - ${fa.client || 'No client'}`,
        meta: `Fresh Awards - ${fa.status.replace(/_/g, ' ')}`,
        route: route('/fresh-award', { record: fa.id, tab: fa.status }),
        rank,
      })
    })

  data.bdSubmissions.forEach(row => {
    const rank = score(q, [
      row.solicitation,
      row.solicitationId,
      row.location,
      row.status,
      row.type,
      row.bdm,
      row.bds,
      row.supportAgent,
    ])
    if (!rank) return

    results.push({
      id: `bd-${row.id}`,
      kind: 'bd_submission',
      title: row.solicitation || 'Untitled submission',
      subtitle: `${row.solicitationId || 'No ID'} - ${row.location || 'No location'}`,
      meta: `BD Tracker - ${row.status.replace(/_/g, ' ')}`,
      route: route('/bd-tracker', { record: row.id, tab: row.status }),
      rank,
    })
  })

  data.nonSubReports.forEach(report => {
    const opp = data.opportunities.find(o => o.id === report.opportunityId)
    const rank = score(q, [
      report.agentUsername,
      report.status,
      report.reason,
      opp?.solicitation,
      opp?.solicitationId,
      opp?.client,
    ])
    if (!rank) return

    results.push({
      id: `non-sub-${report.id}`,
      kind: 'non_submission',
      title: opp?.solicitation || 'Non-submission report',
      subtitle: `${opp?.solicitationId || report.opportunityId} - ${report.agentUsername}`,
      meta: `Non-Submissions - ${report.status}`,
      route: route('/non-submissions', { record: report.opportunityId, tab: 'reports' }),
      rank,
    })
  })

  data.pastPerformances.forEach(pp => {
    const rank = score(q, [
      pp.title,
      pp.contractId,
      pp.contractNumber,
      pp.client,
      pp.location,
      pp.naicsCode,
      pp.type,
    ])
    if (!rank) return

    results.push({
      id: `pp-${pp.id}`,
      kind: 'past_performance',
      title: pp.title || 'Past performance',
      subtitle: `${pp.contractNumber || pp.contractId || 'No ID'} - ${pp.client || 'No client'}`,
      meta: 'Past Performances',
      route: route('/past-performances', { record: pp.contractId || pp.contractNumber || pp.id }),
      rank,
    })
  })

  return results
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title))
    .slice(0, 10)
}
