import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import toast from 'react-hot-toast'
import type {
  User, Opportunity, Contract, Notification, Subcontractor,
  NonSubmissionReport, DeletionRequest, FreshAward,
  PastPerformance, SubkDatabaseEntry, ActivityLog,
  ContractPoC, LockedSubcontractor, GovernmentWarning, Employee,
  BDSubmission, FileAttachment, CompanyCertification, EmployeeRequest,
  CompanyCertificationStatus, EmployeeRequestStatus,
  ContractLineItem, ContractInvoice, ContractVehicleOrder, UserPreferences, EmployeeTeam,
  ContractStatus,
} from '../types'
import {
  MOCK_USERS, MOCK_OPPORTUNITIES, MOCK_NOTIFICATIONS,
  MOCK_SUBCONTRACTORS, MOCK_NON_SUB_REPORTS, MOCK_DELETION_REQUESTS,
  MOCK_CONTRACTS, MOCK_FRESH_AWARDS, MOCK_PAST_PERFORMANCES,
  MOCK_SUBK_DATABASE, MOCK_ACTIVITY_LOGS,
  MOCK_BD_SUBMISSIONS, MOCK_COMPANY_CERTIFICATIONS, MOCK_EMPLOYEE_REQUESTS,
} from '../data/mock'
import { isSupabaseConnected } from '../lib/supabase'
import { opportunityDeadlineTimeMs } from '../lib/timezone'
import {
  loadAllData,
  seedIfEmpty,
  seedEmployeesIfEmpty,
  findActiveOpportunityDuplicate,
  upsertOpportunity,
  deleteOpportunityRecord,
  upsertSubcontractor,
  deleteSubcontractorRecord,
  upsertContract,
  upsertContractPoC,
  deleteContractPoC,
  upsertContractInvoice,
  deleteContractInvoice,
  upsertLockedSubcontractor,
  upsertGovernmentWarning,
  deleteGovernmentWarningRecord,
  upsertContractLineItem,
  deleteContractLineItemRecord,
  upsertContractVehicleOrder,
  deleteContractVehicleOrderRecord,
  upsertFreshAward,
  deleteFreshAwardRecord,
  upsertPastPerformance,
  upsertNonSubReport,
  upsertDeletionRequest,
  upsertBDSubmission,
  deleteBDSubmissionRecord,
} from '../lib/db'
import { getAssignmentChain, isAssignedToAssociate } from '../lib/team'
import { hasPermission } from '../lib/permissions'
import { nextInvoiceSequenceFromContracts } from '../lib/invoiceNumbers'

interface AppState {
  // Auth
  currentUser: User | null
  isAuthenticated: boolean
  needsFirstLogin: boolean
  needsMFASetup: boolean
  loginTimestamp: number | null
  accessNoticeAccepted: boolean

  // Data
  users: User[]
  opportunities: Opportunity[]
  contracts: Contract[]
  notifications: Notification[]
  subcontractors: Subcontractor[]
  nonSubReports: NonSubmissionReport[]
  deletionRequests: DeletionRequest[]
  freshAwards: FreshAward[]
  pastPerformances: PastPerformance[]
  subkDatabase: SubkDatabaseEntry[]
  activityLogs: ActivityLog[]
  employees: Employee[]
  bdSubmissions: BDSubmission[]
  companyCertifications: CompanyCertification[]
  employeeRequests: EmployeeRequest[]

  // UI
  sidebarCollapsed: boolean
  nonSubGraceHours: number
  nonSubGraceMinutes: number
  nextInvoiceNumber: number   // global running sequence for generated contract invoices
  prefs: UserPreferences

  // ── Auth actions ───────────────────────────────────────────────────
  login: (email: string, password: string) => { ok: boolean; error?: string; needsFirst?: boolean; needsMFA?: boolean }
  logout: () => void
  acceptAccessNotice: () => void
  completeFirstLogin: (password: string) => void
  completeMFASetup: () => void

  // ── User management ────────────────────────────────────────────────
  createUser: (u: Omit<User, 'id' | 'createdAt'>) => void
  updateUser: (id: string, data: Partial<User>) => void
  deleteUser: (id: string) => void
  addCompanyCertification: (data: Omit<CompanyCertification, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'status'> & { status?: CompanyCertificationStatus }) => void
  updateCompanyCertification: (id: string, data: Partial<CompanyCertification>) => void
  deleteCompanyCertification: (id: string) => void
  submitEmployeeRequest: (data: Omit<EmployeeRequest, 'id' | 'requesterId' | 'requesterName' | 'requesterEmail' | 'status' | 'submittedAt'>) => void
  reviewEmployeeRequest: (id: string, status: EmployeeRequestStatus, reviewNote?: string) => void
  updateEmployeeRequest: (id: string, data: Partial<EmployeeRequest>) => void

  // ── Opportunity management ─────────────────────────────────────────
  createOpportunity: (o: Omit<Opportunity, 'id'>) => Promise<boolean>
  updateOpportunity: (id: string, data: Partial<Opportunity>) => Promise<boolean>
  assignOpportunity: (id: string, bdm: string, bds: string) => void
  submitOpportunity: (id: string, values?: { contractAmount?: number; baseAmount?: number; monthlyPayment?: number; proposals?: string[]; assignedOpportunities?: string[]; proposalAttachments?: FileAttachment[] }) => void
  markOpportunityWon: (id: string) => void
  moveOpportunityToBDTracker: (id: string, status: BDSubmission['status'], comment?: string) => void
  syncDueOpportunities: () => void
  terminateContract: (id: string, type: 'T4C' | 'T4D' | 'CANCELED', reason: string) => void

  // ── Contract management ────────────────────────────────────────────
  createContract: (c: Omit<Contract, 'id'>) => Promise<boolean>
  updateContract: (id: string, data: Partial<Contract>) => Promise<boolean>
  addContractPoC: (contractId: string, poc: Omit<ContractPoC, 'id' | 'contractId'>) => void
  updateContractPoC: (contractId: string, pocId: string, data: Partial<ContractPoC>) => void
  removeContractPoC: (contractId: string, pocId: string) => void
  addContractInvoice: (contractId: string, invoice: Omit<ContractInvoice, 'id' | 'contractId' | 'createdAt'>) => string
  updateContractInvoice: (contractId: string, invoiceId: string, data: Partial<ContractInvoice>) => void
  removeContractInvoice: (contractId: string, invoiceId: string) => void
  addLockedSubcontractor: (contractId: string, sub: Omit<LockedSubcontractor, 'id' | 'contractId'>) => void
  updateLockedSubcontractor: (contractId: string, subId: string, data: Partial<LockedSubcontractor>) => void
  addGovernmentWarning: (contractId: string, warning: Omit<GovernmentWarning, 'id' | 'contractId'>) => void
  updateGovernmentWarning: (contractId: string, warningId: string, data: Partial<GovernmentWarning>) => void
  removeGovernmentWarning: (contractId: string, warningId: string) => void
  resolveGovernmentWarning: (contractId: string, warningId: string, note: string) => void
  advanceContractStatus: (id: string) => void
  setContractStatus: (id: string, nextStatus: ContractStatus) => void

  // ── Contract line items (CLINs) ────────────────────────────────────
  addContractLineItem: (contractId: string, line: Omit<ContractLineItem, 'id' | 'contractId' | 'clin' | 'amount' | 'createdAt'> & { amount?: number }) => string | null
  updateContractLineItem: (contractId: string, lineId: string, data: Partial<Omit<ContractLineItem, 'id' | 'contractId' | 'clin'>>) => void
  removeContractLineItem: (contractId: string, lineId: string) => void
  addContractVehicleOrder: (contractId: string, order: Omit<ContractVehicleOrder, 'id' | 'contractId' | 'createdAt'>) => string | null
  updateContractVehicleOrder: (contractId: string, orderId: string, data: Partial<Omit<ContractVehicleOrder, 'id' | 'contractId'>>) => void
  removeContractVehicleOrder: (contractId: string, orderId: string) => void

  // ── Subcontractor management ───────────────────────────────────────
  addSubcontractor: (data: Omit<Subcontractor, 'id' | 'createdAt'>) => void
  updateSubcontractor: (id: string, data: Partial<Subcontractor>) => void
  deleteSubcontractor: (id: string) => void

  // ── BD Submissions ─────────────────────────────────────────────────
  updateBDSubmission: (id: number, status: BDSubmission['status']) => void
  updateBDSubmissionDetails: (id: number, data: Partial<Omit<BDSubmission, 'id' | 'status'>>) => void
  deleteBDSubmission: (id: number) => void
  returnBDSubmissionToPipeline: (id: number) => void

  // ── Fresh Awards ───────────────────────────────────────────────────
  assignFreshAward: (id: string, assignments: Partial<FreshAward>) => void
  moveFreshAwardToActive: (id: string, assignments?: Partial<FreshAward>) => void
  updateFreshAward: (id: string, data: Partial<FreshAward>) => void

  // ── Past Performances ──────────────────────────────────────────────
  addPastPerformance: (pp: Omit<PastPerformance, 'id' | 'createdAt'>) => void
  updatePastPerformance: (id: string, data: Partial<PastPerformance>) => void
  deletePastPerformance: (id: string) => void

  // ── Subk Database ──────────────────────────────────────────────────
  addSubkDatabaseEntry: (entry: Omit<SubkDatabaseEntry, 'id' | 'createdAt'>) => void
  updateSubkDatabaseEntry: (id: string, data: Partial<SubkDatabaseEntry>) => void
  deleteSubkDatabaseEntry: (id: string) => void

  // ── Activity Logs ──────────────────────────────────────────────────
  logActivity: (entry: Omit<ActivityLog, 'id' | 'createdAt'>) => void

  // ── Non-submission reports ─────────────────────────────────────────
  submitNonSubReport: (data: Omit<NonSubmissionReport, 'id' | 'submittedAt' | 'status'>) => void
  reviewNonSubReport: (id: string, action: 'APPROVED' | 'DECLINED', reviewNote: string, reviewedBy: string) => void

  // ── Deletion requests ──────────────────────────────────────────────
  requestDeletion: (opportunityId: string, requestedBy: string, reason: string) => void
  reviewDeletionRequest: (id: string, action: 'APPROVED' | 'DECLINED', reviewedBy: string) => void

  // ── Notifications ──────────────────────────────────────────────────
  markNotificationRead: (id: string) => void
  markAllRead: () => void
  addNotification: (n: Omit<Notification, 'id' | 'createdAt'>) => void

  // ── Employee assignment ────────────────────────────────────────────
  assignOpportunityToEmployee: (opportunityId: string, employeeId: string) => void
  assignContractToEmployee: (contractId: string, employeeId: string) => void

