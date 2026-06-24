import type {
  User, Opportunity, Contract, BDSubmission,
  Notification, Subcontractor, NonSubmissionReport,
  DeletionRequest, AgentStats, FreshAward, PastPerformance,
  SubkDatabaseEntry, ActivityLog, Employee, CompanyCertification,
  EmployeeRequest,
} from '../types'

export const MOCK_USERS: User[] = [
  { id:'u0', name:'Capture Admin', email:'abk@cesolutionplus.com', username:'abk', role:'CAPTURE_MANAGER', avatar:'CA', status:'active', firstLogin:false, createdAt:'2024-01-01', password:'abk123' },
]

// Empty business data: the system starts from the database, not seeded records.
export const MOCK_SUBCONTRACTORS: Subcontractor[] = []
export const MOCK_NON_SUB_REPORTS: NonSubmissionReport[] = []
export const MOCK_DELETION_REQUESTS: DeletionRequest[] = []
export const MOCK_OPPORTUNITIES: Opportunity[] = []
export const MOCK_CONTRACTS: Contract[] = []
export const MOCK_BD_SUBMISSIONS: BDSubmission[] = []
export const MOCK_NOTIFICATIONS: Notification[] = []
export const MOCK_FRESH_AWARDS: FreshAward[] = []
export const MOCK_PAST_PERFORMANCES: PastPerformance[] = []
export const MOCK_SUBK_DATABASE: SubkDatabaseEntry[] = []
export const MOCK_ACTIVITY_LOGS: ActivityLog[] = []
export const MOCK_COMPANY_CERTIFICATIONS: CompanyCertification[] = []
export const MOCK_EMPLOYEE_REQUESTS: EmployeeRequest[] = []

export const TEAM_STATS: {
  user: string
  initials: string
  role: string
  total: number
  submissions: number
  nonSubmissions: number
  successRate: number
}[] = []

export const AGENT_STATS: AgentStats[] = []

export const ACTIVITY_FEED: { user: string; action: string; time: string }[] = []

export const REVENUE_TREND: { month: string; revenue: number }[] = []

export const SUBMISSIONS_TREND: { month: string; submissions: number; wins: number }[] = []

export const TIMEZONES: Record<string, string> = {
  // US standard time
  'EST': 'America/New_York',   'CST': 'America/Chicago',
  'MST': 'America/Denver',     'PST': 'America/Los_Angeles',
  'AKST': 'America/Anchorage', 'HST': 'Pacific/Honolulu',
  // US daylight time: same IANA zones, exposed as SAM.gov-style labels.
  'EDT': 'America/New_York',   'CDT': 'America/Chicago',
  'MDT': 'America/Denver',     'PDT': 'America/Los_Angeles',
  'AKDT': 'America/Anchorage', 'HADT': 'America/Adak',
  // International
  'KSA': 'Asia/Riyadh',        'AST': 'Asia/Riyadh',
  'GST': 'Asia/Dubai',
  'EET': 'Asia/Amman',         'EEST': 'Asia/Amman',
  'IRT': 'Asia/Tehran',        'IRST': 'Asia/Tehran',
  'GMT': 'Europe/London',      'CET': 'Europe/Paris',
  'BST': 'Europe/London',      'CEST': 'Europe/Paris',
  'IST': 'Asia/Kolkata',       'SGT': 'Asia/Singapore',
  'JST': 'Asia/Tokyo',
  'AEST': 'Australia/Sydney',  'AEDT': 'Australia/Sydney',
  'NZST': 'Pacific/Auckland',  'NZDT': 'Pacific/Auckland',
  'GMT+1': 'Etc/GMT-1',
  // Fixed UTC offsets from SAM.gov responseDeadLine values.
  'UTC-10:00': 'Etc/GMT+10',   'UTC-09:00': 'Etc/GMT+9',
  'UTC-08:00': 'Etc/GMT+8',    'UTC-07:00': 'Etc/GMT+7',
  'UTC-06:00': 'Etc/GMT+6',    'UTC-05:00': 'Etc/GMT+5',
  'UTC-04:00': 'Etc/GMT+4',    'UTC+00:00': 'Etc/GMT',
  'UTC+01:00': 'Etc/GMT-1',    'UTC+02:00': 'Etc/GMT-2',
  'UTC+03:00': 'Etc/GMT-3',
}

// Admin-managed users are the source of truth for assignment.
// Start with no assignable employees; Admin can add real users after reset.
export const MOCK_EMPLOYEES: Employee[] = []
