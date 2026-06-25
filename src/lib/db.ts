import { supabase, isSupabaseConnected } from './supabase'
import type {
  BDSubmission,
  Comment,
  DeletionRequest,
  Employee,
  Opportunity,
  Contract,
  ContractInvoice,
  ContractPoC,
  ContractLineItem,
  ContractVehicleOrder,
  FreshAward,
  FileAttachment,
  GovernmentWarning,
  LockedSubcontractor,
  LockedSubkDocuments,
  NonSubmissionReport,
  PastPerformance,
  Role,
  SamGovContact,
  Subcontractor,
  SubcontractorContact,
  User,
} from '../types'
import type { Permission } from './permissions'
import {
  normalizeContractDeliverables,
  serializeContractDeliverables,
} from './contractDeliverables'

// ── Opportunity mappers ──────────────────────────────────────────────────────

const OPPORTUNITY_CONTACT_META_PREFIX = '__SAM_GOV_CONTACTS__:'
const SOURCING_META_PREFIX = '__SOURCING_META__:'

function serializeJsonMeta<T>(prefix: string, value: T): string {
  return `${prefix}${JSON.stringify(value)}`
}

function parseJsonMeta<T>(prefix: string, value: unknown): T | null {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null
  try {
    return JSON.parse(value.slice(prefix.length)) as T
  } catch {
    return null
  }
}

function normalizeSamGovContacts(value: unknown): SamGovContact[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const row = item as Record<string, unknown>
      const contact: SamGovContact = {
        id: typeof row.id === 'string' ? row.id : `sam-contact-${index}`,
      }
      if (row.kind === 'POC' || row.kind === 'CONTRACTING_OFFICE') contact.kind = row.kind
      if (typeof row.type === 'string') contact.type = row.type
      if (typeof row.title === 'string') contact.title = row.title
      if (typeof row.fullName === 'string') contact.fullName = row.fullName
      if (typeof row.email === 'string') contact.email = row.email
      if (typeof row.phone === 'string') contact.phone = row.phone
      if (typeof row.fax === 'string') contact.fax = row.fax
      if (typeof row.additionalInfo === 'string') contact.additionalInfo = row.additionalInfo
      return contact
    })
    .filter(contact =>
      contact.fullName || contact.email || contact.phone || contact.fax || contact.title || contact.additionalInfo
    )
}

function normalizeSubcontractorContacts(value: unknown): SubcontractorContact[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const row = item as Record<string, unknown>
      const contact: SubcontractorContact = {
        id: typeof row.id === 'string' ? row.id : `subk-contact-${index}`,
        name: typeof row.name === 'string' ? row.name : '',
      }
      if (typeof row.title === 'string') contact.title = row.title
      if (typeof row.email === 'string') contact.email = row.email
      if (typeof row.phone === 'string') contact.phone = row.phone
      if (typeof row.notes === 'string') contact.notes = row.notes
      return contact
    })
    .filter(contact => contact.name || contact.email || contact.phone || contact.title || contact.notes)
}

function primarySubcontractorContact(sub: Pick<Subcontractor, 'contactName' | 'email' | 'phone'>): SubcontractorContact | null {
  if (!(sub.contactName || sub.email || sub.phone)) return null
  return {
    id: 'primary',
    name: sub.contactName || '',
    email: sub.email || undefined,
    phone: sub.phone || undefined,
  }
}

function mergeSubcontractorContacts(sub: Pick<Subcontractor, 'contactName' | 'email' | 'phone' | 'contacts'>): SubcontractorContact[] {
  const contacts = normalizeSubcontractorContacts(sub.contacts)
  const primary = primarySubcontractorContact(sub)
  if (!primary) return contacts
  const hasPrimary = contacts.some(contact =>
    (contact.email && primary.email && contact.email.toLowerCase() === primary.email.toLowerCase()) ||
    (contact.phone && primary.phone && contact.phone === primary.phone) ||
    (contact.name && primary.name && contact.name.toLowerCase() === primary.name.toLowerCase())
  )
  return hasPrimary ? contacts : [primary, ...contacts]
}

function parseSourcingMeta(notes: unknown): { comments?: unknown; contacts?: unknown } | null {
  return parseJsonMeta<{ comments?: unknown; contacts?: unknown }>(SOURCING_META_PREFIX, notes)
}

function notesWithSourcingContacts(notes: string | undefined, contacts?: SubcontractorContact[]) {
  const normalizedContacts = normalizeSubcontractorContacts(contacts)
  if (!normalizedContacts.length) return notes ?? ''

  const meta = parseSourcingMeta(notes)
  let comments: unknown = []
  if (meta) comments = meta.comments ?? []
  else if (notes) {
    try {
      const parsed = JSON.parse(notes)
      comments = Array.isArray(parsed) ? parsed : []
    } catch {
      comments = notes
    }
  }

  return serializeJsonMeta(SOURCING_META_PREFIX, {
    comments,
    contacts: normalizedContacts,
  })
}

function oppToDb(o: Opportunity, opts: { includeSamGovContacts?: boolean } = {}): Record<string, unknown> {
  const includeSamGovContacts = opts.includeSamGovContacts !== false
  const proposalNames = o.proposals?.length ? o.proposals : attachmentNames(o.proposalAttachments) ?? []
  const assignedOpportunityNames = o.assignedOpportunities?.length ? o.assignedOpportunities : proposalNames
  const samGovContacts = normalizeSamGovContacts(o.samGovContacts)

  const row: Record<string, unknown> = {
    id: o.id,
    solicitation: o.solicitation,
    solicitation_id: o.solicitationId?.trim(),
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
    poc: samGovContacts.length ? serializeJsonMeta(OPPORTUNITY_CONTACT_META_PREFIX, samGovContacts) : o.poc ?? null,
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
    proposals: proposalNames,
    assigned_opportunities: assignedOpportunityNames,
    proposal_attachments: normalizeStoredAttachments(o.proposalAttachments),
  }
  if (includeSamGovContacts) row.sam_gov_contacts = samGovContacts
  return row
}

