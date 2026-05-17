import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  User, Opportunity, Contract, Notification, Subcontractor,
  NonSubmissionReport, DeletionRequest, FreshAward,
  PastPerformance, SubkDatabaseEntry, ActivityLog,
  ContractPoC, LockedSubcontractor, GovernmentWarning,
} from '../types'
import {
  MOCK_USERS, MOCK_OPPORTUNITIES, MOCK_NOTIFICATIONS,
  MOCK_SUBCONTRACTORS, MOCK_NON_SUB_REPORTS, MOCK_DELETION_REQUESTS,
  MOCK_CONTRACTS, MOCK_FRESH_AWARDS, MOCK_PAST_PERFORMANCES,
  MOCK_SUBK_DATABASE, MOCK_ACTIVITY_LOGS,
} from '../data/mock'

interface AppState {
  // Auth
  currentUser: User | null
  isAuthenticated: boolean
  needsFirstLogin: boolean
  needsMFASetup: boolean

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

  // UI
  sidebarCollapsed: boolean

  // ── Auth actions ───────────────────────────────────────────────────
  login: (email: string, password: string) => { ok: boolean; error?: string; needsFirst?: boolean; needsMFA?: boolean }
  logout: () => void
  completeFirstLogin: (password: string) => void
  completeMFASetup: () => void

  // ── User management ────────────────────────────────────────────────
  createUser: (u: Omit<User, 'id' | 'createdAt'>) => void
  updateUser: (id: string, data: Partial<User>) => void
  deleteUser: (id: string) => void

  // ── Opportunity management ─────────────────────────────────────────
  createOpportunity: (o: Omit<Opportunity, 'id'>) => void
  updateOpportunity: (id: string, data: Partial<Opportunity>) => void
  assignOpportunity: (id: string, bdm: string, bds: string) => void
  submitOpportunity: (id: string) => void
  markOpportunityWon: (id: string) => void
  terminateContract: (id: string, type: 'T4C' | 'T4D' | 'CANCELED', reason: string) => void

  // ── Contract management ────────────────────────────────────────────
  createContract: (c: Omit<Contract, 'id'>) => void
  updateContract: (id: string, data: Partial<Contract>) => void
  addContractPoC: (contractId: string, poc: Omit<ContractPoC, 'id' | 'contractId'>) => void
  updateContractPoC: (contractId: string, pocId: string, data: Partial<ContractPoC>) => void
  removeContractPoC: (contractId: string, pocId: string) => void
  addLockedSubcontractor: (contractId: string, sub: Omit<LockedSubcontractor, 'id' | 'contractId'>) => void
  updateLockedSubcontractor: (contractId: string, subId: string, data: Partial<LockedSubcontractor>) => void
  addGovernmentWarning: (contractId: string, warning: Omit<GovernmentWarning, 'id' | 'contractId'>) => void
  resolveGovernmentWarning: (contractId: string, warningId: string, note: string) => void
  advanceContractStatus: (id: string) => void

  // ── Subcontractor management ───────────────────────────────────────
  addSubcontractor: (data: Omit<Subcontractor, 'id' | 'createdAt'>) => void
  updateSubcontractor: (id: string, data: Partial<Subcontractor>) => void
  deleteSubcontractor: (id: string) => void

  // ── Fresh Awards ───────────────────────────────────────────────────
  assignFreshAward: (id: string, assignments: Partial<FreshAward>) => void
  moveFreshAwardToActive: (id: string) => void

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

  // ── UI ─────────────────────────────────────────────────────────────
  toggleSidebar: () => void
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

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      needsFirstLogin: false,
      needsMFASetup: false,
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
      sidebarCollapsed: false,

