/**
 * Contract Workflow Tests
 * Covers the full end-to-end state machine for contract opportunities.
 *
 * Workflow under test:
 *   contract_opp (ACTIVE|NEW_ASSIGNMENT|DISCUSSION)
 *     → submitOpportunity  → SUBMITTED   (leaves pipeline view)
 *     → markOpportunityWon → WON + FreshAward created
 *     → submitNonSubReport → reviewNonSubReport(APPROVED)  → NOT_SUBMITTED
 *     → submitNonSubReport → reviewNonSubReport(DECLINED)  → DROPPED
 *
 *   FreshAward → moveFreshAwardToActive → Contract (KICK_OFF)
 *   Contract   → advanceContractStatus  → LOCKING_SUB → PERFORMING
 *                                         → PENDING_PAYMENT → ARCHIVED + PastPerformance
 *   Contract   → terminateContract      → TERMINATED + PastPerformance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock DB + API server so no network calls happen ─────────────────────
vi.mock('../lib/db', () => ({
  loadAllData: vi.fn().mockResolvedValue(null),
  seedIfEmpty: vi.fn().mockResolvedValue(null),
  seedEmployeesIfEmpty: vi.fn().mockResolvedValue(true),
  clearBusinessData: vi.fn().mockResolvedValue(null),
  findActiveOpportunityDuplicate: vi.fn().mockResolvedValue({ ok: true, duplicate: false }),
  upsertOpportunity: vi.fn().mockResolvedValue(true),
  syncOpportunityComments: vi.fn().mockResolvedValue(true),
  deleteOpportunityRecord: vi.fn().mockResolvedValue(true),
  upsertSubcontractor: vi.fn().mockResolvedValue(null),
  deleteSubcontractorRecord: vi.fn().mockResolvedValue(null),
  upsertContract: vi.fn().mockResolvedValue(null),
  upsertContractPoC: vi.fn().mockResolvedValue(null),
  deleteContractPoC: vi.fn().mockResolvedValue(null),
  upsertLockedSubcontractor: vi.fn().mockResolvedValue(null),
  upsertGovernmentWarning: vi.fn().mockResolvedValue(null),
  deleteGovernmentWarningRecord: vi.fn().mockResolvedValue(null),
  upsertContractVehicleOrder: vi.fn().mockResolvedValue(null),
  deleteContractVehicleOrderRecord: vi.fn().mockResolvedValue(null),
  upsertFreshAward: vi.fn().mockResolvedValue(null),
  deleteFreshAwardRecord: vi.fn().mockResolvedValue(null),
  upsertPastPerformance: vi.fn().mockResolvedValue(null),
  upsertNonSubReport: vi.fn().mockResolvedValue(null),
  upsertDeletionRequest: vi.fn().mockResolvedValue(null),
  upsertBDSubmission: vi.fn().mockResolvedValue(true),
  deleteBDSubmissionRecord: vi.fn().mockResolvedValue(null),
}))

vi.mock('../lib/api', () => ({
  isApiConnected: false,
  api: null,
}))

vi.mock('../lib/opportunityWorkflow', () => ({
  deleteOpportunityWorkflow: vi.fn(),
  submitOpportunityWorkflow: vi.fn(),
  transitionOpportunityWorkflow: vi.fn(),
  editOpportunityWorkflow: vi.fn(),
  returnOpportunityToPipelineWorkflow: vi.fn(),
}))

import { useStore } from '../store/useStore'
import {
  deleteContractVehicleOrderRecord,
  deleteOpportunityRecord,
  findActiveOpportunityDuplicate,
  upsertBDSubmission,
  upsertContractVehicleOrder,
  upsertOpportunity,
  syncOpportunityComments,
} from '../lib/db'
import {
  deleteOpportunityWorkflow,
  editOpportunityWorkflow,
  returnOpportunityToPipelineWorkflow,
  submitOpportunityWorkflow,
  transitionOpportunityWorkflow,
} from '../lib/opportunityWorkflow'
import type { Opportunity, Contract, OppStatus, ContractStatus, Employee, FileAttachment, BDSubmission } from '../types'

// ── Pipeline view filter (mirrors PipelinePage) ───────────────────────
const OPP_VIEW_STATUSES: OppStatus[] = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION']

// ── Fixtures ──────────────────────────────────────────────────────────
function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: `opp-${Math.random().toString(36).slice(2)}`,
    solicitation: 'HVAC Maintenance Service',
    solicitationId: 'FA4890-26-R-0001',
    client: 'Andrews Air Force Base',
    type: 'OTJ',
    naicsCode: '238220',
    setAside: 'SB',
    priority: 'MEDIUM',
    status: 'ACTIVE',
    dueDate: '2026-12-31',
    localTime: '16:00',
    timezone: 'EST',
    location: 'Camp Springs, MD',
    pop: '1 base year + 4 option years',
    bdm: 'alice',
    bds: 'bob',
    comments: [],
    proposals: [],
    period: 'DEC 2026',
    capturedOn: 'December 1, 2026',
    ...overrides,
  }
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    contractId: 'CONTRACT-TEST-001',
    title: 'HVAC Maintenance Service',
    type: 'OTJ',
    naicsCode: '238220',
    status: 'KICK_OFF',
    location: 'Camp Springs, MD',
    popStart: '2026-06-01',
    popEnd: '2027-05-31',
    value: 500_000,
    spm: 'carol',
    pm: 'dave',
    ...overrides,
  }
}

// ── Reset store data before every test ───────────────────────────────
const CAPTURE_MANAGER_USER = {
  id: 'u-capture-manager', name: 'Capture Manager', email: 'capture@ces.com',
  username: 'capture', role: 'CAPTURE_MANAGER' as const, avatar: 'CM',
  status: 'active' as const, firstLogin: false,
  createdAt: '2026-01-01',
}

const ASSOCIATE_USER = {
  id: 'user-associate', name: 'Test Associate', email: 'associate@ces.com',
  username: 'associate', role: 'ASSOCIATE' as const, avatar: 'TA',
  status: 'active' as const, firstLogin: false,
  createdAt: '2026-01-01',
}

const TEST_EMPLOYEES: Employee[] = [
  { id: 'emp-manager', name: 'Test Manager', email: 'manager@ces.com', role: 'BD_MANAGER', managerId: null, avatar: 'TM' },
  { id: 'emp-lead', name: 'Test Team Lead', email: 'lead@ces.com', role: 'TEAM_LEAD', managerId: 'emp-manager', avatar: 'TL' },
  { id: 'emp-associate', name: 'Test Associate', email: 'associate@ces.com', role: 'ASSOCIATE', managerId: 'emp-lead', avatar: 'TA' },
]

function trackerFor(
  opp: Opportunity,
  status: BDSubmission['status'],
  existing?: BDSubmission,
  comment?: string,
): BDSubmission {
  return {
    id: existing?.id ?? 42,
    opportunityId: opp.id,
    submittedOn: existing?.submittedOn ?? '2026-07-21',
    solicitationId: opp.solicitationId,
    setAside: opp.setAside,
    type: opp.type,
    solicitation: opp.solicitation,
    status,
    dueDate: opp.dueDate,
    localTime: `${opp.localTime ?? ''}${opp.timezone ? ` ${opp.timezone}` : ''}`.trim(),
    location: opp.location,
    bdm: opp.assignedTo === 'emp-associate' ? 'Test Manager' : opp.bdm,
    bds: opp.assignedTo === 'emp-associate' ? 'Test Team Lead' : opp.bds,
    supportAgent: opp.assignedTo === 'emp-associate' ? 'Test Associate' : opp.supportAgent,
    value: opp.contractAmount ?? opp.value ?? opp.baseAmount ?? 0,
    comment: comment ?? existing?.comment,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findActiveOpportunityDuplicate).mockResolvedValue({ ok: true, duplicate: false })
  vi.mocked(upsertOpportunity).mockResolvedValue(true)
  vi.mocked(syncOpportunityComments).mockResolvedValue(true)
  vi.mocked(upsertBDSubmission).mockResolvedValue(true)
  useStore.setState({
    opportunities: [],
    freshAwards: [],
    nonSubReports: [],
    contracts: [],
    bdSubmissions: [],
    pastPerformances: [],
    deletionRequests: [],
    notifications: [],
    activityLogs: [],
    currentUser: CAPTURE_MANAGER_USER,
    isAuthenticated: true,
    loginTimestamp: Date.now(),
    employees: TEST_EMPLOYEES,
    nonSubGraceHours: 0,
    nonSubGraceMinutes: 5,
  })
  vi.mocked(submitOpportunityWorkflow).mockImplementation(async (id, _expected, values) => {
    const opp = useStore.getState().opportunities.find(row => row.id === id)
    if (!opp) return null
    const committed = {
      ...opp,
      ...values,
      status: 'SUBMITTED' as const,
      submittedAt: '2026-07-21T16:00:00.000Z',
      nonSubmissionReportId: undefined,
    }
    const existing = useStore.getState().bdSubmissions.find(row => row.solicitationId === opp.solicitationId)
    return { opportunity: committed, submission: trackerFor(committed, 'SUBMITTED', existing) }
  })
  vi.mocked(transitionOpportunityWorkflow).mockImplementation(async input => {
    const state = useStore.getState()
    const current = input.submissionId
      ? state.bdSubmissions.find(row => row.id === input.submissionId)
      : state.bdSubmissions.find(row => row.opportunityId === input.opportunityId)
        ?? state.bdSubmissions.find(row => state.opportunities.some(opp =>
          opp.id === input.opportunityId && opp.solicitationId === row.solicitationId))
    const opp = input.opportunityId
      ? state.opportunities.find(row => row.id === input.opportunityId)
      : state.opportunities.find(row => row.id === current?.opportunityId)
        ?? state.opportunities.find(row => row.solicitationId === current?.solicitationId)
    if (!opp && !current) return null
    const generatedComment = ['canceled', 'cancelled', 'canceled from contract opportunities', 'cancelled from contract opportunities']
      .includes((current?.comment ?? '').trim().toLowerCase())
    const comment = input.comment !== undefined
      ? input.comment ?? undefined
      : current?.status === 'CANCELED' && input.status !== 'CANCELED' && generatedComment
        ? undefined
        : current?.comment
    const committedOpp = opp ? {
      ...opp,
      status: (input.status === 'DISCUSSING' ? 'DISCUSSION' : input.status === 'AWARDED' ? 'WON' : input.status) as Opportunity['status'],
      ...(input.status === 'CANCELED' ? {} : { submittedAt: opp.submittedAt ?? '2026-07-21T16:00:00.000Z' }),
      ...(!input.nonSubmissionReportId
        && state.nonSubReports.some(report =>
          report.id === opp.nonSubmissionReportId && report.status === 'PENDING')
        ? { nonSubmissionReportId: undefined }
        : {}),
    } : null
    const submission = current
      ? { ...current, status: input.status, comment }
      : trackerFor(committedOpp as Opportunity, input.status, undefined, comment)
    return { opportunity: committedOpp, submission }
  })
  vi.mocked(editOpportunityWorkflow).mockImplementation(async input => {
    const state = useStore.getState()
    const current = input.submissionId
      ? state.bdSubmissions.find(row => row.id === input.submissionId)
      : state.bdSubmissions.find(row => row.opportunityId === input.opportunityId)
        ?? state.bdSubmissions.find(row => state.opportunities.some(opp =>
          opp.id === input.opportunityId && opp.solicitationId === row.solicitationId))
    if (!current) return null
    const opp = input.opportunityId ? state.opportunities.find(row => row.id === input.opportunityId) : undefined
    const { assignedTo, ...opportunityValues } = input.opportunityValues ?? {}
    return {
      opportunity: opp ? {
        ...opp,
        ...opportunityValues,
        ...(input.opportunityValues && Object.prototype.hasOwnProperty.call(input.opportunityValues, 'assignedTo')
          ? { assignedTo: assignedTo ?? undefined }
          : {}),
      } : null,
      submission: { ...current, ...input.values },
    }
  })
  vi.mocked(deleteOpportunityWorkflow).mockImplementation(async input => {
    const state = useStore.getState()
    const submission = state.bdSubmissions.find(row => row.id === input.submissionId)
    if (!submission) return null
    const opportunity = state.opportunities.find(row => row.id === submission.opportunityId)
      ?? state.opportunities.find(row => row.solicitationId === submission.solicitationId)
      ?? null
    return { opportunity, submission }
  })
  vi.mocked(returnOpportunityToPipelineWorkflow).mockImplementation(async input => {
    const state = useStore.getState()
    const submission = state.bdSubmissions.find(row => row.id === input.submissionId)
    if (!submission) return null
    const opportunity = state.opportunities.find(row => row.id === submission.opportunityId)
      ?? state.opportunities.find(row => row.solicitationId === submission.solicitationId)
    if (!opportunity) return null
    return {
      opportunity: {
        ...opportunity,
        status: 'ACTIVE',
        submittedAt: undefined,
        nonSubmissionReportId: undefined,
        ...(input.nonSubmissionExempt !== undefined
          ? { nonSubmissionExempt: input.nonSubmissionExempt }
          : {}),
      },
      submission,
    }
  })
})

describe('associate comments and quoted workflow', () => {
  it('lets an associate mark their opportunity as quoted and alerts the Capture Manager once', async () => {
    const opp = makeOpp({ id: 'opp-quoted', assignedTo: 'emp-associate', quoted: false })
    useStore.setState({
      opportunities: [opp],
      currentUser: ASSOCIATE_USER,
      users: [CAPTURE_MANAGER_USER, ASSOCIATE_USER],
    })

    const saved = await useStore.getState().updateOpportunity(opp.id, { quoted: true })

    expect(saved).toBe(true)
    expect(useStore.getState().opportunities[0].quoted).toBe(true)
    expect(useStore.getState().notifications.filter(item => item.title === 'Opportunity quoted')).toHaveLength(1)
    expect(useStore.getState().notifications[0]).toMatchObject({
      relatedId: opp.id,
      targetRole: 'CAPTURE_MANAGER',
    })
    expect(syncOpportunityComments).not.toHaveBeenCalled()
  })

  it('notifies the Capture Manager when an associate comments on an opportunity', async () => {
    const opp = makeOpp({ id: 'opp-comment', assignedTo: 'emp-associate' })
    useStore.setState({
      opportunities: [opp],
      currentUser: ASSOCIATE_USER,
      users: [CAPTURE_MANAGER_USER, ASSOCIATE_USER],
    })

    const comment = {
      id: 'comment-1',
      text: 'Proposal review completed.',
      author: ASSOCIATE_USER.name,
      authorId: ASSOCIATE_USER.id,
      createdAt: '2026-07-17T10:00:00.000Z',
    }
    const saved = await useStore.getState().updateOpportunity(opp.id, { comments: [comment] })

    expect(saved).toBe(true)
    expect(useStore.getState().notifications).toContainEqual(expect.objectContaining({
      title: 'New opportunity comment',
      relatedId: opp.id,
      targetRole: 'CAPTURE_MANAGER',
    }))
    expect(useStore.getState().activityLogs).toContainEqual(expect.objectContaining({
      entityId: opp.id,
      userRole: 'ASSOCIATE',
    }))
    expect(syncOpportunityComments).toHaveBeenCalledWith(opp.id, [], [comment])
  })

  it('automatically marks an opportunity quoted when sourcing receives a quote attachment', async () => {
    const opp = makeOpp({ id: 'opp-auto-quoted', assignedTo: 'emp-associate', quoted: false })
    const quote: FileAttachment = {
      id: 'quote-1',
      name: 'supplier-quote.pdf',
      attachedAt: '2026-07-17T10:00:00.000Z',
      uploadedBy: ASSOCIATE_USER.name,
      storagePath: 'quotes/supplier-quote.pdf',
    }
    useStore.setState({
      opportunities: [opp],
      currentUser: ASSOCIATE_USER,
      users: [CAPTURE_MANAGER_USER, ASSOCIATE_USER],
    })

    await useStore.getState().addSubcontractor({
      opportunityId: opp.id,
      companyName: 'Supplier Company',
      contactName: 'Supplier Contact',
      email: 'supplier@example.test',
      phone: '',
      naicsCode: '',
      setAside: '',
      notes: '',
      quoteFiles: [quote],
      createdBy: ASSOCIATE_USER.name,
    })

    await vi.waitFor(() => {
      expect(useStore.getState().opportunities[0].quoted).toBe(true)
      expect(useStore.getState().notifications.filter(item => item.title === 'Opportunity quoted')).toHaveLength(1)
    })
  })
})

describe('createOpportunity duplicate guard', () => {
  it('blocks creating a second active opportunity with the same solicitation ID', async () => {
    const existing = makeOpp({ id: 'existing-opp', solicitationId: 'FA4890-26-R-0001', isDeleted: false })
    useStore.setState({ opportunities: [existing] })

    const saved = await useStore.getState().createOpportunity(makeOpp({
      id: 'new-opp',
      solicitationId: ' fa4890-26-r-0001 ',
      solicitation: 'Duplicate HVAC Maintenance Service',
    }))

    expect(saved).toBe(false)
    expect(upsertOpportunity).not.toHaveBeenCalled()
  })

  it('allows recreating a solicitation ID when the existing opportunity was admin deleted', async () => {
    const deleted = makeOpp({ id: 'deleted-opp', solicitationId: 'FA4890-26-R-0001', isDeleted: true })
    useStore.setState({ opportunities: [deleted] })

    const saved = await useStore.getState().createOpportunity(makeOpp({
      id: 'new-opp',
      solicitationId: 'FA4890-26-R-0001',
    }))

    expect(saved).toBe(true)
    expect(upsertOpportunity).toHaveBeenCalledOnce()
    expect(useStore.getState().opportunities.filter(o => !o.isDeleted && o.solicitationId === 'FA4890-26-R-0001')).toHaveLength(1)
  })

  it('blocks creation when API server already has an active solicitation ID', async () => {
    vi.mocked(findActiveOpportunityDuplicate).mockResolvedValueOnce({ ok: true, duplicate: true, opportunityId: 'remote-opp' })

    const saved = await useStore.getState().createOpportunity(makeOpp({
      id: 'new-opp',
      solicitationId: 'W912-REMOTE-DUP',
    }))

    expect(saved).toBe(false)
    expect(upsertOpportunity).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('1 · submitOpportunity', () => {
  it('sets status → SUBMITTED', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'ACTIVE' })
    useStore.setState({ opportunities: [opp] })

    await useStore.getState().submitOpportunity('opp1')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.status).toBe('SUBMITTED')
  })

  it('records submittedAt timestamp', async () => {
    const opp = makeOpp({ id: 'opp1' })
    useStore.setState({ opportunities: [opp] })

    await useStore.getState().submitOpportunity('opp1')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.submittedAt).toBeTruthy()
    expect(new Date(updated!.submittedAt!).getTime()).toBeGreaterThan(0)
  })

  it('stores OTJ contract amount when provided', async () => {
    const opp = makeOpp({ id: 'opp1', type: 'OTJ' })
    useStore.setState({ opportunities: [opp] })

    await useStore.getState().submitOpportunity('opp1', { contractAmount: 850_000 })

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.contractAmount).toBe(850_000)
  })

  it('stores RECURRING yearly + monthly values when provided', async () => {
    const opp = makeOpp({ id: 'opp1', type: 'RECURRING' })
    useStore.setState({ opportunities: [opp] })

    await useStore.getState().submitOpportunity('opp1', {
      baseAmount: 120_000,
      monthlyPayment: 10_000,
    })

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.baseAmount).toBe(120_000)
    expect(updated?.monthlyPayment).toBe(10_000)
  })

  it('stores submitted proposal file references', async () => {
    const opp = makeOpp({ id: 'opp1' })
    const attachment: FileAttachment = {
      id: 'proposal-file-1',
      name: 'technical-proposal.pdf',
      attachedAt: '2026-05-26T10:00:00.000Z',
      uploadedBy: 'abk',
      dataUrl: 'data:application/pdf;base64,AA==',
      mimeType: 'application/pdf',
      size: 1,
    }
    useStore.setState({ opportunities: [opp] })

    await useStore.getState().submitOpportunity('opp1', {
      proposals: ['technical-proposal.pdf'],
      assignedOpportunities: ['technical-proposal.pdf'],
      proposalAttachments: [attachment],
    })

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.proposals).toEqual(['technical-proposal.pdf'])
    expect(updated?.assignedOpportunities).toEqual(['technical-proposal.pdf'])
    expect(updated?.proposalAttachments).toEqual([attachment])
  })

  it('removes opp from pipeline view (SUBMITTED ∉ OPP_VIEW_STATUSES)', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'ACTIVE' })
    useStore.setState({ opportunities: [opp] })

    await useStore.getState().submitOpportunity('opp1')

    const pipeline = useStore.getState().opportunities
      .filter(o => !o.isDeleted && OPP_VIEW_STATUSES.includes(o.status as OppStatus))
    expect(pipeline.some(o => o.id === 'opp1')).toBe(false)
  })

  it('works from NEW_ASSIGNMENT status too', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'NEW_ASSIGNMENT' })
    useStore.setState({ opportunities: [opp] })

    await useStore.getState().submitOpportunity('opp1')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.status).toBe('SUBMITTED')
    expect(submitOpportunityWorkflow).toHaveBeenCalledTimes(1)
    expect(upsertOpportunity).not.toHaveBeenCalled()
    expect(upsertBDSubmission).not.toHaveBeenCalled()
  })

  it.each([
    ['PENDING', 0],
    ['APPROVED', 1],
  ] as const)('%s non-submission history has the correct lifecycle after a late submit', async (status, expectedCount) => {
    const opp = makeOpp({
      id: 'opp1',
      status: 'ACTIVE',
      nonSubmissionReportId: 'report-1',
    })
    useStore.setState({
      opportunities: [opp],
      nonSubReports: [{
        id: 'report-1',
        opportunityId: opp.id,
        agentUsername: 'associate',
        reason: 'Late proposal',
        status,
        submittedAt: '2026-07-21T12:00:00.000Z',
      }],
    })

    const saved = await useStore.getState().submitOpportunity(opp.id)

    expect(saved).toBe(true)
    expect(useStore.getState().opportunities[0]?.nonSubmissionReportId).toBeUndefined()
    expect(useStore.getState().nonSubReports).toHaveLength(expectedCount)
  })

  it('does not report or apply submission when the atomic workflow fails', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'ACTIVE' })
    useStore.setState({ opportunities: [opp], bdSubmissions: [] })
    vi.mocked(submitOpportunityWorkflow).mockResolvedValueOnce(null)

    const saved = await useStore.getState().submitOpportunity('opp1')

    expect(saved).toBe(false)
    expect(useStore.getState().opportunities[0]?.status).toBe('ACTIVE')
    expect(useStore.getState().bdSubmissions).toHaveLength(0)
    expect(submitOpportunityWorkflow).toHaveBeenCalledTimes(1)
    expect(upsertOpportunity).not.toHaveBeenCalled()
    expect(upsertBDSubmission).not.toHaveBeenCalled()
  })

  it('does not auto-submit pre-submission opportunities when the deadline is reached', () => {
    const opp = makeOpp({ id: 'opp-expired', status: 'ACTIVE', assignedTo: 'emp-associate', dueDate: '2000-01-01', localTime: '09:00 AM' })
    useStore.setState({ opportunities: [opp], nonSubReports: [], bdSubmissions: [] })

    useStore.getState().syncDueOpportunities()

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp-expired')
    expect(updated?.status).toBe('ACTIVE')
    expect(updated?.submittedAt).toBeFalsy()
    expect(useStore.getState().bdSubmissions).toHaveLength(0)
  })

  it('creates a pending non-submission report after the configured grace period', () => {
    const opp = makeOpp({ id: 'opp-expired', status: 'ACTIVE', assignedTo: 'emp-associate', dueDate: '2000-01-01', localTime: '09:00 AM' })
    useStore.setState({ opportunities: [opp], nonSubReports: [], bdSubmissions: [], nonSubGraceHours: 0, nonSubGraceMinutes: 5 })

    useStore.getState().syncDueOpportunities()

    const reports = useStore.getState().nonSubReports
    const updated = useStore.getState().opportunities.find(o => o.id === 'opp-expired')
    expect(reports).toHaveLength(1)
    expect(reports[0].status).toBe('PENDING')
    expect(reports[0].opportunityId).toBe('opp-expired')
    expect(updated?.nonSubmissionReportId).toBe(reports[0].id)
    expect(updated?.status).toBe('ACTIVE')
    expect(useStore.getState().bdSubmissions).toHaveLength(0)
  })

  it('does not let a tracker linked to one duplicate solicitation suppress the other opportunity', () => {
    const first = makeOpp({
      id: 'opp-duplicate-a', solicitationId: 'SOL-DUP', assignedTo: 'emp-associate',
      dueDate: '2000-01-01', localTime: '09:00 AM',
    })
    const second = makeOpp({
      id: 'opp-duplicate-b', solicitationId: ' sol-dup ', assignedTo: 'emp-associate',
      dueDate: '2000-01-01', localTime: '09:00 AM',
    })
    useStore.setState({
      opportunities: [first, second],
      nonSubReports: [],
      bdSubmissions: [trackerFor(second, 'DISCUSSING')],
    })

    useStore.getState().syncDueOpportunities()

    expect(useStore.getState().nonSubReports.map(report => report.opportunityId)).toEqual([first.id])
  })

  it('does not guess which duplicate opportunity owns an unlinked legacy tracker row', () => {
    const first = makeOpp({
      id: 'opp-legacy-a', solicitationId: 'SOL-LEGACY', assignedTo: 'emp-associate',
      dueDate: '2000-01-01', localTime: '09:00 AM',
    })
    const second = makeOpp({
      id: 'opp-legacy-b', solicitationId: 'sol-legacy', assignedTo: 'emp-associate',
      dueDate: '2000-01-01', localTime: '09:00 AM',
    })
    const legacy = { ...trackerFor(first, 'DISCUSSING'), opportunityId: undefined }
    useStore.setState({ opportunities: [first, second], nonSubReports: [], bdSubmissions: [legacy] })

    useStore.getState().syncDueOpportunities()

    expect(useStore.getState().nonSubReports.map(report => report.opportunityId).sort())
      .toEqual([first.id, second.id].sort())
  })

  it('does not create non-submission reports for manager-only assignments', () => {
    const opp = makeOpp({ id: 'opp-manager-only', status: 'NEW_ASSIGNMENT', assignedTo: 'emp-manager', dueDate: '2000-01-01', localTime: '09:00 AM' })
    useStore.setState({ opportunities: [opp], nonSubReports: [], bdSubmissions: [], nonSubGraceHours: 0, nonSubGraceMinutes: 5 })

    useStore.getState().syncDueOpportunities()

    expect(useStore.getState().nonSubReports).toHaveLength(0)
    expect(useStore.getState().bdSubmissions).toHaveLength(0)
  })

  it('uses the opportunity local due timezone before moving to non-submission reports', () => {
    vi.useFakeTimers()
    try {
      const opp = makeOpp({
        id: 'opp-local-deadline',
        status: 'ACTIVE',
        assignedTo: 'emp-associate',
        dueDate: '2026-05-22',
        localTime: '10:00 AM',
        timezone: 'UTC-05:00',
      })
      useStore.setState({ opportunities: [opp], nonSubReports: [], bdSubmissions: [] })

      vi.setSystemTime(new Date('2026-05-22T14:59:00Z'))
      useStore.getState().syncDueOpportunities()
      expect(useStore.getState().opportunities.find(o => o.id === opp.id)?.status).toBe('ACTIVE')
      expect(useStore.getState().nonSubReports).toHaveLength(0)

      vi.setSystemTime(new Date('2026-05-23T02:59:59Z'))
      useStore.getState().syncDueOpportunities()
      expect(useStore.getState().opportunities.find(o => o.id === opp.id)?.status).toBe('ACTIVE')
      expect(useStore.getState().nonSubReports).toHaveLength(0)

      vi.setSystemTime(new Date('2026-05-23T03:00:00Z'))
      useStore.getState().syncDueOpportunities()
      expect(useStore.getState().nonSubReports).toHaveLength(1)
      expect(useStore.getState().bdSubmissions).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not create non-submission reports for manually submitted opportunities', () => {
    const opp = makeOpp({ id: 'opp-manual', status: 'SUBMITTED', dueDate: '2000-01-01', localTime: '09:00 AM' })
    useStore.setState({
      opportunities: [opp],
      nonSubReports: [],
      bdSubmissions: [{
        id: 11,
        submittedOn: '2000-01-01',
        solicitationId: opp.solicitationId,
        setAside: opp.setAside,
        type: opp.type,
        solicitation: opp.solicitation,
        status: 'SUBMITTED',
        dueDate: opp.dueDate,
        localTime: opp.localTime,
        location: opp.location,
        bdm: opp.bdm,
        bds: opp.bds,
        value: 0,
      }],
    })

    useStore.getState().syncDueOpportunities()

    expect(useStore.getState().nonSubReports).toHaveLength(0)
  })

  it('lets admins update the non-submission grace period', () => {
    useStore.getState().updateNonSubGracePeriod(2, 30)

    expect(useStore.getState().nonSubGraceHours).toBe(2)
    expect(useStore.getState().nonSubGraceMinutes).toBe(30)
  })

  it('runs deadline expiry immediately after an opportunity due date edit', async () => {
    const opp = makeOpp({ id: 'opp-live-expiry', status: 'ACTIVE', assignedTo: 'emp-associate', dueDate: '2099-01-01', localTime: '9:00 AM', timezone: 'GMT+1' })
    useStore.setState({ opportunities: [opp], nonSubReports: [], bdSubmissions: [], nonSubGraceHours: 0, nonSubGraceMinutes: 5 })

    await useStore.getState().updateOpportunity('opp-live-expiry', {
      dueDate: '2000-01-01',
      localTime: '9:00 AM',
      timezone: 'GMT+1',
    })

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp-live-expiry')
    expect(updated?.status).toBe('ACTIVE')
    expect(useStore.getState().nonSubReports).toHaveLength(1)
    expect(useStore.getState().bdSubmissions).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('2 · markOpportunityWon', () => {
  it('sets status → WON', () => {
    const opp = makeOpp({ id: 'opp1', status: 'SUBMITTED' })
    useStore.setState({ opportunities: [opp], freshAwards: [] })

    useStore.getState().markOpportunityWon('opp1')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.status).toBe('WON')
  })

  it('creates exactly one FreshAward', () => {
    const opp = makeOpp({ id: 'opp1', status: 'SUBMITTED' })
    useStore.setState({ opportunities: [opp], freshAwards: [] })

    useStore.getState().markOpportunityWon('opp1')

    const awards = useStore.getState().freshAwards
    expect(awards).toHaveLength(1)
    expect(awards[0].opportunityId).toBe('opp1')
  })

  it('FreshAward starts as PENDING_ASSIGNMENT', () => {
    const opp = makeOpp({ id: 'opp1', status: 'SUBMITTED' })
    useStore.setState({ opportunities: [opp], freshAwards: [] })

    useStore.getState().markOpportunityWon('opp1')

    const award = useStore.getState().freshAwards[0]
    expect(award.status).toBe('PENDING_ASSIGNMENT')
  })

  it('copies solicitation, client, and contract amount to FreshAward', () => {
    const opp = makeOpp({ id: 'opp1', solicitation: 'Special HVAC', client: 'Pentagon', contractAmount: 1_200_000 })
    useStore.setState({ opportunities: [opp], freshAwards: [] })

    useStore.getState().markOpportunityWon('opp1')

    const award = useStore.getState().freshAwards[0]
    expect(award.solicitation).toBe('Special HVAC')
    expect(award.client).toBe('Pentagon')
    expect(award.contractAmount).toBe(1_200_000)
  })

  it('does NOT create a duplicate FreshAward on double-call', () => {
    const opp = makeOpp({ id: 'opp1', status: 'SUBMITTED' })
    useStore.setState({ opportunities: [opp], freshAwards: [] })

    useStore.getState().markOpportunityWon('opp1')
    useStore.getState().markOpportunityWon('opp1') // second call — must be a no-op for FreshAward

    const awardsForOpp = useStore.getState().freshAwards.filter(fa => fa.opportunityId === 'opp1')
    expect(awardsForOpp).toHaveLength(1)
  })

  it('still sets status → WON on second call even if FreshAward already exists', () => {
    const opp = makeOpp({ id: 'opp1', status: 'SUBMITTED' })
    useStore.setState({ opportunities: [opp], freshAwards: [] })

    useStore.getState().markOpportunityWon('opp1')
    // Manually revert status to SUBMITTED to simulate edge-case
    useStore.setState(s => ({
      opportunities: s.opportunities.map(o => o.id === 'opp1' ? { ...o, status: 'SUBMITTED' as OppStatus } : o)
    }))
    useStore.getState().markOpportunityWon('opp1')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.status).toBe('WON')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('3 · Non-Submission Report workflow', () => {
  it('submitNonSubReport creates a PENDING report', () => {
    const opp = makeOpp({ id: 'opp1' })
    useStore.setState({ opportunities: [opp], nonSubReports: [] })

    useStore.getState().submitNonSubReport({
      opportunityId: 'opp1',
      agentUsername: 'agent1',
      reason: 'Solicitation was cancelled before the submission deadline.',
    })

    const reports = useStore.getState().nonSubReports
    expect(reports).toHaveLength(1)
    expect(reports[0].status).toBe('PENDING')
    expect(reports[0].opportunityId).toBe('opp1')
  })

  it('APPROVED → opportunity status becomes NOT_SUBMITTED', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'ACTIVE' })
    useStore.setState({ opportunities: [opp], nonSubReports: [] })

    useStore.getState().submitNonSubReport({
      opportunityId: 'opp1', agentUsername: 'agent1',
      reason: 'Amendment arrived 2 hours before deadline — impossible to revise.',
    })
    const reportId = useStore.getState().nonSubReports[0].id
    await useStore.getState().reviewNonSubReport(reportId, 'APPROVED', 'Accepted', 'manager1')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.status).toBe('NOT_SUBMITTED')
  })

  it('APPROVED moves the matching BD tracker row to NOT_SUBMITTED', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'SUBMITTED' })
    useStore.setState({
      opportunities: [opp],
      nonSubReports: [],
      bdSubmissions: [{
        id: 21,
        submittedOn: '2026-05-01',
        solicitationId: opp.solicitationId,
        setAside: opp.setAside,
        type: opp.type,
        solicitation: opp.solicitation,
        status: 'SUBMITTED',
        dueDate: opp.dueDate,
        localTime: opp.localTime,
        location: opp.location,
        bdm: opp.bdm,
        bds: opp.bds,
        value: 0,
        comment: 'Deadline reached',
      }],
    })

    useStore.getState().submitNonSubReport({
      opportunityId: 'opp1',
      agentUsername: 'agent1',
      reason: 'No submission was recorded after the configured deadline window.',
    })
    const reportId = useStore.getState().nonSubReports[0].id
    await useStore.getState().reviewNonSubReport(reportId, 'APPROVED', 'Accepted', 'manager1')

    expect(useStore.getState().bdSubmissions.find(b => b.id === 21)?.status).toBe('NOT_SUBMITTED')
  })

  it('DECLINED → opportunity status becomes DROPPED', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'ACTIVE' })
    useStore.setState({ opportunities: [opp], nonSubReports: [] })

    useStore.getState().submitNonSubReport({
      opportunityId: 'opp1', agentUsername: 'agent1',
      reason: 'Team bandwidth issue — could have been resolved with overtime.',
    })
    const reportId = useStore.getState().nonSubReports[0].id
    await useStore.getState().reviewNonSubReport(reportId, 'DECLINED', 'Insufficient reason', 'manager1')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(updated?.status).toBe('DROPPED')
  })

  it('DECLINED moves the matching BD tracker row to DROPPED', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'SUBMITTED' })
    useStore.setState({
      opportunities: [opp],
      nonSubReports: [],
      bdSubmissions: [{
        id: 22,
        submittedOn: '2026-05-01',
        solicitationId: opp.solicitationId,
        setAside: opp.setAside,
        type: opp.type,
        solicitation: opp.solicitation,
        status: 'SUBMITTED',
        dueDate: opp.dueDate,
        localTime: opp.localTime,
        location: opp.location,
        bdm: opp.bdm,
        bds: opp.bds,
        value: 0,
        comment: 'Deadline reached',
      }],
    })

    useStore.getState().submitNonSubReport({
      opportunityId: 'opp1',
      agentUsername: 'agent1',
      reason: 'No submission was recorded after the configured deadline window.',
    })
    const reportId = useStore.getState().nonSubReports[0].id
    await useStore.getState().reviewNonSubReport(reportId, 'DECLINED', 'Not approved', 'manager1')

    expect(useStore.getState().bdSubmissions.find(b => b.id === 22)?.status).toBe('DROPPED')
  })

  it('review records the reviewer and note on the report', async () => {
    const opp = makeOpp({ id: 'opp1' })
    useStore.setState({ opportunities: [opp], nonSubReports: [] })

    useStore.getState().submitNonSubReport({ opportunityId: 'opp1', agentUsername: 'agent1', reason: 'No capacity in Q2.' })
    const reportId = useStore.getState().nonSubReports[0].id
    await useStore.getState().reviewNonSubReport(reportId, 'APPROVED', 'Capacity issue confirmed', 'director1')

    const report = useStore.getState().nonSubReports.find(r => r.id === reportId)
    expect(report?.status).toBe('APPROVED')
    expect(report?.reviewedBy).toBe('director1')
    expect(report?.reviewNote).toBe('Capacity issue confirmed')
    expect(report?.reviewedAt).toBeTruthy()
  })

  it('NOT_SUBMITTED and DROPPED opps are absent from pipeline view', async () => {
    const opp1 = makeOpp({ id: 'opp1', status: 'ACTIVE' })
    const opp2 = makeOpp({ id: 'opp2', status: 'ACTIVE' })
    useStore.setState({ opportunities: [opp1, opp2], nonSubReports: [] })

    // Submit and approve report for opp1 → NOT_SUBMITTED
    useStore.getState().submitNonSubReport({ opportunityId: 'opp1', agentUsername: 'agent1', reason: 'Cancelled solicitation RFP.' })
    await useStore.getState().reviewNonSubReport(useStore.getState().nonSubReports[0].id, 'APPROVED', '', 'mgr')

    // Submit and decline report for opp2 → DROPPED
    useStore.getState().submitNonSubReport({ opportunityId: 'opp2', agentUsername: 'agent1', reason: 'Resource shortage at deadline.' })
    await useStore.getState().reviewNonSubReport(useStore.getState().nonSubReports.find(r => r.opportunityId === 'opp2')!.id, 'DECLINED', '', 'mgr')

    const pipeline = useStore.getState().opportunities
      .filter(o => !o.isDeleted && OPP_VIEW_STATUSES.includes(o.status as OppStatus))
    expect(pipeline.some(o => o.id === 'opp1')).toBe(false)
    expect(pipeline.some(o => o.id === 'opp2')).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('4 · FreshAward → Active Contract (moveFreshAwardToActive)', () => {
  const FA_BASE = {
    id: 'fa1', opportunityId: 'opp1',
    solicitation: 'HVAC Maintenance Service',
    solicitationId: 'FA4890-26-R-0001',
    client: 'Andrews AFB',
    type: 'OTJ' as const,
    setAside: 'SB' as const,
    naicsCode: '238220',
    awardedDate: '2026-06-01',
    status: 'ASSIGNED' as const,
  }

  it('creates a contract from the FreshAward', () => {
    useStore.setState({ freshAwards: [FA_BASE], contracts: [] })

    useStore.getState().moveFreshAwardToActive('fa1')

    const contracts = useStore.getState().contracts
    expect(contracts).toHaveLength(1)
    expect(contracts[0].title).toBe('HVAC Maintenance Service')
  })

  it('contract starts at KICK_OFF status', () => {
    useStore.setState({ freshAwards: [FA_BASE], contracts: [] })

    useStore.getState().moveFreshAwardToActive('fa1')

    expect(useStore.getState().contracts[0].status).toBe('KICK_OFF')
  })

  it('removes the FreshAward from the active Fresh Awards list', () => {
    useStore.setState({ freshAwards: [FA_BASE], contracts: [] })

    useStore.getState().moveFreshAwardToActive('fa1')

    expect(useStore.getState().freshAwards.some(f => f.id === 'fa1')).toBe(false)
  })

  it('can assign operations team while moving directly to Contract Admin', () => {
    useStore.setState({ freshAwards: [{ ...FA_BASE, status: 'PENDING_ASSIGNMENT' }], contracts: [] })

    useStore.getState().moveFreshAwardToActive('fa1', {
      assignedBDM: 'Nadia El Mansouri',
      assignedBDS: 'Salma Idrissi',
      assignedSupportAgent: 'Hiba Amrani',
    })

    const contract = useStore.getState().contracts[0]
    expect(contract.status).toBe('KICK_OFF')
    expect(contract.bdm).toBe('Nadia El Mansouri')
    expect(contract.bds).toBe('Salma Idrissi')
    expect(contract.supportAgent).toBe('Hiba Amrani')
    expect(useStore.getState().freshAwards.some(f => f.id === 'fa1')).toBe(false)
  })

  it('keeps the created contract linked to the original opportunity', () => {
    useStore.setState({ freshAwards: [FA_BASE], contracts: [] })

    useStore.getState().moveFreshAwardToActive('fa1')

    const contract = useStore.getState().contracts[0]
    expect(contract.opportunityId).toBe('opp1')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('5 · Contract status flow (advanceContractStatus)', () => {
  it('KICK_OFF → LOCKING_SUB', () => {
    const c = makeContract({ id: 'c1', status: 'KICK_OFF' })
    useStore.setState({ contracts: [c] })

    useStore.getState().advanceContractStatus('c1')
    expect(useStore.getState().contracts.find(x => x.id === 'c1')?.status).toBe('LOCKING_SUB')
  })

  it('LOCKING_SUB → PERFORMING', () => {
    const c = makeContract({ id: 'c1', status: 'LOCKING_SUB' })
    useStore.setState({ contracts: [c] })

    useStore.getState().advanceContractStatus('c1')
    expect(useStore.getState().contracts.find(x => x.id === 'c1')?.status).toBe('PERFORMING')
  })

  it('PERFORMING → PENDING_PAYMENT', () => {
    const c = makeContract({ id: 'c1', status: 'PERFORMING' })
    useStore.setState({ contracts: [c] })

    useStore.getState().advanceContractStatus('c1')
    expect(useStore.getState().contracts.find(x => x.id === 'c1')?.status).toBe('PENDING_PAYMENT')
  })

  it('PENDING_PAYMENT → ARCHIVED + PastPerformance auto-created', () => {
    const c = makeContract({ id: 'c1', status: 'PENDING_PAYMENT' })
    useStore.setState({ contracts: [c], pastPerformances: [] })

    useStore.getState().advanceContractStatus('c1')

    const updated = useStore.getState().contracts.find(x => x.id === 'c1')
    expect(updated?.status).toBe('ARCHIVED')

    const pps = useStore.getState().pastPerformances
    expect(pps).toHaveLength(1)
    expect(pps[0].contractId).toBe('c1')
    expect(pps[0].title).toBe('HVAC Maintenance Service')
  })

  it('ARCHIVED is a terminal state — does not advance', () => {
    const c = makeContract({ id: 'c1', status: 'ARCHIVED' })
    useStore.setState({ contracts: [c] })

    useStore.getState().advanceContractStatus('c1')

    expect(useStore.getState().contracts.find(x => x.id === 'c1')?.status).toBe('ARCHIVED')
  })

  it('TERMINATED is a terminal state — does not advance', () => {
    const c = makeContract({ id: 'c1', status: 'TERMINATED' })
    useStore.setState({ contracts: [c] })

    useStore.getState().advanceContractStatus('c1')

    expect(useStore.getState().contracts.find(x => x.id === 'c1')?.status).toBe('TERMINATED')
  })

  it('advances through full chain: KICK_OFF → ARCHIVED in 4 steps', () => {
    const c = makeContract({ id: 'c1', status: 'KICK_OFF' })
    useStore.setState({ contracts: [c], pastPerformances: [] })

    const expectedChain: ContractStatus[] = ['LOCKING_SUB', 'PERFORMING', 'PENDING_PAYMENT', 'ARCHIVED']
    for (const expected of expectedChain) {
      useStore.getState().advanceContractStatus('c1')
      expect(useStore.getState().contracts.find(x => x.id === 'c1')?.status).toBe(expected)
    }

    // A PastPerformance must have been created when ARCHIVED
    expect(useStore.getState().pastPerformances.some(p => p.contractId === 'c1')).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('6 · terminateContract', () => {
  it('sets status → TERMINATED', () => {
    const c = makeContract({ id: 'c1', status: 'PERFORMING' })
    useStore.setState({ contracts: [c], pastPerformances: [] })

    useStore.getState().terminateContract('c1', 'T4C', 'Convenience termination')

    const updated = useStore.getState().contracts.find(x => x.id === 'c1')
    expect(updated?.status).toBe('TERMINATED')
  })

  it('records termination type and reason', () => {
    const c = makeContract({ id: 'c1', status: 'PERFORMING' })
    useStore.setState({ contracts: [c], pastPerformances: [] })

    useStore.getState().terminateContract('c1', 'T4D', 'Default on deliverables')

    const updated = useStore.getState().contracts.find(x => x.id === 'c1')
    expect(updated?.terminationType).toBe('T4D')
    expect(updated?.terminationReason).toBe('Default on deliverables')
  })

  it('auto-creates a PastPerformance on termination', () => {
    const c = makeContract({ id: 'c1', status: 'PERFORMING' })
    useStore.setState({ contracts: [c], pastPerformances: [] })

    useStore.getState().terminateContract('c1', 'T4C', 'Reason')

    const pps = useStore.getState().pastPerformances
    expect(pps).toHaveLength(1)
    expect(pps[0].contractId).toBe('c1')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('7 · BD Submission status updates', () => {
  const SAMPLE_BD = {
    id: 42, submittedOn: '2026-05-01',
    solicitationId: 'BD-042', setAside: 'SB' as const, type: 'OTJ' as const,
    solicitation: 'Test BD Submission', status: 'SUBMITTED' as const,
    dueDate: '2026-06-01', localTime: '17:00', location: 'DC',
    bdm: 'alice', bds: 'bob', value: 250_000,
  }

  it('updates status from SUBMITTED → DISCUSSING', async () => {
    useStore.setState({ bdSubmissions: [SAMPLE_BD] })
    await useStore.getState().updateBDSubmission(42, 'DISCUSSING')
    expect(useStore.getState().bdSubmissions.find(s => s.id === 42)?.status).toBe('DISCUSSING')
  })

  it('updates status from DISCUSSING → AWARDED', async () => {
    useStore.setState({ bdSubmissions: [{ ...SAMPLE_BD, status: 'DISCUSSING' }] })
    await useStore.getState().updateBDSubmission(42, 'AWARDED')
    expect(useStore.getState().bdSubmissions.find(s => s.id === 42)?.status).toBe('AWARDED')
  })

  it('updates status to LOST', async () => {
    useStore.setState({ bdSubmissions: [SAMPLE_BD] })
    await useStore.getState().updateBDSubmission(42, 'LOST')
    expect(useStore.getState().bdSubmissions.find(s => s.id === 42)?.status).toBe('LOST')
  })

  it('updates status to NOT_SUBMITTED', async () => {
    useStore.setState({ bdSubmissions: [SAMPLE_BD] })
    await useStore.getState().updateBDSubmission(42, 'NOT_SUBMITTED')
    expect(useStore.getState().bdSubmissions.find(s => s.id === 42)?.status).toBe('NOT_SUBMITTED')
  })

  it('does not affect other BD submissions', async () => {
    const other = { ...SAMPLE_BD, id: 99, status: 'SUBMITTED' as const }
    useStore.setState({ bdSubmissions: [SAMPLE_BD, other] })
    await useStore.getState().updateBDSubmission(42, 'AWARDED')
    expect(useStore.getState().bdSubmissions.find(s => s.id === 99)?.status).toBe('SUBMITTED')
  })

  it('repairs linked opportunity and tracker assignments with one atomic workflow', async () => {
    const opp = makeOpp({ id: 'opp-repair', solicitationId: SAMPLE_BD.solicitationId })
    useStore.setState({
      opportunities: [opp],
      bdSubmissions: [{ ...SAMPLE_BD, opportunityId: opp.id, bdm: '', bds: '', supportAgent: undefined }],
    })

    const saved = await useStore.getState().updateBDSubmissionDetails(42, {
      bdm: 'Test Manager',
      bds: 'Test Team Lead',
      supportAgent: 'Test Associate',
    }, {
      assignedTo: 'emp-associate',
      bdm: 'Test Manager',
      bds: 'Test Team Lead',
      supportAgent: 'Test Associate',
    })

    expect(saved).toBe(true)
    expect(editOpportunityWorkflow).toHaveBeenCalledTimes(1)
    expect(useStore.getState().opportunities[0]).toMatchObject({
      assignedTo: 'emp-associate',
      bdm: 'Test Manager',
      bds: 'Test Team Lead',
      supportAgent: 'Test Associate',
    })
    expect(useStore.getState().bdSubmissions[0]).toMatchObject({
      bdm: 'Test Manager',
      bds: 'Test Team Lead',
      supportAgent: 'Test Associate',
    })
    expect(upsertOpportunity).not.toHaveBeenCalled()
    expect(upsertBDSubmission).not.toHaveBeenCalled()
  })

  it('keeps linked and tracker assignments unchanged when atomic repair fails', async () => {
    const opp = makeOpp({ id: 'opp-repair', solicitationId: SAMPLE_BD.solicitationId, assignedTo: undefined })
    const tracker = { ...SAMPLE_BD, opportunityId: opp.id, bdm: '', bds: '', supportAgent: undefined }
    useStore.setState({ opportunities: [opp], bdSubmissions: [tracker] })
    vi.mocked(editOpportunityWorkflow).mockResolvedValueOnce(null)

    const saved = await useStore.getState().updateBDSubmissionDetails(42, {
      bdm: 'Test Manager',
      bds: 'Test Team Lead',
      supportAgent: 'Test Associate',
    }, { assignedTo: 'emp-associate' })

    expect(saved).toBe(false)
    expect(useStore.getState().opportunities[0]?.assignedTo).toBeUndefined()
    expect(useStore.getState().bdSubmissions[0]).toEqual(tracker)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('8 · Cancel opportunity', () => {
  it('retains the source opportunity and assignments when canceled', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'ACTIVE', assignedTo: 'emp-associate' })
    useStore.setState({ opportunities: [opp], bdSubmissions: [] })

    await useStore.getState().updateOpportunity('opp1', { status: 'CANCELED' })

    const canceled = useStore.getState().opportunities.find(o => o.id === 'opp1')
    expect(canceled?.status).toBe('CANCELED')
    expect(canceled?.assignedTo).toBe('emp-associate')
    const trackerRow = useStore.getState().bdSubmissions.find(b => b.solicitationId === opp.solicitationId)
    expect(trackerRow?.status).toBe('CANCELED')
    expect(trackerRow?.bdm).toBe('Test Manager')
    expect(trackerRow?.bds).toBe('Test Team Lead')
    expect(trackerRow?.supportAgent).toBe('Test Associate')
    expect(transitionOpportunityWorkflow).toHaveBeenCalledTimes(1)
    expect(upsertOpportunity).not.toHaveBeenCalled()
    expect(upsertBDSubmission).not.toHaveBeenCalled()
    expect(deleteOpportunityRecord).not.toHaveBeenCalled()
  })

  it('removes canceled opportunities from every opportunity-backed view', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'ACTIVE' })
    useStore.setState({ opportunities: [opp] })

    await useStore.getState().updateOpportunity('opp1', { status: 'CANCELED' })

    const pipeline = useStore.getState().opportunities
      .filter(o => !o.isDeleted && OPP_VIEW_STATUSES.includes(o.status as OppStatus))
    expect(pipeline.some(o => o.id === 'opp1')).toBe(false)
    expect(useStore.getState().opportunities).toHaveLength(1)
    expect(useStore.getState().opportunities[0]?.status).toBe('CANCELED')
  })

  it('works from any pre-submission status (NEW_ASSIGNMENT, DISCUSSION)', async () => {
    for (const status of ['NEW_ASSIGNMENT', 'DISCUSSION'] as OppStatus[]) {
      const opp = makeOpp({ id: `opp-${status}`, status })
      useStore.setState({ opportunities: [opp], bdSubmissions: [] })
      await useStore.getState().updateOpportunity(`opp-${status}`, { status: 'CANCELED' })
      expect(useStore.getState().opportunities.find(o => o.id === `opp-${status}`)?.status).toBe('CANCELED')
      expect(useStore.getState().bdSubmissions[0]?.status).toBe('CANCELED')
    }
  })

  it('leaves the source record untouched when cancellation cannot be saved', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'ACTIVE', assignedTo: 'emp-associate' })
    useStore.setState({ opportunities: [opp], bdSubmissions: [] })
    vi.mocked(transitionOpportunityWorkflow).mockResolvedValueOnce(null)

    const saved = await useStore.getState().updateOpportunity('opp1', { status: 'CANCELED' })

    expect(saved).toBe(false)
    expect(useStore.getState().opportunities[0]).toMatchObject({ status: 'ACTIVE', assignedTo: 'emp-associate' })
    expect(useStore.getState().bdSubmissions).toHaveLength(0)
    expect(deleteOpportunityRecord).not.toHaveBeenCalled()
    expect(upsertOpportunity).not.toHaveBeenCalled()
    expect(upsertBDSubmission).not.toHaveBeenCalled()
  })

  it('restores CANCELED to SUBMITTED without losing assignment and clears only the generated comment', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'CANCELED', assignedTo: 'emp-associate' })
    const tracker = {
      id: 42,
      submittedOn: '2026-05-01',
      solicitationId: opp.solicitationId,
      setAside: opp.setAside,
      type: opp.type,
      solicitation: opp.solicitation,
      status: 'CANCELED' as const,
      dueDate: opp.dueDate,
      localTime: opp.localTime,
      location: opp.location,
      bdm: 'Test Manager',
      bds: 'Test Team Lead',
      supportAgent: 'Test Associate',
      value: 0,
      comment: 'Canceled',
    }
    useStore.setState({ opportunities: [opp], bdSubmissions: [tracker] })

    const saved = await useStore.getState().updateBDSubmission(42, 'SUBMITTED')

    expect(saved).toBe(true)
    expect(useStore.getState().opportunities[0]).toMatchObject({ status: 'SUBMITTED', assignedTo: 'emp-associate' })
    expect(useStore.getState().bdSubmissions[0]).toMatchObject({ status: 'SUBMITTED' })
    expect(useStore.getState().bdSubmissions[0]?.comment).toBeUndefined()
    expect(useStore.getState().activityLogs[0]?.action).toContain('Restored canceled opportunity')
  })

  it('preserves a user-authored cancellation reason when restored', async () => {
    const opp = makeOpp({ id: 'opp1', status: 'CANCELED', assignedTo: 'emp-associate' })
    const tracker = {
      id: 42,
      submittedOn: '2026-05-01',
      solicitationId: opp.solicitationId,
      setAside: opp.setAside,
      type: opp.type,
      solicitation: opp.solicitation,
      status: 'CANCELED' as const,
      dueDate: opp.dueDate,
      localTime: opp.localTime,
      location: opp.location,
      bdm: 'Test Manager',
      bds: 'Test Team Lead',
      supportAgent: 'Test Associate',
      value: 0,
      comment: 'Agency withdrew the requirement',
    }
    useStore.setState({ opportunities: [opp], bdSubmissions: [tracker] })

    await useStore.getState().updateBDSubmission(42, 'SUBMITTED')

    expect(useStore.getState().bdSubmissions[0]?.comment).toBe('Agency withdrew the requirement')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('9 · Full end-to-end contract lifecycle', () => {
  it('opp → submit → won → fresh award → contract → archive → past performance', async () => {
    // Step 1: Create opportunity
    const opp = makeOpp({ id: 'opp-e2e', status: 'ACTIVE', contractAmount: 500_000 })
    useStore.setState({ opportunities: [opp], freshAwards: [], contracts: [], pastPerformances: [] })

    // Step 2: Verify opp is in pipeline
    expect(
      useStore.getState().opportunities.filter(o => OPP_VIEW_STATUSES.includes(o.status as OppStatus)).some(o => o.id === 'opp-e2e')
    ).toBe(true)

    // Step 3: Submit
    await useStore.getState().submitOpportunity('opp-e2e', { contractAmount: 500_000 })
    expect(useStore.getState().opportunities.find(o => o.id === 'opp-e2e')?.status).toBe('SUBMITTED')

    // Step 4: Opp no longer in pipeline
    expect(
      useStore.getState().opportunities.filter(o => OPP_VIEW_STATUSES.includes(o.status as OppStatus)).some(o => o.id === 'opp-e2e')
    ).toBe(false)

    // Step 5: Mark as WON → FreshAward created
    useStore.getState().markOpportunityWon('opp-e2e')
    expect(useStore.getState().opportunities.find(o => o.id === 'opp-e2e')?.status).toBe('WON')
    const award = useStore.getState().freshAwards.find(fa => fa.opportunityId === 'opp-e2e')
    expect(award).toBeTruthy()
    expect(award?.status).toBe('PENDING_ASSIGNMENT')

    // Step 6: Assign team to FreshAward
    useStore.getState().assignFreshAward(award!.id, {
      assignedBDM: 'alice', assignedBDS: 'bob', assignedSPM: 'carol', assignedPM: 'dave',
    })
    const assignedAward = useStore.getState().freshAwards.find(fa => fa.id === award!.id)
    expect(assignedAward?.status).toBe('ASSIGNED')

    // Step 7: Move FreshAward → Active Contract
    useStore.getState().moveFreshAwardToActive(award!.id)
    expect(useStore.getState().freshAwards.some(fa => fa.id === award!.id)).toBe(false)
    const contract = useStore.getState().contracts[0]
    expect(contract.status).toBe('KICK_OFF')

    // Step 8: Advance through full contract chain
    const chain: ContractStatus[] = ['LOCKING_SUB', 'PERFORMING', 'PENDING_PAYMENT', 'ARCHIVED']
    for (const expected of chain) {
      useStore.getState().advanceContractStatus(contract.id)
      expect(useStore.getState().contracts.find(c => c.id === contract.id)?.status).toBe(expected)
    }

    // Step 9: PastPerformance auto-created on archive
    expect(useStore.getState().pastPerformances.some(p => p.contractId === contract.id)).toBe(true)
  })
})

describe('10 · Assignment queue readiness', () => {
  const employees: Employee[] = [
    { id: 'mgr', name: 'Manager One', email: 'mgr@ces.com', role: 'BD_MANAGER', managerId: null, avatar: 'MO' },
    { id: 'tl', name: 'Team Lead One', email: 'tl@ces.com', role: 'TEAM_LEAD', managerId: 'mgr', avatar: 'TL' },
    { id: 'associate', name: 'Associate One', email: 'associate@ces.com', role: 'ASSOCIATE', managerId: 'tl', avatar: 'AO' },
  ]

  it('keeps team-lead-only assignments in Assign Opportunities', () => {
    const opp = makeOpp({ id: 'opp-team-lead-only', status: 'ACTIVE', assignedTo: undefined })
    useStore.setState({ employees, opportunities: [opp] })

    useStore.getState().assignOpportunityToEmployee('opp-team-lead-only', 'tl')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp-team-lead-only')
    expect(updated?.assignedTo).toBe('tl')
    expect(updated?.status).toBe('NEW_ASSIGNMENT')
  })

  it('keeps manager-only assignments in Assign Opportunities', () => {
    const opp = makeOpp({ id: 'opp-manager-only', status: 'ACTIVE', assignedTo: undefined })
    useStore.setState({ employees, opportunities: [opp] })

    useStore.getState().assignOpportunityToEmployee('opp-manager-only', 'mgr')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp-manager-only')
    expect(updated?.assignedTo).toBe('mgr')
    expect(updated?.status).toBe('NEW_ASSIGNMENT')
  })

  it('moves associate assignments into Contract Opportunities', () => {
    const opp = makeOpp({ id: 'opp-associate-ready', status: 'NEW_ASSIGNMENT', assignedTo: 'tl' })
    useStore.setState({ employees, opportunities: [opp] })

    useStore.getState().assignOpportunityToEmployee('opp-associate-ready', 'associate')

    const updated = useStore.getState().opportunities.find(o => o.id === 'opp-associate-ready')
    expect(updated?.assignedTo).toBe('associate')
    expect(updated?.status).toBe('ACTIVE')
  })
})

describe('11 - Government warning management', () => {
  it('removes a warning from its contract', () => {
    const c = makeContract({
      id: 'c-warning',
      governmentWarnings: [{
        id: 'gw1',
        contractId: 'c-warning',
        type: 'CURE_NOTICE',
        issuedDate: '2026-05-26',
        deadline: '2026-05-30',
        description: 'Missing report',
        severity: 'RED',
      }],
    })
    useStore.setState({ contracts: [c] })

    useStore.getState().removeGovernmentWarning('c-warning', 'gw1')

    expect(useStore.getState().contracts[0].governmentWarnings).toEqual([])
  })

  it('updates warning issuance and deadline dates', () => {
    const c = makeContract({
      id: 'c-warning-edit',
      governmentWarnings: [{
        id: 'gw1',
        contractId: 'c-warning-edit',
        type: 'CURE_NOTICE',
        issuedDate: '2026-05-26',
        deadline: '2026-05-30',
        description: 'Missing report',
        severity: 'RED',
      }],
    })
    useStore.setState({ contracts: [c] })

    useStore.getState().updateGovernmentWarning('c-warning-edit', 'gw1', {
      issuedDate: '2026-06-01',
      deadline: '2026-06-10',
    })

    const warning = useStore.getState().contracts[0].governmentWarnings?.[0]
    expect(warning?.issuedDate).toBe('2026-06-01')
    expect(warning?.deadline).toBe('2026-06-10')
  })
})

describe('12 - IDIQ/BPA child contract records', () => {
  it('adds, updates, and removes a BPA call under its parent contract', () => {
    const c = makeContract({ id: 'c-bpa', type: 'BPA', vehicleOrders: [] })
    const document: FileAttachment = {
      id: 'doc-call-1',
      name: 'call-0001.pdf',
      mimeType: 'application/pdf',
      size: 1200,
      attachedAt: '2026-06-11T10:00:00.000Z',
      uploadedBy: 'Capture Manager',
      dataUrl: 'data:application/pdf;base64,JVBERi0=',
    }
    useStore.setState({ contracts: [c] })

    const orderId = useStore.getState().addContractVehicleOrder('c-bpa', {
      type: 'CALL',
      number: 'CALL-0001',
      totalValue: 25000,
      popStart: '2026-07-01',
      popEnd: '2026-07-31',
      document,
      createdBy: 'Capture Manager',
    })

    expect(orderId).toBeTruthy()
    let orders = useStore.getState().contracts[0].vehicleOrders
    expect(orders).toHaveLength(1)
    expect(orders?.[0]).toMatchObject({
      contractId: 'c-bpa',
      type: 'CALL',
      number: 'CALL-0001',
      totalValue: 25000,
      popStart: '2026-07-01',
      popEnd: '2026-07-31',
    })
    expect(orders?.[0].document?.name).toBe('call-0001.pdf')
    expect(upsertContractVehicleOrder).toHaveBeenCalledOnce()

    useStore.getState().updateContractVehicleOrder('c-bpa', orderId!, {
      number: 'CALL-0001-REV',
      totalValue: 30000,
    })

    orders = useStore.getState().contracts[0].vehicleOrders
    expect(orders?.[0].number).toBe('CALL-0001-REV')
    expect(orders?.[0].totalValue).toBe(30000)
    expect(upsertContractVehicleOrder).toHaveBeenCalledTimes(2)

    useStore.getState().removeContractVehicleOrder('c-bpa', orderId!)

    expect(useStore.getState().contracts[0].vehicleOrders).toEqual([])
    expect(deleteContractVehicleOrderRecord).toHaveBeenCalledWith(orderId)
  })
})
