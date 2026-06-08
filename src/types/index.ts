export type HierarchyRole = 'BD_MANAGER' | 'TEAM_LEAD' | 'ASSOCIATE'

export interface Employee {
  id: string
  name: string
  email: string
  role: HierarchyRole
  managerId: string | null   // null for Managers (top level)
  department?: string
  avatar: string             // 2-letter initials
}

export type Role =
  | 'CAPTURE_MANAGER'
  | 'BD_MANAGER'
  | 'TEAM_LEAD'
  | 'ASSOCIATE'
  | 'OPS_MANAGER'

export interface User {
  id: string
  name: string
  email: string
  username: string
  role: Role
  avatar: string
  status: 'active' | 'inactive'
  firstLogin: boolean
  mfaEnabled: boolean
  createdAt: string
  password?: string
}

export type Priority = 'VERY_HIGH' | 'HIGH' | 'MEDIUM'

export type OppStatus =
  | 'ACTIVE' | 'SUBMITTED' | 'WON' | 'LOST'
  | 'DISCUSSION' | 'CANCELED' | 'NOT_SUBMITTED'
  | 'NEW_ASSIGNMENT' | 'TERMINATED' | 'DROPPED'

export type ContractStatus =
  | 'KICK_OFF' | 'LOCKING_SUB' | 'ACTIVE' | 'ON_GOING'
  | 'PERFORMING' | 'PENDING_PAYMENT' | 'ARCHIVED'
  | 'TERMINATED' | 'CANCELED'

export type ContractType = 'OTJ' | 'RECURRING' | 'BPA' | 'IDIQ' | 'S&D' | 'SUPPLY'
export type ContractFinanceType = 'FFP' | 'T&M' | 'CPFF' | 'OTHER'
export type SetAside = 'SB' | 'SDVOSB' | 'WOSB' | 'HUBZone' | 'VOSB' | '8(a)' | 'UNRES'

// ── Attachments / Comments ────────────────────────────────────────────
export interface FileAttachment {
  id: string
  name: string
  attachedAt: string
  uploadedBy: string
  dataUrl?: string
  mimeType?: string
  size?: number
}

export interface LockedSubkDocuments {
  quote?: FileAttachment[]
  coi?: FileAttachment[]
  w9?: FileAttachment[]
  subAgreement?: FileAttachment[]
  invoice?: FileAttachment[]
}

export interface Comment {
  id: string
  text: string
  author: string
  createdAt: string
  attachments?: FileAttachment[]
}

export interface ContractDeliverable {
  id: string
  title: string
  issuanceDate: string
  deadline: string
  attachments?: FileAttachment[]
  createdAt: string
  createdBy: string
}

// ── Subcontractor (on opportunity) ───────────────────────────────────
export interface Subcontractor {
  id: string
  opportunityId: string
  companyName: string
  contactName: string
  email: string
  phone: string
  naicsCode: string
  setAside: string
  notes: string
  quoteFile?: string        // PDF filename / reference
  createdAt: string
  createdBy: string
}

// ── Locked Subcontractor (on active contract) ────────────────────────
export interface LockedSubcontractor {
  id: string
  contractId: string
  companyName: string
  contactName: string
  email?: string
  phone?: string
  setAside?: string
  naicsCode?: string
  subkDatabaseId?: string   // link to SubkDatabaseEntry
  invoices?: string[]
  subAgreements?: string[]
  quotes?: string[]
  documents?: LockedSubkDocuments
  notes?: string
  createdAt: string
  createdBy: string
}

// ── Subcontractor Database Entry ─────────────────────────────────────
export interface SubkDatabaseEntry {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  naicsCodes: string[]
  setAside: string
  pastProjects: PastProjectRef[]
  quoteFile?: string
  notes: string
  totalContractsWorked: number
  createdAt: string
  createdBy: string
}

export interface PastProjectRef {
  contractId?: string
  title: string
  client: string
  value?: number
  year: string
}