  // ── UI ─────────────────────────────────────────────────────────────
  toggleSidebar: () => void
  updateNonSubGracePeriod: (hours: number, minutes: number) => void
  consumeInvoiceNumber: () => number
  setPref: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void

  // ── DB ─────────────────────────────────────────────────────────────
  dbReady: boolean
  needsPurge: boolean
  initializeStore: () => Promise<void>
}

// Contract status advancement order
const STATUS_FLOW: Record<string, string> = {
  KICK_OFF: 'LOCKING_SUB',
  LOCKING_SUB: 'PERFORMING',
  PERFORMING: 'PENDING_PAYMENT',
  PENDING_PAYMENT: 'ARCHIVED',
  ACTIVE: 'ON_GOING',
  ON_GOING: 'PERFORMING',
}

const PRE_SUBMISSION_STATUSES: Opportunity['status'][] = ['ACTIVE', 'NEW_ASSIGNMENT', 'DISCUSSION']

function normalizeOpportunityAssignmentStatus(opp: Opportunity, employees: Employee[]): Opportunity {
  if (!PRE_SUBMISSION_STATUSES.includes(opp.status)) return opp
  const readyForContractOpportunities = isAssignedToAssociate(employees, opp.assignedTo)

  if (readyForContractOpportunities && opp.status === 'NEW_ASSIGNMENT') {
    return { ...opp, status: 'ACTIVE' }
  }

  if (!readyForContractOpportunities && opp.status === 'ACTIVE') {
    return { ...opp, status: 'NEW_ASSIGNMENT' }
  }

  return opp
}

function deadlineTimeMs(opp: Opportunity): number | null {
  return opportunityDeadlineTimeMs(opp)
}

function isNonSubmissionGraceReached(opp: Opportunity, graceMs: number, now = new Date()): boolean {
  const deadlineMs = deadlineTimeMs(opp)
  return deadlineMs !== null && deadlineMs + Math.max(0, graceMs) <= now.getTime()
}

function gracePeriodLabel(hours: number, minutes: number): string {
  const cleanHours = Math.max(0, Math.trunc(hours))
  const cleanMinutes = Math.max(0, Math.trunc(minutes))
  const parts = [
    cleanHours ? `${cleanHours} hour${cleanHours === 1 ? '' : 's'}` : '',
    cleanMinutes ? `${cleanMinutes} minute${cleanMinutes === 1 ? '' : 's'}` : '',
  ].filter(Boolean)

  return parts.length ? parts.join(' ') : 'immediately'
}

function nonSubmissionAgentUsername(opp: Opportunity, employees: Employee[], currentUser?: User | null): string {
  const chain = getAssignmentChain(employees, opp.assignedTo)
  return chain.associate?.email.split('@')[0] || opp.supportAgent || currentUser?.username || 'system'
}

function todayLabel() {
  return new Date().toISOString().split('T')[0]
}

function certificationStatus(expirationDate?: string): CompanyCertificationStatus {
  if (!expirationDate) return 'ACTIVE'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expires = new Date(`${expirationDate}T00:00:00`)
  if (Number.isNaN(expires.getTime())) return 'ACTIVE'
  if (expires < today) return 'EXPIRED'
  const daysUntilExpiration = Math.ceil((expires.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  return daysUntilExpiration <= 45 ? 'EXPIRING' : 'ACTIVE'
}

function bdStatusToOpportunityStatus(status: BDSubmission['status']): Opportunity['status'] {
  if (status === 'DISCUSSING') return 'DISCUSSION'
  if (status === 'AWARDED') return 'WON'
  return status
}

function bdSubmissionFromOpportunity(
  opp: Opportunity,
  status: BDSubmission['status'],
  existing?: BDSubmission,
  comment?: string,
): BDSubmission {
  return {
    id: existing?.id ?? Date.now(),
    submittedOn: existing?.submittedOn ?? todayLabel(),
    solicitationId: opp.solicitationId,
    setAside: opp.setAside,
    type: opp.type,
    solicitation: opp.solicitation,
    status,
    dueDate: opp.dueDate,
    localTime: `${opp.localTime ?? ''}${opp.timezone ? ` ${opp.timezone}` : ''}`.trim(),
    location: opp.location,
    bdm: opp.bdm,
    bds: opp.bds,
    supportAgent: opp.supportAgent,
    value: opp.contractAmount ?? opp.value ?? opp.baseAmount ?? 0,
    comment: comment ?? existing?.comment,
  }
}

function showDatabaseSaveError(recordLabel: string) {
  toast.error(`${recordLabel} was not saved to the database. Check Supabase connection and try again.`)
}

async function ensureAssignmentEmployeesSynced(employees: Employee[]): Promise<boolean> {
  const synced = await seedEmployeesIfEmpty(employees)
  if (synced === false) {
    showDatabaseSaveError('Employee assignment')
    return false
  }
  return true
}

function persistAssignedOpportunity(opp: Opportunity, employees: Employee[], recordLabel = 'Opportunity') {
  void ensureAssignmentEmployeesSynced(employees).then(synced => {
    if (!synced) return
    void upsertOpportunity(opp).then(saved => {
      if (!saved) showDatabaseSaveError(recordLabel)
    })
  })
}

function persistAssignedContract(contract: Contract, employees: Employee[], recordLabel = 'Contract') {
  void ensureAssignmentEmployeesSynced(employees).then(synced => {
    if (!synced) return
    void upsertContract(contract).then(saved => {
      if (!saved) showDatabaseSaveError(recordLabel)
    })
  })
}

function normalizePersistedUserRole<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  const user = value as Record<string, unknown>
  if (user.id === 'u0' || user.email === 'abk@cesolutionplus.com' || user.username === 'abk') {
    return { ...user, role: 'CAPTURE_MANAGER' } as T
  }
  return value
}

function mergeSeedUsers(users: unknown, refreshSeedHierarchy = false): User[] {
  const existing = Array.isArray(users) ? users.map(normalizePersistedUserRole as (value: User) => User) : []
  if (refreshSeedHierarchy) {
    const seedIds = new Set(MOCK_USERS.map(user => user.id))
    const seedEmails = new Set(MOCK_USERS.map(user => user.email.toLowerCase()))
    const customUsers = existing.filter(user =>
      !seedIds.has(user.id) &&
      !seedEmails.has(user.email.toLowerCase())
    )
    return [...MOCK_USERS, ...customUsers]
  }

  const byEmail = new Map(existing.map(user => [user.email.toLowerCase(), user]))

  MOCK_USERS.forEach(seedUser => {
    const key = seedUser.email.toLowerCase()
    const current = byEmail.get(key)
    if (!current) {
      byEmail.set(key, seedUser)
      return
    }
  })

  return Array.from(byEmail.values())
}

// Admin manages `users`; the assignment picker reads from `employees`. Mirror each user with a
// hierarchy role into an employee record (sharing the same id) so people created/moved in Admin
// appear in the picker and their workload counters work. CAPTURE_MANAGER is not assignable.
function userToEmployee(user: User): Employee | null {
  if (user.status !== 'active') return null
  if (user.role === 'CAPTURE_MANAGER') return null
  const role: Employee['role'] =
    user.role === 'OPS_MANAGER' ? 'BD_MANAGER' : user.role
  const team: Employee['team'] =
    user.role === 'OPS_MANAGER' ? 'OPS' :
    user.role === 'BD_MANAGER' ? 'BD' :
    (user.team ?? 'BD')
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    managerId: user.managerId ?? null,
    avatar: user.avatar,
    team,
  }
}

// Admin users are the source of truth for assignment. We intentionally do not
// preserve standalone employee records here: if a user is inactive/deleted, they
// must disappear from every assignment picker immediately.
function syncEmployeesWithUsers(users: User[], employees: Employee[]): Employee[] {
  const userMirrors = users.map(userToEmployee).filter((e): e is Employee => e !== null)
  const validIds = new Set(userMirrors.map(employee => employee.id))
  return userMirrors.map(employee => {
    const parentId = employee.managerId
    return parentId && !validIds.has(parentId)
      ? { ...employee, managerId: null }
      : employee
  })
}

function employeeBelongsToTeam(employee: Employee | undefined, team: EmployeeTeam): employee is Employee {
  return !!employee && (employee.team ?? 'BD') === team
}

function normalizedSolicitationId(value?: string) {
  return (value ?? '').trim().toLowerCase()
}

function hasLocalActiveSolicitationDuplicate(opportunities: Opportunity[], solicitationId: string, excludeOpportunityId?: string) {
  const normalized = normalizedSolicitationId(solicitationId)
  if (!normalized) return false
  return opportunities.some(opp =>
    opp.id !== excludeOpportunityId &&
    !opp.isDeleted &&
    normalizedSolicitationId(opp.solicitationId) === normalized
  )
}