export type OpportunityDuplicateCheckResult =
  | { ok: true; duplicate: boolean; opportunityId?: string }
  | { ok: false; error: unknown }

export async function findActiveOpportunityDuplicate(
  solicitationId: string,
  excludeOpportunityId?: string,
): Promise<OpportunityDuplicateCheckResult> {
  if (!isSupabaseConnected || !supabase) {
    return { ok: true, duplicate: false }
  }

  const normalized = solicitationId.trim()
  if (!normalized) return { ok: true, duplicate: false }

  try {
    let query = supabase
      .from('opportunities')
      .select('id, solicitation_id, is_deleted')
      .ilike('solicitation_id', normalized)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .limit(1)

    if (excludeOpportunityId) query = query.neq('id', excludeOpportunityId)

    const { data, error } = await query
    if (error) {
      console.error('[db] findActiveOpportunityDuplicate error', error)
      return { ok: false, error }
    }

    const duplicate = (data ?? []).find(row => !row.is_deleted)
    return { ok: true, duplicate: !!duplicate, opportunityId: duplicate?.id as string | undefined }
  } catch (err) {
    console.error('[db] findActiveOpportunityDuplicate failed', err)
    return { ok: false, error: err }
  }
}

function dbToOpp(row: Record<string, unknown>): Partial<Opportunity> {
  const contactMeta = parseJsonMeta<unknown[]>(OPPORTUNITY_CONTACT_META_PREFIX, row.poc)
  const samGovContacts = normalizeSamGovContacts(row.sam_gov_contacts).length
    ? normalizeSamGovContacts(row.sam_gov_contacts)
    : normalizeSamGovContacts(contactMeta)
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
    poc: contactMeta ? undefined : row.poc as string | undefined,
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
    proposals: Array.isArray(row.proposals) ? row.proposals as string[] : [],
    assignedOpportunities: Array.isArray(row.assigned_opportunities) ? row.assigned_opportunities as string[] : [],
    proposalAttachments: normalizeStoredAttachments(row.proposal_attachments),
    samGovContacts,
    // Initialize nested arrays — loaded separately if needed
    comments: [],
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

function subcontractorToDb(sub: Subcontractor, opts: { includeContacts?: boolean } = {}): Record<string, unknown> {
  const includeContacts = opts.includeContacts !== false
  const contacts = mergeSubcontractorContacts(sub)
  const row: Record<string, unknown> = {
    id: sub.id,
    opportunity_id: sub.opportunityId,
    company_name: sub.companyName,
    contact_name: sub.contactName,
    email: sub.email,
    phone: sub.phone,
    website: sub.website ?? null,
    naics_code: sub.naicsCode || null,
    set_aside: sub.setAside || null,
    notes: notesWithSourcingContacts(sub.notes, contacts),
    quote_file: sub.quoteFile ?? null,
    created_at: sub.createdAt,
    created_by: sub.createdBy,
  }
  if (includeContacts) row.contacts = contacts
  return row
}

function dbToSubcontractor(row: Record<string, unknown>): Subcontractor {
  const meta = parseSourcingMeta(row.notes)
  const contacts = normalizeSubcontractorContacts(row.contacts).length
    ? normalizeSubcontractorContacts(row.contacts)
    : normalizeSubcontractorContacts(meta?.contacts)
  return {
    id: row.id as string,
    opportunityId: row.opportunity_id as string,
    companyName: row.company_name as string,
    contactName: row.contact_name as string,
    email: row.email as string,
    phone: row.phone as string,
    website: (row.website as string | null) ?? undefined,
    naicsCode: (row.naics_code as string | null) ?? '',
    setAside: (row.set_aside as string | null) ?? '',
    notes: meta ? JSON.stringify(meta.comments ?? []) : (row.notes as string | null) ?? '',
    quoteFile: row.quote_file as string | undefined,
    contacts,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
  }
}

function contractToDb(c: Contract): Record<string, unknown> {
  return {
    id: c.id,
    contract_id: c.contractId,
    contract_number: c.contractNumber ?? null,
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
    proposal_attachments: normalizeStoredAttachments(c.proposalAttachments),
    service_date: c.serviceDate ?? null,
    billing_period_start: c.billingPeriodStart ?? null,
    billing_period_end: c.billingPeriodEnd ?? null,
    current_pop_year: c.currentPopYear ?? null,
    gov_billing_status: c.governmentBillingStatus ?? null,
  }
}

function dbToContract(row: Record<string, unknown>): Partial<Contract> {
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    contractNumber: row.contract_number as string | undefined,
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
    proposalAttachments: normalizeStoredAttachments(row.proposal_attachments),
    serviceDate: row.service_date as string | undefined,
    billingPeriodStart: row.billing_period_start as string | undefined,
    billingPeriodEnd: row.billing_period_end as string | undefined,
    currentPopYear: row.current_pop_year as Contract['currentPopYear'],
    governmentBillingStatus: (row.gov_billing_status as Contract['governmentBillingStatus']) ?? undefined,
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

function invoiceToDb(inv: ContractInvoice): Record<string, unknown> {
  return {
    id: inv.id,
    contract_id: inv.contractId,
    invoice_number: inv.invoiceNumber,
    invoice_date: inv.invoiceDate,
    amount: inv.amount,
    payment_method: inv.paymentMethod ?? null,
    status: inv.status,
    service_from: inv.serviceFrom ?? null,
    service_to: inv.serviceTo ?? null,
    pop_year: inv.popYear ?? null,
    line_item_ids: inv.lineItemIds ?? [],
    sub_quote: inv.subQuote ?? null,
    due_date: inv.dueDate ?? null,
    sub_status: inv.subStatus ?? null,
    notes: inv.notes ?? null,
    created_at: inv.createdAt ?? null,
  }
}

function normalizeLineItemIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((id): id is string => typeof id === 'string')
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function dbToInvoice(row: Record<string, unknown>): ContractInvoice {
  const amountRaw = row.amount
  const subQuoteRaw = row.sub_quote
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    invoiceNumber: (row.invoice_number as string) ?? '',
    invoiceDate: (row.invoice_date as string) ?? '',
    amount: typeof amountRaw === 'number' ? amountRaw : Number(amountRaw ?? 0),
    paymentMethod: (row.payment_method as ContractInvoice['paymentMethod']) ?? undefined,
    status: ((row.status as ContractInvoice['status']) ?? 'SUBMITTED'),
    serviceFrom: (row.service_from as string | null) ?? undefined,
    serviceTo: (row.service_to as string | null) ?? undefined,
    popYear: (row.pop_year as ContractInvoice['popYear']) ?? undefined,
    lineItemIds: normalizeLineItemIds(row.line_item_ids),
    subQuote: subQuoteRaw == null ? undefined : Number(subQuoteRaw),
    dueDate: (row.due_date as string | null) ?? undefined,
    subStatus: (row.sub_status as ContractInvoice['subStatus']) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    createdAt: (row.created_at as string | null) ?? undefined,
  }
}

const LOCKED_SUBK_META_PREFIX = '__LOCKED_SUBK_META__:'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStoredAttachment(value: unknown, index: number): FileAttachment | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (isRecord(parsed)) return normalizeStoredAttachment(parsed, index)
    } catch {
      // Legacy attachment rows stored only the filename.
    }
    const name = value.trim()
    if (!name) return null
    return {
      id: `legacy-attachment-${index}`,
      name,
      attachedAt: '',
      uploadedBy: 'Legacy',
    }
  }

  if (!isRecord(value)) return null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name) return null
  const attachment: FileAttachment = {
    id: typeof value.id === 'string' ? value.id : `attachment-${index}`,
    name,
    attachedAt: typeof value.attachedAt === 'string' ? value.attachedAt : '',
    uploadedBy: typeof value.uploadedBy === 'string' ? value.uploadedBy : '',
  }
  if (typeof value.dataUrl === 'string') attachment.dataUrl = value.dataUrl
  if (typeof value.mimeType === 'string') attachment.mimeType = value.mimeType
  if (typeof value.size === 'number') attachment.size = value.size
  return attachment
}

