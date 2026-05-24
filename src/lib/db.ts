import { supabase, isSupabaseConnected } from './supabase'
import type {
  BDSubmission,
  Comment,
  DeletionRequest,
  Employee,
  Opportunity,
  Contract,
  ContractPoC,
  FreshAward,
  GovernmentWarning,
  LockedSubcontractor,
  NonSubmissionReport,
  PastPerformance,
  Subcontractor,
} from '../types'
import {
  normalizeContractDeliverables,
  serializeContractDeliverables,
} from './contractDeliverables'

// ── Opportunity mappers ──────────────────────────────────────────────────────

function oppToDb(o: Opportunity): Record<string, unknown> {
  return {
    id: o.id,
    solicitation: o.solicitation,
    solicitation_id: o.solicitationId,
    client: o.client,
    type: o.type,
    naics_code: o.naicsCode,
    set_aside: o.setAside,
    priority: o.priority,
    status: o.status,
    due_date: o.dueDate,
    local_time: o.localTime,
    timezone: o.timezone ?? null,
    location: o.location,
    pop: o.pop,
    bdm: o.bdm,
    bds: o.bds,
    support_agent: o.supportAgent ?? null,
    poc: o.poc ?? null,
    contract_amount: o.contractAmount ?? null,
    base_amount: o.baseAmount ?? null,
    monthly_payment: o.monthlyPayment ?? null,
    value: o.value ?? null,
    period: o.period,
    captured_on: o.capturedOn,
    mandatory_events: o.mandatoryEvents ?? null,
    link: o.link ?? null,
    is_deleted: o.isDeleted ?? null,
    deletion_requested: o.deletionRequested ?? null,
    submitted_at: o.submittedAt ?? null,
    non_submission_report_id: o.nonSubmissionReportId ?? null,
    assigned_to: o.assignedTo ?? null,
  }
}

function dbToOpp(row: Record<string, unknown>): Partial<Opportunity> {
  return {
    id: row.id as string,
    solicitation: row.solicitation as string,
    solicitationId: row.solicitation_id as string,
    client: row.client as string,
    type: row.type as Opportunity['type'],
    naicsCode: row.naics_code as string,
    setAside: row.set_aside as Opportunity['setAside'],
    priority: row.priority as Opportunity['priority'],
    status: row.status as Opportunity['status'],
    dueDate: row.due_date as string,
    localTime: row.local_time as string,
    timezone: row.timezone as string | undefined,
    location: row.location as string,
    pop: row.pop as string,
    bdm: row.bdm as string,
    bds: row.bds as string,
    supportAgent: row.support_agent as string | undefined,
    poc: row.poc as string | undefined,
    contractAmount: row.contract_amount as number | undefined,
    baseAmount: row.base_amount as number | undefined,
    monthlyPayment: row.monthly_payment as number | undefined,
    value: row.value as number | undefined,
    period: row.period as string,
    capturedOn: row.captured_on as string,
    mandatoryEvents: row.mandatory_events as string | undefined,
    link: row.link as string | undefined,
    isDeleted: row.is_deleted as boolean | undefined,
    deletionRequested: row.deletion_requested as boolean | undefined,
    submittedAt: row.submitted_at as string | undefined,
    nonSubmissionReportId: row.non_submission_report_id as string | undefined,
    assignedTo: row.assigned_to as string | undefined,
    // Initialize nested arrays — loaded separately if needed
    comments: [],
    proposals: [],
    subcontractors: [],
  }
}

// ── Contract mappers ─────────────────────────────────────────────────────────

function commentToDb(opportunityId: string, comment: Comment): Record<string, unknown> {
  return {
    id: comment.id,
    opportunity_id: opportunityId,
    text: comment.text,
    author: comment.author,
    created_at: comment.createdAt,
  }
}

function dbToComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    text: row.text as string,
    author: row.author as string,
    createdAt: row.created_at as string,
  }
}

