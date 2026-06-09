import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contract, Employee, Opportunity, User } from '../types'
import { assignableEmployeesForUser } from '../lib/team'

vi.mock('../lib/supabase', () => ({
  isSupabaseConnected: false,
  supabase: null,
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
  deleteFreshAwardRecord: vi.fn(),
  upsertPastPerformance: vi.fn(),
  upsertNonSubReport: vi.fn(),
  upsertDeletionRequest: vi.fn(),
  upsertBDSubmission: vi.fn(),
}))

import { useStore } from '../store/useStore'

const captureManager: User = {
  id: 'u-capture',
  name: 'Capture Manager',
  email: 'capture@example.com',
  username: 'capture',
  role: 'CAPTURE_MANAGER',
  avatar: 'CM',
  status: 'active',
  firstLogin: false,
  mfaEnabled: true,
  createdAt: '2026-01-01',
}

const bdManager: User = {
  id: 'u-bd-manager',
  name: 'BD Manager',
  email: 'bd.manager@example.com',
  username: 'bd.manager',
  role: 'BD_MANAGER',
  avatar: 'BM',
  status: 'active',
  firstLogin: false,
  mfaEnabled: true,
  createdAt: '2026-01-01',
  team: 'BD',
  managerId: null,
}

const opsManager: User = {
  id: 'u-ops-manager',
  name: 'Ops Manager',
  email: 'ops.manager@example.com',
  username: 'ops.manager',
  role: 'OPS_MANAGER',
  avatar: 'OM',
  status: 'active',
  firstLogin: false,
  mfaEnabled: true,
  createdAt: '2026-01-01',
  team: 'OPS',
  managerId: null,
}

const bdEmployee: Employee = {
  id: 'u-bd-manager',
  name: 'BD Manager',
  email: 'bd.manager@example.com',
  role: 'BD_MANAGER',
  managerId: null,
  avatar: 'BM',
  team: 'BD',
}

const opsEmployee: Employee = {
  id: 'u-ops-manager',
  name: 'Ops Manager',
  email: 'ops.manager@example.com',
  role: 'BD_MANAGER',
  managerId: null,
  avatar: 'OM',
  team: 'OPS',
}

const opportunity: Opportunity = {
  id: 'opp-1',
  solicitation: 'Test Opportunity',
  solicitationId: 'SOL-1',
  client: 'Agency',
  type: 'OTJ',
  naicsCode: '238220',
  setAside: 'SB',
  priority: 'MEDIUM',
  status: 'NEW_ASSIGNMENT',
  dueDate: '2026-06-30',
  localTime: '14:00',
  timezone: 'EDT',
  location: 'Washington, DC',
  pop: '',
  bdm: '',
  bds: '',
  period: 'JUN 2026',
  capturedOn: 'June 1, 2026',
  comments: [],
  proposals: [],
}

const contract: Contract = {
  id: 'contract-1',
  contractId: 'C-1',
  title: 'Test Contract',
  type: 'OTJ',
  naicsCode: '238220',
  status: 'KICK_OFF',
  location: 'Washington, DC',
  popStart: '2026-06-01',
  popEnd: '2026-06-30',
  value: 10_000,
  spm: '',
  pm: '',
}

describe('assignment users and department scope', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: captureManager,
      users: [captureManager, bdManager, opsManager],
      employees: [bdEmployee, opsEmployee],
      opportunities: [{ ...opportunity }],
      contracts: [{ ...contract }],
      notifications: [],
      activityLogs: [],
    })
  })

  it('scopes assignable users by department', () => {
    const employees = useStore.getState().employees

    expect(assignableEmployeesForUser(employees, captureManager, 'BD').map(employee => employee.id)).toEqual(['u-bd-manager'])
    expect(assignableEmployeesForUser(employees, captureManager, 'OPS').map(employee => employee.id)).toEqual(['u-ops-manager'])
  })

  it('mirrors admin-created users into assignment employees and removes deleted users', () => {
    useStore.getState().createUser({
      name: 'New BD Associate',
      email: 'new.bd@example.com',
      username: 'new.bd',
      role: 'ASSOCIATE',
      avatar: 'NB',
      status: 'active',
      firstLogin: false,
      mfaEnabled: true,
      team: 'BD',
      managerId: 'u-bd-manager',
    })

    const created = useStore.getState().users.find(user => user.email === 'new.bd@example.com')
    expect(created).toBeTruthy()
    expect(useStore.getState().employees.find(employee => employee.id === created?.id)?.team).toBe('BD')

    useStore.getState().deleteUser(created!.id)
    expect(useStore.getState().employees.some(employee => employee.id === created?.id)).toBe(false)
  })

  it('rejects cross-department assignments in the store', () => {
    useStore.getState().assignOpportunityToEmployee('opp-1', 'u-ops-manager')
    expect(useStore.getState().opportunities.find(item => item.id === 'opp-1')?.assignedTo).toBeUndefined()

    useStore.getState().assignContractToEmployee('contract-1', 'u-bd-manager')
    expect(useStore.getState().contracts.find(item => item.id === 'contract-1')?.assignedTo).toBeUndefined()
  })
})
