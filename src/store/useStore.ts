import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import toast from 'react-hot-toast'
import type { Session } from '@supabase/supabase-js'
import type {
  User, Opportunity, Contract, Notification, Subcontractor,
  NonSubmissionReport, DeletionRequest, FreshAward,
  PastPerformance, SubkDatabaseEntry, ActivityLog,
  ContractPoC, LockedSubcontractor, GovernmentWarning, Employee,
  BDSubmission, FileAttachment, CompanyCertification, EmployeeRequest,
  CompanyCertificationStatus, EmployeeRequestStatus,
  ContractLineItem, ContractInvoice, ContractVehicleOrder, UserPreferences, EmployeeTeam,
  ContractStatus, Role,
  Goal, Comment,
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
  bulkDeleteFromTable,
  fetchPermissionOverrides,
  saveRolePermissionOverride,
  saveUserPermissionOverride,
  clearAllPermissionOverrides,
  fetchAppSettings,
  saveAppSetting,
  fetchNotifications,
  upsertNotification,
  fetchActivityLogs,
  upsertActivityLog,
  fetchEmployeeRequests,
  upsertEmployeeRequest,
} from '../lib/db'
import { getAssignmentChain, isAssignedToAssociate, findUserForEmployee } from '../lib/team'
import { hasPermission, applyPermissionOverrides, type Permission } from '../lib/permissions'
import { nextInvoiceSequenceFromContracts } from '../lib/invoiceNumbers'
import { hasSourcingQuote } from '../lib/subcontractorQuotes'
import {
  authenticateWithPassword,
  completeSupabaseFirstLogin,
  revalidateAuthenticatedProfile,
  restoreAuthenticatedProfile,
  sessionStartedAt,
  signOutCurrentSession,
  type ResilientAuthEvent,
} from '../lib/auth'
import { invokeManageUsers } from '../lib/userManagement'
import { mergeSafeUser, toSafeUser } from '../lib/userProfile'

interface AppState {
  // Auth
  currentUser: User | null
  authInitialized: boolean
  isAuthenticated: boolean
  needsFirstLogin: boolean
  loginTimestamp: number | null
  accessNoticeAccepted: boolean
  // MFA gate state — populated after password check, cleared once the user
  // verifies a TOTP / recovery code (or when they cancel back to the login
  // screen). While set, `isAuthenticated` is still false and route guards
  // redirect to /mfa-verify or /mfa-enroll based on `pendingMfaMode`.
  pendingMfaUserId: string | null
  pendingMfaMode: 'verify' | 'enroll' | null

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
  goals: Goal[]

  // Per-user session metadata (browser-local; not synced to Supabase).
  // Tracks last login per user account so admins can spot dormant accounts.
  userSessions: Record<string, { lastLoginAt?: string }>

  // Wall-clock of the last successful initializeStore/syncUsersFromDb run.
  // Surfaced in the Admin System Health card. null = never synced this session.
  lastSyncedAt: number | null

  // ── Permission overrides ─────────────────────────────────────────
  // Edited from the Admin → Permissions matrix UI. Each is optional:
  // - rolePermissionOverrides[role]:        when present, fully replaces the
  //   built-in PERMISSIONS_BY_ROLE[role] permission list for that role.
  // - userPermissionGrants[userId]:         extra permissions granted to a
  //   specific user on top of their role.
  // - userPermissionRevokes[userId]:        permissions removed from that
  //   specific user (even if their role normally has them).
  // The store subscribes to itself and pushes these into permissions.ts so
  // hasPermission() picks up changes without an extra prop drill.
  rolePermissionOverrides: Partial<Record<Role, Permission[]>>
  userPermissionGrants: Record<string, Permission[]>
  userPermissionRevokes: Record<string, Permission[]>
  // 'synced' = pushed to Supabase, 'local' = only in localStorage,
  // 'unknown' = haven't tried yet this session.
  permissionOverridesSyncStatus: 'synced' | 'local' | 'unknown'

  // App settings (integration keys, etc.) stored in the app_settings table
  // when migration 025 is applied. Falls back to Vite env vars for the
  // baked-in defaults. Edited from Admin → Integrations.
  appSettings: Record<string, string>
  appSettingsSyncStatus: 'synced' | 'local' | 'unknown'

  // UI
  sidebarCollapsed: boolean
  nonSubGraceHours: number
  nonSubGraceMinutes: number
  // Mode A (true, default) requires an Associate before an opportunity becomes ACTIVE.
  // Mode B (false) lets a Manager/TL carry an opportunity into ACTIVE on their own.
  requireAssociateForActivePipeline: boolean
  nextInvoiceNumber: number   // global running sequence for generated contract invoices
  prefs: UserPreferences
  // Watermark for once-per-day goal progress notifications (YYYY-MM-DD).
  goalProgressLastNotifiedAt?: string

  // ── Auth actions ───────────────────────────────────────────────────
  login: (email: string, password: string) => Promise<{
    ok: boolean
    error?: string
    needsFirst?: boolean
    needsMfaEnroll?: boolean
    needsMfaVerify?: boolean
  }>
  restoreAuthSession: () => Promise<void>
  handleAuthSessionEvent: (event: ResilientAuthEvent, session: Session | null) => Promise<void>
  logout: () => Promise<void>
  acceptAccessNotice: () => void
  // Returns false when the Supabase write fails so callers can stay on
  // the page and let the user retry instead of advancing with unsaved auth
  // progress. Local-only / offline mode resolves true immediately.
  // The returned flag tells the caller whether it should now navigate to
  // /mfa-enroll (true when the user has no TOTP secret yet) or straight to
  // /access-notice (false).
  completeFirstLogin: (password: string) => Promise<{ ok: boolean; needsMfaEnroll?: boolean }>

  // ── MFA actions ────────────────────────────────────────────────────
  // Verify a 6-digit TOTP code against the pending user's stored secret.
  // On success, clears the pending gate and marks the session authenticated.
  verifyMfaCode: (code: string) => { ok: boolean; error?: string }
  // Consume a one-time recovery code. On success the code is removed from
  // the user's list, persisted, and the session becomes authenticated.
  useRecoveryCode: (code: string) => Promise<{ ok: boolean; error?: string }>
  // Commit a fresh enrollment. The page has already generated + verified the
  // secret and shown the plaintext recovery codes to the user; the store
  // hashes the codes before persisting and marks the session authenticated.
  completeMfaEnrollment: (secret: string, plaintextRecoveryCodes: string[]) => Promise<{ ok: boolean; error?: string }>
  // Abandon the pending gate and return to a clean logged-out state.
  cancelPendingMfa: () => void
  // Admin action (requires admin:manageUsers): disable MFA on a user so
  // they'll be routed to /mfa-enroll on their next login.
  adminResetMfa: (userId: string) => Promise<boolean>

  // ── User management ────────────────────────────────────────────────
  createUser: (u: Omit<User, 'id' | 'createdAt'> & { password: string }) => Promise<boolean>
  updateUser: (id: string, data: Partial<User>) => Promise<boolean>
  resetUserPassword: (id: string, password: string) => Promise<boolean>
  deleteUser: (id: string) => Promise<boolean>
  addCompanyCertification: (data: Omit<CompanyCertification, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'status'> & { status?: CompanyCertificationStatus }) => void
  updateCompanyCertification: (id: string, data: Partial<CompanyCertification>) => void
  deleteCompanyCertification: (id: string) => void
  submitEmployeeRequest: (data: Omit<EmployeeRequest, 'id' | 'requesterId' | 'requesterName' | 'requesterEmail' | 'status' | 'submittedAt'>) => void
  reviewEmployeeRequest: (id: string, status: EmployeeRequestStatus, reviewNote?: string) => void
  updateEmployeeRequest: (id: string, data: Partial<EmployeeRequest>) => void
  deleteEmployeeRequest: (id: string) => void

  // ── Goals (Capture Manager) ────────────────────────────────────────
  createGoal: (data: Omit<Goal, 'id' | 'createdAt' | 'createdBy'>) => void
  updateGoal: (id: string, data: Partial<Omit<Goal, 'id' | 'createdAt' | 'createdBy'>>) => void
  deleteGoal: (id: string) => void

  // ── Opportunity management ─────────────────────────────────────────
  createOpportunity: (o: Omit<Opportunity, 'id'>) => Promise<boolean>
  updateOpportunity: (id: string, data: Partial<Opportunity>) => Promise<boolean>
  assignOpportunity: (id: string, bdm: string, bds: string) => void
  submitOpportunity: (id: string, values?: { contractAmount?: number; baseAmount?: number; monthlyPayment?: number; proposals?: string[]; assignedOpportunities?: string[]; proposalAttachments?: FileAttachment[] }) => void
  markOpportunityWon: (id: string) => void
  moveOpportunityToBDTracker: (id: string, status: BDSubmission['status'], comment?: string) => void
  syncDueOpportunities: () => void
  reconcileNonSubReports: () => void
  scanDeadlineReminders: () => void
  scanNonSubReminders: () => void
  scanGoalProgress: () => void
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
  returnNonSubmissionToPipeline: (reportId: string) => void
  updateNonSubReportReason: (reportId: string, reason: string) => void
  addNonSubReportComment: (reportId: string, text: string) => void

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
  setRequireAssociateForActivePipeline: (value: boolean) => void
  setAppSetting: (key: string, value: string) => Promise<{ ok: boolean; missingTable: boolean }>
  consumeInvoiceNumber: () => number
  setPref: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void

  // ── Permission editor ──────────────────────────────────────────────
  setRolePermissions: (role: Role, permissions: Permission[]) => Promise<void>
  resetRolePermissions: (role: Role) => Promise<void>
  setUserPermissionGrant: (userId: string, permission: Permission, granted: boolean) => Promise<void>
  setUserPermissionRevoke: (userId: string, permission: Permission, revoked: boolean) => Promise<void>
  resetUserPermissions: (userId: string) => Promise<void>
  resetAllPermissionOverrides: () => Promise<void>

  // ── DB ─────────────────────────────────────────────────────────────
  dbReady: boolean
  needsPurge: boolean
  initializeStore: () => Promise<void>
  syncUsersFromDb: () => Promise<void>
  refreshFromDb: () => Promise<void>

  // ── Admin bulk operations (destructive) ────────────────────────────
  wipeOpportunities: () => Promise<number>
  wipeContracts: (clientFilter?: string) => Promise<number>
  wipeFreshAwards: () => Promise<number>
  wipePastPerformances: () => Promise<number>
  wipeSubcontractors: () => Promise<number>
  wipeSubkDatabase: () => Promise<number>
  wipeBDSubmissions: () => Promise<number>
  wipeNonSubReports: () => Promise<number>
  wipeDeletionRequests: () => Promise<number>
  wipeNotifications: () => Promise<number>
  wipeActivityLogs: () => Promise<number>
  wipeCompanyCertifications: () => Promise<number>
  wipeEmployeeRequests: () => Promise<number>
  resetBDPipeline: () => Promise<number>
  resetOperations: () => Promise<number>
  wipeNonAdminUsers: () => Promise<number>
  resetEntireWorkspace: () => Promise<number>

  // ── Workspace snapshot ─────────────────────────────────────────────
  exportSnapshot: () => SnapshotPayload
  importSnapshot: (payload: unknown) => { ok: boolean; error?: string; counts?: Record<string, number> }
}