function subcontractorToDb(sub: Subcontractor): Record<string, unknown> {
  return {
    id: sub.id,
    opportunity_id: sub.opportunityId,
    company_name: sub.companyName,
    contact_name: sub.contactName,
    email: sub.email,
    phone: sub.phone,
    naics_code: sub.naicsCode || null,
    set_aside: sub.setAside || null,
    notes: sub.notes,
    quote_file: sub.quoteFile ?? null,
    created_at: sub.createdAt,
    created_by: sub.createdBy,
  }
}

function dbToSubcontractor(row: Record<string, unknown>): Subcontractor {
  return {
    id: row.id as string,
    opportunityId: row.opportunity_id as string,
    companyName: row.company_name as string,
    contactName: row.contact_name as string,
    email: row.email as string,
    phone: row.phone as string,
    naicsCode: (row.naics_code as string | null) ?? '',
    setAside: (row.set_aside as string | null) ?? '',
    notes: (row.notes as string | null) ?? '',
    quoteFile: row.quote_file as string | undefined,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
  }
}

function contractToDb(c: Contract): Record<string, unknown> {
  return {
    id: c.id,
    contract_id: c.contractId,
    title: c.title,
    type: c.type,
    finance_type: c.financeType ?? null,
    naics_code: c.naicsCode,
    set_aside: c.setAside ?? null,
    status: c.status,
    location: c.location,
    client: c.client ?? null,
    pop_start: c.popStart,
    pop_end: c.popEnd,
    value: c.value,
    base_amount: c.baseAmount ?? null,
    monthly_payment: c.monthlyPayment ?? null,
    spm: c.spm,
    pm: c.pm,
    bds: c.bds ?? null,
    bdm: c.bdm ?? null,
    support_agent: c.supportAgent ?? null,
    opportunity_id: c.opportunityId ?? null,
    billing_notes: c.billingNotes ?? null,
    follow_up_date: c.followUpDate ?? null,
    option_years: c.optionYears ?? null,
    option_year_deadline: c.optionYearDeadline ?? null,
    deliverables: serializeContractDeliverables(c.deliverables),
    termination_type: c.terminationType ?? null,
    termination_date: c.terminationDate ?? null,
    termination_reason: c.terminationReason ?? null,
    assigned_to: c.assignedTo ?? null,
  }
}

function dbToContract(row: Record<string, unknown>): Partial<Contract> {
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    title: row.title as string,
    type: row.type as Contract['type'],
    financeType: row.finance_type as Contract['financeType'],
    naicsCode: row.naics_code as string,
    setAside: row.set_aside as Contract['setAside'],
    status: row.status as Contract['status'],
    location: row.location as string,
    client: row.client as string | undefined,
    popStart: row.pop_start as string,
    popEnd: row.pop_end as string,
    value: row.value as number,
    baseAmount: row.base_amount as number | undefined,
    monthlyPayment: row.monthly_payment as number | undefined,
    spm: row.spm as string,
    pm: row.pm as string,
    bds: row.bds as string | undefined,
    bdm: row.bdm as string | undefined,
    supportAgent: row.support_agent as string | undefined,
    opportunityId: row.opportunity_id as string | undefined,
    billingNotes: row.billing_notes as string | undefined,
    followUpDate: row.follow_up_date as string | undefined,
    optionYears: row.option_years as number | undefined,
    optionYearDeadline: row.option_year_deadline as string | undefined,
    deliverables: normalizeContractDeliverables(row.deliverables),
    terminationType: row.termination_type as Contract['terminationType'],
    terminationDate: row.termination_date as string | undefined,
    terminationReason: row.termination_reason as string | undefined,
    assignedTo: row.assigned_to as string | undefined,
    // Initialize nested arrays — loaded separately if needed
    pocs: [],
    lockedSubcontractors: [],
    governmentWarnings: [],
  }
}

// Contract child mappers

