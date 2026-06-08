import type {
  User, Opportunity, Contract, BDSubmission,
  Notification, Subcontractor, NonSubmissionReport,
  DeletionRequest, AgentStats, FreshAward, PastPerformance,
  SubkDatabaseEntry, ActivityLog, Employee, CompanyCertification,
  EmployeeRequest,
} from '../types'

export const MOCK_USERS: User[] = [
  { id:'u0', name:'ABK Manager', email:'abk@cesolutionplus.com', username:'abk', role:'CAPTURE_MANAGER', avatar:'AB', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2024-01-01', password:'abk123' },
  { id:'u-capture-manager', name:'Capture Manager', email:'capture.manager@cesolutionplus.com', username:'capture.manager', role:'CAPTURE_MANAGER', avatar:'CM', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-05-28', password:'capture123' },
  { id:'u-bd-manager', name:'BD Manager', email:'bd.manager@cesolutionplus.com', username:'bd.manager', role:'BD_MANAGER', avatar:'BM', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-05-28', password:'bdmanager123' },
  { id:'u-bd-team-lead', name:'BD Team Lead', email:'bd.teamlead@cesolutionplus.com', username:'bd.teamlead', role:'TEAM_LEAD', avatar:'BT', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-05-28', password:'teamlead123' },
  { id:'u-associate', name:'Associate User', email:'associate@cesolutionplus.com', username:'associate', role:'ASSOCIATE', avatar:'AU', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-05-28', password:'associate123' },
  { id:'u-ops-manager', name:'Operations Manager', email:'ops.manager@cesolutionplus.com', username:'ops.manager', role:'OPS_MANAGER', avatar:'OM', status:'active', firstLogin:false, mfaEnabled:true, createdAt:'2026-05-28', password:'opsmanager123' },
]

// ── Empty business data (start from scratch) ───────────────────────────
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
  // US daylight time — same IANA zones (which already handle DST automatically),
  // but exposed as distinct dropdown options so SAM.gov-imported deadlines can
  // be labelled with the same abbreviation the SAM.gov UI shows.
  'EDT': 'America/New_York',   'CDT': 'America/Chicago',
  'MDT': 'America/Denver',     'PDT': 'America/Los_Angeles',
  'AKDT': 'America/Anchorage',
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
  // Fixed UTC offsets from SAM.gov responseDeadLine values. These preserve
  // the source deadline offset exactly when SAM.gov does not provide a named
  // timezone abbreviation.
  'UTC-10:00': 'Etc/GMT+10',    'UTC-09:00': 'Etc/GMT+9',
  'UTC-08:00': 'Etc/GMT+8',     'UTC-07:00': 'Etc/GMT+7',
  'UTC-06:00': 'Etc/GMT+6',     'UTC-05:00': 'Etc/GMT+5',
  'UTC-04:00': 'Etc/GMT+4',     'UTC+00:00': 'Etc/GMT',
  'UTC+01:00': 'Etc/GMT-1',     'UTC+02:00': 'Etc/GMT-2',
  'UTC+03:00': 'Etc/GMT-3',
}

// ── Employees (Hierarchy) ─────────────────────────────────────────────
// Two independent hierarchies:
//   • team: 'BD'  — Business Development (used for opportunities / sourcing / proposals)
//   • team: 'OPS' — Operations (used for active contract assignment in Contract Admin)
export const MOCK_EMPLOYEES: Employee[] = [
  // ── BD Team — Managers (top level) ─────────────────────────────────
  { id: 'emp-1',  name: 'James Harrington', email: 'james.harrington@cesolutionplus.com', role: 'BD_MANAGER',         managerId: null,    avatar: 'JA', team: 'BD' },
  { id: 'emp-2',  name: 'Priya Kapoor',     email: 'priya.kapoor@cesolutionplus.com',     role: 'BD_MANAGER',         managerId: null,    avatar: 'PR', team: 'BD' },
  // BD Team Leads under James Harrington
  { id: 'emp-3',  name: 'Marcus Webb',      email: 'marcus.webb@cesolutionplus.com',      role: 'TEAM_LEAD',          managerId: 'emp-1', avatar: 'MA', team: 'BD' },
  { id: 'emp-4',  name: 'Elena Torres',     email: 'elena.torres@cesolutionplus.com',     role: 'TEAM_LEAD',          managerId: 'emp-1', avatar: 'EL', team: 'BD' },
  // BD Team Leads under Priya Kapoor
  { id: 'emp-5',  name: 'David Osei',       email: 'david.osei@cesolutionplus.com',       role: 'TEAM_LEAD',          managerId: 'emp-2', avatar: 'DA', team: 'BD' },
  { id: 'emp-6',  name: 'Rachel Nguyen',    email: 'rachel.nguyen@cesolutionplus.com',    role: 'TEAM_LEAD',          managerId: 'emp-2', avatar: 'RA', team: 'BD' },
  // BD Associates under Marcus Webb
  { id: 'emp-7',  name: 'Kevin Patel',      email: 'kevin.patel@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'KE', team: 'BD' },
  { id: 'emp-8',  name: 'Aisha Johnson',    email: 'aisha.johnson@cesolutionplus.com',    role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'AI', team: 'BD' },
  // BD Associates under Elena Torres
  { id: 'emp-9',  name: 'Chris Lawson',     email: 'chris.lawson@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'CH', team: 'BD' },
  { id: 'emp-10', name: 'Leila Morita',     email: 'leila.morita@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'LE', team: 'BD' },
  // BD Associates under David Osei
  { id: 'emp-11', name: 'Ryan Collins',     email: 'ryan.collins@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'RY', team: 'BD' },
  { id: 'emp-12', name: 'Fatima Al-Hassan', email: 'fatima.al-hassan@cesolutionplus.com', role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'FA', team: 'BD' },
  // BD Associates under Rachel Nguyen
  { id: 'emp-13', name: 'Ben Carter',       email: 'ben.carter@cesolutionplus.com',       role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'BE', team: 'BD' },
  { id: 'emp-14', name: 'Amara Diallo',     email: 'amara.diallo@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'AM', team: 'BD' },
  // BD Associates — extras (managerId references team leads above)
  { id: 'emp-15', name: 'Sophie Reid',      email: 'sophie.reid@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'SO', team: 'BD' },
  { id: 'emp-16', name: 'Omar Hassan',      email: 'omar.hassan@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'OM', team: 'BD' },
  { id: 'emp-17', name: 'Tyler Brooks',     email: 'tyler.brooks@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'TY', team: 'BD' },
  { id: 'emp-18', name: 'Mei Chen',         email: 'mei.chen@cesolutionplus.com',         role: 'ASSOCIATE',          managerId: 'emp-3', avatar: 'ME', team: 'BD' },
  { id: 'emp-19', name: 'Jordan Lee',       email: 'jordan.lee@cesolutionplus.com',       role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'JO', team: 'BD' },
  { id: 'emp-20', name: 'Vanessa Price',    email: 'vanessa.price@cesolutionplus.com',    role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'VA', team: 'BD' },
  { id: 'emp-21', name: 'Samuel Okonkwo',   email: 'samuel.okonkwo@cesolutionplus.com',   role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'SA', team: 'BD' },
  { id: 'emp-22', name: 'Isabelle Martin',  email: 'isabelle.martin@cesolutionplus.com',  role: 'ASSOCIATE',          managerId: 'emp-4', avatar: 'IS', team: 'BD' },
  { id: 'emp-23', name: 'Nathan Freed',     email: 'nathan.freed@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'NA', team: 'BD' },
  { id: 'emp-24', name: 'Alicia Morales',   email: 'alicia.morales@cesolutionplus.com',   role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'AL', team: 'BD' },
  { id: 'emp-25', name: 'Derek Wilson',     email: 'derek.wilson@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'DE', team: 'BD' },
  { id: 'emp-26', name: 'Yuki Tanaka',      email: 'yuki.tanaka@cesolutionplus.com',      role: 'ASSOCIATE',          managerId: 'emp-5', avatar: 'YU', team: 'BD' },
  { id: 'emp-27', name: 'Patrick Rousseau', email: 'patrick.rousseau@cesolutionplus.com', role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'PA', team: 'BD' },
  { id: 'emp-28', name: 'Nia Scott',        email: 'nia.scott@cesolutionplus.com',        role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'NI', team: 'BD' },
  { id: 'emp-29', name: 'Felix Adeyemi',    email: 'felix.adeyemi@cesolutionplus.com',    role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'FE', team: 'BD' },
  { id: 'emp-30', name: 'Chloe Burnet',     email: 'chloe.burnet@cesolutionplus.com',     role: 'ASSOCIATE',          managerId: 'emp-6', avatar: 'CL', team: 'BD' },

  // ── OPS Team — Operations hierarchy used for active contract assignment ──
  // OPS Managers
  { id: 'emp-ops-1',  name: 'Sergio Vega',      email: 'sergio.vega@cesolutionplus.com',      role: 'BD_MANAGER', managerId: null,         avatar: 'SV', team: 'OPS' },
  { id: 'emp-ops-2',  name: 'Hannah Boateng',   email: 'hannah.boateng@cesolutionplus.com',   role: 'BD_MANAGER', managerId: null,         avatar: 'HB', team: 'OPS' },
  // OPS Team Leads under Sergio Vega
  { id: 'emp-ops-3',  name: 'Diego Rojas',      email: 'diego.rojas@cesolutionplus.com',      role: 'TEAM_LEAD',  managerId: 'emp-ops-1',  avatar: 'DR', team: 'OPS' },
  { id: 'emp-ops-4',  name: 'Asha Banerjee',    email: 'asha.banerjee@cesolutionplus.com',    role: 'TEAM_LEAD',  managerId: 'emp-ops-1',  avatar: 'AB', team: 'OPS' },
  // OPS Team Leads under Hannah Boateng
  { id: 'emp-ops-5',  name: 'Marek Novak',      email: 'marek.novak@cesolutionplus.com',      role: 'TEAM_LEAD',  managerId: 'emp-ops-2',  avatar: 'MN', team: 'OPS' },
  { id: 'emp-ops-6',  name: 'Talia Greenfield', email: 'talia.greenfield@cesolutionplus.com', role: 'TEAM_LEAD',  managerId: 'emp-ops-2',  avatar: 'TG', team: 'OPS' },
  // OPS Associates under Diego Rojas
  { id: 'emp-ops-7',  name: 'Lucas Romero',     email: 'lucas.romero@cesolutionplus.com',     role: 'ASSOCIATE',  managerId: 'emp-ops-3',  avatar: 'LR', team: 'OPS' },
  { id: 'emp-ops-8',  name: 'Mira Ahmadi',      email: 'mira.ahmadi@cesolutionplus.com',      role: 'ASSOCIATE',  managerId: 'emp-ops-3',  avatar: 'MI', team: 'OPS' },
  // OPS Associates under Asha Banerjee
  { id: 'emp-ops-9',  name: 'Caleb Whitley',    email: 'caleb.whitley@cesolutionplus.com',    role: 'ASSOCIATE',  managerId: 'emp-ops-4',  avatar: 'CA', team: 'OPS' },
  { id: 'emp-ops-10', name: 'Zara Mahmood',     email: 'zara.mahmood@cesolutionplus.com',     role: 'ASSOCIATE',  managerId: 'emp-ops-4',  avatar: 'ZA', team: 'OPS' },
  // OPS Associates under Marek Novak
  { id: 'emp-ops-11', name: 'Henrik Sorensen',  email: 'henrik.sorensen@cesolutionplus.com',  role: 'ASSOCIATE',  managerId: 'emp-ops-5',  avatar: 'HE', team: 'OPS' },
  { id: 'emp-ops-12', name: 'Daniela Costa',    email: 'daniela.costa@cesolutionplus.com',    role: 'ASSOCIATE',  managerId: 'emp-ops-5',  avatar: 'DC', team: 'OPS' },
  // OPS Associates under Talia Greenfield
  { id: 'emp-ops-13', name: 'Owen Maguire',     email: 'owen.maguire@cesolutionplus.com',     role: 'ASSOCIATE',  managerId: 'emp-ops-6',  avatar: 'OW', team: 'OPS' },
  { id: 'emp-ops-14', name: 'Inez Calderon',    email: 'inez.calderon@cesolutionplus.com',    role: 'ASSOCIATE',  managerId: 'emp-ops-6',  avatar: 'IN', team: 'OPS' },
]