export interface SnapshotPayload {
  version: 1
  exportedAt: string
  exportedBy: string | null
  data: {
    users: User[]
    employees: Employee[]
    opportunities: Opportunity[]
    contracts: Contract[]
    freshAwards: FreshAward[]
    pastPerformances: PastPerformance[]
    subcontractors: Subcontractor[]
    subkDatabase: SubkDatabaseEntry[]
    bdSubmissions: BDSubmission[]
    nonSubReports: NonSubmissionReport[]
    deletionRequests: DeletionRequest[]
    notifications: Notification[]
    activityLogs: ActivityLog[]
    companyCertifications: CompanyCertification[]
    employeeRequests: EmployeeRequest[]
  }
  settings: {
    nonSubGraceHours: number
    nonSubGraceMinutes: number
    requireAssociateForActivePipeline: boolean
    nextInvoiceNumber: number
  }
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

function normalizeOpportunityAssignmentStatus(
  opp: Opportunity,
  employees: Employee[],
  requireAssociate: boolean,
): Opportunity {
  if (!PRE_SUBMISSION_STATUSES.includes(opp.status)) return opp
  // Mode A requires an Associate at the bottom of the chain; Mode B accepts any assignee.
  const readyForContractOpportunities = requireAssociate
    ? isAssignedToAssociate(employees, opp.assignedTo)
    : !!opp.assignedTo

  if (readyForContractOpportunities && opp.status === 'NEW_ASSIGNMENT') {
    return { ...opp, status: 'ACTIVE' }
  }

  if (!readyForContractOpportunities && opp.status === 'ACTIVE') {
    return { ...opp, status: 'NEW_ASSIGNMENT' }
  }

  return opp
}

// app_settings keys for the workspace-wide non-submission grace window.
// Persisted to Supabase (migration 025) so every user's sweep uses the same
// window; without this the setting lived only in each browser's localStorage,
// so any session still on the default fired reports early and the configured
// value looked ignored.
const NON_SUB_GRACE_HOURS_KEY = 'non_sub_grace_hours'
const NON_SUB_GRACE_MINUTES_KEY = 'non_sub_grace_minutes'

// Fixed 12-hour non-submission window. This used to be an admin-configurable
// grace period, but the variable timer produced early/duplicate reports, so it
// is now hard-coded: an assigned opportunity moves to Non-Submission Reports
// exactly 12 hours after its due datetime.
const NON_SUBMISSION_GRACE_MS = 12 * 60 * 60 * 1000

function deadlineTimeMs(opp: Opportunity): number | null {
  return opportunityDeadlineTimeMs(opp)
}

function isNonSubmissionGraceReached(opp: Opportunity, graceMs: number, now = new Date()): boolean {
  const deadlineMs = deadlineTimeMs(opp)
  return deadlineMs !== null && deadlineMs + Math.max(0, graceMs) <= now.getTime()
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
  employees: Employee[] = [],
): BDSubmission {
  const chain = getAssignmentChain(employees, opp.assignedTo)
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
    bdm: chain.manager?.name || opp.bdm || existing?.bdm || '',
    bds: chain.teamLead?.name || opp.bds || existing?.bds || '',
    supportAgent: chain.associate?.name || opp.supportAgent || existing?.supportAgent,
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

// Guards against overlapping refreshFromDb runs (poll + focus + realtime can all
// fire near-simultaneously). Overlaps are harmless but wasteful.
let refreshInFlight = false

// One non-submission report per opportunity is the invariant: an opportunity has
// a single due datetime, so it can miss submission only once. The auto-sweep and
// the live DB refresh can briefly race (a freshly created report is momentarily
// overwritten by a stale DB read), which previously let the sweep mint several
// rows for the same opportunity. Deterministic ids (nsr-<opportunityId>) make the
// DB upsert idempotent; this collapses any transient array duplicates so the UI
// never shows the same non-submission twice. Keeps the first occurrence.
function dedupeNonSubReports(reports: NonSubmissionReport[]): NonSubmissionReport[] {
  const seen = new Set<string>()
  const result: NonSubmissionReport[] = []
  for (const report of reports) {
    const key = report.opportunityId
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    result.push(report)
  }
  return result
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

function recordStoreActivity(
  get: () => AppState,
  action: string,
  entityType: ActivityLog['entityType'],
  entityId?: string,
  entityName?: string,
) {
  const actor = get().currentUser
  get().logActivity({
    action,
    user: actor?.name || 'System',
    userRole: actor?.role || 'CAPTURE_MANAGER',
    entityType,
    entityId,
    entityName,
  })
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

// ── 2FA feature flag ───────────────────────────────────────
// Two-factor auth is temporarily disabled. Flip this back to `true` to
// fully re-enable enrollment + verification — every MFA code path below
// remains intact and is simply gated on this flag.
// Legacy app-managed MFA remains disabled; Supabase Auth owns the session.

const AUTH_SESSION_META_KEY = 'ces-crm-auth-session-meta'

interface AuthSessionMeta {
  authUserId: string
  startedAt: number
  accessNoticeAccepted: boolean
}

function readAuthSessionMeta(authUserId?: string): AuthSessionMeta | null {
  if (!authUserId || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthSessionMeta>
    if (
      parsed.authUserId !== authUserId ||
      typeof parsed.startedAt !== 'number' ||
      !Number.isFinite(parsed.startedAt) ||
      parsed.startedAt <= 0
    ) return null
    return {
      authUserId,
      startedAt: parsed.startedAt,
      accessNoticeAccepted: parsed.accessNoticeAccepted === true,
    }
  } catch {
    return null
  }
}

function writeAuthSessionMeta(
  authUserId: string | undefined,
  startedAt: number,
  accessNoticeAccepted: boolean,
): void {
  if (!authUserId || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(AUTH_SESSION_META_KEY, JSON.stringify({
      authUserId,
      startedAt,
      accessNoticeAccepted,
    } satisfies AuthSessionMeta))
  } catch {
    // Auth remains valid when browser storage is unavailable; only the
    // reload-only notice convenience is lost.
  }
}

function clearAuthSessionMeta(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(AUTH_SESSION_META_KEY)
  } catch {
    // Nothing else is required to purge in-memory state.
  }
}

// Finalize a session after credentials + MFA both succeed. Clears the
// pending-MFA gate, marks the store authenticated, and stamps the
// per-user lastLoginAt watermark used by the Admin People screen.
function finalizeAuthenticatedSession(
  set: (partial: (state: AppState) => Partial<AppState>) => void,
  user: User,
  options: {
    startedAt?: number
    accessNoticeAccepted?: boolean
  } = {},
): void {
  const nowIso = new Date().toISOString()
  const profile = toSafeUser(user)
  const startedAt = options.startedAt && Number.isFinite(options.startedAt)
    ? options.startedAt
    : Date.now()
  const accessNoticeAccepted = options.accessNoticeAccepted === true
  writeAuthSessionMeta(profile.authUserId, startedAt, accessNoticeAccepted)
  set(s => ({
    currentUser: profile,
    users: mergeSafeUser(s.users, profile),
    authInitialized: true,
    isAuthenticated: true,
    needsFirstLogin: false,
    loginTimestamp: startedAt,
    accessNoticeAccepted,
    pendingMfaUserId: null,
    pendingMfaMode: null,
    userSessions: {
      ...s.userSessions,
      [user.id]: { ...(s.userSessions[user.id] ?? {}), lastLoginAt: nowIso },
    },
  }))
}

function clearedAuthState(): Partial<AppState> {
  return {
    currentUser: null,
    authInitialized: true,
    isAuthenticated: false,
    needsFirstLogin: false,
    loginTimestamp: null,
    dbReady: false,
    accessNoticeAccepted: false,
    pendingMfaUserId: null,
    pendingMfaMode: null,
    users: [],
    employees: [],
    opportunities: [],
    contracts: [],
    notifications: [],
    subcontractors: [],
    nonSubReports: [],
    deletionRequests: [],
    freshAwards: [],
    pastPerformances: [],
    subkDatabase: [],
    activityLogs: [],
    bdSubmissions: [],
    companyCertifications: [],
    employeeRequests: [],
    goals: [],
    userSessions: {},
    lastSyncedAt: null,
    rolePermissionOverrides: {},
    userPermissionGrants: {},
    userPermissionRevokes: {},
    permissionOverridesSyncStatus: 'unknown',
    appSettings: {},
    appSettingsSyncStatus: 'unknown',
    nonSubGraceHours: 0,
    nonSubGraceMinutes: 5,
    requireAssociateForActivePipeline: true,
    nextInvoiceNumber: 1,
    goalProgressLastNotifiedAt: undefined,
    needsPurge: false,
  }
}

function pendingFirstLoginState(
  user: User,
  startedAt: number,
  accessNoticeAccepted: boolean,
): Partial<AppState> {
  const profile = toSafeUser(user)
  writeAuthSessionMeta(profile.authUserId, startedAt, accessNoticeAccepted)
  return {
    ...clearedAuthState(),
    currentUser: profile,
    users: [profile],
    authInitialized: true,
    isAuthenticated: false,
    needsFirstLogin: true,
    loginTimestamp: startedAt,
    accessNoticeAccepted,
  }
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      authInitialized: false,
      isAuthenticated: false,
      needsFirstLogin: false,
      loginTimestamp: null,
      accessNoticeAccepted: false,
      pendingMfaUserId: null,
      pendingMfaMode: null,
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
      goals: [],
      sidebarCollapsed: false,
      nonSubGraceHours: 0,
      nonSubGraceMinutes: 5,
      requireAssociateForActivePipeline: true,
      nextInvoiceNumber: 1,
      prefs: { notificationSound: true },
      dbReady: false,
      needsPurge: false,
      userSessions: {},
      lastSyncedAt: null,
      rolePermissionOverrides: {},
      userPermissionGrants: {},
      userPermissionRevokes: {},
      permissionOverridesSyncStatus: 'unknown',
      appSettings: {},
      appSettingsSyncStatus: 'unknown',

      // ── Auth ────────────────────────────────────────────────────────
      login: async (email, password) => {
        const result = await authenticateWithPassword(email, password)
        if (!result.ok) {
          clearAuthSessionMeta()
          set({ ...clearedAuthState(), authInitialized: true })
          return result
        }
        // A password login always starts a new notice/session boundary, even
        // when the same account previously used this browser tab.
        clearAuthSessionMeta()
        const user = toSafeUser(result.profile)
        const startedAt = result.session
          ? sessionStartedAt(result.session, Date.now())
          : Date.now()
        // First-login password change still runs first — MFA enrollment
        // happens after the user has set their real password.
        if (user.firstLogin) {
          // A browser reused by another user must not retain any workspace,
          // settings, or permission data while this session is setup-only.
          set(pendingFirstLoginState(user, startedAt, false))
          return { ok: true, needsFirst: true }
        }
        finalizeAuthenticatedSession(set, user, {
          startedAt,
          accessNoticeAccepted: false,
        })
        return { ok: true }
      },

      restoreAuthSession: async () => {
        const result = await restoreAuthenticatedProfile()
        if (!result.profile) {
          // A transient profile outage must not destroy a valid in-memory
          // session. Initial page load has no safe profile to show, so it still
          // completes initialization in the logged-out shell and can recover on
          // a later Auth event.
          if (result.retryable && get().currentUser) return
          if (!result.retryable) clearAuthSessionMeta()
          set(clearedAuthState())
          return
        }
        const user = toSafeUser(result.profile)
        const current = get()
        const sameInMemorySession = current.currentUser?.authUserId === user.authUserId
        const stored = readAuthSessionMeta(user.authUserId)
        const fallbackStartedAt = sameInMemorySession && current.loginTimestamp
          ? current.loginTimestamp
          : stored?.startedAt ?? Date.now()
        const startedAt = result.session
          ? sessionStartedAt(result.session, fallbackStartedAt)
          : fallbackStartedAt
        const storedMatches = stored?.startedAt === startedAt
        const accessNoticeAccepted = (
          sameInMemorySession && current.accessNoticeAccepted
        ) || (
          storedMatches && stored?.accessNoticeAccepted === true
        )
        if (user.firstLogin) {
          set(pendingFirstLoginState(user, startedAt, accessNoticeAccepted))
          return
        }
        finalizeAuthenticatedSession(set, user, {
          startedAt,
          accessNoticeAccepted,
        })
      },

      handleAuthSessionEvent: async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          clearAuthSessionMeta()
          set(clearedAuthState())
          return
        }

        const state = get()
        if (!state.currentUser) {
          await state.restoreAuthSession()
          return
        }

        const result = await revalidateAuthenticatedProfile(
          state.currentUser.authUserId ?? session.user.id,
        )
        if (!result.ok) {
          if (result.retryable) return
          clearAuthSessionMeta()
          set(clearedAuthState())
          try {
            await signOutCurrentSession()
          } catch {
            // The in-memory purge is the security boundary; remote sign-out is
            // best effort when Auth has already invalidated the session.
          }
          return
        }

        const latest = get()
        if (
          !latest.currentUser ||
          latest.currentUser.id !== state.currentUser.id ||
          latest.loginTimestamp !== state.loginTimestamp
        ) return

        const profile = toSafeUser(result.profile)
        const startedAt = latest.loginTimestamp
          ?? sessionStartedAt(session, Date.now())
        if (profile.firstLogin) {
          set(pendingFirstLoginState(
            profile,
            startedAt,
            latest.accessNoticeAccepted,
          ))
          return
        }
        finalizeAuthenticatedSession(set, profile, {
          startedAt,
          accessNoticeAccepted: latest.accessNoticeAccepted,
        })
      },

      logout: async () => {
        try {
          await signOutCurrentSession()
        } finally {
          clearAuthSessionMeta()
          set(clearedAuthState())
        }
      },

      acceptAccessNotice: () => set(state => {
        if (state.currentUser && state.loginTimestamp) {
          writeAuthSessionMeta(
            state.currentUser.authUserId,
            state.loginTimestamp,
            true,
          )
        }
        return { accessNoticeAccepted: true }
      }),

      completeFirstLogin: async (password) => {
        const u = get().currentUser
        if (!u) return { ok: false }
        const result = await completeSupabaseFirstLogin(password)
        if (!result.ok) {
          toast.error(result.error)
          return { ok: false }
        }
        const state = get()
        if (!state.currentUser || state.currentUser.id !== u.id) return { ok: false }
        finalizeAuthenticatedSession(set, result.profile, {
          startedAt: state.loginTimestamp ?? Date.now(),
          accessNoticeAccepted: state.accessNoticeAccepted,
        })
        return { ok: true }
      },

      // ── MFA ─────────────────────────────────────────────────────────
      verifyMfaCode: (_code) => ({ ok: false, error: 'Legacy 2FA is disabled.' }),

      useRecoveryCode: async (_code) => ({ ok: false, error: 'Legacy 2FA is disabled.' }),

      completeMfaEnrollment: async (_secret, _plaintextRecoveryCodes) => ({
        ok: false,
        error: 'Legacy 2FA is disabled.',
      }),

      cancelPendingMfa: () => set({
        currentUser: null,
        isAuthenticated: false,
        needsFirstLogin: false,
        loginTimestamp: null,
        accessNoticeAccepted: false,
        pendingMfaUserId: null,
        pendingMfaMode: null,
      }),

      adminResetMfa: async (_userId) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'admin:manageUsers')) {
          toast.error('You do not have permission to reset 2FA.')
          return false
        }
        toast.error('Legacy 2FA is disabled.')
        return false
      },

      // ── User management ─────────────────────────────────────────────
      createUser: async (data) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'admin:manageUsers')) {
          toast.error('Only the Capture Manager can manage users.')
          return false
        }
        const result = await invokeManageUsers({
          action: 'create',
          user: {
            name: data.name,
            email: data.email,
            username: data.username,
            role: data.role,
            avatar: data.avatar,
            status: data.status,
            firstLogin: true,
            team: data.team,
            managerId: data.managerId,
            password: data.password,
          },
        })
        if (!result.ok || !result.user) {
          toast.error(result.ok ? 'The service returned no user profile.' : result.error)
          return false
        }
        const user = toSafeUser(result.user)
        set(s => ({
          users: mergeSafeUser(s.users, user),
          employees: syncEmployeesWithUsers(mergeSafeUser(s.users, user), s.employees),
        }))
        get().logActivity({
          action: `Created user: ${user.name} (${user.email}) as ${user.role}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'user',
          entityId: user.id,
          entityName: user.name,
        })
        return true
      },

      updateUser: async (id, data) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'admin:manageUsers')) {
          toast.error('Only the Capture Manager can manage users.')
          return false
        }
        const before = get().users.find(u => u.id === id)
        if (!before) return false
        const result = await invokeManageUsers({
          action: 'update',
          userId: id,
          updates: {
            name: data.name,
            email: data.email,
            username: data.username,
            role: data.role,
            avatar: data.avatar,
            status: data.status,
            team: data.team,
            managerId: data.managerId,
          },
        })
        if (!result.ok) {
          toast.error(result.error)
          return false
        }
        const after = toSafeUser(result.user ?? { ...before, ...data })
        set(s => {
          const nextUsers = mergeSafeUser(s.users, after)
          const currentUser = s.currentUser && s.currentUser.id === id
            ? after
            : s.currentUser
          return { users: nextUsers, employees: syncEmployeesWithUsers(nextUsers, s.employees), currentUser }
        })
        if (after) {
          const changes: string[] = []
          if (data.role && data.role !== before.role) changes.push(`role: ${before.role} → ${after.role}`)
          if (data.team !== undefined && data.team !== before.team) changes.push(`team: ${before.team ?? '-'} → ${after.team ?? '-'}`)
          if (data.managerId !== undefined && data.managerId !== before.managerId) changes.push('manager updated')
          if (data.status && data.status !== before.status) changes.push(`status: ${before.status} → ${after.status}`)
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
        return true
      },

      resetUserPassword: async (id, password) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'admin:manageUsers')) {
          toast.error('Only the Capture Manager can manage users.')
          return false
        }
        const target = get().users.find(user => user.id === id)
        if (!target || password.length < 8) return false
        const result = await invokeManageUsers({ action: 'reset-password', userId: id, password })
        if (!result.ok) {
          toast.error(result.error)
          return false
        }
        const updated = toSafeUser(result.user ?? { ...target, firstLogin: true })
        set(s => {
          const users = mergeSafeUser(s.users, updated)
          return { users, employees: syncEmployeesWithUsers(users, s.employees) }
        })
        get().logActivity({
          action: `Forced password reset for user: ${target.name}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'user',
          entityId: target.id,
          entityName: target.name,
        })
        return true
      },

      deleteUser: async (id) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'admin:manageUsers')) {
          toast.error('Only the Capture Manager can manage users.')
          return false
        }
        const target = get().users.find(u => u.id === id)
        if (!target || target.id === actor?.id) return false
        const result = await invokeManageUsers({ action: 'delete', userId: id })
        if (!result.ok) {
          toast.error(result.error)
          return false
        }
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
        return true
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

      // ── Goals (Capture Manager) ──────────────────────────────────────
      createGoal: (data) => {
        const user = get().currentUser
        if (!hasPermission(user, 'goals:manage')) {
          toast.error('Only the Capture Manager can set goals.')
          return
        }
        if (!data.targetId) {
          toast.error('Pick a team or employee for this goal.')
          return
        }
        if (!Number.isFinite(data.targetValue) || data.targetValue <= 0) {
          toast.error('Target value must be greater than zero.')
          return
        }
        const goal: Goal = {
          ...data,
          id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          createdAt: new Date().toISOString(),
          createdBy: user?.name ?? 'System',
        }
        set(s => ({ goals: [goal, ...s.goals] }))
        get().logActivity({
          action: `Set ${goal.scope} goal · ${goal.metric} → ${goal.targetValue} (${goal.monthKey})`,
          user: user?.name || 'System',
          userRole: user?.role || 'CAPTURE_MANAGER',
          entityType: 'goal',
          entityId: goal.id,
        })
      },

      updateGoal: (id, data) => {
        const user = get().currentUser
        if (!hasPermission(user, 'goals:manage')) {
          toast.error('Only the Capture Manager can edit goals.')
          return
        }
        set(s => ({
          goals: s.goals.map(g => (g.id === id
            ? { ...g, ...data, updatedAt: new Date().toISOString(), updatedBy: user?.name ?? 'System' }
            : g)),
        }))
      },

      deleteGoal: (id) => {
        const user = get().currentUser
        if (!hasPermission(user, 'goals:manage')) {
          toast.error('Only the Capture Manager can delete goals.')
          return
        }
        const goal = get().goals.find(g => g.id === id)
        set(s => ({ goals: s.goals.filter(g => g.id !== id) }))
        if (goal) {
          get().logActivity({
            action: `Removed ${goal.scope} goal · ${goal.metric}`,
            user: user?.name || 'System',
            userRole: user?.role || 'CAPTURE_MANAGER',
            entityType: 'goal',
            entityId: goal.id,
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
          requesterRole: user.role,
          status: 'PENDING',
          submittedAt: new Date().toISOString(),
        }
        set(s => ({ employeeRequests: [request, ...s.employeeRequests] }))
        // Promote to the shared table so the Capture Manager receives it in
        // their own session instead of it living only in this browser.
        if (isSupabaseConnected) void upsertEmployeeRequest(request)
        get().addNotification({
          type: 'SYSTEM',
          title: 'HR request submitted',
          message: `${user.name} submitted "${request.title}".`,
          read: false,
          relatedId: request.id,
          targetRole: 'CAPTURE_MANAGER',
        })
        recordStoreActivity(get, `Submitted HR request: ${request.title}`, 'hr', request.id, request.title)
      },

      reviewEmployeeRequest: (id, status, reviewNote = '') => {
        const user = get().currentUser
        if (!hasPermission(user, 'hr:reviewRequests')) {
          toast.error('Only the Capture Manager can review HR requests.')
          return
        }
        const existing = get().employeeRequests.find(r => r.id === id)
        if (!existing) return
        const updated: EmployeeRequest = {
          ...existing,
          status,
          reviewNote,
          reviewedAt: new Date().toISOString(),
          reviewedBy: user?.name || 'System',
        }
        set(s => ({
          employeeRequests: s.employeeRequests.map(request =>
            request.id === id ? updated : request
          )
        }))
        if (isSupabaseConnected) void upsertEmployeeRequest(updated)
        // Notify the associate who submitted it so the decision + reply show up
        // immediately in their own session (directed at that specific user).
        const decision =
          status === 'APPROVED' ? 'approved' :
          status === 'DECLINED' ? 'declined' :
          status === 'IN_REVIEW' ? 'moved to review' : String(status).toLowerCase()
        get().addNotification({
          type: 'SYSTEM',
          title: `HR request ${decision}`,
          message: reviewNote.trim()
            ? `Your request "${updated.title}" was ${decision}: ${reviewNote.trim()}`
            : `Your request "${updated.title}" was ${decision}.`,
          read: false,
          relatedId: updated.id,
          targetUserId: updated.requesterId,
        })
        recordStoreActivity(get, `Marked HR request "${updated.title}" as ${status.replace('_', ' ').toLowerCase()}`, 'hr', updated.id, updated.title)
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
        const updated = get().employeeRequests.find(r => r.id === id)
        if (updated) {
          if (isSupabaseConnected) void upsertEmployeeRequest(updated)
          recordStoreActivity(get, `Edited HR request: ${updated.title}`, 'hr', updated.id, updated.title)
        }
      },

      deleteEmployeeRequest: (id) => {
        const user = get().currentUser
        if (!hasPermission(user, 'hr:reviewRequests')) {
          toast.error('Only the Capture Manager can delete HR requests.')
          return
        }
        const request = get().employeeRequests.find(item => item.id === id)
        if (!request) return
        set(s => ({ employeeRequests: s.employeeRequests.filter(item => item.id !== id) }))
        void bulkDeleteFromTable('employee_requests', { column: 'id', value: id }).then(saved => {
          if (saved) return
          set(s => ({
            employeeRequests: s.employeeRequests.some(item => item.id === id)
              ? s.employeeRequests
              : [request, ...s.employeeRequests],
          }))
          showDatabaseSaveError('HR request deletion')
        })
        recordStoreActivity(get, `Deleted HR request: ${request.title}`, 'hr', request.id, request.title)
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

        const opp = normalizeOpportunityAssignmentStatus(
          { ...data, solicitationId, id: `o${Date.now()}` },
          get().employees,
          get().requireAssociateForActivePipeline,
        )
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
        const actor = get().currentUser
        if (data.status === 'CANCELED') {
          if (!hasPermission(actor, 'opportunity:cancel')) {
            toast.error('Only the Capture Manager can cancel opportunities.')
            return false
          }
          get().moveOpportunityToBDTracker(id, 'CANCELED', 'Canceled')
          return true
        }

        const changeKeys = Object.keys(data)
        const SCHEDULE_FIELDS = ['dueDate', 'localTime', 'timezone', 'moroccoTime', 'moroccoDate', 'mandatoryEventsList']
        const isCommentOnlyUpdate = changeKeys.length > 0 && changeKeys.every(key => key === 'comments')
        const isScheduleOrCommentUpdate = changeKeys.length > 0 && changeKeys.every(key =>
          SCHEDULE_FIELDS.includes(key) || key === 'comments'
        )
        const isQuotedOnlyUpdate = changeKeys.length > 0 && changeKeys.every(key => key === 'quoted')
        if (!hasPermission(actor, 'opportunity:edit')) {
          const canCommentOnly = isCommentOnlyUpdate && hasPermission(actor, 'opportunity:comment')
          const canScheduleEdit = isScheduleOrCommentUpdate && hasPermission(actor, 'opportunity:editSchedule')
          const canUpdateQuoted = isQuotedOnlyUpdate && hasPermission(actor, 'sourcing:write')
          if (!canCommentOnly && !canScheduleEdit && !canUpdateQuoted) {
            toast.error('You do not have permission to edit opportunity details.')
            return false
          }
        }

        const current = get().opportunities.find(o => o.id === id)
        if (!current) return false
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
            o.id === id
              ? normalizeOpportunityAssignmentStatus(
                  { ...o, ...data },
                  s.employees,
                  get().requireAssociateForActivePipeline,
                )
              : o
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

        const previousCommentIds = new Set((current.comments || []).map(comment => comment.id))
        const addedComments = (updated.comments || []).filter(comment => !previousCommentIds.has(comment.id))
        if (addedComments.length > 0) {
          get().logActivity({
            action: `Commented on opportunity: ${updated.solicitation}`,
            user: actor?.name || 'System',
            userRole: actor?.role || 'CAPTURE_MANAGER',
            entityType: 'opportunity',
            entityId: updated.id,
            entityName: updated.solicitation,
          })
          if (actor?.role === 'ASSOCIATE') {
            get().addNotification({
              type: 'STATUS_CHANGE',
              title: 'New opportunity comment',
              message: `${actor.name} commented on ${updated.solicitation}.`,
              read: false,
              relatedId: updated.id,
              targetRole: 'CAPTURE_MANAGER',
            })
          }
        }

        if (current.quoted !== updated.quoted) {
          get().logActivity({
            action: `${updated.quoted ? 'Marked' : 'Unmarked'} opportunity as quoted: ${updated.solicitation}`,
            user: actor?.name || 'System',
            userRole: actor?.role || 'CAPTURE_MANAGER',
            entityType: 'opportunity',
            entityId: updated.id,
            entityName: updated.solicitation,
          })
          if (updated.quoted) {
            get().addNotification({
              type: 'STATUS_CHANGE',
              title: 'Opportunity quoted',
              message: `${updated.solicitation} has been quoted.`,
              read: false,
              relatedId: updated.id,
              targetRole: 'CAPTURE_MANAGER',
            })
          }
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
          const trackerRow = bdSubmissionFromOpportunity(opp, 'SUBMITTED', existing, undefined, get().employees)
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
          const trackerRow = bdSubmissionFromOpportunity(opp, 'CANCELED', existing, comment, get().employees)
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
            relatedId: opp.solicitationId,
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
        const trackerRow = bdSubmissionFromOpportunity(updatedOpp, status, existing, comment, get().employees)
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
        const { requireAssociateForActivePipeline } = get()
        const reportedOpportunityIds = new Set(get().nonSubReports.map(report => report.opportunityId))
        // An opportunity that already sits in the BD Tracker (any tracker row,
        // e.g. "Discussion") has been acted on by the BD team, so it must never
        // be swept into Non-Submission Reports. Tracker rows link back to the
        // opportunity by solicitationId.
        const trackerSolicitationIds = new Set(
          get().bdSubmissions.map(row => row.solicitationId).filter(Boolean)
        )
        const reportableOpps = get().opportunities.filter(opp => {
          if (opp.isDeleted || !PRE_SUBMISSION_STATUSES.includes(opp.status) || opp.nonSubmissionReportId || opp.nonSubmissionExempt || reportedOpportunityIds.has(opp.id)) return false
          // Skip anything already tracked in the BD Tracker (incl. Discussion).
          if (opp.solicitationId && trackerSolicitationIds.has(opp.solicitationId)) return false
          // Mode A escalates only Associate-led opps; Mode B escalates any assigned opp.
          if (requireAssociateForActivePipeline) {
            if (!isAssignedToAssociate(get().employees, opp.assignedTo)) return false
          } else {
            if (!opp.assignedTo) return false
          }
          if (!isNonSubmissionGraceReached(opp, NON_SUBMISSION_GRACE_MS, now)) return false
          return true
        })

        if (reportableOpps.length === 0) return

        const reports = reportableOpps.map((opp): NonSubmissionReport => ({
          id: `nsr-${opp.id}`,
          opportunityId: opp.id,
          agentUsername: nonSubmissionAgentUsername(opp, get().employees, get().currentUser),
          reason: `No proposal submission was recorded within 12 hours after the due datetime.`,
          status: 'PENDING',
          submittedAt: now.toISOString(),
        }))

        set(s => ({
          nonSubReports: dedupeNonSubReports([...reports, ...s.nonSubReports]),
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
            message: `${updatedOpp?.solicitation ?? 'An opportunity'} passed the 12-hour non-submission window and moved to Non-Submission Reports.`,
            read: false,
            relatedId: report.opportunityId,
            targetRole: 'CAPTURE_MANAGER',
          })
        })
      },

      // Self-heal: drop still-PENDING auto-generated non-submission reports whose
      // opportunity has since moved into the BD Tracker (e.g. "Discussion") or was
      // archived to Past Performances — those were never real non-submissions.
      // Reviewed reports (APPROVED/DECLINED) are kept as the historical record,
      // even though the review itself creates a NOT_SUBMITTED/DROPPED tracker row.
      reconcileNonSubReports: () => {
        const oppById = new Map(get().opportunities.map(o => [o.id, o]))
        const trackerSolicitationIds = new Set(
          get().bdSubmissions.map(row => row.solicitationId).filter(Boolean)
        )
        const pastPerfOpportunityIds = new Set(
          get().pastPerformances.map(pp => pp.opportunityId).filter(Boolean)
        )

        const staleReports = get().nonSubReports.filter(report => {
          if (report.status !== 'PENDING') return false
          const opp = oppById.get(report.opportunityId)
          const inTracker = !!opp?.solicitationId && trackerSolicitationIds.has(opp.solicitationId)
          const inPastPerf = pastPerfOpportunityIds.has(report.opportunityId)
          return inTracker || inPastPerf
        })
        if (staleReports.length === 0) return

        const staleIds = new Set(staleReports.map(r => r.id))
        const clearedOppIds = new Set(staleReports.map(r => r.opportunityId))

        set(s => ({
          nonSubReports: s.nonSubReports.filter(r => !staleIds.has(r.id)),
          opportunities: s.opportunities.map(o =>
            clearedOppIds.has(o.id) && o.nonSubmissionReportId && staleIds.has(o.nonSubmissionReportId)
              ? { ...o, nonSubmissionReportId: undefined }
              : o
          ),
        }))

        staleReports.forEach(report => {
          void bulkDeleteFromTable('non_submission_reports', { column: 'id', value: report.id })
          const updatedOpp = get().opportunities.find(o => o.id === report.opportunityId)
          if (updatedOpp) upsertOpportunity(updatedOpp)
        })
      },

      scanDeadlineReminders: () => {
        const now = Date.now()
        const FOUR_H = 4 * 60 * 60 * 1000
        const TWENTY_FOUR_H = 24 * 60 * 60 * 1000
        const candidates = get().opportunities.filter(opp => {
          if (opp.isDeleted) return false
          if (!PRE_SUBMISSION_STATUSES.includes(opp.status)) return false
          if (opp.nonSubmissionReportId) return false
          const deadline = deadlineTimeMs(opp)
          if (deadline === null) return false
          const remaining = deadline - now
          if (remaining <= 0) return false
          const need24h = remaining <= TWENTY_FOUR_H && !opp.notifiedDue24h
          const need4h = remaining <= FOUR_H && !opp.notifiedDue4h
          return need24h || need4h
        })
        if (candidates.length === 0) return
        const updates = new Map<string, { due24h: boolean; due4h: boolean }>()
        candidates.forEach(opp => {
          const deadline = deadlineTimeMs(opp)!
          const remaining = deadline - now
          const fire24h = remaining <= TWENTY_FOUR_H && !opp.notifiedDue24h
          const fire4h = remaining <= FOUR_H && !opp.notifiedDue4h
          updates.set(opp.id, { due24h: fire24h, due4h: fire4h })
          if (fire4h) {
            get().addNotification({
              type: 'DEADLINE',
              title: 'Opportunity due in 4 hours',
              message: `${opp.solicitation} is due at ${new Date(deadline).toLocaleString()}.`,
              read: false,
              relatedId: opp.id,
            })
          } else if (fire24h) {
            get().addNotification({
              type: 'DEADLINE',
              title: 'Opportunity due in 24 hours',
              message: `${opp.solicitation} is due at ${new Date(deadline).toLocaleString()}.`,
              read: false,
              relatedId: opp.id,
            })
          }
        })
        set(s => ({
          opportunities: s.opportunities.map(o => {
            const u = updates.get(o.id)
            if (!u) return o
            return {
              ...o,
              notifiedDue24h: o.notifiedDue24h || u.due24h || u.due4h,
              notifiedDue4h: o.notifiedDue4h || u.due4h,
            }
          })
        }))
        updates.forEach((_, id) => {
          const updated = get().opportunities.find(o => o.id === id)
          if (updated) upsertOpportunity(updated)
        })
      },

      scanNonSubReminders: () => {
        const now = Date.now()
        const DAY_MS = 24 * 60 * 60 * 1000
        const dueReports = get().nonSubReports.filter(r => {
          if (r.status !== 'PENDING') return false
          const last = r.lastReminderAt ? new Date(r.lastReminderAt).getTime() : new Date(r.submittedAt).getTime()
          return now - last >= DAY_MS
        })
        if (dueReports.length === 0) return
        const stampIso = new Date(now).toISOString()
        const refreshed = dueReports.map(r => ({ ...r, lastReminderAt: stampIso }))
        set(s => ({
          nonSubReports: s.nonSubReports.map(r => {
            const match = refreshed.find(x => x.id === r.id)
            return match ?? r
          })
        }))
        refreshed.forEach(report => {
          upsertNonSubReport(report)
          const opp = get().opportunities.find(o => o.id === report.opportunityId)
          get().addNotification({
            type: 'REPORT_REMINDER',
            title: 'Non-submission report still pending',
            message: `${opp?.solicitation ?? 'A non-submission report'} is still awaiting review.`,
            read: false,
            relatedId: report.opportunityId,
            targetRole: 'CAPTURE_MANAGER',
          })
        })
      },

      scanGoalProgress: () => {
        const state = get()
        const user = state.currentUser
        if (!user) return
        const todayKey = todayLabel()
        if (state.goalProgressLastNotifiedAt === todayKey) return
        const emp = state.employees.find(e => e.email === user.email)
        const BD_GOALS: Record<string, number> = { BD_MANAGER: 20, TEAM_LEAD: 15, ASSOCIATE: 10 }
        const goal = emp ? (BD_GOALS[emp.role] ?? 0) : 0
        if (goal <= 0) {
          set({ goalProgressLastNotifiedAt: todayKey })
          return
        }
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        const monthEnd = new Date(monthStart)
        monthEnd.setMonth(monthEnd.getMonth() + 1)
        const submitted = state.opportunities.filter(o =>
          o.assignedTo === emp?.id
          && o.submittedAt
          && new Date(o.submittedAt) >= monthStart
          && new Date(o.submittedAt) < monthEnd
        ).length
        const pct = Math.min(100, Math.round((submitted / goal) * 100))
        const now = new Date()
        const remainingDays = Math.max(0, Math.ceil((monthEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        if (submitted >= goal) {
          get().addNotification({
            type: 'SYSTEM',
            title: 'Monthly goal achieved',
            message: `You hit ${submitted}/${goal} submissions this month. Nice work.`,
            read: false,
          })
        } else if (remainingDays <= 5 && pct < 80) {
          get().addNotification({
            type: 'SYSTEM',
            title: 'Monthly goal at risk',
            message: `You are at ${submitted}/${goal} submissions with ${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining (${pct}%).`,
            read: false,
          })
        }
        set({ goalProgressLastNotifiedAt: todayKey })
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
        recordStoreActivity(get, `Updated contract: ${updated.title}`, 'contract', updated.id, updated.title)
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
        const contract = get().contracts.find(c => c.id === contractId)
        recordStoreActivity(get, `Added contract point of contact: ${newPoC.name}`, 'contract', contractId, contract?.title)
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
        if (updated) {
          upsertContractPoC(updated)
          const contract = get().contracts.find(c => c.id === contractId)
          recordStoreActivity(get, `Updated contract point of contact: ${updated.name}`, 'contract', contractId, contract?.title)
        }
      },

      removeContractPoC: (contractId, pocId) => {
        const contract = get().contracts.find(c => c.id === contractId)
        const poc = contract?.pocs?.find(p => p.id === pocId)
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, pocs: (c.pocs || []).filter(p => p.id !== pocId) }
              : c
          )
        }))
        deleteContractPoC(pocId)
        recordStoreActivity(get, `Removed contract point of contact${poc?.name ? `: ${poc.name}` : ''}`, 'contract', contractId, contract?.title)
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
        const contract = get().contracts.find(c => c.id === contractId)
        recordStoreActivity(get, `Added invoice ${newInvoice.invoiceNumber}`, 'contract', contractId, contract?.title)
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
        if (updated) {
          upsertContractInvoice(updated)
          const contract = get().contracts.find(c => c.id === contractId)
          recordStoreActivity(get, `Updated invoice ${updated.invoiceNumber}`, 'contract', contractId, contract?.title)
        }
      },

      removeContractInvoice: (contractId, invoiceId) => {
        const contract = get().contracts.find(c => c.id === contractId)
        const invoice = contract?.invoices?.find(item => item.id === invoiceId)
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, invoices: (c.invoices || []).filter(i => i.id !== invoiceId) }
              : c
          )
        }))
        deleteContractInvoice(invoiceId)
        recordStoreActivity(get, `Deleted invoice${invoice?.invoiceNumber ? ` ${invoice.invoiceNumber}` : ''}`, 'contract', contractId, contract?.title)
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
        const contract = get().contracts.find(c => c.id === contractId)
        recordStoreActivity(get, `Locked subcontractor: ${newSub.companyName}`, 'contract', contractId, contract?.title)
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
        if (updated) {
          upsertLockedSubcontractor(updated)
          const contract = get().contracts.find(c => c.id === contractId)
          recordStoreActivity(get, `Updated locked subcontractor: ${updated.companyName}`, 'contract', contractId, contract?.title)
        }
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
        const contract = get().contracts.find(c => c.id === contractId)
        recordStoreActivity(get, `Added government warning: ${warning.type.replace(/_/g, ' ')}`, 'contract', contractId, contract?.title)
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
        if (updated) {
          upsertGovernmentWarning(updated)
          const contract = get().contracts.find(c => c.id === contractId)
          recordStoreActivity(get, `Updated government warning: ${updated.type.replace(/_/g, ' ')}`, 'contract', contractId, contract?.title)
        }
      },

      removeGovernmentWarning: (contractId, warningId) => {
        const contract = get().contracts.find(c => c.id === contractId)
        const warning = contract?.governmentWarnings?.find(item => item.id === warningId)
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
        recordStoreActivity(get, `Deleted government warning${warning ? `: ${warning.type.replace(/_/g, ' ')}` : ''}`, 'contract', contractId, contract?.title)
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
        if (updated) {
          upsertGovernmentWarning(updated)
          const contract = get().contracts.find(c => c.id === contractId)
          recordStoreActivity(get, `Resolved government warning: ${updated.type.replace(/_/g, ' ')}`, 'contract', contractId, contract?.title)
        }
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
        recordStoreActivity(get, `Added CLIN ${newLine.clin}: ${newLine.description}`, 'contract', contractId, contract.title)
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
        if (updated) {
          upsertContractLineItem(updated)
          const contract = get().contracts.find(c => c.id === contractId)
          recordStoreActivity(get, `Updated CLIN ${updated.clin}`, 'contract', contractId, contract?.title)
        }
      },

      removeContractLineItem: (contractId, lineId) => {
        const contract = get().contracts.find(c => c.id === contractId)
        const line = contract?.lineItems?.find(item => item.id === lineId)
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, lineItems: (c.lineItems || []).filter(l => l.id !== lineId) }
              : c
          )
        }))
        deleteContractLineItemRecord(lineId)
        recordStoreActivity(get, `Deleted CLIN${line?.clin ? ` ${line.clin}` : ''}`, 'contract', contractId, contract?.title)
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
        recordStoreActivity(get, `Added ${newOrder.type === 'TASK_ORDER' ? 'task order' : 'call'}: ${newOrder.number}`, 'contract', contractId, contract.title)
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
        if (updated) {
          upsertContractVehicleOrder(updated)
          const contract = get().contracts.find(c => c.id === contractId)
          recordStoreActivity(get, `Updated ${updated.type === 'TASK_ORDER' ? 'task order' : 'call'}: ${updated.number}`, 'contract', contractId, contract?.title)
        }
      },

      removeContractVehicleOrder: (contractId, orderId) => {
        const contract = get().contracts.find(c => c.id === contractId)
        const order = contract?.vehicleOrders?.find(item => item.id === orderId)
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, vehicleOrders: (c.vehicleOrders || []).filter(order => order.id !== orderId) }
              : c
          )
        }))
        deleteContractVehicleOrderRecord(orderId)
        recordStoreActivity(get, `Deleted ${order?.type === 'CALL' ? 'call' : 'task order'}${order?.number ? ` ${order.number}` : ''}`, 'contract', contractId, contract?.title)
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
        const actor = get().currentUser
        if (!hasPermission(actor, 'sourcing:write')) {
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
        get().logActivity({
          action: `${hasSourcingQuote(sub) ? 'Added quote-backed sourcing' : 'Added sourcing'}: ${sub.companyName}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'subcontractor',
          entityId: sub.id,
          entityName: sub.companyName,
        })
        const opportunity = get().opportunities.find(item => item.id === sub.opportunityId)
        if (hasSourcingQuote(sub) && opportunity && !opportunity.quoted) {
          void get().updateOpportunity(opportunity.id, { quoted: true })
        }
      },

      updateSubcontractor: (id, data) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'sourcing:write')) {
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
        if (updated) {
          upsertSubcontractor(updated)
          get().logActivity({
            action: `${hasSourcingQuote(updated) ? 'Updated quote-backed sourcing' : 'Updated sourcing'}: ${updated.companyName}`,
            user: actor?.name || 'System',
            userRole: actor?.role || 'CAPTURE_MANAGER',
            entityType: 'subcontractor',
            entityId: updated.id,
            entityName: updated.companyName,
          })
          const opportunity = get().opportunities.find(item => item.id === updated.opportunityId)
          if (hasSourcingQuote(updated) && opportunity && !opportunity.quoted) {
            void get().updateOpportunity(opportunity.id, { quoted: true })
          }
        }
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
          get().logActivity({
            action: `Deleted sourcing subcontractor: ${sub.companyName}`,
            user: get().currentUser?.name || 'System',
            userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
            entityType: 'subcontractor',
            entityId: sub.id,
            entityName: sub.companyName,
          })
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
        }, get().employees, get().requireAssociateForActivePipeline)

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
      logActivity: (entry) => {
        const log: ActivityLog = {
          ...entry,
          id: `al${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
        }
        set(s => ({ activityLogs: [log, ...s.activityLogs] }))
        // Promote to the shared table so every user's actions show up in the
        // workspace-wide audit trail. Silent no-op when Supabase or the
        // activity_logs table is unavailable.
        if (isSupabaseConnected) void upsertActivityLog(log)
      },

      // ── Non-submission reports ──────────────────────────────────────
      submitNonSubReport: (data) => {
        if (!hasPermission(get().currentUser, 'nonSubmission:submit')) {
          toast.error('You do not have permission to submit non-submission reports.')
          return
        }
        const report: NonSubmissionReport = {
          ...data,
          id: `nsr-${data.opportunityId}`,
          status: 'PENDING',
          submittedAt: new Date().toISOString(),
        }
        set(s => ({ nonSubReports: dedupeNonSubReports([report, ...s.nonSubReports]) }))
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
        get().logActivity({
          action: `Submitted non-submission report${updatedOpp ? ` for ${updatedOpp.solicitation}` : ''}`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'report',
          entityId: report.id,
          entityName: updatedOpp?.solicitation,
        })
      },

      updateNonSubReportReason: (reportId, reason) => {
        const actor = get().currentUser
        const canEdit = hasPermission(actor, 'nonSubmission:submit') || hasPermission(actor, 'nonSubmission:review')
        if (!canEdit) {
          toast.error('You do not have permission to edit this report.')
          return
        }
        const trimmed = reason.trim()
        if (!trimmed) {
          toast.error('The reason cannot be empty.')
          return
        }
        set(s => ({
          nonSubReports: s.nonSubReports.map(r =>
            r.id === reportId ? { ...r, reason: trimmed, reasonEditedAt: new Date().toISOString() } : r
          )
        }))
        const report = get().nonSubReports.find(r => r.id === reportId)
        if (report) upsertNonSubReport(report)
      },

      addNonSubReportComment: (reportId, text) => {
        const actor = get().currentUser
        const canComment = hasPermission(actor, 'nonSubmission:submit') || hasPermission(actor, 'nonSubmission:review')
        if (!canComment) {
          toast.error('You do not have permission to comment on this report.')
          return
        }
        const trimmed = text.trim()
        if (!trimmed) return
        const comment: Comment = {
          id: `nsc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: trimmed,
          author: actor?.name || actor?.username || 'Unknown',
          authorId: actor?.id,
          createdAt: new Date().toISOString(),
        }
        set(s => ({
          nonSubReports: s.nonSubReports.map(r =>
            r.id === reportId ? { ...r, comments: [...(r.comments ?? []), comment] } : r
          )
        }))
        const report = get().nonSubReports.find(r => r.id === reportId)
        if (report) upsertNonSubReport(report)
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
            const trackerRow = bdSubmissionFromOpportunity(updatedOpp, trackerStatus, existing, reviewNote || report.reason, get().employees)
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

      returnNonSubmissionToPipeline: (reportId) => {
        const actor = get().currentUser
        if (!hasPermission(actor, 'opportunity:edit')) {
          toast.error('Only the Capture Manager can move opportunities back to the pipeline.')
          return
        }
        const report = get().nonSubReports.find(r => r.id === reportId)
        if (!report) return
        const linkedOpp = get().opportunities.find(o => o.id === report.opportunityId)
        if (!linkedOpp) {
          toast.error('The original opportunity could not be found.')
          return
        }

        const restored = normalizeOpportunityAssignmentStatus({
          ...linkedOpp,
          status: 'ACTIVE',
          submittedAt: undefined,
          nonSubmissionReportId: undefined,
          // Deliberate manager override: keep it in the pipeline. Without this the
          // next sweep would instantly re-report it (its due datetime is already
          // >12h in the past), bouncing it straight back to Non-Submission Reports.
          nonSubmissionExempt: true,
        }, get().employees, get().requireAssociateForActivePipeline)

        const relatedSubmission = get().bdSubmissions.find(b => b.solicitationId === linkedOpp.solicitationId)

        set(s => ({
          opportunities: s.opportunities.map(o => o.id === restored.id ? restored : o),
          nonSubReports: s.nonSubReports.filter(r => r.id !== reportId),
          bdSubmissions: relatedSubmission ? s.bdSubmissions.filter(b => b.id !== relatedSubmission.id) : s.bdSubmissions,
        }))

        upsertOpportunity(restored).then(saved => {
          if (!saved) showDatabaseSaveError('Opportunity update')
        })
        void bulkDeleteFromTable('non_submission_reports', { column: 'id', value: reportId })
        if (relatedSubmission) deleteBDSubmissionRecord(relatedSubmission.id)

        get().logActivity({
          action: `Moved opportunity back to Contract Opportunities from Non-Submission: ${linkedOpp.solicitation}`,
          user: actor?.name || 'System',
          userRole: actor?.role || 'CAPTURE_MANAGER',
          entityType: 'opportunity',
          entityId: restored.id,
          entityName: linkedOpp.solicitation,
        })
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

      addNotification: (data) => {
        const notification: Notification = {
          ...data,
          id: `n${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
        }
        set(s => ({ notifications: [notification, ...s.notifications] }))
        // Promote to the shared table so the concerned user receives it in
        // their own session (poll / realtime picks it up). No-op + silent when
        // Supabase or the notifications table is unavailable.
        if (isSupabaseConnected) void upsertNotification(notification)
      },

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
              ? normalizeOpportunityAssignmentStatus(
                  { ...o, assignedTo: employeeId },
                  s.employees,
                  get().requireAssociateForActivePipeline,
                )
              : o
          )
        }))
        const emp = target
        const opp = get().opportunities.find(o => o.id === opportunityId)
        if (opp) persistAssignedOpportunity(opp, get().employees, 'Opportunity assignment')
        if (emp && opp) {
          const targetUser = findUserForEmployee(get().users, emp)
          get().addNotification({
            type: 'ASSIGNMENT',
            title: 'Opportunity assigned',
            message: `${opp.solicitation} assigned to ${emp.name}.`,
            read: false,
            relatedId: opportunityId,
            targetUserId: targetUser?.id,
          })
          get().logActivity({
            action: `Assigned opportunity ${opp.solicitation} to ${emp.name}`,
            user: get().currentUser?.name || 'System',
            userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
            entityType: 'opportunity',
            entityId: opp.id,
            entityName: opp.solicitation,
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
          const targetUser = findUserForEmployee(get().users, emp)
          get().addNotification({
            type: 'ASSIGNMENT',
            title: 'Contract assigned',
            message: `${contract.title} assigned to ${emp.name}.`,
            read: false,
            relatedId: contractId,
            targetUserId: targetUser?.id,
          })
          get().logActivity({
            action: `Assigned contract ${contract.title} to ${emp.name}`,
            user: get().currentUser?.name || 'System',
            userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
            entityType: 'contract',
            entityId: contract.id,
            entityName: contract.title,
          })
        }
      },

      // ── DB ──────────────────────────────────────────────────────────
      syncUsersFromDb: async () => {
        if (!isSupabaseConnected || !get().isAuthenticated) return
        try {
          const data = await loadAllData()
          if (!data) return
          if (data.users.length === 0) return

          set(s => {
            const dbUsers = data.users
            // When Supabase has users, it is the source of truth. Do not
            // preserve stale local-only users after an admin/database reset.
            const merged = dbUsers
            // Auth flags on the active user are monotonic forward (firstLogin:
            // true → false). If a stale DB read disagrees with the local
            // just-completed state, don't regress.
            const refreshedCurrent = s.currentUser
              ? (() => {
                  const dbMatch = merged.find(u =>
                    u.id === s.currentUser!.id ||
                    u.email.toLowerCase() === s.currentUser!.email.toLowerCase()
                  )
                  if (!dbMatch) return s.currentUser
                  return dbMatch
                })()
              : null
            // Reflect the monotonic merge in the users list too so Admin
            // doesn't render stale flags for the active user.
            const finalUsers = refreshedCurrent
              ? merged.map(u => (u.id === refreshedCurrent.id ? refreshedCurrent : u))
              : merged
            return {
              users: finalUsers,
              employees: syncEmployeesWithUsers(finalUsers, s.employees),
              currentUser: refreshedCurrent,
            }
          })

          // Re-evaluate gated routes for the active session in case the DB
          // already recorded a completed first-login elsewhere.
          const refreshed = get().currentUser
          if (refreshed) {
            set({
              needsFirstLogin: refreshed.firstLogin === true,
            })
          }
          set({ lastSyncedAt: Date.now() })
        } catch (err) {
          console.error('[Store] syncUsersFromDb failed', err)
        }
      },

      initializeStore: async () => {
        if (!isSupabaseConnected || !get().isAuthenticated) return
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
              const trackerRow = bdSubmissionFromOpportunity(opp, 'CANCELED', existing, 'Canceled', get().employees)
              if (existing) {
                const idx = bdSubmissions.findIndex(b => b.id === existing.id)
                bdSubmissions[idx] = trackerRow
              } else {
                bdSubmissions.unshift(trackerRow)
              }
              upsertBDSubmission(trackerRow)
              deleteOpportunityRecord(opp.id)
            })

            const localUsers = get().users
            const localCurrentUser = get().currentUser
            const mergedUsers = data.users.length > 0
              ? data.users
              : localCurrentUser ? mergeSafeUser(localUsers, localCurrentUser) : []
            // See syncUsersFromDb: never regress monotonic auth flags for the
            // active user when the DB read is stale relative to a just-completed
            // first-login that is still propagating.
            const refreshedCurrent = localCurrentUser
              ? (() => {
                  const dbMatch = mergedUsers.find(u =>
                    u.id === localCurrentUser.id ||
                    u.email.toLowerCase() === localCurrentUser.email.toLowerCase()
                  )
                  if (!dbMatch) return localCurrentUser
                  return dbMatch
                })()
              : null
            const finalUsers = refreshedCurrent
              ? mergedUsers.map(u => (u.id === refreshedCurrent.id ? refreshedCurrent : u))
              : mergedUsers

            set({
              users: finalUsers,
              currentUser: refreshedCurrent,
              needsFirstLogin: refreshedCurrent ? refreshedCurrent.firstLogin === true : get().needsFirstLogin,
              employees: syncEmployeesWithUsers(
                finalUsers,
                data.employees.length > 0 ? data.employees : get().employees,
              ),
              opportunities: data.opportunities.filter(o => o.status !== 'CANCELED'),
              contracts: data.contracts,
              freshAwards: data.freshAwards,
              pastPerformances: data.pastPerformances,
              subcontractors: data.subcontractors,
              nonSubReports: dedupeNonSubReports(data.nonSubReports.filter(r => !canceledIds.has(r.opportunityId))),
              deletionRequests: data.deletionRequests.filter(r => !canceledIds.has(r.opportunityId)),
              bdSubmissions,
              nextInvoiceNumber: Math.max(
                Math.max(1, Math.trunc(Number(get().nextInvoiceNumber) || 1)),
                nextInvoiceSequenceFromContracts(data.contracts),
              ),
              dbReady: true,
              lastSyncedAt: Date.now(),
            })
          } else {
            // Keep the rehydrated snapshot intact. Mark initialization as
            // complete so refreshFromDb can retry periodically without
            // re-running all one-time startup work on every render.
            set({ dbReady: true })
          }

          // Pull permission overrides from Supabase if available; falls back
          // to whatever rehydrated from localStorage otherwise.
          try {
            const r = await fetchPermissionOverrides()
            if (r.ok && r.payload) {
              set({
                rolePermissionOverrides: r.payload.roles,
                userPermissionGrants:    r.payload.grants,
                userPermissionRevokes:   r.payload.revokes,
                permissionOverridesSyncStatus: 'synced',
              })
            } else if (r.missingTable) {
              set({ permissionOverridesSyncStatus: 'local' })
            }
          } catch (err) {
            console.error('[Store] fetchPermissionOverrides failed', err)
          }

          // Pull runtime app settings (integration keys + the shared
          // non-submission grace window) from Supabase.
          try {
            const s = await fetchAppSettings()
            if (s.ok && s.payload) {
              // Hydrate the grace window from the workspace-wide value so this
              // browser's sweep matches every other session instead of its own
              // localStorage default.
              const gracePatch: { nonSubGraceHours?: number; nonSubGraceMinutes?: number } = {}
              const rawHours = s.payload[NON_SUB_GRACE_HOURS_KEY]
              const rawMinutes = s.payload[NON_SUB_GRACE_MINUTES_KEY]
              if (rawHours !== undefined) gracePatch.nonSubGraceHours = Math.max(0, Math.trunc(Number(rawHours) || 0))
              if (rawMinutes !== undefined) gracePatch.nonSubGraceMinutes = Math.max(0, Math.trunc(Number(rawMinutes) || 0))
              set({ appSettings: s.payload, appSettingsSyncStatus: 'synced', ...gracePatch })
            } else if (s.missingTable) {
              set({ appSettingsSyncStatus: 'local' })
            }
          } catch (err) {
            console.error('[Store] fetchAppSettings failed', err)
          }

          // Pull shared notifications + HR requests. These used to live only in
          // localStorage, so cross-user activity never propagated. The DB is the
          // source of truth for the set; preserve any locally-read flag so a
          // refresh doesn't resurrect already-read alerts as unread.
          try {
            const [nRes, rRes, aRes] = await Promise.all([fetchNotifications(), fetchEmployeeRequests(), fetchActivityLogs()])
            const collabPatch: { notifications?: Notification[]; employeeRequests?: EmployeeRequest[]; activityLogs?: ActivityLog[] } = {}
            if (nRes.ok && nRes.payload) {
              const readLocal = new Set(get().notifications.filter(n => n.read).map(n => n.id))
              const dbIds = new Set(nRes.payload.map(n => n.id))
              // Keep locally-created notifications that haven't synced to the DB
              // yet (or when a DB write failed) so the author never loses their
              // own alerts to a refresh that treats the DB as the whole truth.
              const localOnly = get().notifications.filter(n => !dbIds.has(n.id))
              collabPatch.notifications = [
                ...nRes.payload.map(n => (readLocal.has(n.id) ? { ...n, read: true } : n)),
                ...localOnly,
              ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            }
            if (rRes.ok && rRes.payload) {
              collabPatch.employeeRequests = rRes.payload
            }
            if (aRes.ok && aRes.payload) {
              const dbIds = new Set(aRes.payload.map(l => l.id))
              const localOnly = get().activityLogs.filter(l => !dbIds.has(l.id))
              collabPatch.activityLogs = [...aRes.payload, ...localOnly].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            }
            if (collabPatch.notifications || collabPatch.employeeRequests || collabPatch.activityLogs) set(collabPatch)
          } catch (err) {
            console.error('[Store] collaboration sync failed', err)
          }
        } catch (err) {
          console.error('[Store] Supabase init failed, using local data', err)
          set({ dbReady: true })
        }
      },

      // Lightweight periodic/live re-sync used by the app shell so cross-user
      // activity (new opportunities, HR requests, notifications) shows up without
      // a manual page refresh. Unlike initializeStore this never flips dbReady,
      // never touches auth (currentUser stays the same object reference to avoid
      // needless re-renders / auth churn) and skips the one-time canceled→BD
      // migration that init performs.
      refreshFromDb: async () => {
        const initial = get()
        if (
          !isSupabaseConnected ||
          !initial.dbReady ||
          !initial.isAuthenticated ||
          !initial.currentUser ||
          refreshInFlight
        ) return
        refreshInFlight = true
        try {
          // Revalidate identity/profile before touching workspace tables. This
          // makes inactive/deleted/admin-reset accounts fail closed even while
          // an older JWT is still present in the browser.
          const profileResult = await revalidateAuthenticatedProfile(
            initial.currentUser.authUserId,
          )
          if (!profileResult.ok) {
            if (profileResult.retryable) return
            clearAuthSessionMeta()
            set(clearedAuthState())
            try {
              await signOutCurrentSession()
            } catch {
              // State is already purged; remote sign-out is best effort.
            }
            return
          }

          // Do not let a refresh that started before logout/account switching
          // re-authenticate a newer store state with stale results.
          const latest = get()
          if (
            !latest.isAuthenticated ||
            !latest.currentUser ||
            latest.currentUser.id !== initial.currentUser.id ||
            latest.loginTimestamp !== initial.loginTimestamp
          ) return

          const refreshedProfile = toSafeUser(profileResult.profile)
          const startedAt = latest.loginTimestamp ?? Date.now()
          if (refreshedProfile.firstLogin) {
            set(pendingFirstLoginState(
              refreshedProfile,
              startedAt,
              latest.accessNoticeAccepted,
            ))
            return
          }

          // Apply role/team/manager changes before any business payload lands.
          set(state => ({
            currentUser: refreshedProfile,
            users: mergeSafeUser(state.users, refreshedProfile),
          }))

          const data = await loadAllData()
          const afterLoad = get()
          if (
            !afterLoad.isAuthenticated ||
            afterLoad.currentUser?.id !== refreshedProfile.id ||
            afterLoad.loginTimestamp !== startedAt
          ) return
          if (data) {
            const canceledIds = new Set(
              data.opportunities.filter(o => o.status === 'CANCELED').map(o => o.id),
            )
            const dbUsers = data.users.length > 0 ? data.users : get().users
            const finalUsers = mergeSafeUser(dbUsers, refreshedProfile)
            set({
              users: finalUsers,
              employees: syncEmployeesWithUsers(
                finalUsers,
                data.employees.length > 0 ? data.employees : get().employees,
              ),
              opportunities: data.opportunities.filter(o => o.status !== 'CANCELED'),
              contracts: data.contracts,
              freshAwards: data.freshAwards,
              pastPerformances: data.pastPerformances,
              subcontractors: data.subcontractors,
              nonSubReports: dedupeNonSubReports(data.nonSubReports.filter(r => !canceledIds.has(r.opportunityId))),
              deletionRequests: data.deletionRequests.filter(r => !canceledIds.has(r.opportunityId)),
              bdSubmissions: data.bdSubmissions,
              lastSyncedAt: Date.now(),
            })
          }

          const [nRes, rRes, aRes] = await Promise.all([fetchNotifications(), fetchEmployeeRequests(), fetchActivityLogs()])
          const afterCollaborationLoad = get()
          if (
            !afterCollaborationLoad.isAuthenticated ||
            afterCollaborationLoad.currentUser?.id !== refreshedProfile.id ||
            afterCollaborationLoad.loginTimestamp !== startedAt
          ) return
          const collabPatch: { notifications?: Notification[]; employeeRequests?: EmployeeRequest[]; activityLogs?: ActivityLog[] } = {}
          if (nRes.ok && nRes.payload) {
            const readLocal = new Set(get().notifications.filter(n => n.read).map(n => n.id))
            const dbIds = new Set(nRes.payload.map(n => n.id))
            // Keep locally-created notifications that haven't synced to the DB
            // yet (or when a DB write failed) so the author never loses their
            // own alerts to a refresh that treats the DB as the whole truth.
            const localOnly = get().notifications.filter(n => !dbIds.has(n.id))
            collabPatch.notifications = [
              ...nRes.payload.map(n => (readLocal.has(n.id) ? { ...n, read: true } : n)),
              ...localOnly,
            ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          }
          if (rRes.ok && rRes.payload) {
            collabPatch.employeeRequests = rRes.payload
          }
          if (aRes.ok && aRes.payload) {
            const dbIds = new Set(aRes.payload.map(l => l.id))
            const localOnly = get().activityLogs.filter(l => !dbIds.has(l.id))
            collabPatch.activityLogs = [...aRes.payload, ...localOnly].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          }
          if (collabPatch.notifications || collabPatch.employeeRequests || collabPatch.activityLogs) set(collabPatch)
        } catch (err) {
          console.error('[Store] refreshFromDb failed', err)
        } finally {
          refreshInFlight = false
        }
      },

      // ── UI ──────────────────────────────────────────────────────────
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      updateNonSubGracePeriod: (hours, minutes) => {
        const cleanHours = Math.max(0, Math.trunc(Number(hours) || 0))
        const cleanMinutes = Math.max(0, Math.trunc(Number(minutes) || 0))
        set(s => ({
          nonSubGraceHours: cleanHours,
          nonSubGraceMinutes: cleanMinutes,
          appSettings: {
            ...s.appSettings,
            [NON_SUB_GRACE_HOURS_KEY]: String(cleanHours),
            [NON_SUB_GRACE_MINUTES_KEY]: String(cleanMinutes),
          },
        }))
        // Persist to the shared app_settings table so the grace window is
        // workspace-wide, not just this browser's localStorage. Fire-and-forget
        // to keep the action synchronous; localStorage remains the fallback.
        if (isSupabaseConnected) {
          void saveAppSetting(NON_SUB_GRACE_HOURS_KEY, String(cleanHours))
          void saveAppSetting(NON_SUB_GRACE_MINUTES_KEY, String(cleanMinutes))
        }
      },
      setAppSetting: async (key, value) => {
        const trimmedKey = String(key ?? '').trim()
        const nextValue  = String(value ?? '')
        if (!trimmedKey) return { ok: false, missingTable: false }
        set(s => ({ appSettings: { ...s.appSettings, [trimmedKey]: nextValue } }))
        const r = await saveAppSetting(trimmedKey, nextValue)
        if (r.missingTable) {
          set({ appSettingsSyncStatus: 'local' })
        } else if (r.ok) {
          set({ appSettingsSyncStatus: 'synced' })
        }
        return { ok: r.ok, missingTable: r.missingTable }
      },
      setRequireAssociateForActivePipeline: (value) => {
        const next = !!value
        const prev = get().requireAssociateForActivePipeline
        if (prev === next) return
        // Retroactively re-evaluate every opportunity so ACTIVE/NEW_ASSIGNMENT
        // matches the new mode immediately; bulk-upsert anything that flipped.
        const employees = get().employees
        const changed: Opportunity[] = []
        const renormalized = get().opportunities.map(opp => {
          const updated = normalizeOpportunityAssignmentStatus(opp, employees, next)
          if (updated.status !== opp.status) changed.push(updated)
          return updated
        })
        set({ requireAssociateForActivePipeline: next, opportunities: renormalized })
        if (changed.length > 0 && isSupabaseConnected) {
          void ensureAssignmentEmployeesSynced(employees).then(synced => {
            if (!synced) return
            void Promise.all(changed.map(opp => upsertOpportunity(opp))).then(results => {
              const failures = results.filter(saved => !saved).length
              if (failures > 0) {
                toast.error(`${failures} opportunit${failures === 1 ? 'y' : 'ies'} could not sync to the database.`)
              }
            })
          })
        }
      },
      consumeInvoiceNumber: () => {
        const current = Math.max(1, Math.trunc(Number(get().nextInvoiceNumber) || 1))
        set({ nextInvoiceNumber: current + 1 })
        return current
      },
      setPref: (key, value) => set(s => ({ prefs: { ...s.prefs, [key]: value } })),

      // ── Permission editor ────────────────────────────────────────────
      // Every mutator updates local Zustand state synchronously, then fires a
      // best-effort save to Supabase. If the migration hasn't been applied
      // (missingTable === true) we flip permissionOverridesSyncStatus to
      // 'local' so the UI can show that state without nagging the user.
      setRolePermissions: async (role, permissions) => {
        const unique = Array.from(new Set(permissions))
        set(s => ({ rolePermissionOverrides: { ...s.rolePermissionOverrides, [role]: unique } }))
        const r = await saveRolePermissionOverride(role, unique)
        if (r.missingTable) {
          set({ permissionOverridesSyncStatus: 'local' })
        } else if (r.ok) {
          set({ permissionOverridesSyncStatus: 'synced' })
        }
      },
      resetRolePermissions: async (role) => {
        set(s => {
          const next = { ...s.rolePermissionOverrides }
          delete next[role]
          return { rolePermissionOverrides: next }
        })
        const r = await saveRolePermissionOverride(role, null)
        if (r.missingTable) {
          set({ permissionOverridesSyncStatus: 'local' })
        } else if (r.ok) {
          set({ permissionOverridesSyncStatus: 'synced' })
        }
      },
      setUserPermissionGrant: async (userId, permission, granted) => {
        // Toggling a grant clears any matching revoke for the same permission
        // so the two halves can't disagree.
        const before = get()
        const currentGrants  = new Set(before.userPermissionGrants[userId]  ?? [])
        const currentRevokes = new Set(before.userPermissionRevokes[userId] ?? [])
        if (granted) {
          currentGrants.add(permission)
          currentRevokes.delete(permission)
        } else {
          currentGrants.delete(permission)
        }
        const nextGrantsArr  = Array.from(currentGrants)
        const nextRevokesArr = Array.from(currentRevokes)
        set(s => ({
          userPermissionGrants:  { ...s.userPermissionGrants,  [userId]: nextGrantsArr  },
          userPermissionRevokes: { ...s.userPermissionRevokes, [userId]: nextRevokesArr },
        }))
        const r = await saveUserPermissionOverride(userId, nextGrantsArr, nextRevokesArr)
        if (r.missingTable) {
          set({ permissionOverridesSyncStatus: 'local' })
        } else if (r.ok) {
          set({ permissionOverridesSyncStatus: 'synced' })
        }
      },
      setUserPermissionRevoke: async (userId, permission, revoked) => {
        const before = get()
        const currentGrants  = new Set(before.userPermissionGrants[userId]  ?? [])
        const currentRevokes = new Set(before.userPermissionRevokes[userId] ?? [])
        if (revoked) {
          currentRevokes.add(permission)
          currentGrants.delete(permission)
        } else {
          currentRevokes.delete(permission)
        }
        const nextGrantsArr  = Array.from(currentGrants)
        const nextRevokesArr = Array.from(currentRevokes)
        set(s => ({
          userPermissionGrants:  { ...s.userPermissionGrants,  [userId]: nextGrantsArr  },
          userPermissionRevokes: { ...s.userPermissionRevokes, [userId]: nextRevokesArr },
        }))
        const r = await saveUserPermissionOverride(userId, nextGrantsArr, nextRevokesArr)
        if (r.missingTable) {
          set({ permissionOverridesSyncStatus: 'local' })
        } else if (r.ok) {
          set({ permissionOverridesSyncStatus: 'synced' })
        }
      },
      resetUserPermissions: async (userId) => {
        set(s => {
          const grants  = { ...s.userPermissionGrants  }
          const revokes = { ...s.userPermissionRevokes }
          delete grants[userId]
          delete revokes[userId]
          return { userPermissionGrants: grants, userPermissionRevokes: revokes }
        })
        const r = await saveUserPermissionOverride(userId, [], [])
        if (r.missingTable) {
          set({ permissionOverridesSyncStatus: 'local' })
        } else if (r.ok) {
          set({ permissionOverridesSyncStatus: 'synced' })
        }
      },
      resetAllPermissionOverrides: async () => {
        set({ rolePermissionOverrides: {}, userPermissionGrants: {}, userPermissionRevokes: {} })
        const r = await clearAllPermissionOverrides()
        if (r.missingTable) {
          set({ permissionOverridesSyncStatus: 'local' })
        } else if (r.ok) {
          set({ permissionOverridesSyncStatus: 'synced' })
        }
      },

      // ── Admin bulk operations (destructive) ──────────────────────────
      // Each wipe* clears the matching local slice immediately and best-effort
      // mirrors the deletion in Supabase. Local-only mode still resolves and
      // returns the count that was removed locally.
      wipeOpportunities: async () => {
        const count = get().opportunities.length
        set({ opportunities: [], bdSubmissions: [], nonSubReports: [], deletionRequests: [] })
        if (isSupabaseConnected) {
          // FK ON DELETE CASCADE handles comments/subcontractors/non_sub_reports
          // children automatically, but bd_submissions/deletion_requests live
          // in a separate table that may carry orphan refs — wipe them too.
          const ok = await bulkDeleteFromTable('opportunities')
          await bulkDeleteFromTable('bd_submissions')
          await bulkDeleteFromTable('non_submission_reports')
          await bulkDeleteFromTable('deletion_requests')
          if (!ok) toast.error('Opportunities were cleared locally but the database wipe failed.')
        }
        get().logActivity({
          action: `Wiped all opportunities (${count})`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'admin',
          entityName: 'opportunities',
        })
        return count
      },

      wipeContracts: async (clientFilter) => {
        const all = get().contracts
        const targets = clientFilter ? all.filter(c => c.client === clientFilter) : all
        const targetIds = new Set(targets.map(c => c.id))
        set({
          contracts: clientFilter ? all.filter(c => !targetIds.has(c.id)) : [],
        })
        if (isSupabaseConnected) {
          // Cascade deletes invoices/line items/POCs/locked subs/warnings
          const ok = clientFilter
            ? await bulkDeleteFromTable('contracts', { column: 'client', value: clientFilter })
            : await bulkDeleteFromTable('contracts')
          if (!ok) toast.error('Contracts were cleared locally but the database wipe failed.')
        }
        get().logActivity({
          action: clientFilter
            ? `Wiped contracts for ${clientFilter} (${targets.length})`
            : `Wiped all contracts (${targets.length})`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'admin',
          entityName: 'contracts',
        })
        return targets.length
      },

      wipeFreshAwards: async () => {
        const count = get().freshAwards.length
        set({ freshAwards: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('fresh_awards')
          if (!ok) toast.error('Fresh awards were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipePastPerformances: async () => {
        const count = get().pastPerformances.length
        set({ pastPerformances: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('past_performances')
          if (!ok) toast.error('Past performances were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipeSubcontractors: async () => {
        const count = get().subcontractors.length
        set({ subcontractors: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('subcontractors')
          if (!ok) toast.error('Subcontractors were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipeSubkDatabase: async () => {
        const count = get().subkDatabase.length
        set({ subkDatabase: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('subk_database')
          if (!ok) toast.error('Sourcing entries were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipeBDSubmissions: async () => {
        const count = get().bdSubmissions.length
        set({ bdSubmissions: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('bd_submissions')
          if (!ok) toast.error('BD tracker entries were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipeNonSubReports: async () => {
        const count = get().nonSubReports.length
        set({ nonSubReports: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('non_submission_reports')
          if (!ok) toast.error('Non-submission reports were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipeDeletionRequests: async () => {
        const count = get().deletionRequests.length
        set({ deletionRequests: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('deletion_requests')
          if (!ok) toast.error('Deletion requests were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipeNotifications: async () => {
        const count = get().notifications.length
        set({ notifications: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('notifications')
          if (!ok) toast.error('Notifications were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipeActivityLogs: async () => {
        const count = get().activityLogs.length
        set({ activityLogs: [] })
        if (isSupabaseConnected) {
          const ok = await bulkDeleteFromTable('activity_logs')
          if (!ok) toast.error('Activity logs were cleared locally but the database wipe failed.')
        }
        return count
      },

      wipeCompanyCertifications: async () => {
        const count = get().companyCertifications.length
        set({ companyCertifications: [] })
        return count
      },

      wipeEmployeeRequests: async () => {
        const count = get().employeeRequests.length
        set({ employeeRequests: [] })
        return count
      },

      resetBDPipeline: async () => {
        const before =
          get().opportunities.length +
          get().bdSubmissions.length +
          get().nonSubReports.length +
          get().deletionRequests.length
        set({ opportunities: [], bdSubmissions: [], nonSubReports: [], deletionRequests: [] })
        if (isSupabaseConnected) {
          await bulkDeleteFromTable('opportunities')
          await bulkDeleteFromTable('bd_submissions')
          await bulkDeleteFromTable('non_submission_reports')
          await bulkDeleteFromTable('deletion_requests')
        }
        get().logActivity({
          action: `Reset BD pipeline (${before} records cleared)`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'admin',
          entityName: 'bd-pipeline',
        })
        return before
      },

      resetOperations: async () => {
        const before =
          get().contracts.length +
          get().freshAwards.length +
          get().pastPerformances.length
        set({ contracts: [], freshAwards: [], pastPerformances: [] })
        if (isSupabaseConnected) {
          await bulkDeleteFromTable('contracts')
          await bulkDeleteFromTable('fresh_awards')
          await bulkDeleteFromTable('past_performances')
        }
        get().logActivity({
          action: `Reset operations (${before} records cleared)`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'admin',
          entityName: 'operations',
        })
        return before
      },

      wipeNonAdminUsers: async () => {
        // Keep CAPTURE_MANAGER (admin) accounts; remove everyone else.
        const all = get().users
        const survivors = all.filter(u => u.role === 'CAPTURE_MANAGER')
        const removed = all.filter(u => u.role !== 'CAPTURE_MANAGER')
        set(s => ({
          users: survivors,
          employees: syncEmployeesWithUsers(survivors, s.employees),
        }))
        if (isSupabaseConnected) {
          // Remove rows one at a time so the existing per-row helper handles
          // any FK side-effects already encoded in deleteUserRecord.
          await Promise.all(removed.map(u => invokeManageUsers({ action: 'delete', userId: u.id })))
        }
        get().logActivity({
          action: `Removed ${removed.length} non-admin user account(s)`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'admin',
          entityName: 'users',
        })
        return removed.length
      },

      resetEntireWorkspace: async () => {
        // Total wipe: every business slice + every non-admin user.
        // Admin (CAPTURE_MANAGER) accounts and their derived employees are kept
        // so the workspace stays usable after the reset.
        const totals = {
          opportunities: get().opportunities.length,
          contracts: get().contracts.length,
          freshAwards: get().freshAwards.length,
          pastPerformances: get().pastPerformances.length,
          subcontractors: get().subcontractors.length,
          subkDatabase: get().subkDatabase.length,
          bdSubmissions: get().bdSubmissions.length,
          nonSubReports: get().nonSubReports.length,
          deletionRequests: get().deletionRequests.length,
          notifications: get().notifications.length,
          activityLogs: get().activityLogs.length,
          companyCertifications: get().companyCertifications.length,
          employeeRequests: get().employeeRequests.length,
        }
        const total = Object.values(totals).reduce((sum, n) => sum + n, 0)
        const all = get().users
        const survivors = all.filter(u => u.role === 'CAPTURE_MANAGER')
        const removedUsers = all.filter(u => u.role !== 'CAPTURE_MANAGER')

        set(s => ({
          opportunities: [],
          contracts: [],
          freshAwards: [],
          pastPerformances: [],
          subcontractors: [],
          subkDatabase: [],
          bdSubmissions: [],
          nonSubReports: [],
          deletionRequests: [],
          notifications: [],
          activityLogs: [],
          companyCertifications: [],
          employeeRequests: [],
          users: survivors,
          employees: syncEmployeesWithUsers(survivors, s.employees),
        }))

        if (isSupabaseConnected) {
          // Order matters when not all FKs cascade — go children first.
          await bulkDeleteFromTable('bd_submissions')
          await bulkDeleteFromTable('non_submission_reports')
          await bulkDeleteFromTable('deletion_requests')
          await bulkDeleteFromTable('contracts')          // cascades invoices/line items/POCs/locks/warnings
          await bulkDeleteFromTable('opportunities')      // cascades comments/subcontractors
          await bulkDeleteFromTable('fresh_awards')
          await bulkDeleteFromTable('past_performances')
          await bulkDeleteFromTable('subcontractors')
          await bulkDeleteFromTable('subk_database')
          await bulkDeleteFromTable('notifications')
          await bulkDeleteFromTable('activity_logs')
          await Promise.all(removedUsers.map(u => invokeManageUsers({ action: 'delete', userId: u.id })))
        }

        get().logActivity({
          action: `Reset entire workspace (${total} business records and ${removedUsers.length} user(s) removed)`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'admin',
          entityName: 'workspace',
        })
        return total + removedUsers.length
      },

      // ── Workspace snapshot ───────────────────────────────────────────
      exportSnapshot: () => {
        const s = get()
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          exportedBy: s.currentUser?.name ?? null,
          data: {
            users: s.users.map(toSafeUser),
            employees: s.employees,
            opportunities: s.opportunities,
            contracts: s.contracts,
            freshAwards: s.freshAwards,
            pastPerformances: s.pastPerformances,
            subcontractors: s.subcontractors,
            subkDatabase: s.subkDatabase,
            bdSubmissions: s.bdSubmissions,
            nonSubReports: s.nonSubReports,
            deletionRequests: s.deletionRequests,
            notifications: s.notifications,
            activityLogs: s.activityLogs,
            companyCertifications: s.companyCertifications,
            employeeRequests: s.employeeRequests,
          },
          settings: {
            nonSubGraceHours: s.nonSubGraceHours,
            nonSubGraceMinutes: s.nonSubGraceMinutes,
            requireAssociateForActivePipeline: s.requireAssociateForActivePipeline,
            nextInvoiceNumber: s.nextInvoiceNumber,
          },
        }
      },

      importSnapshot: (payload) => {
        // Permissive shape validator: accepts the canonical snapshot shape
        // and tolerates missing optional slices. Anything malformed bails
        // out without mutating state.
        if (!payload || typeof payload !== 'object') {
          return { ok: false, error: 'Snapshot file is empty or not valid JSON.' }
        }
        const p = payload as Partial<SnapshotPayload>
        if (p.version !== 1) {
          return { ok: false, error: `Unsupported snapshot version: ${String(p.version ?? 'unknown')}. This build expects version 1.` }
        }
        const d = p.data
        if (!d || typeof d !== 'object') {
          return { ok: false, error: 'Snapshot is missing the "data" section.' }
        }
        const arr = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? v as T[] : fallback)
        const nextUsers          = arr<User>(d.users, get().users).map(toSafeUser)
        const nextOpportunities  = arr<Opportunity>(d.opportunities, [])
        const nextContracts      = arr<Contract>(d.contracts, [])
        const nextFreshAwards    = arr<FreshAward>(d.freshAwards, [])
        const nextPastPerf       = arr<PastPerformance>(d.pastPerformances, [])
        const nextSubs           = arr<Subcontractor>(d.subcontractors, [])
        const nextSubk           = arr<SubkDatabaseEntry>(d.subkDatabase, [])
        const nextBd             = arr<BDSubmission>(d.bdSubmissions, [])
        const nextNonSub         = arr<NonSubmissionReport>(d.nonSubReports, [])
        const nextDelReq         = arr<DeletionRequest>(d.deletionRequests, [])
        const nextNotif          = arr<Notification>(d.notifications, [])
        const nextActivity       = arr<ActivityLog>(d.activityLogs, [])
        const nextCerts          = arr<CompanyCertification>(d.companyCertifications, [])
        const nextEmpReq         = arr<EmployeeRequest>(d.employeeRequests, [])

        set(s => ({
          users: nextUsers,
          employees: syncEmployeesWithUsers(nextUsers, arr<Employee>(d.employees, [])),
          opportunities: nextOpportunities,
          contracts: nextContracts,
          freshAwards: nextFreshAwards,
          pastPerformances: nextPastPerf,
          subcontractors: nextSubs,
          subkDatabase: nextSubk,
          bdSubmissions: nextBd,
          nonSubReports: nextNonSub,
          deletionRequests: nextDelReq,
          notifications: nextNotif,
          activityLogs: nextActivity,
          companyCertifications: nextCerts,
          employeeRequests: nextEmpReq,
          nonSubGraceHours:  Number(p.settings?.nonSubGraceHours ?? s.nonSubGraceHours),
          nonSubGraceMinutes: Number(p.settings?.nonSubGraceMinutes ?? s.nonSubGraceMinutes),
          requireAssociateForActivePipeline: p.settings?.requireAssociateForActivePipeline ?? s.requireAssociateForActivePipeline,
          nextInvoiceNumber: Math.max(1, Math.trunc(Number(p.settings?.nextInvoiceNumber ?? s.nextInvoiceNumber) || 1)),
        }))

        get().logActivity({
          action: `Restored workspace snapshot exported on ${p.exportedAt ?? 'unknown date'} by ${p.exportedBy ?? 'unknown'}`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'CAPTURE_MANAGER',
          entityType: 'admin',
          entityName: 'snapshot',
        })

        return {
          ok: true,
          counts: {
            users: nextUsers.length,
            opportunities: nextOpportunities.length,
            contracts: nextContracts.length,
            freshAwards: nextFreshAwards.length,
            pastPerformances: nextPastPerf.length,
            subcontractors: nextSubs.length,
            subkDatabase: nextSubk.length,
            bdSubmissions: nextBd.length,
            nonSubReports: nextNonSub.length,
            deletionRequests: nextDelReq.length,
            notifications: nextNotif.length,
            activityLogs: nextActivity.length,
            companyCertifications: nextCerts.length,
            employeeRequests: nextEmpReq.length,
          },
        }
      },
    }),
    {
      name: 'ces-crm-store',
      // v21: reintroduce MFA (TOTP) gate — new pendingMfa* fields are cleared
      // on rehydrate so a persisted mid-flow state can never bypass the login
      // screen; existing users are re-enrolled on next login (mfaEnabled=false).
      // v20: persist role / per-user permission overrides edited from Admin.
      // v19: track per-user lastLoginAt in a browser-local userSessions slice.
      // v18: introduce requireAssociateForActivePipeline toggle; defaults to true
      // (Mode A = legacy behavior, Associate required before an opp becomes ACTIVE).
      // v17: reset all persisted app data after database cleanup; Supabase users
      // are now the source of truth when connected.
      // v16: removed MFA from the auth flow; needsMFASetup is no longer in state.
      // v15: refresh seeded department users to the Moroccan BD/OPS hierarchy.
      // v14: first forced refresh of seeded department users.
      // v13: assignment employees are derived strictly from active users so
      // deleted/inactive users disappear from assignment pickers.
      // v22 intentionally discards every legacy auth and workspace snapshot.
      // Supabase is the data source; only non-sensitive display preferences may
      // survive a refresh in this browser.
      version: 22,
      migrate: (persistedState: unknown) => {
        const state = persistedState && typeof persistedState === 'object'
          ? persistedState as Record<string, unknown>
          : {}
        const prefs = state.prefs && typeof state.prefs === 'object'
          ? state.prefs as Record<string, unknown>
          : {}
        return {
          sidebarCollapsed: state.sidebarCollapsed === true,
          prefs: { notificationSound: prefs.notificationSound !== false },
        }
      },
      partialize: state => ({
        sidebarCollapsed: state.sidebarCollapsed,
        prefs: state.prefs,
      }),
    }
  )
)

// Push initial overrides into the permissions module so the very first
// hasPermission() call after page load (e.g. Sidebar route gating) already
// sees rehydrated values from localStorage.
{
  const s = useStore.getState()
  applyPermissionOverrides(s.rolePermissionOverrides, s.userPermissionGrants, s.userPermissionRevokes)
}

// Subscribe-by-selector keeps the permissions module in sync with the store
// without re-running on unrelated state changes.
useStore.subscribe(s => {
  applyPermissionOverrides(s.rolePermissionOverrides, s.userPermissionGrants, s.userPermissionRevokes)
})