function pocToDb(poc: ContractPoC): Record<string, unknown> {
  return {
    id: poc.id,
    contract_id: poc.contractId,
    role: poc.role,
    name: poc.name,
    email: poc.email ?? null,
    phone: poc.phone ?? null,
    notes: poc.notes ?? null,
    contacted_at: poc.contactedAt ?? null,
  }
}

function dbToPoc(row: Record<string, unknown>): ContractPoC {
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    role: row.role as ContractPoC['role'],
    name: row.name as string,
    email: row.email as string | undefined,
    phone: row.phone as string | undefined,
    notes: row.notes as string | undefined,
    contactedAt: row.contacted_at as string | undefined,
  }
}

function lockedSubToDb(sub: LockedSubcontractor): Record<string, unknown> {
  return {
    id: sub.id,
    contract_id: sub.contractId,
    company_name: sub.companyName,
    contact_name: sub.contactName,
    email: sub.email ?? null,
    phone: sub.phone ?? null,
    set_aside: sub.setAside ?? null,
    naics_code: sub.naicsCode ?? null,
    subk_database_id: sub.subkDatabaseId ?? null,
    invoices: sub.invoices ?? null,
    sub_agreements: sub.subAgreements ?? null,
    quotes: sub.quotes ?? null,
    notes: sub.notes ?? null,
    created_at: sub.createdAt,
    created_by: sub.createdBy,
  }
}

function dbToLockedSub(row: Record<string, unknown>): LockedSubcontractor {
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    companyName: row.company_name as string,
    contactName: row.contact_name as string,
    email: row.email as string | undefined,
    phone: row.phone as string | undefined,
    setAside: row.set_aside as string | undefined,
    naicsCode: row.naics_code as string | undefined,
    subkDatabaseId: row.subk_database_id as string | undefined,
    invoices: row.invoices as string[] | undefined,
    subAgreements: row.sub_agreements as string[] | undefined,
    quotes: row.quotes as string[] | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
  }
}

function warningToDb(warning: GovernmentWarning): Record<string, unknown> {
  return {
    id: warning.id,
    contract_id: warning.contractId,
    type: warning.type,
    issued_date: warning.issuedDate,
    description: warning.description,
    severity: warning.severity,
    resolved_at: warning.resolvedAt ?? null,
    resolved_note: warning.resolvedNote ?? null,
  }
}

function dbToWarning(row: Record<string, unknown>): GovernmentWarning {
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    type: row.type as GovernmentWarning['type'],
    issuedDate: row.issued_date as string,
    description: row.description as string,
    severity: row.severity as GovernmentWarning['severity'],
    resolvedAt: row.resolved_at as string | undefined,
    resolvedNote: row.resolved_note as string | undefined,
  }
}

// ── FreshAward mappers ───────────────────────────────────────────────────────

function freshAwardToDb(fa: FreshAward): Record<string, unknown> {
  return {
    id: fa.id,
    bd_submission_id: fa.bdSubmissionId ?? null,
    opportunity_id: fa.opportunityId ?? null,
    solicitation: fa.solicitation,
    solicitation_id: fa.solicitationId,
    client: fa.client,
    type: fa.type,
    set_aside: fa.setAside,
    naics_code: fa.naicsCode,
    contract_amount: fa.contractAmount ?? null,
    base_amount: fa.baseAmount ?? null,
    monthly_payment: fa.monthlyPayment ?? null,
    pop: fa.pop ?? null,
    location: fa.location ?? null,
    awarded_date: fa.awardedDate,
    assigned_bdm: fa.assignedBDM ?? null,
    assigned_bds: fa.assignedBDS ?? null,
    assigned_spm: fa.assignedSPM ?? null,
    assigned_pm: fa.assignedPM ?? null,
    assigned_support_agent: fa.assignedSupportAgent ?? null,
    status: fa.status,
    contract_id: fa.contractId ?? null,
    moved_at: fa.movedAt ?? null,
    notes: fa.notes ?? null,
  }
}