// ── Contract PoC ─────────────────────────────────────────────────────
export interface ContractPoC {
  id: string
  contractId: string
  role: 'KO' | 'COR' | 'END_USER'
  name: string
  email?: string
  phone?: string
  notes?: string
  contactedAt?: string     // last communication date
}

// ── Government Warning ───────────────────────────────────────────────
export type GovWarningType =
  | 'CURE_NOTICE' | 'LETTER_OF_CONCERN' | 'NCR'
  | 'SHOW_CAUSE' | 'STOP_WORK_ORDER'

export interface GovernmentWarning {
  id: string
  contractId: string
  type: GovWarningType
  issuedDate: string
  deadline?: string
  description: string
  severity: 'RED' | 'YELLOW' | 'INFO'
  attachments?: FileAttachment[]
  comments?: Comment[]
  resolvedAt?: string
  resolvedNote?: string
}

// ── Non-Submission Report ────────────────────────────────────────────
export interface NonSubmissionReport {
  id: string
  opportunityId: string
  agentUsername: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED'
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
}

// ── Deletion Request ─────────────────────────────────────────────────
export interface DeletionRequest {
  id: string
  opportunityId: string
  requestedBy: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED'
  requestedAt: string
  reviewedBy?: string
  reviewedAt?: string
}

// ── Opportunity ───────────────────────────────────────────────────────
export interface Opportunity {
  id: string
  solicitation: string
  solicitationId: string
  client: string
  type: ContractType
  naicsCode: string
  setAside: SetAside
  priority: Priority
  status: OppStatus
  dueDate: string
  localTime: string
  timezone?: string
  moroccoTime?: string   // HH:MM in Morocco GMT+1 — pre-computed at SAM.gov import
  moroccoDate?: string   // YYYY-MM-DD in Morocco GMT+1 (may differ from dueDate)
  location: string
  pop: string
  bdm: string
  bds: string
  supportAgent?: string
  poc?: string
  contractAmount?: number
  baseAmount?: number
  monthlyPayment?: number
  value?: number
  comments: Comment[]
  assignedOpportunities?: string[]   // formerly "proposals"
  proposals?: string[]               // kept for legacy compat
  proposalAttachments?: FileAttachment[]
  subcontractors?: Subcontractor[]
  period: string
  capturedOn: string
  mandatoryEvents?: string
  link?: string
  isDeleted?: boolean
  deletionRequested?: boolean
  submittedAt?: string
  nonSubmissionReportId?: string
  assignedTo?: string        // employee id
}

// ── Contract ──────────────────────────────────────────────────────────
export interface Contract {
  id: string
  contractId: string
  contractNumber?: string
  title: string
  type: ContractType
  financeType?: ContractFinanceType
  naicsCode: string
  setAside?: SetAside
  status: ContractStatus
  location: string
  client?: string
  popStart: string
  popEnd: string
  value: number
  baseAmount?: number
  monthlyPayment?: number
  spm: string
  pm: string
  bds?: string
  bdm?: string
  supportAgent?: string
  opportunityId?: string
  billingNotes?: string
  followUpDate?: string
  optionYears?: number          // number of option years remaining
  optionYearDeadline?: string   // when to exercise option
  pocs?: ContractPoC[]
  lockedSubcontractors?: LockedSubcontractor[]
  governmentWarnings?: GovernmentWarning[]
  deliverables?: ContractDeliverable[]
  terminationType?: 'T4C' | 'T4D' | 'CANCELED'
  terminationDate?: string
  terminationReason?: string
  assignedTo?: string        // employee id
  proposalAttachments?: FileAttachment[]
}

// ── BD Submission (BD Tracker) ────────────────────────────────────────
export interface BDSubmission {
  id: number
  submittedOn: string
  solicitationId: string
  setAside: SetAside
  type: ContractType
  solicitation: string
  status: 'SUBMITTED' | 'DISCUSSING' | 'AWARDED' | 'LOST' | 'CANCELED' | 'NOT_SUBMITTED' | 'DROPPED'
  dueDate: string
  localTime: string
  location: string
  bdm: string
  bds: string
  supportAgent?: string
  value: number
  comment?: string
}