function normalizeStoredAttachments(value: unknown): FileAttachment[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => normalizeStoredAttachment(item, index))
    .filter(Boolean) as FileAttachment[]
}

function serializeStoredAttachments(value?: FileAttachment[] | null): string[] | null {
  const normalized = normalizeStoredAttachments(value)
  if (!normalized.length) return null
  return normalized.map(att => JSON.stringify(att))
}

function attachmentNames(value?: FileAttachment[] | null): string[] | undefined {
  const names = normalizeStoredAttachments(value).map(att => att.name)
  return names.length ? names : undefined
}

function hasLockedSubDocuments(documents: LockedSubkDocuments) {
  return Object.values(documents).some(list => Array.isArray(list) && list.length > 0)
}

function normalizeLockedSubDocuments(sub: LockedSubcontractor): LockedSubkDocuments {
  return {
    quote: normalizeStoredAttachments(sub.documents?.quote?.length ? sub.documents.quote : sub.quotes),
    coi: normalizeStoredAttachments(sub.documents?.coi),
    w9: normalizeStoredAttachments(sub.documents?.w9),
    subAgreement: normalizeStoredAttachments(sub.documents?.subAgreement?.length ? sub.documents.subAgreement : sub.subAgreements),
    invoice: normalizeStoredAttachments(sub.documents?.invoice?.length ? sub.documents.invoice : sub.invoices),
  }
}

function encodeLockedSubNotes(
  notes: string | undefined,
  documents: LockedSubkDocuments,
  paymentRate: number | undefined,
  paid: boolean | undefined,
  website: string | undefined,
): string | null {
  const cleanNotes = notes?.trim() ?? ''
  const hasRate = typeof paymentRate === 'number' && Number.isFinite(paymentRate)
  const hasPaid = typeof paid === 'boolean'
  const cleanWebsite = website?.trim() || ''
  if (!hasLockedSubDocuments(documents) && !hasRate && !hasPaid && !cleanWebsite) {
    return cleanNotes || null
  }
  return `${LOCKED_SUBK_META_PREFIX}${JSON.stringify({
    notes: cleanNotes,
    paymentRate: hasRate ? paymentRate : undefined,
    paid: hasPaid ? paid : undefined,
    website: cleanWebsite || undefined,
    documents: {
      coi: documents.coi ?? [],
      w9: documents.w9 ?? [],
    },
  })}`
}

function decodeLockedSubNotes(value: unknown): {
  notes?: string
  paymentRate?: number
  paid?: boolean
  website?: string
  documents: Pick<LockedSubkDocuments, 'coi' | 'w9'>
} {
  if (typeof value !== 'string') return { documents: {} }
  if (!value.startsWith(LOCKED_SUBK_META_PREFIX)) return { notes: value || undefined, documents: {} }

  try {
    const parsed = JSON.parse(value.slice(LOCKED_SUBK_META_PREFIX.length)) as unknown
    if (!isRecord(parsed)) return { documents: {} }
    const rawDocuments = isRecord(parsed.documents) ? parsed.documents : {}
    const rawRate = parsed.paymentRate
    const paymentRate = typeof rawRate === 'number' && Number.isFinite(rawRate) ? rawRate : undefined
    const paid = typeof parsed.paid === 'boolean' ? parsed.paid : undefined
    const website = typeof parsed.website === 'string' && parsed.website.trim() ? parsed.website : undefined
    return {
      notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
      paymentRate,
      paid,
      website,
      documents: {
        coi: normalizeStoredAttachments(rawDocuments.coi),
        w9: normalizeStoredAttachments(rawDocuments.w9),
      },
    }
  } catch {
    return { documents: {} }
  }
}