function dbToFreshAward(row: Record<string, unknown>): Partial<FreshAward> {
  return {
    id: row.id as string,
    bdSubmissionId: row.bd_submission_id as number | undefined,
    opportunityId: row.opportunity_id as string | undefined,
    solicitation: row.solicitation as string,
    solicitationId: row.solicitation_id as string,
    client: row.client as string,
    type: row.type as FreshAward['type'],
    setAside: row.set_aside as FreshAward['setAside'],
    naicsCode: row.naics_code as string,
    contractAmount: row.contract_amount as number | undefined,
    baseAmount: row.base_amount as number | undefined,
    monthlyPayment: row.monthly_payment as number | undefined,
    pop: row.pop as string | undefined,
    location: row.location as string | undefined,
    awardedDate: row.awarded_date as string,
    assignedBDM: row.assigned_bdm as string | undefined,
    assignedBDS: row.assigned_bds as string | undefined,
    assignedSPM: row.assigned_spm as string | undefined,
    assignedPM: row.assigned_pm as string | undefined,
    assignedSupportAgent: row.assigned_support_agent as string | undefined,
    status: row.status as FreshAward['status'],
    contractId: row.contract_id as string | undefined,
    movedAt: row.moved_at as string | undefined,
    notes: row.notes as string | undefined,
  }
}

// ── PastPerformance mappers ──────────────────────────────────────────────────

function ppToDb(pp: PastPerformance): Record<string, unknown> {
  return {
    id: pp.id,
    opportunity_id: pp.opportunityId ?? null,
    contract_id: pp.contractId ?? null,
    contract_number: pp.contractNumber,
    title: pp.title,
    client: pp.client,
    type: pp.type,
    finance_type: pp.financeType ?? null,
    naics_code: pp.naicsCode,
    set_aside: pp.setAside,
    value: pp.value,
    pop_start: pp.popStart,
    pop_end: pp.popEnd,
    location: pp.location ?? null,
    description: pp.description,
    relevance: pp.relevance,
    key_personnel: pp.keyPersonnel ?? null,
    challenges: pp.challenges ?? null,
    bdm: pp.bdm,
    bds: pp.bds,
    created_at: pp.createdAt,
    created_by: pp.createdBy,
  }
}

function dbToPP(row: Record<string, unknown>): Partial<PastPerformance> {
  return {
    id: row.id as string,
    opportunityId: row.opportunity_id as string | undefined,
    contractId: row.contract_id as string | undefined,
    contractNumber: row.contract_number as string,
    title: row.title as string,
    client: row.client as string,
    type: row.type as PastPerformance['type'],
    financeType: row.finance_type as PastPerformance['financeType'],
    naicsCode: row.naics_code as string,
    setAside: row.set_aside as PastPerformance['setAside'],
    value: row.value as number,
    popStart: row.pop_start as string,
    popEnd: row.pop_end as string,
    location: row.location as string | undefined,
    description: row.description as string,
    relevance: row.relevance as string,
    keyPersonnel: row.key_personnel as string | undefined,
    challenges: row.challenges as string | undefined,
    bdm: row.bdm as string,
    bds: row.bds as string,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
  }
}

// ── Employee mapper ──────────────────────────────────────────────────────────

function empToDb(e: Employee): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    role: e.role,
    manager_id: e.managerId ?? null,
    department: e.department ?? null,
    avatar: e.avatar,
  }
}

function dbToEmp(row: Record<string, unknown>): Employee {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as Employee['role'],
    managerId: row.manager_id as string | null,
    department: row.department as string | undefined,
    avatar: row.avatar as string,
  }
}

// ── Load all data ────────────────────────────────────────────────────────────

function nonSubReportToDb(report: NonSubmissionReport): Record<string, unknown> {
  return {
    id: report.id,
    opportunity_id: report.opportunityId,
    agent_username: report.agentUsername,
    reason: report.reason,
    status: report.status,
    submitted_at: report.submittedAt,
    reviewed_by: report.reviewedBy ?? null,
    reviewed_at: report.reviewedAt ?? null,
    review_note: report.reviewNote ?? null,
  }
}

