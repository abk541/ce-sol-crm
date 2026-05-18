import { supabase, isSupabaseConnected } from './supabase'
import type { Employee, Opportunity, Contract, FreshAward, PastPerformance } from '../types'

// ── Opportunity mappers ──────────────────────────────────────────────────────

function oppToDb(o: Opportunity): Record<string, unknown> {
  return {
    id: o.id,
    solicitation: o.solicitation,
    solicitation_id: o.solicitationId,
    client: o.client,
    prime: o.prime,
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
    prime: row.prime as Opportunity['prime'],
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

function contractToDb(c: Contract): Record<string, unknown> {
  return {
    id: c.id,
    contract_id: c.contractId,
    title: c.title,
    prime: c.prime,
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
    deliverables: c.deliverables ?? null,
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
    prime: row.prime as Contract['prime'],
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
    deliverables: row.deliverables as string[] | undefined,
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

// ── FreshAward mappers ───────────────────────────────────────────────────────

function freshAwardToDb(fa: FreshAward): Record<string, unknown> {
  return {
    id: fa.id,
    bd_submission_id: fa.bdSubmissionId ?? null,
    opportunity_id: fa.opportunityId ?? null,
    solicitation: fa.solicitation,
    solicitation_id: fa.solicitationId,
    client: fa.client,
    prime: fa.prime,
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
    prime: row.prime as FreshAward['prime'],
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
    prime: pp.prime,
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
    prime: row.prime as PastPerformance['prime'],
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

export async function loadAllData(): Promise<{
  employees: Employee[]
  opportunities: Opportunity[]
  contracts: Contract[]
  freshAwards: FreshAward[]
  pastPerformances: PastPerformance[]
} | null> {
  if (!isSupabaseConnected || !supabase) return null

  try {
    const [empRes, oppRes, conRes, faRes, ppRes] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('opportunities').select('*'),
      supabase.from('contracts').select('*'),
      supabase.from('fresh_awards').select('*'),
      supabase.from('past_performances').select('*'),
    ])

    if (empRes.error) console.error('[db] employees load error', empRes.error)
    if (oppRes.error) console.error('[db] opportunities load error', oppRes.error)
    if (conRes.error) console.error('[db] contracts load error', conRes.error)
    if (faRes.error) console.error('[db] fresh_awards load error', faRes.error)
    if (ppRes.error) console.error('[db] past_performances load error', ppRes.error)

    const employees: Employee[] = (empRes.data ?? []).map(r => dbToEmp(r as Record<string, unknown>))
    const opportunities: Opportunity[] = (oppRes.data ?? []).map(r => dbToOpp(r as Record<string, unknown>) as Opportunity)
    const contracts: Contract[] = (conRes.data ?? []).map(r => dbToContract(r as Record<string, unknown>) as Contract)
    const freshAwards: FreshAward[] = (faRes.data ?? []).map(r => dbToFreshAward(r as Record<string, unknown>) as FreshAward)
    const pastPerformances: PastPerformance[] = (ppRes.data ?? []).map(r => dbToPP(r as Record<string, unknown>) as PastPerformance)

    return { employees, opportunities, contracts, freshAwards, pastPerformances }
  } catch (err) {
    console.error('[db] loadAllData failed', err)
    return null
  }
}

// ── Upsert helpers ───────────────────────────────────────────────────────────

export async function upsertOpportunity(o: Opportunity): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('opportunities').upsert(oppToDb(o))
    if (error) console.error('[db] upsertOpportunity error', error)
  } catch (err) {
    console.error('[db] upsertOpportunity failed', err)
  }
}

export async function upsertContract(c: Contract): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('contracts').upsert(contractToDb(c))
    if (error) console.error('[db] upsertContract error', error)
  } catch (err) {
    console.error('[db] upsertContract failed', err)
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

export async function clearBusinessData(): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    await Promise.all([
      supabase.from('opportunities').delete().neq('id', ''),
      supabase.from('contracts').delete().neq('id', ''),
      supabase.from('fresh_awards').delete().neq('id', ''),
      supabase.from('past_performances').delete().neq('id', ''),
    ])
    console.log('[db] All business data cleared from Supabase.')
  } catch (err) {
    console.error('[db] clearBusinessData failed', err)
  }
}

// ── Seed if empty ────────────────────────────────────────────────────────────

async function insertBatched<T>(
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 20,
): Promise<void> {
  if (!supabase) return
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).insert(batch).select()
    if (error) console.error(`[db] insert batch into ${table} error`, error)
  }
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