function lockedSubToDb(sub: LockedSubcontractor): Record<string, unknown> {
  const documents = normalizeLockedSubDocuments(sub)
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
    invoices: serializeStoredAttachments(documents.invoice) ?? sub.invoices ?? null,
    sub_agreements: serializeStoredAttachments(documents.subAgreement) ?? sub.subAgreements ?? null,
    quotes: serializeStoredAttachments(documents.quote) ?? sub.quotes ?? null,
    notes: encodeLockedSubNotes(sub.notes, documents, sub.paymentRate, sub.paid, sub.website),
    created_at: sub.createdAt,
    created_by: sub.createdBy,
  }
}

function dbToLockedSub(row: Record<string, unknown>): LockedSubcontractor {
  const meta = decodeLockedSubNotes(row.notes)
  const documents: LockedSubkDocuments = {
    quote: normalizeStoredAttachments(row.quotes),
    coi: meta.documents.coi ?? [],
    w9: meta.documents.w9 ?? [],
    subAgreement: normalizeStoredAttachments(row.sub_agreements),
    invoice: normalizeStoredAttachments(row.invoices),
  }
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
    paymentRate: meta.paymentRate,
    paid: meta.paid,
    website: meta.website,
    invoices: attachmentNames(documents.invoice),
    subAgreements: attachmentNames(documents.subAgreement),
    quotes: attachmentNames(documents.quote),
    documents,
    notes: meta.notes,
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
    deadline: warning.deadline ?? null,
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
    deadline: typeof row.deadline === 'string' ? row.deadline : undefined,
    description: row.description as string,
    severity: row.severity as GovernmentWarning['severity'],
    resolvedAt: row.resolved_at as string | undefined,
    resolvedNote: row.resolved_note as string | undefined,
  }
}

// ── Contract line item (CLIN) mappers ────────────────────────────────────────

function lineItemToDb(line: ContractLineItem): Record<string, unknown> {
  return {
    id: line.id,
    contract_id: line.contractId,
    clin: line.clin,
    year: line.year,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
    amount: line.amount,
    created_at: line.createdAt ?? new Date().toISOString(),
  }
}

function dbToLineItem(row: Record<string, unknown>): ContractLineItem {
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    clin: row.clin as string,
    year: row.year as ContractLineItem['year'],
    description: row.description as string,
    quantity: Number(row.quantity ?? 0),
    unit: (row.unit as string) ?? '',
    rate: Number(row.rate ?? 0),
    amount: Number(row.amount ?? 0),
    createdAt: row.created_at as string | undefined,
  }
}

// ── FreshAward mappers ───────────────────────────────────────────────────────

function vehicleOrderToDb(order: ContractVehicleOrder): Record<string, unknown> {
  return {
    id: order.id,
    contract_id: order.contractId,
    type: order.type,
    order_number: order.number,
    total_value: order.totalValue,
    pop_start: order.popStart,
    pop_end: order.popEnd,
    document: order.document ?? null,
    created_at: order.createdAt ?? new Date().toISOString(),
    created_by: order.createdBy ?? null,
  }
}

function dbToVehicleOrder(row: Record<string, unknown>): ContractVehicleOrder {
  const docValue = row.document
  const documents = normalizeStoredAttachments(
    Array.isArray(docValue) ? docValue : docValue ? [docValue] : [],
  )
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    type: row.type as ContractVehicleOrder['type'],
    number: (row.order_number as string) ?? '',
    totalValue: Number(row.total_value ?? 0),
    popStart: (row.pop_start as string) ?? '',
    popEnd: (row.pop_end as string) ?? '',
    document: documents[0],
    createdAt: row.created_at as string | undefined,
    createdBy: row.created_by as string | undefined,
  }
}

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
    proposal_attachments: normalizeStoredAttachments(fa.proposalAttachments),
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
    proposalAttachments: normalizeStoredAttachments(row.proposal_attachments),
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
    team: e.team ?? 'BD',
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
    team: ((row.team as string | null | undefined) ?? 'BD') as Employee['team'],
  }
}

function employeeSyncRank(employee: Employee): number {
  if (!employee.managerId) return 0
  if (employee.role === 'TEAM_LEAD') return 1
  return 2
}

function employeeRowsForSync(employees: Employee[]): Record<string, unknown>[] {
  return [...employees]
    .sort((a, b) => employeeSyncRank(a) - employeeSyncRank(b))
    .map(empToDb)
}

type ExistingEmployeeIdentity = { id: string; email: string }

function existingEmployeesByExactEmail(existing: ExistingEmployeeIdentity[]) {
  return existing.reduce<Map<string, ExistingEmployeeIdentity[]>>((map, employee) => {
    const email = employee.email
    if (!email) return map
    map.set(email, [...(map.get(email) ?? []), employee])
    return map
  }, new Map())
}

function isDuplicateEmployeeEmailError(error: unknown) {
  const row = error as { code?: string; message?: string } | null
  return row?.code === '23505' && /email/i.test(row.message ?? '')
}

function legacyEmployeeEmail(email: string, employeeId: string) {
  const safeId = employeeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-16) || 'legacy'
  const at = email.indexOf('@')
  if (at > 0) {
    return `${email.slice(0, at)}+legacy-${safeId}${email.slice(at)}`
  }
  return `${email}+legacy-${safeId}`
}

async function releaseEmployeeEmailConflicts(
  row: Record<string, unknown>,
  existingByEmail: Map<string, ExistingEmployeeIdentity[]>,
): Promise<boolean> {
  if (!supabase) return false
  const email = String(row.email ?? '')
  const desiredId = String(row.id ?? '')
  const conflicts = (existingByEmail.get(email) ?? []).filter(employee => employee.id !== desiredId)
  if (conflicts.length === 0) return false

  for (const conflict of conflicts) {
    const { error } = await supabase
      .from('employees')
      .update({ email: legacyEmployeeEmail(conflict.email, conflict.id) })
      .eq('id', conflict.id)

    if (error) {
      console.error('[db] release employee email conflict error', error)
      return false
    }
  }

  return true
}