function dbToNonSubReport(row: Record<string, unknown>): NonSubmissionReport {
  return {
    id: row.id as string,
    opportunityId: row.opportunity_id as string,
    agentUsername: row.agent_username as string,
    reason: row.reason as string,
    status: row.status as NonSubmissionReport['status'],
    submittedAt: row.submitted_at as string,
    reviewedBy: row.reviewed_by as string | undefined,
    reviewedAt: row.reviewed_at as string | undefined,
    reviewNote: row.review_note as string | undefined,
  }
}

function deletionRequestToDb(req: DeletionRequest): Record<string, unknown> {
  return {
    id: req.id,
    opportunity_id: req.opportunityId,
    requested_by: req.requestedBy,
    reason: req.reason,
    status: req.status,
    requested_at: req.requestedAt,
    reviewed_by: req.reviewedBy ?? null,
    reviewed_at: req.reviewedAt ?? null,
  }
}

function dbToDeletionRequest(row: Record<string, unknown>): DeletionRequest {
  return {
    id: row.id as string,
    opportunityId: row.opportunity_id as string,
    requestedBy: row.requested_by as string,
    reason: row.reason as string,
    status: row.status as DeletionRequest['status'],
    requestedAt: row.requested_at as string,
    reviewedBy: row.reviewed_by as string | undefined,
    reviewedAt: row.reviewed_at as string | undefined,
  }
}

function bdSubmissionToDb(submission: BDSubmission): Record<string, unknown> {
  return {
    id: submission.id,
    submitted_on: submission.submittedOn,
    solicitation_id: submission.solicitationId,
    set_aside: submission.setAside,
    type: submission.type,
    solicitation: submission.solicitation,
    status: submission.status,
    due_date: submission.dueDate,
    local_time: submission.localTime,
    location: submission.location,
    bdm: submission.bdm,
    bds: submission.bds,
    support_agent: submission.supportAgent ?? null,
    value: submission.value,
    comment: submission.comment ?? null,
  }
}

function dbToBDSubmission(row: Record<string, unknown>): BDSubmission {
  return {
    id: Number(row.id),
    submittedOn: row.submitted_on as string,
    solicitationId: row.solicitation_id as string,
    setAside: row.set_aside as BDSubmission['setAside'],
    type: row.type as BDSubmission['type'],
    solicitation: row.solicitation as string,
    status: row.status as BDSubmission['status'],
    dueDate: row.due_date as string,
    localTime: row.local_time as string,
    location: row.location as string,
    bdm: row.bdm as string,
    bds: row.bds as string,
    supportAgent: row.support_agent as string | undefined,
    value: Number(row.value ?? 0),
    comment: row.comment as string | undefined,
  }
}