async function canUseSolicitationId(solicitationId: string, opportunities: Opportunity[], excludeOpportunityId?: string) {
  const normalized = solicitationId.trim()
  if (!normalized) return true

  if (hasLocalActiveSolicitationDuplicate(opportunities, normalized, excludeOpportunityId)) {
    toast.error(`An active opportunity with solicitation ID ${normalized} already exists.`)
    return false
  }

  const duplicateCheck = await findActiveOpportunityDuplicate(normalized, excludeOpportunityId)
  if (!duplicateCheck.ok) {
    showDatabaseSaveError('Opportunity duplicate check')
    return false
  }
  if (duplicateCheck.duplicate) {
    toast.error(`An active opportunity with solicitation ID ${normalized} already exists.`)
    return false
  }
  return true
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      needsFirstLogin: false,
      needsMFASetup: false,
      loginTimestamp: null,
      accessNoticeAccepted: false,
      users: MOCK_USERS,
      opportunities: MOCK_OPPORTUNITIES,
      contracts: MOCK_CONTRACTS,
      notifications: MOCK_NOTIFICATIONS,
      subcontractors: MOCK_SUBCONTRACTORS,
      nonSubReports: MOCK_NON_SUB_REPORTS,
      deletionRequests: MOCK_DELETION_REQUESTS,
      freshAwards: MOCK_FRESH_AWARDS,
      pastPerformances: MOCK_PAST_PERFORMANCES,
      subkDatabase: MOCK_SUBK_DATABASE,
      activityLogs: MOCK_ACTIVITY_LOGS,
      employees: syncEmployeesWithUsers(MOCK_USERS, []),
      bdSubmissions: MOCK_BD_SUBMISSIONS,
      companyCertifications: MOCK_COMPANY_CERTIFICATIONS,
      employeeRequests: MOCK_EMPLOYEE_REQUESTS,
      sidebarCollapsed: false,
      nonSubGraceHours: 0,
      nonSubGraceMinutes: 5,
      nextInvoiceNumber: 1,
      prefs: { notificationSound: true },
      dbReady: false,
      needsPurge: false,

      // ── Auth ────────────────────────────────────────────────────────
      login: (email, password) => {
        const user = get().users.find(u => u.email.toLowerCase() === email.toLowerCase())
        if (!user) return { ok: false, error: 'No account found with that email.' }
        if (user.status === 'inactive') return { ok: false, error: 'Account is deactivated.' }
        if (user.password && user.password !== password)
          return { ok: false, error: 'Incorrect password.' }
        if (user.firstLogin) {
          set({ currentUser: user, needsFirstLogin: true, accessNoticeAccepted: false })
          return { ok: true, needsFirst: true }
        }
        if (!user.mfaEnabled) {
          set({ currentUser: user, needsMFASetup: true, accessNoticeAccepted: false })
          return { ok: true, needsMFA: true }
        }
        set({ currentUser: user, isAuthenticated: true, loginTimestamp: Date.now(), accessNoticeAccepted: false })
        return { ok: true }
      },

      logout: () => set({ currentUser: null, isAuthenticated: false, needsFirstLogin: false, needsMFASetup: false, loginTimestamp: null, dbReady: false, accessNoticeAccepted: false }),

      acceptAccessNotice: () => set({ accessNoticeAccepted: true }),

      completeFirstLogin: (password) => {
        const u = get().currentUser
        if (!u) return
        const updated = { ...u, firstLogin: false, password: password || u.password }
        set(s => ({
          users: s.users.map(x => x.id === u.id ? updated : x),
          currentUser: updated,
          needsFirstLogin: false,
          needsMFASetup: !u.mfaEnabled,
        }))
      },

      completeMFASetup: () => {
        const u = get().currentUser
        if (!u) return
        const updated = { ...u, mfaEnabled: true }
        set(s => ({
          users: s.users.map(x => x.id === u.id ? updated : x),
          currentUser: updated,
          needsMFASetup: false,
          isAuthenticated: true,
        }))
      },

      // ── User management ─────────────────────────────────────────────
      createUser: (data) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'admin:manageUsers')) {
          toast.error('Only the Capture Manager can manage users.')
          return
        }
        const user: User = {
          ...data,
          id: `u${Date.now()}`,
          createdAt: new Date().toISOString().split('T')[0],
        }
        set(s => ({
          users: [...s.users, user],
          employees: syncEmployeesWithUsers([...s.users, user], s.employees),
        }))
        get().logActivity({
          action: `Created user: ${user.name} (${user.email}) as ${user.role}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'user',
          entityId: user.id,
          entityName: user.name,
        })
      },

      updateUser: (id, data) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'admin:manageUsers')) {
          toast.error('Only the Capture Manager can manage users.')
          return
        }
        const before = get().users.find(u => u.id === id)
        set(s => {
          const nextUsers = s.users.map(u => u.id === id ? { ...u, ...data } : u)
          return { users: nextUsers, employees: syncEmployeesWithUsers(nextUsers, s.employees) }
        })
        const after = get().users.find(u => u.id === id)
        if (before && after) {
          const changes: string[] = []
          if (data.role && data.role !== before.role) changes.push(`role: ${before.role} → ${after.role}`)
          if (data.team !== undefined && data.team !== before.team) changes.push(`team: ${before.team ?? '-'} → ${after.team ?? '-'}`)
          if (data.managerId !== undefined && data.managerId !== before.managerId) changes.push('manager updated')
          if (data.status && data.status !== before.status) changes.push(`status: ${before.status} → ${after.status}`)
          if (data.password && data.password !== before.password) changes.push('password reset')
          if (data.firstLogin && !before.firstLogin) changes.push('first-login forced')
          if (changes.length > 0 || data.name || data.email) {
            const detail = changes.length ? ` (${changes.join(', ')})` : ''
            get().logActivity({
              action: `Updated user: ${after.name}${detail}`,
              user: actor?.name || 'System',
              userRole: actor?.role || 'CAPTURE_MANAGER',
              entityType: 'user',
              entityId: after.id,
              entityName: after.name,
            })
          }
        }
      },

      deleteUser: (id) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'admin:manageUsers')) {
          toast.error('Only the Capture Manager can manage users.')
          return
        }
        const target = get().users.find(u => u.id === id)
        set(s => {
          const nextUsers = s.users.filter(u => u.id !== id)
          return { users: nextUsers, employees: syncEmployeesWithUsers(nextUsers, s.employees) }
        })
        if (target) {
          get().logActivity({
            action: `Removed user: ${target.name} (${target.email})`,
            user: actor?.name || 'System',
            userRole: actor?.role || 'CAPTURE_MANAGER',
            entityType: 'user',
            entityId: target.id,
            entityName: target.name,
          })
        }
      },

      // ── Opportunity management ──────────────────────────────────────
      addCompanyCertification: (data) => {
        const user = get().currentUser
        if (!hasPermission(user, 'hr:manageCertifications')) {
          toast.error('Only the Capture Manager can manage company certifications.')
          return
        }
        const cert: CompanyCertification = {
          ...data,
          id: `cert${Date.now()}`,
          status: data.status ?? certificationStatus(data.expirationDate),
          createdAt: new Date().toISOString(),
          createdBy: user?.name ?? 'System',
        }
        set(s => ({ companyCertifications: [cert, ...s.companyCertifications] }))
        get().logActivity({
          action: `Added company certification: ${cert.name}`,
          user: user?.name || 'System',
          userRole: user?.role || 'CAPTURE_MANAGER',
          entityType: 'hr',
          entityId: cert.id,
          entityName: cert.name,
        })
      },

      updateCompanyCertification: (id, data) => {
        const user = get().currentUser
        if (!hasPermission(user, 'hr:manageCertifications')) {
          toast.error('Only the Capture Manager can manage company certifications.')
          return
        }
        set(s => ({
          companyCertifications: s.companyCertifications.map(cert =>
            cert.id === id
              ? {
                  ...cert,
                  ...data,
                  status: data.status ?? certificationStatus(data.expirationDate ?? cert.expirationDate),
                  updatedAt: new Date().toISOString(),
                }
              : cert
          )
        }))
      },

      deleteCompanyCertification: (id) => {
        const user = get().currentUser
        if (!hasPermission(user, 'hr:manageCertifications')) {
          toast.error('Only the Capture Manager can manage company certifications.')
          return
        }
        const cert = get().companyCertifications.find(item => item.id === id)
        set(s => ({ companyCertifications: s.companyCertifications.filter(item => item.id !== id) }))
        if (cert) {
          get().logActivity({
            action: `Deleted company certification: ${cert.name}`,
            user: user?.name || 'System',
            userRole: user?.role || 'CAPTURE_MANAGER',
            entityType: 'hr',
            entityId: cert.id,
            entityName: cert.name,
          })
        }
      },

      submitEmployeeRequest: (data) => {
        const user = get().currentUser
        if (!user) {
          toast.error('Please log in before submitting an HR request.')
          return
        }
        const request: EmployeeRequest = {
          ...data,
          id: `hrreq${Date.now()}`,
          requesterId: user.id,
          requesterName: user.name,
          requesterEmail: user.email,
          status: 'PENDING',
          submittedAt: new Date().toISOString(),
        }
        set(s => ({ employeeRequests: [request, ...s.employeeRequests] }))
        get().addNotification({
          type: 'SYSTEM',
          title: 'HR request submitted',
          message: `${user.name} submitted "${request.title}".`,
          read: false,
          relatedId: request.id,
          targetRole: 'CAPTURE_MANAGER',
        })
      },

      reviewEmployeeRequest: (id, status, reviewNote = '') => {
        const user = get().currentUser
        if (!hasPermission(user, 'hr:reviewRequests')) {
          toast.error('Only the Capture Manager can review HR requests.')
          return
        }
        set(s => ({
          employeeRequests: s.employeeRequests.map(request =>
            request.id === id
              ? {
                  ...request,
                  status,
                  reviewNote,
                  reviewedAt: new Date().toISOString(),
                  reviewedBy: user?.name || 'System',
                }
              : request
          )
        }))
      },

      updateEmployeeRequest: (id, data) => {
        if (!hasPermission(get().currentUser, 'hr:reviewRequests')) {
          toast.error('Only the Capture Manager can edit HR requests.')
          return
        }
        set(s => ({
          employeeRequests: s.employeeRequests.map(request =>
            request.id === id ? { ...request, ...data } : request
          )
        }))
      },

      createOpportunity: async (data) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'opportunity:create')) {
          toast.error('Only the Capture Manager can add new opportunities.')
          return false
        }
        if (data.assignedTo && !employeeBelongsToTeam(get().employees.find(e => e.id === data.assignedTo), 'BD')) {
          toast.error('Opportunities can only be assigned to Business Development users.')
          return false
        }
        const solicitationId = data.solicitationId.trim()
        const allowed = await canUseSolicitationId(solicitationId, get().opportunities)
        if (!allowed) return false

        const opp = normalizeOpportunityAssignmentStatus({ ...data, solicitationId, id: `o${Date.now()}` }, get().employees)
        if (opp.assignedTo && !(await ensureAssignmentEmployeesSynced(get().employees))) return false
        const saved = await upsertOpportunity(opp)
        if (!saved) {
          showDatabaseSaveError('Opportunity')
          return false
        }
        set(s => ({ opportunities: [opp, ...s.opportunities] }))
        get().addNotification({
          type: 'ASSIGNMENT',
          title: 'New opportunity created',
          message: `${data.solicitation} was added to the pipeline.`,
          read: false,
          relatedId: opp.id,
        })
        get().logActivity({
          action: `Created opportunity: ${opp.solicitation} [${opp.solicitationId}]`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'opportunity',
          entityId: opp.id,
          entityName: opp.solicitation,
        })
        get().syncDueOpportunities()
        return true
      },

      updateOpportunity: async (id, data) => {
        if (data.status === 'CANCELED') {
          if (!hasPermission(get().currentUser, 'opportunity:cancel')) {
            toast.error('Only the Capture Manager can cancel opportunities.')
            return false
          }
          get().moveOpportunityToBDTracker(id, 'CANCELED', 'Canceled')
          return true
        }

        const changeKeys = Object.keys(data)
        const isCommentOnlyUpdate = changeKeys.length > 0 && changeKeys.every(key => key === 'comments')
        if (!hasPermission(get().currentUser, 'opportunity:edit')) {
          if (!(isCommentOnlyUpdate && hasPermission(get().currentUser, 'opportunity:comment'))) {
            toast.error('You do not have permission to edit opportunity details.')
            return false
          }
        }

        const current = get().opportunities.find(o => o.id === id)
        if (data.assignedTo && data.assignedTo !== current?.assignedTo && !employeeBelongsToTeam(get().employees.find(e => e.id === data.assignedTo), 'BD')) {
          toast.error('Opportunities can only be assigned to Business Development users.')
          return false
        }
        const nextSolicitationId = data.solicitationId?.trim()
        if (nextSolicitationId && normalizedSolicitationId(nextSolicitationId) !== normalizedSolicitationId(current?.solicitationId)) {
          const allowed = await canUseSolicitationId(nextSolicitationId, get().opportunities, id)
          if (!allowed) return false
          data = { ...data, solicitationId: nextSolicitationId }
        }

        const previous = get().opportunities
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === id ? normalizeOpportunityAssignmentStatus({ ...o, ...data }, s.employees) : o
          )
        }))
        const updated = get().opportunities.find(o => o.id === id)
        if (!updated) return false
        if (updated.assignedTo && !(await ensureAssignmentEmployeesSynced(get().employees))) {
          set({ opportunities: previous })
          return false
        }
        const saved = await upsertOpportunity(updated)
        if (!saved) {
          set({ opportunities: previous })
          showDatabaseSaveError('Opportunity update')
          return false
        }
        get().syncDueOpportunities()
        return true
      },

      assignOpportunity: (id, bdm, bds) => {
        const actor = get().currentUser
        set(s => ({
          opportunities: s.opportunities.map(o => o.id === id ? { ...o, bdm, bds } : o)
        }))
        const opp = get().opportunities.find(o => o.id === id)
        if (opp) {
          upsertOpportunity(opp)
          get().addNotification({
            type: 'ASSIGNMENT',
            title: 'Opportunity assigned',
            message: `${opp.solicitation} assigned to ${bdm}.`,
            read: false,
            relatedId: id,
          })
          get().logActivity({
            action: `Assigned opportunity ${opp.solicitation} → BDM: ${bdm}, BDS: ${bds}`,
            user: actor?.name || 'System',
            userRole: actor?.role || 'CAPTURE_MANAGER',
            entityType: 'opportunity',
            entityId: opp.id,
            entityName: opp.solicitation,
          })
        }
      },

      submitOpportunity: (id, values) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'opportunity:submitProposal')) {
          toast.error('You do not have permission to submit proposals.')
          return
        }
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === id ? { ...o, status: 'SUBMITTED', submittedAt: new Date().toISOString(), ...values } : o
          )
        }))
        const opp = get().opportunities.find(o => o.id === id)
        if (opp) {
          const existing = get().bdSubmissions.find(b => b.solicitationId === opp.solicitationId)
          const trackerRow = bdSubmissionFromOpportunity(opp, 'SUBMITTED', existing)
          set(s => ({
            bdSubmissions: existing
              ? s.bdSubmissions.map(b => b.id === existing.id ? trackerRow : b)
              : [trackerRow, ...s.bdSubmissions],
          }))
          upsertBDSubmission(trackerRow)
          upsertOpportunity(opp)
          // If a contract already exists for this opportunity (e.g. proposal
          // is being re-uploaded after award), propagate the latest proposal
          // files onto the contract so it stays in sync.
          if (values?.proposalAttachments?.length) {
            const linkedContracts = get().contracts.filter(c =>
              c.opportunityId === opp.id || c.contractId === opp.solicitationId
            )
            if (linkedContracts.length) {
              set(s => ({
                contracts: s.contracts.map(c =>
                  linkedContracts.some(lc => lc.id === c.id)
                    ? { ...c, proposalAttachments: values.proposalAttachments }
                    : c
                ),
              }))
              linkedContracts.forEach(lc => {
                const updated = get().contracts.find(c => c.id === lc.id)
                if (updated) upsertContract(updated)
              })
            }
            // Also propagate to any in-flight FreshAward so the file follows
            // the opportunity through the award handoff.
            const linkedAwards = get().freshAwards.filter(fa => fa.opportunityId === opp.id)
            if (linkedAwards.length) {
              set(s => ({
                freshAwards: s.freshAwards.map(fa =>
                  linkedAwards.some(la => la.id === fa.id)
                    ? { ...fa, proposalAttachments: values.proposalAttachments }
                    : fa
                ),
              }))
              linkedAwards.forEach(la => {
                const updated = get().freshAwards.find(fa => fa.id === la.id)
                if (updated) upsertFreshAward(updated)
              })
            }
          }
          get().addNotification({
            type: 'CONTRACT_SUBMITTED',
            title: 'Proposal submitted',
            message: `${opp.solicitation} has been submitted.`,
            read: false,
            relatedId: id,
          })
          get().logActivity({
            action: `Submitted proposal for ${opp.solicitation}${values?.contractAmount ? ` ($${Number(values.contractAmount).toLocaleString()})` : ''}`,
            user: actor?.name || 'System',
            userRole: actor?.role || 'CAPTURE_MANAGER',
            entityType: 'opportunity',
            entityId: opp.id,
            entityName: opp.solicitation,
          })
        }
      },

      moveOpportunityToBDTracker: (id, status, comment) => {
        const actor = get().currentUser
        if (status === 'CANCELED' && !hasPermission(actor, 'opportunity:cancel')) {
          toast.error('Only the Capture Manager can cancel contract opportunities.')
          return
        }
        const opp = get().opportunities.find(o => o.id === id)
        if (!opp) return

        const existing = get().bdSubmissions.find(b => b.solicitationId === opp.solicitationId)

        if (status === 'CANCELED') {
          const trackerRow = bdSubmissionFromOpportunity(opp, 'CANCELED', existing, comment)
          set(s => ({
            opportunities: s.opportunities.filter(o => o.id !== id),
            nonSubReports: s.nonSubReports.filter(r => r.opportunityId !== id),
            deletionRequests: s.deletionRequests.filter(r => r.opportunityId !== id),
            bdSubmissions: existing
              ? s.bdSubmissions.map(b => b.id === existing.id ? trackerRow : b)
              : [trackerRow, ...s.bdSubmissions],
          }))
          upsertBDSubmission(trackerRow)
          deleteOpportunityRecord(id)
          get().logActivity({
            action: `Canceled opportunity ${opp.solicitation}${comment ? ` — ${comment}` : ''}`,
            user: actor?.name || 'System',
            userRole: actor?.role || 'CAPTURE_MANAGER',
            entityType: 'opportunity',
            entityId: opp.id,
            entityName: opp.solicitation,
          })
          get().addNotification({
            type: 'STATUS_CHANGE',
            title: 'Opportunity canceled',
            message: `${opp.solicitation} was canceled${comment ? `: ${comment}` : '.'}`,
            read: false,
            relatedId: id,
          })
          return
        }

        const opportunityStatus = bdStatusToOpportunityStatus(status)
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === id
              ? { ...o, status: opportunityStatus, submittedAt: o.submittedAt ?? new Date().toISOString() }
              : o
          )
        }))

        const updatedOpp = get().opportunities.find(o => o.id === id)
        if (!updatedOpp) return
        const trackerRow = bdSubmissionFromOpportunity(updatedOpp, status, existing, comment)
        set(s => ({
          bdSubmissions: existing
            ? s.bdSubmissions.map(b => b.id === existing.id ? trackerRow : b)
            : [trackerRow, ...s.bdSubmissions],
        }))
        upsertOpportunity(updatedOpp)
        upsertBDSubmission(trackerRow)

        get().logActivity({
          action: `Moved ${opp.solicitation} to ${status.replace(/_/g, ' ')}${comment ? ` — ${comment}` : ''}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'opportunity',
          entityId: opp.id,
          entityName: opp.solicitation,
        })

        if (status === 'AWARDED') get().markOpportunityWon(id)
      },

      markOpportunityWon: (id) => {
        const opp = get().opportunities.find(o => o.id === id)
        if (!opp) return
        // Guard: never create a duplicate FreshAward for the same opportunity
        const existingAward = get().freshAwards.find(fa => fa.opportunityId === id)
        if (existingAward) {
          // Already awarded — just ensure status is WON
          set(s => ({
            opportunities: s.opportunities.map(o =>
              o.id === id ? { ...o, status: 'WON' } : o
            )
          }))
          return
        }
        // 1. Update opportunity status to WON
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === id ? { ...o, status: 'WON' } : o
          )
        }))
        const wonOpp = get().opportunities.find(o => o.id === id)
        if (wonOpp) upsertOpportunity(wonOpp)
        // 2. Create a FreshAward from the opportunity
        const freshAward: FreshAward = {
          id: `fa${Date.now()}`,
          opportunityId: opp.id,
          solicitation: opp.solicitation,
          solicitationId: opp.solicitationId,
          client: opp.client,
          type: opp.type,
          setAside: opp.setAside,
          naicsCode: opp.naicsCode,
          contractAmount: opp.contractAmount,
          baseAmount: opp.baseAmount,
          monthlyPayment: opp.monthlyPayment,
          pop: opp.pop,
          location: opp.location,
          awardedDate: new Date().toISOString().split('T')[0],
          assignedBDM: opp.bdm,
          assignedBDS: opp.bds,
          assignedSupportAgent: opp.supportAgent,
          status: 'PENDING_ASSIGNMENT',
          proposalAttachments: opp.proposalAttachments?.length ? opp.proposalAttachments : undefined,
          samGovContacts: opp.samGovContacts?.length ? opp.samGovContacts : undefined,
        }
        set(s => ({ freshAwards: [freshAward, ...s.freshAwards] }))
        upsertFreshAward(freshAward)
        // 3. Add notification
        get().addNotification({
          type: 'FRESH_AWARD',
          title: '🏆 Contract Won!',
          message: `${opp.solicitation} was won and added to Fresh Awards.`,
          read: false,
          relatedId: opp.id,
        })
        // 4. Log activity
        get().logActivity({
          action: `Opportunity marked WON → Fresh Award created: ${opp.solicitation}`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'opportunity',
          entityId: opp.id,
          entityName: opp.solicitation,
        })
      },

      // ── Contract management ─────────────────────────────────────────
      syncDueOpportunities: () => {
        const now = new Date()
        const { nonSubGraceHours, nonSubGraceMinutes } = get()
        const graceMs = ((Math.max(0, nonSubGraceHours) * 60) + Math.max(0, nonSubGraceMinutes)) * 60_000
        const reportedOpportunityIds = new Set(get().nonSubReports.map(report => report.opportunityId))
        const reportableOpps = get().opportunities.filter(opp => {
          if (opp.isDeleted || !PRE_SUBMISSION_STATUSES.includes(opp.status) || opp.nonSubmissionReportId || reportedOpportunityIds.has(opp.id)) return false
          if (!isAssignedToAssociate(get().employees, opp.assignedTo)) return false
          if (!isNonSubmissionGraceReached(opp, graceMs, now)) return false
          return true
        })

        if (reportableOpps.length === 0) return

        const reports = reportableOpps.map((opp, index): NonSubmissionReport => ({
          id: `nsr${now.getTime()}-${index}`,
          opportunityId: opp.id,
          agentUsername: nonSubmissionAgentUsername(opp, get().employees, get().currentUser),
          reason: `No proposal submission was recorded within ${gracePeriodLabel(nonSubGraceHours, nonSubGraceMinutes)} after the due datetime.`,
          status: 'PENDING',
          submittedAt: now.toISOString(),
        }))

        set(s => ({
          nonSubReports: [...reports, ...s.nonSubReports],
          opportunities: s.opportunities.map(opp => {
            const report = reports.find(r => r.opportunityId === opp.id)
            return report ? { ...opp, nonSubmissionReportId: report.id } : opp
          }),
        }))

        reports.forEach(report => {
          upsertNonSubReport(report)
          const updatedOpp = get().opportunities.find(o => o.id === report.opportunityId)
          if (updatedOpp) upsertOpportunity(updatedOpp)
          get().addNotification({
            type: 'NON_SUB_REVIEW',
            title: 'Non-submission report pending',
            message: `${updatedOpp?.solicitation ?? 'An opportunity'} passed the configured non-submission window and moved to Non-Submission Reports.`,
            read: false,
            relatedId: report.opportunityId,
            targetRole: 'CAPTURE_MANAGER',
          })
        })
      },

      createContract: async (data) => {
        const actor = get().currentUser
        if (data.assignedTo && !employeeBelongsToTeam(get().employees.find(e => e.id === data.assignedTo), 'OPS')) {
          toast.error('Contracts can only be assigned to Operations users.')
          return false
        }
        const contract: Contract = { ...data, id: `c${Date.now()}` }
        if (contract.assignedTo && !(await ensureAssignmentEmployeesSynced(get().employees))) return false
        const saved = await upsertContract(contract)
        if (!saved) {
          showDatabaseSaveError('Contract')
          return false
        }
        set(s => ({ contracts: [contract, ...s.contracts] }))
        get().addNotification({
          type: 'CONTRACT_CREATED',
          title: 'New contract created',
          message: `${data.title} has been added to active contracts.`,
          read: false,
          relatedId: contract.id,
        })
        get().logActivity({
          action: `Created contract: ${contract.title}${contract.contractId ? ` [${contract.contractId}]` : ''}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'contract',
          entityId: contract.id,
          entityName: contract.title,
        })
        return true
      },

      updateContract: async (id, data) => {
        if (data.assignedTo && !employeeBelongsToTeam(get().employees.find(e => e.id === data.assignedTo), 'OPS')) {
          toast.error('Contracts can only be assigned to Operations users.')
          return false
        }
        const previous = get().contracts
        set(s => ({
          contracts: s.contracts.map(c => c.id === id ? { ...c, ...data } : c)
        }))
        const updated = get().contracts.find(c => c.id === id)
        if (!updated) return false
        if (updated.assignedTo && !(await ensureAssignmentEmployeesSynced(get().employees))) {
          set({ contracts: previous })
          return false
        }
        const saved = await upsertContract(updated)
        if (!saved) {
          set({ contracts: previous })
          showDatabaseSaveError('Contract update')
          return false
        }
        return true
      },

      addContractPoC: (contractId, poc) => {
        const newPoC: ContractPoC = { ...poc, id: `poc${Date.now()}`, contractId }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, pocs: [...(c.pocs || []), newPoC] }
              : c
          )
        }))
        upsertContractPoC(newPoC)
      },

      updateContractPoC: (contractId, pocId, data) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, pocs: (c.pocs || []).map(p => p.id === pocId ? { ...p, ...data } : p) }
              : c
          )
        }))
        const updated = get().contracts.find(c => c.id === contractId)?.pocs?.find(p => p.id === pocId)
        if (updated) upsertContractPoC(updated)
      },

      removeContractPoC: (contractId, pocId) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, pocs: (c.pocs || []).filter(p => p.id !== pocId) }
              : c
          )
        }))
        deleteContractPoC(pocId)
      },

      addContractInvoice: (contractId, invoice) => {
        const id = `inv${Date.now()}${Math.floor(Math.random() * 1000)}`
        const newInvoice: ContractInvoice = {
          ...invoice,
          id,
          contractId,
          createdAt: new Date().toISOString(),
        }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, invoices: [...(c.invoices || []), newInvoice] }
              : c
          )
        }))
        upsertContractInvoice(newInvoice)
        return id
      },

      updateContractInvoice: (contractId, invoiceId, data) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, invoices: (c.invoices || []).map(i => i.id === invoiceId ? { ...i, ...data } : i) }
              : c
          )
        }))
        const updated = get().contracts.find(c => c.id === contractId)?.invoices?.find(i => i.id === invoiceId)
        if (updated) upsertContractInvoice(updated)
      },

      removeContractInvoice: (contractId, invoiceId) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, invoices: (c.invoices || []).filter(i => i.id !== invoiceId) }
              : c
          )
        }))
        deleteContractInvoice(invoiceId)
      },

      addLockedSubcontractor: (contractId, sub) => {
        const newSub: LockedSubcontractor = { ...sub, id: `lsub${Date.now()}`, contractId }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, lockedSubcontractors: [...(c.lockedSubcontractors || []), newSub] }
              : c
          )
        }))
        upsertLockedSubcontractor(newSub)
      },

      updateLockedSubcontractor: (contractId, subId, data) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, lockedSubcontractors: (c.lockedSubcontractors || []).map(s => s.id === subId ? { ...s, ...data } : s) }
              : c
          )
        }))
        const updated = get().contracts.find(c => c.id === contractId)?.lockedSubcontractors?.find(s => s.id === subId)
        if (updated) upsertLockedSubcontractor(updated)
      },

      addGovernmentWarning: (contractId, warning) => {
        const newWarning: GovernmentWarning = { ...warning, id: `gw${Date.now()}`, contractId }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, governmentWarnings: [...(c.governmentWarnings || []), newWarning] }
              : c
          )
        }))
        upsertGovernmentWarning(newWarning)
        get().addNotification({
          type: 'GOVERNMENT_WARNING',
          title: `Government Warning: ${warning.type.replace(/_/g, ' ')}`,
          message: `A ${warning.type.replace(/_/g, ' ')} has been issued for contract ${contractId}.`,
          read: false,
          relatedId: contractId,
          targetRole: 'ALL',
        })
      },

      updateGovernmentWarning: (contractId, warningId, data) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? {
                  ...c,
                  governmentWarnings: (c.governmentWarnings || []).map(w =>
                    w.id === warningId ? { ...w, ...data } : w
                  )
                }
              : c
          )
        }))
        const updated = get().contracts.find(c => c.id === contractId)?.governmentWarnings?.find(w => w.id === warningId)
        if (updated) upsertGovernmentWarning(updated)
      },

      removeGovernmentWarning: (contractId, warningId) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? {
                  ...c,
                  governmentWarnings: (c.governmentWarnings || []).filter(w => w.id !== warningId)
                }
              : c
          )
        }))
        deleteGovernmentWarningRecord(warningId)
      },

      resolveGovernmentWarning: (contractId, warningId, note) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? {
                  ...c,
                  governmentWarnings: (c.governmentWarnings || []).map(w =>
                    w.id === warningId
                      ? { ...w, resolvedAt: new Date().toISOString(), resolvedNote: note }
                      : w
                  )
                }
              : c
          )
        }))
        const updated = get().contracts.find(c => c.id === contractId)?.governmentWarnings?.find(w => w.id === warningId)
        if (updated) upsertGovernmentWarning(updated)
      },

      addContractLineItem: (contractId, line) => {
        const contract = get().contracts.find(c => c.id === contractId)
        if (!contract) return null
        const yearPrefixes: Record<ContractLineItem['year'], number> = {
          base: 0, option1: 1000, option2: 2000, option3: 3000, option4: 4000,
        }
        const prefix = yearPrefixes[line.year]
        const existing = (contract.lineItems || []).filter(l => l.year === line.year)
        const usedNumbers = new Set(
          existing
            .map(l => Number(l.clin))
            .filter(n => Number.isFinite(n) && n >= prefix && n < prefix + 1000),
        )
        let next = prefix + 1
        while (usedNumbers.has(next)) next++
        if (next >= prefix + 1000) {
          toast.error('No more CLIN numbers available for this year')
          return null
        }
        const clin = String(next).padStart(4, '0')
        const quantity = Number(line.quantity) || 0
        const rate = Number(line.rate) || 0
        const amount = line.amount !== undefined ? Number(line.amount) : Number((quantity * rate).toFixed(2))
        const newLine: ContractLineItem = {
          id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          contractId,
          clin,
          year: line.year,
          description: line.description ?? '',
          quantity,
          unit: line.unit ?? '',
          rate,
          amount,
          createdAt: new Date().toISOString(),
        }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId ? { ...c, lineItems: [...(c.lineItems || []), newLine] } : c
          )
        }))
        upsertContractLineItem(newLine)
        return newLine.id
      },

      updateContractLineItem: (contractId, lineId, data) => {
        set(s => ({
          contracts: s.contracts.map(c => {
            if (c.id !== contractId) return c
            return {
              ...c,
              lineItems: (c.lineItems || []).map(l => {
                if (l.id !== lineId) return l
                const next = { ...l, ...data }
                const quantity = Number(next.quantity) || 0
                const rate = Number(next.rate) || 0
                if (data.amount === undefined) {
                  next.amount = Number((quantity * rate).toFixed(2))
                }
                return next
              }),
            }
          })
        }))
        const updated = get().contracts.find(c => c.id === contractId)?.lineItems?.find(l => l.id === lineId)
        if (updated) upsertContractLineItem(updated)
      },

      removeContractLineItem: (contractId, lineId) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, lineItems: (c.lineItems || []).filter(l => l.id !== lineId) }
              : c
          )
        }))
        deleteContractLineItemRecord(lineId)
      },

      addContractVehicleOrder: (contractId, order) => {
        const contract = get().contracts.find(c => c.id === contractId)
        if (!contract) return null
        const newOrder: ContractVehicleOrder = {
          ...order,
          id: `cvo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          contractId,
          createdAt: new Date().toISOString(),
        }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, vehicleOrders: [...(c.vehicleOrders || []), newOrder] }
              : c
          )
        }))
        upsertContractVehicleOrder(newOrder)
        return newOrder.id
      },

      updateContractVehicleOrder: (contractId, orderId, data) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? {
                  ...c,
                  vehicleOrders: (c.vehicleOrders || []).map(order =>
                    order.id === orderId ? { ...order, ...data } : order
                  )
                }
              : c
          )
        }))
        const updated = get().contracts.find(c => c.id === contractId)?.vehicleOrders?.find(order => order.id === orderId)
        if (updated) upsertContractVehicleOrder(updated)
      },

      removeContractVehicleOrder: (contractId, orderId) => {
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, vehicleOrders: (c.vehicleOrders || []).filter(order => order.id !== orderId) }
              : c
          )
        }))
        deleteContractVehicleOrderRecord(orderId)
      },

      advanceContractStatus: (id) => {
        const actor = get().currentUser
        const contract = get().contracts.find(c => c.id === id)
        if (!contract) return
        const nextStatus = STATUS_FLOW[contract.status]
        if (!nextStatus) return
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === id ? { ...c, status: nextStatus as any } : c
          )
        }))
        const advancedContract = get().contracts.find(c => c.id === id)
        if (advancedContract) upsertContract(advancedContract)
        get().logActivity({
          action: `Advanced contract ${contract.title}: ${contract.status} → ${nextStatus}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'contract',
          entityId: contract.id,
          entityName: contract.title,
        })
        get().addNotification({
          type: 'STATUS_CHANGE',
          title: 'Contract status changed',
          message: `${contract.title}: ${contract.status} → ${nextStatus}`,
          read: false,
          relatedId: contract.id,
        })
        // If moved to ARCHIVED, auto-create PastPerformance
        if (nextStatus === 'ARCHIVED') {
          const pp: PastPerformance = {
            id: `pp${Date.now()}`,
            contractId: contract.id,
            opportunityId: contract.opportunityId,
            contractNumber: contract.contractId,
            title: contract.title,
            client: contract.client || '',
            type: contract.type,
            financeType: contract.financeType,
            naicsCode: contract.naicsCode,
            setAside: contract.setAside || 'UNRES',
            value: contract.value,
            popStart: contract.popStart,
            popEnd: contract.popEnd || new Date().toISOString().split('T')[0],
            location: contract.location,
            description: `Contract completed successfully.`,
            relevance: '',
            bdm: contract.bdm || '',
            bds: contract.bds || '',
            createdAt: new Date().toISOString(),
            createdBy: 'System',
          }
          set(s => ({ pastPerformances: [pp, ...s.pastPerformances] }))
          upsertPastPerformance(pp)
          get().addNotification({
            type: 'STATUS_CHANGE',
            title: 'Contract Archived',
            message: `${contract.title} has been completed and archived to Past Performances.`,
            read: false,
            relatedId: contract.id,
          })
        }
      },

      setContractStatus: (id, nextStatus) => {
        const actor = get().currentUser
        const contract = get().contracts.find(c => c.id === id)
        if (!contract) return
        if (contract.status === nextStatus) return
        const prevStatus = contract.status
        const wasTerminated = prevStatus === 'TERMINATED' || prevStatus === 'CANCELED'
        const movingToTerminal = nextStatus === 'TERMINATED' || nextStatus === 'CANCELED'

        set(s => ({
          contracts: s.contracts.map(c => {
            if (c.id !== id) return c
            const patch: Partial<Contract> = { status: nextStatus }
            if (wasTerminated && !movingToTerminal) {
              patch.terminationType = undefined
              patch.terminationReason = undefined
              patch.terminationDate = undefined
            }
            return { ...c, ...patch } as Contract
          })
        }))
        const updatedContract = get().contracts.find(c => c.id === id)
        if (updatedContract) upsertContract(updatedContract)

        get().logActivity({
          action: `Moved contract ${contract.title}: ${prevStatus} → ${nextStatus}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'contract',
          entityId: contract.id,
          entityName: contract.title,
        })
        get().addNotification({
          type: 'STATUS_CHANGE',
          title: 'Contract status changed',
          message: `${contract.title}: ${prevStatus} → ${nextStatus}`,
          read: false,
          relatedId: contract.id,
        })

        if (nextStatus === 'ARCHIVED') {
          const existingPP = get().pastPerformances.find(p => p.contractId === contract.id)
          if (!existingPP) {
            const pp: PastPerformance = {
              id: `pp${Date.now()}`,
              contractId: contract.id,
              opportunityId: contract.opportunityId,
              contractNumber: contract.contractId,
              title: contract.title,
              client: contract.client || '',
              type: contract.type,
              financeType: contract.financeType,
              naicsCode: contract.naicsCode,
              setAside: contract.setAside || 'UNRES',
              value: contract.value,
              popStart: contract.popStart,
              popEnd: contract.popEnd || new Date().toISOString().split('T')[0],
              location: contract.location,
              description: `Contract completed successfully.`,
              relevance: '',
              bdm: contract.bdm || '',
              bds: contract.bds || '',
              createdAt: new Date().toISOString(),
              createdBy: actor?.name || 'System',
            }
            set(s => ({ pastPerformances: [pp, ...s.pastPerformances] }))
            upsertPastPerformance(pp)
          }
        }
      },

      terminateContract: (id, type, reason) => {
        const contract = get().contracts.find(c => c.id === id)
        if (!contract) return
        // 1. Update contract status
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === id
              ? { ...c, status: 'TERMINATED', terminationType: type, terminationReason: reason, terminationDate: new Date().toISOString().split('T')[0] }
              : c
          )
        }))
        const terminatedContract = get().contracts.find(c => c.id === id)
        if (terminatedContract) upsertContract(terminatedContract)
        // 2. Create PastPerformance entry
        const pp: PastPerformance = {
          id: `pp${Date.now()}`,
          contractId: contract.id,
          opportunityId: contract.opportunityId,
          contractNumber: contract.contractId,
          title: contract.title,
          client: contract.client || '',
          type: contract.type,
          financeType: contract.financeType,
          naicsCode: contract.naicsCode,
          setAside: contract.setAside || 'UNRES',
          value: contract.value,
          popStart: contract.popStart,
          popEnd: contract.popEnd || new Date().toISOString().split('T')[0],
          location: contract.location,
          description: `Contract terminated (${type}). ${reason}`,
          relevance: '',
          bdm: contract.bdm || '',
          bds: contract.bds || '',
          createdAt: new Date().toISOString(),
          createdBy: get().currentUser?.name || 'System',
        }
        get().addPastPerformance(pp)
        // 3. Notify
        get().addNotification({
          type: 'STATUS_CHANGE',
          title: 'Contract Terminated',
          message: `${contract.title} has been terminated (${type}) and archived to Past Performances.`,
          read: false,
          relatedId: contract.id,
          targetRole: 'ALL',
        })
        // 4. Log
        get().logActivity({
          action: `Contract terminated (${type}) → archived to Past Performances: ${contract.title}`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'contract',
          entityId: contract.id,
          entityName: contract.title,
        })
      },

      // ── Subcontractor management ────────────────────────────────────
      addSubcontractor: (data) => {
        if (!hasPermission(get().currentUser, 'sourcing:write')) {
          toast.error('You do not have permission to update sourcing.')
          return
        }
        const sub: Subcontractor = {
          ...data,
          id: `sc${Date.now()}`,
          createdAt: new Date().toISOString(),
        }
        set(s => ({ subcontractors: [...s.subcontractors, sub] }))
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === data.opportunityId
              ? { ...o, subcontractors: [...(o.subcontractors || []), sub] }
              : o
          )
        }))
        upsertSubcontractor(sub)
      },

      updateSubcontractor: (id, data) => {
        if (!hasPermission(get().currentUser, 'sourcing:write')) {
          toast.error('You do not have permission to update sourcing.')
          return
        }
        set(s => ({
          subcontractors: s.subcontractors.map(sc => sc.id === id ? { ...sc, ...data } : sc),
          opportunities: s.opportunities.map(o => ({
            ...o,
            subcontractors: (o.subcontractors || []).map(sc => sc.id === id ? { ...sc, ...data } : sc),
          })),
        }))
        const updated = get().subcontractors.find(sc => sc.id === id)
        if (updated) upsertSubcontractor(updated)
      },

      deleteSubcontractor: (id) => {
        if (!hasPermission(get().currentUser, 'sourcing:write')) {
          toast.error('You do not have permission to update sourcing.')
          return
        }
        const sub = get().subcontractors.find(sc => sc.id === id)
        set(s => ({ subcontractors: s.subcontractors.filter(sc => sc.id !== id) }))
        if (sub) {
          set(s => ({
            opportunities: s.opportunities.map(o =>
              o.id === sub.opportunityId
                ? { ...o, subcontractors: (o.subcontractors || []).filter(sc => sc.id !== id) }
                : o
            )
          }))
          deleteSubcontractorRecord(id)
        }
      },

      // ── Fresh Awards ────────────────────────────────────────────────
      assignFreshAward: (id, assignments) => {
        set(s => ({
          freshAwards: s.freshAwards.map(fa =>
            fa.id === id ? { ...fa, ...assignments, status: 'ASSIGNED' } : fa
          )
        }))
        const updatedFa = get().freshAwards.find(f => f.id === id)
        if (updatedFa) upsertFreshAward(updatedFa)
      },

      updateFreshAward: (id, data) => {
        if (!hasPermission(get().currentUser, 'opportunity:edit')) {
          toast.error('You do not have permission to edit fresh awards.')
          return
        }
        set(s => ({
          freshAwards: s.freshAwards.map(fa => (fa.id === id ? { ...fa, ...data } : fa))
        }))
        const updated = get().freshAwards.find(f => f.id === id)
        if (updated) upsertFreshAward(updated)
      },

      moveFreshAwardToActive: (id, assignments) => {
        const existingFa = get().freshAwards.find(f => f.id === id)
        if (!existingFa) return
        const fa: FreshAward = {
          ...existingFa,
          ...assignments,
          status: assignments ? 'ASSIGNED' : existingFa.status,
        }

        const sourceOpp = fa.opportunityId ? get().opportunities.find(o => o.id === fa.opportunityId) : undefined
        const proposalAttachments = fa.proposalAttachments?.length
          ? fa.proposalAttachments
          : sourceOpp?.proposalAttachments?.length
            ? sourceOpp.proposalAttachments
            : undefined

        const samGovContacts = fa.samGovContacts?.length
          ? fa.samGovContacts
          : sourceOpp?.samGovContacts?.length
            ? sourceOpp.samGovContacts
            : undefined

        const opsEmployees = get().employees.filter(employee => (employee.team ?? 'BD') === 'OPS')
        const assignedEmployee = opsEmployees.find(employee => employee.name === fa.assignedSupportAgent)
          ?? opsEmployees.find(employee => employee.name === fa.assignedBDS)
          ?? opsEmployees.find(employee => employee.name === fa.assignedBDM)

        // Generate the contract ID once so it stays consistent on both the
        // contract record AND the fresh award's contractId field.
        const newContractId = `c${Date.now()}`
        const contract: Contract = {
          id: newContractId,
          contractId: fa.solicitationId,
          title: fa.solicitation,
          type: fa.type,
          naicsCode: fa.naicsCode,
          setAside: fa.setAside,
          status: 'KICK_OFF',
          location: fa.location || '',
          client: fa.client,
          popStart: new Date().toISOString().split('T')[0],
          popEnd: '',
          value: fa.contractAmount || 0,
          baseAmount: fa.baseAmount,
          monthlyPayment: fa.monthlyPayment,
          spm: fa.assignedSPM || '',
          pm: fa.assignedPM || '',
          bds: fa.assignedBDS,
          bdm: fa.assignedBDM,
          supportAgent: fa.assignedSupportAgent,
          opportunityId: fa.opportunityId,
          proposalAttachments,
          samGovContacts,
          assignedTo: assignedEmployee?.id,
        }

        // Move the award into Contract Admin and remove it from Fresh Awards.
        set(s => ({
          contracts: [contract, ...s.contracts],
          freshAwards: s.freshAwards.filter(f => f.id !== id),
        }))

        persistAssignedContract(contract, get().employees)
        deleteFreshAwardRecord(id)

        get().addNotification({
          type: 'CONTRACT_CREATED',
          title: 'Contract activated',
          message: `${fa.solicitation} has been moved to active contracts.`,
          read: false,
          relatedId: newContractId,
        })
        get().logActivity({
          action: `Moved Fresh Award to Active Contract: ${fa.solicitation}`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'fresh_award',
          entityId: id,
          entityName: fa.solicitation,
        })
      },

      // ── Past Performances ───────────────────────────────────────────
      addPastPerformance: (pp) => {
        const newPP: PastPerformance = {
          ...pp,
          id: `pp${Date.now()}`,
          createdAt: new Date().toISOString(),
        }
        set(s => ({ pastPerformances: [newPP, ...s.pastPerformances] }))
        upsertPastPerformance(newPP)
      },

      updatePastPerformance: (id, data) => set(s => ({
        pastPerformances: s.pastPerformances.map(p => p.id === id ? { ...p, ...data } : p)
      })),

      deletePastPerformance: (id) => set(s => ({
        pastPerformances: s.pastPerformances.filter(p => p.id !== id)
      })),

      // ── Subk Database ───────────────────────────────────────────────
      addSubkDatabaseEntry: (entry) => set(s => ({
        subkDatabase: [{
          ...entry,
          id: `skdb${Date.now()}`,
          createdAt: new Date().toISOString(),
        }, ...s.subkDatabase]
      })),

      updateSubkDatabaseEntry: (id, data) => set(s => ({
        subkDatabase: s.subkDatabase.map(e => e.id === id ? { ...e, ...data } : e)
      })),

      deleteSubkDatabaseEntry: (id) => set(s => ({
        subkDatabase: s.subkDatabase.filter(e => e.id !== id)
      })),

      // ── BD Submissions ──────────────────────────────────────────────
      updateBDSubmission: (id, status) => {
        set(s => ({
          bdSubmissions: s.bdSubmissions.map(b => b.id === id ? { ...b, status } : b)
        }))
        const updated = get().bdSubmissions.find(b => b.id === id)
        if (updated) {
          upsertBDSubmission(updated)
          const opp = get().opportunities.find(o => o.solicitationId === updated.solicitationId)
          if (opp) {
            const opportunityStatus = bdStatusToOpportunityStatus(status)
            set(s => ({
              opportunities: s.opportunities.map(o =>
                o.id === opp.id ? { ...o, status: opportunityStatus } : o
              )
            }))
            const updatedOpp = get().opportunities.find(o => o.id === opp.id)
            if (updatedOpp) upsertOpportunity(updatedOpp)
            if (status === 'AWARDED') get().markOpportunityWon(opp.id)
          }
        }
      },

      updateBDSubmissionDetails: (id, data) => {
        set(s => ({
          bdSubmissions: s.bdSubmissions.map(b => b.id === id ? { ...b, ...data } : b)
        }))
        const updated = get().bdSubmissions.find(b => b.id === id)
        if (updated) upsertBDSubmission(updated)
      },

      deleteBDSubmission: (id) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'opportunity:deleteApprove')) {
          toast.error('Only the Capture Manager can delete submitted opportunities.')
          return
        }
        const submission = get().bdSubmissions.find(row => row.id === id)
        if (!submission) return

        const linkedOpp = get().opportunities.find(opp => opp.solicitationId === submission.solicitationId)
        set(s => ({
          bdSubmissions: s.bdSubmissions.filter(row => row.id !== id),
          opportunities: linkedOpp
            ? s.opportunities.filter(opp => opp.id !== linkedOpp.id)
            : s.opportunities,
          nonSubReports: linkedOpp
            ? s.nonSubReports.filter(report => report.opportunityId !== linkedOpp.id)
            : s.nonSubReports,
          deletionRequests: linkedOpp
            ? s.deletionRequests.filter(request => request.opportunityId !== linkedOpp.id)
            : s.deletionRequests,
        }))

        deleteBDSubmissionRecord(id)
        if (linkedOpp) deleteOpportunityRecord(linkedOpp.id)
        get().logActivity({
          action: `Deleted submitted opportunity: ${submission.solicitation}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'opportunity',
          entityId: linkedOpp?.id || String(id),
          entityName: submission.solicitation,
        })
      },

      returnBDSubmissionToPipeline: (id) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'opportunity:edit')) {
          toast.error('Only the Capture Manager can move submitted opportunities back to the pipeline.')
          return
        }
        const submission = get().bdSubmissions.find(row => row.id === id)
        if (!submission) return
        const linkedOpp = get().opportunities.find(opp => opp.solicitationId === submission.solicitationId)
        if (!linkedOpp) {
          toast.error('The original opportunity could not be found.')
          return
        }

        const restored = normalizeOpportunityAssignmentStatus({
          ...linkedOpp,
          status: 'ACTIVE',
          submittedAt: undefined,
          nonSubmissionReportId: undefined,
        }, get().employees)

        set(s => ({
          opportunities: s.opportunities.map(opp => opp.id === restored.id ? restored : opp),
          bdSubmissions: s.bdSubmissions.filter(row => row.id !== id),
        }))

        upsertOpportunity(restored).then(saved => {
          if (!saved) showDatabaseSaveError('Opportunity update')
        })
        deleteBDSubmissionRecord(id)
        get().logActivity({
          action: `Moved submitted opportunity back to General Pipeline: ${submission.solicitation}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'opportunity',
          entityId: restored.id,
          entityName: submission.solicitation,
        })
      },

      // ── Activity Logs ───────────────────────────────────────────────
      logActivity: (entry) => set(s => ({
        activityLogs: [{
          ...entry,
          id: `al${Date.now()}`,
          createdAt: new Date().toISOString(),
        }, ...s.activityLogs]
      })),

      // ── Non-submission reports ──────────────────────────────────────
      submitNonSubReport: (data) => {
        if (!hasPermission(get().currentUser, 'nonSubmission:submit')) {
          toast.error('You do not have permission to submit non-submission reports.')
          return
        }
        const report: NonSubmissionReport = {
          ...data,
          id: `nsr${Date.now()}`,
          status: 'PENDING',
          submittedAt: new Date().toISOString(),
        }
        set(s => ({ nonSubReports: [report, ...s.nonSubReports] }))
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === data.opportunityId ? { ...o, nonSubmissionReportId: report.id } : o
          )
        }))
        upsertNonSubReport(report)
        const updatedOpp = get().opportunities.find(o => o.id === data.opportunityId)
        if (updatedOpp) upsertOpportunity(updatedOpp)
        get().addNotification({
          type: 'NON_SUB_REVIEW',
          title: 'Non-submission report pending',
          message: `A non-submission report has been submitted for review.`,
          read: false,
          relatedId: data.opportunityId,
          targetRole: 'CAPTURE_MANAGER',
        })
      },

      reviewNonSubReport: (id, action, reviewNote, reviewedBy) => {
        if (!hasPermission(get().currentUser, 'nonSubmission:review')) {
          toast.error('Only the Capture Manager can approve or decline non-submission reports.')
          return
        }
        set(s => ({
          nonSubReports: s.nonSubReports.map(r =>
            r.id === id
              ? { ...r, status: action, reviewedBy, reviewedAt: new Date().toISOString(), reviewNote }
              : r
          )
        }))
        const report = get().nonSubReports.find(r => r.id === id)
        if (report) {
          upsertNonSubReport(report)
          const newStatus: Opportunity['status'] = action === 'APPROVED' ? 'NOT_SUBMITTED' : 'DROPPED'
          const trackerStatus: BDSubmission['status'] = action === 'APPROVED' ? 'NOT_SUBMITTED' : 'DROPPED'
          set(s => ({
            opportunities: s.opportunities.map(o =>
              o.id === report.opportunityId ? { ...o, status: newStatus } : o
            )
          }))
          const updatedOpp = get().opportunities.find(o => o.id === report.opportunityId)
          if (updatedOpp) {
            const existing = get().bdSubmissions.find(b => b.solicitationId === updatedOpp.solicitationId)
            const trackerRow = bdSubmissionFromOpportunity(updatedOpp, trackerStatus, existing, reviewNote || report.reason)
            set(s => ({
              bdSubmissions: existing
                ? s.bdSubmissions.map(b => b.id === existing.id ? trackerRow : b)
                : [trackerRow, ...s.bdSubmissions],
            }))
            upsertBDSubmission(trackerRow)
            upsertOpportunity(updatedOpp)
          }
        }
      },

      // ── Deletion requests ───────────────────────────────────────────
      requestDeletion: (opportunityId, requestedBy, reason) => {
        if (!hasPermission(get().currentUser, 'opportunity:deleteRequest')) {
          toast.error('You do not have permission to request opportunity deletion.')
          return
        }
        const req: DeletionRequest = {
          id: `dr${Date.now()}`,
          opportunityId,
          requestedBy,
          reason,
          status: 'PENDING',
          requestedAt: new Date().toISOString(),
        }
        set(s => ({
          deletionRequests: [req, ...s.deletionRequests],
          opportunities: s.opportunities.map(o =>
            o.id === opportunityId ? { ...o, deletionRequested: true } : o
          )
        }))
        upsertDeletionRequest(req)
        const markedOpp = get().opportunities.find(o => o.id === opportunityId)
        if (markedOpp) upsertOpportunity(markedOpp)
        get().addNotification({
          type: 'DELETION_REQUEST',
          title: 'Deletion request submitted',
          message: `A deletion request has been submitted and is awaiting admin approval.`,
          read: false,
          relatedId: opportunityId,
          targetRole: 'CAPTURE_MANAGER',
        })
      },

      reviewDeletionRequest: (id, action, reviewedBy) => {
        if (!hasPermission(get().currentUser, 'opportunity:deleteApprove')) {
          toast.error('Only the Capture Manager can approve deletion requests.')
          return
        }
        set(s => ({
          deletionRequests: s.deletionRequests.map(r =>
            r.id === id
              ? { ...r, status: action, reviewedBy, reviewedAt: new Date().toISOString() }
              : r
          )
        }))
        const req = get().deletionRequests.find(r => r.id === id)
        if (req) upsertDeletionRequest(req)
        if (req && action === 'APPROVED') {
          const deletedSubmissionId = get().opportunities.find(o => o.id === req.opportunityId)?.solicitationId
          set(s => ({
            opportunities: s.opportunities.map(o =>
              o.id === req.opportunityId
                ? { ...o, isDeleted: true, deletionRequested: false }
                : o
            ),
            bdSubmissions: deletedSubmissionId
              ? s.bdSubmissions.filter(b => b.solicitationId !== deletedSubmissionId)
              : s.bdSubmissions,
          }))
          const deletedOpp = get().opportunities.find(o => o.id === req.opportunityId)
          if (deletedOpp) upsertOpportunity(deletedOpp)
        } else if (req && action === 'DECLINED') {
          set(s => ({
            opportunities: s.opportunities.map(o =>
              o.id === req.opportunityId ? { ...o, deletionRequested: false } : o
            )
          }))
          const reinstatedOpp = get().opportunities.find(o => o.id === req.opportunityId)
          if (reinstatedOpp) upsertOpportunity(reinstatedOpp)
        }
      },

      // ── Notifications ───────────────────────────────────────────────
      markNotificationRead: (id) => set(s => ({
        notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n)
      })),

      markAllRead: () => set(s => ({
        notifications: s.notifications.map(n => ({ ...n, read: true }))
      })),

      addNotification: (data) => set(s => ({
        notifications: [{
          ...data,
          id: `n${Date.now()}`,
          createdAt: new Date().toISOString(),
        }, ...s.notifications]
      })),

      // ── Employee assignment ─────────────────────────────────────────
      assignOpportunityToEmployee: (opportunityId, employeeId) => {
        if (!hasPermission(get().currentUser, 'opportunity:assign')) {
          toast.error('You do not have permission to assign opportunities.')
          return
        }
        const target = get().employees.find(e => e.id === employeeId)
        if (!employeeBelongsToTeam(target, 'BD')) {
          toast.error('Opportunities can only be assigned to Business Development users.')
          return
        }
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === opportunityId
              ? normalizeOpportunityAssignmentStatus({ ...o, assignedTo: employeeId }, s.employees)
              : o
          )
        }))
        const emp = target
        const opp = get().opportunities.find(o => o.id === opportunityId)
        if (opp) persistAssignedOpportunity(opp, get().employees, 'Opportunity assignment')
        if (emp && opp) {
          get().addNotification({
            type: 'ASSIGNMENT',
            title: 'Opportunity assigned',
            message: `${opp.solicitation} assigned to ${emp.name}.`,
            read: false,
            relatedId: opportunityId,
          })
        }
      },

      assignContractToEmployee: (contractId, employeeId) => {
        const target = get().employees.find(e => e.id === employeeId)
        if (!employeeBelongsToTeam(target, 'OPS')) {
          toast.error('Contracts can only be assigned to Operations users.')
          return
        }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId ? { ...c, assignedTo: employeeId } : c
          )
        }))
        const emp = target
        const contract = get().contracts.find(c => c.id === contractId)
        if (contract) persistAssignedContract(contract, get().employees, 'Contract assignment')
        if (emp && contract) {
          get().addNotification({
            type: 'ASSIGNMENT',
            title: 'Contract assigned',
            message: `${contract.title} assigned to ${emp.name}.`,
            read: false,
            relatedId: contractId,
          })
        }
      },

      // ── DB ──────────────────────────────────────────────────────────
      initializeStore: async () => {
        if (!isSupabaseConnected) return
        if (get().dbReady) return

        try {
          await seedEmployeesIfEmpty(syncEmployeesWithUsers(get().users, []))

          // seedIfEmpty is now a no-op (all mock arrays are empty)
          await seedIfEmpty({
            opportunities: MOCK_OPPORTUNITIES,
            contracts: MOCK_CONTRACTS,
            freshAwards: MOCK_FRESH_AWARDS,
            pastPerformances: MOCK_PAST_PERFORMANCES,
          })

          const data = await loadAllData()
          if (data) {
            const canceledOpportunities = data.opportunities.filter(o => o.status === 'CANCELED')
            const canceledIds = new Set(canceledOpportunities.map(o => o.id))
            const bdSubmissions = [...data.bdSubmissions]

            canceledOpportunities.forEach(opp => {
              const existing = bdSubmissions.find(b => b.solicitationId === opp.solicitationId)
              const trackerRow = bdSubmissionFromOpportunity(opp, 'CANCELED', existing, 'Canceled')
              if (existing) {
                const idx = bdSubmissions.findIndex(b => b.id === existing.id)
                bdSubmissions[idx] = trackerRow
              } else {
                bdSubmissions.unshift(trackerRow)
              }
              upsertBDSubmission(trackerRow)
              deleteOpportunityRecord(opp.id)
            })

            set({
              employees: syncEmployeesWithUsers(
                get().users,
                data.employees.length > 0 ? data.employees : get().employees,
              ),
              opportunities: data.opportunities.filter(o => o.status !== 'CANCELED'),
              contracts: data.contracts,
              freshAwards: data.freshAwards,
              pastPerformances: data.pastPerformances,
              subcontractors: data.subcontractors,
              nonSubReports: data.nonSubReports.filter(r => !canceledIds.has(r.opportunityId)),
              deletionRequests: data.deletionRequests.filter(r => !canceledIds.has(r.opportunityId)),
              bdSubmissions,
              nextInvoiceNumber: Math.max(
                Math.max(1, Math.trunc(Number(get().nextInvoiceNumber) || 1)),
                nextInvoiceSequenceFromContracts(data.contracts),
              ),
              dbReady: true,
            })
          }
        } catch (err) {
          console.error('[Store] Supabase init failed, using local data', err)
          set({ dbReady: true })
        }
      },

      // ── UI ──────────────────────────────────────────────────────────
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      updateNonSubGracePeriod: (hours, minutes) => set({
        nonSubGraceHours: Math.max(0, Math.trunc(Number(hours) || 0)),
        nonSubGraceMinutes: Math.max(0, Math.trunc(Number(minutes) || 0)),
      }),
      consumeInvoiceNumber: () => {
        const current = Math.max(1, Math.trunc(Number(get().nextInvoiceNumber) || 1))
        set({ nextInvoiceNumber: current + 1 })
        return current
      },
      setPref: (key, value) => set(s => ({ prefs: { ...s.prefs, [key]: value } })),
    }),
    {
      name: 'ces-crm-store',
      // v15: refresh seeded department users to the Moroccan BD/OPS hierarchy.
      // v14: first forced refresh of seeded department users.
      // v13: assignment employees are derived strictly from active users so
      // deleted/inactive users disappear from assignment pickers.
      version: 15,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const s = persistedState as Record<string, unknown>
        if (fromVersion < 4) {
          return {
            ...s,
            currentUser:     null,
            isAuthenticated: false,
            needsFirstLogin: false,
            needsMFASetup:   false,
            loginTimestamp:  null,
            accessNoticeAccepted: false,
            users:           MOCK_USERS,
            employees:       syncEmployeesWithUsers(MOCK_USERS, []),
            opportunities:   [],
            contracts:       [],
            freshAwards:     [],
            pastPerformances:[],
            nonSubReports:   [],
            deletionRequests:[],
            subcontractors:  [],
            bdSubmissions:   [],
            notifications:   [],
            activityLogs:    [],
            subkDatabase:    [],
            companyCertifications: [],
            employeeRequests: [],
            needsPurge:      false,
            dbReady:         false,
            nonSubGraceHours: 0,
            nonSubGraceMinutes: 5,
            nextInvoiceNumber: 1,
            prefs:           { notificationSound: true },
          }
        }
        const nextUsers = mergeSeedUsers(s.users, fromVersion < 15)
        const normalizedCurrentUser = normalizePersistedUserRole(s.currentUser) as User | null
        const nextCurrentUser = normalizedCurrentUser
          ? nextUsers.find(user =>
              user.id === normalizedCurrentUser.id ||
              user.email.toLowerCase() === normalizedCurrentUser.email.toLowerCase()
            ) ?? normalizedCurrentUser
          : null
        return {
          ...s,
          currentUser: nextCurrentUser,
          users: nextUsers,
          employees: syncEmployeesWithUsers(nextUsers, []),
          accessNoticeAccepted: Boolean(s.accessNoticeAccepted),
          nonSubGraceHours: Number(s.nonSubGraceHours ?? 0),
          nonSubGraceMinutes: Number(s.nonSubGraceMinutes ?? 5),
          nextInvoiceNumber: Math.max(1, Math.trunc(Number(s.nextInvoiceNumber) || 1)),
          companyCertifications: Array.isArray(s.companyCertifications) ? s.companyCertifications : [],
          employeeRequests: Array.isArray(s.employeeRequests) ? s.employeeRequests : [],
          prefs: {
            notificationSound: (s.prefs as Record<string, unknown> | undefined)?.notificationSound !== false,
          },
          needsPurge: false,
          dbReady: false,
        }
      },
      // Persist all business data so changes survive logout/refresh
      // (Supabase sync overrides this when connected; localStorage is the fallback)
      partialize: s => ({
        currentUser:       s.currentUser,
        isAuthenticated:  s.isAuthenticated,
        needsFirstLogin:  s.needsFirstLogin,
        needsMFASetup:    s.needsMFASetup,
        loginTimestamp:   s.loginTimestamp,
        accessNoticeAccepted: s.accessNoticeAccepted,
        sidebarCollapsed:  s.sidebarCollapsed,
        nonSubGraceHours:  s.nonSubGraceHours,
        nonSubGraceMinutes: s.nonSubGraceMinutes,
        nextInvoiceNumber: s.nextInvoiceNumber,
        opportunities:     s.opportunities,
        contracts:         s.contracts,
        freshAwards:       s.freshAwards,
        pastPerformances:  s.pastPerformances,
        nonSubReports:     s.nonSubReports,
        deletionRequests:  s.deletionRequests,
        subcontractors:    s.subcontractors,
        bdSubmissions:     s.bdSubmissions,
        users:             s.users,
        employees:         s.employees,
        activityLogs:      s.activityLogs,
        subkDatabase:      s.subkDatabase,
        companyCertifications: s.companyCertifications,
        employeeRequests:  s.employeeRequests,
        notifications:     s.notifications,
        prefs:             s.prefs,
        needsPurge:        false,
        dbReady:           false,
      }),
    }
  )
)