async function upsertEmployeeRowForSync(
  row: Record<string, unknown>,
  existingByEmail: Map<string, ExistingEmployeeIdentity[]>,
): Promise<boolean> {
  if (!supabase) return false

  let { error } = await supabase.from('employees').upsert(row, { onConflict: 'id' }).select()
  if (!error) return true

  if (isDuplicateEmployeeEmailError(error)) {
    const released = await releaseEmployeeEmailConflicts(row, existingByEmail)
    if (released) {
      const retry = await supabase.from('employees').upsert(row, { onConflict: 'id' }).select()
      error = retry.error
      if (!error) return true
    }
  }

  console.error('[db] upsert employee row error', error)
  return false
}

// ── User mapper ──────────────────────────────────────────────────────────────

function userToDb(u: User): Record<string, unknown> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    role: u.role,
    avatar: u.avatar ?? '',
    status: u.status,
    first_login: u.firstLogin,
    password: u.password ?? null,
    team: u.team ?? null,
    manager_id: u.managerId ?? null,
    created_at: u.createdAt ?? new Date().toISOString().split('T')[0],
  }
}

function dbToUser(row: Record<string, unknown>): User {
  const createdAtRaw = row.created_at as string | null | undefined
  const createdAt = (createdAtRaw ?? '').split('T')[0] || new Date().toISOString().split('T')[0]
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    username: row.username as string,
    role: row.role as User['role'],
    avatar: ((row.avatar as string | null) ?? '') as string,
    status: ((row.status as string) ?? 'active') as User['status'],
    firstLogin: Boolean(row.first_login),
    createdAt,
    password: ((row.password as string | null) ?? undefined) as string | undefined,
    team: ((row.team as string | null | undefined) ?? undefined) as User['team'],
    managerId: ((row.manager_id as string | null | undefined) ?? null) as User['managerId'],
  }
}

function userSyncRank(user: User): number {
  // Insert top-level managers (no manager) first so self-FK resolves.
  if (!user.managerId) return 0
  if (user.role === 'TEAM_LEAD') return 1
  return 2
}

function userRowsForSync(users: User[]): Record<string, unknown>[] {
  return [...users]
    .sort((a, b) => userSyncRank(a) - userSyncRank(b))
    .map(userToDb)
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
  users: User[]
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
      userRes,
      empRes,
      oppRes,
      commentRes,
      subRes,
      conRes,
      pocRes,
      invoiceRes,
      lockedSubRes,
      warningRes,
      lineItemRes,
      vehicleOrderRes,
      faRes,
      ppRes,
      nonSubRes,
      deletionRes,
      bdRes,
    ] = await Promise.all([
      supabase.from('users').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('opportunities').select('*'),
      supabase.from('comments').select('*'),
      supabase.from('subcontractors').select('*'),
      supabase.from('contracts').select('*'),
      supabase.from('contract_pocs').select('*'),
      supabase.from('contract_invoices').select('*'),
      supabase.from('locked_subcontractors').select('*'),
      supabase.from('government_warnings').select('*'),
      supabase.from('contract_line_items').select('*'),
      supabase.from('contract_vehicle_orders').select('*'),
      supabase.from('fresh_awards').select('*'),
      supabase.from('past_performances').select('*'),
      supabase.from('non_submission_reports').select('*'),
      supabase.from('deletion_requests').select('*'),
      supabase.from('bd_submissions').select('*'),
    ])

    if (userRes.error) console.error('[db] users load error', userRes.error)
    if (empRes.error) console.error('[db] employees load error', empRes.error)
    if (oppRes.error) console.error('[db] opportunities load error', oppRes.error)
    if (commentRes.error) console.error('[db] comments load error', commentRes.error)
    if (subRes.error) console.error('[db] subcontractors load error', subRes.error)
    if (conRes.error) console.error('[db] contracts load error', conRes.error)
    if (pocRes.error) console.error('[db] contract_pocs load error', pocRes.error)
    if (invoiceRes.error) console.error('[db] contract_invoices load error', invoiceRes.error)
    if (lockedSubRes.error) console.error('[db] locked_subcontractors load error', lockedSubRes.error)
    if (warningRes.error) console.error('[db] government_warnings load error', warningRes.error)
    if (lineItemRes.error) console.error('[db] contract_line_items load error', lineItemRes.error)
    if (vehicleOrderRes.error) console.error('[db] contract_vehicle_orders load error', vehicleOrderRes.error)
    if (faRes.error) console.error('[db] fresh_awards load error', faRes.error)
    if (ppRes.error) console.error('[db] past_performances load error', ppRes.error)
    if (nonSubRes.error) console.error('[db] non_submission_reports load error', nonSubRes.error)
    if (deletionRes.error) console.error('[db] deletion_requests load error', deletionRes.error)
    if (bdRes.error) console.error('[db] bd_submissions load error', bdRes.error)

    const employees: Employee[] = (empRes.data ?? []).map(r => dbToEmp(r as Record<string, unknown>))
    const users: User[] = (userRes.data ?? []).map(r => dbToUser(r as Record<string, unknown>))
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
    const invoices: ContractInvoice[] = (invoiceRes.data ?? []).map(r => dbToInvoice(r as Record<string, unknown>))
    const lockedSubs: LockedSubcontractor[] = (lockedSubRes.data ?? []).map(r => dbToLockedSub(r as Record<string, unknown>))
    const warnings: GovernmentWarning[] = (warningRes.data ?? []).map(r => dbToWarning(r as Record<string, unknown>))
    const lineItems: ContractLineItem[] = (lineItemRes.data ?? []).map(r => dbToLineItem(r as Record<string, unknown>))
    const vehicleOrders: ContractVehicleOrder[] = (vehicleOrderRes.data ?? []).map(r => dbToVehicleOrder(r as Record<string, unknown>))
    const contracts: Contract[] = (conRes.data ?? []).map(r => {
      const contract = dbToContract(r as Record<string, unknown>) as Contract
      contract.pocs = pocs.filter(p => p.contractId === contract.id)
      contract.invoices = invoices.filter(i => i.contractId === contract.id)
      contract.lockedSubcontractors = lockedSubs.filter(s => s.contractId === contract.id)
      contract.governmentWarnings = warnings.filter(w => w.contractId === contract.id)
      contract.lineItems = lineItems.filter(l => l.contractId === contract.id)
      contract.vehicleOrders = vehicleOrders.filter(o => o.contractId === contract.id)
      return contract
    })
    const freshAwards: FreshAward[] = (faRes.data ?? []).map(r => dbToFreshAward(r as Record<string, unknown>) as FreshAward)
    const pastPerformances: PastPerformance[] = (ppRes.data ?? []).map(r => dbToPP(r as Record<string, unknown>) as PastPerformance)
    const nonSubReports: NonSubmissionReport[] = (nonSubRes.data ?? []).map(r => dbToNonSubReport(r as Record<string, unknown>))
    const deletionRequests: DeletionRequest[] = (deletionRes.data ?? []).map(r => dbToDeletionRequest(r as Record<string, unknown>))
    const bdSubmissions: BDSubmission[] = (bdRes.data ?? []).map(r => dbToBDSubmission(r as Record<string, unknown>))

    return {
      users,
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
    let { error } = await supabase.from('opportunities').upsert(oppToDb(o))
    if (error && String(error.message ?? '').includes('sam_gov_contacts')) {
      const retry = await supabase.from('opportunities').upsert(oppToDb(o, { includeSamGovContacts: false }))
      error = retry.error
    }
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
    let { error } = await supabase.from('subcontractors').upsert(subcontractorToDb(sub))
    if (error && String(error.message ?? '').includes('contacts')) {
      const retry = await supabase.from('subcontractors').upsert(subcontractorToDb(sub, { includeContacts: false }))
      error = retry.error
    }
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
    let payload: Record<string, unknown> = contractToDb(c) as Record<string, unknown>
    const stripped: string[] = []
    // Up to 4 retries — strip any column the schema cache doesn't know about and try again.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from('contracts').upsert(payload)
      if (!error) {
        if (stripped.length) {
          console.warn(`[db] contracts row saved without missing column(s): ${stripped.join(', ')}. Run the matching SQL migration in Supabase to enable remote persistence.`)
        }
        return true
      }
      // PGRST204 = "Could not find the 'X' column of 'contracts' in the schema cache"
      const message = `${error.message ?? ''} ${error.details ?? ''}`
      const missing = error.code === 'PGRST204' ? message.match(/'([a-z0-9_]+)'/i)?.[1] : null
      if (missing && missing in payload) {
        const { [missing]: _drop, ...rest } = payload
        void _drop
        payload = rest
        stripped.push(missing)
        continue
      }
      console.error('[db] upsertContract error', error)
      return false
    }
    console.error('[db] upsertContract aborted after stripping too many unknown columns', stripped)
    return false
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