export async function loadAllData(): Promise<{
  employees: Employee[]
  opportunities: Opportunity[]
  contracts: Contract[]
  freshAwards: FreshAward[]
  pastPerformances: PastPerformance[]
  subcontractors: Subcontractor[]
  nonSubReports: NonSubmissionReport[]
  deletionRequests: DeletionRequest[]
  bdSubmissions: BDSubmission[]
} | null> {
  if (!isSupabaseConnected || !supabase) return null

  try {
    const [
      empRes,
      oppRes,
      commentRes,
      subRes,
      conRes,
      pocRes,
      lockedSubRes,
      warningRes,
      faRes,
      ppRes,
      nonSubRes,
      deletionRes,
      bdRes,
    ] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('opportunities').select('*'),
      supabase.from('comments').select('*'),
      supabase.from('subcontractors').select('*'),
      supabase.from('contracts').select('*'),
      supabase.from('contract_pocs').select('*'),
      supabase.from('locked_subcontractors').select('*'),
      supabase.from('government_warnings').select('*'),
      supabase.from('fresh_awards').select('*'),
      supabase.from('past_performances').select('*'),
      supabase.from('non_submission_reports').select('*'),
      supabase.from('deletion_requests').select('*'),
      supabase.from('bd_submissions').select('*'),
    ])

    if (empRes.error) console.error('[db] employees load error', empRes.error)
    if (oppRes.error) console.error('[db] opportunities load error', oppRes.error)
    if (commentRes.error) console.error('[db] comments load error', commentRes.error)
    if (subRes.error) console.error('[db] subcontractors load error', subRes.error)
    if (conRes.error) console.error('[db] contracts load error', conRes.error)
    if (pocRes.error) console.error('[db] contract_pocs load error', pocRes.error)
    if (lockedSubRes.error) console.error('[db] locked_subcontractors load error', lockedSubRes.error)
    if (warningRes.error) console.error('[db] government_warnings load error', warningRes.error)
    if (faRes.error) console.error('[db] fresh_awards load error', faRes.error)
    if (ppRes.error) console.error('[db] past_performances load error', ppRes.error)
    if (nonSubRes.error) console.error('[db] non_submission_reports load error', nonSubRes.error)
    if (deletionRes.error) console.error('[db] deletion_requests load error', deletionRes.error)
    if (bdRes.error) console.error('[db] bd_submissions load error', bdRes.error)

    const employees: Employee[] = (empRes.data ?? []).map(r => dbToEmp(r as Record<string, unknown>))
    const commentsByOpp = new Map<string, Comment[]>()
    ;(commentRes.data ?? []).forEach(r => {
      const row = r as Record<string, unknown>
      const oppId = row.opportunity_id as string
      const list = commentsByOpp.get(oppId) ?? []
      list.push(dbToComment(row))
      commentsByOpp.set(oppId, list)
    })
    const subcontractors: Subcontractor[] = (subRes.data ?? []).map(r => dbToSubcontractor(r as Record<string, unknown>))
    const opportunities: Opportunity[] = (oppRes.data ?? []).map(r => dbToOpp(r as Record<string, unknown>) as Opportunity)
      .map(opp => ({
        ...opp,
        comments: commentsByOpp.get(opp.id) ?? [],
        subcontractors: subcontractors.filter(sub => sub.opportunityId === opp.id),
      }))
    const pocs: ContractPoC[] = (pocRes.data ?? []).map(r => dbToPoc(r as Record<string, unknown>))
    const lockedSubs: LockedSubcontractor[] = (lockedSubRes.data ?? []).map(r => dbToLockedSub(r as Record<string, unknown>))
    const warnings: GovernmentWarning[] = (warningRes.data ?? []).map(r => dbToWarning(r as Record<string, unknown>))
    const contracts: Contract[] = (conRes.data ?? []).map(r => {
      const contract = dbToContract(r as Record<string, unknown>) as Contract
      contract.pocs = pocs.filter(p => p.contractId === contract.id)
      contract.lockedSubcontractors = lockedSubs.filter(s => s.contractId === contract.id)
      contract.governmentWarnings = warnings.filter(w => w.contractId === contract.id)
      return contract
    })
    const freshAwards: FreshAward[] = (faRes.data ?? []).map(r => dbToFreshAward(r as Record<string, unknown>) as FreshAward)
    const pastPerformances: PastPerformance[] = (ppRes.data ?? []).map(r => dbToPP(r as Record<string, unknown>) as PastPerformance)
    const nonSubReports: NonSubmissionReport[] = (nonSubRes.data ?? []).map(r => dbToNonSubReport(r as Record<string, unknown>))
    const deletionRequests: DeletionRequest[] = (deletionRes.data ?? []).map(r => dbToDeletionRequest(r as Record<string, unknown>))
    const bdSubmissions: BDSubmission[] = (bdRes.data ?? []).map(r => dbToBDSubmission(r as Record<string, unknown>))

    return {
      employees,
      opportunities,
      contracts,
      freshAwards,
      pastPerformances,
      subcontractors,
      nonSubReports,
      deletionRequests,
      bdSubmissions,
    }
  } catch (err) {
    console.error('[db] loadAllData failed', err)
    return null
  }
}