// ── Fresh Award ───────────────────────────────────────────────────────
export interface FreshAward {
  id: string
  bdSubmissionId?: number
  opportunityId?: string
  solicitation: string
  solicitationId: string
  client: string
  type: ContractType
  setAside: SetAside
  naicsCode: string
  contractAmount?: number
  baseAmount?: number
  monthlyPayment?: number
  pop?: string
  location?: string
  awardedDate: string
  assignedBDM?: string
  assignedBDS?: string
  assignedSPM?: string
  assignedPM?: string
  assignedSupportAgent?: string
  status: 'PENDING_ASSIGNMENT' | 'ASSIGNED' | 'MOVED_TO_ACTIVE'
  contractId?: string         // set when moved to active
  movedAt?: string
  notes?: string
}

// ── Past Performance ──────────────────────────────────────────────────
export interface PastPerformance {
  id: string
  opportunityId?: string
  contractId?: string
  contractNumber: string
  title: string
  client: string
  type: ContractType
  financeType?: ContractFinanceType
  naicsCode: string
  setAside: SetAside
  value: number
  popStart: string
  popEnd: string
  location?: string
  description: string
  relevance: string
  keyPersonnel?: string
  challenges?: string
  bdm: string
  bds: string
  createdAt: string
  createdBy: string
}

// HR
export type CompanyCertificationStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED'

export interface CompanyCertification {
  id: string
  name: string
  issuer: string
  certificateNumber: string
  issuedDate: string
  expirationDate?: string
  status: CompanyCertificationStatus
  notes?: string
  attachments?: FileAttachment[]
  createdAt: string
  updatedAt?: string
  createdBy: string
}

export type EmployeeRequestType = 'TIME_OFF' | 'DOCUMENT' | 'CERTIFICATION' | 'PAYROLL' | 'ACCESS' | 'OTHER'
export type EmployeeRequestStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'DECLINED'

export interface EmployeeRequest {
  id: string
  requesterId: string
  requesterName: string
  requesterEmail: string
  type: EmployeeRequestType
  title: string
  details: string
  status: EmployeeRequestStatus
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  submittedAt: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
  attachments?: FileAttachment[]
}

// Activity Log
export interface ActivityLog {
  id: string
  action: string
  user: string
  userRole: Role
  entityType: 'opportunity' | 'contract' | 'subcontractor' | 'user' | 'report' | 'fresh_award' | 'past_performance' | 'hr'
  entityId?: string
  entityName?: string
  createdAt: string
}

// ── Notifications ─────────────────────────────────────────────────────
export type NotifType =
  | 'ASSIGNMENT'
  | 'DEADLINE'
  | 'STATUS_CHANGE'
  | 'CONTRACT_CREATED'
  | 'SYSTEM'
  | 'MONTHLY_REPORT'
  | 'POP_EXPIRING'
  | 'BILLING_DUE'
  | 'REPORT_REMINDER'
  | 'CONTRACT_SUBMITTED'
  | 'FOLLOW_UP'
  | 'DELETION_REQUEST'
  | 'NON_SUB_REVIEW'
  | 'FRESH_AWARD'
  | 'GOVERNMENT_WARNING'
  | 'ERP_REPORT_DUE'
  | 'OPTION_YEAR_EXPIRING'

export interface Notification {
  id: string
  type: NotifType
  title: string
  message: string
  read: boolean
  createdAt: string
  relatedId?: string
  targetRole?: Role | 'ALL'
}

// ── Agent Stats ───────────────────────────────────────────────────────
export interface AgentStats {
  username: string
  name: string
  avatar: string
  role: Role
  submissions: number
  wins: number
  losses: number
  nonSubs: number
  active: number
  winRate: number
  submissionRate: number
  score: number
  rank: number
  goal: number
  streak: number
}