export async function upsertContractInvoice(invoice: ContractInvoice): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    let payload: Record<string, unknown> = invoiceToDb(invoice)
    const stripped: string[] = []
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from('contract_invoices').upsert(payload)
      if (!error) {
        if (stripped.length) {
          console.warn(`[db] contract invoice saved without missing column(s): ${stripped.join(', ')}. Run the matching SQL migration in Supabase to enable full invoice persistence.`)
        }
        return
      }
      const message = `${error.message ?? ''} ${error.details ?? ''}`
      const missing = error.code === 'PGRST204' ? message.match(/'([a-z0-9_]+)'/i)?.[1] : null
      if (missing && missing in payload) {
        const { [missing]: _drop, ...rest } = payload
        void _drop
        payload = rest
        stripped.push(missing)
        continue
      }
      console.error('[db] upsertContractInvoice error', error)
      return
    }
    console.error('[db] upsertContractInvoice aborted after stripping too many unknown columns', stripped)
  } catch (err) {
    console.error('[db] upsertContractInvoice failed', err)
  }
}

export async function deleteContractInvoice(id: string): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('contract_invoices').delete().eq('id', id)
    if (error) console.error('[db] deleteContractInvoice error', error)
  } catch (err) {
    console.error('[db] deleteContractInvoice failed', err)
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

export async function deleteGovernmentWarningRecord(id: string): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('government_warnings').delete().eq('id', id)
    if (error) console.error('[db] deleteGovernmentWarning error', error)
  } catch (err) {
    console.error('[db] deleteGovernmentWarning failed', err)
  }
}

export async function upsertContractLineItem(line: ContractLineItem): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('contract_line_items').upsert(lineItemToDb(line))
    if (error) console.error('[db] upsertContractLineItem error', error)
  } catch (err) {
    console.error('[db] upsertContractLineItem failed', err)
  }
}

export async function deleteContractLineItemRecord(id: string): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('contract_line_items').delete().eq('id', id)
    if (error) console.error('[db] deleteContractLineItem error', error)
  } catch (err) {
    console.error('[db] deleteContractLineItem failed', err)
  }
}

export async function upsertContractVehicleOrder(order: ContractVehicleOrder): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('contract_vehicle_orders').upsert(vehicleOrderToDb(order))
    if (error) console.error('[db] upsertContractVehicleOrder error', error)
  } catch (err) {
    console.error('[db] upsertContractVehicleOrder failed', err)
  }
}