// ── Upsert helpers ───────────────────────────────────────────────────────────

export async function upsertOpportunity(o: Opportunity): Promise<boolean> {
  if (!isSupabaseConnected || !supabase) {
    console.error('[db] upsertOpportunity skipped: Supabase is not configured')
    return false
  }
  try {
    const { error } = await supabase.from('opportunities').upsert(oppToDb(o))
    if (error) {
      console.error('[db] upsertOpportunity error', error)
      return false
    }
    if (!error && Array.isArray(o.comments)) {
      const deleteRes = await supabase.from('comments').delete().eq('opportunity_id', o.id)
      if (deleteRes.error) {
        console.error('[db] sync comments delete error', deleteRes.error)
        return false
      }
      if (o.comments.length > 0) {
        const inserted = await insertBatched('comments', o.comments.map(comment => commentToDb(o.id, comment)))
        if (!inserted) return false
      }
    }
    return true
  } catch (err) {
    console.error('[db] upsertOpportunity failed', err)
    return false
  }
}

export async function deleteOpportunityRecord(id: string): Promise<boolean> {
  if (!isSupabaseConnected || !supabase) {
    console.error('[db] deleteOpportunityRecord skipped: Supabase is not configured')
    return false
  }
  try {
    const { error } = await supabase.from('opportunities').delete().eq('id', id)
    if (error) {
      console.error('[db] deleteOpportunityRecord error', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[db] deleteOpportunityRecord failed', err)
    return false
  }
}

export async function upsertSubcontractor(sub: Subcontractor): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('subcontractors').upsert(subcontractorToDb(sub))
    if (error) console.error('[db] upsertSubcontractor error', error)
  } catch (err) {
    console.error('[db] upsertSubcontractor failed', err)
  }
}

export async function deleteSubcontractorRecord(id: string): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('subcontractors').delete().eq('id', id)
    if (error) console.error('[db] deleteSubcontractorRecord error', error)
  } catch (err) {
    console.error('[db] deleteSubcontractorRecord failed', err)
  }
}

export async function upsertContract(c: Contract): Promise<boolean> {
  if (!isSupabaseConnected || !supabase) {
    console.error('[db] upsertContract skipped: Supabase is not configured')
    return false
  }
  try {
    const { error } = await supabase.from('contracts').upsert(contractToDb(c))
    if (error) {
      console.error('[db] upsertContract error', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[db] upsertContract failed', err)
    return false
  }
}

export async function upsertContractPoC(poc: ContractPoC): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('contract_pocs').upsert(pocToDb(poc))
    if (error) console.error('[db] upsertContractPoC error', error)
  } catch (err) {
    console.error('[db] upsertContractPoC failed', err)
  }
}

export async function deleteContractPoC(id: string): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('contract_pocs').delete().eq('id', id)
    if (error) console.error('[db] deleteContractPoC error', error)
  } catch (err) {
    console.error('[db] deleteContractPoC failed', err)
  }
}

export async function upsertLockedSubcontractor(sub: LockedSubcontractor): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('locked_subcontractors').upsert(lockedSubToDb(sub))
    if (error) console.error('[db] upsertLockedSubcontractor error', error)
  } catch (err) {
    console.error('[db] upsertLockedSubcontractor failed', err)
  }
}

export async function upsertGovernmentWarning(warning: GovernmentWarning): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('government_warnings').upsert(warningToDb(warning))
    if (error) console.error('[db] upsertGovernmentWarning error', error)
  } catch (err) {
    console.error('[db] upsertGovernmentWarning failed', err)
  }
}

export async function upsertFreshAward(fa: FreshAward): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('fresh_awards').upsert(freshAwardToDb(fa))
    if (error) console.error('[db] upsertFreshAward error', error)
  } catch (err) {
    console.error('[db] upsertFreshAward failed', err)
  }
}

export async function deleteFreshAwardRecord(id: string): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('fresh_awards').delete().eq('id', id)
    if (error) console.error('[db] deleteFreshAwardRecord error', error)
  } catch (err) {
    console.error('[db] deleteFreshAwardRecord failed', err)
  }
}