      // ── Auth ────────────────────────────────────────────────────────
      login: (email, password) => {
        const user = get().users.find(u => u.email.toLowerCase() === email.toLowerCase())
        if (!user) return { ok: false, error: 'No account found with that email.' }
        if (user.status === 'inactive') return { ok: false, error: 'Account is deactivated.' }
        if (user.password && user.password !== password)
          return { ok: false, error: 'Incorrect password.' }
        if (user.firstLogin) {
          set({ currentUser: user, needsFirstLogin: true })
          return { ok: true, needsFirst: true }
        }
        if (!user.mfaEnabled) {
          set({ currentUser: user, needsMFASetup: true })
          return { ok: true, needsMFA: true }
        }
        set({ currentUser: user, isAuthenticated: true })
        return { ok: true }
      },

      logout: () => set({ currentUser: null, isAuthenticated: false, needsFirstLogin: false, needsMFASetup: false }),

      completeFirstLogin: (_password) => {
        const u = get().currentUser
        if (!u) return
        const updated = { ...u, firstLogin: false }
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
      createUser: (data) => set(s => ({
        users: [...s.users, {
          ...data,
          id: `u${Date.now()}`,
          createdAt: new Date().toISOString().split('T')[0],
        }]
      })),

      updateUser: (id, data) => set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, ...data } : u)
      })),

      deleteUser: (id) => set(s => ({
        users: s.users.filter(u => u.id !== id)
      })),

      // ── Opportunity management ──────────────────────────────────────
      createOpportunity: (data) => {
        const opp: Opportunity = { ...data, id: `o${Date.now()}` }
        set(s => ({ opportunities: [opp, ...s.opportunities] }))
        get().addNotification({
          type: 'ASSIGNMENT',
          title: 'New opportunity created',
          message: `${data.solicitation} was added to the pipeline.`,
          read: false,
          relatedId: opp.id,
        })
      },

      updateOpportunity: (id, data) => set(s => ({
        opportunities: s.opportunities.map(o => o.id === id ? { ...o, ...data } : o)
      })),

      assignOpportunity: (id, bdm, bds) => {
        set(s => ({
          opportunities: s.opportunities.map(o => o.id === id ? { ...o, bdm, bds } : o)
        }))
        const opp = get().opportunities.find(o => o.id === id)
        if (opp) {
          get().addNotification({
            type: 'ASSIGNMENT',
            title: 'Opportunity assigned',
            message: `${opp.solicitation} assigned to ${bdm}.`,
            read: false,
            relatedId: id,
          })
        }
      },

      submitOpportunity: (id) => {
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === id ? { ...o, status: 'SUBMITTED', submittedAt: new Date().toISOString() } : o
          )
        }))
        const opp = get().opportunities.find(o => o.id === id)
        if (opp) {
          get().addNotification({
            type: 'CONTRACT_SUBMITTED',
            title: 'Proposal submitted',
            message: `${opp.solicitation} has been submitted.`,
            read: false,
            relatedId: id,
          })
        }
      },

      markOpportunityWon: (id) => {
        const opp = get().opportunities.find(o => o.id === id)
        if (!opp) return
        // 1. Update opportunity status to WON
        set(s => ({
          opportunities: s.opportunities.map(o =>
            o.id === id ? { ...o, status: 'WON' } : o
          )
        }))
        // 2. Create a FreshAward from the opportunity
        const freshAward: FreshAward = {
          id: `fa${Date.now()}`,
          opportunityId: opp.id,
          solicitation: opp.solicitation,
          solicitationId: opp.solicitationId,
          client: opp.client,
          prime: opp.prime,
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
        }
        set(s => ({ freshAwards: [freshAward, ...s.freshAwards] }))
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
          userRole: get().currentUser?.role || 'ADMIN',
          entityType: 'opportunity',
          entityId: opp.id,
          entityName: opp.solicitation,
        })
      },

      // ── Contract management ─────────────────────────────────────────
      createContract: (data) => {
        const contract: Contract = { ...data, id: `c${Date.now()}` }
        set(s => ({ contracts: [contract, ...s.contracts] }))
        get().addNotification({
          type: 'CONTRACT_CREATED',
          title: 'New contract created',
          message: `${data.title} has been added to active contracts.`,
          read: false,
          relatedId: contract.id,
        })
      },

      updateContract: (id, data) => set(s => ({
        contracts: s.contracts.map(c => c.id === id ? { ...c, ...data } : c)
      })),

      addContractPoC: (contractId, poc) => {
        const newPoC: ContractPoC = { ...poc, id: `poc${Date.now()}`, contractId }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, pocs: [...(c.pocs || []), newPoC] }
              : c
          )
        }))
      },

      updateContractPoC: (contractId, pocId, data) => set(s => ({
        contracts: s.contracts.map(c =>
          c.id === contractId
            ? { ...c, pocs: (c.pocs || []).map(p => p.id === pocId ? { ...p, ...data } : p) }
            : c
        )
      })),

      removeContractPoC: (contractId, pocId) => set(s => ({
        contracts: s.contracts.map(c =>
          c.id === contractId
            ? { ...c, pocs: (c.pocs || []).filter(p => p.id !== pocId) }
            : c
        )
      })),

      addLockedSubcontractor: (contractId, sub) => {
        const newSub: LockedSubcontractor = { ...sub, id: `lsub${Date.now()}`, contractId }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, lockedSubcontractors: [...(c.lockedSubcontractors || []), newSub] }
              : c
          )
        }))
      },

      updateLockedSubcontractor: (contractId, subId, data) => set(s => ({
        contracts: s.contracts.map(c =>
          c.id === contractId
            ? { ...c, lockedSubcontractors: (c.lockedSubcontractors || []).map(s => s.id === subId ? { ...s, ...data } : s) }
            : c
        )
      })),

      addGovernmentWarning: (contractId, warning) => {
        const newWarning: GovernmentWarning = { ...warning, id: `gw${Date.now()}`, contractId }
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === contractId
              ? { ...c, governmentWarnings: [...(c.governmentWarnings || []), newWarning] }
              : c
          )
        }))
        get().addNotification({
          type: 'GOVERNMENT_WARNING',
          title: `Government Warning: ${warning.type.replace(/_/g, ' ')}`,
          message: `A ${warning.type.replace(/_/g, ' ')} has been issued for contract ${contractId}.`,
          read: false,
          relatedId: contractId,
          targetRole: 'ALL',
        })
      },

      resolveGovernmentWarning: (contractId, warningId, note) => set(s => ({
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
      })),

      advanceContractStatus: (id) => {
        const contract = get().contracts.find(c => c.id === id)
        if (!contract) return
        const nextStatus = STATUS_FLOW[contract.status]
        if (!nextStatus) return
        set(s => ({
          contracts: s.contracts.map(c =>
            c.id === id ? { ...c, status: nextStatus as any } : c
          )
        }))
        // If moved to ARCHIVED, auto-create PastPerformance
        if (nextStatus === 'ARCHIVED') {
          const pp: PastPerformance = {
            id: `pp${Date.now()}`,
            contractId: contract.id,
            opportunityId: contract.opportunityId,
            contractNumber: contract.contractId,
            title: contract.title,
            client: contract.client || '',
            prime: contract.prime,
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
          get().addNotification({
            type: 'STATUS_CHANGE',
            title: 'Contract Archived',
            message: `${contract.title} has been completed and archived to Past Performances.`,
            read: false,
            relatedId: contract.id,
          })
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
        // 2. Create PastPerformance entry
        const pp: PastPerformance = {
          id: `pp${Date.now()}`,
          contractId: contract.id,
          opportunityId: contract.opportunityId,
          contractNumber: contract.contractId,
          title: contract.title,
          client: contract.client || '',
          prime: contract.prime,
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
          userRole: get().currentUser?.role || 'ADMIN',
          entityType: 'contract',
          entityId: contract.id,
          entityName: contract.title,
        })
      },

      // ── Subcontractor management ────────────────────────────────────
      addSubcontractor: (data) => {
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
      },

      updateSubcontractor: (id, data) => set(s => ({
        subcontractors: s.subcontractors.map(sc => sc.id === id ? { ...sc, ...data } : sc)
      })),

      deleteSubcontractor: (id) => {
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
        }
      },

      // ── Fresh Awards ────────────────────────────────────────────────
      assignFreshAward: (id, assignments) => set(s => ({
        freshAwards: s.freshAwards.map(fa =>
          fa.id === id ? { ...fa, ...assignments, status: 'ASSIGNED' } : fa
        )
      })),

      moveFreshAwardToActive: (id) => {
        const fa = get().freshAwards.find(f => f.id === id)
        if (!fa) return
        const contract: Contract = {
          id: `c${Date.now()}`,
          contractId: fa.solicitationId,
          title: fa.solicitation,
          prime: fa.prime,
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
        }
        get().createContract(contract)
        set(s => ({
          freshAwards: s.freshAwards.map(f =>
            f.id === id
              ? { ...f, status: 'MOVED_TO_ACTIVE', contractId: contract.id, movedAt: new Date().toISOString() }
              : f
          )
        }))
        get().logActivity({
          action: `Moved Fresh Award to Active Contract: ${fa.solicitation}`,
          user: get().currentUser?.name || 'System',
          userRole: get().currentUser?.role || 'ADMIN',
          entityType: 'fresh_award',
          entityId: id,
          entityName: fa.solicitation,
        })
      },

      // ── Past Performances ───────────────────────────────────────────
      addPastPerformance: (pp) => set(s => ({
        pastPerformances: [{
          ...pp,
          id: `pp${Date.now()}`,
          createdAt: new Date().toISOString(),
        }, ...s.pastPerformances]
      })),

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
        get().addNotification({
          type: 'NON_SUB_REVIEW',
          title: 'Non-submission report pending',
          message: `A non-submission report has been submitted for review.`,
          read: false,
          relatedId: data.opportunityId,
          targetRole: 'ADMIN',
        })
      },

      reviewNonSubReport: (id, action, reviewNote, reviewedBy) => {
        set(s => ({
          nonSubReports: s.nonSubReports.map(r =>
            r.id === id
              ? { ...r, status: action, reviewedBy, reviewedAt: new Date().toISOString(), reviewNote }
              : r
          )
        }))
        const report = get().nonSubReports.find(r => r.id === id)
        if (report) {
          const newStatus = action === 'APPROVED' ? 'NOT_SUBMITTED' : 'DROPPED'
          set(s => ({
            opportunities: s.opportunities.map(o =>
              o.id === report.opportunityId ? { ...o, status: newStatus } : o
            )
          }))
        }
      },

      // ── Deletion requests ───────────────────────────────────────────
      requestDeletion: (opportunityId, requestedBy, reason) => {
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
        get().addNotification({
          type: 'DELETION_REQUEST',
          title: 'Deletion request submitted',
          message: `A deletion request has been submitted and is awaiting admin approval.`,
          read: false,
          relatedId: opportunityId,
          targetRole: 'ADMIN',
        })
      },

      reviewDeletionRequest: (id, action, reviewedBy) => {
        set(s => ({
          deletionRequests: s.deletionRequests.map(r =>
            r.id === id
              ? { ...r, status: action, reviewedBy, reviewedAt: new Date().toISOString() }
              : r
          )
        }))
        const req = get().deletionRequests.find(r => r.id === id)
        if (req && action === 'APPROVED') {
          set(s => ({
            opportunities: s.opportunities.map(o =>
              o.id === req.opportunityId
                ? { ...o, isDeleted: true, deletionRequested: false }
                : o
            )
          }))
        } else if (req && action === 'DECLINED') {
          set(s => ({
            opportunities: s.opportunities.map(o =>
              o.id === req.opportunityId ? { ...o, deletionRequested: false } : o
            )
          }))
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

      // ── UI ──────────────────────────────────────────────────────────
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'ces-crm-store', partialize: s => ({ sidebarCollapsed: s.sidebarCollapsed }) }
  )
)