export async function deleteContractVehicleOrderRecord(id: string): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('contract_vehicle_orders').delete().eq('id', id)
    if (error) console.error('[db] deleteContractVehicleOrder error', error)
  } catch (err) {
    console.error('[db] deleteContractVehicleOrder failed', err)
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

export async function deleteBDSubmissionRecord(id: number): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    const { error } = await supabase.from('bd_submissions').delete().eq('id', id)
    if (error) console.error('[db] deleteBDSubmissionRecord error', error)
  } catch (err) {
    console.error('[db] deleteBDSubmissionRecord failed', err)
  }
}

export async function clearBusinessData(): Promise<void> {
  if (!isSupabaseConnected || !supabase) return
  try {
    for (const table of [
      'contract_pocs',
      'contract_invoices',
      'locked_subcontractors',
      'government_warnings',
      'contract_line_items',
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

export async function bulkDeleteFromTable(
  table: string,
  filter?: { column: string; value: string | number | boolean },
): Promise<boolean> {
  if (!isSupabaseConnected || !supabase) return true
  try {
    let query = supabase.from(table).delete()
    query = filter ? query.eq(filter.column, filter.value) : query.not('id', 'is', null)
    const { error } = await query
    if (error) {
      console.error(`[db] bulkDeleteFromTable ${table} error`, error)
      return false
    }
    return true
  } catch (err) {
    console.error(`[db] bulkDeleteFromTable ${table} failed`, err)
    return false
  }
}

export const REMOTE_COUNT_TABLES = [
  'users',
  'opportunities',
  'contracts',
  'fresh_awards',
  'past_performances',
  'subcontractors',
  'subk_database',
  'bd_submissions',
  'non_submission_reports',
  'deletion_requests',
  'notifications',
  'activity_logs',
] as const

export type RemoteCountTable = typeof REMOTE_COUNT_TABLES[number]

// Fetch row counts for the main business tables. Returns null per-table when
// the count call errors (auth, RLS, table missing) so the caller can render a
// neutral "—" instead of crashing the whole health card.
export async function fetchRemoteRowCounts(): Promise<Record<RemoteCountTable, number | null>> {
  const out = {} as Record<RemoteCountTable, number | null>
  for (const table of REMOTE_COUNT_TABLES) out[table] = null
  if (!isSupabaseConnected || !supabase) return out
  await Promise.all(REMOTE_COUNT_TABLES.map(async table => {
    try {
      const { count, error } = await supabase!.from(table).select('*', { count: 'exact', head: true })
      if (error) {
        console.error(`[db] fetchRemoteRowCounts ${table} error`, error)
        out[table] = null
        return
      }
      out[table] = count ?? 0
    } catch (err) {
      console.error(`[db] fetchRemoteRowCounts ${table} failed`, err)
      out[table] = null
    }
  }))
  return out
}

// ── Permission overrides ─────────────────────────────────────────────────────
//
// Backed by tables created in migration 019_permission_overrides.sql. If that
// migration hasn't been applied, fetch/save calls fail with a "relation does
// not exist" error — we detect that specifically and signal the caller to
// drop into local-only mode without surfacing a scary toast.

export type RolePermissionsMap  = Partial<Record<Role, Permission[]>>
export type UserPermissionGrant = Record<string, Permission[]>

export interface PermissionOverridesPayload {
  roles:   RolePermissionsMap
  grants:  UserPermissionGrant
  revokes: UserPermissionGrant
}

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  if (e.code === '42P01') return true
  if (typeof e.message === 'string' && /relation .* does not exist/i.test(e.message)) return true
  return false
}

export interface PermissionOverridesResult {
  ok: boolean
  missingTable: boolean
  payload?: PermissionOverridesPayload
}

export async function fetchPermissionOverrides(): Promise<PermissionOverridesResult> {
  if (!isSupabaseConnected || !supabase) {
    return { ok: false, missingTable: false }
  }
  try {
    const [rolesRes, usersRes] = await Promise.all([
      supabase.from('role_permission_overrides').select('role, permissions'),
      supabase.from('user_permission_overrides').select('user_id, grants, revokes'),
    ])
    if (rolesRes.error && isMissingTableError(rolesRes.error)) {
      return { ok: false, missingTable: true }
    }
    if (usersRes.error && isMissingTableError(usersRes.error)) {
      return { ok: false, missingTable: true }
    }
    if (rolesRes.error) {
      console.error('[db] fetchPermissionOverrides roles error', rolesRes.error)
      return { ok: false, missingTable: false }
    }
    if (usersRes.error) {
      console.error('[db] fetchPermissionOverrides users error', usersRes.error)
      return { ok: false, missingTable: false }
    }
    const roles: RolePermissionsMap = {}
    for (const row of rolesRes.data ?? []) {
      const r = row as { role: Role; permissions: unknown }
      if (Array.isArray(r.permissions)) roles[r.role] = r.permissions as Permission[]
    }
    const grants:  UserPermissionGrant = {}
    const revokes: UserPermissionGrant = {}
    for (const row of usersRes.data ?? []) {
      const r = row as { user_id: string; grants: unknown; revokes: unknown }
      if (Array.isArray(r.grants)  && r.grants.length  > 0) grants[r.user_id]  = r.grants  as Permission[]
      if (Array.isArray(r.revokes) && r.revokes.length > 0) revokes[r.user_id] = r.revokes as Permission[]
    }
    return { ok: true, missingTable: false, payload: { roles, grants, revokes } }
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, missingTable: true }
    console.error('[db] fetchPermissionOverrides failed', err)
    return { ok: false, missingTable: false }
  }
}

export async function saveRolePermissionOverride(role: Role, permissions: Permission[] | null): Promise<PermissionOverridesResult> {
  if (!isSupabaseConnected || !supabase) return { ok: false, missingTable: false }
  try {
    if (permissions == null) {
      const { error } = await supabase.from('role_permission_overrides').delete().eq('role', role)
      if (error) {
        if (isMissingTableError(error)) return { ok: false, missingTable: true }
        console.error('[db] saveRolePermissionOverride delete error', error)
        return { ok: false, missingTable: false }
      }
      return { ok: true, missingTable: false }
    }
    const { error } = await supabase
      .from('role_permission_overrides')
      .upsert({ role, permissions, updated_at: new Date().toISOString() }, { onConflict: 'role' })
    if (error) {
      if (isMissingTableError(error)) return { ok: false, missingTable: true }
      console.error('[db] saveRolePermissionOverride upsert error', error)
      return { ok: false, missingTable: false }
    }
    return { ok: true, missingTable: false }
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, missingTable: true }
    console.error('[db] saveRolePermissionOverride failed', err)
    return { ok: false, missingTable: false }
  }
}

export async function saveUserPermissionOverride(
  userId: string,
  grants: Permission[],
  revokes: Permission[],
): Promise<PermissionOverridesResult> {
  if (!isSupabaseConnected || !supabase) return { ok: false, missingTable: false }
  try {
    if (grants.length === 0 && revokes.length === 0) {
      const { error } = await supabase.from('user_permission_overrides').delete().eq('user_id', userId)
      if (error) {
        if (isMissingTableError(error)) return { ok: false, missingTable: true }
        console.error('[db] saveUserPermissionOverride delete error', error)
        return { ok: false, missingTable: false }
      }
      return { ok: true, missingTable: false }
    }
    const { error } = await supabase
      .from('user_permission_overrides')
      .upsert(
        { user_id: userId, grants, revokes, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    if (error) {
      if (isMissingTableError(error)) return { ok: false, missingTable: true }
      console.error('[db] saveUserPermissionOverride upsert error', error)
      return { ok: false, missingTable: false }
    }
    return { ok: true, missingTable: false }
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, missingTable: true }
    console.error('[db] saveUserPermissionOverride failed', err)
    return { ok: false, missingTable: false }
  }
}

export async function clearAllPermissionOverrides(): Promise<PermissionOverridesResult> {
  if (!isSupabaseConnected || !supabase) return { ok: false, missingTable: false }
  try {
    const [r1, r2] = await Promise.all([
      supabase.from('role_permission_overrides').delete().neq('role', '__never__'),
      supabase.from('user_permission_overrides').delete().neq('user_id', '__never__'),
    ])
    if (r1.error && isMissingTableError(r1.error)) return { ok: false, missingTable: true }
    if (r2.error && isMissingTableError(r2.error)) return { ok: false, missingTable: true }
    if (r1.error) { console.error('[db] clearAllPermissionOverrides r1', r1.error); return { ok: false, missingTable: false } }
    if (r2.error) { console.error('[db] clearAllPermissionOverrides r2', r2.error); return { ok: false, missingTable: false } }
    return { ok: true, missingTable: false }
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, missingTable: true }
    console.error('[db] clearAllPermissionOverrides failed', err)
    return { ok: false, missingTable: false }
  }
}

// ── Seed if empty ────────────────────────────────────────────────────────────

export async function seedEmployeesIfEmpty(employees: Employee[]): Promise<boolean> {
  if (!isSupabaseConnected || !supabase || employees.length === 0) return true

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('employees')
      .select('id, email')
    if (fetchError) {
      console.error('[db] seedEmployeesIfEmpty fetch existing error', fetchError)
      return false
    }
    const identities = (existing ?? [])
      .map(row => ({
        id: String((row as Record<string, unknown>).id ?? ''),
        email: String((row as Record<string, unknown>).email ?? ''),
      }))
      .filter(row => row.id && row.email)
    const existingByEmail = existingEmployeesByExactEmail(identities)
    const rows = employeeRowsForSync(employees)

    const synced = await upsertBatched('employees', rows)
    if (synced) {
      console.log('[db] Synced employee hierarchy in Supabase.')
      return true
    }

    // If the batch hit a stale unique-email conflict, repair only the exact
    // conflicting legacy row and retry row-by-row so assigned_to FK targets
    // are present before opportunities/contracts are saved.
    let allSynced = true
    for (const row of rows) {
      const ok = await upsertEmployeeRowForSync(row, existingByEmail)
      if (!ok) allSynced = false
    }
    if (allSynced) console.log('[db] Synced employee hierarchy in Supabase.')
    return allSynced
  } catch (err) {
    console.error('[db] seedEmployeesIfEmpty failed', err)
    return false
  }
}

