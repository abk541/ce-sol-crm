import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Employee, FreshAward, User } from '../types'
import { assignmentWorkloadByEmployee } from '../lib/team'

vi.mock('../lib/api', () => ({
  isApiConnected: false,
  api: null,
}))

vi.mock('../lib/db', () => ({
  loadAllData: vi.fn(),
  seedIfEmpty: vi.fn(),
  seedEmployeesIfEmpty: vi.fn(),
  findActiveOpportunityDuplicate: vi.fn().mockResolvedValue({ ok: true, duplicate: false }),
  upsertOpportunity: vi.fn().mockResolvedValue(true),
  deleteOpportunityRecord: vi.fn().mockResolvedValue(true),
  upsertSubcontractor: vi.fn(),
  deleteSubcontractorRecord: vi.fn(),
  upsertContract: vi.fn().mockResolvedValue(true),
  upsertContractPoC: vi.fn(),
  deleteContractPoC: vi.fn(),
  upsertContractInvoice: vi.fn(),
  deleteContractInvoice: vi.fn(),
  upsertLockedSubcontractor: vi.fn(),
  upsertGovernmentWarning: vi.fn(),
  deleteGovernmentWarningRecord: vi.fn(),
  upsertContractLineItem: vi.fn(),
  deleteContractLineItemRecord: vi.fn(),
  upsertFreshAward: vi.fn(),
  deleteFreshAwardRecord: vi.fn().mockResolvedValue(true),
  upsertPastPerformance: vi.fn(),
  upsertNonSubReport: vi.fn(),
  upsertDeletionRequest: vi.fn(),
  upsertBDSubmission: vi.fn(),
  deleteBDSubmissionRecord: vi.fn(),
}))

import { useStore } from '../store/useStore'

const captureManager: User = {
  id: 'u0',
  name: 'Capture Manager',
  email: 'capture@example.com',
  username: 'capture',
  role: 'CAPTURE_MANAGER',
  avatar: 'CM',
  status: 'active',
  firstLogin: false,
  createdAt: '2026-01-01',
}

const opsEmployees: Employee[] = [
  { id: 'emp-ops-1', name: 'Sergio Vega', email: 'sergio@example.com', role: 'BD_MANAGER', managerId: null, avatar: 'SV', team: 'OPS' },
  { id: 'emp-ops-3', name: 'Diego Rojas', email: 'diego@example.com', role: 'TEAM_LEAD', managerId: 'emp-ops-1', avatar: 'DR', team: 'OPS' },
  { id: 'emp-ops-7', name: 'Lucas Romero', email: 'lucas@example.com', role: 'ASSOCIATE', managerId: 'emp-ops-3', avatar: 'LR', team: 'OPS' },
]

const award: FreshAward = {
  id: 'fa-1',
  solicitation: 'Awarded Test Contract',
  solicitationId: 'SOL-001',
  client: 'Agency',
  type: 'OTJ',
  setAside: 'SB',
  naicsCode: '238220',
  contractAmount: 10_000,
  location: 'Rabat',
  awardedDate: '2026-06-01',
  status: 'PENDING_ASSIGNMENT',
}

describe('fresh award activation assignment', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: captureManager,
      employees: opsEmployees,
      opportunities: [],
      contracts: [],
      freshAwards: [award],
      notifications: [],
      activityLogs: [],
    })
  })

  it('creates the active contract with the selected OPS employee id so workload counts can see it', () => {
    useStore.getState().moveFreshAwardToActive('fa-1', {
      assignedBDM: 'Sergio Vega',
      assignedBDS: 'Diego Rojas',
      assignedSupportAgent: 'Lucas Romero',
    })

    const contract = useStore.getState().contracts[0]

    expect(contract.assignedTo).toBe('emp-ops-7')
    expect(contract.supportAgent).toBe('Lucas Romero')

    const workload = assignmentWorkloadByEmployee({
      employees: opsEmployees,
      opportunities: [],
      contracts: [{ ...contract, popEnd: '2026-06-30' }],
      selectedDueDay: '2026-06-30',
    })

    expect(workload['emp-ops-7']).toEqual({ activeTotal: 1, sameDueDay: 1 })
    expect(workload['emp-ops-3']).toEqual({ activeTotal: 1, sameDueDay: 1 })
    expect(workload['emp-ops-1']).toEqual({ activeTotal: 1, sameDueDay: 1 })
  })

  it('counts legacy active contracts that only saved the assignee name', () => {
    const workload = assignmentWorkloadByEmployee({
      employees: opsEmployees,
      opportunities: [],
      contracts: [{
        id: 'c-legacy',
        contractId: 'LEG-001',
        title: 'Legacy Contract',
        type: 'OTJ',
        naicsCode: '238220',
        status: 'KICK_OFF',
        location: 'Rabat',
        popStart: '2026-06-01',
        popEnd: '2026-06-30',
        value: 10_000,
        spm: '',
        pm: '',
        supportAgent: 'Lucas Romero',
      }],
      selectedDueDay: '2026-06-30',
    })

    expect(workload['emp-ops-7']).toEqual({ activeTotal: 1, sameDueDay: 1 })
    expect(workload['emp-ops-3']).toEqual({ activeTotal: 1, sameDueDay: 1 })
    expect(workload['emp-ops-1']).toEqual({ activeTotal: 1, sameDueDay: 1 })
  })
})
