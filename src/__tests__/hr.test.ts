import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db', () => ({
  loadAllData: vi.fn().mockResolvedValue(null),
  seedIfEmpty: vi.fn().mockResolvedValue(null),
  seedEmployeesIfEmpty: vi.fn().mockResolvedValue(null),
  findActiveOpportunityDuplicate: vi.fn().mockResolvedValue({ ok: true, duplicate: false }),
  upsertOpportunity: vi.fn().mockResolvedValue(true),
  deleteOpportunityRecord: vi.fn().mockResolvedValue(null),
  upsertSubcontractor: vi.fn().mockResolvedValue(null),
  deleteSubcontractorRecord: vi.fn().mockResolvedValue(null),
  upsertContract: vi.fn().mockResolvedValue(null),
  upsertContractPoC: vi.fn().mockResolvedValue(null),
  deleteContractPoC: vi.fn().mockResolvedValue(null),
  upsertLockedSubcontractor: vi.fn().mockResolvedValue(null),
  upsertGovernmentWarning: vi.fn().mockResolvedValue(null),
  deleteGovernmentWarningRecord: vi.fn().mockResolvedValue(null),
  upsertFreshAward: vi.fn().mockResolvedValue(null),
  deleteFreshAwardRecord: vi.fn().mockResolvedValue(null),
  upsertPastPerformance: vi.fn().mockResolvedValue(null),
  upsertNonSubReport: vi.fn().mockResolvedValue(null),
  upsertDeletionRequest: vi.fn().mockResolvedValue(null),
  upsertBDSubmission: vi.fn().mockResolvedValue(null),
  deleteBDSubmissionRecord: vi.fn().mockResolvedValue(null),
  bulkDeleteFromTable: vi.fn().mockResolvedValue(true),
  upsertEmployeeRequest: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConnected: false,
  supabase: null,
}))

import { useStore } from '../store/useStore'
import type { User } from '../types'

const CAPTURE_MANAGER: User = {
  id: 'u-capture',
  name: 'Capture Manager',
  email: 'capture@ces.com',
  username: 'capture',
  role: 'CAPTURE_MANAGER',
  avatar: 'CM',
  status: 'active',
  firstLogin: false,
  createdAt: '2026-01-01',
}

const ASSOCIATE: User = {
  id: 'u-associate',
  name: 'Associate User',
  email: 'associate@ces.com',
  username: 'associate',
  role: 'ASSOCIATE',
  avatar: 'AU',
  status: 'active',
  firstLogin: false,
  createdAt: '2026-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    currentUser: CAPTURE_MANAGER,
    isAuthenticated: true,
    companyCertifications: [],
    employeeRequests: [],
    notifications: [],
    activityLogs: [],
  })
})

describe('HR store actions', () => {
  it('lets Capture Manager add, edit, and delete company certifications', () => {
    useStore.getState().addCompanyCertification({
      name: 'ISO 9001',
      issuer: 'Registrar',
      certificateNumber: 'ISO-001',
      issuedDate: '2026-01-10',
      expirationDate: '2027-01-10',
      notes: 'Quality management',
      attachments: [],
    })

    const cert = useStore.getState().companyCertifications[0]
    expect(cert.name).toBe('ISO 9001')
    expect(cert.createdBy).toBe('Capture Manager')
    expect(cert.status).toBe('ACTIVE')

    useStore.getState().updateCompanyCertification(cert.id, { issuer: 'Updated Registrar' })
    expect(useStore.getState().companyCertifications[0].issuer).toBe('Updated Registrar')

    useStore.getState().deleteCompanyCertification(cert.id)
    expect(useStore.getState().companyCertifications).toHaveLength(0)
  })

  it('prevents non-admin employees from managing company certifications', () => {
    useStore.setState({ currentUser: ASSOCIATE })

    useStore.getState().addCompanyCertification({
      name: 'ISO 27001',
      issuer: 'Registrar',
      certificateNumber: 'ISO-27001',
      issuedDate: '2026-01-10',
      attachments: [],
    })

    expect(useStore.getState().companyCertifications).toHaveLength(0)
  })

  it('records employee requests under the signed-in user', () => {
    useStore.setState({ currentUser: ASSOCIATE })

    useStore.getState().submitEmployeeRequest({
      type: 'DOCUMENT',
      priority: 'MEDIUM',
      title: 'Employment letter',
      details: 'Need a signed employment verification letter.',
      attachments: [],
    })

    const request = useStore.getState().employeeRequests[0]
    expect(request.requesterId).toBe(ASSOCIATE.id)
    expect(request.requesterEmail).toBe(ASSOCIATE.email)
    expect(request.requesterRole).toBe('ASSOCIATE')
    expect(request.status).toBe('PENDING')
  })

  it('stores sick leave, deadlines, and requested leave dates', () => {
    useStore.setState({ currentUser: ASSOCIATE })

    useStore.getState().submitEmployeeRequest({
      type: 'SICK_LEAVE',
      priority: 'HIGH',
      title: 'Medical leave',
      details: 'Medical recovery period.',
      deadline: '2026-07-25',
      leaveStart: '2026-07-21',
      leaveEnd: '2026-07-23',
      attachments: [],
    })

    expect(useStore.getState().employeeRequests[0]).toMatchObject({
      type: 'SICK_LEAVE',
      deadline: '2026-07-25',
      leaveStart: '2026-07-21',
      leaveEnd: '2026-07-23',
    })
  })

  it('only lets Capture Manager review employee requests', () => {
    useStore.setState({ currentUser: ASSOCIATE })
    useStore.getState().submitEmployeeRequest({
      type: 'ACCESS',
      priority: 'HIGH',
      title: 'Access badge',
      details: 'Badge access needed.',
      attachments: [],
    })
    const request = useStore.getState().employeeRequests[0]

    useStore.getState().reviewEmployeeRequest(request.id, 'APPROVED', 'Approved')
    expect(useStore.getState().employeeRequests[0].status).toBe('PENDING')

    useStore.setState({ currentUser: CAPTURE_MANAGER })
    useStore.getState().reviewEmployeeRequest(request.id, 'APPROVED', 'Approved')
    expect(useStore.getState().employeeRequests[0].status).toBe('APPROVED')
    expect(useStore.getState().employeeRequests[0].reviewedBy).toBe('Capture Manager')
  })

  it('only lets Capture Manager delete a submitted request', async () => {
    useStore.setState({ currentUser: ASSOCIATE })
    useStore.getState().submitEmployeeRequest({
      type: 'TIME_OFF',
      priority: 'MEDIUM',
      title: 'Annual leave',
      details: 'Requested annual leave.',
      leaveStart: '2026-08-03',
      leaveEnd: '2026-08-07',
      attachments: [],
    })
    const request = useStore.getState().employeeRequests[0]

    useStore.getState().deleteEmployeeRequest(request.id)
    expect(useStore.getState().employeeRequests).toHaveLength(1)

    useStore.setState({ currentUser: CAPTURE_MANAGER })
    useStore.getState().deleteEmployeeRequest(request.id)
    await Promise.resolve()
    expect(useStore.getState().employeeRequests).toHaveLength(0)
  })
})