export async function upsertUser(user: User): Promise<boolean> {
  if (!isSupabaseConnected || !supabase) return false
  try {
    const { error } = await supabase.from('users').upsert(userToDb(user), { onConflict: 'id' })
    if (error) {
      console.error('[db] upsertUser error', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[db] upsertUser threw', err)
    return false
  }
}

export async function deleteUserRecord(id: string): Promise<boolean> {
  if (!isSupabaseConnected || !supabase) return false
  try {
    const { error } = await supabase.from('users').delete().eq('id', id)
    if (error) {
      console.error('[db] deleteUser error', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[db] deleteUser threw', err)
    return false
  }
}

export async function seedUsersIfEmpty(users: User[]): Promise<boolean> {
  if (!isSupabaseConnected || !supabase || users.length === 0) return true
  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
    if (error) {
      console.error('[db] seedUsersIfEmpty count error', error)
      return false
    }
    if ((count ?? 0) > 0) return true
    const synced = await upsertBatched('users', userRowsForSync(users))
    if (synced) console.log('[db] Seeded users in Supabase.')
    return synced
  } catch (err) {
    console.error('[db] seedUsersIfEmpty failed', err)
    return false
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

async function upsertBatched(
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 20,
): Promise<boolean> {
  if (!supabase) return false
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' }).select()
    if (error) {
      console.error(`[db] upsert batch into ${table} error`, error)
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
      mockData.opportunities.map(opp => oppToDb(opp)),
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