export async function upsertPastPerformance(pp: PastPerformance): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('past_performances').upsert(ppToDb(pp))
    if (error) console.error('[db] upsertPastPerformance error', error)
  } catch (err) {
    console.error('[db] upsertPastPerformance failed', err)
  }
}

// ── Clear all business data ──────────────────────────────────────────────────

export async function upsertNonSubReport(report: NonSubmissionReport): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('non_submission_reports').upsert(nonSubReportToDb(report))
    if (error) console.error('[db] upsertNonSubReport error', error)
  } catch (err) {
    console.error('[db] upsertNonSubReport failed', err)
  }
}

export async function upsertDeletionRequest(req: DeletionRequest): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('deletion_requests').upsert(deletionRequestToDb(req))
    if (error) console.error('[db] upsertDeletionRequest error', error)
  } catch (err) {
    console.error('[db] upsertDeletionRequest failed', err)
  }
}

export async function upsertBDSubmission(submission: BDSubmission): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('bd_submissions').upsert(bdSubmissionToDb(submission))
    if (error) console.error('[db] upsertBDSubmission error', error)
  } catch (err) {
    console.error('[db] upsertBDSubmission failed', err)
  }
}

export async function clearBusinessData(): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    for (const table of [
      'contract_pocs',
      'locked_subcontractors',
      'government_warnings',
      'comments',
      'subcontractors',
      'non_submission_reports',
      'deletion_requests',
      'notifications',
      'activity_logs',
      'bd_submissions',
      'subk_database',
      'past_performances',
      'fresh_awards',
      'contracts',
      'opportunities',
    ]) {
      const { error } = await supabase.from(table).delete().not('id', 'is', null)
      if (error) console.error(`[db] clear ${table} error`, error)
    }
    console.log('[db] All business data cleared from Supabase.')
  } catch (err) {
    console.error('[db] clearBusinessData failed', err)
  }
}

// ── Seed if empty ────────────────────────────────────────────────────────────

export async function seedEmployeesIfEmpty(employees: Employee[]): Promise<void> {
  if (!isSupabaseConnected || !supabase || employees.length === 0) return

  try {
    const { count, error } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('[db] seedEmployeesIfEmpty count check error', error)
      return
    }

    if ((count ?? 0) > 0) return

    const inserted = await insertBatched(
      'employees',
      employees.map(empToDb),
    )
    if (inserted) console.log('[db] Seeded employee hierarchy in Supabase.')
  } catch (err) {
    console.error('[db] seedEmployeesIfEmpty failed', err)
  }
}

async function insertBatched<T>(
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 20,
): Promise<boolean> {
  if (!supabase) return false
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).insert(batch).select()
    if (error) {
      console.error(`[db] insert batch into ${table} error`, error)
      return false
    }
  }
  return true
}

export async function seedIfEmpty(mockData: {
  opportunities: Opportunity[]
  contracts: Contract[]
  freshAwards: FreshAward[]
  pastPerformances: PastPerformance[]
}): Promise<void> {
  if (!isSupabaseConnected || !supabase) return

  try {
    // Check if opportunities table is already seeded
    const { count, error } = await supabase
      .from('opportunities')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('[db] seedIfEmpty count check error', error)
      return
    }

    if ((count ?? 0) > 0) return // already seeded

    console.log('[db] Seeding Supabase with mock data...')

    await insertBatched(
      'opportunities',
      mockData.opportunities.map(oppToDb),
    )
    await insertBatched(
      'contracts',
      mockData.contracts.map(contractToDb),
    )
    await insertBatched(
      'fresh_awards',
      mockData.freshAwards.map(freshAwardToDb),
    )
    await insertBatched(
      'past_performances',
      mockData.pastPerformances.map(ppToDb),
    )

    console.log('[db] Seed complete.')
  } catch (err) {
    console.error('[db] seedIfEmpty failed', err)
  }
}
